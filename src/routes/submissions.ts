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

		// Hash token for replay protection
		const tokenHash = hashToken(turnstileToken);

		// Check for token reuse
		const isReused = await checkTokenReuse(tokenHash, db);

		if (isReused) {
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
					riskScore: 100,
					allowed: false,
					blockReason: 'Token replay attack detected',
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
			const ephemeralIdBlacklist = await checkPreValidationBlock(validation.ephemeralId, metadata.remoteIp, db);

			if (ephemeralIdBlacklist.blocked) {
				// Log validation attempt
				try {
					await logValidation(db, {
						tokenHash,
						validation,
						metadata,
						riskScore: 100,
						allowed: false,
						blockReason: ephemeralIdBlacklist.reason || 'Ephemeral ID blacklisted',
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
				// Log validation attempt
				try {
					await logValidation(db, {
						tokenHash,
						validation,
						metadata,
						riskScore: fraudCheck.riskScore,
						allowed: false,
						blockReason: fraudCheck.reason,
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

		// Now check if validation actually failed
		if (!validation.valid) {
			// Log validation attempt
			try {
				await logValidation(db, {
					tokenHash,
					validation,
					metadata,
					riskScore: 90,
					allowed: false,
					blockReason: validation.reason,
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
			// Log validation attempt
			try {
				await logValidation(db, {
					tokenHash,
					validation,
					metadata,
					riskScore: 60, // Medium risk for duplicate email
					allowed: false,
					blockReason: 'Duplicate email address',
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
			validation.ephemeralId
		);

		// Log successful validation
		await logValidation(db, {
			tokenHash,
			validation,
			metadata,
			riskScore: fraudCheck.riskScore,
			allowed: true,
			submissionId,
		});

		logger.info(
			{
				submissionId,
				email: sanitized.email,
				riskScore: fraudCheck.riskScore,
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
