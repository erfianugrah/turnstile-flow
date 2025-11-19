import { createHash } from 'node:crypto';
import type { TurnstileValidationResult, FraudCheckResult } from './types';
import type { FraudDetectionConfig } from './config';
import logger from './logger';
import { addToBlacklist } from './fraud-prevalidation';
import {
	getTurnstileError,
	getUserErrorMessage,
	getDebugErrorInfo,
	isConfigurationError,
} from './turnstile-errors';

/**
 * Validate Turnstile token with Cloudflare's siteverify API
 * @see https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
 */
export async function validateTurnstileToken(
	token: string,
	remoteIp: string,
	secretKey: string
): Promise<TurnstileValidationResult> {
	try {
		const response = await fetch(
			'https://challenges.cloudflare.com/turnstile/v0/siteverify',
			{
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					secret: secretKey,
					response: token,
					remoteip: remoteIp,
				}),
			}
		);

		if (!response.ok) {
			logger.error(
				{ status: response.status, statusText: response.statusText },
				'Turnstile API request failed'
			);
			return {
				valid: false,
				reason: 'api_request_failed',
				errors: ['API request failed'],
			};
		}

		const result = await response.json<{
			success: boolean;
			challenge_ts?: string;
			hostname?: string;
			action?: string;
			cdata?: string;
			'error-codes'?: string[];
			metadata?: {
				ephemeral_id?: string;
			};
		}>();

		// Extract ephemeral ID if available (Enterprise only)
		// IMPORTANT: Extract ephemeral ID even on failed validations for fraud detection
		const ephemeralId = result.metadata?.ephemeral_id || null;

		if (!result.success) {
			const errorCodes = result['error-codes'] || [];
			const debugInfo = getDebugErrorInfo(errorCodes);

			// Log with enhanced error information
			logger.warn(
				{
					errorCodes,
					errorMessages: debugInfo.messages,
					categories: debugInfo.categories,
					isConfigError: isConfigurationError(errorCodes),
					ephemeralId,
				},
				'Turnstile validation failed'
			);

			// Alert on configuration errors (needs developer attention)
			if (isConfigurationError(errorCodes)) {
				logger.error(
					{ errorCodes, debugInfo },
					'⚠️ CONFIGURATION ERROR: Turnstile misconfigured - immediate attention required'
				);
			}

			return {
				valid: false,
				reason: 'turnstile_validation_failed',
				errors: errorCodes,
				userMessage: getUserErrorMessage(errorCodes),
				debugInfo,
				ephemeralId, // Include ephemeral ID for fraud detection
			};
		}

		if (!ephemeralId) {
			logger.info('⚠️ Ephemeral ID not available (requires Enterprise plan)');
		} else {
			logger.info({ ephemeralId }, 'Ephemeral ID extracted from validation');
		}

		return {
			valid: true,
			data: result,
			ephemeralId,
		};
	} catch (error) {
		logger.error({ error }, 'Turnstile validation error');
		return {
			valid: false,
			reason: 'validation_error',
			errors: ['Internal validation error'],
		};
	}
}

/**
 * Hash token using SHA256 for storage (never store actual token)
 */
export function hashToken(token: string): string {
	return createHash('sha256').update(token).digest('hex');
}

/**
 * Check if token has been used before (replay attack prevention)
 */
export async function checkTokenReuse(
	tokenHash: string,
	db: D1Database
): Promise<boolean> {
	try {
		const result = await db
			.prepare('SELECT id FROM turnstile_validations WHERE token_hash = ? LIMIT 1')
			.bind(tokenHash)
			.first<{ id: number }>();

		return result !== null;
	} catch (error) {
		logger.error({ error }, 'Error checking token reuse');
		// Fail secure: if we can't check, assume it's reused
		return true;
	}
}

/**
 * Convert JavaScript Date to SQLite-compatible datetime string
 * SQLite stores DATETIME as "YYYY-MM-DD HH:MM:SS" (space separator)
 * JavaScript Date.toISOString() returns "YYYY-MM-DDTHH:MM:SS.sssZ" (T separator)
 * Direct comparison fails because space < T in ASCII, causing all time-based queries to fail
 */
function toSQLiteDateTime(date: Date): string {
	return date.toISOString()
		.replace('T', ' ')      // Replace T with space
		.replace(/\.\d{3}Z$/, '');  // Remove milliseconds and Z
}

/**
 * Calculate progressive timeout based on previous offenses
 * Progressive escalation: 1h → 4h → 8h → 12h → 24h
 */
export function calculateProgressiveTimeout(offenseCount: number): number {
	// Progressive time windows in seconds
	const timeWindows = [
		3600,    // 1st offense: 1 hour
		14400,   // 2nd offense: 4 hours
		28800,   // 3rd offense: 8 hours
		43200,   // 4th offense: 12 hours
		86400,   // 5th+ offense: 24 hours
	];

	// Cap at maximum timeout (24h)
	const index = Math.min(offenseCount - 1, timeWindows.length - 1);
	return timeWindows[Math.max(0, index)];
}

/**
 * Get offense count for ephemeral ID (how many times blocked in last 24h)
 */
async function getOffenseCount(ephemeralId: string, db: D1Database): Promise<number> {
	const oneDayAgo = toSQLiteDateTime(new Date(Date.now() - 24 * 60 * 60 * 1000));

	const result = await db
		.prepare(
			`SELECT COUNT(*) as count
			 FROM fraud_blacklist
			 WHERE ephemeral_id = ?
			 AND blocked_at > ?`
		)
		.bind(ephemeralId, oneDayAgo)
		.first<{ count: number }>();

	return (result?.count || 0) + 1; // +1 for current offense
}

/**
 * Collect ephemeral ID fraud signals without blocking (Phase 3: Holistic Risk Scoring)
 *
 * Extracts behavioral signals from ephemeral ID patterns:
 * - Submission count (24h window)
 * - Validation attempt frequency (1h window)
 * - IP diversity (24h window)
 *
 * @param ephemeralId - Turnstile ephemeral ID
 * @param db - D1 database instance
 * @param config - Fraud detection configuration
 * @returns Signal data for risk scoring (does NOT make blocking decision)
 */
export async function collectEphemeralIdSignals(
	ephemeralId: string,
	db: D1Database,
	config: FraudDetectionConfig
): Promise<{
	submissionCount: number;
	validationCount: number;
	uniqueIPCount: number;
	warnings: string[];
}> {
	const warnings: string[] = [];

	try {
		const oneHourAgo = toSQLiteDateTime(new Date(Date.now() - 60 * 60 * 1000));
		const oneDayAgo = toSQLiteDateTime(new Date(Date.now() - 24 * 60 * 60 * 1000));

		// Signal 1: Submission count (changed to 24h window for consistency)
		const recentSubmissions = await db
			.prepare(
				`SELECT COUNT(*) as count
				 FROM submissions
				 WHERE ephemeral_id = ?
				 AND created_at > ?`
			)
			.bind(ephemeralId, oneDayAgo)
			.first<{ count: number }>();

		const submissionCount = recentSubmissions?.count || 0;
		const effectiveCount = submissionCount + 1; // +1 for current attempt

		if (effectiveCount >= config.detection.ephemeralIdSubmissionThreshold) {
			warnings.push(
				`Multiple submissions detected (${effectiveCount} total in 24h) - registration forms should only be submitted once`
			);
		}

		// Signal 2: Validation frequency (1h window for rapid-fire detection)
		const recentValidations = await db
			.prepare(
				`SELECT COUNT(*) as count
				 FROM turnstile_validations
				 WHERE ephemeral_id = ?
				 AND created_at > ?`
			)
			.bind(ephemeralId, oneHourAgo)
			.first<{ count: number }>();

		const validationCount = recentValidations?.count || 0;
		const effectiveValidationCount = validationCount + 1; // +1 for current attempt

		if (effectiveValidationCount >= config.detection.validationFrequencyBlockThreshold) {
			warnings.push(
				`Excessive validation attempts (${effectiveValidationCount} in 1h) - possible automated attack`
			);
		} else if (effectiveValidationCount >= config.detection.validationFrequencyWarnThreshold) {
			warnings.push(`Multiple validation attempts detected (${effectiveValidationCount} in 1h)`);
		}

		// Signal 3: IP diversity (24h window)
		const uniqueIps = await db
			.prepare(
				`SELECT COUNT(DISTINCT remote_ip) as count
				 FROM submissions
				 WHERE ephemeral_id = ?
				 AND created_at > ?`
			)
			.bind(ephemeralId, oneDayAgo)
			.first<{ count: number }>();

		const ipCount = uniqueIps?.count || 0;

		if (ipCount >= config.detection.ipDiversityThreshold && submissionCount > 0) {
			warnings.push(`Multiple IPs for same ephemeral ID (${ipCount} IPs) - proxy rotation detected`);
		}

		logger.info(
			{
				ephemeralId,
				submissions_24h: effectiveCount,
				validations_1h: effectiveValidationCount,
				unique_ips: ipCount,
				warnings,
			},
			'Ephemeral ID signals collected'
		);

		return {
			submissionCount: effectiveCount,
			validationCount: effectiveValidationCount,
			uniqueIPCount: ipCount,
			warnings,
		};
	} catch (error) {
		logger.error({ error, ephemeralId }, 'Error collecting ephemeral ID signals');
		// Fail-open: Return minimal signals if collection fails
		return {
			submissionCount: 1,
			validationCount: 1,
			uniqueIPCount: 1,
			warnings: ['Signal collection error'],
		};
	}
}

/**
 * Check for fraud patterns based on ephemeral ID
 *
 * @deprecated Use collectEphemeralIdSignals() for holistic risk scoring (Phase 3)
 * This function will be removed in Phase 4 when submissions.ts is refactored
 *
 * Research-based thresholds: Legitimate users submit once, 2+ = abuse for registration forms
 * Time window: 1 hour for validation attempts (progressive timeout for blocks)
 * Enhanced with IP diversity detection (rotating proxies/botnets)
 *
 * IMPORTANT: This check runs BEFORE the submission is created, so we add +1
 * to account for the current attempt when checking thresholds.
 *
 * CRITICAL: Due to D1 eventual consistency, we check BOTH submissions AND validations
 * to catch rapid-fire attempts before DB replication catches up.
 *
 * PROGRESSIVE BLOCKING: First offense = 1h, escalates to 4h, 8h, 12h, 24h for repeat offenders
 */
export async function checkEphemeralIdFraud(
	ephemeralId: string,
	db: D1Database,
	config: FraudDetectionConfig,
	erfid?: string
): Promise<FraudCheckResult & { ephemeralIdCount?: number; validationCount?: number; uniqueIPCount?: number }> {
	const warnings: string[] = [];

	try {
		const oneHourAgo = toSQLiteDateTime(new Date(Date.now() - 60 * 60 * 1000));
		const oneDayAgo = toSQLiteDateTime(new Date(Date.now() - 24 * 60 * 60 * 1000));

		// LAYER 1: Check successful submissions in last hour (changed from 24h)
		// For registration forms, legitimate users should only submit ONCE
		const recentSubmissions = await db
			.prepare(
				`SELECT COUNT(*) as count
				 FROM submissions
				 WHERE ephemeral_id = ?
				 AND created_at > ?`
			)
			.bind(ephemeralId, oneHourAgo)
			.first<{ count: number }>();

		const submissionCount = recentSubmissions?.count || 0;

		// Add +1 to account for the current submission attempt (runs before creation)
		const effectiveCount = submissionCount + 1;

		// STRICTER THRESHOLD: Block on Nth submission (configurable, default 2)
		// Registration forms should only be submitted once per user
		const blockOnSubmissions = effectiveCount >= config.detection.ephemeralIdSubmissionThreshold;
		if (blockOnSubmissions) {
			warnings.push(
				`Multiple submissions detected (${effectiveCount} total in 1h) - registration forms should only be submitted once`
			);
		}

		// LAYER 2: Check validation attempts in last hour
		// CRITICAL: This catches rapid-fire attacks BEFORE D1 replication catches up
		// turnstile_validations writes complete faster and show ALL attempts (even failed tokens)
		const recentValidations = await db
			.prepare(
				`SELECT COUNT(*) as count
				 FROM turnstile_validations
				 WHERE ephemeral_id = ?
				 AND created_at > ?`
			)
			.bind(ephemeralId, oneHourAgo)
			.first<{ count: number }>();

		const validationCount = recentValidations?.count || 0;

		// Add +1 for current validation attempt (this runs before logging validation)
		const effectiveValidationCount = validationCount + 1;

		// Block on N+ validation attempts in 1 hour (configurable, default 3)
		const blockOnValidations = effectiveValidationCount >= config.detection.validationFrequencyBlockThreshold;
		if (blockOnValidations) {
			warnings.push(
				`Excessive validation attempts (${effectiveValidationCount} in 1h) - possible automated attack`
			);
		}
		// Warning on warn threshold (configurable, default 2)
		else if (effectiveValidationCount >= config.detection.validationFrequencyWarnThreshold) {
			warnings.push(`Multiple validation attempts detected (${effectiveValidationCount} in 1h)`);
		}

		// LAYER 3: Check IP diversity (same ephemeral ID from multiple IPs = proxy rotation/botnet)
		const uniqueIps = await db
			.prepare(
				`SELECT COUNT(DISTINCT remote_ip) as count
				 FROM submissions
				 WHERE ephemeral_id = ?
				 AND created_at > ?`
			)
			.bind(ephemeralId, oneDayAgo)
			.first<{ count: number }>();

		const ipCount = uniqueIps?.count || 0;

		// Same ephemeral ID from multiple different IPs = suspicious (proxy rotation)
		const blockOnProxyRotation = ipCount >= config.detection.ipDiversityThreshold && submissionCount > 0;
		if (blockOnProxyRotation) {
			warnings.push(`Multiple IPs for same ephemeral ID (${ipCount} IPs)`);
		}

		const allowed = !(blockOnSubmissions || blockOnValidations || blockOnProxyRotation);

		// Auto-blacklist high-risk ephemeral IDs with PROGRESSIVE timeout
		let retryAfter: number | undefined;
		let expiresAt: string | undefined;

		if (!allowed) {
			const confidence = 'high'; // All blocks are high confidence based on hard thresholds

			// Get offense count and calculate progressive timeout
			const offenseCount = await getOffenseCount(ephemeralId, db);
			const expiresIn = calculateProgressiveTimeout(offenseCount);

			// Calculate expiry timestamp
			expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
			retryAfter = expiresIn;

			// Convert seconds to human-readable format for logging
			const timeoutHours = expiresIn / 3600;

			await addToBlacklist(db, {
				ephemeralId,
				blockReason: `Automated: Multiple submissions detected (${effectiveCount} in 1h, ${effectiveValidationCount} validations in 1h) - ${warnings.join(', ')}`,
				confidence,
				expiresIn,
				submissionCount: effectiveCount,
				detectionType: 'ephemeral_id_tracking',  // Primary detection layer
				detectionMetadata: {
					warnings,
					submissions_1h: effectiveCount,
					validations_1h: effectiveValidationCount,
					unique_ips: ipCount,
					offense_count: offenseCount,
					timeout_hours: timeoutHours,
					detected_at: new Date().toISOString(),
				},
				erfid, // Request tracking ID
			});

			logger.warn(
				{
					ephemeralId,
					confidence,
					expiresIn,
					offenseCount,
					timeoutHours,
					submissions_1h: effectiveCount,
					validations_1h: effectiveValidationCount,
					unique_ips: ipCount,
				},
				'Ephemeral ID auto-blacklisted with progressive timeout'
			);
		}

		logger.info(
			{
				ephemeralId,
				allowed,
				warnings,
				submissions_1h: effectiveCount,
				validations_1h: effectiveValidationCount,
				unique_ips: ipCount,
			},
			'Fraud check completed'
		);

		return {
			allowed,
			reason: allowed ? undefined : 'You have made too many submission attempts',
			riskScore: 0, // Legacy field, actual scoring done by scoring.ts
			warnings,
			retryAfter,
			expiresAt,
			// Return raw counts for normalized scoring
			ephemeralIdCount: effectiveCount,
			validationCount: effectiveValidationCount,
			uniqueIPCount: ipCount,
		};
	} catch (error) {
		logger.error({ error, ephemeralId }, 'Error during fraud check');
		// Fail secure: if fraud check fails, allow but log warning
		return {
			allowed: true,
			reason: 'Fraud check failed (allowing)',
			riskScore: 0, // Legacy field
			warnings: ['Fraud check error'],
			ephemeralIdCount: 1,
			validationCount: 1,
			uniqueIPCount: 1,
		};
	}
}

/**
 * Create mock validation for testing bypass
 * ONLY used when ALLOW_TESTING_BYPASS=true and X-API-KEY is valid
 *
 * This allows automated testing without solving Turnstile CAPTCHA
 * while still running all fraud detection layers
 */
export function createMockValidation(
	ip: string,
	hostname: string = 'test'
): TurnstileValidationResult {
	// Generate unique ephemeral ID for each test
	const mockEphemeralId = `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

	return {
		valid: true,
		data: {
			success: true,
			challenge_ts: new Date().toISOString(),
			hostname,
			action: 'test',
			cdata: 'test',
			metadata: {
				ephemeral_id: mockEphemeralId
			}
		},
		ephemeralId: mockEphemeralId
	};
}
