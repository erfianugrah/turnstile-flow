import { Hono } from 'hono';
import type { Env, CloudflareRequest } from '../lib/types';
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
		const cfRequest = c.req.raw as CloudflareRequest;
		const metadata = extractRequestMetadata(cfRequest);

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

		if (!validation.valid) {
			logger.warn(
				{ reason: validation.reason, errors: validation.errors },
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

			return c.json(
				{
					error: 'Verification failed',
					message: 'Please complete the verification challenge',
				},
				400
			);
		}

		// EPHEMERAL ID BLACKLIST CHECK (performance optimization)
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
		}

		// Fraud detection (requires ephemeral ID)
		let fraudCheck;
		if (validation.ephemeralId) {
			fraudCheck = await checkEphemeralIdFraud(validation.ephemeralId, db);
		} else {
			// No ephemeral ID available - skip fraud detection (fail open)
			// Note: Ephemeral IDs are an Enterprise Turnstile feature
			logger.warn('Ephemeral ID not available - skipping fraud detection');
			fraudCheck = {
				allowed: true,
				riskScore: 0,
				warnings: ['Ephemeral ID not available'],
			};
		}

		if (!fraudCheck.allowed) {
			logger.warn(
				{
					riskScore: fraudCheck.riskScore,
					reason: fraudCheck.reason,
					warnings: fraudCheck.warnings,
				},
				'Submission blocked due to fraud detection'
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
