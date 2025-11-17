/**
 * Pre-validation fraud detection layer
 * Blocks known fraudulent ephemeral IDs and IPs before expensive Turnstile API calls
 */

/**
 * Convert JavaScript Date to SQLite-compatible datetime string
 * SQLite stores DATETIME as "YYYY-MM-DD HH:MM:SS" (space separator)
 * JavaScript Date.toISOString() returns "YYYY-MM-DDTHH:MM:SS.sssZ" (T separator)
 * Direct comparison fails because space < T in ASCII, causing all time-based queries to fail
 */
function toSQLiteDateTime(date: Date): string {
	return date.toISOString()
		.replace('T', ' ')      // Replace T with space
		.replace(/\.\d{3}Z$/, '');  // Remove milliseconds and Z
}

interface PreValidationResult {
	blocked: boolean;
	reason?: string;
	confidence?: 'high' | 'medium' | 'low';
	cacheFor?: number; // seconds to cache this result
	blacklistEntry?: BlacklistEntry;
	expiresAt?: string; // ISO timestamp when block expires
	retryAfter?: number; // seconds until user can retry
}

interface BlacklistEntry {
	id: number;
	ephemeral_id: string | null;
	ip_address: string | null;
	block_reason: string;
	detection_confidence: 'high' | 'medium' | 'low';
	blocked_at: string;
	expires_at: string;
	submission_count: number;
	last_seen_at: string | null;
	detection_metadata: string | null;
}

interface AddToBlacklistParams {
	ephemeralId?: string | null;
	ipAddress?: string | null;
	ja4?: string | null;
	blockReason: string;
	confidence: 'high' | 'medium' | 'low';
	expiresIn: number; // seconds
	submissionCount?: number;
	detectionMetadata?: Record<string, any>;
	detectionType?: string;  // Phase 1.5: Detection type (ephemeral_id_fraud, ja4_session_hopping, etc.)
}

/**
 * Check if ephemeral ID, IP, or JA4 is blacklisted before validation
 * This is the Layer 1 pre-validation blocking from FRAUD-DETECTION-ENHANCED.md
 */
export async function checkPreValidationBlock(
	ephemeralId: string | null,
	remoteIp: string,
	ja4: string | null,
	db: D1Database
): Promise<PreValidationResult> {
	const now = toSQLiteDateTime(new Date());

	// Check ephemeral ID blacklist (if available)
	if (ephemeralId) {
		const blacklistCheck = await db
			.prepare(
				`
			SELECT * FROM fraud_blacklist
			WHERE ephemeral_id = ?
			AND expires_at > ?
			ORDER BY blocked_at DESC
			LIMIT 1
		`
			)
			.bind(ephemeralId, now)
			.first<BlacklistEntry>();

		if (blacklistCheck) {
			// Update last_seen_at
			await db
				.prepare(
					`
				UPDATE fraud_blacklist
				SET last_seen_at = ?,
					submission_count = submission_count + 1
				WHERE id = ?
			`
				)
				.bind(now, blacklistCheck.id)
				.run();

			const retryAfter = calculateCacheTime(blacklistCheck.expires_at);

			return {
				blocked: true,
				reason: `Blacklisted ephemeral ID: ${blacklistCheck.block_reason}`,
				confidence: blacklistCheck.detection_confidence,
				cacheFor: retryAfter,
				expiresAt: blacklistCheck.expires_at,
				retryAfter,
				blacklistEntry: blacklistCheck,
			};
		}
	}

	// Check JA4 blacklist (if available)
	if (ja4) {
		const ja4BlacklistCheck = await db
			.prepare(
				`
			SELECT * FROM fraud_blacklist
			WHERE ja4 = ?
			AND expires_at > ?
			ORDER BY blocked_at DESC
			LIMIT 1
		`
			)
			.bind(ja4, now)
			.first<BlacklistEntry>();

		if (ja4BlacklistCheck) {
			// Update last_seen_at
			await db
				.prepare(
					`
				UPDATE fraud_blacklist
				SET last_seen_at = ?,
					submission_count = submission_count + 1
				WHERE id = ?
			`
				)
				.bind(now, ja4BlacklistCheck.id)
				.run();

			const retryAfter = calculateCacheTime(ja4BlacklistCheck.expires_at);

			return {
				blocked: true,
				reason: `Blacklisted JA4 fingerprint: ${ja4BlacklistCheck.block_reason}`,
				confidence: ja4BlacklistCheck.detection_confidence,
				cacheFor: retryAfter,
				expiresAt: ja4BlacklistCheck.expires_at,
				retryAfter,
				blacklistEntry: ja4BlacklistCheck,
			};
		}
	}

	// Check IP blacklist
	const ipBlacklistCheck = await db
		.prepare(
			`
		SELECT * FROM fraud_blacklist
		WHERE ip_address = ?
		AND expires_at > ?
		ORDER BY blocked_at DESC
		LIMIT 1
	`
		)
		.bind(remoteIp, now)
		.first<BlacklistEntry>();

	if (ipBlacklistCheck) {
		// Update last_seen_at
		await db
			.prepare(
				`
			UPDATE fraud_blacklist
			SET last_seen_at = ?,
				submission_count = submission_count + 1
			WHERE id = ?
		`
			)
			.bind(now, ipBlacklistCheck.id)
			.run();

		const retryAfter = calculateCacheTime(ipBlacklistCheck.expires_at);

		return {
			blocked: true,
			reason: `Blacklisted IP: ${ipBlacklistCheck.block_reason}`,
			confidence: ipBlacklistCheck.detection_confidence,
			cacheFor: retryAfter,
			expiresAt: ipBlacklistCheck.expires_at,
			retryAfter,
			blacklistEntry: ipBlacklistCheck,
		};
	}

	// Not blacklisted
	return {
		blocked: false,
	};
}

/**
 * Add ephemeral ID or IP to blacklist
 */
export async function addToBlacklist(
	db: D1Database,
	params: AddToBlacklistParams
): Promise<boolean> {
	const { ephemeralId, ipAddress, ja4, blockReason, confidence, expiresIn, submissionCount = 1, detectionMetadata, detectionType } = params;

	// Validate at least one identifier
	if (!ephemeralId && !ipAddress && !ja4) {
		throw new Error('At least one identifier (ephemeralId, ipAddress, or ja4) must be provided');
	}

	const now = new Date();
	const expiresAt = new Date(now.getTime() + expiresIn * 1000);
	const metadata = detectionMetadata ? JSON.stringify(detectionMetadata) : null;

	try {
		await db
			.prepare(
				`
			INSERT INTO fraud_blacklist (
				ephemeral_id,
				ip_address,
				ja4,
				block_reason,
				detection_confidence,
				expires_at,
				submission_count,
				last_seen_at,
				detection_metadata,
				detection_type
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`
			)
			.bind(
				ephemeralId || null,
				ipAddress || null,
				ja4 || null,
				blockReason,
				confidence,
				toSQLiteDateTime(expiresAt),
				submissionCount,
				toSQLiteDateTime(now),
				metadata,
				detectionType || null
			)
			.run();

		return true;
	} catch (error) {
		console.error('Failed to add to blacklist:', error);
		return false;
	}
}

/**
 * Calculate cache time based on expiry (in seconds)
 */
function calculateCacheTime(expiresAt: string): number {
	const now = new Date().getTime();
	const expiry = new Date(expiresAt).getTime();
	const remainingMs = expiry - now;
	return Math.max(Math.floor(remainingMs / 1000), 60); // Minimum 60 seconds
}

/**
 * Clean up expired blacklist entries (run periodically)
 */
export async function cleanupExpiredBlacklist(db: D1Database): Promise<number> {
	const now = toSQLiteDateTime(new Date());

	try {
		const result = await db
			.prepare(
				`
			DELETE FROM fraud_blacklist
			WHERE expires_at <= ?
		`
			)
			.bind(now)
			.run();

		return result.meta?.changes || 0;
	} catch (error) {
		console.error('Failed to cleanup blacklist:', error);
		return 0;
	}
}

/**
 * Get blacklist statistics
 */
export async function getBlacklistStats(db: D1Database): Promise<{
	total: number;
	by_ephemeral_id: number;
	by_ip: number;
	high_confidence: number;
	medium_confidence: number;
	low_confidence: number;
}> {
	const now = toSQLiteDateTime(new Date());

	try {
		const stats = await db
			.prepare(
				`
			SELECT
				COUNT(*) as total,
				SUM(CASE WHEN ephemeral_id IS NOT NULL THEN 1 ELSE 0 END) as by_ephemeral_id,
				SUM(CASE WHEN ip_address IS NOT NULL THEN 1 ELSE 0 END) as by_ip,
				SUM(CASE WHEN detection_confidence = 'high' THEN 1 ELSE 0 END) as high_confidence,
				SUM(CASE WHEN detection_confidence = 'medium' THEN 1 ELSE 0 END) as medium_confidence,
				SUM(CASE WHEN detection_confidence = 'low' THEN 1 ELSE 0 END) as low_confidence
			FROM fraud_blacklist
			WHERE expires_at > ?
		`
			)
			.bind(now)
			.first<{
				total: number;
				by_ephemeral_id: number;
				by_ip: number;
				high_confidence: number;
				medium_confidence: number;
				low_confidence: number;
			}>();

		return (
			stats || {
				total: 0,
				by_ephemeral_id: 0,
				by_ip: 0,
				high_confidence: 0,
				medium_confidence: 0,
				low_confidence: 0,
			}
		);
	} catch (error) {
		console.error('Failed to get blacklist stats:', error);
		return {
			total: 0,
			by_ephemeral_id: 0,
			by_ip: 0,
			high_confidence: 0,
			medium_confidence: 0,
			low_confidence: 0,
		};
	}
}
