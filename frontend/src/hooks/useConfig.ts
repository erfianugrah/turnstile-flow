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
		ja4Clustering: {
			ipClusteringThreshold: number;
			rapidGlobalThreshold: number;
			rapidGlobalWindowMinutes: number;
			extendedGlobalThreshold: number;
			extendedGlobalWindowMinutes: number;
		};
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
			tokenReplay: 0.35,
			emailFraud: 0.17,
			ephemeralId: 0.18,
			validationFrequency: 0.13,
			ipDiversity: 0.09,
			ja4SessionHopping: 0.08,
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
		ja4Clustering: {
			ipClusteringThreshold: 2,
			rapidGlobalThreshold: 3,
			rapidGlobalWindowMinutes: 5,
			extendedGlobalThreshold: 5,
			extendedGlobalWindowMinutes: 60,
		},
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

				const json = await response.json();
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
