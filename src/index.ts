import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import type { Env } from './lib/types';
import submissionsRoute from './routes/submissions';
import analyticsRoute from './routes/analytics';
import geoRoute from './routes/geo';

const app = new Hono<{ Bindings: Env }>();

// Middleware
app.use('*', logger());

// CORS with restricted origins from environment
app.use('/api/*', async (c, next) => {
	// Get allowed origins from environment variable
	const allowedOriginsEnv = c.env.ALLOWED_ORIGINS || 'https://form.erfi.dev';
	const allowedOrigins = allowedOriginsEnv.split(',').map(o => o.trim());

	// Add localhost in development
	if (c.env.ENVIRONMENT !== 'production') {
		allowedOrigins.push('http://localhost:8787', 'http://localhost:4321');
	}

	// Apply CORS
	const corsMiddleware = cors({
		origin: allowedOrigins,
		allowMethods: ['GET', 'POST', 'OPTIONS'],
		allowHeaders: ['Content-Type'],
		maxAge: 86400,
	});

	return corsMiddleware(c, next);
});

// Security headers middleware
app.use('*', async (c, next) => {
	await next();

	// Prevent MIME sniffing
	c.header('X-Content-Type-Options', 'nosniff');

	// Prevent clickjacking
	c.header('X-Frame-Options', 'DENY');

	// Enable XSS protection
	c.header('X-XSS-Protection', '1; mode=block');

	// Referrer policy
	c.header('Referrer-Policy', 'strict-origin-when-cross-origin');

	// Permissions policy
	c.header('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');

	// Content Security Policy
	c.header(
		'Content-Security-Policy',
		"default-src 'self'; " +
		"script-src 'self' https://challenges.cloudflare.com; " +
		"frame-src https://challenges.cloudflare.com; " +
		"connect-src 'self' https://challenges.cloudflare.com; " +
		"style-src 'self' 'unsafe-inline'; " +
		"img-src 'self' data: https:;"
	);
});

// API Routes
app.route('/api/submissions', submissionsRoute);
app.route('/api/analytics', analyticsRoute);
app.route('/api/geo', geoRoute);

// Health check
app.get('/api/health', (c) => {
	return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve static assets from Astro build
app.get('*', async (c) => {
	const url = new URL(c.req.url);

	// Request static asset from ASSETS binding
	const assetResponse = await c.env.ASSETS.fetch(c.req.raw);

	return assetResponse;
});

export default app;
