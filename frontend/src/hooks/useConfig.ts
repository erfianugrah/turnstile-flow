import { useState, useEffect } from 'react';

/**
 * Fraud Detection Configuration (from backend)
 */
export interface FraudDetectionConfig {
	risk: {
		blockThreshold: number;
		levels: {
			low: { min: number; max: number };
			medium: { min: number; max: number };
			high: { min: number; max: number };
		};
		weights: {
			tokenReplay: number;
			emailFraud: number;
			ephemeralId: number;
			validationFrequency: number;
			ipDiversity: number;
			ja4SessionHopping: number;
			ipRateLimit: number;
			headerFingerprint: number;
			tlsAnomaly: number;
			latencyMismatch: number;
		};
	};
	ja4: {
		ipsQuantileThreshold: number;
		reqsQuantileThreshold: number;
		heuristicRatioThreshold: number;
		browserRatioThreshold: number;
		h2h3RatioThreshold: number;
		cacheRatioThreshold: number;
	};
	detection: {
		ephemeralIdSubmissionThreshold: number;
		validationFrequencyBlockThreshold: number;
		validationFrequencyWarnThreshold: number;
		ipDiversityThreshold: number;
		ipRateLimitThreshold: number;
		ipRateLimitWindow: number;
		ja4Clustering: {
			ipClusteringThreshold: number;
			rapidGlobalThreshold: number;
			rapidGlobalWindowMinutes: number;
			extendedGlobalThreshold: number;
			extendedGlobalWindowMinutes: number;
		};
	};
	fingerprint: {
		headerReuse: {
			windowMinutes: number;
			minRequests: number;
			minDistinctIps: number;
			minDistinctJa4: number;
		};
		tlsAnomaly: {
			baselineHours: number;
			minJa4Observations: number;
		};
		latency: {
			mobileRttThresholdMs: number;
			inspectPlatforms: string[];
		};
		datacenterAsns: number[];
	};
	timeouts: {
		schedule: number[];
		maximum: number;
	};
}

/**
 * Default configuration (fallback if API fails)
 * Matches backend defaults
 */
const DEFAULT_CONFIG: FraudDetectionConfig = {
	risk: {
		blockThreshold: 70,
		levels: {
			low: { min: 0, max: 39 },
			medium: { min: 40, max: 69 },
			high: { min: 70, max: 100 },
		},
		weights: {
			tokenReplay: 0.28,
			emailFraud: 0.14,
			ephemeralId: 0.15,
			validationFrequency: 0.10,
			ipDiversity: 0.07,
			ja4SessionHopping: 0.06,
			ipRateLimit: 0.07,
			headerFingerprint: 0.07,
			tlsAnomaly: 0.04,
			latencyMismatch: 0.02,
		},
	},
	ja4: {
		ipsQuantileThreshold: 0.95,
		reqsQuantileThreshold: 0.99,
		heuristicRatioThreshold: 0.8,
		browserRatioThreshold: 0.2,
		h2h3RatioThreshold: 0.9,
		cacheRatioThreshold: 0.5,
	},
	detection: {
		ephemeralIdSubmissionThreshold: 2,
		validationFrequencyBlockThreshold: 3,
		validationFrequencyWarnThreshold: 2,
		ipDiversityThreshold: 2,
		ipRateLimitThreshold: 3,
		ipRateLimitWindow: 3600,
		ja4Clustering: {
			ipClusteringThreshold: 2,
			rapidGlobalThreshold: 3,
			rapidGlobalWindowMinutes: 5,
			extendedGlobalThreshold: 5,
			extendedGlobalWindowMinutes: 60,
		},
	},
	fingerprint: {
		headerReuse: {
			windowMinutes: 60,
			minRequests: 3,
			minDistinctIps: 2,
			minDistinctJa4: 2,
		},
		tlsAnomaly: {
			baselineHours: 24,
			minJa4Observations: 5,
		},
		latency: {
			mobileRttThresholdMs: 6,
			inspectPlatforms: ['Android', 'iOS'],
		},
		datacenterAsns: [16509, 14618, 8075, 15169, 13335, 9009, 61317, 49544],
	},
	timeouts: {
		schedule: [3600, 14400, 28800, 43200, 86400],
		maximum: 86400,
	},
};

/**
 * React hook to fetch fraud detection configuration
 * Returns config with loading and error states
 */
export function useConfig() {
	const [config, setConfig] = useState<FraudDetectionConfig>(DEFAULT_CONFIG);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		async function fetchConfig() {
			try {
				const response = await fetch('/api/config');
				if (!response.ok) {
					throw new Error(`HTTP ${response.status}: ${response.statusText}`);
				}

				const json = await response.json() as { success: boolean; data?: FraudDetectionConfig };
				if (json.success && json.data) {
					setConfig(json.data);
					setError(null);
				} else {
					throw new Error('Invalid config response format');
				}
			} catch (err) {
				console.error('Failed to fetch config, using defaults:', err);
				setError(err instanceof Error ? err.message : 'Unknown error');
				// Keep using DEFAULT_CONFIG
			} finally {
				setLoading(false);
			}
		}

		fetchConfig();
	}, []);

	return { config, loading, error };
}

/**
 * Helper to get risk level classification
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

/**
 * Helper to check if score should block
 */
export function shouldBlock(
	riskScore: number,
	config: FraudDetectionConfig
): boolean {
	return riskScore >= config.risk.blockThreshold;
}
