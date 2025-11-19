# Form Validation Implementation

## Architecture

Dual validation strategy using React Hook Form + Zod:
- **Client**: Immediate feedback with `onBlur` mode
- **Server**: Security enforcement using the same Zod schema
- **Shared schema**: Both client and server use identical validation rules

## File Structure

```
frontend/src/
├── lib/validation.ts              # Zod schema (imported by both client & server)
└── components/SubmissionForm.tsx  # React Hook Form integration

src/
├── lib/
│   ├── validation.ts              # Server-side schema with transforms
│   └── sanitizer.ts               # Input sanitization functions
└── routes/submissions.ts          # POST handler with validation
```

## Validation Schema

Located in `/frontend/src/lib/validation.ts` (client) and `/src/lib/validation.ts` (server).

```typescript
export const formSchema = z.object({
  // Required fields
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

  // Optional fields
  phone: z
    .string()
    .optional()
    .refine((val) => {
      if (!val || val.trim() === '') return true; // Allow empty
      const digits = val.replace(/\D/g, '');
      return digits.length >= 7 && digits.length <= 15;
    }, 'Phone must contain 7-15 digits'),

  address: z
    .string()
    .optional()
    .refine((val) => {
      if (!val || val.trim() === '') return true; // Allow empty
      return val.length <= 200;
    }, 'Address must be less than 200 characters'),

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
```

### Field Requirements

- **Required**: First name, last name, email
- **Optional**: Phone, address, date of birth

### Validation Rules

**Names** use regex to:
- Allow letters, spaces, hyphens (Mary-Jane), and apostrophes (O'Brien)
- Reject numbers and special characters

**Phone** uses `refine()` instead of regex:
- Client accepts any format: `(555) 123-4567`, `555-123-4567`, `+1 555 123 4567`
- Validates digit count (7-15 digits)
- Server transforms to E.164 format

**Date of Birth** validates age:
- Checks date format (YYYY-MM-DD)
- Calculates age accounting for month and day (not just year)
- Enforces 18+ age requirement

## Client-Side Implementation

### React Hook Form Setup

```typescript
// frontend/src/components/SubmissionForm.tsx
const {
  register,
  handleSubmit,
  formState: { errors, isSubmitting },
  setValue,
  watch,
  reset,
} = useForm<FormData>({
  resolver: zodResolver(formSchema),
  mode: 'onBlur',  // Validates when user leaves field
});
```

The `onBlur` mode validates when user finishes with a field, providing immediate feedback without interrupting typing.

### Field Registration Pattern

Standard inputs use the spread operator with `register()`:

```typescript
<Input
  id="firstName"
  {...register('firstName')}
  disabled={isSubmitting}
  className={errors.firstName ? 'border-destructive' : ''}
  aria-invalid={!!errors.firstName}
  aria-describedby={errors.firstName ? 'firstName-error' : undefined}
/>

{errors.firstName && (
  <p id="firstName-error" className="text-sm text-destructive mt-1">
    {errors.firstName.message}
  </p>
)}
```

The `register()` function connects the field to React Hook Form, adding change/blur handlers and form state management.

**Accessibility attributes:**
- `aria-invalid`: Tells screen readers the input is invalid
- `aria-describedby`: Links error message to input for screen readers
- `id` on error message: Required for `aria-describedby` reference

### Phone Input Special Case

Phone input doesn't work with `register()` because it's a complex third-party component:

```typescript
const phoneValue = watch('phone');  // Subscribe to phone field changes

<PhoneInput
  defaultCountry={defaultCountry}
  value={phoneValue}
  onChange={(phone) => setValue('phone', phone, { shouldValidate: true })}
  disabled={isSubmitting}
  error={!!errors.phone}
/>
```

Uses manual state management:
- `watch('phone')` creates a controlled component
- `setValue()` manually updates React Hook Form state
- `shouldValidate: true` triggers validation on change

### Validation Timing Flow

```
User types in firstName field
         │
         ├─ onChange: React Hook Form captures value
         ├─ State updated: formState.firstName = "John"
         │
User clicks outside field (blur event)
         │
         ├─ onBlur: React Hook Form triggers validation
         ├─ Zod validates: formSchema.shape.firstName.safeParse("John")
         │
         ├─ If valid: No error shown
         │
         └─ If invalid: errors.firstName = { message: "..." }
                        ↓
                   Error text appears below field
                   Input border turns red
```

### Submit Flow

```
User clicks Submit button
         │
         ├─ handleSubmit() intercepts
         ├─ Validates ALL fields via Zod
         │
         ├─ If ANY field invalid:
         │    ├─ Prevent submission
         │    ├─ Show all errors
         │    └─ Focus first invalid field
         │
         └─ If ALL valid:
              ├─ Execute Turnstile challenge
              ├─ Wait for token
              └─ Auto-submit form with token
```

## Server-Side Implementation

### Validation in Request Handler

```typescript
// src/routes/submissions.ts
submissions.post('/', async (c) => {
  // 1. Parse request body
  const body = await c.req.json();

  // 2. Validate with Zod
  const validationResult = formSchema.safeParse(body);

  if (!validationResult.success) {
    return c.json({
      success: false,
      message: 'Validation failed',
      errors: validationResult.error.flatten().fieldErrors,
    }, 400);
  }

  // 3. Data is now typed and validated
  const data = validationResult.data;

  // 4. Sanitize after validation
  const sanitized = {
    firstName: sanitizeInput(data.firstName),
    lastName: sanitizeInput(data.lastName),
    email: normalizeEmail(data.email),
    phone: data.phone,  // Already normalized by transform
    address: sanitizeInput(data.address),
    dateOfBirth: data.dateOfBirth,
  };

  // 5. Continue with Turnstile verification and database insertion
});
```

Processing sequence:
1. Parse - Get data from request
2. Validate - Ensure data matches schema
3. Sanitize - Remove dangerous characters
4. Transform - Normalize formats (phone → E.164)
5. Store - Insert into database

### Server Schema with Transforms

Server schema adds phone transformation for E.164 format:

```typescript
// src/lib/validation.ts
phone: z
  .string()
  .min(1, 'Phone is required')
  .transform((val) => {
    // Remove all non-digits except leading +
    const cleaned = val.replace(/[^\d+]/g, '');
    // Add +1 if no country code present
    return cleaned.startsWith('+') ? cleaned : `+1${cleaned}`;
  })
  .pipe(
    z.string().regex(
      /^\+[1-9]\d{1,14}$/,
      'Phone must be in E.164 format'
    )
  ),
```

Transform examples:
- `+1 (555) 123-4567` → `+15551234567`
- `555-123-4567` → `+15551234567` (assumes US)
- `+44 20 7946 0958` → `+442079460958`

E.164 format enables international queries and SMS/calling integrations.

### Input Sanitization

```typescript
// src/lib/sanitizer.ts
export function sanitizeInput(input: string): string {
  return input
    .replace(/<[^>]*>/g, '')    // Remove HTML tags: <script>alert()</script>
    .replace(/[<>'"]/g, '')     // Remove dangerous chars: < > ' "
    .trim();                     // Remove leading/trailing whitespace
}

export function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}
```

Prevents:
- **XSS attacks**: Removes `<script>`, `<img>`, etc.
- **Quote escaping**: Strips `'` and `"` that could break SQL queries
- **HTML injection**: Removes all tags and dangerous characters

Sanitization happens after validation to ensure required fields aren't empty before character removal.

## Error Handling

### Client Error Display

```typescript
{errors.firstName && (
  <p id="firstName-error" className="text-sm text-destructive mt-1">
    {errors.firstName.message}
  </p>
)}
```

Visual feedback:
- Red border on input: `className={errors.firstName ? 'border-destructive' : ''}`
- Error message below field
- Icon indicator (if applicable)

### Server Error Responses

**Validation failure (400):**
```json
{
  "success": false,
  "message": "Validation failed",
  "errors": {
    "firstName": ["First name is required"],
    "email": ["Invalid email address"],
    "phone": ["Phone must contain 7-15 digits"]
  }
}
```

**Turnstile verification failed (400):**
```json
{
  "success": false,
  "message": "Turnstile verification failed"
}
```

**Fraud detected (403):**
```json
{
  "success": false,
  "message": "Submission blocked due to suspicious activity"
}
```

**Server error (500):**
```json
{
  "success": false,
  "message": "Internal server error"
}
```

## Security Implementation

### XSS Prevention

**Input sanitization:**
```typescript
sanitizeInput(data.firstName)  // Removes HTML tags and quotes
```

**Output encoding:**
- React automatically escapes JSX content
- No `dangerouslySetInnerHTML` used in the application

### SQL Injection Prevention

**Parameterized queries:**
```typescript
// ✅ SAFE - Uses parameter binding
db.prepare(`
  INSERT INTO submissions (first_name, last_name, email)
  VALUES (?, ?, ?)
`).bind(firstName, lastName, email).run();

// ❌ NEVER DO THIS - Vulnerable to SQL injection
db.prepare(`
  INSERT INTO submissions VALUES ('${firstName}', '${lastName}', '${email}')
`).run();
```

D1 automatically escapes parameters in `.bind()`, preventing injection.

### CSRF Protection

Turnstile token provides CSRF protection:
- Must be obtained from form page
- Single-use (replay protection via token hash in database)
- Expires after 5 minutes
- Validates origin domain

## Testing

**Note**: Test files are configured in package.json but not yet implemented. Below are example Playwright tests for validation:

```typescript
test('should show validation errors for empty fields', async ({ page }) => {
  await page.goto('/');
  await page.click('button[type="submit"]');

  // Trigger validation
  await page.locator('input[name="firstName"]').click();
  await page.locator('input[name="lastName"]').click();

  await expect(page.locator('text=First name is required')).toBeVisible({ timeout: 2000 });
});

test('should validate email format', async ({ page }) => {
  await page.goto('/');
  await page.fill('input[name="email"]', 'invalid-email');
  await page.locator('input[name="firstName"]').click(); // Trigger blur

  await expect(page.locator('text=Invalid email address')).toBeVisible({ timeout: 2000 });
});
```

## References

- Phone validation details: PHONE-INPUT.md
- Geolocation for phone country: GEOLOCATION.md
- Fraud detection after validation: FRAUD-DETECTION.md
- Database schema: schema.sql
