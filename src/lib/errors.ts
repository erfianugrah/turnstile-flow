/**
 * Custom error classes for better error handling and user feedback
 */

import type { Context } from 'hono';
import type { ZodError } from 'zod';
import logger from './logger';

/**
 * Format Zod validation errors into a human-readable message
 */
export function formatZodErrors(zodError: ZodError): string {
	const errors = zodError.errors.map((err) => {
		const field = err.path.join('.');
		return `${field}: ${err.message}`;
	});

	if (errors.length === 1) {
		return errors[0];
	}

	return `Validation failed:\n${errors.map(e => `• ${e}`).join('\n')}`;
}

/**
 * Base application error class
 */
export class AppError extends Error {
	constructor(
		message: string,
		public statusCode: number = 500,
		public userMessage?: string,
		public context?: Record<string, any>
	) {
		super(message);
		this.name = this.constructor.name;
		Error.captureStackTrace(this, this.constructor);
	}
}

/**
 * Validation error (400)
 */
export class ValidationError extends AppError {
	constructor(message: string, context?: Record<string, any>, userMessage?: string) {
		super(
			message,
			400,
			userMessage || 'Please check your form data and try again',
			context
		);
	}
}

/**
 * Authentication/Authorization error (401/403)
 */
export class AuthError extends AppError {
	constructor(message: string, userMessage?: string, context?: Record<string, any>) {
		super(
			message,
			403,
			userMessage || 'Access denied',
			context
		);
	}
}

/**
 * Rate limit error (429)
 */
export class RateLimitError extends AppError {
	constructor(
		message: string,
		public retryAfter: number,
		public expiresAt: string,
		userMessage?: string
	) {
		super(
			message,
			429,
			userMessage || 'Too many requests. Please try again later',
			{ retryAfter, expiresAt }
		);
	}
}

/**
 * Resource not found error (404)
 */
export class NotFoundError extends AppError {
	constructor(resource: string, context?: Record<string, any>) {
		super(
			`${resource} not found`,
			404,
			`The requested ${resource.toLowerCase()} was not found`,
			context
		);
	}
}

/**
 * Conflict error (409) - e.g., duplicate email
 */
export class ConflictError extends AppError {
	constructor(message: string, userMessage?: string, context?: Record<string, any>) {
		super(
			message,
			409,
			userMessage || 'A conflict occurred with existing data',
			context
		);
	}
}

/**
 * External service error (502/503)
 */
export class ExternalServiceError extends AppError {
	constructor(
		service: string,
		message: string,
		context?: Record<string, any>,
		userMessage?: string
	) {
		super(
			`${service} error: ${message}`,
			503,
			userMessage || 'A required service is temporarily unavailable. Please try again in a moment',
			{ service, ...context }
		);
	}
}

/**
 * Database error (500)
 */
export class DatabaseError extends AppError {
	constructor(operation: string, originalError: Error, context?: Record<string, any>) {
		super(
			`Database ${operation} failed: ${originalError.message}`,
			500,
			'A database error occurred. Please try again',
			{ operation, originalError: originalError.message, ...context }
		);
	}
}

/**
 * Global error handler for Hono routes
 * Converts errors to appropriate JSON responses
 */
export function handleError(error: unknown, c: Context) {
	// Extract erfid from context (if available)
	const erfid = c.get('erfid') as string | undefined;

	// Set erfid header if available
	if (erfid) {
		c.header('X-Request-Id', erfid);
	}

	// Handle known AppError instances
	if (error instanceof RateLimitError) {
		logger.warn(
			{
				error: error.message,
				retryAfter: error.retryAfter,
				expiresAt: error.expiresAt,
				context: error.context,
				erfid,
			},
			'Rate limit error'
		);

		return c.json(
			{
				error: 'Too many requests',
				message: error.userMessage || error.message,
				retryAfter: error.retryAfter,
				expiresAt: error.expiresAt,
				...(erfid && { erfid }),
			},
			error.statusCode as 429,
			{
				'Retry-After': String(error.retryAfter),
			}
		);
	}

	if (error instanceof AppError) {
		// Log based on severity
		if (error.statusCode >= 500) {
			logger.error(
				{
					error: error.message,
					statusCode: error.statusCode,
					context: error.context,
					stack: error.stack,
					erfid,
				},
				`${error.name}: ${error.message}`
			);
		} else {
			logger.warn(
				{
					error: error.message,
					statusCode: error.statusCode,
					context: error.context,
					erfid,
				},
				`${error.name}: ${error.message}`
			);
		}

		return c.json(
			{
				error: error.name,
				message: error.userMessage || error.message,
				...(error.context && { details: error.context }),
				...(erfid && { erfid }),
			},
			error.statusCode as any
		);
	}

	// Handle unknown errors
	const errorMessage = error instanceof Error ? error.message : 'Unknown error';
	const errorStack = error instanceof Error ? error.stack : undefined;

	logger.error(
		{
			error: errorMessage,
			stack: errorStack,
			type: error instanceof Error ? error.constructor.name : typeof error,
			erfid,
		},
		'Unexpected error'
	);

	return c.json(
		{
			error: 'Internal server error',
			message: 'An unexpected error occurred. Please try again',
			...(erfid && { erfid }),
		},
		500
	);
}
