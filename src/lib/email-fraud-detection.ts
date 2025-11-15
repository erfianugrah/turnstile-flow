import type { Env } from './types';
import { logger } from './logger';
import crypto from 'crypto';

export interface EmailFraudResult {
	riskScore: number; // 0-100
	decision: 'allow' | 'warn' | 'block';
	signals: {
		markovDetected: boolean;
		markovConfidence: number;
		patternType: string;
		isDisposableDomain: boolean;
		tldRiskScore: number;
		oodDetected: boolean;
	};
}

/**
 * Check email for fraud patterns using markov-mail service
 *
 * Uses Worker-to-Worker RPC for low-latency fraud detection (0.1-0.5ms vs 10-50ms HTTP)
 *
 * @param email - Email address to validate
 * @param env - Environment bindings
 * @returns Email fraud result or null if service unavailable (fail-open)
 */
export async function checkEmailFraud(
	email: string,
	env: Env
): Promise<EmailFraudResult | null> {
	try {
		// Call markov-mail via RPC
		const result = await env.FRAUD_DETECTOR.validate({
			email,
			consumer: 'FORMINATOR',
			flow: 'REGISTRATION',
		});

		const emailHash = await hashEmail(email);

		logger.info({
			event: 'email_fraud_check',
			email_hash: emailHash,
			risk_score: result.riskScore,
			decision: result.decision,
			pattern: result.signals.patternType,
			markov_detected: result.signals.markovDetected,
			ood_detected: result.signals.oodDetected,
			disposable: result.signals.isDisposableDomain,
		});

		return {
			riskScore: result.riskScore * 100, // Convert 0.0-1.0 to 0-100
			decision: result.decision,
			signals: result.signals,
		};
	} catch (error) {
		// Fail-open: Allow if service unavailable
		logger.error({
			event: 'email_fraud_check_error',
			error: error instanceof Error ? error.message : String(error),
		});
		return null;
	}
}

/**
 * Hash email address for privacy-safe logging
 *
 * @param email - Email address to hash
 * @returns SHA-256 hash of lowercase email
 */
async function hashEmail(email: string): Promise<string> {
	const encoder = new TextEncoder();
	const data = encoder.encode(email.toLowerCase());
	const hashBuffer = await crypto.subtle.digest('SHA-256', data);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}
