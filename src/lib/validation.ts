import { z } from 'zod';

// Address schema
const addressSchema = z.object({
	street: z.string().max(100).optional(),
	street2: z.string().max(100).optional(),
	city: z.string().max(100).optional(),
	state: z.string().max(100).optional(),
	postalCode: z.string().max(20).optional(),
	country: z.string().optional(),
}).optional()
	.refine((val) => {
		// If no address data at all, that's fine
		if (!val) return true;

		// Check if any address fields have content
		const hasAddressContent = val.street || val.street2 || val.city || val.state || val.postalCode;

		// If address fields have content, country must be provided
		if (hasAddressContent && (!val.country || val.country.length < 2)) {
			return false;
		}

		return true;
	}, {
		message: 'Country is required when providing an address'
	})
	.transform((val) => {
		// Return undefined if all fields are empty
		if (!val) return undefined;
		const hasContent = val.street || val.street2 || val.city || val.state || val.postalCode || val.country;
		return hasContent ? val : undefined;
	});

// Form submission schema
export const formSubmissionSchema = z.object({
	firstName: z
		.string()
		.min(1, 'First name is required')
		.max(50, 'First name must be less than 50 characters')
		.regex(/^[a-zA-Z\s'-]+$/, 'First name contains invalid characters'),
	lastName: z
		.string()
		.min(1, 'Last name is required')
		.max(50, 'Last name must be less than 50 characters')
		.regex(/^[a-zA-Z\s'-]+$/, 'Last name contains invalid characters'),
	email: z
		.string()
		.min(1, 'Email is required')
		.email('Invalid email address')
		.max(100, 'Email must be less than 100 characters'),
	phone: z
		.string()
		.optional()
		.transform((val) => {
			if (!val || val.trim() === '') return undefined;
			// Normalize phone: remove all non-digit characters except leading +
			const cleaned = val.replace(/[^\d+]/g, '');
			// If doesn't start with +, assume US and add +1
			return cleaned.startsWith('+') ? cleaned : `+1${cleaned}`;
		})
		.pipe(
			z.string().regex(
				/^\+[1-9]\d{1,14}$/,
				'Phone must contain 7-15 digits'
			).optional()
		),
	address: addressSchema,
	dateOfBirth: z
		.string()
		.optional()
		.transform((val) => !val || val.trim() === '' ? undefined : val)
		.pipe(
			z.string()
				.regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
				.refine((date) => {
					const birthDate = new Date(date);
					const today = new Date();
					const age = today.getFullYear() - birthDate.getFullYear();
					return age >= 18 && age <= 120;
				}, 'You must be at least 18 years old')
				.optional()
		),
	turnstileToken: z.string().min(1, 'Turnstile token is required').optional(),
});

export type FormSubmissionInput = z.infer<typeof formSubmissionSchema>;

// HTML sanitization - remove all HTML tags
export function sanitizeString(input: string): string {
	return input
		.replace(/<[^>]*>/g, '') // Remove HTML tags
		.replace(/[<>]/g, '') // Remove < and >
		.trim();
}

// Sanitize all form inputs
export function sanitizeFormData(data: FormSubmissionInput) {
	return {
		firstName: sanitizeString(data.firstName),
		lastName: sanitizeString(data.lastName),
		email: sanitizeString(data.email.toLowerCase()),
		phone: data.phone, // Already normalized by schema transform (undefined if not provided)
		address: data.address ? {
			street: data.address.street ? sanitizeString(data.address.street) : undefined,
			street2: data.address.street2 ? sanitizeString(data.address.street2) : undefined,
			city: data.address.city ? sanitizeString(data.address.city) : undefined,
			state: data.address.state ? sanitizeString(data.address.state) : undefined,
			postalCode: data.address.postalCode ? sanitizeString(data.address.postalCode) : undefined,
			country: data.address.country ? sanitizeString(data.address.country) : undefined,
		} : undefined,
		dateOfBirth: data.dateOfBirth ? sanitizeString(data.dateOfBirth) : undefined,
		turnstileToken: data.turnstileToken, // Don't sanitize token
	};
}
