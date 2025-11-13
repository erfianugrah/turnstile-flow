import { Hono } from 'hono';
import type { Env } from '../lib/types';
import {
	getValidationStats,
	getRecentSubmissions,
	getSubmissions,
	getSubmissionsByCountry,
	getBotScoreDistribution,
	getAsnDistribution,
	getTlsVersionDistribution,
	getJa3Distribution,
	getJa4Distribution,
	getSubmissionById,
	getTimeSeriesData,
	detectFraudPatterns,
} from '../lib/database';
import type { SubmissionsFilters } from '../lib/database';
import logger from '../lib/logger';

const app = new Hono<{ Bindings: Env }>();

// API Key authentication middleware
app.use('*', async (c, next) => {
	const apiKey = c.req.header('X-API-KEY');
	const expectedKey = c.env['X-API-KEY'];

	// If no expected key is set, allow access (backward compatibility)
	if (!expectedKey) {
		logger.warn('X-API-KEY not configured in environment - analytics unprotected');
		return next();
	}

	// Check if API key matches
	if (!apiKey || apiKey !== expectedKey) {
		logger.warn(
			{
				hasKey: !!apiKey,
				ip: c.req.header('CF-Connecting-IP')
			},
			'Unauthorized analytics access attempt'
		);
		return c.json(
			{
				success: false,
				error: 'Unauthorized - Invalid or missing X-API-KEY header',
			},
			401
		);
	}

	return next();
});

// GET /api/analytics/stats - Get validation statistics
app.get('/stats', async (c) => {
	try {
		const db = c.env.DB;
		const stats = await getValidationStats(db);

		logger.info('Validation stats retrieved');

		return c.json({
			success: true,
			data: stats,
		});
	} catch (error) {
		logger.error({ error }, 'Error fetching validation stats');

		return c.json(
			{
				error: 'Internal server error',
				message: 'Failed to fetch validation statistics',
			},
			500
		);
	}
});

// GET /api/analytics/submissions - Get submissions with filtering, sorting, and search
app.get('/submissions', async (c) => {
	try {
		const db = c.env.DB;

		// Parse pagination params
		const limit = c.req.query('limit') ? parseInt(c.req.query('limit')!, 10) : undefined;
		const offset = c.req.query('offset') ? parseInt(c.req.query('offset')!, 10) : undefined;

		// Parse sorting params
		const sortBy = c.req.query('sortBy');
		const sortOrder = c.req.query('sortOrder') as 'asc' | 'desc' | undefined;

		// Validate sortOrder if provided
		if (sortOrder && !['asc', 'desc'].includes(sortOrder)) {
			return c.json(
				{
					success: false,
					error: 'Invalid parameter',
					message: 'sortOrder must be either "asc" or "desc"',
				},
				400
			);
		}

		// Parse filter params
		const countries = c.req.query('countries')?.split(',').filter(Boolean);
		const botScoreMin = c.req.query('botScoreMin')
			? parseInt(c.req.query('botScoreMin')!, 10)
			: undefined;
		const botScoreMax = c.req.query('botScoreMax')
			? parseInt(c.req.query('botScoreMax')!, 10)
			: undefined;
		const startDate = c.req.query('startDate');
		const endDate = c.req.query('endDate');
		const verifiedBotStr = c.req.query('verifiedBot');
		const verifiedBot =
			verifiedBotStr !== undefined ? verifiedBotStr === 'true' : undefined;
		const hasJa3Str = c.req.query('hasJa3');
		const hasJa3 = hasJa3Str !== undefined ? hasJa3Str === 'true' : undefined;
		const hasJa4Str = c.req.query('hasJa4');
		const hasJa4 = hasJa4Str !== undefined ? hasJa4Str === 'true' : undefined;
		const search = c.req.query('search');

		// Validate bot score range
		if (botScoreMin !== undefined && (botScoreMin < 0 || botScoreMin > 100)) {
			return c.json(
				{
					success: false,
					error: 'Invalid parameter',
					message: 'botScoreMin must be between 0 and 100',
				},
				400
			);
		}
		if (botScoreMax !== undefined && (botScoreMax < 0 || botScoreMax > 100)) {
			return c.json(
				{
					success: false,
					error: 'Invalid parameter',
					message: 'botScoreMax must be between 0 and 100',
				},
				400
			);
		}

		// Build filters object
		const filters: SubmissionsFilters = {
			limit,
			offset,
			sortBy,
			sortOrder,
			countries,
			botScoreMin,
			botScoreMax,
			startDate,
			endDate,
			verifiedBot,
			hasJa3,
			hasJa4,
			search,
		};

		// Fetch submissions with filters
		const result = await getSubmissions(db, filters);

		// Build applied filters object for response
		const appliedFilters: Record<string, any> = {};
		if (countries) appliedFilters.countries = countries;
		if (botScoreMin !== undefined) appliedFilters.botScoreMin = botScoreMin;
		if (botScoreMax !== undefined) appliedFilters.botScoreMax = botScoreMax;
		if (startDate) appliedFilters.startDate = startDate;
		if (endDate) appliedFilters.endDate = endDate;
		if (verifiedBot !== undefined) appliedFilters.verifiedBot = verifiedBot;
		if (hasJa3 !== undefined) appliedFilters.hasJa3 = hasJa3;
		if (hasJa4 !== undefined) appliedFilters.hasJa4 = hasJa4;
		if (search) appliedFilters.search = search;
		if (sortBy) appliedFilters.sortBy = sortBy;
		if (sortOrder) appliedFilters.sortOrder = sortOrder;

		logger.info(
			{
				filters: appliedFilters,
				count: result.data.length,
				total: result.total,
			},
			'Submissions retrieved'
		);

		return c.json({
			success: true,
			data: result.data,
			pagination: {
				limit: limit || 50,
				offset: offset || 0,
				count: result.data.length,
				total: result.total,
			},
			filters: appliedFilters,
		});
	} catch (error: any) {
		// Handle validation errors
		if (error.message?.includes('Invalid sortBy')) {
			return c.json(
				{
					success: false,
					error: 'Invalid parameter',
					message: error.message,
				},
				400
			);
		}

		logger.error({ error }, 'Error fetching submissions');

		return c.json(
			{
				success: false,
				error: 'Internal server error',
				message: 'Failed to fetch submissions',
			},
			500
		);
	}
});

// GET /api/analytics/countries - Get submissions by country
app.get('/countries', async (c) => {
	try {
		const db = c.env.DB;
		const countries = await getSubmissionsByCountry(db);

		logger.info({ count: countries.length }, 'Submissions by country retrieved');

		return c.json({
			success: true,
			data: countries,
		});
	} catch (error) {
		logger.error({ error }, 'Error fetching submissions by country');

		return c.json(
			{
				error: 'Internal server error',
				message: 'Failed to fetch country statistics',
			},
			500
		);
	}
});

// GET /api/analytics/bot-scores - Get bot score distribution
app.get('/bot-scores', async (c) => {
	try {
		const db = c.env.DB;
		const distribution = await getBotScoreDistribution(db);

		logger.info('Bot score distribution retrieved');

		return c.json({
			success: true,
			data: distribution,
		});
	} catch (error) {
		logger.error({ error }, 'Error fetching bot score distribution');

		return c.json(
			{
				error: 'Internal server error',
				message: 'Failed to fetch bot score distribution',
			},
			500
		);
	}
});

// GET /api/analytics/asn - Get ASN distribution
app.get('/asn', async (c) => {
	try {
		const db = c.env.DB;
		const distribution = await getAsnDistribution(db);

		logger.info('ASN distribution retrieved');

		return c.json({
			success: true,
			data: distribution,
		});
	} catch (error) {
		logger.error({ error }, 'Error fetching ASN distribution');

		return c.json(
			{
				error: 'Internal server error',
				message: 'Failed to fetch ASN distribution',
			},
			500
		);
	}
});

// GET /api/analytics/tls - Get TLS version distribution
app.get('/tls', async (c) => {
	try {
		const db = c.env.DB;
		const distribution = await getTlsVersionDistribution(db);

		logger.info('TLS version distribution retrieved');

		return c.json({
			success: true,
			data: distribution,
		});
	} catch (error) {
		logger.error({ error }, 'Error fetching TLS distribution');

		return c.json(
			{
				error: 'Internal server error',
				message: 'Failed to fetch TLS distribution',
			},
			500
		);
	}
});

// GET /api/analytics/ja3 - Get JA3 fingerprint distribution
app.get('/ja3', async (c) => {
	try {
		const db = c.env.DB;
		const distribution = await getJa3Distribution(db);

		logger.info('JA3 distribution retrieved');

		return c.json({
			success: true,
			data: distribution,
		});
	} catch (error) {
		logger.error({ error }, 'Error fetching JA3 distribution');

		return c.json(
			{
				error: 'Internal server error',
				message: 'Failed to fetch JA3 distribution',
			},
			500
		);
	}
});

// GET /api/analytics/ja4 - Get JA4 fingerprint distribution
app.get('/ja4', async (c) => {
	try {
		const db = c.env.DB;
		const distribution = await getJa4Distribution(db);

		logger.info('JA4 distribution retrieved');

		return c.json({
			success: true,
			data: distribution,
		});
	} catch (error) {
		logger.error({ error }, 'Error fetching JA4 distribution');

		return c.json(
			{
				error: 'Internal server error',
				message: 'Failed to fetch JA4 distribution',
			},
			500
		);
	}
});

// GET /api/analytics/submissions/:id - Get single submission details
app.get('/submissions/:id', async (c) => {
	try {
		const db = c.env.DB;
		const id = parseInt(c.req.param('id'), 10);

		if (isNaN(id)) {
			return c.json({ error: 'Invalid ID' }, 400);
		}

		const submission = await getSubmissionById(db, id);

		if (!submission) {
			return c.json({ error: 'Submission not found' }, 404);
		}

		logger.info({ id }, 'Submission details retrieved');

		return c.json({
			success: true,
			data: submission,
		});
	} catch (error) {
		logger.error({ error }, 'Error fetching submission details');

		return c.json(
			{
				error: 'Internal server error',
				message: 'Failed to fetch submission details',
			},
			500
		);
	}
});

// GET /api/analytics/time-series - Get time-series data for trend visualization
app.get('/time-series', async (c) => {
	try {
		const db = c.env.DB;

		// Parse and validate query parameters
		const metric = c.req.query('metric');
		const interval = c.req.query('interval');
		const start = c.req.query('start');
		const end = c.req.query('end');

		// Validate required parameters
		if (!metric) {
			return c.json(
				{
					success: false,
					error: 'Missing required parameter',
					message: 'Parameter "metric" is required',
				},
				400
			);
		}

		if (!interval) {
			return c.json(
				{
					success: false,
					error: 'Missing required parameter',
					message: 'Parameter "interval" is required',
				},
				400
			);
		}

		// Validate metric
		const validMetrics = [
			'submissions',
			'validations',
			'validation_success_rate',
			'bot_score_avg',
			'risk_score_avg',
			'allowed_rate',
		];
		if (!validMetrics.includes(metric)) {
			return c.json(
				{
					success: false,
					error: 'Invalid metric',
					message: `Metric must be one of: ${validMetrics.join(', ')}`,
				},
				400
			);
		}

		// Validate interval
		const validIntervals = ['hour', 'day', 'week', 'month'];
		if (!validIntervals.includes(interval)) {
			return c.json(
				{
					success: false,
					error: 'Invalid interval',
					message: `Interval must be one of: ${validIntervals.join(', ')}`,
				},
				400
			);
		}

		// Fetch time-series data
		const data = await getTimeSeriesData(db, metric, interval, start, end);

		// Calculate actual date range used (including defaults)
		const startDate = start || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
		const endDate = end || new Date().toISOString();

		logger.info({ metric, interval, start: startDate, end: endDate }, 'Time-series data retrieved');

		return c.json({
			success: true,
			data,
			meta: {
				metric,
				interval,
				start: startDate,
				end: endDate,
				total_points: data.length,
			},
		});
	} catch (error) {
		logger.error({ error }, 'Error fetching time-series data');

		return c.json(
			{
				success: false,
				error: 'Internal server error',
				message: 'Failed to fetch time-series data',
			},
			500
		);
	}
});

// GET /api/analytics/export - Export submissions data as CSV or JSON
app.get('/export', async (c) => {
	try {
		const db = c.env.DB;

		// Parse format parameter
		const format = c.req.query('format') || 'csv';
		if (!['csv', 'json'].includes(format)) {
			return c.json(
				{
					success: false,
					error: 'Invalid format',
					message: 'Format must be either "csv" or "json"',
				},
				400
			);
		}

		// Parse filter params (same as submissions endpoint)
		const sortBy = c.req.query('sortBy');
		const sortOrder = c.req.query('sortOrder') as 'asc' | 'desc' | undefined;

		if (sortOrder && !['asc', 'desc'].includes(sortOrder)) {
			return c.json(
				{
					success: false,
					error: 'Invalid parameter',
					message: 'sortOrder must be either "asc" or "desc"',
				},
				400
			);
		}

		const countries = c.req.query('countries')?.split(',').filter(Boolean);
		const botScoreMin = c.req.query('botScoreMin')
			? parseInt(c.req.query('botScoreMin')!, 10)
			: undefined;
		const botScoreMax = c.req.query('botScoreMax')
			? parseInt(c.req.query('botScoreMax')!, 10)
			: undefined;
		const startDate = c.req.query('startDate');
		const endDate = c.req.query('endDate');
		const verifiedBotStr = c.req.query('verifiedBot');
		const verifiedBot =
			verifiedBotStr !== undefined ? verifiedBotStr === 'true' : undefined;
		const hasJa3Str = c.req.query('hasJa3');
		const hasJa3 = hasJa3Str !== undefined ? hasJa3Str === 'true' : undefined;
		const hasJa4Str = c.req.query('hasJa4');
		const hasJa4 = hasJa4Str !== undefined ? hasJa4Str === 'true' : undefined;
		const search = c.req.query('search');

		// Validate bot score range
		if (botScoreMin !== undefined && (botScoreMin < 0 || botScoreMin > 100)) {
			return c.json(
				{
					success: false,
					error: 'Invalid parameter',
					message: 'botScoreMin must be between 0 and 100',
				},
				400
			);
		}
		if (botScoreMax !== undefined && (botScoreMax < 0 || botScoreMax > 100)) {
			return c.json(
				{
					success: false,
					error: 'Invalid parameter',
					message: 'botScoreMax must be between 0 and 100',
				},
				400
			);
		}

		// Build filters object (no limit/offset - export all matching records)
		const filters: SubmissionsFilters = {
			sortBy,
			sortOrder,
			countries,
			botScoreMin,
			botScoreMax,
			startDate,
			endDate,
			verifiedBot,
			hasJa3,
			hasJa4,
			search,
		};

		// Fetch all submissions matching filters
		const result = await getSubmissions(db, filters);

		const timestamp = new Date().toISOString().split('T')[0];

		if (format === 'csv') {
			// Convert to CSV
			const headers = [
				'id',
				'email',
				'first_name',
				'last_name',
				'country',
				'remote_ip',
				'bot_score',
				'asn',
				'tls_version',
				'ja3_fingerprint',
				'ja4_fingerprint',
				'verified_bot',
				'created_at',
			];

			const rows = result.data.map((row: any) => {
				return headers.map((header) => {
					const value = row[header];
					if (value === null || value === undefined) return '';
					if (typeof value === 'string' && value.includes(',')) {
						return `"${value.replace(/"/g, '""')}"`;
					}
					return value;
				});
			});

			const csvContent = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');

			logger.info(
				{ format, count: result.data.length, filters },
				'Data exported'
			);

			return new Response(csvContent, {
				headers: {
					'Content-Type': 'text/csv',
					'Content-Disposition': `attachment; filename="submissions-export-${timestamp}.csv"`,
				},
			});
		} else {
			// JSON format
			const jsonContent = JSON.stringify(result.data, null, 2);

			logger.info(
				{ format, count: result.data.length, filters },
				'Data exported'
			);

			return new Response(jsonContent, {
				headers: {
					'Content-Type': 'application/json',
					'Content-Disposition': `attachment; filename="submissions-export-${timestamp}.json"`,
				},
			});
		}
	} catch (error: any) {
		// Handle validation errors
		if (error.message?.includes('Invalid sortBy')) {
			return c.json(
				{
					success: false,
					error: 'Invalid parameter',
					message: error.message,
				},
				400
			);
		}

		logger.error({ error }, 'Error exporting data');

		return c.json(
			{
				success: false,
				error: 'Internal server error',
				message: 'Failed to export data',
			},
			500
		);
	}
});

// GET /api/analytics/fraud-patterns - Detect potential fraud patterns
app.get('/fraud-patterns', async (c) => {
	try {
		const db = c.env.DB;

		const patterns = await detectFraudPatterns(db);

		logger.info('Fraud patterns retrieved');

		return c.json({
			success: true,
			data: patterns,
		});
	} catch (error) {
		logger.error({ error }, 'Error detecting fraud patterns');

		return c.json(
			{
				success: false,
				error: 'Internal server error',
				message: 'Failed to detect fraud patterns',
			},
			500
		);
	}
});

export default app;
