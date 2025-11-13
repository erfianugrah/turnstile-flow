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
			logger.warn({ errors: validationResult.error.errors }, 'Form validation failed');
			return c.json(
				{
					error: 'Validation failed',
					details: validationResult.error.errors,
				},
				400
			);
		}

		const { turnstileToken } = validationResult.data;

		// Sanitize form data
		const sanitized = sanitizeFormData(validationResult.data);

		// Hash token for replay protection
		const tokenHash = hashToken(turnstileToken);

		// Check for token reuse
		const isReused = await checkTokenReuse(tokenHash, db);

		if (isReused) {
			logger.warn({ tokenHash }, 'Token already used (replay attack)');

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

			return c.json(
				{
					error: 'Invalid request',
					message: 'This verification has already been used',
				},
				400
			);
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
				logger.warn(
					{
						ephemeralId: validation.ephemeralId,
						reason: ephemeralIdBlacklist.reason,
						confidence: ephemeralIdBlacklist.confidence,
						validationFailed: !validation.valid,
					},
					'Request blocked - ephemeral ID previously flagged as fraudulent'
				);

				await logValidation(db, {
					tokenHash,
					validation,
					metadata,
					riskScore: 100,
					allowed: false,
					blockReason: ephemeralIdBlacklist.reason || 'Ephemeral ID blacklisted',
				});

				return c.json(
					{
						error: 'Request blocked',
						message: 'Your submission cannot be processed at this time',
					},
					403
				);
			}

			// FRAUD DETECTION ON ALL REQUESTS (failed and successful validations)
			// Check if this ephemeral ID is making repeated attempts (even with failed tokens)
			// This catches attackers who repeatedly try with expired/invalid tokens
			fraudCheck = await checkEphemeralIdFraud(validation.ephemeralId, db);

			if (!fraudCheck.allowed) {
				logger.warn(
					{
						ephemeralId: validation.ephemeralId,
						riskScore: fraudCheck.riskScore,
						reason: fraudCheck.reason,
						warnings: fraudCheck.warnings,
						validationFailed: !validation.valid,
					},
					'Request blocked due to fraud detection (repeated attempts detected)'
				);

				await logValidation(db, {
					tokenHash,
					validation,
					metadata,
					riskScore: fraudCheck.riskScore,
					allowed: false,
					blockReason: fraudCheck.reason,
				});

				return c.json(
					{
						error: 'Too many requests',
						message: 'Please try again later',
					},
					429,
					{
						'Retry-After': '3600',
					}
				);
			}
		} else {
			// Ephemeral ID missing (unlikely) - skip fraud detection, fail open
			logger.warn('Ephemeral ID not available - skipping fraud detection');
			fraudCheck.warnings = ['Ephemeral ID not available'];
		}

		// Now check if validation actually failed
		if (!validation.valid) {
			logger.warn(
				{
					reason: validation.reason,
					errors: validation.errors,
					errorCodes: validation.debugInfo?.codes,
					errorMessages: validation.debugInfo?.messages,
					ephemeralId: validation.ephemeralId,
				},
				'Turnstile validation failed'
			);

			await logValidation(db, {
				tokenHash,
				validation,
				metadata,
				riskScore: 90,
				allowed: false,
				blockReason: validation.reason,
			});

			// Use user-friendly error message from validation
			const userMessage = validation.userMessage || 'Please complete the verification challenge';

			return c.json(
				{
					error: 'Verification failed',
					message: userMessage,
					errorCode: validation.errors?.[0], // Include error code for client debugging
					debug: validation.debugInfo, // Include debug info in development
				},
				400
			);
		}

		// At this point, validation passed and fraud check passed
		// Final step: Check for duplicate email before creating submission
		const existingSubmission = await db
			.prepare('SELECT id, created_at FROM submissions WHERE email = ? LIMIT 1')
			.bind(sanitized.email)
			.first<{ id: number; created_at: string }>();

		if (existingSubmission) {
			logger.warn(
				{
					email: sanitized.email,
					existingId: existingSubmission.id,
					existingCreatedAt: existingSubmission.created_at,
				},
				'Duplicate email submission attempt'
			);

			await logValidation(db, {
				tokenHash,
				validation,
				metadata,
				riskScore: 60, // Medium risk for duplicate email
				allowed: false,
				blockReason: 'Duplicate email address',
			});

			return c.json(
				{
					error: 'Duplicate submission',
					message: 'This email address has already been registered. If you believe this is an error, please contact support.',
				},
				409 // 409 Conflict
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
		logger.error({ error }, 'Error processing submission');

		return c.json(
			{
				error: 'Internal server error',
				message: 'An error occurred while processing your submission',
			},
			500
		);
	}
});

export default app;
