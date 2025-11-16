import type { Env } from './types';

/**
 * Route configuration structure
 */
export interface RouteConfig {
	submissions: string;
	analytics: string;
	admin: string;
	geo: string;
	health: string;
}

/**
 * Default routes (fallback if not configured)
 */
const DEFAULT_ROUTES: RouteConfig = {
	submissions: '/api/submissions',
	analytics: '/api/analytics',
	admin: '/api/admin',
	geo: '/api/geo',
	health: '/api/health'
};

// In-memory cache (loaded once per worker instance)
let cachedRoutes: RouteConfig | null = null;

/**
 * Load route configuration from environment
 * Supports both JSON string and object formats
 */
export function getRouteConfig(env: Env): RouteConfig {
	if (cachedRoutes !== null) return cachedRoutes;

	try {
		if (env.ROUTES) {
			// Handle both string and object formats
			const routes = typeof env.ROUTES === 'string'
				? JSON.parse(env.ROUTES)
				: env.ROUTES;

			const merged: RouteConfig = { ...DEFAULT_ROUTES, ...routes };
			cachedRoutes = merged;
			return merged;
		}
	} catch (error) {
		console.warn('Failed to parse ROUTES config, using defaults:', error);
	}

	cachedRoutes = DEFAULT_ROUTES;
	return cachedRoutes;
}

/**
 * Match incoming path against configured routes
 * Returns the route name if matched, null otherwise
 *
 * Uses longest-prefix matching to handle overlapping routes correctly
 *
 * Examples:
 * - "/api/submissions" matches "submissions" route
 * - "/api/submissions/test" matches "submissions" route
 * - "/sign-ups" matches "submissions" if configured as "/sign-ups"
 */
export function matchRoute(
	path: string,
	routes: RouteConfig
): keyof RouteConfig | null {
	// Normalize path (remove trailing slash)
	const normalizedPath = path.endsWith('/') && path.length > 1
		? path.slice(0, -1)
		: path;

	// Sort routes by pattern length (longest first) to match most specific route
	// This ensures "/api/submissions" matches before "/api"
	const sortedRoutes = Object.entries(routes).sort(
		([, a], [, b]) => b.length - a.length
	);

	// Check each configured route (longest first)
	for (const [name, pattern] of sortedRoutes) {
		// Exact match
		if (normalizedPath === pattern) {
			return name as keyof RouteConfig;
		}

		// Prefix match (for sub-routes)
		if (normalizedPath.startsWith(pattern + '/')) {
			return name as keyof RouteConfig;
		}
	}

	return null;
}

/**
 * Strip route prefix from path
 * Used to normalize paths before passing to route handlers
 *
 * Examples:
 * - stripRoutePrefix("/api/submissions", "/api/submissions") => "/"
 * - stripRoutePrefix("/api/submissions/test", "/api/submissions") => "/test"
 * - stripRoutePrefix("/sign-ups/validate", "/sign-ups") => "/validate"
 */
export function stripRoutePrefix(path: string, routePattern: string): string {
	// Exact match returns root
	if (path === routePattern) {
		return '/';
	}

	// Prefix match - strip and return remainder
	if (path.startsWith(routePattern + '/')) {
		return path.slice(routePattern.length);
	}

	// No match - return as-is
	return path;
}

/**
 * Clear route cache (useful for testing)
 */
export function clearRouteCache(): void {
	cachedRoutes = null;
}
