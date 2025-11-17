/**
 * Risk Score Normalization Module
 *
 * Implements weighted component system to normalize risk scores to 0-100 scale
 *
 * Component Weights (configurable, defaults sum to 100%):
 * - Token Replay: 35% (instant block, highest priority)
 * - Email Fraud: 17% (pattern detection via markov-mail)
 * - Ephemeral ID: 18% (device tracking, core fraud signal)
 * - Validation Frequency: 13% (attempt rate monitoring)
 * - IP Diversity: 9% (proxy rotation detection)
 * - JA4 Session Hopping: 8% (browser hopping detection)
 *
 * All thresholds and weights are configurable via src/lib/config.ts
 * Block Threshold: Default 70/100 (configurable)
 */

import type { FraudDetectionConfig } from './config';

export interface RiskComponent {
	score: number; // 0-100
	weight: number; // 0.0-1.0
	contribution: number; // score * weight
	rawScore?: number; // Original value before normalization
	reason: string; // Human-readable explanation
}

export interface RiskScoreBreakdown {
	tokenReplay: number;
	emailFraud: number;
	ephemeralId: number;
	validationFrequency: number;
	ipDiversity: number;
	ja4SessionHopping: number;
	total: number;
	components: Record<string, RiskComponent>;
}

export function calculateNormalizedRiskScore(
	checks: {
		tokenReplay: boolean;
		emailRiskScore?: number; // 0-100
		ephemeralIdCount: number;
		validationCount: number;
		uniqueIPCount: number;
		ja4RawScore: number; // 0-230
		blockTrigger?: 'token_replay' | 'ephemeral_id_fraud' | 'ja4_session_hopping' | 'ip_diversity' | 'validation_frequency' | 'duplicate_email' | 'turnstile_failed'; // Phase 1.6: Indicates which check triggered a block
	},
	config: FraudDetectionConfig
): RiskScoreBreakdown {
	// Normalize each component
	const components: Record<string, RiskComponent> = {};

	// Token Replay (instant block)
	const tokenWeight = config.risk.weights.tokenReplay;
	components.tokenReplay = {
		score: checks.tokenReplay ? 100 : 0,
		weight: tokenWeight,
		contribution: checks.tokenReplay ? tokenWeight * 100 : 0,
		reason: checks.tokenReplay ? 'Token already used' : 'Token valid',
	};

	// Email Fraud (markov-mail, already 0-100)
	const emailScore = checks.emailRiskScore || 0;
	const emailWeight = config.risk.weights.emailFraud;
	components.emailFraud = {
		score: emailScore,
		weight: emailWeight,
		contribution: emailScore * emailWeight,
		reason:
			emailScore >= config.risk.blockThreshold
				? 'Fraudulent email pattern'
				: emailScore >= config.risk.levels.medium.min
					? 'Suspicious email pattern'
					: 'Email looks legitimate',
	};

	// Ephemeral ID
	const ephemeralScore = normalizeEphemeralIdScore(checks.ephemeralIdCount, config);
	const ephemeralWeight = config.risk.weights.ephemeralId;
	components.ephemeralId = {
		score: ephemeralScore,
		weight: ephemeralWeight,
		contribution: ephemeralScore * ephemeralWeight,
		rawScore: checks.ephemeralIdCount,
		reason:
			checks.ephemeralIdCount >= 3
				? `${checks.ephemeralIdCount} submissions (likely fraud)`
				: checks.ephemeralIdCount === 2
					? '2 submissions (suspicious)'
					: '1 submission (normal)',
	};

	// Validation Frequency
	const validationScore = normalizeValidationScore(checks.validationCount, config);
	const validationWeight = config.risk.weights.validationFrequency;
	components.validationFrequency = {
		score: validationScore,
		weight: validationWeight,
		contribution: validationScore * validationWeight,
		rawScore: checks.validationCount,
		reason:
			checks.validationCount >= config.detection.validationFrequencyBlockThreshold
				? `${checks.validationCount} attempts in 1 hour`
				: checks.validationCount === config.detection.validationFrequencyWarnThreshold
					? '2 attempts (acceptable)'
					: '1 attempt (normal)',
	};

	// IP Diversity
	const ipScore = normalizeIPScore(checks.uniqueIPCount, config);
	const ipWeight = config.risk.weights.ipDiversity;
	components.ipDiversity = {
		score: ipScore,
		weight: ipWeight,
		contribution: ipScore * ipWeight,
		rawScore: checks.uniqueIPCount,
		reason:
			checks.uniqueIPCount >= 3
				? `${checks.uniqueIPCount} IPs (proxy rotation)`
				: checks.uniqueIPCount === config.detection.ipDiversityThreshold
					? '2 IPs (acceptable)'
					: '1 IP (normal)',
	};

	// JA4 Session Hopping
	const ja4Score = normalizeJA4Score(checks.ja4RawScore, config);
	const ja4Weight = config.risk.weights.ja4SessionHopping;
	components.ja4SessionHopping = {
		score: ja4Score,
		weight: ja4Weight,
		contribution: ja4Score * ja4Weight,
		rawScore: checks.ja4RawScore,
		reason:
			checks.ja4RawScore >= 140
				? 'Browser hopping detected'
				: checks.ja4RawScore >= 80
					? 'Suspicious JA4 clustering'
					: 'Normal browser behavior',
	};

	// Calculate total (weighted sum, capped at 100)
	let total = 0;

	if (components.tokenReplay.score === 100) {
		// Token replay is instant block
		total = 100;
	} else if (checks.blockTrigger) {
		// Phase 1.6: When a specific check triggers a block, ensure score reflects severity
		// Calculate base score from all components
		const baseScore = Object.values(components).reduce((sum, c) => sum + c.contribution, 0);

		// Ensure blocked attempts have minimum score of block threshold
		// But boost the triggering component's contribution
		const blockThreshold = config.risk.blockThreshold;
		switch (checks.blockTrigger) {
			case 'ja4_session_hopping':
				// JA4 detected session hopping - critical
				total = Math.max(baseScore, blockThreshold + 5);
				break;
			case 'ephemeral_id_fraud':
				// Multiple submissions detected - high risk
				total = Math.max(baseScore, blockThreshold);
				break;
			case 'ip_diversity':
				// Proxy rotation detected - critical
				total = Math.max(baseScore, blockThreshold + 10);
				break;
			case 'validation_frequency':
				// Too many attempts - high risk
				total = Math.max(baseScore, blockThreshold);
				break;
			case 'duplicate_email':
				// Email already used - medium risk
				total = Math.max(baseScore, blockThreshold - 10);
				break;
			case 'turnstile_failed':
				// Turnstile validation failed - medium-high
				total = Math.max(baseScore, blockThreshold - 5);
				break;
			default:
				total = Math.max(baseScore, blockThreshold);
		}
		total = Math.min(100, Math.round(total * 10) / 10);
	} else {
		// Normal calculation for allowed submissions
		total = Object.values(components).reduce((sum, c) => sum + c.contribution, 0);
		total = Math.min(100, Math.round(total * 10) / 10); // Round to 1 decimal
	}

	return {
		tokenReplay: components.tokenReplay.score,
		emailFraud: components.emailFraud.score,
		ephemeralId: components.ephemeralId.score,
		validationFrequency: components.validationFrequency.score,
		ipDiversity: components.ipDiversity.score,
		ja4SessionHopping: components.ja4SessionHopping.score,
		total,
		components,
	};
}

// Normalize ephemeral ID submission count to 0-100
function normalizeEphemeralIdScore(count: number, config: FraudDetectionConfig): number {
	if (count === 0) return 0;
	if (count === 1) return 10; // Baseline
	const threshold = config.detection.ephemeralIdSubmissionThreshold;
	if (count === threshold) return config.risk.blockThreshold; // At threshold
	return 100; // Above threshold = definite fraud
}

// Normalize validation attempts to 0-100
function normalizeValidationScore(count: number, config: FraudDetectionConfig): number {
	if (count === 1) return 0; // Normal
	if (count === config.detection.validationFrequencyWarnThreshold) return 40; // Acceptable retry
	return 100; // At block threshold = aggressive
}

// Normalize IP diversity to 0-100
function normalizeIPScore(count: number, config: FraudDetectionConfig): number {
	if (count === 1) return 0; // Normal
	if (count === config.detection.ipDiversityThreshold) return 50; // Suspicious
	return 100; // Above threshold = proxy rotation
}

// Normalize JA4 composite score (0-230) to 0-100
// Exported for use in ja4-fraud-detection.ts (Phase 2)
export function normalizeJA4Score(rawScore: number, config: FraudDetectionConfig): number {
	if (rawScore === 0) return 0;
	const blockThreshold = config.risk.blockThreshold;
	if (rawScore <= blockThreshold) return rawScore; // Linear below threshold

	// Map blockThreshold-230 to blockThreshold-100 (diminishing returns)
	return Math.round(blockThreshold + ((rawScore - blockThreshold) / (230 - blockThreshold)) * (100 - blockThreshold));
}
