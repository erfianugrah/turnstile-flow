/**
 * Risk Score Normalization Module
 *
 * Implements weighted component system to normalize risk scores to 0-100 scale
 *
 * Component Weights (normalized to 100%):
 * - Token Replay: 35% (instant block, highest priority)
 * - Email Fraud: 17% (pattern detection via markov-mail)
 * - Ephemeral ID: 18% (device tracking, core fraud signal)
 * - Validation Frequency: 13% (attempt rate monitoring)
 * - IP Diversity: 9% (proxy rotation detection)
 * - JA4 Session Hopping: 8% (browser hopping detection)
 *
 * Total: 100% (proportionally normalized from previous 115%)
 *
 * Block Threshold: 70/100
 */

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

export function calculateNormalizedRiskScore(checks: {
	tokenReplay: boolean;
	emailRiskScore?: number; // 0-100
	ephemeralIdCount: number;
	validationCount: number;
	uniqueIPCount: number;
	ja4RawScore: number; // 0-230
	blockTrigger?: 'token_replay' | 'ephemeral_id_fraud' | 'ja4_session_hopping' | 'ip_diversity' | 'validation_frequency' | 'duplicate_email' | 'turnstile_failed'; // Phase 1.6: Indicates which check triggered a block
}): RiskScoreBreakdown {
	// Normalize each component
	const components: Record<string, RiskComponent> = {};

	// Token Replay (instant block)
	components.tokenReplay = {
		score: checks.tokenReplay ? 100 : 0,
		weight: 0.35,
		contribution: checks.tokenReplay ? 35 : 0,
		reason: checks.tokenReplay ? 'Token already used' : 'Token valid',
	};

	// Email Fraud (markov-mail, already 0-100)
	const emailScore = checks.emailRiskScore || 0;
	components.emailFraud = {
		score: emailScore,
		weight: 0.17,
		contribution: emailScore * 0.17,
		reason:
			emailScore >= 70
				? 'Fraudulent email pattern'
				: emailScore >= 40
					? 'Suspicious email pattern'
					: 'Email looks legitimate',
	};

	// Ephemeral ID
	const ephemeralScore = normalizeEphemeralIdScore(checks.ephemeralIdCount);
	components.ephemeralId = {
		score: ephemeralScore,
		weight: 0.18,
		contribution: ephemeralScore * 0.18,
		rawScore: checks.ephemeralIdCount,
		reason:
			checks.ephemeralIdCount >= 3
				? `${checks.ephemeralIdCount} submissions (likely fraud)`
				: checks.ephemeralIdCount === 2
					? '2 submissions (suspicious)'
					: '1 submission (normal)',
	};

	// Validation Frequency
	const validationScore = normalizeValidationScore(checks.validationCount);
	components.validationFrequency = {
		score: validationScore,
		weight: 0.13,
		contribution: validationScore * 0.13,
		rawScore: checks.validationCount,
		reason:
			checks.validationCount >= 3
				? `${checks.validationCount} attempts in 1 hour`
				: checks.validationCount === 2
					? '2 attempts (acceptable)'
					: '1 attempt (normal)',
	};

	// IP Diversity
	const ipScore = normalizeIPScore(checks.uniqueIPCount);
	components.ipDiversity = {
		score: ipScore,
		weight: 0.09,
		contribution: ipScore * 0.09,
		rawScore: checks.uniqueIPCount,
		reason:
			checks.uniqueIPCount >= 3
				? `${checks.uniqueIPCount} IPs (proxy rotation)`
				: checks.uniqueIPCount === 2
					? '2 IPs (acceptable)'
					: '1 IP (normal)',
	};

	// JA4 Session Hopping
	const ja4Score = normalizeJA4Score(checks.ja4RawScore);
	components.ja4SessionHopping = {
		score: ja4Score,
		weight: 0.08,
		contribution: ja4Score * 0.08,
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

		// Ensure blocked attempts have minimum score of 70 (block threshold)
		// But boost the triggering component's contribution
		switch (checks.blockTrigger) {
			case 'ja4_session_hopping':
				// JA4 detected session hopping - critical
				total = Math.max(baseScore, 75);
				break;
			case 'ephemeral_id_fraud':
				// Multiple submissions detected - high risk
				total = Math.max(baseScore, 70);
				break;
			case 'ip_diversity':
				// Proxy rotation detected - critical
				total = Math.max(baseScore, 80);
				break;
			case 'validation_frequency':
				// Too many attempts - high risk
				total = Math.max(baseScore, 70);
				break;
			case 'duplicate_email':
				// Email already used - medium risk
				total = Math.max(baseScore, 60);
				break;
			case 'turnstile_failed':
				// Turnstile validation failed - medium-high
				total = Math.max(baseScore, 65);
				break;
			default:
				total = Math.max(baseScore, 70);
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

// Normalize ephemeral ID submission count (0-3+) to 0-100
function normalizeEphemeralIdScore(count: number): number {
	if (count === 0) return 0;
	if (count === 1) return 10; // Baseline
	if (count === 2) return 70; // Warn threshold
	return 100; // 3+ = definite fraud
}

// Normalize validation attempts (1-3+) to 0-100
function normalizeValidationScore(count: number): number {
	if (count === 1) return 0; // Normal
	if (count === 2) return 40; // Acceptable retry
	return 100; // 3+ = aggressive
}

// Normalize IP diversity (1-3+) to 0-100
function normalizeIPScore(count: number): number {
	if (count === 1) return 0; // Normal
	if (count === 2) return 50; // Suspicious
	return 100; // 3+ = proxy rotation
}

// Normalize JA4 composite score (0-230) to 0-100
function normalizeJA4Score(rawScore: number): number {
	if (rawScore === 0) return 0;
	if (rawScore <= 70) return rawScore; // Linear below threshold

	// Map 70-230 to 70-100 (diminishing returns)
	return Math.round(70 + ((rawScore - 70) / (230 - 70)) * 30);
}
