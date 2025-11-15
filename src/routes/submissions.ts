import { Hono } from 'hono';
import type { Env, FraudCheckResult } from '../lib/types';
import { formSubmissionSchema, sanitizeFormData } from '../lib/validation';
import { extractRequestMetadata } from '../lib/types';
import {
	validateTurnstileToken,
	hashToken,
	checkTokenReuse,
	checkEphemeralIdFraud,
} from '../lib/turnstile';
import { logValidation, createSubmission } from '../lib/database';
import logger from '../lib/logger';
import { checkPreValidationBlock } from '../lib/fraud-prevalidation';
import { checkJA4FraudPatterns } from '../lib/ja4-fraud-detection';
import { calculateNormalizedRiskScore } from '../lib/scoring';
import { checkEmailFraud } from '../lib/email-fraud-detection';
import {
	ValidationError,
	RateLimitError,
	ExternalServiceError,
	DatabaseError,
	ConflictError,
	handleError,
} from '../lib/errors';

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

const app = new Hono<{ Bindings: Env }>();

// POST /api/submissions - Create new submission with Turnstile validation
app.post('/', async (c) => {
	try {
		const db = c.env.DB;
		const secretKey = c.env['TURNSTILE-SECRET-KEY'];

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

		// Parse request body
		const body = await c.req.json();

		// Validate form data
		const validationResult = formSubmissionSchema.safeParse(body);

		if (!validationResult.success) {
			throw new ValidationError('Form validation failed', {
				errors: validationResult.error.errors,
			});
		}

		const { turnstileToken } = validationResult.data;

		// Sanitize form data
		const sanitized = sanitizeFormData(validationResult.data);

		// EMAIL FRAUD DETECTION (Phase 2 - Layer 5)
		// Check email for fraudulent patterns using markov-mail RPC
		let emailFraudResult = null;
		if (sanitized.email) {
			emailFraudResult = await checkEmailFraud(sanitized.email, c.env);

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

				throw new ValidationError(
					'Email rejected by fraud detection',
					{
						userMessage: 'This email address cannot be used. Please use a different email address',
						signals: emailFraudResult.signals,
					}
				);
			}
		}

		// Hash token for replay protection
		const tokenHash = hashToken(turnstileToken);

		// Check for token reuse
		const isReused = await checkTokenReuse(tokenHash, db);

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
			});

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
				});
			} catch (dbError) {
				// Non-critical: log but don't fail the request
				logger.error({ error: dbError }, 'Failed to log token reuse');
			}

			throw new ValidationError('Token replay attack', {
				tokenHash,
				userMessage: 'This verification has already been used. Please refresh the page and try again',
			});
		}

		// Validate Turnstile token
		const validation = await validateTurnstileToken(
			turnstileToken,
			metadata.remoteIp,
			secretKey
		);

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
				});

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
			fraudCheck = await checkEphemeralIdFraud(validation.ephemeralId, db);

			if (!fraudCheck.allowed) {
				// Determine detection type based on fraud check reason
				let detectionType: 'ephemeral_id_fraud' | 'ip_diversity' | 'validation_frequency' = 'ephemeral_id_fraud';
				if (fraudCheck.uniqueIPCount && fraudCheck.uniqueIPCount >= 2) {
					detectionType = 'ip_diversity';
				} else if (fraudCheck.validationCount && fraudCheck.validationCount >= 3) {
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
				});

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
				db
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
				});

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
		});

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
			});

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
					userMessage,
				}
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
			});

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
			emailFraudResult // Phase 2: Include email fraud detection results
		);

		// Log successful validation
		await logValidation(db, {
			tokenHash,
			validation,
			metadata,
			riskScore: normalizedRiskScore.total,
			allowed: true,
			submissionId,
		});

		logger.info(
			{
				submissionId,
				email: sanitized.email,
				riskScore: normalizedRiskScore.total,
				breakdown: normalizedRiskScore.components,
			},
			'Submission created successfully'
		);

		return c.json(
			{
				success: true,
				submissionId,
				message: 'Form submitted successfully',
			},
			201
		);
	} catch (error) {
		return handleError(error, c);
	}
});

export default app;
