import type { RequestMetadata, TurnstileValidationResult, FormSubmission } from './types';
import logger from './logger';

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
	}
): Promise<void> {
	try {
		await db
			.prepare(
				`INSERT INTO turnstile_validations (
					token_hash, success, allowed, block_reason, challenge_ts, hostname,
					action, ephemeral_id, risk_score, error_codes, submission_id,
					remote_ip, user_agent, country, region, city, postal_code, timezone,
					continent, is_eu_country, asn, as_organization, colo, http_protocol,
					tls_version, bot_score, client_trust_score, verified_bot, js_detection_passed,
					detection_ids, ja3_hash, ja4, ja4_signals
				) VALUES (
					?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
					?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
					?, ?, ?, ?, ?, ?, ?, ?, ?
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
				data.metadata.ja4Signals ? JSON.stringify(data.metadata.ja4Signals) : null
			)
			.run();

		logger.info({ tokenHash: data.tokenHash, success: data.validation.valid }, 'Validation logged');
	} catch (error) {
		logger.error({ error }, 'Error logging validation');
		throw error;
	}
}

/**
 * Create form submission in database
 */
export async function createSubmission(
	db: D1Database,
	formData: FormSubmission,
	metadata: RequestMetadata,
	ephemeralId?: string | null
): Promise<number> {
	try {
		const result = await db
			.prepare(
				`INSERT INTO submissions (
					first_name, last_name, email, phone, address, date_of_birth,
					ephemeral_id, remote_ip, user_agent, country, region, city,
					postal_code, timezone, latitude, longitude, continent, is_eu_country,
					asn, as_organization, colo, http_protocol, tls_version, tls_cipher,
					bot_score, client_trust_score, verified_bot, detection_ids,
					ja3_hash, ja4, ja4_signals
				) VALUES (
					?, ?, ?, ?, ?, ?,
					?, ?, ?, ?, ?, ?,
					?, ?, ?, ?, ?, ?,
					?, ?, ?, ?, ?, ?,
					?, ?, ?, ?,
					?, ?, ?
				)`
			)
			.bind(
				formData.firstName,
				formData.lastName,
				formData.email,
				formData.phone,
				formData.address,
				formData.dateOfBirth,
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
				metadata.ja4Signals ? JSON.stringify(metadata.ja4Signals) : null
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
		logger.error({ error }, 'Error creating submission');
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
				 created_at, remote_ip, user_agent, tls_version, asn, ja3_hash, ephemeral_id
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
		const validSortFields = ['created_at', 'bot_score', 'email', 'country', 'first_name', 'last_name'];
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
			whereClauses.push(`country IN (${placeholders})`);
			bindings.push(...filters.countries);
		}

		// Bot score range
		if (filters.botScoreMin !== undefined) {
			whereClauses.push('bot_score >= ?');
			bindings.push(filters.botScoreMin);
		}
		if (filters.botScoreMax !== undefined) {
			whereClauses.push('bot_score <= ?');
			bindings.push(filters.botScoreMax);
		}

		// Date range
		if (filters.startDate) {
			whereClauses.push('created_at >= ?');
			bindings.push(filters.startDate);
		}
		if (filters.endDate) {
			whereClauses.push('created_at <= ?');
			bindings.push(filters.endDate);
		}

		// Verified bot filter
		if (filters.verifiedBot !== undefined) {
			whereClauses.push('verified_bot = ?');
			bindings.push(filters.verifiedBot ? 1 : 0);
		}

		// JA3 hash presence
		if (filters.hasJa3 !== undefined) {
			whereClauses.push(filters.hasJa3 ? 'ja3_hash IS NOT NULL' : 'ja3_hash IS NULL');
		}

		// JA4 hash presence
		if (filters.hasJa4 !== undefined) {
			whereClauses.push(filters.hasJa4 ? 'ja4 IS NOT NULL' : 'ja4 IS NULL');
		}

		// Search across multiple fields
		if (filters.search && filters.search.trim()) {
			const searchTerm = `%${filters.search.trim()}%`;
			whereClauses.push('(email LIKE ? OR first_name LIKE ? OR last_name LIKE ? OR remote_ip LIKE ?)');
			bindings.push(searchTerm, searchTerm, searchTerm, searchTerm);
		}

		const whereClause = whereClauses.join(' AND ');

		// Build main query
		const query = `
			SELECT
				id, first_name, last_name, email, country, city, bot_score,
				created_at, remote_ip, user_agent, tls_version, asn,
				ja3_hash, ja4, ephemeral_id, verified_bot
			FROM submissions
			WHERE ${whereClause}
			ORDER BY ${sortBy} ${sortOrder}
			LIMIT ? OFFSET ?
		`;

		// Build count query for total
		const countQuery = `
			SELECT COUNT(*) as total
			FROM submissions
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

		return {
			data: dataResult.results,
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
		const stats = await db
			.prepare(
				`SELECT
					COUNT(*) as total,
					SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful,
					SUM(CASE WHEN allowed = 1 THEN 1 ELSE 0 END) as allowed,
					AVG(risk_score) as avg_risk_score,
					COUNT(DISTINCT ephemeral_id) as unique_ephemeral_ids
				 FROM turnstile_validations`
			)
			.first<{
				total: number;
				successful: number;
				allowed: number;
				avg_risk_score: number;
				unique_ephemeral_ids: number;
			}>();

		return stats;
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
 * Get single submission by ID with all fields
 */
export async function getSubmissionById(db: D1Database, id: number) {
	try {
		const submission = await db
			.prepare('SELECT * FROM submissions WHERE id = ?')
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
		const startDate = start || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
		const endDate = end || new Date().toISOString();

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
		// Pattern 1: Duplicate IP addresses with multiple submissions
		const duplicateIpsQuery = `
			SELECT
				remote_ip,
				COUNT(*) as submission_count,
				GROUP_CONCAT(DISTINCT email) as emails,
				AVG(bot_score) as avg_bot_score
			FROM submissions
			WHERE created_at >= datetime('now', '-24 hours')
			GROUP BY remote_ip
			HAVING COUNT(*) >= 3
			ORDER BY submission_count DESC
			LIMIT 10
		`;

		// Pattern 2: Low bot score submissions (< 30)
		const lowBotScoresQuery = `
			SELECT
				id, email, remote_ip, bot_score, country, created_at
			FROM submissions
			WHERE bot_score IS NOT NULL
				AND bot_score < 30
				AND created_at >= datetime('now', '-7 days')
			ORDER BY bot_score ASC, created_at DESC
			LIMIT 10
		`;

		// Pattern 3: Rapid submissions (multiple in short time)
		const rapidSubmissionsQuery = `
			SELECT
				remote_ip,
				COUNT(*) as count,
				MIN(created_at) as first_submission,
				MAX(created_at) as last_submission,
				ROUND((JULIANDAY(MAX(created_at)) - JULIANDAY(MIN(created_at))) * 24 * 60, 2) as time_span_minutes,
				GROUP_CONCAT(DISTINCT email) as emails
			FROM submissions
			WHERE created_at >= datetime('now', '-1 hour')
			GROUP BY remote_ip
			HAVING COUNT(*) >= 2
				AND time_span_minutes < 5
			ORDER BY count DESC
			LIMIT 10
		`;

		// Pattern 4: Duplicate emails
		const duplicateEmailsQuery = `
			SELECT
				email,
				COUNT(*) as submission_count,
				COUNT(DISTINCT remote_ip) as unique_ips,
				GROUP_CONCAT(DISTINCT country) as countries,
				AVG(bot_score) as avg_bot_score
			FROM submissions
			WHERE created_at >= datetime('now', '-7 days')
			GROUP BY email
			HAVING COUNT(*) >= 2
			ORDER BY submission_count DESC
			LIMIT 10
		`;

		const [duplicateIps, lowBotScores, rapidSubmissions, duplicateEmails] = await Promise.all([
			db.prepare(duplicateIpsQuery).all(),
			db.prepare(lowBotScoresQuery).all(),
			db.prepare(rapidSubmissionsQuery).all(),
			db.prepare(duplicateEmailsQuery).all(),
		]);

		logger.info(
			{
				duplicate_ips: duplicateIps.results.length,
				low_bot_scores: lowBotScores.results.length,
				rapid_submissions: rapidSubmissions.results.length,
				duplicate_emails: duplicateEmails.results.length,
			},
			'Fraud patterns detected'
		);

		return {
			duplicate_ips: duplicateIps.results,
			low_bot_scores: lowBotScores.results,
			rapid_submissions: rapidSubmissions.results,
			duplicate_emails: duplicateEmails.results,
		};
	} catch (error) {
		logger.error({ error }, 'Error detecting fraud patterns');
		throw error;
	}
}
