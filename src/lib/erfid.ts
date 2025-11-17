// ============================================================================
// Erfid (Erfi ID) - Customizable Request Tracking System
// ============================================================================
// Purpose: Generate and manage unique identifiers for tracking request lifecycle
// Configurable: Users can customize ID format, prefix, and generation strategy
// ============================================================================

export interface ErfidConfig {
	/** Custom prefix for the ID (default: "erf") */
	prefix?: string;
	/** ID format: "uuid" | "nano" | "custom" (default: "uuid") */
	format?: 'uuid' | 'nano' | 'custom';
	/** Custom generator function (only used if format="custom") */
	generator?: () => string;
	/** Include timestamp in ID (default: false) */
	includeTimestamp?: boolean;
}

/**
 * Generate a unique erfid for tracking a request across its entire lifecycle
 *
 * @param config - Optional configuration for ID generation
 * @returns Unique identifier string
 *
 * @example
 * ```typescript
 * // Default: UUID v4
 * const id = generateErfid(); // "550e8400-e29b-41d4-a716-446655440000"
 *
 * // With prefix
 * const id = generateErfid({ prefix: "myapp" }); // "myapp_550e8400-e29b-41d4-a716-446655440000"
 *
 * // With timestamp
 * const id = generateErfid({ includeTimestamp: true }); // "1700000000000_550e8400-e29b-41d4-a716-446655440000"
 *
 * // Custom format (nano ID style - shorter)
 * const id = generateErfid({ format: "nano" }); // "V1StGXR8_Z5jdHi6B-myT"
 *
 * // Fully custom
 * const id = generateErfid({
 *   format: "custom",
 *   generator: () => `custom-${Date.now()}-${Math.random().toString(36)}`
 * });
 * ```
 */
export function generateErfid(config?: ErfidConfig): string {
	const {
		prefix = 'erf',
		format = 'uuid',
		generator,
		includeTimestamp = false
	} = config || {};

	let baseId: string;

	// Generate base ID based on format
	switch (format) {
		case 'uuid':
			baseId = crypto.randomUUID();
			break;

		case 'nano':
			// Generate a shorter nano-style ID (21 chars, URL-safe)
			baseId = generateNanoId();
			break;

		case 'custom':
			if (!generator) {
				throw new Error('Custom format requires a generator function');
			}
			baseId = generator();
			break;

		default:
			baseId = crypto.randomUUID();
	}

	// Build final ID with optional components
	const parts: string[] = [];

	if (prefix) {
		parts.push(prefix);
	}

	if (includeTimestamp) {
		parts.push(Date.now().toString());
	}

	parts.push(baseId);

	return parts.join('_');
}

/**
 * Generate a nano-style ID (shorter than UUID, still highly unique)
 * Format: 21 characters, URL-safe (a-zA-Z0-9_-)
 * Collision probability: ~1 million years to have 1% collision chance at 1000 IDs/hour
 */
function generateNanoId(length: number = 21): string {
	const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
	const bytes = new Uint8Array(length);
	crypto.getRandomValues(bytes);

	let id = '';
	for (let i = 0; i < length; i++) {
		id += alphabet[bytes[i] % alphabet.length];
	}

	return id;
}

/**
 * Validate erfid format
 *
 * @param erfid - The ID to validate
 * @param config - Expected configuration (for validation)
 * @returns true if valid, false otherwise
 */
export function validateErfid(erfid: string, config?: ErfidConfig): boolean {
	if (!erfid || typeof erfid !== 'string') {
		return false;
	}

	const { prefix, format = 'uuid' } = config || {};

	// Check prefix if configured
	if (prefix && !erfid.startsWith(`${prefix}_`)) {
		return false;
	}

	// Extract base ID (remove prefix and timestamp if present)
	const parts = erfid.split('_');
	const baseId = parts[parts.length - 1];

	// Validate based on format
	switch (format) {
		case 'uuid':
			// UUID v4 format: 8-4-4-4-12
			return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(baseId);

		case 'nano':
			// Nano ID: 21 chars, alphanumeric + _-
			return /^[A-Za-z0-9_-]{21}$/.test(baseId);

		case 'custom':
			// Custom format - just check it exists
			return baseId.length > 0;

		default:
			return false;
	}
}

/**
 * Parse erfid to extract components
 *
 * @param erfid - The ID to parse
 * @returns Parsed components
 */
export function parseErfid(erfid: string): {
	prefix?: string;
	timestamp?: number;
	baseId: string;
	full: string;
} {
	const parts = erfid.split('_');

	if (parts.length === 1) {
		// No prefix or timestamp
		return { baseId: parts[0], full: erfid };
	}

	if (parts.length === 2) {
		// Could be prefix_id or timestamp_id
		const first = parts[0];
		const isTimestamp = /^\d{13}$/.test(first); // 13 digits = millisecond timestamp

		if (isTimestamp) {
			return {
				timestamp: parseInt(first, 10),
				baseId: parts[1],
				full: erfid
			};
		} else {
			return {
				prefix: first,
				baseId: parts[1],
				full: erfid
			};
		}
	}

	// parts.length === 3: prefix_timestamp_id
	return {
		prefix: parts[0],
		timestamp: parseInt(parts[1], 10),
		baseId: parts[2],
		full: erfid
	};
}

// ============================================================================
// Configuration Management
// ============================================================================

let globalConfig: ErfidConfig | undefined;

/**
 * Set global erfid configuration
 * Call this once at application startup
 *
 * @param config - Global erfid configuration
 */
export function configureErfid(config: ErfidConfig): void {
	globalConfig = config;
}

/**
 * Get global erfid configuration
 */
export function getErfidConfig(): ErfidConfig | undefined {
	return globalConfig;
}

/**
 * Generate erfid using global configuration
 */
export function generateErfidGlobal(): string {
	return generateErfid(globalConfig);
}
