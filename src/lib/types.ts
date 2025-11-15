// Cloudflare Request types based on Workers documentation
// See: https://developers.cloudflare.com/workers/runtime-apis/request/#incomingrequestcfproperties

import type { IncomingRequestCfProperties } from '@cloudflare/workers-types';

// Re-export for convenience
export type { IncomingRequestCfProperties };

// Extracted metadata from request
export interface RequestMetadata {
	// Basic
	remoteIp: string;
	userAgent: string;

	// Geographic
	country?: string;
	region?: string;
	city?: string;
	postalCode?: string;
	timezone?: string;
	latitude?: string;
	longitude?: string;
	continent?: string;
	isEuCountry?: string;

	// Network
	asn?: number;
	asOrganization?: string;
	colo?: string;
	httpProtocol?: string;
	tlsVersion?: string;
	tlsCipher?: string;

	// Bot detection
	botScore?: number;
	clientTrustScore?: number;
	verifiedBot?: boolean;
	jsDetectionPassed?: boolean;
	detectionIds?: number[];

	// Fingerprints
	ja3Hash?: string;
	ja4?: string;
	ja4Signals?: Record<string, number>;
}

// Helper function to extract metadata from Request
export function extractRequestMetadata(request: Request): RequestMetadata {
	const headers = request.headers;
	const cf = request.cf as IncomingRequestCfProperties | undefined;

	// Get IP from cf-connecting-ip header (most reliable) or fallback to CF property
	const remoteIp = headers.get('cf-connecting-ip') ||
	                 headers.get('x-real-ip') ||
	                 headers.get('x-forwarded-for')?.split(',')[0] ||
	                 '0.0.0.0';

	const userAgent = headers.get('user-agent') || 'unknown';

	return {
		// Basic
		remoteIp,
		userAgent,

		// Geographic (prefer request.cf over headers)
		country: cf?.country || headers.get('cf-ipcountry') || undefined,
		region: cf?.region || headers.get('cf-region') || undefined,
		city: cf?.city || headers.get('cf-ipcity') || undefined,
		postalCode: cf?.postalCode || headers.get('cf-postal-code') || undefined,
		timezone: cf?.timezone || headers.get('cf-timezone') || undefined,
		latitude: cf?.latitude || headers.get('cf-iplatitude') || undefined,
		longitude: cf?.longitude || headers.get('cf-iplongitude') || undefined,
		continent: cf?.continent || headers.get('cf-ipcontinent') || undefined,
		isEuCountry: cf?.isEUCountry,

		// Network
		asn: cf?.asn,
		asOrganization: cf?.asOrganization,
		colo: cf?.colo,
		httpProtocol: cf?.httpProtocol,
		tlsVersion: cf?.tlsVersion,
		tlsCipher: cf?.tlsCipher,

		// Bot detection (prefer cf.botManagement over headers)
		// Note: Some properties are Enterprise-only and may not be in public types
		botScore: cf?.botManagement?.score ||
		         (headers.get('cf-bot-score') ? parseInt(headers.get('cf-bot-score')!, 10) : undefined),
		clientTrustScore: cf?.clientTrustScore,
		verifiedBot: cf?.botManagement?.verifiedBot || headers.get('cf-verified-bot') === 'true',
		jsDetectionPassed: (cf?.botManagement as any)?.jsDetection?.passed,
		detectionIds: (cf?.botManagement as any)?.detectionIds,

		// Fingerprints (prefer cf.botManagement over headers)
		ja3Hash: cf?.botManagement?.ja3Hash || headers.get('cf-ja3-hash') || undefined,
		ja4: (cf?.botManagement as any)?.ja4 || headers.get('cf-ja4') || undefined,
		ja4Signals: (cf?.botManagement as any)?.ja4Signals,
	};
}

// Address data structure
export interface AddressData {
	street?: string;
	street2?: string;
	city?: string;
	state?: string;
	postalCode?: string;
	country: string;
}

// Form submission data
export interface FormSubmission {
	firstName: string;
	lastName: string;
	email: string;
	phone?: string; // Optional
	address?: AddressData; // Optional structured address
	dateOfBirth?: string; // Optional
}

// Turnstile validation result
export interface TurnstileValidationResult {
	valid: boolean;
	reason?: string;
	data?: {
		success: boolean;
		challenge_ts?: string;
		hostname?: string;
		action?: string;
		cdata?: string;
		metadata?: {
			ephemeral_id?: string;
		};
	};
	errors?: string[];
	ephemeralId?: string | null;
	// Enhanced error reporting
	userMessage?: string; // User-friendly error message for display
	debugInfo?: {
		codes: string[];
		messages: string[];
		actions: string[];
		categories: string[];
	};
}

// Fraud check result
export interface FraudCheckResult {
	allowed: boolean;
	reason?: string;
	riskScore: number;
	warnings: string[];
	retryAfter?: number; // seconds until user can retry
	expiresAt?: string; // ISO timestamp when block expires
	// Phase 1: Raw counts for normalized scoring
	ephemeralIdCount?: number;
	validationCount?: number;
	uniqueIPCount?: number;
}

// Environment bindings
export interface Env {
	// Secrets (note: use bracket notation to access)
	'TURNSTILE-SECRET-KEY': string;
	'TURNSTILE-SITE-KEY': string;
	'X-API-KEY'?: string;

	// Bindings
	DB: D1Database;
	ASSETS: Fetcher;

	// Service bindings (Worker-to-Worker RPC)
	FRAUD_DETECTOR: {
		validate(request: {
			email: string;
			consumer?: string;
			flow?: string;
		}): Promise<{
			valid: boolean;
			riskScore: number; // 0.0-1.0
			decision: 'allow' | 'warn' | 'block';
			signals: {
				markovDetected: boolean;
				markovConfidence: number;
				patternType: string;
				isDisposableDomain: boolean;
				tldRiskScore: number;
				oodDetected: boolean;
			};
		}>;
	};

	// Variables
	ENVIRONMENT?: string;
	ALLOWED_ORIGINS?: string; // Comma-separated list
	TURNSTILE_SITE_KEY?: string;
}
