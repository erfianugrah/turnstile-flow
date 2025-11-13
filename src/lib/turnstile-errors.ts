/**
 * Turnstile Error Code Dictionary
 * Complete reference: https://developers.cloudflare.com/turnstile/troubleshooting/client-side-errors/
 */

export interface TurnstileError {
	code: string;
	category: 'client' | 'server' | 'network' | 'configuration';
	title: string;
	description: string;
	userMessage: string;
	debugMessage: string;
	action: 'retry' | 'reload' | 'contact_support' | 'check_config';
}

export const TURNSTILE_ERRORS: Record<string, TurnstileError> = {
	// Client-Side Errors (100xxx)
	'100xxx': {
		code: '100xxx',
		category: 'client',
		title: 'Initialization Problems',
		description: 'There was a problem initializing Turnstile before a challenge could be started',
		userMessage: 'Unable to load verification. Please refresh the page.',
		debugMessage: 'Turnstile widget failed to initialize. Could be caused by an old instance of solved challenge.',
		action: 'reload',
	},
	'102xxx': {
		code: '102xxx',
		category: 'client',
		title: 'Invalid Parameters',
		description: 'The visitor sent an invalid parameter as part of the challenge towards Turnstile',
		userMessage: 'Verification failed. Please try again.',
		debugMessage: 'Visitor sent invalid parameter. On continuous failures, indicative of automated device.',
		action: 'retry',
	},
	'103xxx': {
		code: '103xxx',
		category: 'client',
		title: 'Invalid Parameters',
		description: 'The visitor sent an invalid parameter as part of the challenge towards Turnstile',
		userMessage: 'Verification failed. Please try again.',
		debugMessage: 'Visitor sent invalid parameter. On continuous failures, indicative of automated device.',
		action: 'retry',
	},
	'104xxx': {
		code: '104xxx',
		category: 'client',
		title: 'Invalid Parameters',
		description: 'The visitor sent an invalid parameter as part of the challenge towards Turnstile',
		userMessage: 'Verification failed. Please try again.',
		debugMessage: 'Visitor sent invalid parameter. On continuous failures, indicative of automated device.',
		action: 'retry',
	},
	'105xxx': {
		code: '105xxx',
		category: 'configuration',
		title: 'Turnstile API Compatibility',
		description: 'Turnstile was invoked in a deprecated or invalid way',
		userMessage: 'Verification system needs updating. Please refresh the page.',
		debugMessage: 'Turnstile invoked in deprecated or invalid way. Refer to documentation.',
		action: 'reload',
	},
	'106xxx': {
		code: '106xxx',
		category: 'client',
		title: 'Invalid Parameters',
		description: 'The visitor sent an invalid parameter as part of the challenge towards Turnstile',
		userMessage: 'Verification failed. Please try again.',
		debugMessage: 'Visitor sent invalid parameter. On continuous failures, indicative of automated device.',
		action: 'retry',
	},
	'110100': {
		code: '110100',
		category: 'configuration',
		title: 'Invalid Sitekey',
		description: 'Turnstile was invoked with an invalid sitekey or a sitekey that is no longer active',
		userMessage: 'Configuration error. Please contact support.',
		debugMessage: 'Invalid or inactive sitekey. Verify sitekey in Cloudflare dashboard.',
		action: 'check_config',
	},
	'110110': {
		code: '110110',
		category: 'configuration',
		title: 'Invalid Sitekey',
		description: 'Turnstile was invoked with an invalid sitekey or a sitekey that is no longer active',
		userMessage: 'Configuration error. Please contact support.',
		debugMessage: 'Invalid or inactive sitekey. Verify sitekey in Cloudflare dashboard.',
		action: 'check_config',
	},
	'110200': {
		code: '110200',
		category: 'configuration',
		title: 'Unknown Domain',
		description: 'Domain not allowed for this widget',
		userMessage: 'This domain is not authorized for verification. Please contact support.',
		debugMessage: 'Domain not allowed in widget configuration. Check allowed domains in dashboard.',
		action: 'check_config',
	},
	'110420': {
		code: '110420',
		category: 'configuration',
		title: 'Invalid Action',
		description: 'An unsupported or incorrectly formatted action is submitted',
		userMessage: 'Configuration error. Please try again.',
		debugMessage: 'Invalid action format. Action must be alphanumeric, max 32 chars.',
		action: 'check_config',
	},
	'110430': {
		code: '110430',
		category: 'configuration',
		title: 'Invalid cData',
		description: 'Custom Data (cData) does not adhere to expected format or contains invalid characters',
		userMessage: 'Configuration error. Please try again.',
		debugMessage: 'Invalid cData format. cData must be alphanumeric, max 255 chars.',
		action: 'check_config',
	},
	'110500': {
		code: '110500',
		category: 'client',
		title: 'Unsupported Browser',
		description: 'The visitor is using an unsupported browser',
		userMessage: 'Your browser is not supported. Please upgrade to a modern browser (Chrome, Firefox, Safari, Edge).',
		debugMessage: 'Unsupported browser. Refer to supported browsers documentation.',
		action: 'contact_support',
	},
	'110510': {
		code: '110510',
		category: 'client',
		title: 'Inconsistent User-Agent',
		description: 'The visitor provided an inconsistent user-agent throughout the process',
		userMessage: 'Browser settings issue detected. Please disable browser extensions and try again.',
		debugMessage: 'Inconsistent user-agent. Visitor may have extensions spoofing user-agent.',
		action: 'retry',
	},
	'11060x': {
		code: '11060x',
		category: 'client',
		title: 'Challenge Timed Out',
		description: 'The visitor took too long to solve the challenge',
		userMessage: 'Verification timed out. Please try again.',
		debugMessage: 'Challenge timeout. Visitor may have wrong system clock.',
		action: 'retry',
	},
	'11062x': {
		code: '11062x',
		category: 'client',
		title: 'Challenge Timed Out (Visible Mode)',
		description: 'Interactive challenge became outdated (visible mode only)',
		userMessage: 'Verification timed out. Please try again.',
		debugMessage: 'Interactive challenge timeout. Reset widget and re-initialize.',
		action: 'retry',
	},
	'120xxx': {
		code: '120xxx',
		category: 'client',
		title: 'Internal Errors',
		description: 'Internal errors for Cloudflare employees',
		userMessage: 'Internal verification error. Please contact support.',
		debugMessage: 'Internal Cloudflare error - only encountered by Support Engineers.',
		action: 'contact_support',
	},
	'200010': {
		code: '200010',
		category: 'client',
		title: 'Invalid Caching',
		description: 'Some portion of Turnstile was accidentally cached',
		userMessage: 'Cache issue detected. Please clear your browser cache and try again.',
		debugMessage: 'Turnstile resources cached. Visitor should clear cache.',
		action: 'reload',
	},
	'200100': {
		code: '200100',
		category: 'client',
		title: 'Time Problem',
		description: "The visitor's clock is incorrect",
		userMessage: 'System clock error. Please set your device clock to the correct time.',
		debugMessage: "Visitor's system clock is incorrect.",
		action: 'contact_support',
	},
	'200500': {
		code: '200500',
		category: 'client',
		title: 'Loading Error',
		description: 'The iframe under challenges.cloudflare.com could not be loaded',
		userMessage: 'Unable to load verification. Please check your security settings or disable ad blockers.',
		debugMessage: 'challenges.cloudflare.com iframe blocked. Check CSP or browser security settings.',
		action: 'contact_support',
	},
	'300xxx': {
		code: '300xxx',
		category: 'client',
		title: 'Generic Client Execution Error',
		description: 'An unspecified error occurred while solving a challenge',
		userMessage: 'Verification error. Please try again.',
		debugMessage: 'Generic client execution error. Potentially automated visitor.',
		action: 'retry',
	},
	'400020': {
		code: '400020',
		category: 'configuration',
		title: 'Invalid Sitekey',
		description: 'The sitekey is invalid or does not exist',
		userMessage: 'Configuration error. Please contact support.',
		debugMessage: 'Invalid or non-existent sitekey.',
		action: 'check_config',
	},
	'400030': {
		code: '400030',
		category: 'configuration',
		title: 'Invalid Size',
		description: 'The provided size is not a valid option',
		userMessage: 'Configuration error. Please contact support.',
		debugMessage: 'Invalid widget size. Must be normal, compact, or flexible.',
		action: 'check_config',
	},
	'400040': {
		code: '400040',
		category: 'configuration',
		title: 'Invalid Theme',
		description: 'The provided theme is not a valid option',
		userMessage: 'Configuration error. Please contact support.',
		debugMessage: 'Invalid theme. Must be light, dark, or auto.',
		action: 'check_config',
	},
	'600xxx': {
		code: '600xxx',
		category: 'client',
		title: 'Challenge Execution Failure',
		description: 'A visitor failed to solve a Turnstile Challenge',
		userMessage: 'Verification failed. Please try again.',
		debugMessage: 'Challenge execution failure. Potentially automated visitor.',
		action: 'retry',
	},

	// Server-Side Error Codes (from siteverify API)
	'missing-input-secret': {
		code: 'missing-input-secret',
		category: 'configuration',
		title: 'Missing Secret Key',
		description: 'The secret parameter was not passed',
		userMessage: 'Configuration error. Please contact support.',
		debugMessage: 'Server missing TURNSTILE_SECRET_KEY environment variable',
		action: 'check_config',
	},
	'invalid-input-secret': {
		code: 'invalid-input-secret',
		category: 'configuration',
		title: 'Invalid Secret Key',
		description: 'The secret parameter was invalid or did not exist',
		userMessage: 'Configuration error. Please contact support.',
		debugMessage: 'Invalid TURNSTILE_SECRET_KEY in environment',
		action: 'check_config',
	},
	'missing-input-response': {
		code: 'missing-input-response',
		category: 'server',
		title: 'Missing Token',
		description: 'The response parameter (token) was not passed',
		userMessage: 'Verification token missing. Please complete the verification.',
		debugMessage: 'Turnstile token not included in request',
		action: 'retry',
	},
	'invalid-input-response': {
		code: 'invalid-input-response',
		category: 'server',
		title: 'Invalid Token',
		description: 'The response parameter (token) is invalid or has expired',
		userMessage: 'Verification token invalid or expired. Please verify again.',
		debugMessage: 'Turnstile token invalid, expired, or already used',
		action: 'retry',
	},
	'bad-request': {
		code: 'bad-request',
		category: 'server',
		title: 'Bad Request',
		description: 'The request was malformed',
		userMessage: 'Invalid request. Please try again.',
		debugMessage: 'Malformed siteverify request',
		action: 'retry',
	},
	'timeout-or-duplicate': {
		code: 'timeout-or-duplicate',
		category: 'server',
		title: 'Token Expired or Reused',
		description: 'The response parameter has already been validated or has expired',
		userMessage: 'This verification has already been used or expired. Please verify again.',
		debugMessage: 'Token timeout or duplicate submission detected',
		action: 'retry',
	},
	'internal-error': {
		code: 'internal-error',
		category: 'server',
		title: 'Internal Error',
		description: 'An internal error occurred while validating the response parameter',
		userMessage: 'Verification system error. Please try again.',
		debugMessage: 'Turnstile internal validation error',
		action: 'retry',
	},
};

/**
 * Get error details for a given error code
 * Supports both exact matches and wildcard patterns (e.g., "102xxx", "11060x")
 */
export function getTurnstileError(errorCode: string): TurnstileError {
	// Try exact match first
	if (TURNSTILE_ERRORS[errorCode]) {
		return TURNSTILE_ERRORS[errorCode];
	}

	// Try 3-digit wildcard match (e.g., "102001" -> "102xxx")
	const wildcardCode3 = errorCode.slice(0, 3) + 'xxx';
	if (TURNSTILE_ERRORS[wildcardCode3]) {
		return { ...TURNSTILE_ERRORS[wildcardCode3], code: errorCode };
	}

	// Try 5-digit wildcard match (e.g., "110601" -> "11060x")
	if (errorCode.length >= 5) {
		const wildcardCode5 = errorCode.slice(0, 5) + 'x';
		if (TURNSTILE_ERRORS[wildcardCode5]) {
			return { ...TURNSTILE_ERRORS[wildcardCode5], code: errorCode };
		}
	}

	// Generic error if not found
	return {
		code: errorCode,
		category: 'client',
		title: 'Unknown Error',
		description: `Unknown Turnstile error: ${errorCode}`,
		userMessage: 'Verification error occurred. Please try again.',
		debugMessage: `Unknown Turnstile error code: ${errorCode}`,
		action: 'retry',
	};
}

/**
 * Get user-friendly error message for display
 */
export function getUserErrorMessage(errorCodes: string[]): string {
	if (!errorCodes || errorCodes.length === 0) {
		return 'Verification failed. Please try again.';
	}

	// Get the first error (usually most relevant)
	const error = getTurnstileError(errorCodes[0]);
	return error.userMessage;
}

/**
 * Get debug information for logging
 */
export function getDebugErrorInfo(errorCodes: string[]): {
	codes: string[];
	messages: string[];
	actions: string[];
	categories: string[];
} {
	const codes = errorCodes || [];
	const errors = codes.map(getTurnstileError);

	return {
		codes,
		messages: errors.map(e => e.debugMessage),
		actions: errors.map(e => e.action),
		categories: errors.map(e => e.category),
	};
}

/**
 * Check if error is configuration-related (needs developer attention)
 */
export function isConfigurationError(errorCodes: string[]): boolean {
	return errorCodes.some(code => {
		const error = getTurnstileError(code);
		return error.category === 'configuration';
	});
}

/**
 * Check if error is user-recoverable (can retry)
 */
export function isRetryableError(errorCodes: string[]): boolean {
	return errorCodes.every(code => {
		const error = getTurnstileError(code);
		return error.action === 'retry';
	});
}
