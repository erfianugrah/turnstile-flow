// Cloudflare Request types based on Workers documentation
// See: https://developers.cloudflare.com/workers/runtime-apis/request/#incomingrequestcfproperties

import type { IncomingRequestCfProperties } from '@cloudflare/workers-types';
import type { RouteConfig } from './router';
import type { ErfidConfig } from './erfid';

// Re-export for convenience
export type { IncomingRequestCfProperties };

interface ClientHintsMetadata {
	ua?: string;
	platform?: string;
	platformVersion?: string;
	architecture?: string;
	model?: string;
	mobile?: string;
	fullVersionList?: string;
}

interface FetchMetadata {
	site?: string;
	mode?: string;
	dest?: string;
	user?: string;
}

interface TLSExportedAuthenticatorMetadata {
	clientFinished?: string;
	clientHandshake?: string;
	serverHandshake?: string;
	serverFinished?: string;
}

interface TLSClientAuthMetadata {
	certIssuerDNLegacy?: string;
	certSubjectDNLegacy?: string;
	certFingerprintSHA256?: string;
	certFingerprintSHA1?: string;
	certIssuerDN?: string;
	certSubjectDN?: string;
	certIssuerDNRFC2253?: string;
	certSubjectDNRFC2253?: string;
	certSerial?: string;
	certIssuerSerial?: string;
	certSKI?: string;
	certIssuerSKI?: string;
	certNotBefore?: string;
	certNotAfter?: string;
	certPresented?: string;
	certVerified?: string;
	certRevoked?: string;
}

// Extracted metadata from request
export interface RequestMetadata {
	// Basic
	remoteIp: string;
	userAgent: string;
	trueClientIp?: string;
	cfRay?: string;
	cfVisitor?: string;

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
	requestPriority?: string;
	deviceType?: string;
	clientTcpRtt?: number;
	edgeRequestKeepAliveStatus?: number;
	tlsClientHelloLength?: number;
	tlsClientRandom?: string;
	tlsClientExtensionsSha1?: string;
	tlsClientExtensionsSha1Le?: string;
	tlsExportedAuthenticator?: TLSExportedAuthenticatorMetadata | null;
	tlsClientAuth?: TLSClientAuthMetadata | null;

	// Bot detection
	botScore?: number;
	clientTrustScore?: number;
	verifiedBot?: boolean;
	jsDetectionPassed?: boolean;
	detectionIds?: number[];
	corporateProxy?: boolean;
	verifiedBotCategory?: string;
	staticResource?: boolean;

	// Fingerprints
	ja3Hash?: string;
	ja4?: string;
	ja4Signals?: Record<string, number>;

	// HTTP hints & headers
	accept?: string;
	acceptLanguage?: string;
	acceptEncoding?: string;
	acceptCharset?: string;
	priorityHeader?: string;
	dnt?: string;
	clientHints?: ClientHintsMetadata;
	fetchMetadata?: FetchMetadata;
	secFetchSite?: string;
	secFetchMode?: string;
	secFetchDest?: string;
	secFetchUser?: string;
	requestHeaders?: Record<string, string>;
	headersFingerprint?: string;
}

function buildHeaderSnapshot(headers: Headers): {
	record: Record<string, string>;
	fingerprint?: string;
} {
	const normalizedEntries: [string, string][] = [];
	headers.forEach((value, key) => {
		const normalizedKey = key.toLowerCase();
		if (normalizedKey === 'cookie' || normalizedKey === 'authorization') {
			return; // avoid storing sensitive secrets in logs/DB
		}
		normalizedEntries.push([normalizedKey, value]);
	});

	const record: Record<string, string> = {};
	for (const [key, value] of normalizedEntries) {
		record[key] = value;
	}

	if (normalizedEntries.length === 0) {
		return { record };
	}

	const fingerprintSource = normalizedEntries
		.slice()
		.sort((a, b) => a[0].localeCompare(b[0]))
		.map(([key, value]) => `${key}:${value}`)
		.join('|');

	return {
		record,
		fingerprint: fnv1a(fingerprintSource),
	};
}

function fnv1a(input: string): string {
	let hash = 0x811c9dc5;
	for (let i = 0; i < input.length; i += 1) {
		hash ^= input.charCodeAt(i);
		hash = (hash >>> 0) * 0x01000193;
		hash >>>= 0;
	}
	return hash.toString(16).padStart(8, '0');
}

// Helper function to extract metadata from Request
export function extractRequestMetadata(request: Request): RequestMetadata {
	const headers = request.headers;
	const cf = request.cf as IncomingRequestCfProperties | undefined;
	const cfAny = cf as any;
	const headerSnapshot = buildHeaderSnapshot(headers);

	// Get IP from cf-connecting-ip header (most reliable) or fallback to CF property
	const remoteIp = headers.get('cf-connecting-ip') ||
	                 headers.get('x-real-ip') ||
	                 headers.get('x-forwarded-for')?.split(',')[0] ||
	                 '0.0.0.0';

	const userAgent = headers.get('user-agent') || 'unknown';
	const trueClientIp = headers.get('true-client-ip') || undefined;
	const cfRay = headers.get('cf-ray') || (cfAny?.ray ? String(cfAny.ray) : undefined);
	const cfVisitor = headers.get('cf-visitor') || undefined;

	return {
		// Basic
		remoteIp,
		userAgent,
		trueClientIp,
		cfRay,
		cfVisitor,

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
		requestPriority: cfAny?.requestPriority || headers.get('priority') || undefined,
		deviceType: cfAny?.deviceType,
		clientTcpRtt: cfAny?.clientTcpRtt,
		edgeRequestKeepAliveStatus: cfAny?.edgeRequestKeepAliveStatus,
		tlsClientHelloLength: cfAny?.tlsClientHelloLength ? Number(cfAny.tlsClientHelloLength) : undefined,
		tlsClientRandom: cfAny?.tlsClientRandom,
		tlsClientExtensionsSha1: cfAny?.tlsClientExtensionsSha1,
		tlsClientExtensionsSha1Le: cfAny?.tlsClientExtensionsSha1Le,
		tlsExportedAuthenticator: cfAny?.tlsExportedAuthenticator || null,
		tlsClientAuth: cfAny?.tlsClientAuth || null,

		// Bot detection (prefer cf.botManagement over headers)
		botScore: cf?.botManagement?.score ||
		         (headers.get('cf-bot-score') ? parseInt(headers.get('cf-bot-score')!, 10) : undefined),
		clientTrustScore: cfAny?.clientTrustScore,
		verifiedBot: cf?.botManagement?.verifiedBot || headers.get('cf-verified-bot') === 'true',
		jsDetectionPassed: (cf?.botManagement as any)?.jsDetection?.passed,
		detectionIds: (cf?.botManagement as any)?.detectionIds,
		corporateProxy: (cf?.botManagement as any)?.corporateProxy ?? undefined,
		verifiedBotCategory: (cf?.botManagement as any)?.verifiedBotCategory,
		staticResource: (cf?.botManagement as any)?.staticResource,

		// Fingerprints (prefer cf.botManagement over headers)
		ja3Hash: cf?.botManagement?.ja3Hash || headers.get('cf-ja3-hash') || undefined,
		ja4: (cf?.botManagement as any)?.ja4 || headers.get('cf-ja4') || undefined,
		ja4Signals: (cf?.botManagement as any)?.ja4Signals,

		// HTTP hints & metadata
		accept: headers.get('accept') || undefined,
		acceptLanguage: headers.get('accept-language') || undefined,
		acceptEncoding: headers.get('accept-encoding') || undefined,
		acceptCharset: headers.get('accept-charset') || undefined,
		priorityHeader: headers.get('priority') || undefined,
		dnt: headers.get('dnt') || undefined,
		clientHints: {
			ua: headers.get('sec-ch-ua') || undefined,
			platform: headers.get('sec-ch-ua-platform') || undefined,
			platformVersion: headers.get('sec-ch-ua-platform-version') || undefined,
			architecture: headers.get('sec-ch-ua-arch') || undefined,
			model: headers.get('sec-ch-ua-model') || undefined,
			mobile: headers.get('sec-ch-ua-mobile') || undefined,
			fullVersionList: headers.get('sec-ch-ua-full-version-list') || undefined,
		},
		fetchMetadata: {
			site: headers.get('sec-fetch-site') || undefined,
			mode: headers.get('sec-fetch-mode') || undefined,
			dest: headers.get('sec-fetch-dest') || undefined,
			user: headers.get('sec-fetch-user') || undefined,
		},
		secFetchSite: headers.get('sec-fetch-site') || undefined,
		secFetchMode: headers.get('sec-fetch-mode') || undefined,
		secFetchDest: headers.get('sec-fetch-dest') || undefined,
		secFetchUser: headers.get('sec-fetch-user') || undefined,
		requestHeaders: Object.keys(headerSnapshot.record).length ? headerSnapshot.record : undefined,
		headersFingerprint: headerSnapshot.fingerprint,
	};
}

// Address data structure
export interface AddressData {
	street?: string;
	street2?: string;
	city?: string;
	state?: string;
	postalCode?: string;
	country?: string;
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
			headers?: Record<string, string | null>; // v2.5: Pass request.cf metadata
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

	// KV Namespaces
	FORM_CONFIG?: KVNamespace; // Field mappings for payload-agnostic forms

	// Variables
	ENVIRONMENT?: string;
	ALLOWED_ORIGINS?: string; // Comma-separated list
	TURNSTILE_SITE_KEY?: string;
	ALLOW_TESTING_BYPASS?: string; // Enable testing bypass (set to 'true' in dev/staging only)
	ROUTES?: RouteConfig | string; // Dynamic route configuration (JSON string or object)
	FRAUD_CONFIG?: Record<string, any> | string; // Fraud detection configuration (JSON string or object)
	ERFID_CONFIG?: ErfidConfig | string; // Custom ID configuration (JSON string or object)
}
