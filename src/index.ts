import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import type { Env } from './lib/types';
import { getRouteConfig, matchRoute, stripRoutePrefix } from './lib/router';
import { getConfig } from './lib/config';
import submissionsRoute from './routes/submissions';
import analyticsRoute from './routes/analytics';
import geoRoute from './routes/geo';
import { config as configRoute } from './routes/config';

const app = new Hono<{ Bindings: Env }>();

// Middleware
app.use('*', logger());

// CORS with restricted origins from environment
app.use('*', async (c, next) => {
	// Get allowed origins from environment variable
	const allowedOriginsEnv = c.env.ALLOWED_ORIGINS || 'https://form.erfi.dev';
	const allowedOrigins = allowedOriginsEnv.split(',').map(o => o.trim());

	// Add localhost in development
	if (c.env.ENVIRONMENT !== 'production') {
		allowedOrigins.push('http://localhost:8787', 'http://localhost:4321');
	}

	// Apply CORS (X-API-KEY added for testing bypass)
	const corsMiddleware = cors({
		origin: allowedOrigins,
		allowMethods: ['GET', 'POST', 'OPTIONS'],
		allowHeaders: ['Content-Type', 'X-API-KEY'],
		exposeHeaders: ['X-Request-Id'], // Expose erfid header to clients
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

// ========== DYNAMIC ROUTING ==========
// Match incoming requests against configured routes
// This allows users to customize paths without code changes
app.all('*', async (c) => {
	const url = new URL(c.req.url);
	const path = url.pathname;

	// Load route configuration (cached after first load)
	const routes = getRouteConfig(c.env);

	// Match path against configured routes
	const matchedRoute = matchRoute(path, routes);

	if (matchedRoute) {
		// Strip the route prefix to normalize the path
		const routePrefix = routes[matchedRoute];
		const subPath = stripRoutePrefix(path, routePrefix);

		// Create a new request with the normalized path
		// This ensures route handlers see consistent paths
		const normalizedUrl = new URL(subPath || '/', url.origin);
		normalizedUrl.search = url.search;

		const normalizedRequest = new Request(normalizedUrl, c.req.raw);

		// Route to appropriate handler
		switch (matchedRoute) {
			case 'submissions':
				return submissionsRoute.fetch(normalizedRequest, c.env, c.executionCtx);

			case 'analytics':
				return analyticsRoute.fetch(normalizedRequest, c.env, c.executionCtx);

			case 'geo':
				return geoRoute.fetch(normalizedRequest, c.env, c.executionCtx);

			case 'config':
				return configRoute.fetch(normalizedRequest, c.env, c.executionCtx);

			case 'health':
				const cfg = getConfig(c.env);
				return c.json({
					status: 'ok',
					timestamp: new Date().toISOString(),
					version: '1.0.0',
					routes: routes,  // Show configured routes for debugging
					risk: {
						mode: cfg.risk.mode,
						blockThreshold: cfg.risk.blockThreshold,
					},
				});

			case 'admin':
				// Admin route not yet implemented (Phase 3)
				return c.json({ error: 'Admin route not yet implemented' }, 501);
		}
	}

	// No route matched - serve static assets if enabled, otherwise 404
	const assetsDisabled = c.env.DISABLE_STATIC_ASSETS === 'true';
	if (!assetsDisabled && c.env.ASSETS) {
		return c.env.ASSETS.fetch(c.req.raw);
	}

	return c.json(
		{
			error: 'Not Found',
			message: 'Route not defined. Enable static assets or point your frontend at the documented API routes.',
			docs: 'https://github.com/erfi-forminator/forminator/blob/main/docs/backend-only.md',
		},
		404
	);
});

export default app;
