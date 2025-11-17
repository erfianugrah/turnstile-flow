# Custom Phone Input System

## Overview

Custom international phone input with country detection.

**Features:**
- **200+ countries** with ISO codes, dial codes, and SVG flags (flag-icons library)
- **Searchable dropdown** with keyboard navigation
- **Dark mode support** via CSS variables
- **SVG flags** work on all platforms (Chrome/Windows, Firefox, Safari)

## Architecture

Three TypeScript components:

```
frontend/src/components/phone/
├── PhoneInput.tsx           # Main component (combines CountrySelect + input)
├── CountrySelect.tsx        # Dropdown with search and keyboard navigation
├── countries.ts             # 200+ countries with data (13KB)
└── index.ts                 # Barrel exports

frontend/src/styles/
└── global.css               # Imports flag-icons CSS for SVG flags

package.json                 # Added flag-icons@7.5.0 dependency
```

## Country Auto-Detection

Backend endpoint reads Cloudflare's `CF-IPCountry` header:

```typescript
// src/routes/geo.ts
geo.get('/', (c) => {
  const countryCode = c.req.header('CF-IPCountry') || 'US';
  return c.json({ success: true, countryCode: countryCode.toLowerCase() });
});
```

Frontend fetches on mount:

```typescript
// frontend/src/components/SubmissionForm.tsx
const [defaultCountry, setDefaultCountry] = useState<string>('us');

useEffect(() => {
  fetch('/api/geo')
    .then(r => r.json())
    .then(data => setDefaultCountry(data.countryCode.toLowerCase()));
}, []);
```

## Component Usage

```typescript
import { PhoneInput } from './phone';

<PhoneInput
  defaultCountry={defaultCountry}  // Auto-detected ISO code (lowercase)
  value={phoneValue || ''}         // Full number with dial code (e.g., '+15551234567')
  onChange={(phone) => setValue('phone', phone, { shouldValidate: true })}
  disabled={isSubmitting}
  error={!!errors.phone}
  placeholder="Phone number"
/>
```

## Component APIs

### PhoneInput

**Props:**
```typescript
interface PhoneInputProps {
  value: string;              // Full phone with dial code (e.g., '+15551234567')
  onChange: (phone: string) => void;
  defaultCountry?: string;    // ISO code (default: 'us')
  disabled?: boolean;
  error?: boolean;           // Shows error styling
  placeholder?: string;
}
```

**Features:**
- Automatically parses dial code from value
- Updates dial code when country changes
- Strips non-digit characters from input
- Combines dial code + number on change

### CountrySelect

**Props:**
```typescript
interface CountrySelectProps {
  value: string;              // ISO code (e.g., 'us')
  onChange: (code: string, dialCode: string) => void;
  disabled?: boolean;
}
```

**Features:**
- SVG flag + dial code display (flag-icons library)
- Click to open dropdown
- Search by country name, dial code, or ISO code
- Keyboard navigation (arrows, Enter, Escape)
- Click outside to close (useEffect with mousedown event listener)

### Country Data

```typescript
interface Country {
  code: string;      // ISO 3166-1 alpha-2 (e.g., 'us')
  name: string;      // Country name (e.g., 'United States')
  dial: string;      // International dial code (e.g., '+1')
  emoji: string;     // Flag emoji (legacy, not used - now using SVG flags)
  format?: string;   // Optional phone format (e.g., '(###) ###-####')
}
```

**Helper functions:**
```typescript
getCountryByCode(code: string): Country | undefined
getCountryByDialCode(dialCode: string): Country | undefined
searchCountries(query: string): Country[]
```

## Phone Format Flow

**Client sends:** `+1 (555) 123-4567` (raw input)
**Client value:** `+15551234567` (digits only)
**Server transforms:** `+15551234567` (E.164 validation)
**Database stores:** `+15551234567`

Server validation (in Zod schema):

```typescript
phone: z.string()
  .min(1, 'Phone number is required')
  .transform(val => {
    // Strip all non-digit characters except leading +
    const cleaned = val.replace(/[^\d+]/g, '');
    // Ensure starts with +
    return cleaned.startsWith('+') ? cleaned : `+1${cleaned}`;
  })
  .pipe(
    z.string()
      .regex(/^\+[1-9]\d{1,14}$/, 'Invalid phone number format')
      .max(16, 'Phone number too long')
  )
```

## SVG Flags Implementation

Using `flag-icons@7.5.0` for cross-browser compatible country flags.

**Implementation:**
```tsx
// CountrySelect.tsx - Country button with SVG flag
<span className={`fi fi-${selectedCountry.code.toLowerCase()} text-xl`}></span>

// Dropdown list items
<span className={`fi fi-${country.code.toLowerCase()} text-xl`}></span>
```

**CSS import:**
```css
/* frontend/src/styles/global.css */
@import "tailwindcss";
@import "flag-icons/css/flag-icons.min.css";
```

**Package dependency:**
```json
{
  "dependencies": {
    "flag-icons": "^7.5.0"
  }
}
```

## Dark Mode Styling

Native dark mode support using CSS variables:

```tsx
// CountrySelect dropdown
<div className={cn(
  'absolute left-0 top-full z-50 mt-1 w-80 rounded-md border-2',
  'bg-white dark:bg-[hsl(0,0%,15%)] text-card-foreground',
  'border-border dark:border-[hsl(0,0%,30%)]',
  'shadow-xl dark:shadow-[0_20px_40px_rgba(0,0,0,0.6)]'
)}>
```

```tsx
// Phone input field
<input className={cn(
  'flex h-11 w-full rounded-r-md border border-l-0 border-input',
  'bg-background px-3 py-2 text-sm',
  'placeholder:text-muted-foreground',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
  'hover:border-primary/50',
  error && 'border-destructive focus-visible:ring-destructive'
)} />
```

**CSS Variables Used:**
- `--background`, `--foreground` - Input colors
- `--card`, `--card-foreground` - Dropdown colors
- `--border` - Border colors
- `--input` - Input border
- `--ring` - Focus ring
- `--destructive` - Error state

## Implementation Details

### State Management

PhoneInput manages:
- `country` (ISO code)
- `dialCode` (e.g., '+1')

Synchronizes with `value` prop via useEffect:
1. Parses dial code from incoming value
2. Finds matching country
3. Updates internal state

### Number Extraction

```typescript
const getNumberPart = (fullNumber: string): string => {
  if (!fullNumber || !fullNumber.startsWith('+')) return '';
  return fullNumber.substring(dialCode.length);
};
```

### Country Change

```typescript
const handleCountryChange = (newCountryCode: string, newDialCode: string) => {
  setCountry(newCountryCode);
  setDialCode(newDialCode);

  // Keep existing number, change dial code
  const numberPart = getNumberPart(value);
  onChange(newDialCode + numberPart);
};
```

### Number Input

```typescript
const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
  const input = e.target.value;
  const digitsOnly = input.replace(/\D/g, '');  // Strip non-digits
  onChange(dialCode + digitsOnly);
};
```

## Accessibility

- **Keyboard navigation**: Arrows, Enter, Escape in dropdown
- **Focus management**: Auto-focus search on dropdown open
- **Click outside**: Closes dropdown
- **ARIA labels**: Proper input labeling
- **Screen readers**: Semantic HTML structure

## Related

- Server E.164 normalization: [FORM-VALIDATION.md](./FORM-VALIDATION.md)
- Geolocation API: [GEOLOCATION.md](./GEOLOCATION.md)
- Component library: shadcn/ui components
