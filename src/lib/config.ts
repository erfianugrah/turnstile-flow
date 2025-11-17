/**
 * Fraud Detection System Configuration
 *
 * Single source of truth for all thresholds and weights
 * Can be customized via environment variables in wrangler.jsonc
 * Exposed via /api/config endpoint for frontend consumption
 */

import type { Env } from './types';

/**
 * Default configuration values
 * Used when no custom config is provided
 */
const DEFAULT_CONFIG = {
	/**
	 * Risk Score Configuration
	 */
	risk: {
		/** Block threshold - submissions with risk >= this value are blocked */
		blockThreshold: 70,

		/** Risk level ranges */
		levels: {
			low: { min: 0, max: 39 },
			medium: { min: 40, max: 69 },
			high: { min: 70, max: 100 },
		},

		/** Component weights (must sum to 1.0) */
		weights: {
			tokenReplay: 0.35,
			emailFraud: 0.17,
			ephemeralId: 0.18,
			validationFrequency: 0.13,
			ipDiversity: 0.09,
			ja4SessionHopping: 0.08,
		},
	},

	/**
	 * JA4 Signal Thresholds (Cloudflare Bot Management)
	 *
	 * Based on Cloudflare's global intelligence data
	 * See: https://developers.cloudflare.com/bots/additional-configurations/ja3-ja4-fingerprint/signals-intelligence/
	 */
	ja4: {
		/**
		 * IP diversity percentile threshold: 0.95 (95th percentile)
		 *
		 * Rationale:
		 * - High values indicate JA4 used by many IPs globally
		 * - Can mean popular browser OR residential proxy network
		 * - 95th percentile catches outliers while allowing common browsers
		 * - Firefox/Chrome typically in 90-100th percentile (legitimate)
		 */
		ipsQuantileThreshold: 0.95,

		/**
		 * Request volume percentile threshold: 0.99 (99th percentile)
		 *
		 * Rationale:
		 * - Only flags top 1% of request generators
		 * - Reduces false positives for popular browsers
		 * - Bot networks typically in 99th+ percentile
		 * - Combined with other signals for accurate detection
		 */
		reqsQuantileThreshold: 0.99,

		/** Heuristic ratio threshold: 0.8 (80% bot detections) */
		heuristicRatioThreshold: 0.8,

		/** Browser ratio threshold: 0.2 (20% browser-like) */
		browserRatioThreshold: 0.2,

		/** HTTP/2-3 ratio threshold: 0.9 (90% modern protocols) */
		h2h3RatioThreshold: 0.9,

		/** Cache ratio threshold: 0.5 (50% cacheable) */
		cacheRatioThreshold: 0.5,
	},

	/**
	 * Fraud Detection Thresholds
	 */
	detection: {
		/**
		 * Ephemeral ID submission threshold: 2 (24h window)
		 *
		 * Rationale:
		 * - Registration forms should only be submitted ONCE per user
		 * - 2+ submissions in 24h = definite fraud
		 * - Ephemeral IDs last ~7 days, so 24h window is reasonable
		 * - Tested to have 0% false positives for registration flows
		 */
		ephemeralIdSubmissionThreshold: 2,

		/**
		 * Validation frequency thresholds (1h window)
		 *
		 * Rationale:
		 * - Block at 3+: Definite rapid-fire attack
		 * - Warn at 2: Allows one retry (form error, network issue)
		 * - 1h window catches attacks before D1 replication completes
		 * - turnstile_validations table replicates faster than submissions
		 */
		validationFrequencyBlockThreshold: 3,
		validationFrequencyWarnThreshold: 2,

		/**
		 * IP diversity threshold: 2 (24h window)
		 *
		 * Rationale:
		 * - Same device (ephemeral ID) from 2+ IPs = proxy rotation
		 * - Legitimate users rarely change IPs within 24h
		 * - Mobile switching (WiFi ↔ 4G) uses same ephemeral ID
		 * - VPN changes trigger this (acceptable false positive rate)
		 */
		ipDiversityThreshold: 2,

		/**
		 * JA4 Session Hopping Detection Thresholds
		 *
		 * Detects incognito mode / browser hopping attacks
		 * JA4 fingerprint persists even when cookies are cleared
		 */
		ja4Clustering: {
			/**
			 * IP clustering threshold: 2 ephemeral IDs (1h window, same IP/subnet)
			 *
			 * Rationale:
			 * - Catches incognito mode attacks from same location
			 * - IPv6 /64 subnet matching handles privacy extensions (RFC 8981)
			 * - 1h window is short enough to catch rapid attacks
			 * - 2 ephemeral IDs minimum reduces NAT false positives
			 */
			ipClusteringThreshold: 2,

			/**
			 * Rapid global threshold: 3 ephemeral IDs (5min window, any IP)
			 *
			 * Rationale:
			 * - Legitimate users can't create 3 sessions in 5 minutes
			 * - Catches VPN hopping and IPv4↔IPv6 switching attacks
			 * - Very short window (5min) ensures high confidence
			 * - 3 minimum prevents accidental triggers
			 */
			rapidGlobalThreshold: 3,
			rapidGlobalWindowMinutes: 5,

			/**
			 * Extended global threshold: 5 ephemeral IDs (1h window, any IP)
			 *
			 * Rationale:
			 * - Catches slower, distributed attacks
			 * - Higher threshold (5) reduces false positives
			 * - 1h window balances detection vs. legitimate multi-device use
			 * - Tested against corporate WiFi scenarios (no false positives)
			 */
			extendedGlobalThreshold: 5,
			extendedGlobalWindowMinutes: 60,

			/**
			 * Velocity threshold: 10 minutes
			 *
			 * Rationale (Phase 2: Fix false positives):
			 * - Submissions <10 min apart = rapid velocity (suspicious)
			 * - Submissions ≥10 min apart = normal velocity (legitimate)
			 * - Family scenario: Parent at 2:00 PM, child at 2:15 PM = 15 min = ALLOW
			 * - Attack scenario: Bot at 2:00 PM, bot at 2:02 PM = 2 min = BLOCK
			 * - 10 minutes balances security vs. usability
			 * - Combined with other signals (clustering, global anomaly) for accuracy
			 */
			velocityThresholdMinutes: 10,

			/**
			 * Use risk score threshold instead of simple count blocking
			 *
			 * Rationale (Phase 2: Fix false positives):
			 * - false: Block immediately when count threshold reached (old behavior)
			 * - true: Calculate multi-signal risk score, block only if score ≥ blockThreshold (new behavior)
			 * - Reduces false positives for families/offices using same browser
			 * - Maintains security by combining 4 signals: clustering + velocity + global anomaly + bot pattern
			 * - Feature flag for safe rollout and backward compatibility
			 */
			useRiskScoreThreshold: true,
		},
	},

	/**
	 * Progressive Timeout Configuration
	 *
	 * Escalating penalties for repeat offenders
	 * Balances security (deterring attackers) vs. UX (not permanently banning)
	 */
	timeouts: {
		/**
		 * Progressive timeout schedule (in seconds)
		 *
		 * Rationale:
		 * - 1st offense (1h): Might be legitimate user error, quick recovery
		 * - 2nd offense (4h): Suspicious pattern emerging, longer timeout
		 * - 3rd offense (8h): Clear abuse, significant penalty
		 * - 4th offense (12h): Persistent attacker, near-maximum timeout
		 * - 5th+ offense (24h): Maximum timeout respects ephemeral ID lifespan
		 *
		 * Why 24h maximum:
		 * - Ephemeral IDs have ~7 day lifespan
		 * - 24h is long enough to deter attacks
		 * - Not so long that legitimate users are permanently blocked
		 * - Attackers need to wait full day between attempts (impractical)
		 */
		schedule: [
			3600, // 1st offense: 1 hour
			14400, // 2nd offense: 4 hours
			28800, // 3rd offense: 8 hours
			43200, // 4th offense: 12 hours
			86400, // 5th+ offense: 24 hours
		],
		/** Maximum timeout: 24 hours (respects ~7 day ephemeral ID lifespan) */
		maximum: 86400,
	},
} as const;

/**
 * Type-safe config access
 */
export type FraudDetectionConfig = typeof DEFAULT_CONFIG;

/**
 * Get config with optional environment overrides
 *
 * Users can customize any threshold via wrangler.jsonc vars:
 * ```jsonc
 * "vars": {
 *   "FRAUD_CONFIG": {
 *     "risk": { "blockThreshold": 80 },
 *     "ja4": { "ipsQuantileThreshold": 0.98 }
 *   }
 * }
 * ```
 *
 * @param env - Environment bindings (optional for server-side, required for API endpoint)
 * @returns Merged configuration (defaults + environment overrides)
 */
export function getConfig(env?: Env): FraudDetectionConfig {
	if (!env?.FRAUD_CONFIG) {
		return DEFAULT_CONFIG;
	}

	try {
		// Parse FRAUD_CONFIG if it's a string
		const customConfig = typeof env.FRAUD_CONFIG === 'string'
			? JSON.parse(env.FRAUD_CONFIG)
			: env.FRAUD_CONFIG;

		// Deep merge with defaults
		return mergeConfig(DEFAULT_CONFIG, customConfig);
	} catch (error) {
		console.warn('Failed to parse FRAUD_CONFIG, using defaults:', error);
		return DEFAULT_CONFIG;
	}
}

/**
 * Deep merge configuration objects
 * Custom values override defaults at all levels
 */
function mergeConfig(
	defaults: FraudDetectionConfig,
	custom: Partial<FraudDetectionConfig>
): FraudDetectionConfig {
	const merged = { ...defaults };

	if (custom.risk) {
		merged.risk = {
			...defaults.risk,
			...custom.risk,
			levels: {
				...defaults.risk.levels,
				...custom.risk.levels,
			},
			weights: {
				...defaults.risk.weights,
				...custom.risk.weights,
			},
		};
	}

	if (custom.ja4) {
		merged.ja4 = {
			...defaults.ja4,
			...custom.ja4,
		};
	}

	if (custom.detection) {
		merged.detection = {
			...defaults.detection,
			...custom.detection,
			ja4Clustering: {
				...defaults.detection.ja4Clustering,
				...custom.detection.ja4Clustering,
			},
		};
	}

	if (custom.timeouts) {
		merged.timeouts = {
			...defaults.timeouts,
			...custom.timeouts,
		};
	}

	return merged;
}

/**
 * Validate risk score against threshold
 */
export function shouldBlock(riskScore: number, config: FraudDetectionConfig): boolean {
	return riskScore >= config.risk.blockThreshold;
}

/**
 * Get risk level classification
 */
export function getRiskLevel(
	riskScore: number,
	config: FraudDetectionConfig
): 'low' | 'medium' | 'high' {
	const { levels } = config.risk;

	if (riskScore >= levels.high.min) return 'high';
	if (riskScore >= levels.medium.min) return 'medium';
	return 'low';
}
