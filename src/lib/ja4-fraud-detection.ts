/**
 * JA4-Based Fraud Detection (Layer 4 - Session Hopping Detection)
 *
 * Detects attackers who bypass ephemeral ID fraud detection by:
 * - Opening incognito/private browsing windows
 * - Clearing cookies between submissions
 * - Using multiple browser instances
 *
 * Detection Strategy:
 * - Signal 1: JA4 clustering (same IP + same JA4 + multiple ephemeral IDs) → +80 points
 * - Signal 2: Rapid velocity (<60 min between submissions) → +60 points
 * - Signal 3: Global anomaly (high global distribution + local clustering) → +50/+40 points
 *
 * Block threshold: 70 points
 *
 * Key Principle: Only use hard-to-spoof signals (JA4, ephemeral ID, CF global data, timing)
 */

import logger from './logger';
import { addToBlacklist } from './fraud-prevalidation';
import { calculateProgressiveTimeout } from './turnstile';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * JA4 Signals from Cloudflare (request.cf.ja4Signals)
 * Global intelligence about this JA4 fingerprint across all of Cloudflare's network
 */
export interface JA4Signals {
	/** Quantile rank by unique IP count (0-1, higher = more IPs globally) */
	ips_quantile_1h?: number;
	/** Rank by unique IP count (lower number = more IPs) */
	ips_rank_1h?: number;
	/** Quantile rank by request volume (0-1, higher = more requests globally) */
	reqs_quantile_1h?: number;
	/** Rank by request volume (lower number = more requests) */
	reqs_rank_1h?: number;
	/** Ratio flagged by heuristics (0-1, higher = more bot-like) */
	heuristic_ratio_1h?: number;
	/** Ratio of browser-based requests (0-1, higher = more legitimate) */
	browser_ratio_1h?: number;
	/** Ratio of HTTP/2 or HTTP/3 requests (0-1, higher = modern browser) */
	h2h3_ratio_1h?: number;
	/** Ratio of cacheable responses (0-1) */
	cache_ratio_1h?: number;
	/** Rank by user agent diversity (lower = more diverse) */
	uas_rank_1h?: number;
	/** Rank by path diversity (lower = more diverse) */
	paths_rank_1h?: number;
}

/**
 * Result of clustering analysis for a specific JA4 fingerprint
 */
export interface ClusteringAnalysis {
	/** The JA4 fingerprint being analyzed */
	ja4: string;
	/** Number of different ephemeral IDs using this JA4 from same IP */
	ephemeralCount: number;
	/** Total number of submissions */
	submissionCount: number;
	/** Time span between first and last submission (in minutes) */
	timeSpanMinutes: number;
	/** Average JA4 signals from Cloudflare (null if no signals available) */
	ja4SignalsAvg: JA4Signals | null;
}

/**
 * Result of velocity analysis
 */
export interface VelocityAnalysis {
	/** Whether submissions are happening rapidly (<60 min) */
	isRapid: boolean;
	/** Time span in minutes */
	timeSpanMinutes: number;
}

/**
 * Result of global signal analysis
 */
export interface SignalAnalysis {
	/** JA4 has high global IP distribution (ips_quantile > 0.95) */
	highGlobalDistribution: boolean;
	/** JA4 has high global request volume (reqs_quantile > 0.99) */
	highRequestVolume: boolean;
	/** Global IPs quantile value */
	ipsQuantile: number | null;
	/** Global requests quantile value */
	reqsQuantile: number | null;
}

/**
 * Result of fraud check
 */
export interface FraudCheckResult {
	/** Whether the request should be allowed */
	allowed: boolean;
	/** Reason for blocking (if not allowed) */
	reason?: string;
	/** Composite risk score (0-100+) - will be normalized by scoring.ts */
	riskScore: number;
	/** Raw JA4 score (0-230) for normalization */
	rawScore?: number;
	/** List of warnings/detections */
	warnings: string[];
	/** Seconds until user can retry (if blocked) */
	retryAfter?: number;
	/** ISO timestamp when block expires (if blocked) */
	expiresAt?: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Convert JavaScript Date to SQLite-compatible datetime string
 * SQLite stores DATETIME as "YYYY-MM-DD HH:MM:SS" (space separator)
 */
function toSQLiteDateTime(date: Date): string {
	return date
		.toISOString()
		.replace('T', ' ')
		.replace(/\.\d{3}Z$/, '');
}

/**
 * Parse JA4 signals from JSON string
 * @param ja4SignalsJson JSON string from database
 * @returns Parsed JA4 signals or null if parsing fails
 */
export function parseJA4Signals(ja4SignalsJson: string | null): JA4Signals | null {
	if (!ja4SignalsJson) {
		return null;
	}

	try {
		const parsed = JSON.parse(ja4SignalsJson);
		return {
			ips_quantile_1h: parsed.ips_quantile_1h ?? undefined,
			ips_rank_1h: parsed.ips_rank_1h ?? undefined,
			reqs_quantile_1h: parsed.reqs_quantile_1h ?? undefined,
			reqs_rank_1h: parsed.reqs_rank_1h ?? undefined,
			heuristic_ratio_1h: parsed.heuristic_ratio_1h ?? undefined,
			browser_ratio_1h: parsed.browser_ratio_1h ?? undefined,
			h2h3_ratio_1h: parsed.h2h3_ratio_1h ?? undefined,
			cache_ratio_1h: parsed.cache_ratio_1h ?? undefined,
			uas_rank_1h: parsed.uas_rank_1h ?? undefined,
			paths_rank_1h: parsed.paths_rank_1h ?? undefined,
		};
	} catch (error) {
		logger.warn({ error, ja4SignalsJson }, 'Failed to parse JA4 signals');
		return null;
	}
}

/**
 * Get offense count for an IP address (how many times blocked in last 24h)
 * Note: This is different from the ephemeral ID offense count in turnstile.ts
 * @param remoteIp IP address to check
 * @param db D1 database instance
 * @returns Number of offenses + 1 for current offense
 */
async function getOffenseCount(remoteIp: string, db: D1Database): Promise<number> {
	const oneDayAgo = toSQLiteDateTime(new Date(Date.now() - 24 * 60 * 60 * 1000));

	const result = await db
		.prepare(
			`SELECT COUNT(*) as count
			 FROM fraud_blacklist
			 WHERE ip_address = ?
			 AND blocked_at > ?`
		)
		.bind(remoteIp, oneDayAgo)
		.first<{ count: number }>();

	return (result?.count || 0) + 1; // +1 for current offense
}

// ============================================================================
// Signal Analysis Functions
// ============================================================================

/**
 * Analyze JA4 clustering patterns
 * Signal 1: Detects same JA4 from same IP with multiple ephemeral IDs
 *
 * @param remoteIp IP address to analyze
 * @param ja4 JA4 fingerprint to analyze
 * @param db D1 database instance
 * @returns Clustering analysis result
 */
async function analyzeJA4Clustering(
	remoteIp: string,
	ja4: string,
	db: D1Database
): Promise<ClusteringAnalysis | null> {
	const oneHourAgo = toSQLiteDateTime(new Date(Date.now() - 60 * 60 * 1000));

	try {
		const result = await db
			.prepare(
				`SELECT
					ja4,
					COUNT(DISTINCT ephemeral_id) as ephemeral_count,
					COUNT(*) as submission_count,
					(julianday(MAX(created_at)) - julianday(MIN(created_at))) * 24 * 60 as time_span_minutes,
					AVG(CAST(json_extract(ja4_signals, '$.ips_quantile_1h') AS REAL)) as avg_ips_quantile,
					AVG(CAST(json_extract(ja4_signals, '$.reqs_quantile_1h') AS REAL)) as avg_reqs_quantile,
					AVG(CAST(json_extract(ja4_signals, '$.browser_ratio_1h') AS REAL)) as avg_browser_ratio,
					AVG(CAST(json_extract(ja4_signals, '$.h2h3_ratio_1h') AS REAL)) as avg_h2h3_ratio
				FROM submissions
				WHERE remote_ip = ?
				AND ja4 = ?
				AND created_at > ?
				GROUP BY ja4`
			)
			.bind(remoteIp, ja4, oneHourAgo)
			.first<{
				ja4: string;
				ephemeral_count: number;
				submission_count: number;
				time_span_minutes: number;
				avg_ips_quantile: number | null;
				avg_reqs_quantile: number | null;
				avg_browser_ratio: number | null;
				avg_h2h3_ratio: number | null;
			}>();

		if (!result) {
			// No previous submissions with this JA4 from this IP in last hour
			return null;
		}

		// Add +1 to account for current submission attempt
		const ephemeralCount = result.ephemeral_count + 1;

		return {
			ja4: result.ja4,
			ephemeralCount,
			submissionCount: result.submission_count + 1,
			timeSpanMinutes: result.time_span_minutes,
			ja4SignalsAvg: {
				ips_quantile_1h: result.avg_ips_quantile ?? undefined,
				reqs_quantile_1h: result.avg_reqs_quantile ?? undefined,
				browser_ratio_1h: result.avg_browser_ratio ?? undefined,
				h2h3_ratio_1h: result.avg_h2h3_ratio ?? undefined,
			},
		};
	} catch (error) {
		logger.error({ error, remoteIp, ja4 }, 'Error analyzing JA4 clustering');
		throw error;
	}
}

/**
 * Analyze velocity patterns
 * Signal 2: Detects rapid submissions (<60 minutes)
 *
 * @param clustering Clustering analysis result
 * @returns Velocity analysis result
 */
function analyzeVelocity(clustering: ClusteringAnalysis): VelocityAnalysis {
	return {
		isRapid: clustering.timeSpanMinutes < 60,
		timeSpanMinutes: clustering.timeSpanMinutes,
	};
}

/**
 * Compare local behavior against global signals
 * Signal 3: Detects anomalies (globally distributed JA4 clustering locally)
 *
 * @param clustering Clustering analysis result
 * @returns Signal analysis result
 */
function compareGlobalSignals(clustering: ClusteringAnalysis): SignalAnalysis {
	const ipsQuantile = clustering.ja4SignalsAvg?.ips_quantile_1h ?? null;
	const reqsQuantile = clustering.ja4SignalsAvg?.reqs_quantile_1h ?? null;

	return {
		highGlobalDistribution: ipsQuantile !== null && ipsQuantile > 0.95,
		highRequestVolume: reqsQuantile !== null && reqsQuantile > 0.99,
		ipsQuantile,
		reqsQuantile,
	};
}

/**
 * Calculate composite risk score from all signals
 *
 * @param clustering Clustering analysis
 * @param velocity Velocity analysis
 * @param signals Global signal analysis
 * @returns Risk score (0-100+)
 */
function calculateCompositeRiskScore(
	clustering: ClusteringAnalysis,
	velocity: VelocityAnalysis,
	signals: SignalAnalysis
): number {
	let score = 0;

	// Signal 1: JA4 clustering (primary signal)
	// Same JA4 with 2+ different ephemeral IDs = session multiplication
	if (clustering.ephemeralCount >= 2) {
		score += 80;
	}

	// Signal 2: Rapid velocity
	// Multiple submissions in <60 minutes = rapid-fire testing
	if (velocity.isRapid && clustering.ephemeralCount >= 2) {
		score += 60;
	}

	// Signal 3a: Global anomaly (high IP distribution + local clustering)
	// Globally distributed JA4 shouldn't cluster at one IP
	if (signals.highGlobalDistribution && clustering.ephemeralCount >= 2) {
		score += 50;
	}

	// Signal 3b: Bot pattern (high request volume + local clustering)
	// High-volume JA4 with local clustering suggests bot/scraper
	if (signals.highRequestVolume && clustering.ephemeralCount >= 2) {
		score += 40;
	}

	return score;
}

/**
 * Generate human-readable warnings from analysis
 *
 * @param clustering Clustering analysis
 * @param velocity Velocity analysis
 * @param signals Global signal analysis
 * @returns Array of warning messages
 */
function generateWarnings(
	clustering: ClusteringAnalysis,
	velocity: VelocityAnalysis,
	signals: SignalAnalysis
): string[] {
	const warnings: string[] = [];

	// Clustering warning
	if (clustering.ephemeralCount >= 2) {
		warnings.push(
			`JA4 clustering detected: ${clustering.ephemeralCount} different sessions from same IP with same browser fingerprint`
		);
	}

	// Velocity warning
	if (velocity.isRapid && clustering.ephemeralCount >= 2) {
		warnings.push(
			`Rapid velocity: ${clustering.ephemeralCount} sessions in ${Math.round(velocity.timeSpanMinutes)} minutes`
		);
	}

	// Global anomaly warnings
	if (signals.highGlobalDistribution && clustering.ephemeralCount >= 2) {
		warnings.push(
			`Global anomaly: JA4 globally distributed (top ${((1 - (signals.ipsQuantile || 0)) * 100).toFixed(2)}%) but clustering locally`
		);
	}

	if (signals.highRequestVolume && clustering.ephemeralCount >= 2) {
		warnings.push(
			`Bot pattern: High-volume JA4 (top ${((1 - (signals.reqsQuantile || 0)) * 100).toFixed(2)}%) with local clustering`
		);
	}

	return warnings;
}

// ============================================================================
// Main Detection Function
// ============================================================================

/**
 * Check for JA4-based fraud patterns (Layer 4 - Session Hopping Detection)
 *
 * Detects attackers who:
 * - Use incognito mode to generate new ephemeral IDs
 * - Clear cookies between submissions
 * - Open multiple browser windows/instances
 *
 * @param remoteIp IP address of the request
 * @param ja4 JA4 fingerprint from request.cf.ja4
 * @param db D1 database instance
 * @returns Fraud check result
 */
export async function checkJA4FraudPatterns(
	remoteIp: string,
	ja4: string | null,
	db: D1Database
): Promise<FraudCheckResult> {
	// JA4 is required for this detection
	if (!ja4) {
		logger.warn({ remoteIp }, 'JA4 not available - skipping JA4 fraud detection');
		return {
			allowed: true,
			riskScore: 0,
			rawScore: 0,
			warnings: ['JA4 not available'],
		};
	}

	logger.info({ remoteIp, ja4 }, 'JA4 fraud detection started');

	try {
		// Step 1: Analyze JA4 clustering
		const clustering = await analyzeJA4Clustering(remoteIp, ja4, db);

		if (!clustering) {
			// First submission with this JA4 from this IP
			logger.info({ remoteIp, ja4 }, 'First submission with this JA4 - allowing');
			return {
				allowed: true,
				riskScore: 0,
				rawScore: 0,
				warnings: [],
			};
		}

		// Step 2: Analyze velocity
		const velocity = analyzeVelocity(clustering);

		// Step 3: Compare against global signals
		const signals = compareGlobalSignals(clustering);

		// Step 4: Calculate raw risk score (0-230)
		const rawScore = calculateCompositeRiskScore(clustering, velocity, signals);
		const riskScore = rawScore; // Keep for backward compatibility

		// Step 5: Generate warnings
		const warnings = generateWarnings(clustering, velocity, signals);

		// Step 6: Determine if should block
		const BLOCK_THRESHOLD = 70;
		const allowed = riskScore < BLOCK_THRESHOLD;

		if (!allowed) {
			// Calculate progressive timeout
			const offenseCount = await getOffenseCount(remoteIp, db);
			const expiresIn = calculateProgressiveTimeout(offenseCount);
			const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

			// Add to blacklist
			await addToBlacklist(db, {
				ja4,
				ipAddress: remoteIp,
				blockReason: `JA4 session hopping: ${clustering.ephemeralCount} sessions in ${Math.round(clustering.timeSpanMinutes)} min`,
				confidence: 'high',
				expiresIn,
				submissionCount: clustering.ephemeralCount,
				detectionMetadata: {
					detection_type: 'ja4_session_hopping',
					risk_score: riskScore,
					warnings,
					ephemeral_count: clustering.ephemeralCount,
					time_span_minutes: clustering.timeSpanMinutes,
					global_ips_quantile: signals.ipsQuantile,
					global_reqs_quantile: signals.reqsQuantile,
					offense_count: offenseCount,
					timeout_seconds: expiresIn,
					detected_at: new Date().toISOString(),
				},
			});

			logger.warn(
				{
					detection_type: 'ja4_fraud',
					ja4,
					remote_ip: remoteIp,
					risk_score: riskScore,
					warnings,
					blocked: true,
					retry_after: expiresIn,
					offense_count: offenseCount,
				},
				'JA4 fraud block triggered'
			);

			return {
				allowed: false,
				reason: 'You have made too many submission attempts',
				riskScore,
				rawScore,
				warnings,
				retryAfter: expiresIn,
				expiresAt,
			};
		}

		// Allow but log warnings
		logger.info(
			{
				detection_type: 'ja4_fraud',
				ja4,
				remote_ip: remoteIp,
				risk_score: riskScore,
				raw_score: rawScore,
				warnings,
				blocked: false,
			},
			'JA4 fraud check passed'
		);

		return {
			allowed: true,
			riskScore,
			rawScore,
			warnings,
		};
	} catch (error) {
		logger.error({ error, remoteIp, ja4 }, 'Error during JA4 fraud check');
		// Fail open: if fraud check fails, allow but log error
		return {
			allowed: true,
			riskScore: 0,
			rawScore: 0,
			warnings: ['JA4 fraud check error - failing open'],
		};
	}
}
