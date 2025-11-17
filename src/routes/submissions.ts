import { Hono } from 'hono';
import type { Env, FraudCheckResult } from '../lib/types';
import { formSubmissionSchema, sanitizeFormData } from '../lib/validation';
import { extractRequestMetadata } from '../lib/types';
import {
	validateTurnstileToken,
	hashToken,
	checkTokenReuse,
	checkEphemeralIdFraud,
	createMockValidation,
} from '../lib/turnstile';
import { logValidation, createSubmission, logFraudBlock } from '../lib/database';
import logger from '../lib/logger';
import { checkPreValidationBlock } from '../lib/fraud-prevalidation';
import { checkJA4FraudPatterns } from '../lib/ja4-fraud-detection';
import { calculateNormalizedRiskScore } from '../lib/scoring';
import { checkEmailFraud } from '../lib/email-fraud-detection';
import { extractField } from '../lib/field-mapper'; // Phase 3: Field mapping
import { getConfig } from '../lib/config';
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
 * Format wait time in seconds to human-readable string
 * Examples: "30 minutes", "2 hours", "1 day"
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

// POST /api/submissions - Create new submission with Turnstile validation
app.post('/', async (c) => {
	try {
		const db = c.env.DB;
		const secretKey = c.env['TURNSTILE-SECRET-KEY'];

		// Load fraud detection configuration
		const config = getConfig(c.env);

		// ========== GENERATE ERFID (Request Tracking ID) ==========
		// Parse erfid configuration from environment
		let erfidConfig: ErfidConfig | undefined;
		if (c.env.ERFID_CONFIG) {
			try {
				erfidConfig = typeof c.env.ERFID_CONFIG === 'string'
					? JSON.parse(c.env.ERFID_CONFIG)
					: c.env.ERFID_CONFIG;
			} catch (parseError) {
				logger.warn({ error: parseError }, 'Failed to parse ERFID_CONFIG, using defaults');
			}
		}

		// Generate erfid for this request
		const erfid = generateErfid(erfidConfig);

		// Store erfid in context for error handling
		c.set('erfid', erfid);

		logger.info({ erfid }, 'Request erfid generated');

		// ========== TESTING BYPASS CHECK ==========
		// Check if testing bypass is enabled and valid API key provided
		const apiKey = c.req.header('X-API-KEY');
		const expectedKey = c.env['X-API-KEY'];
		const allowBypass = c.env.ALLOW_TESTING_BYPASS === 'true';

		let skipTurnstile = false;

		if (allowBypass && apiKey && apiKey === expectedKey) {
			logger.info(
				{
					event: 'testing_bypass_activated',
					bypass_enabled: true
				},
				'Testing bypass activated via X-API-KEY'
			);
			skipTurnstile = true;
		}

		// Extract request metadata
		const metadata = extractRequestMetadata(c.req.raw);

		logger.info(
			{
				ip: metadata.remoteIp,
				country: metadata.country,
				userAgent: metadata.userAgent,
			},
			'Form submission received'
		);

		// Parse request body (Phase 3: Store raw payload for payload-agnostic forms)
		const rawPayload = await c.req.json();

		// Extract fields using field mapper (Phase 3: Try field extraction first)
		const extractedEmail = await extractField(rawPayload, 'email', c.env);
		const extractedPhone = await extractField(rawPayload, 'phone', c.env);

		// Validate form data (backwards compatibility)
		const validationResult = formSubmissionSchema.safeParse(rawPayload);

		if (!validationResult.success) {
			const userMessage = formatZodErrors(validationResult.error);
			throw new ValidationError(
				'Form validation failed',
				{ errors: validationResult.error.errors },
				userMessage
			);
		}

		const { turnstileToken } = validationResult.data;

		// Sanitize form data
		const sanitized = sanitizeFormData(validationResult.data);

		// EMAIL FRAUD DETECTION (Phase 2 - Layer 5)
		// Check email for fraudulent patterns using markov-mail RPC
		// Pass request.cf metadata for comprehensive fraud analysis
		let emailFraudResult = null;
		if (sanitized.email) {
			emailFraudResult = await checkEmailFraud(sanitized.email, c.env, c.req.raw);

			if (emailFraudResult && emailFraudResult.decision === 'block') {
				logger.warn(
					{
						email_hash: sanitized.email,
						risk_score: emailFraudResult.riskScore,
						pattern: emailFraudResult.signals.patternType,
						markov_detected: emailFraudResult.signals.markovDetected,
					},
					'Email blocked by fraud detection'
				);

				// Log fraud block to database (Phase 1: Email Fraud Logging)
				await logFraudBlock(c.env.DB, {
					detectionType: 'email_fraud',
					blockReason: `Email fraud: ${emailFraudResult.signals.patternType}`,
					riskScore: emailFraudResult.riskScore,
					metadata: metadata,
					fraudSignals: emailFraudResult.signals,
					erfid: erfid,
				});

				throw new ValidationError(
					'Email rejected by fraud detection',
					{ signals: emailFraudResult.signals },
					'This email address cannot be used. Please use a different email address'
				);
			}
		}

		// ========== TURNSTILE VALIDATION OR BYPASS ==========
		let validation;
		let tokenHash: string | undefined;
		let isReused = false; // Track token replay (false when bypassing)

		if (!skipTurnstile) {
			// Standard flow: validate Turnstile token
			if (!turnstileToken) {
				throw new ValidationError(
					'Turnstile token required',
					{},
					'Security verification token is missing. Please complete the CAPTCHA challenge'
				);
			}

			// Hash token for replay protection
			tokenHash = hashToken(turnstileToken);

			// Check for token reuse
			isReused = await checkTokenReuse(tokenHash, db);

			if (isReused) {
				// Calculate normalized risk score for blocked attempt
				const normalizedRiskScore = calculateNormalizedRiskScore({
					tokenReplay: true,  // Instant 100
					emailRiskScore: emailFraudResult?.riskScore || 0,
					ephemeralIdCount: 1,
					validationCount: 1,
					uniqueIPCount: 1,
					ja4RawScore: 0,
					blockTrigger: 'token_replay'  // Phase 1.6
				}, config);

				// Log the validation attempt
				try {
					await logValidation(db, {
						tokenHash,
						validation: {
							valid: false,
							reason: 'token_reused',
							errors: ['Token already used'],
						},
						metadata,
						riskScore: normalizedRiskScore.total,
						riskScoreBreakdown: normalizedRiskScore,
						allowed: false,
						blockReason: 'Token replay attack detected',
						detectionType: 'token_replay',
						erfid,
					});
				} catch (dbError) {
					// Non-critical: log but don't fail the request
					logger.error({ error: dbError }, 'Failed to log token reuse');
				}

				throw new ValidationError(
					'Token replay attack',
					{ tokenHash },
					'This verification has already been used. Please refresh the page and try again'
				);
			}

			// Validate Turnstile token
			validation = await validateTurnstileToken(
				turnstileToken,
				metadata.remoteIp,
				secretKey
			);
		} else {
			// Testing bypass: create mock validation
			// IMPORTANT: Still runs all fraud detection layers
			logger.info(
				{
					ip: metadata.remoteIp,
					testing_mode: true
				},
				'Using mock validation for testing'
			);

			validation = createMockValidation(
				metadata.remoteIp,
				'localhost'
			);

			// Use a mock token hash for testing
			tokenHash = hashToken(`test-${Date.now()}`);
		}

		// CRITICAL: Check fraud patterns BEFORE returning validation errors
		// This prevents attackers from bypassing fraud detection with expired/invalid tokens
		// Even failed validations can have ephemeral IDs that we need to track

		// Initialize fraud check result (default: allow with 0 risk score)
		let fraudCheck: FraudCheckResult = {
			allowed: true,
			riskScore: 0,
			warnings: [],
		};

		// EPHEMERAL ID BLACKLIST CHECK & FRAUD DETECTION (performance optimization)
		// If this ephemeral ID was previously detected as fraudulent, block immediately
		// This skips expensive D1 aggregation queries for repeat offenders
		if (validation.ephemeralId) {
			const ephemeralIdBlacklist = await checkPreValidationBlock(validation.ephemeralId, metadata.remoteIp, metadata.ja4 ?? null, db);

			if (ephemeralIdBlacklist.blocked) {
				// Calculate normalized risk score for blacklisted ephemeral ID
				const normalizedRiskScore = calculateNormalizedRiskScore({
					tokenReplay: false,
					emailRiskScore: emailFraudResult?.riskScore || 0,
					ephemeralIdCount: 2,  // Blacklisted means multiple attempts
					validationCount: 2,
					uniqueIPCount: 1,
					ja4RawScore: 0,
					blockTrigger: 'ephemeral_id_fraud'  // Phase 1.6
				}, config);

				// Log validation attempt
				try {
					await logValidation(db, {
						tokenHash,
						validation,
						metadata,
						riskScore: normalizedRiskScore.total,
						riskScoreBreakdown: normalizedRiskScore,
						allowed: false,
						blockReason: ephemeralIdBlacklist.reason || 'Ephemeral ID blacklisted',
						detectionType: 'ephemeral_id_fraud',
						erfid,
					});
				} catch (dbError) {
					// Non-critical: log but don't fail the request
					logger.error({ error: dbError }, 'Failed to log blacklist hit');
				}

				// Format wait time message
				const waitTime = formatWaitTime(ephemeralIdBlacklist.retryAfter || 3600);

				throw new RateLimitError(
					`Ephemeral ID blacklisted: ${ephemeralIdBlacklist.reason}`,
					ephemeralIdBlacklist.retryAfter || 3600,
					ephemeralIdBlacklist.expiresAt || new Date(Date.now() + 3600000).toISOString(),
					`You have made too many submission attempts. Please wait ${waitTime} before trying again`
				);
			}

			// FRAUD DETECTION ON ALL REQUESTS (failed and successful validations)
			// Check if this ephemeral ID is making repeated attempts (even with failed tokens)
			// This catches attackers who repeatedly try with expired/invalid tokens
			fraudCheck = await checkEphemeralIdFraud(validation.ephemeralId, db, config, erfid);

			if (!fraudCheck.allowed) {
				// Determine detection type based on fraud check reason
				let detectionType: 'ephemeral_id_fraud' | 'ip_diversity' | 'validation_frequency' = 'ephemeral_id_fraud';
				if (fraudCheck.uniqueIPCount && fraudCheck.uniqueIPCount >= config.detection.ipDiversityThreshold) {
					detectionType = 'ip_diversity';
				} else if (fraudCheck.validationCount && fraudCheck.validationCount >= config.detection.validationFrequencyBlockThreshold) {
					detectionType = 'validation_frequency';
				}

				// Calculate normalized risk score for ephemeral ID fraud
				const normalizedRiskScore = calculateNormalizedRiskScore({
					tokenReplay: false,
					emailRiskScore: emailFraudResult?.riskScore || 0,
					ephemeralIdCount: fraudCheck.ephemeralIdCount || 2,
					validationCount: fraudCheck.validationCount || 1,
					uniqueIPCount: fraudCheck.uniqueIPCount || 1,
					ja4RawScore: 0,
					blockTrigger: detectionType  // Phase 1.6
				}, config);

				// Log validation attempt
				try {
					await logValidation(db, {
						tokenHash,
						validation,
						metadata,
						riskScore: normalizedRiskScore.total,
						riskScoreBreakdown: normalizedRiskScore,
						allowed: false,
						blockReason: fraudCheck.reason,
						detectionType,
						erfid,
					});
				} catch (dbError) {
					// Non-critical: log but don't fail the request
					logger.error({ error: dbError }, 'Failed to log fraud check');
				}

				// Format wait time message
				const waitTime = formatWaitTime(fraudCheck.retryAfter || 3600);

				throw new RateLimitError(
					`Fraud detection triggered: ${fraudCheck.reason}`,
					fraudCheck.retryAfter || 3600,
					fraudCheck.expiresAt || new Date(Date.now() + 3600000).toISOString(),
					`You have made too many submission attempts. Please wait ${waitTime} before trying again`
				);
			}
		} else {
			// Ephemeral ID missing (unlikely) - skip fraud detection, fail open
			logger.warn('Ephemeral ID not available - skipping fraud detection');
			fraudCheck.warnings = ['Ephemeral ID not available'];
		}

		// JA4 FRAUD DETECTION (Layer 4 - Session Hopping Detection)
		// Check for same device creating multiple sessions (incognito/browser hopping)
		let ja4FraudCheck: Awaited<ReturnType<typeof checkJA4FraudPatterns>> | null = null;

		if (metadata.ja4) {
			ja4FraudCheck = await checkJA4FraudPatterns(
				metadata.remoteIp,
				metadata.ja4,
				validation.ephemeralId || null,  // Phase 1.8: Pass ephemeral ID for blacklisting (handle undefined)
				db,
				config,
				erfid
			);

			if (!ja4FraudCheck.allowed) {
				// Calculate normalized risk score for JA4 fraud
				const normalizedRiskScore = calculateNormalizedRiskScore({
					tokenReplay: false,
					emailRiskScore: emailFraudResult?.riskScore || 0,
					ephemeralIdCount: fraudCheck.ephemeralIdCount || 1,
					validationCount: fraudCheck.validationCount || 1,
					uniqueIPCount: fraudCheck.uniqueIPCount || 1,
					ja4RawScore: ja4FraudCheck.rawScore || 0,
					blockTrigger: 'ja4_session_hopping'  // Phase 1.8: All JA4 blocks use same trigger
				}, config);

				// Log validation attempt with layer-specific detection type (Phase 1.8)
				try {
					await logValidation(db, {
						tokenHash,
						validation,
						metadata,
						riskScore: normalizedRiskScore.total,
						riskScoreBreakdown: normalizedRiskScore,
						allowed: false,
						blockReason: ja4FraudCheck.reason,
						detectionType: ja4FraudCheck.detectionType || 'ja4_session_hopping',  // Phase 1.8: Layer-specific (ja4_ip_clustering, ja4_rapid_global, ja4_extended_global)
						erfid,
					});
				} catch (dbError) {
					// Non-critical: log but don't fail the request
					logger.error({ error: dbError }, 'Failed to log JA4 fraud check');
				}

				// Format wait time message
				const waitTime = formatWaitTime(ja4FraudCheck.retryAfter || 3600);

				throw new RateLimitError(
					`JA4 fraud detection triggered: ${ja4FraudCheck.reason}`,
					ja4FraudCheck.retryAfter || 3600,
					ja4FraudCheck.expiresAt || new Date(Date.now() + 3600000).toISOString(),
					`You have made too many submission attempts. Please wait ${waitTime} before trying again`
				);
			}

			// Merge JA4 fraud warnings with existing fraud check
			fraudCheck.warnings = [...fraudCheck.warnings, ...ja4FraudCheck.warnings];
			fraudCheck.riskScore = Math.max(fraudCheck.riskScore, ja4FraudCheck.riskScore);
		} else {
			// JA4 not available (unlikely) - skip JA4 detection
			logger.warn('JA4 fingerprint not available - skipping JA4 fraud detection');
			fraudCheck.warnings.push('JA4 not available');
		}

		// CALCULATE NORMALIZED RISK SCORE (0-100 scale)
		// Collect all fraud detection data
		const normalizedRiskScore = calculateNormalizedRiskScore({
			tokenReplay: isReused,
			emailRiskScore: emailFraudResult?.riskScore || 0, // Phase 2: Markov-mail email fraud detection
			ephemeralIdCount: fraudCheck.ephemeralIdCount || 1,
			validationCount: fraudCheck.validationCount || 1,
			uniqueIPCount: fraudCheck.uniqueIPCount || 1,
			ja4RawScore: ja4FraudCheck?.rawScore || 0,
		}, config);

		logger.info(
			{
				normalized_score: normalizedRiskScore.total,
				components: {
					token_replay: normalizedRiskScore.tokenReplay,
					email_fraud: normalizedRiskScore.emailFraud,
					ephemeral_id: normalizedRiskScore.ephemeralId,
					validation_freq: normalizedRiskScore.validationFrequency,
					ip_diversity: normalizedRiskScore.ipDiversity,
					ja4_hopping: normalizedRiskScore.ja4SessionHopping,
				},
			},
			'Normalized risk score calculated'
		);

		// Now check if validation actually failed
		if (!validation.valid) {
			// Calculate normalized risk score for failed Turnstile validation
			// Use high risk score since Turnstile itself failed the validation
			const failedValidationScore = calculateNormalizedRiskScore({
				tokenReplay: false,
				emailRiskScore: emailFraudResult?.riskScore || 0,
				ephemeralIdCount: fraudCheck.ephemeralIdCount || 1,
				validationCount: Math.max(fraudCheck.validationCount || 1, 3),  // Failed validations indicate multiple attempts
				uniqueIPCount: fraudCheck.uniqueIPCount || 1,
				ja4RawScore: ja4FraudCheck?.rawScore || 0,
				blockTrigger: 'turnstile_failed'  // Phase 1.6
			}, config);

			// Log validation attempt
			try {
				await logValidation(db, {
					tokenHash,
					validation,
					metadata,
					riskScore: failedValidationScore.total,
					riskScoreBreakdown: failedValidationScore,
					allowed: false,
					blockReason: validation.reason,
					detectionType: 'turnstile_failed',
					erfid,
				});
			} catch (dbError) {
				// Non-critical: log but don't fail the request
				logger.error({ error: dbError }, 'Failed to log failed validation');
			}

			// Use user-friendly error message from validation
			const userMessage = validation.userMessage || 'Please complete the verification challenge';

			throw new ExternalServiceError(
				'Turnstile',
				validation.reason || 'Verification failed',
				{
					errors: validation.errors,
					errorCodes: validation.debugInfo?.codes,
				},
				userMessage
			);
		}

		// At this point, validation passed and fraud check passed
		// Final step: Check for duplicate email before creating submission
		const existingSubmission = await db
			.prepare('SELECT id, created_at FROM submissions WHERE email = ? LIMIT 1')
			.bind(sanitized.email)
			.first<{ id: number; created_at: string }>();

		if (existingSubmission) {
			// Calculate normalized risk score for duplicate email
			// This is less severe than fraud patterns, but still suspicious
			const duplicateEmailScore = calculateNormalizedRiskScore({
				tokenReplay: false,
				emailRiskScore: emailFraudResult?.riskScore || 0,
				ephemeralIdCount: Math.max(fraudCheck.ephemeralIdCount || 1, 2),  // At least 2 to indicate duplicate attempt
				validationCount: fraudCheck.validationCount || 1,
				uniqueIPCount: fraudCheck.uniqueIPCount || 1,
				ja4RawScore: ja4FraudCheck?.rawScore || 0,
				blockTrigger: 'duplicate_email'  // Phase 1.6
			}, config);

			// Log validation attempt
			try {
				await logValidation(db, {
					tokenHash,
					validation,
					metadata,
					riskScore: duplicateEmailScore.total,
					riskScoreBreakdown: duplicateEmailScore,
					allowed: false,
					blockReason: 'Duplicate email address',
					detectionType: 'duplicate_email',
					erfid,
				});
			} catch (dbError) {
				// Non-critical: log but don't fail the request
				logger.error({ error: dbError }, 'Failed to log duplicate email');
			}

			throw new ConflictError(
				'Duplicate email address',
				'This email address has already been registered. If you believe this is an error, please contact support',
				{
					email: sanitized.email,
					existingId: existingSubmission.id,
					existingCreatedAt: existingSubmission.created_at,
				}
			);
		}

		// Create submission
		const submissionId = await createSubmission(
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
			normalizedRiskScore,
			emailFraudResult, // Phase 2: Include email fraud detection results
			rawPayload, // Phase 3: Store raw payload
			extractedEmail, // Phase 3: Store extracted email
			extractedPhone, // Phase 3: Store extracted phone
			erfid // Request tracking ID
		);

		// Log successful validation
		await logValidation(db, {
			tokenHash,
			validation,
			metadata,
			riskScore: normalizedRiskScore.total,
			allowed: true,
			submissionId,
			erfid,
		});

		logger.info(
			{
				submissionId,
				email: sanitized.email,
				riskScore: normalizedRiskScore.total,
				breakdown: normalizedRiskScore.components,
				erfid,
			},
			'Submission created successfully'
		);

		// Set erfid in response header for client-side tracking
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
