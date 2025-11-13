import { z } from 'zod';

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
	address: z
		.string()
		.optional()
		.transform((val) => !val || val.trim() === '' ? undefined : val)
		.pipe(
			z.string().max(200, 'Address must be less than 200 characters').optional()
		),
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
	turnstileToken: z.string().min(1, 'Turnstile token is required'),
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
		address: data.address ? sanitizeString(data.address) : undefined,
		dateOfBirth: data.dateOfBirth ? sanitizeString(data.dateOfBirth) : undefined,
		turnstileToken: data.turnstileToken, // Don't sanitize token
	};
}
