import type { RequestMetadata, TurnstileValidationResult, FormSubmission } from './types';
import type { RiskScoreBreakdown } from './scoring';
import logger from './logger';

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

function normalizeISODate(input?: string | null): string | undefined {
	if (!input) {
		return undefined;
	}
	const date = new Date(input);
	if (Number.isNaN(date.getTime())) {
		return undefined;
	}
	return toSQLiteDateTime(date);
}

function buildDateClause(column: string, start?: string, end?: string) {
	const clauses: string[] = [];
	const bindings: Array<string> = [];

	if (start) {
		clauses.push(`${column} >= ?`);
		bindings.push(start);
	}
	if (end) {
		clauses.push(`${column} <= ?`);
		bindings.push(end);
	}

	return {
		clause: clauses.length > 0 ? ` AND ${clauses.join(' AND ')}` : '',
		bindings,
	};
}

export type RiskLevelFilter = 'low' | 'medium' | 'high' | 'critical';

function buildRiskLevelClause(column: string, level?: RiskLevelFilter) {
	if (!level) {
		return { clause: '', bindings: [] as Array<number> };
	}

	let clause = '';
	const bindings: number[] = [];

	switch (level) {
		case 'low':
			clause = ` AND ${column} < ?`;
			bindings.push(50);
			break;
		case 'medium':
			clause = ` AND ${column} >= ? AND ${column} < ?`;
			bindings.push(50, 70);
			break;
		case 'high':
			clause = ` AND ${column} >= ? AND ${column} < ?`;
			bindings.push(70, 90);
			break;
		case 'critical':
			clause = ` AND ${column} >= ?`;
			bindings.push(90);
			break;
	}

	return { clause, bindings };
}

/**
 * Log Turnstile validation attempt to database
 */
export async function logValidation(
	db: D1Database,
	data: {
		tokenHash: string;
		validation: TurnstileValidationResult;
		metadata: RequestMetadata;
		riskScore: number;
		allowed: boolean;
		blockReason?: string;
		submissionId?: number;
		detectionType?: string;  // Phase 1.5: Which fraud check triggered
		riskScoreBreakdown?: RiskScoreBreakdown;  // Phase 1.5: Normalized breakdown
		erfid?: string;  // Request tracking ID
		testingBypass?: boolean; // Testing bypass flag
	}
): Promise<void> {
	const requestHeadersJson = data.metadata.requestHeaders
		? JSON.stringify(data.metadata.requestHeaders)
		: null;
	const extendedMetadataJson = JSON.stringify(data.metadata);

	try {
		await db
			.prepare(
				`INSERT INTO turnstile_validations (
					token_hash, success, allowed, block_reason, challenge_ts, hostname,
					action, ephemeral_id, risk_score, error_codes, submission_id,
					remote_ip, user_agent, country, region, city, postal_code, timezone,
					continent, is_eu_country, asn, as_organization, colo, http_protocol,
					tls_version, bot_score, client_trust_score, verified_bot, js_detection_passed,
					detection_ids, ja3_hash, ja4, ja4_signals,
					detection_type, risk_score_breakdown, request_headers, extended_metadata, erfid, testing_bypass
				) VALUES (
					?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
					?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
					?, ?, ?, ?, ?, ?, ?, ?, ?,
					?, ?, ?, ?, ?, ?
				)`
			)
			.bind(
				data.tokenHash,
				data.validation.valid,
				data.allowed,
				data.blockReason || null,
				data.validation.data?.challenge_ts || null,
				data.validation.data?.hostname || null,
				data.validation.data?.action || null,
				data.validation.ephemeralId || null,
				data.riskScore,
				data.validation.errors ? JSON.stringify(data.validation.errors) : null,
				data.submissionId || null,
				// Request metadata
				data.metadata.remoteIp,
				data.metadata.userAgent,
				data.metadata.country || null,
				data.metadata.region || null,
				data.metadata.city || null,
				data.metadata.postalCode || null,
				data.metadata.timezone || null,
				data.metadata.continent || null,
				data.metadata.isEuCountry || null,
				data.metadata.asn || null,
				data.metadata.asOrganization || null,
				data.metadata.colo || null,
				data.metadata.httpProtocol || null,
				data.metadata.tlsVersion || null,
				data.metadata.botScore || null,
				data.metadata.clientTrustScore || null,
				data.metadata.verifiedBot || false,
				data.metadata.jsDetectionPassed || false,
				data.metadata.detectionIds ? JSON.stringify(data.metadata.detectionIds) : null,
					data.metadata.ja3Hash || null,
					data.metadata.ja4 || null,
					data.metadata.ja4Signals ? JSON.stringify(data.metadata.ja4Signals) : null,
					// Phase 1.5: Detection type and risk score breakdown
					data.detectionType || null,
					data.riskScoreBreakdown ? JSON.stringify(data.riskScoreBreakdown) : null,
					requestHeadersJson,
					extendedMetadataJson,
					// Request tracking ID
					data.erfid || null,
					data.testingBypass ? 1 : 0
				)
			.run();

		logger.info({ tokenHash: data.tokenHash, success: data.validation.valid }, 'Validation logged');
	} catch (error) {
		logger.error({ error }, 'Error logging validation');
		throw error;
	}
}

/**
 * Log pre-Turnstile fraud block to database
 * Used for fraud detection that happens BEFORE Turnstile validation
 * (e.g., email fraud, IP reputation, etc.)
 */
export async function logFraudBlock(
	db: D1Database,
	data: {
		detectionType: string;           // 'email_fraud', 'ip_reputation', etc.
		blockReason: string;             // Human-readable reason
		riskScore: number;               // 0-100 scale
		metadata: RequestMetadata;       // Request metadata
		fraudSignals?: Record<string, any>; // Detection-specific signals
		erfid?: string;                  // Request tracking ID
	}
): Promise<void> {
	try {
		// Extract email fraud specific fields if present
		const emailPatternType = data.fraudSignals?.patternType || null;
		const emailMarkovDetected = data.fraudSignals?.markovDetected ? 1 : 0;
		const emailOodDetected = data.fraudSignals?.oodDetected ? 1 : 0;
		const emailDisposableDomain = data.fraudSignals?.isDisposableDomain ? 1 : 0;
		const emailTldRiskScore = data.fraudSignals?.tldRiskScore || null;

		await db
			.prepare(
				`INSERT INTO fraud_blocks (
					detection_type, block_reason, risk_score,
					remote_ip, user_agent, country,
					email_pattern_type, email_markov_detected, email_ood_detected,
					email_disposable_domain, email_tld_risk_score,
					metadata_json, fraud_signals_json,
					erfid
				) VALUES (
					?, ?, ?,
					?, ?, ?,
					?, ?, ?,
					?, ?,
					?, ?,
					?
				)`
			)
			.bind(
				data.detectionType,
				data.blockReason,
				data.riskScore,
				data.metadata.remoteIp,
				data.metadata.userAgent || null,
				data.metadata.country || null,
				emailPatternType,
				emailMarkovDetected,
				emailOodDetected,
				emailDisposableDomain,
				emailTldRiskScore,
				JSON.stringify(data.metadata),
				data.fraudSignals ? JSON.stringify(data.fraudSignals) : null,
				data.erfid || null
			)
			.run();

		logger.info(
			{
				detection_type: data.detectionType,
				risk_score: data.riskScore,
				erfid: data.erfid,
			},
			'Fraud block logged to database'
		);
	} catch (error) {
		logger.error({ error, detection_type: data.detectionType }, 'Error logging fraud block');
		// Fail-open: Don't throw error, just log it
		// The block should still happen even if logging fails
	}
}

/**
 * Create form submission in database
 */
export async function createSubmission(
	db: D1Database,
	formData: FormSubmission,
	metadata: RequestMetadata,
	ephemeralId?: string | null,
	riskScoreBreakdown?: any,
	emailFraudResult?: { riskScore: number; signals: any } | null,
	// Phase 3: Payload-agnostic forms
	rawPayload?: Record<string, any> | null,
	extractedEmail?: string | null,
	extractedPhone?: string | null,
	erfid?: string | null,  // Request tracking ID
	testingBypass?: boolean
): Promise<number> {
	const requestHeadersJson = metadata.requestHeaders
		? JSON.stringify(metadata.requestHeaders)
		: null;
	const extendedMetadataJson = JSON.stringify(metadata);

	try {
		const result = await db
			.prepare(
				`INSERT INTO submissions (
					first_name, last_name, email, phone, address, date_of_birth,
					ephemeral_id, remote_ip, user_agent, country, region, city,
					postal_code, timezone, latitude, longitude, continent, is_eu_country,
					asn, as_organization, colo, http_protocol, tls_version, tls_cipher,
					bot_score, client_trust_score, verified_bot, detection_ids,
					ja3_hash, ja4, ja4_signals,
					email_risk_score, email_fraud_signals, email_pattern_type,
					email_markov_detected, email_ood_detected,
					risk_score_breakdown,
					form_data, extracted_email, extracted_phone, request_headers, extended_metadata, erfid, testing_bypass
				) VALUES (
					?, ?, ?, ?, ?, ?,
					?, ?, ?, ?, ?, ?,
					?, ?, ?, ?, ?, ?,
					?, ?, ?, ?, ?, ?,
					?, ?, ?, ?,
					?, ?, ?,
					?, ?, ?, ?, ?,
					?,
					?, ?, ?, ?, ?, ?, ?
				)`
			)
			.bind(
				formData.firstName,
				formData.lastName,
				formData.email,
				formData.phone ?? null,
				formData.address ? JSON.stringify(formData.address) : null,
				formData.dateOfBirth ?? null,
				ephemeralId || null,
				metadata.remoteIp,
				metadata.userAgent,
				metadata.country || null,
				metadata.region || null,
				metadata.city || null,
				metadata.postalCode || null,
				metadata.timezone || null,
				metadata.latitude || null,
				metadata.longitude || null,
				metadata.continent || null,
				metadata.isEuCountry || null,
				metadata.asn || null,
				metadata.asOrganization || null,
				metadata.colo || null,
				metadata.httpProtocol || null,
				metadata.tlsVersion || null,
				metadata.tlsCipher || null,
				metadata.botScore || null,
				metadata.clientTrustScore || null,
				metadata.verifiedBot || false,
				metadata.detectionIds ? JSON.stringify(metadata.detectionIds) : null,
				metadata.ja3Hash || null,
				metadata.ja4 || null,
				metadata.ja4Signals ? JSON.stringify(metadata.ja4Signals) : null,
				emailFraudResult ? emailFraudResult.riskScore / 100 : null, // Convert back to 0.0-1.0
				emailFraudResult ? JSON.stringify(emailFraudResult.signals) : null,
				emailFraudResult?.signals.patternType || null,
				emailFraudResult?.signals.markovDetected ? 1 : 0,
				emailFraudResult?.signals.oodDetected ? 1 : 0,
				riskScoreBreakdown ? JSON.stringify(riskScoreBreakdown) : null,
				// Phase 3: Store raw payload and extracted fields
				rawPayload ? JSON.stringify(rawPayload) : null,
				extractedEmail || null,
				extractedPhone || null,
				requestHeadersJson,
				extendedMetadataJson,
				// Request tracking ID
				erfid || null,
				testingBypass ? 1 : 0
			)
			.run();

		// D1 returns lastRowId as a string, convert to number
		const submissionId = typeof result.meta.last_row_id === 'string'
			? parseInt(result.meta.last_row_id, 10)
			: result.meta.last_row_id;

		logger.info(
			{ submissionId, email: formData.email, ephemeralId },
			'Submission created'
		);

		return submissionId;
	} catch (error) {
		logger.error({
			error,
			errorMessage: error instanceof Error ? error.message : 'Unknown error',
			errorStack: error instanceof Error ? error.stack : undefined,
			formData: { email: formData.email, hasAddress: !!formData.address }
		}, 'Error creating submission');
		throw error;
	}
}

/**
 * Get submission by ID
 */
export async function getSubmission(db: D1Database, id: number) {
	try {
		return await db
			.prepare('SELECT * FROM submissions WHERE id = ?')
			.bind(id)
			.first();
	} catch (error) {
		logger.error({ error, id }, 'Error fetching submission');
		throw error;
	}
}

/**
 * Get recent submissions for analytics (legacy - use getSubmissions for advanced features)
 */
export async function getRecentSubmissions(
	db: D1Database,
	limit: number = 50,
	offset: number = 0
) {
	try {
		const result = await db
			.prepare(
				`SELECT id, first_name, last_name, email, country, city, bot_score,
				 created_at, remote_ip, user_agent, tls_version, asn, ja3_hash, ja4, ephemeral_id, erfid
				 FROM submissions
				 ORDER BY created_at DESC
				 LIMIT ? OFFSET ?`
			)
			.bind(limit, offset)
			.all();

		return result.results;
	} catch (error) {
		logger.error({ error }, 'Error fetching recent submissions');
		throw error;
	}
}

/**
 * Submissions filter options
 */
export interface SubmissionsFilters {
	limit?: number;
	offset?: number;
	sortBy?: string;
	sortOrder?: 'asc' | 'desc';
	countries?: string[];
	botScoreMin?: number;
	botScoreMax?: number;
	startDate?: string;
	endDate?: string;
	verifiedBot?: boolean;
	hasJa3?: boolean;
	hasJa4?: boolean;
	search?: string;
	allowed?: boolean | 'all'; // Filter by allowed status: true = allowed only, false = blocked only, 'all' = show all
	fingerprintFlags?: {
		headerReuse?: boolean;
		tlsAnomaly?: boolean;
		latencyMismatch?: boolean;
	};
}

/**
 * Get submissions with advanced filtering, sorting, and search
 */
export async function getSubmissions(
	db: D1Database,
	filters: SubmissionsFilters = {}
) {
	try {
		// Defaults and validation
		const limit = Math.min(filters.limit || 50, 100);
		const offset = Math.max(filters.offset || 0, 0);
		const sortBy = filters.sortBy || 'created_at';
		const sortOrder = filters.sortOrder || 'desc';

		// Validate sortBy field (whitelist to prevent SQL injection)
		const validSortFields = ['created_at', 'bot_score', 'email', 'country', 'first_name', 'last_name', 'risk_score'];
		if (!validSortFields.includes(sortBy)) {
			throw new Error(`Invalid sortBy field: ${sortBy}`);
		}

		// Validate sortOrder
		if (!['asc', 'desc'].includes(sortOrder)) {
			throw new Error(`Invalid sortOrder: ${sortOrder}`);
		}

		// Build WHERE clause dynamically
		const whereClauses: string[] = ['1=1'];
		const bindings: any[] = [];

		// Country filter
		if (filters.countries && filters.countries.length > 0) {
			const placeholders = filters.countries.map(() => '?').join(',');
			whereClauses.push(`s.country IN (${placeholders})`);
			bindings.push(...filters.countries);
		}

		// Bot score range
		if (filters.botScoreMin !== undefined) {
			whereClauses.push('s.bot_score >= ?');
			bindings.push(filters.botScoreMin);
		}
		if (filters.botScoreMax !== undefined) {
			whereClauses.push('s.bot_score <= ?');
			bindings.push(filters.botScoreMax);
		}

		// Date range - convert ISO format dates from frontend to SQLite format
		if (filters.startDate) {
			whereClauses.push('s.created_at >= ?');
			// Convert ISO date to SQLite format if it contains 'T'
			const startDate = filters.startDate.includes('T')
				? toSQLiteDateTime(new Date(filters.startDate))
				: filters.startDate;
			bindings.push(startDate);
		}
		if (filters.endDate) {
			whereClauses.push('s.created_at <= ?');
			// Convert ISO date to SQLite format if it contains 'T'
			const endDate = filters.endDate.includes('T')
				? toSQLiteDateTime(new Date(filters.endDate))
				: filters.endDate;
			bindings.push(endDate);
		}

		// Verified bot filter
		if (filters.verifiedBot !== undefined) {
			whereClauses.push('s.verified_bot = ?');
			bindings.push(filters.verifiedBot ? 1 : 0);
		}

		// JA3 hash presence
		if (filters.hasJa3 !== undefined) {
			whereClauses.push(filters.hasJa3 ? 's.ja3_hash IS NOT NULL' : 's.ja3_hash IS NULL');
		}

		// JA4 hash presence
		if (filters.hasJa4 !== undefined) {
			whereClauses.push(filters.hasJa4 ? 's.ja4 IS NOT NULL' : 's.ja4 IS NULL');
		}

		// Allowed status filter (show blocked, allowed, or all)
		if (filters.allowed !== undefined && filters.allowed !== 'all') {
			whereClauses.push('s.allowed = ?');
			bindings.push(filters.allowed ? 1 : 0);
		}

		// Search across multiple fields
		if (filters.search && filters.search.trim()) {
			const searchTerm = `%${filters.search.trim()}%`;
			whereClauses.push('(s.email LIKE ? OR s.first_name LIKE ? OR s.last_name LIKE ? OR s.remote_ip LIKE ?)');
			bindings.push(searchTerm, searchTerm, searchTerm, searchTerm);
		}


		const whereClause = whereClauses.join(' AND ');

		// Build main query - join with turnstile_validations to get risk scores
		// Handle risk_score sorting from joined table
		const orderByField = sortBy === 'risk_score' ? 'tv.risk_score' : `s.${sortBy}`;
		const query = `
			SELECT
				s.id, s.first_name, s.last_name, s.email, s.country, s.city, s.bot_score,
				s.created_at, s.remote_ip, s.user_agent, s.tls_version, s.asn,
				s.ja3_hash, s.ja4, s.ephemeral_id, s.verified_bot, s.erfid,
				tv.risk_score, tv.risk_score_breakdown, tv.erfid as validation_erfid,
				tv.detection_type,
				COALESCE(json_extract(tv.risk_score_breakdown, '$.components.headerFingerprint.score'), 0) AS fingerprint_header_score,
				COALESCE(json_extract(tv.risk_score_breakdown, '$.components.tlsAnomaly.score'), 0) AS fingerprint_tls_score,
				COALESCE(json_extract(tv.risk_score_breakdown, '$.components.latencyMismatch.score'), 0) AS fingerprint_latency_score
			FROM submissions s
			LEFT JOIN turnstile_validations tv ON s.id = tv.submission_id
			WHERE ${whereClause}
			ORDER BY ${orderByField} ${sortOrder}
			LIMIT ? OFFSET ?
		`;

		// Build count query for total (must use same alias as main query)
		const countQuery = `
			SELECT COUNT(*) as total
			FROM submissions s
			WHERE ${whereClause}
		`;

		// Execute both queries
		const [dataResult, countResult] = await Promise.all([
			db.prepare(query).bind(...bindings, limit, offset).all(),
			db.prepare(countQuery).bind(...bindings).first<{ total: number }>(),
		]);

		logger.info(
			{
				filters,
				count: dataResult.results.length,
				total: countResult?.total || 0,
			},
			'Submissions retrieved with filters'
		);

		const normalizedData = dataResult.results.map((row: any) => {
			const headerScore = Number(row.fingerprint_header_score ?? 0);
			const tlsScore = Number(row.fingerprint_tls_score ?? 0);
			const latencyScore = Number(row.fingerprint_latency_score ?? 0);
			return {
				...row,
				fingerprint_header_score: headerScore,
				fingerprint_tls_score: tlsScore,
				fingerprint_latency_score: latencyScore,
				fingerprint_flags: {
					headerReuse: headerScore > 0,
					tlsAnomaly: tlsScore > 0,
					latencyMismatch: latencyScore > 0,
				},
			};
		});

		return {
			data: normalizedData,
			total: countResult?.total || 0,
		};
	} catch (error) {
		logger.error({ error, filters }, 'Error fetching submissions with filters');
		throw error;
	}
}

/**
 * Get validation statistics
 */
export async function getValidationStats(db: D1Database) {
	try {
		const [
			stats,
			emailStats,
			blacklistCount,
			turnstileRows,
			riskBuckets,
			clientHintInstability,
			velocityInsights,
		] = await Promise.all([
			db
				.prepare(
					`SELECT
						COUNT(*) as total,
						SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful,
						SUM(CASE WHEN allowed = 1 THEN 1 ELSE 0 END) as allowed,
						AVG(risk_score) as avg_risk_score,
						COUNT(DISTINCT ephemeral_id) as unique_ephemeral_ids,
						SUM(CASE WHEN allowed = 0 AND block_reason LIKE '%JA4%' THEN 1 ELSE 0 END) as ja4_fraud_blocks,
						SUM(CASE WHEN detection_type = 'header_fingerprint_reuse' THEN 1 ELSE 0 END) as header_fingerprint_blocks,
						SUM(CASE WHEN detection_type = 'tls_fingerprint_anomaly' THEN 1 ELSE 0 END) as tls_anomaly_blocks,
						SUM(CASE WHEN detection_type = 'latency_mismatch' THEN 1 ELSE 0 END) as latency_mismatch_blocks
					 FROM turnstile_validations`
				)
				.first<{
					total: number;
					successful: number;
					allowed: number;
					avg_risk_score: number;
					unique_ephemeral_ids: number;
					ja4_fraud_blocks: number;
					header_fingerprint_blocks: number;
					tls_anomaly_blocks: number;
					latency_mismatch_blocks: number;
				}>(),
			db
				.prepare(
					`SELECT
						COUNT(*) as total_with_email_check,
						SUM(CASE WHEN email_markov_detected = 1 THEN 1 ELSE 0 END) as markov_detected,
						SUM(CASE WHEN email_ood_detected = 1 THEN 1 ELSE 0 END) as ood_detected,
						AVG(email_risk_score) as avg_email_risk_score
					 FROM submissions
					 WHERE email_risk_score IS NOT NULL`
				)
				.first<{
					total_with_email_check: number;
					markov_detected: number;
					ood_detected: number;
					avg_email_risk_score: number;
				}>(),
			db
				.prepare(
					`SELECT COUNT(*) as active_blacklist
					 FROM fraud_blacklist
					 WHERE expires_at > datetime('now')`
				)
				.first<{ active_blacklist: number }>(),
			db
				.prepare(
					`SELECT
						success,
						allowed,
						testing_bypass as testingBypass,
						COUNT(*) as count,
						AVG(risk_score) as avg_risk_score,
						AVG(bot_score) as avg_bot_score
					 FROM turnstile_validations
					 GROUP BY success, allowed, testing_bypass`
				)
				.all(),
			db
				.prepare(
					`SELECT
						SUM(CASE WHEN risk_score < 30 THEN 1 ELSE 0 END) as low,
						SUM(CASE WHEN risk_score >= 30 AND risk_score < 60 THEN 1 ELSE 0 END) as medium,
						SUM(CASE WHEN risk_score >= 60 AND risk_score < 80 THEN 1 ELSE 0 END) as high,
						SUM(CASE WHEN risk_score >= 80 THEN 1 ELSE 0 END) as critical
					 FROM turnstile_validations`
				)
				.first<{
					low: number;
					medium: number;
					high: number;
					critical: number;
				}>(),
			db
				.prepare(
					`WITH recent AS (
						SELECT
							remote_ip,
							json_extract(extended_metadata, '$.clientHints.ua') as ua_hint,
							json_extract(extended_metadata, '$.clientHints.platform') as platform_hint
						FROM turnstile_validations
						WHERE extended_metadata IS NOT NULL
							AND created_at >= datetime('now', '-24 hours')
					),
					aggregated AS (
						SELECT
							remote_ip,
							COUNT(DISTINCT ua_hint) as ua_variants,
							COUNT(DISTINCT platform_hint) as platform_variants
						FROM recent
						WHERE ua_hint IS NOT NULL OR platform_hint IS NOT NULL
						GROUP BY remote_ip
					)
					SELECT
						COUNT(*) as tracked_ips,
						SUM(CASE WHEN ua_variants > 1 OR platform_variants > 1 THEN 1 ELSE 0 END) as unstable_ips,
						AVG(ua_variants) as avg_ua_variants,
						AVG(platform_variants) as avg_platform_variants
					FROM aggregated`
				)
				.first<{
					tracked_ips: number;
					unstable_ips: number;
					avg_ua_variants: number;
					avg_platform_variants: number;
				}>(),
			db
				.prepare(
					`SELECT
						(SELECT MAX(submission_count) FROM (
							SELECT COUNT(*) as submission_count
							FROM submissions
							WHERE ja4 IS NOT NULL
								AND created_at >= datetime('now', '-1 hour')
							GROUP BY ja4
						)) as ja4_peak_last_hour,
						(SELECT MAX(submission_count) FROM (
							SELECT COUNT(*) as submission_count
							FROM submissions
							WHERE remote_ip IS NOT NULL
								AND created_at >= datetime('now', '-1 hour')
							GROUP BY remote_ip
						)) as ip_peak_last_hour,
						(SELECT AVG(submission_count) FROM (
							SELECT COUNT(*) as submission_count
							FROM submissions
							WHERE ephemeral_id IS NOT NULL
								AND created_at >= datetime('now', '-24 hours')
							GROUP BY ephemeral_id
						)) as avg_submissions_per_ephemeral_day,
						(SELECT COUNT(*) FROM fraud_blacklist WHERE blocked_at >= datetime('now', '-24 hours')) as progressive_timeouts_24h`
				)
				.first<{
					ja4_peak_last_hour: number;
					ip_peak_last_hour: number;
					avg_submissions_per_ephemeral_day: number;
					progressive_timeouts_24h: number;
				}>(),
		]);

		const turnstileEffectiveness =
			turnstileRows?.results?.map((row: any) => ({
				success: !!row.success,
				allowed: !!row.allowed,
				testing_bypass: !!row.testingBypass,
				count: row.count || 0,
				avg_risk_score: row.avg_risk_score || 0,
				avg_bot_score: row.avg_bot_score || 0,
			})) || [];

		const testingBypassTotal = turnstileEffectiveness.reduce((sum, row) => {
			return row.testing_bypass ? sum + row.count : sum;
		}, 0);

		const baseStats = stats || {
			total: 0,
			successful: 0,
			allowed: 0,
			avg_risk_score: 0,
			unique_ephemeral_ids: 0,
			ja4_fraud_blocks: 0,
			header_fingerprint_blocks: 0,
			tls_anomaly_blocks: 0,
			latency_mismatch_blocks: 0,
		};

		const fingerprintTotalBlocks =
			(stats?.header_fingerprint_blocks || 0) +
			(stats?.tls_anomaly_blocks || 0) +
			(stats?.latency_mismatch_blocks || 0);

		const fingerprintBlockRate =
			stats && stats.total > 0 ? (fingerprintTotalBlocks / stats.total) * 100 : 0;

		return {
			...baseStats,
			active_blacklist: blacklistCount?.active_blacklist || 0,
			email_fraud: emailStats || {
				total_with_email_check: 0,
				markov_detected: 0,
				ood_detected: 0,
				avg_email_risk_score: 0,
			},
			turnstile_effectiveness: turnstileEffectiveness,
			risk_distribution: riskBuckets || { low: 0, medium: 0, high: 0, critical: 0 },
			client_hint_instability: clientHintInstability || {
				tracked_ips: 0,
				unstable_ips: 0,
				avg_ua_variants: 0,
				avg_platform_variants: 0,
			},
			velocity_insights: velocityInsights || {
				ja4_peak_last_hour: 0,
				ip_peak_last_hour: 0,
				avg_submissions_per_ephemeral_day: 0,
				progressive_timeouts_24h: 0,
			},
			fingerprint_block_rate: fingerprintBlockRate,
			testing_bypass_total: testingBypassTotal,
		};
	} catch (error) {
		logger.error({ error }, 'Error fetching validation stats');
		throw error;
	}
}

/**
 * Get submissions by country (for analytics)
 */
export async function getSubmissionsByCountry(db: D1Database) {
	try {
		const result = await db
			.prepare(
				`SELECT country, COUNT(*) as count
				 FROM submissions
				 WHERE country IS NOT NULL
				 GROUP BY country
				 ORDER BY count DESC
				 LIMIT 20`
			)
			.all();

		return result.results;
	} catch (error) {
		logger.error({ error }, 'Error fetching submissions by country');
		throw error;
	}
}

/**
 * Get bot score distribution (for analytics)
 */
export async function getBotScoreDistribution(db: D1Database) {
	try {
		const result = await db
			.prepare(
				`SELECT
					CASE
						WHEN bot_score >= 90 THEN '90-100'
						WHEN bot_score >= 70 THEN '70-89'
						WHEN bot_score >= 50 THEN '50-69'
						WHEN bot_score >= 30 THEN '30-49'
						ELSE '0-29'
					END as score_range,
					COUNT(*) as count
				 FROM submissions
				 WHERE bot_score IS NOT NULL
				 GROUP BY score_range
				 ORDER BY score_range DESC`
			)
			.all();

		return result.results;
	} catch (error) {
		logger.error({ error }, 'Error fetching bot score distribution');
		throw error;
	}
}

/**
 * Get ASN distribution (for analytics)
 */
export async function getAsnDistribution(db: D1Database) {
	try {
		const result = await db
			.prepare(
				`SELECT asn, as_organization, COUNT(*) as count
				 FROM submissions
				 WHERE asn IS NOT NULL
				 GROUP BY asn, as_organization
				 ORDER BY count DESC
				 LIMIT 10`
			)
			.all();

		return result.results;
	} catch (error) {
		logger.error({ error }, 'Error fetching ASN distribution');
		throw error;
	}
}

/**
 * Get TLS version distribution (for analytics)
 */
export async function getTlsVersionDistribution(db: D1Database) {
	try {
		const result = await db
			.prepare(
				`SELECT tls_version, tls_cipher, COUNT(*) as count
				 FROM submissions
				 WHERE tls_version IS NOT NULL
				 GROUP BY tls_version, tls_cipher
				 ORDER BY count DESC
				 LIMIT 10`
			)
			.all();

		return result.results;
	} catch (error) {
		logger.error({ error }, 'Error fetching TLS version distribution');
		throw error;
	}
}

/**
 * Get JA3 fingerprint distribution (for analytics)
 */
export async function getJa3Distribution(db: D1Database) {
	try {
		const result = await db
			.prepare(
				`SELECT ja3_hash, COUNT(*) as count
				 FROM submissions
				 WHERE ja3_hash IS NOT NULL
				 GROUP BY ja3_hash
				 ORDER BY count DESC
				 LIMIT 10`
			)
			.all();

		return result.results;
	} catch (error) {
		logger.error({ error }, 'Error fetching JA3 distribution');
		throw error;
	}
}

/**
 * Get JA4 fingerprint distribution (top 10)
 */
export async function getJa4Distribution(db: D1Database) {
	try {
		const result = await db
			.prepare(
				`SELECT ja4, COUNT(*) as count
				 FROM submissions
				 WHERE ja4 IS NOT NULL
				 GROUP BY ja4
				 ORDER BY count DESC
				 LIMIT 10`
			)
			.all();

		return result.results;
	} catch (error) {
		logger.error({ error }, 'Error fetching JA4 distribution');
		throw error;
	}
}

/**
 * Get email pattern type distribution (for analytics) - Phase 2
 */
export async function getEmailPatternDistribution(db: D1Database) {
	try {
		const result = await db
			.prepare(
				`SELECT
					email_pattern_type,
					COUNT(*) as count,
					AVG(email_risk_score) as avg_risk_score,
					SUM(CASE WHEN email_markov_detected = 1 THEN 1 ELSE 0 END) as markov_detected_count
				 FROM submissions
				 WHERE email_pattern_type IS NOT NULL
				 GROUP BY email_pattern_type
				 ORDER BY count DESC
				 LIMIT 10`
			)
			.all();

		return result.results;
	} catch (error) {
		logger.error({ error }, 'Error fetching email pattern distribution');
		throw error;
	}
}

/**
 * Get single submission by ID with all fields
 */
export async function getSubmissionById(db: D1Database, id: number) {
	try {
		const submission = await db
			.prepare(`
				SELECT s.*, tv.risk_score, tv.risk_score_breakdown
				FROM submissions s
				LEFT JOIN turnstile_validations tv ON s.id = tv.submission_id
				WHERE s.id = ?
			`)
			.bind(id)
			.first();

		return submission;
	} catch (error) {
		logger.error({ error, id }, 'Error fetching submission by ID');
		throw error;
	}
}

/**
 * Get time-series data for analytics
 * @param db Database instance
 * @param metric Metric to aggregate (submissions, validations, bot_score_avg, etc.)
 * @param interval Time bucket size (hour, day, week, month)
 * @param start Start date (ISO8601)
 * @param end End date (ISO8601)
 */
export async function getTimeSeriesData(
	db: D1Database,
	metric: string,
	interval: string,
	start?: string,
	end?: string
) {
	try {
		// Default to last 30 days if not specified
		const startDate = start || toSQLiteDateTime(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
		const endDate = end || toSQLiteDateTime(new Date());

		// Get SQLite date format string based on interval
		const formatString = getDateFormatString(interval);
		if (!formatString) {
			throw new Error(`Invalid interval: ${interval}`);
		}

		let query: string;
		let tableName: string;

		// Build query based on metric type
		switch (metric) {
			case 'submissions':
				query = `
					SELECT
						strftime('${formatString}', created_at) as timestamp,
						COUNT(*) as value,
						COUNT(*) as count
					FROM submissions
					WHERE created_at >= ? AND created_at <= ?
					GROUP BY strftime('${formatString}', created_at)
					ORDER BY timestamp ASC
				`;
				break;

			case 'validations':
				query = `
					SELECT
						strftime('${formatString}', created_at) as timestamp,
						COUNT(*) as value,
						COUNT(*) as count
					FROM turnstile_validations
					WHERE created_at >= ? AND created_at <= ?
					GROUP BY strftime('${formatString}', created_at)
					ORDER BY timestamp ASC
				`;
				break;

			case 'validation_success_rate':
				query = `
					SELECT
						strftime('${formatString}', created_at) as timestamp,
						AVG(CASE WHEN success = 1 THEN 100.0 ELSE 0.0 END) as value,
						COUNT(*) as count
					FROM turnstile_validations
					WHERE created_at >= ? AND created_at <= ?
					GROUP BY strftime('${formatString}', created_at)
					ORDER BY timestamp ASC
				`;
				break;

			case 'bot_score_avg':
				query = `
					SELECT
						strftime('${formatString}', created_at) as timestamp,
						AVG(bot_score) as value,
						COUNT(*) as count
					FROM submissions
					WHERE created_at >= ?
						AND created_at <= ?
						AND bot_score IS NOT NULL
					GROUP BY strftime('${formatString}', created_at)
					ORDER BY timestamp ASC
				`;
				break;

			case 'risk_score_avg':
				query = `
					SELECT
						strftime('${formatString}', created_at) as timestamp,
						AVG(risk_score) as value,
						COUNT(*) as count
					FROM turnstile_validations
					WHERE created_at >= ?
						AND created_at <= ?
						AND risk_score IS NOT NULL
					GROUP BY strftime('${formatString}', created_at)
					ORDER BY timestamp ASC
				`;
				break;

			case 'allowed_rate':
				query = `
					SELECT
						strftime('${formatString}', created_at) as timestamp,
						AVG(CASE WHEN allowed = 1 THEN 100.0 ELSE 0.0 END) as value,
						COUNT(*) as count
					FROM turnstile_validations
					WHERE created_at >= ? AND created_at <= ?
					GROUP BY strftime('${formatString}', created_at)
					ORDER BY timestamp ASC
				`;
				break;

			case 'fingerprint_header_blocks':
				query = `
					SELECT
						strftime('${formatString}', created_at) as timestamp,
						COUNT(*) as value
					FROM turnstile_validations
					WHERE created_at >= ? AND created_at <= ?
						AND allowed = 0
						AND detection_type = 'header_fingerprint_reuse'
					GROUP BY strftime('${formatString}', created_at)
					ORDER BY timestamp ASC
				`;
				break;

			case 'fingerprint_tls_blocks':
				query = `
					SELECT
						strftime('${formatString}', created_at) as timestamp,
						COUNT(*) as value
					FROM turnstile_validations
					WHERE created_at >= ? AND created_at <= ?
						AND allowed = 0
						AND detection_type = 'tls_fingerprint_anomaly'
					GROUP BY strftime('${formatString}', created_at)
					ORDER BY timestamp ASC
				`;
				break;

			case 'fingerprint_latency_blocks':
				query = `
					SELECT
						strftime('${formatString}', created_at) as timestamp,
						COUNT(*) as value
					FROM turnstile_validations
					WHERE created_at >= ? AND created_at <= ?
						AND allowed = 0
						AND detection_type = 'latency_mismatch'
					GROUP BY strftime('${formatString}', created_at)
					ORDER BY timestamp ASC
				`;
				break;

			case 'testing_bypass':
				query = `
					SELECT
						strftime('${formatString}', created_at) as timestamp,
						COUNT(*) as value
					FROM turnstile_validations
					WHERE created_at >= ? AND created_at <= ?
						AND testing_bypass = 1
					GROUP BY strftime('${formatString}', created_at)
					ORDER BY timestamp ASC
				`;
				break;

			default:
				throw new Error(`Invalid metric: ${metric}`);
		}

		const result = await db.prepare(query).bind(startDate, endDate).all();

		logger.info({ metric, interval, start: startDate, end: endDate }, 'Time-series data retrieved');

		return result.results;
	} catch (error) {
		logger.error({ error, metric, interval }, 'Error fetching time-series data');
		throw error;
	}
}

/**
 * Helper function to get SQLite date format string based on interval
 */
function getDateFormatString(interval: string): string | null {
	switch (interval) {
		case 'hour':
			return '%Y-%m-%dT%H:00:00Z';
		case 'day':
			return '%Y-%m-%dT00:00:00Z';
		case 'week':
			return '%Y-W%W'; // ISO week number
		case 'month':
			return '%Y-%m-01T00:00:00Z';
		default:
			return null;
	}
}

/**
 * Detect potential fraud patterns in submissions
 */
export async function detectFraudPatterns(db: D1Database): Promise<any> {
	try {
		// Pattern 1: Blacklisted Ephemeral IDs (currently blocked)
		const blacklistedQuery = `
			SELECT
				ephemeral_id,
				block_reason,
				detection_confidence as confidence,
				submission_count,
				blocked_at as created_at,
				expires_at,
				detection_metadata
			FROM fraud_blacklist
			WHERE expires_at > datetime('now')
				AND ephemeral_id IS NOT NULL
			ORDER BY blocked_at DESC
			LIMIT 20
		`;

		// Pattern 2: High-Risk Ephemeral IDs (3+ submissions in 1 hour)
		// These match the threshold in checkEphemeralIdFraud (line 178)
		const highRiskEphemeralQuery = `
			SELECT
				ephemeral_id,
				COUNT(*) as submission_count,
				COUNT(DISTINCT remote_ip) as unique_ips,
				GROUP_CONCAT(DISTINCT country) as countries,
				MIN(created_at) as first_submission,
				MAX(created_at) as last_submission,
				ROUND((JULIANDAY(MAX(created_at)) - JULIANDAY(MIN(created_at))) * 24 * 60, 2) as time_span_minutes
			FROM submissions
			WHERE created_at >= datetime('now', '-1 hour')
				AND ephemeral_id IS NOT NULL
			GROUP BY ephemeral_id
			HAVING COUNT(*) >= 3
			ORDER BY submission_count DESC, unique_ips DESC
			LIMIT 10
		`;

		// Pattern 3: Proxy Rotation (same ephemeral ID from 3+ different IPs)
		// Detects rotating proxies/botnets - matches checkEphemeralIdFraud (line 202)
		const proxyRotationQuery = `
			SELECT
				ephemeral_id,
				COUNT(*) as submission_count,
				COUNT(DISTINCT remote_ip) as unique_ips,
				GROUP_CONCAT(DISTINCT remote_ip) as ip_addresses,
				GROUP_CONCAT(DISTINCT country) as countries,
				MIN(created_at) as first_seen,
				MAX(created_at) as last_seen
			FROM submissions
			WHERE created_at >= datetime('now', '-1 hour')
				AND ephemeral_id IS NOT NULL
			GROUP BY ephemeral_id
			HAVING COUNT(DISTINCT remote_ip) >= 3
			ORDER BY unique_ips DESC, submission_count DESC
			LIMIT 10
		`;

		// Pattern 4: High-Frequency Validators (10+ validation attempts in 1 hour)
		// Detects bots rapidly generating tokens - matches checkEphemeralIdFraud (line 221)
		const highFrequencyQuery = `
			SELECT
				ephemeral_id,
				COUNT(*) as validation_count,
				COUNT(DISTINCT remote_ip) as unique_ips,
				SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful_validations,
				SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failed_validations,
				MIN(created_at) as first_attempt,
				MAX(created_at) as last_attempt,
				ROUND((JULIANDAY(MAX(created_at)) - JULIANDAY(MIN(created_at))) * 24 * 60, 2) as time_span_minutes
			FROM turnstile_validations
			WHERE created_at >= datetime('now', '-1 hour')
				AND ephemeral_id IS NOT NULL
			GROUP BY ephemeral_id
			HAVING COUNT(*) >= 10
			ORDER BY validation_count DESC
			LIMIT 10
		`;

		const [blacklisted, highRiskEphemeral, proxyRotation, highFrequency] = await Promise.all([
			db.prepare(blacklistedQuery).all(),
			db.prepare(highRiskEphemeralQuery).all(),
			db.prepare(proxyRotationQuery).all(),
			db.prepare(highFrequencyQuery).all(),
		]);

		logger.info(
			{
				blacklisted: blacklisted.results.length,
				high_risk_ephemeral: highRiskEphemeral.results.length,
				proxy_rotation: proxyRotation.results.length,
				high_frequency: highFrequency.results.length,
			},
			'Ephemeral ID fraud patterns detected'
		);

		return {
			blacklisted: blacklisted.results,
			high_risk_ephemeral: highRiskEphemeral.results,
			proxy_rotation: proxyRotation.results,
			high_frequency: highFrequency.results,
		};
	} catch (error) {
		logger.error({ error }, 'Error detecting fraud patterns');
		throw error;
	}
}

/**
 * Get blocked validation statistics
 */
export async function getBlockedValidationStats(db: D1Database) {
	try {
		// Get stats from turnstile_validations (post-Turnstile blocks)
		const validationStats = await db
			.prepare(
				`SELECT
					COUNT(*) as total_blocked,
					COUNT(DISTINCT ephemeral_id) as unique_ephemeral_ids,
					COUNT(DISTINCT remote_ip) as unique_ips,
					AVG(risk_score) as avg_risk_score
				 FROM turnstile_validations
				 WHERE allowed = 0`
			)
			.first<{
				total_blocked: number;
				unique_ephemeral_ids: number;
				unique_ips: number;
				avg_risk_score: number;
			}>();

		// Get stats from fraud_blocks (pre-Turnstile blocks)
		const fraudStats = await db
			.prepare(
				`SELECT
					COUNT(*) as total_blocked,
					COUNT(DISTINCT remote_ip) as unique_ips,
					AVG(risk_score) as avg_risk_score
				 FROM fraud_blocks`
			)
			.first<{
				total_blocked: number;
				unique_ips: number;
				avg_risk_score: number;
			}>();

		// Combine stats
		return {
			total_blocked: (validationStats?.total_blocked || 0) + (fraudStats?.total_blocked || 0),
			unique_ephemeral_ids: validationStats?.unique_ephemeral_ids || 0, // Only in validations
			unique_ips: (validationStats?.unique_ips || 0) + (fraudStats?.unique_ips || 0),
			avg_risk_score:
				((validationStats?.avg_risk_score || 0) * (validationStats?.total_blocked || 0) +
				 (fraudStats?.avg_risk_score || 0) * (fraudStats?.total_blocked || 0)) /
				((validationStats?.total_blocked || 0) + (fraudStats?.total_blocked || 0)) || 0,
			unique_block_reasons: 0, // Calculated separately in getBlockReasonDistribution
			// Phase 1: Additional breakdown
			validation_blocks: validationStats?.total_blocked || 0,
			fraud_blocks: fraudStats?.total_blocked || 0,
		};
	} catch (error) {
		logger.error({ error }, 'Error fetching blocked validation stats');
		throw error;
	}
}

/**
 * Get block reason distribution
 * Combines data from both turnstile_validations (post-Turnstile) and fraud_blocks (pre-Turnstile)
 */
export async function getBlockReasonDistribution(db: D1Database) {
	try {
		const result = await db
			.prepare(
				`SELECT
					block_reason,
					SUM(count) as count,
					SUM(unique_ephemeral_ids) as unique_ephemeral_ids,
					SUM(unique_ips) as unique_ips,
					SUM(total_risk_score) / SUM(count) as avg_risk_score,
					source
				FROM (
					-- Post-Turnstile blocks (from turnstile_validations)
					SELECT
						block_reason,
						COUNT(*) as count,
						COUNT(DISTINCT ephemeral_id) as unique_ephemeral_ids,
						COUNT(DISTINCT remote_ip) as unique_ips,
						SUM(risk_score) as total_risk_score,
						'validation' as source
					FROM turnstile_validations
					WHERE allowed = 0 AND block_reason IS NOT NULL
					GROUP BY block_reason

					UNION ALL

					-- Pre-Turnstile blocks (from fraud_blocks)
					SELECT
						block_reason,
						COUNT(*) as count,
						0 as unique_ephemeral_ids,
						COUNT(DISTINCT remote_ip) as unique_ips,
						SUM(risk_score) as total_risk_score,
						'fraud_block' as source
					FROM fraud_blocks
					WHERE block_reason IS NOT NULL
					GROUP BY block_reason
				)
				GROUP BY block_reason, source
				ORDER BY count DESC`
			)
			.all();

		return result.results;
	} catch (error) {
		logger.error({ error }, 'Error fetching block reason distribution');
		throw error;
	}
}

/**
 * Get active blacklist entries
 */
export async function getActiveBlacklistEntries(db: D1Database) {
	const baseQuery = `SELECT
		fb.id,
		fb.ephemeral_id,
		COALESCE(fb.ip_address, tv.remote_ip) as ip_address,
		COALESCE(fb.ja4, tv.ja4) as ja4,
		fb.block_reason,
		fb.detection_type,
		fb.detection_confidence,
		fb.erfid,
		REPLACE(fb.blocked_at, ' ', 'T') || 'Z' AS blocked_at,
		REPLACE(fb.expires_at, ' ', 'T') || 'Z' AS expires_at,
		fb.submission_count,
		REPLACE(fb.last_seen_at, ' ', 'T') || 'Z' AS last_seen_at,
		fb.detection_metadata,
		tv.ja4_signals,
		tv.country,
		tv.city,
		(SELECT COUNT(*)
		 FROM fraud_blacklist
		 WHERE (ephemeral_id = fb.ephemeral_id OR ip_address = fb.ip_address)
		 AND blocked_at > datetime('now', '-24 hours')) as offense_count,
		COALESCE(
			fb.risk_score,
			CASE fb.detection_confidence
				WHEN 'high' THEN 100
				WHEN 'medium' THEN 80
				WHEN 'low' THEN 70
				ELSE 50
			END
		) as risk_score,
		fb.risk_score_breakdown
	 FROM fraud_blacklist fb
	 LEFT JOIN turnstile_validations tv ON tv.id = (
		SELECT id FROM turnstile_validations
		WHERE (fb.ephemeral_id IS NOT NULL AND ephemeral_id = fb.ephemeral_id)
		   OR (fb.ip_address IS NOT NULL AND remote_ip = fb.ip_address)
		ORDER BY created_at DESC
		LIMIT 1
	 )
	 WHERE fb.expires_at > datetime('now')
	 ORDER BY fb.blocked_at DESC
	 LIMIT 100`;

	const fallbackQuery = `SELECT
		fb.id,
		fb.ephemeral_id,
		COALESCE(fb.ip_address, tv.remote_ip) as ip_address,
		COALESCE(fb.ja4, tv.ja4) as ja4,
		fb.block_reason,
		fb.detection_type,
		fb.detection_confidence,
		fb.erfid,
		REPLACE(fb.blocked_at, ' ', 'T') || 'Z' AS blocked_at,
		REPLACE(fb.expires_at, ' ', 'T') || 'Z' AS expires_at,
		fb.submission_count,
		REPLACE(fb.last_seen_at, ' ', 'T') || 'Z' AS last_seen_at,
		fb.detection_metadata,
		tv.ja4_signals,
		tv.country,
		tv.city,
		(SELECT COUNT(*)
		 FROM fraud_blacklist
		 WHERE (ephemeral_id = fb.ephemeral_id OR ip_address = fb.ip_address)
		 AND blocked_at > datetime('now', '-24 hours')) as offense_count,
		CASE fb.detection_confidence
			WHEN 'high' THEN 100
			WHEN 'medium' THEN 80
			WHEN 'low' THEN 70
			ELSE 50
		END as risk_score,
		NULL as risk_score_breakdown
	 FROM fraud_blacklist fb
	 LEFT JOIN turnstile_validations tv ON tv.id = (
		SELECT id FROM turnstile_validations
		WHERE (fb.ephemeral_id IS NOT NULL AND ephemeral_id = fb.ephemeral_id)
		   OR (fb.ip_address IS NOT NULL AND remote_ip = fb.ip_address)
		ORDER BY created_at DESC
		LIMIT 1
	 )
	 WHERE fb.expires_at > datetime('now')
	 ORDER BY fb.blocked_at DESC
	 LIMIT 100`;

	try {
		const result = await db.prepare(baseQuery).all();
		return result.results;
	} catch (error) {
		if (error instanceof Error && /no such column/i.test(error.message || '')) {
			logger.warn({ error }, 'Blacklist risk columns missing, using fallback query');
			const fallback = await db.prepare(fallbackQuery).all();
			return fallback.results;
		}
		logger.error({ error }, 'Error fetching active blacklist entries');
		throw error;
	}
}

/**
 * Get blacklist statistics
 */
export async function getBlacklistStats(db: D1Database) {
	try {
		const stats = await db
			.prepare(
				`SELECT
					COUNT(*) as total_active,
					COUNT(CASE WHEN detection_confidence = 'high' THEN 1 END) as high_confidence,
					COUNT(CASE WHEN detection_confidence = 'medium' THEN 1 END) as medium_confidence,
					COUNT(CASE WHEN detection_confidence = 'low' THEN 1 END) as low_confidence,
					COUNT(CASE WHEN ephemeral_id IS NOT NULL THEN 1 END) as ephemeral_id_blocks,
					COUNT(CASE WHEN ip_address IS NOT NULL THEN 1 END) as ip_blocks
				 FROM fraud_blacklist
				 WHERE expires_at > datetime('now')`
			)
			.first<{
				total_active: number;
				high_confidence: number;
				medium_confidence: number;
				low_confidence: number;
				ephemeral_id_blocks: number;
				ip_blocks: number;
			}>();

		return stats;
	} catch (error) {
		logger.error({ error }, 'Error fetching blacklist stats');
		throw error;
	}
}

/**
 * Get recent blocked validations with details
 */
export async function getRecentBlockedValidations(db: D1Database, limit: number = 50) {
	try {
		const result = await db
			.prepare(
				`SELECT
					id,
					ephemeral_id,
					ip_address,
					country,
					city,
					block_reason,
					detection_type,
					risk_score,
					risk_score_breakdown,
					bot_score,
					user_agent,
					ja4,
					erfid,
					challenge_ts,
					fraud_signals_json,
					source
				FROM (
					-- Post-Turnstile blocks (from turnstile_validations)
					SELECT
						id,
						ephemeral_id,
						remote_ip AS ip_address,
						country,
						city,
						block_reason,
						detection_type,
						risk_score,
						risk_score_breakdown,
						bot_score,
						user_agent,
						ja4,
						erfid,
						REPLACE(created_at, ' ', 'T') || 'Z' AS challenge_ts,
						created_at,
						NULL as fraud_signals_json,
						'validation' as source
					FROM turnstile_validations
					WHERE allowed = 0

					UNION ALL

					-- Pre-Turnstile blocks (from fraud_blocks)
					SELECT
						id,
						NULL as ephemeral_id,
						remote_ip AS ip_address,
						country,
						NULL as city,
						block_reason,
						detection_type,
						risk_score,
						NULL as risk_score_breakdown,
						NULL as bot_score,
						user_agent,
						NULL as ja4,
						erfid,
						REPLACE(created_at, ' ', 'T') || 'Z' AS challenge_ts,
						created_at,
						fraud_signals_json,
						'fraud_block' as source
					FROM fraud_blocks
				)
				ORDER BY created_at DESC
				LIMIT ?`
			)
			.bind(limit)
			.all();

		return result.results;
	} catch (error) {
		logger.error({ error }, 'Error fetching recent blocked validations');
		throw error;
	}
}

/**
 * Get single validation by ID with all fields
 */
export async function getValidationById(db: D1Database, id: number) {
	try {
		const validation = await db
			.prepare(`
				SELECT *
				FROM turnstile_validations
				WHERE id = ?
			`)
			.bind(id)
			.first();

		return validation;
	} catch (error) {
		logger.error({ error, id }, 'Error fetching validation by ID');
		throw error;
	}
}

export async function getValidationByErfid(db: D1Database, erfid: string) {
	try {
		const validation = await db
			.prepare(`
				SELECT *
				FROM turnstile_validations
				WHERE erfid = ?
				ORDER BY created_at DESC
				LIMIT 1
			`)
			.bind(erfid)
			.first();

		return validation;
	} catch (error) {
		logger.error({ error, erfid }, 'Error fetching validation by erfid');
		throw error;
	}
}

export interface SecurityEventExportFilters {
	startDate?: string;
	endDate?: string;
	status?: 'all' | 'active' | 'detection';
	riskLevel?: RiskLevelFilter;
	limit?: number;
}

export interface ValidationExportFilters {
	startDate?: string;
	endDate?: string;
	limit?: number;
}

export async function exportSecurityEvents(db: D1Database, filters: SecurityEventExportFilters) {
	const {
		startDate,
		endDate,
		status = 'all',
		riskLevel,
		limit = 1000,
	} = filters;

	const normalizedLimit = Math.min(Math.max(limit, 1), 5000);
	const start = normalizeISODate(startDate);
	const end = normalizeISODate(endDate);

	const includeActive = status === 'all' || status === 'active';
	const includeDetections = status === 'all' || status === 'detection';

	const [activeBlocks, detections] = await Promise.all([
		includeActive ? exportActiveBlocks(db, { start, end, riskLevel, limit: normalizedLimit }) : Promise.resolve([]),
		includeDetections ? exportDetectionEvents(db, { start, end, riskLevel, limit: normalizedLimit }) : Promise.resolve([]),
	]);

	return {
		activeBlocks,
		detections,
	};
}

export async function exportValidations(db: D1Database, filters: ValidationExportFilters) {
	const { startDate, endDate, limit = 1000 } = filters;
	const normalizedLimit = Math.min(Math.max(limit, 1), 5000);
	const start = normalizeISODate(startDate);
	const end = normalizeISODate(endDate);
	const { clause: dateClause, bindings: dateBindings } = buildDateClause('created_at', start, end);

	const query = `
		SELECT *,
			REPLACE(created_at, ' ', 'T') || 'Z' AS iso_created_at
		FROM turnstile_validations
		WHERE 1 = 1
		${dateClause}
		ORDER BY created_at DESC
		LIMIT ?
	`;

	const result = await db
		.prepare(query)
		.bind(...dateBindings, normalizedLimit)
		.all();

	return result.results;
}

async function exportActiveBlocks(
	db: D1Database,
	params: { start?: string; end?: string; riskLevel?: RiskLevelFilter; limit: number }
) {
	const { start, end, riskLevel, limit } = params;
	const { clause: dateClause, bindings: dateBindings } = buildDateClause('fb.blocked_at', start, end);
	const { clause: riskClause, bindings: riskBindings } = buildRiskLevelClause('risk_score_resolved', riskLevel);

	const query = `
		WITH annotated AS (
			SELECT
				fb.id,
				fb.ephemeral_id,
				COALESCE(fb.ip_address, tv.remote_ip) AS resolved_ip,
				COALESCE(fb.ja4, tv.ja4) AS resolved_ja4,
				tv.country,
				tv.city,
				fb.detection_type,
				fb.detection_confidence,
				fb.block_reason,
				fb.risk_score,
				fb.risk_score_breakdown,
				tv.ja4_signals,
				(SELECT COUNT(*)
				 FROM fraud_blacklist
				 WHERE (ephemeral_id = fb.ephemeral_id OR ip_address = fb.ip_address)
				 AND blocked_at > datetime('now', '-24 hours')) as offense_count,
				fb.blocked_at,
				fb.expires_at,
				fb.erfid,
				fb.submission_count,
				fb.last_seen_at,
				fb.detection_metadata,
				CASE fb.detection_confidence
					WHEN 'high' THEN 100
					WHEN 'medium' THEN 80
					WHEN 'low' THEN 70
					ELSE 50
				END as fallback_risk_score
			FROM fraud_blacklist fb
			LEFT JOIN turnstile_validations tv ON tv.id = (
				SELECT id FROM turnstile_validations
				WHERE (fb.ephemeral_id IS NOT NULL AND ephemeral_id = fb.ephemeral_id)
				   OR (fb.ip_address IS NOT NULL AND remote_ip = fb.ip_address)
				ORDER BY created_at DESC
				LIMIT 1
			)
			WHERE fb.expires_at > datetime('now')
			${dateClause}
		),
		enriched AS (
			SELECT
				id,
				ephemeral_id,
				resolved_ip AS ip_address,
				resolved_ja4 AS ja4,
				country,
				city,
				detection_type,
				detection_confidence,
				block_reason,
				risk_score,
				COALESCE(risk_score, fallback_risk_score) AS risk_score_resolved,
				risk_score_breakdown,
				ja4_signals,
				offense_count,
				REPLACE(blocked_at, ' ', 'T') || 'Z' AS blocked_at_iso,
				REPLACE(expires_at, ' ', 'T') || 'Z' AS expires_at_iso,
				erfid,
				submission_count,
				REPLACE(last_seen_at, ' ', 'T') || 'Z' AS last_seen_at_iso,
				detection_metadata
			FROM annotated
		)
		SELECT
			id,
			ephemeral_id,
			ip_address,
			ja4,
			country,
			city,
			detection_type,
			detection_confidence,
			block_reason,
			risk_score_resolved AS risk_score,
			risk_score_breakdown,
			ja4_signals,
			offense_count,
			blocked_at_iso AS blocked_at,
			expires_at_iso AS expires_at,
			erfid,
			submission_count,
			last_seen_at_iso AS last_seen_at,
			detection_metadata,
			blocked_at_iso AS timestamp
		FROM enriched
		WHERE 1 = 1
		${riskClause}
		ORDER BY blocked_at_iso DESC
		LIMIT ?
	`;

	const result = await db
		.prepare(query)
		.bind(...dateBindings, ...riskBindings, limit)
		.all();

	return result.results;
}

async function exportDetectionEvents(
	db: D1Database,
	params: { start?: string; end?: string; riskLevel?: RiskLevelFilter; limit: number }
) {
	const { start, end, riskLevel, limit } = params;

	const validationDate = buildDateClause('created_at', start, end);
	const validationRisk = buildRiskLevelClause('COALESCE(risk_score, 0)', riskLevel);
	const fraudBlockDate = buildDateClause('created_at', start, end);
	const fraudBlockRisk = buildRiskLevelClause('COALESCE(risk_score, 0)', riskLevel);

	const query = `
		SELECT *
		FROM (
			SELECT
				id,
				ephemeral_id,
				remote_ip AS ip_address,
				country,
				city,
				block_reason,
				detection_type,
				risk_score,
				risk_score_breakdown,
				bot_score,
				user_agent,
				ja4,
				erfid,
				REPLACE(created_at, ' ', 'T') || 'Z' AS timestamp,
				'validation' as source,
				created_at
			FROM turnstile_validations
			WHERE allowed = 0
			${validationDate.clause}
			${validationRisk.clause}

			UNION ALL

			SELECT
				id,
				NULL as ephemeral_id,
				remote_ip AS ip_address,
				country,
				NULL as city,
				block_reason,
				detection_type,
				risk_score,
				NULL as risk_score_breakdown,
				NULL as bot_score,
				user_agent,
				NULL as ja4,
				erfid,
				REPLACE(created_at, ' ', 'T') || 'Z' AS timestamp,
				'fraud_block' as source,
				created_at
			FROM fraud_blocks
			WHERE 1 = 1
			${fraudBlockDate.clause}
			${fraudBlockRisk.clause}
		)
		ORDER BY created_at DESC
		LIMIT ?
	`;

	const bindings = [
		...validationDate.bindings,
		...validationRisk.bindings,
		...fraudBlockDate.bindings,
		...fraudBlockRisk.bindings,
		limit,
	];

	const result = await db.prepare(query).bind(...bindings).all();
	return result.results;
}
