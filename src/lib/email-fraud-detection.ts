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
 * Passes full request.cf metadata to markov-mail for comprehensive fraud analysis
 *
 * @param email - Email address to validate
 * @param env - Environment bindings
 * @param request - Optional original request for extracting metadata
 * @returns Email fraud result or null if service unavailable (fail-open)
 */
export async function checkEmailFraud(
	email: string,
	env: Env,
	request?: Request
): Promise<EmailFraudResult | null> {
	try {
		// Extract request.cf metadata to pass via RPC
		// This ensures markov-mail has access to all Cloudflare signals
		const headers: Record<string, string | null> = {};

		if (request) {
			const cf = request.cf as any;

			// Basic headers
			headers['cf-connecting-ip'] = request.headers.get('cf-connecting-ip');
			headers['true-client-ip'] = request.headers.get('true-client-ip');
			headers['cf-ray'] = request.headers.get('cf-ray');
			headers['user-agent'] = request.headers.get('user-agent');
			headers['cf-asn'] = cf?.asn ? String(cf.asn) : null;
			headers['cf-device-type'] = request.headers.get('cf-device-type') || (cf?.deviceType ? String(cf.deviceType) : null);

			// Geographic headers
			headers['cf-ipcountry'] = request.headers.get('cf-ipcountry') || (cf?.country ? String(cf.country) : null);
			headers['cf-region'] = request.headers.get('cf-region') || (cf?.region ? String(cf.region) : null);
			headers['cf-ipcity'] = request.headers.get('cf-ipcity') || (cf?.city ? String(cf.city) : null);
			headers['cf-postal-code'] = request.headers.get('cf-postal-code') || (cf?.postalCode ? String(cf.postalCode) : null);
			headers['cf-timezone'] = request.headers.get('cf-timezone') || (cf?.timezone ? String(cf.timezone) : null);
			headers['cf-iplatitude'] = request.headers.get('cf-iplatitude') || (cf?.latitude ? String(cf.latitude) : null);
			headers['cf-iplongitude'] = request.headers.get('cf-iplongitude') || (cf?.longitude ? String(cf.longitude) : null);
			headers['cf-ipcontinent'] = request.headers.get('cf-ipcontinent') || (cf?.continent ? String(cf.continent) : null);
			headers['cf-is-eu-country'] = cf?.isEUCountry ? String(cf.isEUCountry) : null;

			// Network headers
			headers['cf-as-organization'] = cf?.asOrganization ? String(cf.asOrganization) : null;
			headers['cf-colo'] = cf?.colo ? String(cf.colo) : null;
			headers['cf-http-protocol'] = cf?.httpProtocol ? String(cf.httpProtocol) : null;
			headers['cf-tls-version'] = cf?.tlsVersion ? String(cf.tlsVersion) : null;
			headers['cf-tls-cipher'] = cf?.tlsCipher ? String(cf.tlsCipher) : null;
			headers['cf-client-trust-score'] = cf?.clientTrustScore ? String(cf.clientTrustScore) : null;

			// Bot detection headers
			headers['cf-bot-score'] = request.headers.get('cf-bot-score') || (cf?.botManagement?.score ? String(cf.botManagement.score) : null);
			headers['cf-verified-bot'] = request.headers.get('cf-verified-bot') || (cf?.botManagement?.verifiedBot ? 'true' : 'false');
			headers['cf-ja3-hash'] = request.headers.get('cf-ja3-hash') || cf?.botManagement?.ja3Hash || null;
			headers['cf-ja4'] = request.headers.get('cf-ja4') || cf?.botManagement?.ja4 || null;

			// Bot detection advanced (Bot Management signals)
			headers['cf-js-detection-passed'] = cf?.botManagement?.jsDetection?.passed ? 'true' : 'false';
			headers['cf-detection-ids'] = cf?.botManagement?.detectionIds ? JSON.stringify(cf.botManagement.detectionIds) : null;
			headers['cf-ja4-signals'] = cf?.botManagement?.ja4Signals ? JSON.stringify(cf.botManagement.ja4Signals) : null;

			// Client-side headers for geo signal detection
			headers['accept-language'] = request.headers.get('accept-language');
			headers['sec-ch-ua-timezone'] = request.headers.get('sec-ch-ua-timezone');
		}

		// Call markov-mail via RPC with enhanced headers
		const result = await env.FRAUD_DETECTOR.validate({
			email,
			consumer: 'FORMINATOR',
			flow: 'REGISTRATION',
			headers, // Pass request.cf metadata
		});

		const emailHash = await hashEmail(email);

		// Convert risk score to 0-100 scale for consistency
		const scaledRiskScore = result.riskScore * 100;

		logger.info({
			event: 'email_fraud_check',
			email_hash: emailHash,
			risk_score: scaledRiskScore, // Log as 0-100 to match decision values
			decision: result.decision,
			pattern: result.signals.patternType,
			markov_detected: result.signals.markovDetected,
			ood_detected: result.signals.oodDetected,
			disposable: result.signals.isDisposableDomain,
		});

		return {
			riskScore: scaledRiskScore,
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
