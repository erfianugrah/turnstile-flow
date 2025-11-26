import { Hono } from 'hono';
import type { Env, FraudCheckResult } from '../lib/types';
import { formSubmissionSchema, sanitizeFormData } from '../lib/validation';
import { extractRequestMetadata } from '../lib/types';
import {
	validateTurnstileToken,
	hashToken,
	checkTokenReuse,
	createMockValidation,
	collectEphemeralIdSignals,
	calculateProgressiveTimeout,
} from '../lib/turnstile';
import { logValidation, createSubmission } from '../lib/database';
import logger from '../lib/logger';
import { checkPreValidationBlock, addToBlacklist } from '../lib/fraud-prevalidation';
import { collectJA4Signals } from '../lib/ja4-fraud-detection';
import { collectIPRateLimitSignals } from '../lib/ip-rate-limiting';
import { calculateNormalizedRiskScore } from '../lib/scoring';
import { checkEmailFraud } from '../lib/email-fraud-detection';
import { extractField } from '../lib/field-mapper';
import { getConfig } from '../lib/config';
import { collectFingerprintSignals } from '../lib/fingerprint-signals';
import {
	ValidationError,
	RateLimitError,
	ExternalServiceError,
	DatabaseError,
	ConflictError,
	handleError,
	formatZodErrors,
} from '../lib/errors';
import { generateErfid, type ErfidConfig } from '../lib/erfid';

/**
 * Convert JavaScript Date to SQLite-compatible datetime string
 */
function toSQLiteDateTime(date: Date): string {
	return date
		.toISOString()
		.replace('T', ' ')
		.replace(/\.\d{3}Z$/, '');
}

/**
 * Get offense count for any identifier (email, ephemeral_id, ip_address)
 */
async function getOffenseCount(
	db: D1Database,
	email?: string,
	ephemeralId?: string | null,
	ipAddress?: string
): Promise<number> {
	const oneDayAgo = toSQLiteDateTime(new Date(Date.now() - 24 * 60 * 60 * 1000));

	// Build query to check all identifiers
	const conditions: string[] = [];
	const bindings: string[] = [];

	if (email) {
		conditions.push('email = ?');
		bindings.push(email);
	}
	if (ephemeralId) {
		conditions.push('ephemeral_id = ?');
		bindings.push(ephemeralId);
	}
	if (ipAddress) {
		conditions.push('ip_address = ?');
		bindings.push(ipAddress);
	}

	if (conditions.length === 0) {
		return 1; // No identifiers, return default
	}

	const whereClause = conditions.join(' OR ');

	const result = await db
		.prepare(
			`SELECT COUNT(*) as count
			 FROM fraud_blacklist
			 WHERE (${whereClause})
			 AND blocked_at > ?`
		)
		.bind(...bindings, oneDayAgo)
		.first<{ count: number }>();

	return (result?.count || 0) + 1; // +1 for current offense
}

/**
 * Format wait time in seconds to human-readable string
 */
function formatWaitTime(seconds: number): string {
	if (seconds < 60) {
		return `${seconds} seconds`;
	} else if (seconds < 3600) {
		const minutes = Math.ceil(seconds / 60);
		return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
	} else if (seconds < 86400) {
		const hours = Math.ceil(seconds / 3600);
		return `${hours} hour${hours !== 1 ? 's' : ''}`;
	} else {
		const days = Math.ceil(seconds / 86400);
		return `${days} day${days !== 1 ? 's' : ''}`;
	}
}

const app = new Hono<{ Bindings: Env; Variables: { erfid?: string } }>();

// POST /api/submissions - Phase 4: Holistic Risk-Based Blocking
app.post('/', async (c) => {
	try {
		const db = c.env.DB;
		const secretKey = c.env['TURNSTILE-SECRET-KEY'];
		const config = getConfig(c.env);

		// ========== GENERATE ERFID ==========
		let erfidConfig: ErfidConfig | undefined;
		if (c.env.ERFID_CONFIG) {
			try {
				erfidConfig = typeof c.env.ERFID_CONFIG === 'string'
					? JSON.parse(c.env.ERFID_CONFIG)
					: c.env.ERFID_CONFIG;
			} catch (parseError) {
				logger.warn({ error: parseError }, 'Failed to parse ERFID_CONFIG');
			}
		}

		const erfid = generateErfid(erfidConfig);
		c.set('erfid', erfid);
		logger.info({ erfid }, 'Request erfid generated');

		// ========== TESTING BYPASS CHECK ==========
		const apiKey = c.req.header('X-API-KEY');
		const expectedKey = c.env['X-API-KEY'];
		const allowBypass = c.env.ALLOW_TESTING_BYPASS === 'true';
		const skipTurnstile = Boolean(allowBypass && apiKey && apiKey === expectedKey);

		if (skipTurnstile) {
			logger.info({ event: 'testing_bypass_activated' }, 'Testing bypass activated');
		}

		// ========== EXTRACT METADATA ==========
		const metadata = extractRequestMetadata(c.req.raw);
		logger.info(
			{ ip: metadata.remoteIp, country: metadata.country, userAgent: metadata.userAgent },
			'Form submission received'
		);

		// ========== PARSE AND VALIDATE FORM DATA ==========
		const rawPayload = await c.req.json();
		const extractedEmail = await extractField(rawPayload, 'email', c.env);
		const extractedPhone = await extractField(rawPayload, 'phone', c.env);

		const validationResult = formSubmissionSchema.safeParse(rawPayload);
		if (!validationResult.success) {
			throw new ValidationError(
				'Form validation failed',
				{ errors: validationResult.error.errors },
				formatZodErrors(validationResult.error)
			);
		}

		const { turnstileToken } = validationResult.data;
		const sanitized = sanitizeFormData(validationResult.data);

		// ========== PHASE 1: DEFINITIVE CHECKS ==========

		// 1.1: Pre-validation blacklist (with email)
		const blacklistCheck = await checkPreValidationBlock(
			null, // ephemeral_id not available yet
			metadata.remoteIp,
			metadata.ja4 ?? null,
			sanitized.email,
			db
		);

		if (blacklistCheck.blocked) {
			logger.warn(
				{
					reason: blacklistCheck.reason,
					confidence: blacklistCheck.confidence,
					retryAfter: blacklistCheck.retryAfter,
				},
				'Blacklist block triggered'
			);

			const waitTime = formatWaitTime(blacklistCheck.retryAfter || 3600);
			throw new RateLimitError(
				blacklistCheck.reason || 'Blacklisted',
				blacklistCheck.retryAfter || 3600,
				blacklistCheck.expiresAt || new Date(Date.now() + 3600000).toISOString(),
				`You have made too many submission attempts. Please wait ${waitTime} before trying again`
			);
		}

		// 1.2: Token replay check
		let validation;
		let tokenHash: string | undefined;
		let isReused = false;

		if (!skipTurnstile) {
			if (!turnstileToken) {
				throw new ValidationError(
					'Turnstile token required',
					{},
					'Security verification token is missing'
				);
			}

			tokenHash = hashToken(turnstileToken);
			isReused = await checkTokenReuse(tokenHash, db);

			if (isReused) {
				// Token replay is definitive block
				const replayRiskScore = calculateNormalizedRiskScore({
					tokenReplay: true,
					emailRiskScore: 0,
					ephemeralIdCount: 1,
					validationCount: 1,
					uniqueIPCount: 1,
					ja4RawScore: 0,
					blockTrigger: 'token_replay',
				}, config);

				await logValidation(db, {
					tokenHash,
					validation: { valid: false, reason: 'token_reused', errors: ['Token already used'] },
					metadata,
					riskScore: replayRiskScore.total,
					riskScoreBreakdown: replayRiskScore,
					allowed: false,
					blockReason: 'Token replay attack detected',
					detectionType: 'token_replay_protection', // Special: Token validation layer
					erfid,
					testingBypass: skipTurnstile,
				});

				throw new ValidationError(
					'Token replay attack',
					{ tokenHash },
					'This verification has already been used. Please refresh and try again'
				);
			}

			validation = await validateTurnstileToken(turnstileToken, metadata.remoteIp, secretKey);
		} else {
			validation = createMockValidation(metadata.remoteIp, 'localhost');
			tokenHash = hashToken(`test-${Date.now()}`);
		}

		// Check Turnstile validation result (definitive if failed)
		if (!validation.valid) {
			const failedScore = calculateNormalizedRiskScore({
				tokenReplay: false,
				emailRiskScore: 0,
				ephemeralIdCount: 1,
				validationCount: 3, // Failed validations indicate attempts
				uniqueIPCount: 1,
				ja4RawScore: 0,
				blockTrigger: 'turnstile_failed',
			}, config);

			await logValidation(db, {
				tokenHash,
				validation,
				metadata,
				riskScore: failedScore.total,
				riskScoreBreakdown: failedScore,
				allowed: false,
				blockReason: validation.reason,
				detectionType: 'turnstile_validation', // Special: Turnstile CAPTCHA layer
				erfid,
				testingBypass: skipTurnstile,
			});

			throw new ExternalServiceError(
				'Turnstile',
				validation.reason || 'Verification failed',
				{ errors: validation.errors },
				validation.userMessage || 'Please complete the verification challenge'
			);
		}

		// ========== PHASE 2: COLLECT SIGNALS ==========

		// 2.1: Email fraud signal
		let emailFraudResult = null;
		if (sanitized.email) {
			emailFraudResult = await checkEmailFraud(sanitized.email, c.env, c.req.raw);

			if (emailFraudResult) {
				logger.info(
					{
						risk_score: emailFraudResult.riskScore,
						decision: emailFraudResult.decision,
						pattern: emailFraudResult.signals.patternType,
					},
					'Email fraud signal collected'
				);
			}
		}

		// 2.2: Ephemeral ID signals
		let ephemeralSignals = null;
		if (validation.ephemeralId) {
			ephemeralSignals = await collectEphemeralIdSignals(validation.ephemeralId, db, config);

			logger.info(
				{
					submissions: ephemeralSignals.submissionCount,
					validations: ephemeralSignals.validationCount,
					ips: ephemeralSignals.uniqueIPCount,
					warnings: ephemeralSignals.warnings,
				},
				'Ephemeral ID signals collected'
			);
		}

		// 2.3: JA4 signals
		let ja4Signals = null;
		if (metadata.ja4) {
			ja4Signals = await collectJA4Signals(
				metadata.remoteIp,
				metadata.ja4,
				validation.ephemeralId || null,
				db,
				config
			);

			logger.info(
				{
					raw_score: ja4Signals.rawScore,
					detection_type: ja4Signals.detectionType,
					layer: ja4Signals.detectionLayer,
					warnings: ja4Signals.warnings,
				},
				'JA4 signals collected'
			);
		}

		// 2.4: IP Rate Limit signals
		const ipRateLimitSignals = await collectIPRateLimitSignals(
			metadata.remoteIp,
			db,
			config
		);

		logger.info(
			{
				submission_count: ipRateLimitSignals.submissionCount,
				risk_score: ipRateLimitSignals.riskScore,
				warnings: ipRateLimitSignals.warnings,
			},
			'IP rate limit signals collected'
		);

		// 2.5: Fingerprint-level signals (header reuse, TLS anomalies, latency mismatches)
		const fingerprintSignals = await collectFingerprintSignals(metadata, db, config);
		if (fingerprintSignals.warnings.length > 0) {
			logger.warn(
				{
					fingerprint_warnings: fingerprintSignals.warnings,
					fingerprint_trigger: fingerprintSignals.trigger,
				},
				'Fingerprint anomalies detected'
			);
		}

		// 2.5: Duplicate email check (hybrid approach)
		const existingSubmission = await db
			.prepare('SELECT id, created_at FROM submissions WHERE email = ? LIMIT 1')
			.bind(sanitized.email)
			.first<{ id: number; created_at: string }>();

		if (existingSubmission !== null) {
			// Check how many times this email/IP has tried duplicate submissions recently (24h)
			const twentyFourHoursAgo = toSQLiteDateTime(new Date(Date.now() - 24 * 60 * 60 * 1000));
			const duplicateAttempts = await db
				.prepare(`
					SELECT COUNT(*) as count
					FROM fraud_blacklist
					WHERE (email = ? OR ip_address = ?)
					AND detection_type = 'duplicate_email'
					AND blocked_at > ?
				`)
				.bind(sanitized.email, metadata.remoteIp, twentyFourHoursAgo)
				.first<{ count: number }>();

			const attemptCount = (duplicateAttempts?.count || 0) + 1;

			if (attemptCount >= 3) {
				// Repeated duplicate attempts (3+) = fraud pattern
				logger.warn(
					{
						email: sanitized.email,
						ip: metadata.remoteIp,
						attempt_count: attemptCount,
						existing_id: existingSubmission.id,
						erfid,
					},
					'Repeated duplicate email attempts detected (fraud pattern)'
				);

				// Add to blacklist with progressive timeout
				const offenseCount = await getOffenseCount(db, sanitized.email, validation.ephemeralId || null, metadata.remoteIp);
				const expiresIn = calculateProgressiveTimeout(offenseCount);
				const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

				const duplicateBlockBreakdown = calculateNormalizedRiskScore(
					{
						tokenReplay: false,
						emailRiskScore: 100,
						ephemeralIdCount: 1,
						validationCount: 1,
						uniqueIPCount: 1,
						ja4RawScore: 0,
						ipRateLimitScore: 0,
						headerFingerprintScore: 0,
						tlsAnomalyScore: 0,
						latencyMismatchScore: 0,
						blockTrigger: 'email_fraud',
					},
					config
				);

				await addToBlacklist(db, {
					email: sanitized.email,
					ephemeralId: validation.ephemeralId || null,
					ipAddress: metadata.remoteIp,
					ja4: metadata.ja4 ?? null,
					blockReason: `Repeated duplicate email attempts (${attemptCount} attempts in 24h)`,
					confidence: 'high',
					expiresIn,
					submissionCount: attemptCount,
					detectionType: 'duplicate_email',
					detectionMetadata: {
						attempt_count: attemptCount,
						existing_submission_id: existingSubmission.id,
						pattern: 'automated_duplicate_probing',
					},
					erfid,
					riskScore: duplicateBlockBreakdown.total,
					riskScoreBreakdown: duplicateBlockBreakdown,
				});

				const waitTime = formatWaitTime(expiresIn);
				throw new RateLimitError(
					`Repeated duplicate email attempts (${attemptCount} attempts)`,
					expiresIn,
					expiresAt,
					`You have made too many duplicate submission attempts. Please wait ${waitTime} before trying again.`
				);
			} else {
				// First or second attempt = legitimate user error
				logger.info(
					{
						email: sanitized.email,
						attempt_count: attemptCount,
						existing_id: existingSubmission.id,
						erfid,
					},
					'Duplicate email detected (legitimate user error)'
				);

				// Track this attempt for fraud pattern detection
				await addToBlacklist(db, {
					email: sanitized.email,
					ephemeralId: validation.ephemeralId || null,
					ipAddress: metadata.remoteIp,
					ja4: metadata.ja4 ?? null,
					blockReason: `Email already registered (submission #${existingSubmission.id}). Duplicate submission attempt blocked.`,
					confidence: 'low',
					expiresIn: 86400, // 24h tracking window
					submissionCount: attemptCount,
					detectionType: 'duplicate_email',
					detectionMetadata: {
						attempt_count: attemptCount,
						existing_submission_id: existingSubmission.id,
					},
					erfid,
				});

				throw new ConflictError(
					'Duplicate email',
					'This email address has already been registered. If you believe this is an error, please contact support.',
					{ email: sanitized.email, existingSubmissionId: existingSubmission.id }
				);
			}
		}

		// ========== PHASE 3: HOLISTIC DECISION ==========

		// 3.1: Calculate total risk score
		const riskScore = calculateNormalizedRiskScore({
			tokenReplay: false, // Already handled in Phase 1
			emailRiskScore: emailFraudResult?.riskScore || 0,
			ephemeralIdCount: ephemeralSignals?.submissionCount || 1,
			validationCount: ephemeralSignals?.validationCount || 1,
			uniqueIPCount: ephemeralSignals?.uniqueIPCount || 1,
			ja4RawScore: ja4Signals?.rawScore || 0,
			ipRateLimitScore: ipRateLimitSignals.riskScore,
			headerFingerprintScore: fingerprintSignals.headerFingerprintScore,
			tlsAnomalyScore: fingerprintSignals.tlsAnomalyScore,
			latencyMismatchScore: fingerprintSignals.latencyMismatchScore,
		}, config);

		// 3.2: Determine blockTrigger if any specific threshold exceeded
		// detectionType now represents the PRIMARY DETECTION LAYER that caught the fraud
		// Note: duplicate_email is handled earlier and throws ConflictError (not rate limit)
		let blockTrigger: 'email_fraud' | 'ephemeral_id_fraud' | 'ja4_session_hopping' | 'ip_diversity' | 'validation_frequency' | 'ip_rate_limit' | 'header_fingerprint' | 'tls_anomaly' | 'latency_mismatch' | undefined = undefined;
		let detectionType: string | null = null;

		if (emailFraudResult && emailFraudResult.decision === 'block') {
			blockTrigger = 'email_fraud';
			detectionType = 'email_fraud_detection'; // Layer 1: Email pattern analysis
		} else if (ephemeralSignals && ephemeralSignals.submissionCount >= config.detection.ephemeralIdSubmissionThreshold) {
			blockTrigger = 'ephemeral_id_fraud';
			detectionType = 'ephemeral_id_tracking'; // Layer 2: Device tracking (submission count)
		} else if (ephemeralSignals && ephemeralSignals.validationCount >= config.detection.validationFrequencyBlockThreshold) {
			blockTrigger = 'validation_frequency';
			detectionType = 'ephemeral_id_tracking'; // Layer 2: Device tracking (validation frequency)
		} else if (ephemeralSignals && ephemeralSignals.uniqueIPCount >= config.detection.ipDiversityThreshold) {
			blockTrigger = 'ip_diversity';
			detectionType = 'ephemeral_id_tracking'; // Layer 2: Device tracking (IP diversity)
		} else if (ja4Signals && ja4Signals.detectionType) {
			blockTrigger = 'ja4_session_hopping';
			detectionType = 'ja4_fingerprinting'; // Layer 4: TLS fingerprinting
		} else if (fingerprintSignals.trigger) {
			blockTrigger = fingerprintSignals.trigger;
			detectionType = fingerprintSignals.detectionType || 'fingerprint_anomaly';
		}
		// IP rate limit is NOT a blockTrigger on its own
		// It contributes to risk score but doesn't trigger blocks independently
		// This prevents false positives from shared IPs (offices, universities)
		// Blocks only occur when combined risk >= threshold

		// 3.3: Recalculate with blockTrigger for proper minimum scores
		const finalRiskScore = blockTrigger
			? calculateNormalizedRiskScore({
					tokenReplay: false,
					emailRiskScore: emailFraudResult?.riskScore || 0,
					ephemeralIdCount: ephemeralSignals?.submissionCount || 1,
					validationCount: ephemeralSignals?.validationCount || 1,
					uniqueIPCount: ephemeralSignals?.uniqueIPCount || 1,
					ja4RawScore: ja4Signals?.rawScore || 0,
					ipRateLimitScore: ipRateLimitSignals.riskScore,
					headerFingerprintScore: fingerprintSignals.headerFingerprintScore,
					tlsAnomalyScore: fingerprintSignals.tlsAnomalyScore,
					latencyMismatchScore: fingerprintSignals.latencyMismatchScore,
					blockTrigger,
			  }, config)
			: riskScore;

		logger.info(
			{
				total_risk: finalRiskScore.total,
				block_threshold: config.risk.blockThreshold,
				block_trigger: blockTrigger,
				detection_type: detectionType,
				components: {
					email_fraud: finalRiskScore.emailFraud,
					ephemeral_id: finalRiskScore.ephemeralId,
					validation_freq: finalRiskScore.validationFrequency,
					ip_diversity: finalRiskScore.ipDiversity,
					ja4_hopping: finalRiskScore.ja4SessionHopping,
					ip_rate_limit: finalRiskScore.ipRateLimit,
					header_fingerprint: finalRiskScore.headerFingerprint,
					tls_anomaly: finalRiskScore.tlsAnomaly,
					latency_mismatch: finalRiskScore.latencyMismatch,
				},
			},
			'Holistic risk score calculated'
		);

		// 3.4: Make blocking decision
		if (finalRiskScore.total >= config.risk.blockThreshold) {
			// BLOCK: Add to blacklist (email, ephemeral_id, ja4, ip)
			// Calculate progressive timeout based on offense history
			const offenseCount = await getOffenseCount(
				db,
				sanitized.email,
				validation.ephemeralId || null,
				metadata.remoteIp
			);
			const expiresIn = calculateProgressiveTimeout(offenseCount);
			const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

			// Collect all warnings
			const allWarnings = [
				...(emailFraudResult ? [`Email: ${emailFraudResult.signals.patternType || 'suspicious pattern'}`] : []),
				...(ephemeralSignals?.warnings || []),
				...(ja4Signals?.warnings || []),
				...(ipRateLimitSignals.warnings || []),
				...(fingerprintSignals.warnings || []),
			];

			const blockReason = `Risk score ${finalRiskScore.total} >= ${config.risk.blockThreshold}. Triggers: ${allWarnings.join(', ')}`;

			// Generate user-friendly message based on primary block trigger
			let userMessage: string;
			const waitTime = formatWaitTime(expiresIn);

			switch (blockTrigger) {
				case 'email_fraud':
					userMessage = `Suspicious email pattern detected. Please use a valid email address. If this is an error, please wait ${waitTime} and try again.`;
					break;
				case 'ephemeral_id_fraud':
					userMessage = `You have already submitted this form. If you believe this is an error, please contact support.`;
					break;
				case 'validation_frequency':
					userMessage = `Too many verification attempts. Please wait ${waitTime} before trying again.`;
					break;
				case 'ip_diversity':
					userMessage = `Unusual network activity detected. Please wait ${waitTime} before trying again.`;
					break;
				case 'ja4_session_hopping':
					userMessage = `Suspicious browser activity detected. Please wait ${waitTime} before trying again.`;
					break;
				case 'header_fingerprint':
					userMessage = `Suspicious device signature detected. Please wait ${waitTime} before trying again.`;
					break;
				case 'tls_anomaly':
					userMessage = `Untrusted connection fingerprint detected. Please wait ${waitTime} before trying again.`;
					break;
				case 'latency_mismatch':
					userMessage = `Unusual network characteristics detected. Please wait ${waitTime} before trying again.`;
					break;
				default:
					userMessage = `You have made too many submission attempts. Please wait ${waitTime} before trying again.`;
			}

			await addToBlacklist(db, {
				email: sanitized.email,
				ephemeralId: validation.ephemeralId || null,
				ipAddress: metadata.remoteIp,
				ja4: metadata.ja4 ?? null,
				blockReason,
				confidence: 'high',
				expiresIn,
				submissionCount: ephemeralSignals?.submissionCount || 1,
				detectionType: detectionType || 'holistic_risk',
				detectionMetadata: {
					risk_score: finalRiskScore.total,
					block_trigger: blockTrigger,
					detection_type: detectionType,
					warnings: allWarnings,
					email_fraud: emailFraudResult ? {
						pattern: emailFraudResult.signals.patternType,
						markov_detected: emailFraudResult.signals.markovDetected,
					} : null,
					ephemeral_signals: ephemeralSignals ? {
						submissions: ephemeralSignals.submissionCount,
						validations: ephemeralSignals.validationCount,
						unique_ips: ephemeralSignals.uniqueIPCount,
					} : null,
					ja4_signals: ja4Signals ? {
						raw_score: ja4Signals.rawScore,
						detection_layer: ja4Signals.detectionLayer,
					} : null,
					fingerprint_signals: fingerprintSignals.details || null,
					ip_rate_limit: ipRateLimitSignals || null,
					detected_at: new Date().toISOString(),
				},
				erfid,
				riskScore: finalRiskScore.total,
				riskScoreBreakdown: finalRiskScore,
			});

			// Log validation attempt
			await logValidation(db, {
				tokenHash,
				validation,
				metadata,
				riskScore: finalRiskScore.total,
				riskScoreBreakdown: finalRiskScore,
				allowed: false,
				blockReason,
				detectionType: detectionType || 'holistic_risk',
				erfid,
				testingBypass: skipTurnstile,
			});

			logger.warn(
				{
					risk_score: finalRiskScore.total,
					block_trigger: blockTrigger,
					detection_type: detectionType,
					warnings: allWarnings,
					user_message: userMessage,
				},
				'Submission blocked by holistic risk scoring'
			);

			throw new RateLimitError(
				blockReason,
				expiresIn,
				expiresAt,
				userMessage
			);
		}

		// 3.5: ALLOW: Create submission
		let submissionId: number;
		try {
			submissionId = await createSubmission(
				db,
				{
					firstName: sanitized.firstName,
					lastName: sanitized.lastName,
					email: sanitized.email,
					phone: sanitized.phone,
					address: sanitized.address,
					dateOfBirth: sanitized.dateOfBirth,
				},
				metadata,
				validation.ephemeralId,
				finalRiskScore,
				emailFraudResult,
				rawPayload,
				extractedEmail,
				extractedPhone,
				erfid,
				skipTurnstile
			);
		} catch (dbError) {
			// Handle UNIQUE constraint violation (duplicate email)
			if (dbError instanceof Error && dbError.message.includes('UNIQUE constraint failed')) {
				logger.warn(
					{
						email: sanitized.email,
						ephemeral_id: validation.ephemeralId,
						erfid,
					},
					'Duplicate email submission attempt (UNIQUE constraint)'
				);

				throw new ConflictError(
					'Duplicate email',
					'This email address has already been registered. If you believe this is an error, please contact support.',
					{ email: sanitized.email }
				);
			}
			// Re-throw other database errors
			throw dbError;
		}

		// Log successful validation
		await logValidation(db, {
			tokenHash,
			validation,
			metadata,
			riskScore: finalRiskScore.total,
			riskScoreBreakdown: finalRiskScore,
			allowed: true,
			submissionId,
			erfid,
			testingBypass: skipTurnstile,
		});

		logger.info(
			{
				submissionId,
				email: sanitized.email,
				riskScore: finalRiskScore.total,
				erfid,
			},
			'Submission created successfully'
		);

		c.header('X-Request-Id', erfid);

		return c.json(
			{
				success: true,
				submissionId,
				erfid,
				message: 'Form submitted successfully',
			},
			201
		);
	} catch (error) {
		return handleError(error, c);
	}
});

export default app;
