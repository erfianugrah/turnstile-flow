import type { Env } from './types';
import logger from './logger';

/**
 * Field mapping configuration structure
 * Stored in KV under key: "field_mappings"
 */
export interface FieldMappingConfig {
	[fieldType: string]: {
		paths: string[]; // Field names to try in order
		required: boolean; // Is this field required?
		fraudDetection: boolean; // Use for fraud detection?
		validation?: {
			maxLength?: number;
			pattern?: string; // Regex pattern
			type?: 'email' | 'phone' | 'url' | 'date' | 'string';
		};
	};
}

/**
 * Default field mappings (fallback if KV not configured)
 */
const DEFAULT_MAPPINGS: FieldMappingConfig = {
	email: {
		paths: ['email', 'userEmail', 'contact_email', 'emailAddress', 'e-mail'],
		required: false,
		fraudDetection: true,
		validation: {
			maxLength: 255,
			type: 'email',
		},
	},
	phone: {
		paths: ['phone', 'phoneNumber', 'contact_phone', 'mobile', 'tel'],
		required: false,
		fraudDetection: false,
		validation: {
			maxLength: 20,
			type: 'phone',
		},
	},
	firstName: {
		paths: ['firstName', 'first_name', 'fname', 'givenName'],
		required: false,
		fraudDetection: false,
		validation: {
			maxLength: 100,
			type: 'string',
		},
	},
	lastName: {
		paths: ['lastName', 'last_name', 'lname', 'surname', 'familyName'],
		required: false,
		fraudDetection: false,
		validation: {
			maxLength: 100,
			type: 'string',
		},
	},
	turnstileToken: {
		paths: ['turnstileToken', 'cf-turnstile-response', 'captcha_token', 'turnstile'],
		required: true,
		fraudDetection: false,
	},
};

// In-memory cache for field mappings (similar to markov-mail pattern)
let cachedMappings: FieldMappingConfig | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL = 3600000; // 1 hour in milliseconds

/**
 * Load field mappings from KV with caching
 * Pattern inspired by markov-mail/src/services/disposable-domain-updater.ts
 */
export async function loadFieldMappings(env: Env): Promise<FieldMappingConfig> {
	// Check cache validity
	const now = Date.now();
	if (cachedMappings && now - cacheTimestamp < CACHE_TTL) {
		return cachedMappings;
	}

	// Load from KV
	if (!env.FORM_CONFIG) {
		logger.warn('FORM_CONFIG namespace not configured, using defaults');
		cachedMappings = DEFAULT_MAPPINGS;
		cacheTimestamp = now;
		return DEFAULT_MAPPINGS;
	}

	try {
		const mappingsStr = await env.FORM_CONFIG.get('field_mappings');

		if (!mappingsStr) {
			logger.info('No field mappings in KV, using defaults');
			cachedMappings = DEFAULT_MAPPINGS;
			cacheTimestamp = now;
			return DEFAULT_MAPPINGS;
		}

		const mappings = JSON.parse(mappingsStr) as FieldMappingConfig;

		logger.info(
			{
				event: 'field_mappings_loaded',
				fields_count: Object.keys(mappings).length,
				cache_ttl_hours: CACHE_TTL / 3600000,
			},
			'Field mappings loaded from KV',
		);

		cachedMappings = mappings;
		cacheTimestamp = now;
		return mappings;
	} catch (error) {
		logger.error({ error }, 'Failed to load field mappings from KV, using defaults');
		cachedMappings = DEFAULT_MAPPINGS;
		cacheTimestamp = now;
		return DEFAULT_MAPPINGS;
	}
}

/**
 * Extract a single field value from payload using configured mappings
 */
export async function extractField(
	payload: Record<string, any>,
	fieldType: string,
	env: Env,
): Promise<string | null> {
	const mappings = await loadFieldMappings(env);
	const config = mappings[fieldType];

	if (!config) {
		logger.warn({ fieldType }, 'No mapping configuration for field type');
		return null;
	}

	// Try each path in order
	for (const path of config.paths) {
		const value = getNestedValue(payload, path);

		if (value !== null && value !== undefined && value !== '') {
			const stringValue = String(value).trim();

			// Validate if validation rules exist
			if (config.validation) {
				if (!validateFieldValue(stringValue, config.validation)) {
					logger.warn(
						{
							fieldType,
							path,
							validation: config.validation,
						},
						'Field value failed validation',
					);
					continue; // Try next path
				}
			}

			return stringValue;
		}
	}

	// Required but not found?
	if (config.required) {
		throw new Error(
			`Required field '${fieldType}' not found in payload. ` +
				`Tried paths: ${config.paths.join(', ')}`,
		);
	}

	return null;
}

/**
 * Extract all configured fields from payload
 * Returns both raw payload and extracted fields
 */
export async function extractFields(
	payload: Record<string, any>,
	env: Env,
): Promise<{
	raw: Record<string, any>;
	extracted: Record<string, string | null>;
	metadata: {
		fieldsFound: string[];
		fieldsMissing: string[];
		requiredMissing: string[];
	};
}> {
	const mappings = await loadFieldMappings(env);
	const extracted: Record<string, string | null> = {};
	const fieldsFound: string[] = [];
	const fieldsMissing: string[] = [];
	const requiredMissing: string[] = [];

	// Extract each configured field
	for (const [fieldType, config] of Object.entries(mappings)) {
		try {
			const value = await extractField(payload, fieldType, env);
			extracted[fieldType] = value;

			if (value !== null) {
				fieldsFound.push(fieldType);
			} else {
				fieldsMissing.push(fieldType);
				if (config.required) {
					requiredMissing.push(fieldType);
				}
			}
		} catch (error) {
			// Re-throw for required fields
			if (config.required) {
				throw error;
			}

			logger.warn({ fieldType, error }, 'Failed to extract optional field');
			extracted[fieldType] = null;
			fieldsMissing.push(fieldType);
		}
	}

	return {
		raw: payload,
		extracted,
		metadata: {
			fieldsFound,
			fieldsMissing,
			requiredMissing,
		},
	};
}

/**
 * Get nested value from object using dot notation
 * Example: getNestedValue({user: {email: 'test@example.com'}}, 'user.email')
 */
function getNestedValue(obj: any, path: string): any {
	return path.split('.').reduce((current, key) => current?.[key], obj);
}

/**
 * Validate field value against validation rules
 */
function validateFieldValue(
	value: string,
	validation: NonNullable<FieldMappingConfig[string]['validation']>,
): boolean {
	// Max length check
	if (validation.maxLength && value.length > validation.maxLength) {
		return false;
	}

	// Pattern check (regex)
	if (validation.pattern) {
		const regex = new RegExp(validation.pattern);
		if (!regex.test(value)) {
			return false;
		}
	}

	// Type-specific validation
	if (validation.type) {
		switch (validation.type) {
			case 'email':
				// Simple email validation
				return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
			case 'phone':
				// Allow digits, spaces, dashes, parentheses, plus
				return /^[\d\s\-\(\)\+]+$/.test(value);
			case 'url':
				try {
					new URL(value);
					return true;
				} catch {
					return false;
				}
			case 'date':
				return !isNaN(Date.parse(value));
			case 'string':
				// Already a string, just check it's not empty
				return value.length > 0;
		}
	}

	return true;
}

/**
 * Clear the cache (useful for testing or forced refresh)
 */
export function clearFieldMappingsCache(): void {
	cachedMappings = null;
	cacheTimestamp = 0;
}
