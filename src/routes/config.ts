/**
 * Configuration API Endpoint
 *
 * Exposes fraud detection configuration to the frontend
 * Allows UI to dynamically adapt to threshold changes
 */

import { Hono } from 'hono';
import { getConfig } from '../lib/config';
import type { Env } from '../lib/types';

const config = new Hono<{ Bindings: Env }>();

/**
 * GET /api/config
 *
 * Returns fraud detection system configuration
 * Public endpoint (no authentication required)
 */
config.get('/', (c) => {
	try {
		const configuration = getConfig();

		return c.json({
			success: true,
			data: configuration,
			version: '2.0.0',
		});
	} catch (error) {
		console.error('Config retrieval error:', error);
		return c.json(
			{
				success: false,
				error: 'Failed to retrieve configuration',
			},
			500
		);
	}
});

export { config };
