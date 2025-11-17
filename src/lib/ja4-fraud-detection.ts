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
 * All thresholds are configurable via src/lib/config.ts
 *
 * Key Principle: Only use hard-to-spoof signals (JA4, ephemeral ID, CF global data, timing)
 */

import logger from './logger';
import { addToBlacklist } from './fraud-prevalidation';
import { calculateProgressiveTimeout } from './turnstile';
import type { FraudDetectionConfig } from './config';
import { normalizeJA4Score } from './scoring';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * JA4 Signals from Cloudflare (request.cf.botManagement.ja4Signals)
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
	/** Detection type (Phase 1.8: layer-specific for JA4) */
	detectionType?: string;
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
 * Check if two IPs are in the same network
 * - IPv4: Exact match
 * - IPv6: /64 subnet match (tolerates privacy extensions per RFC 8981)
 *
 * @param ip1 First IP address
 * @param ip2 Second IP address
 * @returns True if IPs are in the same network
 */
function isSameNetwork(ip1: string, ip2: string): boolean {
	// IPv4 exact match
	if (ip1.indexOf(':') === -1 && ip2.indexOf(':') === -1) {
		return ip1 === ip2;
	}

	// IPv6 /64 subnet match
	// RFC 8981: Operating systems rotate interface identifier (last 64 bits) for privacy
	// Network prefix stays the same (first 64 bits = 4 groups of 16 bits)
	if (ip1.indexOf(':') !== -1 && ip2.indexOf(':') !== -1) {
		// Extract first 64 bits (4 groups)
		const subnet1 = ip1.split(':').slice(0, 4).join(':');
		const subnet2 = ip2.split(':').slice(0, 4).join(':');
		return subnet1 === subnet2;
	}

	// Mixed IPv4/IPv6 - no match
	return false;
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
 * Signal 1: Detects same JA4 from same IP/subnet with multiple ephemeral IDs
 *
 * Phase 1.7: Now handles IPv6 /64 subnet matching for privacy extensions (RFC 8981)
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
		// Query all submissions with this JA4 in last hour
		// Phase 1.7: Remove remote_ip filter - we'll filter by subnet in JavaScript
		const results = await db
			.prepare(
				`SELECT
					ephemeral_id,
					remote_ip,
					created_at,
					ja4_signals
				FROM submissions
				WHERE ja4 = ?
				AND created_at > ?
				ORDER BY created_at ASC`
			)
			.bind(ja4, oneHourAgo)
			.all<{
				ephemeral_id: string;
				remote_ip: string;
				created_at: string;
				ja4_signals: string | null;
			}>();

		if (!results.results || results.results.length === 0) {
			// No previous submissions with this JA4 in last hour
			return null;
		}

		// Filter to same IP/subnet only
		const sameNetwork = results.results.filter(r => isSameNetwork(r.remote_ip, remoteIp));

		if (sameNetwork.length === 0) {
			// No clustering at this IP/subnet
			return null;
		}

		// Count unique ephemeral IDs from same network
		const uniqueEphemeralIds = new Set(sameNetwork.map(r => r.ephemeral_id));
		const ephemeralCount = uniqueEphemeralIds.size + 1; // +1 for current submission

		// Calculate time span
		const timestamps = sameNetwork.map(r => new Date(r.created_at.replace(' ', 'T') + 'Z').getTime());
		const minTime = Math.min(...timestamps);
		const maxTime = Math.max(...timestamps);
		const timeSpanMinutes = (maxTime - minTime) / (60 * 1000);

		// Parse JA4 signals from first result (they should be consistent)
		const ja4SignalsAvg = parseJA4Signals(sameNetwork[0].ja4_signals);

		return {
			ja4,
			ephemeralCount,
			submissionCount: sameNetwork.length + 1, // +1 for current
			timeSpanMinutes,
			ja4SignalsAvg,
		};
	} catch (error) {
		logger.error({ error, remoteIp, ja4 }, 'Error analyzing JA4 clustering');
		throw error;
	}
}

/**
 * Analyze JA4 clustering patterns globally (no IP filtering)
 * Phase 1.8: Detects network-switching attacks where attacker uses same JA4 across different IPs
 *
 * @param ja4 JA4 fingerprint to analyze
 * @param db D1 database instance
 * @param timeWindowMinutes Time window to analyze (5 or 60 minutes)
 * @returns Global clustering analysis or null
 */
async function analyzeJA4GlobalClustering(
	ja4: string,
	db: D1Database,
	timeWindowMinutes: number
): Promise<ClusteringAnalysis | null> {
	const timeAgo = toSQLiteDateTime(
		new Date(Date.now() - timeWindowMinutes * 60 * 1000)
	);

	try {
		// Query all submissions with this JA4 in time window
		// NO IP filtering - we want to catch network switching
		const results = await db
			.prepare(
				`SELECT
					ephemeral_id,
					remote_ip,
					created_at,
					ja4_signals
				FROM submissions
				WHERE ja4 = ?
				AND created_at > ?
				ORDER BY created_at ASC`
			)
			.bind(ja4, timeAgo)
			.all<{
				ephemeral_id: string;
				remote_ip: string;
				created_at: string;
				ja4_signals: string | null;
			}>();

		if (!results.results || results.results.length === 0) {
			return null;
		}

		// Count unique ephemeral IDs globally (across all IPs)
		const uniqueEphemeralIds = new Set(results.results.map(r => r.ephemeral_id));
		const ephemeralCount = uniqueEphemeralIds.size + 1; // +1 for current

		// Calculate time span
		const timestamps = results.results.map(
			r => new Date(r.created_at.replace(' ', 'T') + 'Z').getTime()
		);
		const minTime = Math.min(...timestamps);
		const maxTime = Math.max(...timestamps);
		const timeSpanMinutes = (maxTime - minTime) / (60 * 1000);

		// Parse JA4 signals
		const ja4SignalsAvg = parseJA4Signals(results.results[0].ja4_signals);

		return {
			ja4,
			ephemeralCount,
			submissionCount: results.results.length + 1,
			timeSpanMinutes,
			ja4SignalsAvg,
		};
	} catch (error) {
		logger.error({ error, ja4, timeWindowMinutes }, 'Error analyzing JA4 global clustering');
		throw error;
	}
}

/**
 * Analyze velocity patterns
 * Signal 2: Detects rapid submissions
 *
 * Phase 2: Updated to use configurable threshold (default 10 minutes)
 *
 * @param clustering Clustering analysis result
 * @param config Fraud detection configuration
 * @returns Velocity analysis result
 */
function analyzeVelocity(clustering: ClusteringAnalysis, config: FraudDetectionConfig): VelocityAnalysis {
	return {
		isRapid: clustering.timeSpanMinutes < config.detection.ja4Clustering.velocityThresholdMinutes,
		timeSpanMinutes: clustering.timeSpanMinutes,
	};
}

/**
 * Compare local behavior against global signals
 * Signal 3: Detects anomalies (globally distributed JA4 clustering locally)
 *
 * @param clustering Clustering analysis result
 * @param config Fraud detection configuration
 * @returns Signal analysis result
 */
function compareGlobalSignals(clustering: ClusteringAnalysis, config: FraudDetectionConfig): SignalAnalysis {
	const ipsQuantile = clustering.ja4SignalsAvg?.ips_quantile_1h ?? null;
	const reqsQuantile = clustering.ja4SignalsAvg?.reqs_quantile_1h ?? null;

	return {
		highGlobalDistribution: ipsQuantile !== null && ipsQuantile > config.ja4.ipsQuantileThreshold,
		highRequestVolume: reqsQuantile !== null && reqsQuantile > config.ja4.reqsQuantileThreshold,
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

/**
 * Helper function to block and blacklist for JA4 fraud
 * Phase 1.8: Reduces code duplication for multi-layer detection
 *
 * @param clustering Clustering analysis result
 * @param remoteIp IP address of the request
 * @param ja4 JA4 fingerprint
 * @param ephemeralId Turnstile ephemeral ID
 * @param db D1 database instance
 * @param detectionLayer Which detection layer triggered the block
 * @returns Fraud check result with block details
 */
async function blockForJA4Fraud(
	clustering: ClusteringAnalysis,
	remoteIp: string,
	ja4: string,
	ephemeralId: string | null,
	db: D1Database,
	detectionLayer: 'ip_clustering' | 'rapid_global' | 'extended_global',
	config: FraudDetectionConfig,
	erfid?: string
): Promise<FraudCheckResult> {
	// Calculate progressive timeout (max 24h for ephemeral IDs)
	const offenseCount = await getOffenseCount(remoteIp, db);
	const expiresIn = calculateProgressiveTimeout(offenseCount);
	const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

	// Calculate risk score
	const velocity = analyzeVelocity(clustering, config);
	const signals = compareGlobalSignals(clustering, config);
	const rawScore = calculateCompositeRiskScore(clustering, velocity, signals);
	const warnings = generateWarnings(clustering, velocity, signals);

	// Map detection layer to specific detection type (Phase 1.8)
	const detectionTypeMap = {
		ip_clustering: 'ja4_ip_clustering',
		rapid_global: 'ja4_rapid_global',
		extended_global: 'ja4_extended_global',
	} as const;

	const specificDetectionType = detectionTypeMap[detectionLayer];

	// Add to blacklist with ephemeral ID
	await addToBlacklist(db, {
		ephemeralId,  // Phase 1.8: Include ephemeral ID (24h max)
		ja4,
		ipAddress: remoteIp,
		blockReason: `JA4 ${detectionLayer}: ${clustering.ephemeralCount} sessions in ${Math.round(clustering.timeSpanMinutes)} min`,
		confidence: 'high',
		expiresIn,
		submissionCount: clustering.ephemeralCount,
		detectionType: specificDetectionType,  // Phase 1.8: Layer-specific type
		detectionMetadata: {
			detection_type: specificDetectionType,
			detection_layer: detectionLayer,
			risk_score: rawScore,
			warnings,
			ephemeral_count: clustering.ephemeralCount,
			time_span_minutes: clustering.timeSpanMinutes,
			global_ips_quantile: signals.ipsQuantile,
			global_reqs_quantile: signals.reqsQuantile,
			offense_count: offenseCount,
			timeout_seconds: expiresIn,
			detected_at: new Date().toISOString(),
		},
		erfid, // Request tracking ID
	});

	logger.warn(
		{
			detection_type: 'ja4_fraud',
			detection_layer: detectionLayer,
			ja4,
			remote_ip: remoteIp,
			subnet: remoteIp.indexOf(':') !== -1 ? remoteIp.split(':').slice(0, 4).join(':') : remoteIp,
			clustering: {
				ephemeral_count: clustering.ephemeralCount,
				submission_count: clustering.submissionCount,
				time_span_minutes: Math.round(clustering.timeSpanMinutes),
			},
			risk_score: rawScore,
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
		riskScore: rawScore,
		rawScore,
		warnings,
		retryAfter: expiresIn,
		expiresAt,
		detectionType: specificDetectionType,  // Phase 1.8: Return layer-specific type
	};
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
 * @param ephemeralId Turnstile ephemeral ID for blacklisting (Phase 1.8)
 * @param db D1 database instance
 * @returns Fraud check result
 */
export async function checkJA4FraudPatterns(
	remoteIp: string,
	ja4: string | null,
	ephemeralId: string | null,
	db: D1Database,
	config: FraudDetectionConfig,
	erfid?: string
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

	logger.info({ remoteIp, ja4 }, 'JA4 fraud detection started (multi-layer)');

	try {
		// Layer 4a: JA4 + IP Clustering (same IP/subnet + same JA4)
		const clusteringIP = await analyzeJA4Clustering(remoteIp, ja4, db);

		if (clusteringIP && clusteringIP.ephemeralCount >= config.detection.ja4Clustering.ipClusteringThreshold) {
			logger.info({ remoteIp, ja4, ephemeralCount: clusteringIP.ephemeralCount }, 'Layer 4a: IP clustering detected');

			// Phase 2: Use risk scoring if enabled
			if (config.detection.ja4Clustering.useRiskScoreThreshold) {
				// Calculate multi-signal risk score
				const velocity = analyzeVelocity(clusteringIP, config);
				const signals = compareGlobalSignals(clusteringIP, config);
				const rawScore = calculateCompositeRiskScore(clusteringIP, velocity, signals);
				const normalizedScore = normalizeJA4Score(rawScore, config);
				const warnings = generateWarnings(clusteringIP, velocity, signals);

				logger.info(
					{
						remoteIp,
						ja4,
						ephemeralCount: clusteringIP.ephemeralCount,
						timeSpanMinutes: clusteringIP.timeSpanMinutes,
						rawScore,
						normalizedScore,
						blockThreshold: config.risk.blockThreshold,
					},
					'Layer 4a: Risk score calculated'
				);

				// Block only if score exceeds threshold
				if (normalizedScore >= config.risk.blockThreshold) {
					logger.warn({ remoteIp, ja4, normalizedScore }, 'Layer 4a: BLOCK - Risk score exceeds threshold');
					return blockForJA4Fraud(clusteringIP, remoteIp, ja4, ephemeralId, db, 'ip_clustering', config, erfid);
				}

				// Allow but return risk score for transparency
				logger.info({ remoteIp, ja4, normalizedScore }, 'Layer 4a: ALLOW - Risk score below threshold');
				return {
					allowed: true,
					riskScore: normalizedScore,
					rawScore,
					warnings,
				};
			}

			// Old behavior (backward compatibility): Block immediately
			return blockForJA4Fraud(clusteringIP, remoteIp, ja4, ephemeralId, db, 'ip_clustering', config, erfid);
		}

		// Layer 4b: JA4 + Rapid Global Clustering (5 min, 3+ ephemeral IDs, NO IP filter)
		const clusteringRapid = await analyzeJA4GlobalClustering(ja4, db, config.detection.ja4Clustering.rapidGlobalWindowMinutes);

		if (clusteringRapid && clusteringRapid.ephemeralCount >= config.detection.ja4Clustering.rapidGlobalThreshold) {
			logger.info({ remoteIp, ja4, ephemeralCount: clusteringRapid.ephemeralCount }, 'Layer 4b: Rapid global clustering detected');

			// Phase 2: Use risk scoring if enabled
			if (config.detection.ja4Clustering.useRiskScoreThreshold) {
				// Calculate multi-signal risk score
				const velocity = analyzeVelocity(clusteringRapid, config);
				const signals = compareGlobalSignals(clusteringRapid, config);
				const rawScore = calculateCompositeRiskScore(clusteringRapid, velocity, signals);
				const normalizedScore = normalizeJA4Score(rawScore, config);
				const warnings = generateWarnings(clusteringRapid, velocity, signals);

				logger.info(
					{
						remoteIp,
						ja4,
						ephemeralCount: clusteringRapid.ephemeralCount,
						timeSpanMinutes: clusteringRapid.timeSpanMinutes,
						rawScore,
						normalizedScore,
						blockThreshold: config.risk.blockThreshold,
					},
					'Layer 4b: Risk score calculated'
				);

				// Block only if score exceeds threshold
				if (normalizedScore >= config.risk.blockThreshold) {
					logger.warn({ remoteIp, ja4, normalizedScore }, 'Layer 4b: BLOCK - Risk score exceeds threshold');
					return blockForJA4Fraud(clusteringRapid, remoteIp, ja4, ephemeralId, db, 'rapid_global', config, erfid);
				}

				// Allow but return risk score for transparency
				logger.info({ remoteIp, ja4, normalizedScore }, 'Layer 4b: ALLOW - Risk score below threshold');
				return {
					allowed: true,
					riskScore: normalizedScore,
					rawScore,
					warnings,
				};
			}

			// Old behavior (backward compatibility): Block immediately
			return blockForJA4Fraud(clusteringRapid, remoteIp, ja4, ephemeralId, db, 'rapid_global', config, erfid);
		}

		// Layer 4c: JA4 + Extended Global Clustering (1 hour, 5+ ephemeral IDs, NO IP filter)
		const clusteringExtended = await analyzeJA4GlobalClustering(ja4, db, config.detection.ja4Clustering.extendedGlobalWindowMinutes);

		if (clusteringExtended && clusteringExtended.ephemeralCount >= config.detection.ja4Clustering.extendedGlobalThreshold) {
			logger.info({ remoteIp, ja4, ephemeralCount: clusteringExtended.ephemeralCount }, 'Layer 4c: Extended global clustering detected');

			// Phase 2: Use risk scoring if enabled
			if (config.detection.ja4Clustering.useRiskScoreThreshold) {
				// Calculate multi-signal risk score
				const velocity = analyzeVelocity(clusteringExtended, config);
				const signals = compareGlobalSignals(clusteringExtended, config);
				const rawScore = calculateCompositeRiskScore(clusteringExtended, velocity, signals);
				const normalizedScore = normalizeJA4Score(rawScore, config);
				const warnings = generateWarnings(clusteringExtended, velocity, signals);

				logger.info(
					{
						remoteIp,
						ja4,
						ephemeralCount: clusteringExtended.ephemeralCount,
						timeSpanMinutes: clusteringExtended.timeSpanMinutes,
						rawScore,
						normalizedScore,
						blockThreshold: config.risk.blockThreshold,
					},
					'Layer 4c: Risk score calculated'
				);

				// Block only if score exceeds threshold
				if (normalizedScore >= config.risk.blockThreshold) {
					logger.warn({ remoteIp, ja4, normalizedScore }, 'Layer 4c: BLOCK - Risk score exceeds threshold');
					return blockForJA4Fraud(clusteringExtended, remoteIp, ja4, ephemeralId, db, 'extended_global', config, erfid);
				}

				// Allow but return risk score for transparency
				logger.info({ remoteIp, ja4, normalizedScore }, 'Layer 4c: ALLOW - Risk score below threshold');
				return {
					allowed: true,
					riskScore: normalizedScore,
					rawScore,
					warnings,
				};
			}

			// Old behavior (backward compatibility): Block immediately
			return blockForJA4Fraud(clusteringExtended, remoteIp, ja4, ephemeralId, db, 'extended_global', config, erfid);
		}

		// All layers passed - allow submission
		logger.info({ remoteIp, ja4 }, 'JA4 fraud checks passed (all layers)');
		return {
			allowed: true,
			riskScore: 0,
			rawScore: 0,
			warnings: [],
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
