import { z } from 'zod';

// Address data structure - all fields optional, but if any are provided, country is required
export const addressSchema = z.object({
	street: z.string().optional(),
	street2: z.string().optional(),
	city: z.string().optional(),
	state: z.string().optional(),
	postalCode: z.string().optional(),
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

export type AddressData = z.infer<typeof addressSchema>;

// Frontend form validation schema (matches backend schema)
export const formSchema = z.object({
	firstName: z
		.string()
		.min(1, 'First name is required')
		.max(50, 'First name must be less than 50 characters')
		.regex(/^[a-zA-Z\s'-]+$/, 'Only letters, spaces, hyphens, and apostrophes allowed'),
	lastName: z
		.string()
		.min(1, 'Last name is required')
		.max(50, 'Last name must be less than 50 characters')
		.regex(/^[a-zA-Z\s'-]+$/, 'Only letters, spaces, hyphens, and apostrophes allowed'),
	email: z
		.string()
		.min(1, 'Email is required')
		.email('Invalid email address')
		.max(100, 'Email must be less than 100 characters'),
	phone: z
		.string()
		.optional()
		.refine((val) => {
			if (!val || val.trim() === '') return true; // Allow empty
			const digits = val.replace(/\D/g, '');
			return digits.length >= 7 && digits.length <= 15;
		}, 'Phone must contain 7-15 digits'),
	address: addressSchema,
	dateOfBirth: z
		.string()
		.optional()
		.refine((val) => {
			if (!val || val.trim() === '') return true; // Allow empty
			return /^\d{4}-\d{2}-\d{2}$/.test(val);
		}, 'Invalid date format (YYYY-MM-DD)')
		.refine((val) => {
			if (!val || val.trim() === '') return true; // Allow empty
			const birthDate = new Date(val);
			const today = new Date();
			const age = today.getFullYear() - birthDate.getFullYear();
			const monthDiff = today.getMonth() - birthDate.getMonth();
			const actualAge =
				monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())
					? age - 1
					: age;
			return actualAge >= 18 && actualAge <= 120;
		}, 'You must be at least 18 years old'),
});

export type FormData = z.infer<typeof formSchema>;
