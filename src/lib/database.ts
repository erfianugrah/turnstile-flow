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
					detection_ids, ja3_hash, ja4, ja4_signals,
					detection_type, risk_score_breakdown, erfid
				) VALUES (
					?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
					?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
					?, ?, ?, ?, ?, ?, ?, ?, ?,
					?, ?, ?
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
				// Request tracking ID
				data.erfid || null
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
	erfid?: string | null  // Request tracking ID
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
					ja3_hash, ja4, ja4_signals,
					email_risk_score, email_fraud_signals, email_pattern_type,
					email_markov_detected, email_ood_detected,
					risk_score_breakdown,
					form_data, extracted_email, extracted_phone, erfid
				) VALUES (
					?, ?, ?, ?, ?, ?,
					?, ?, ?, ?, ?, ?,
					?, ?, ?, ?, ?, ?,
					?, ?, ?, ?, ?, ?,
					?, ?, ?, ?,
					?, ?, ?,
					?, ?, ?, ?, ?,
					?,
					?, ?, ?, ?
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
				// Request tracking ID
				erfid || null
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
				tv.risk_score, tv.risk_score_breakdown, tv.erfid as validation_erfid
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
					COUNT(DISTINCT ephemeral_id) as unique_ephemeral_ids,
					SUM(CASE WHEN allowed = 0 AND block_reason LIKE '%JA4%' THEN 1 ELSE 0 END) as ja4_fraud_blocks
				 FROM turnstile_validations`
			)
			.first<{
				total: number;
				successful: number;
				allowed: number;
				avg_risk_score: number;
				unique_ephemeral_ids: number;
				ja4_fraud_blocks: number;
			}>();

		// Get email fraud statistics from submissions table (Phase 2)
		const emailStats = await db
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
			}>();

		return {
			...stats,
			email_fraud: emailStats || {
				total_with_email_check: 0,
				markov_detected: 0,
				ood_detected: 0,
				avg_email_risk_score: 0,
			},
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
	try {
		const result = await db
			.prepare(
				`SELECT
					fb.id,
					fb.ephemeral_id,
					COALESCE(fb.ip_address, tv.remote_ip) as ip_address,
					COALESCE(fb.ja4, tv.ja4) as ja4,
					fb.block_reason,
					fb.detection_confidence,
					fb.erfid,
					REPLACE(fb.blocked_at, ' ', 'T') || 'Z' AS blocked_at,
					REPLACE(fb.expires_at, ' ', 'T') || 'Z' AS expires_at,
					fb.submission_count,
					REPLACE(fb.last_seen_at, ' ', 'T') || 'Z' AS last_seen_at,
					fb.detection_metadata,
					-- Enrich with metadata from most recent validation
					tv.country,
					tv.city,
					-- Calculate offense count (how many times blocked in last 24h)
					(SELECT COUNT(*)
					 FROM fraud_blacklist
					 WHERE (ephemeral_id = fb.ephemeral_id OR ip_address = fb.ip_address)
					 AND blocked_at > datetime('now', '-24 hours')) as offense_count,
					-- Map confidence to risk score
					CASE fb.detection_confidence
						WHEN 'high' THEN 100
						WHEN 'medium' THEN 80
						WHEN 'low' THEN 70
						ELSE 50
					END as risk_score
				 FROM fraud_blacklist fb
				 -- LEFT JOIN to get metadata from most recent validation
				 LEFT JOIN turnstile_validations tv ON tv.id = (
					SELECT id FROM turnstile_validations
					WHERE (fb.ephemeral_id IS NOT NULL AND ephemeral_id = fb.ephemeral_id)
					   OR (fb.ip_address IS NOT NULL AND remote_ip = fb.ip_address)
					ORDER BY created_at DESC
					LIMIT 1
				 )
				 WHERE fb.expires_at > datetime('now')
				 ORDER BY fb.blocked_at DESC
				 LIMIT 100`
			)
			.all();

		return result.results;
	} catch (error) {
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
					bot_score,
					user_agent,
					ja4,
					erfid,
					challenge_ts,
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
						bot_score,
						user_agent,
						ja4,
						erfid,
						REPLACE(created_at, ' ', 'T') || 'Z' AS challenge_ts,
						created_at,
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
						NULL as bot_score,
						user_agent,
						NULL as ja4,
						erfid,
						REPLACE(created_at, ' ', 'T') || 'Z' AS challenge_ts,
						created_at,
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
