import { Hono } from 'hono';
import type { Env } from '../lib/types';
import {
	getValidationStats,
	getRecentSubmissions,
	getSubmissionsByCountry,
	getBotScoreDistribution,
	getAsnDistribution,
	getTlsVersionDistribution,
	getJa3Distribution,
	getJa4Distribution,
	getSubmissionById,
} from '../lib/database';
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

// GET /api/analytics/submissions - Get recent submissions
app.get('/submissions', async (c) => {
	try {
		const db = c.env.DB;

		// Parse query params
		const limit = Math.min(parseInt(c.req.query('limit') || '50', 10), 100);
		const offset = Math.max(parseInt(c.req.query('offset') || '0', 10), 0);

		const submissions = await getRecentSubmissions(db, limit, offset);

		logger.info({ limit, offset, count: submissions.length }, 'Recent submissions retrieved');

		return c.json({
			success: true,
			data: submissions,
			pagination: {
				limit,
				offset,
				count: submissions.length,
			},
		});
	} catch (error) {
		logger.error({ error }, 'Error fetching submissions');

		return c.json(
			{
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

export default app;
