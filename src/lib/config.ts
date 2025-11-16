/**
 * Fraud Detection System Configuration
 *
 * Single source of truth for all thresholds and weights
 * Exposed via /api/config endpoint for frontend consumption
 */

export const FRAUD_DETECTION_CONFIG = {
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
	 */
	ja4: {
		/** IP diversity percentile threshold (high indicates distributed traffic) */
		ipsQuantileThreshold: 0.95,

		/** Request volume percentile threshold (high indicates high activity) */
		reqsQuantileThreshold: 0.99,

		/** Heuristic ratio threshold (high indicates bot-like behavior) */
		heuristicRatioThreshold: 0.8,

		/** Browser ratio threshold (low indicates automation) */
		browserRatioThreshold: 0.2,

		/** HTTP/2-3 ratio threshold (unusual values indicate custom clients) */
		h2h3RatioThreshold: 0.9,

		/** Cache ratio threshold (very low indicates scraping) */
		cacheRatioThreshold: 0.5,
	},

	/**
	 * Fraud Detection Thresholds
	 */
	detection: {
		/** Ephemeral ID - submission count threshold (24h window) */
		ephemeralIdSubmissionThreshold: 2,

		/** Validation frequency threshold (1h window) */
		validationFrequencyBlockThreshold: 3,
		validationFrequencyWarnThreshold: 2,

		/** IP diversity threshold (24h window) */
		ipDiversityThreshold: 2,

		/** JA4 clustering thresholds */
		ja4Clustering: {
			/** IP clustering - ephemeral ID threshold (1h window, same IP/subnet) */
			ipClusteringThreshold: 2,

			/** Rapid global - ephemeral ID threshold (5min window, any IP) */
			rapidGlobalThreshold: 3,
			rapidGlobalWindowMinutes: 5,

			/** Extended global - ephemeral ID threshold (1h window, any IP) */
			extendedGlobalThreshold: 5,
			extendedGlobalWindowMinutes: 60,
		},
	},

	/**
	 * Progressive Timeout Configuration
	 */
	timeouts: {
		/** Progressive timeout schedule (in seconds) */
		schedule: [
			3600, // 1st offense: 1 hour
			14400, // 2nd offense: 4 hours
			28800, // 3rd offense: 8 hours
			43200, // 4th offense: 12 hours
			86400, // 5th+ offense: 24 hours
		],
		/** Maximum timeout (24 hours) */
		maximum: 86400,
	},
} as const;

/**
 * Type-safe config access
 */
export type FraudDetectionConfig = typeof FRAUD_DETECTION_CONFIG;

/**
 * Get config (for API endpoint)
 */
export function getConfig(): FraudDetectionConfig {
	return FRAUD_DETECTION_CONFIG;
}

/**
 * Validate risk score against threshold
 */
export function shouldBlock(riskScore: number): boolean {
	return riskScore >= FRAUD_DETECTION_CONFIG.risk.blockThreshold;
}

/**
 * Get risk level classification
 */
export function getRiskLevel(
	riskScore: number
): 'low' | 'medium' | 'high' {
	const { levels } = FRAUD_DETECTION_CONFIG.risk;

	if (riskScore >= levels.high.min) return 'high';
	if (riskScore >= levels.medium.min) return 'medium';
	return 'low';
}
