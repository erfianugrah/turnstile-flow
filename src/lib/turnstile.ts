import { createHash } from 'node:crypto';
import type { TurnstileValidationResult, FraudCheckResult } from './types';
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
 * Check for fraud patterns based on ephemeral ID
 * Research-based thresholds: Legitimate users submit once, 2+ = abuse for registration forms
 * Time window: 1 hour for validation attempts, 24 hours for submissions
 * Enhanced with IP diversity detection (rotating proxies/botnets)
 *
 * IMPORTANT: This check runs BEFORE the submission is created, so we add +1
 * to account for the current attempt when checking thresholds.
 *
 * CRITICAL: Due to D1 eventual consistency, we check BOTH submissions AND validations
 * to catch rapid-fire attempts before DB replication catches up.
 */
export async function checkEphemeralIdFraud(
	ephemeralId: string,
	db: D1Database
): Promise<FraudCheckResult> {
	const warnings: string[] = [];
	let riskScore = 0;

	try {
		const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
		const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

		// LAYER 1: Check successful submissions in last 24 hours
		// For registration forms, legitimate users should only submit ONCE
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

		// Add +1 to account for the current submission attempt (runs before creation)
		const effectiveCount = submissionCount + 1;

		// STRICTER THRESHOLD: Block on 2nd submission (1 existing + 1 current)
		// Registration forms should only be submitted once per user
		if (effectiveCount >= 2) {
			warnings.push(
				`Multiple submissions detected (${effectiveCount} total in 24h) - registration forms should only be submitted once`
			);
			riskScore = 100; // Immediate block
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

		// Block on 3+ validation attempts in 1 hour (allows 1 retry for legitimate users)
		if (effectiveValidationCount >= 3) {
			warnings.push(
				`Excessive validation attempts (${effectiveValidationCount} in 1h) - possible automated attack`
			);
			riskScore = Math.max(riskScore, 100); // Immediate block
		}
		// Warning on 2 validation attempts (1 existing + 1 current)
		else if (effectiveValidationCount >= 2 && riskScore < 100) {
			warnings.push(`Multiple validation attempts detected (${effectiveValidationCount} in 1h)`);
			riskScore = Math.max(riskScore, 60); // High risk but allow one retry
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

		// Same ephemeral ID from 2+ different IPs = suspicious (proxy rotation)
		if (ipCount >= 2 && submissionCount > 0) {
			warnings.push(`Multiple IPs for same ephemeral ID (${ipCount} IPs)`);
			riskScore = Math.max(riskScore, 100); // Immediate block on proxy rotation
		}

		const allowed = riskScore < 70;

		// Auto-blacklist high-risk ephemeral IDs
		if (!allowed && riskScore >= 70) {
			const confidence = riskScore >= 100 ? 'high' : riskScore >= 80 ? 'medium' : 'low';
			// High confidence (100): 7 days, Medium (80+): 3 days, Low (70+): 1 day
			const expiresIn = riskScore >= 100 ? 86400 * 7 : riskScore >= 80 ? 86400 * 3 : 86400;

			await addToBlacklist(db, {
				ephemeralId,
				blockReason: `Automated: Multiple submissions detected (${effectiveCount} in 24h, ${effectiveValidationCount} validations in 1h) - ${warnings.join(', ')}`,
				confidence,
				expiresIn,
				submissionCount: effectiveCount,
				detectionMetadata: {
					risk_score: riskScore,
					warnings,
					submissions_24h: effectiveCount,
					validations_1h: effectiveValidationCount,
					unique_ips: ipCount,
					detected_at: new Date().toISOString(),
				},
			});

			logger.warn(
				{
					ephemeralId,
					riskScore,
					confidence,
					expiresIn,
					submissions_24h: effectiveCount,
					validations_1h: effectiveValidationCount,
					unique_ips: ipCount,
				},
				'Ephemeral ID auto-blacklisted'
			);
		}

		logger.info(
			{
				ephemeralId,
				riskScore,
				allowed,
				warnings,
				submissions_24h: effectiveCount,
				validations_1h: effectiveValidationCount,
				unique_ips: ipCount,
			},
			'Fraud check completed'
		);

		return {
			allowed,
			reason: allowed ? undefined : 'Multiple submissions detected - registration forms allow only one submission',
			riskScore,
			warnings,
		};
	} catch (error) {
		logger.error({ error, ephemeralId }, 'Error during fraud check');
		// Fail secure: if fraud check fails, allow but log warning
		return {
			allowed: true,
			reason: 'Fraud check failed (allowing)',
			riskScore: 0,
			warnings: ['Fraud check error'],
		};
	}
}

