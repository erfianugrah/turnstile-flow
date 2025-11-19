# Frontend Components Guide

Complete guide to the Forminator frontend architecture, component structure, and UI/UX features.

## Table of Contents

- [Overview](#overview)
- [Technology Stack](#technology-stack)
- [UI/UX Features](#uiux-features)
- [Component Structure](#component-structure)
- [Analytics Dashboard](#analytics-dashboard)
- [Custom Hooks](#custom-hooks)
- [Form Components](#form-components)
- [Styling System](#styling-system)
- [State Management](#state-management)

---

## Overview

The Forminator frontend is a static Astro site with React components, built for:
- Fast performance (static generation)
- Modern UI/UX (shadcn/ui design system)
- Dark mode support (CSS custom properties)
- Responsive design (mobile-first)
- Accessibility (WCAG compliance)

**Architecture:**
```
Astro (Static Site Generator)
    ├─ React Components (Interactive islands)
    ├─ shadcn/ui (Component library)
    ├─ Tailwind CSS v4 (Utility-first styling)
    └─ CSS Custom Properties (Theming system)
```

---

## Technology Stack

### Core Technologies

| Technology | Purpose | Version |
|------------|---------|---------|
| **Astro** | Static site generator, page routing | 5.x |
| **React** | Interactive components | 19.x |
| **TypeScript** | Type safety | 5.x |
| **Tailwind CSS** | Utility-first styling | 4.x |
| **shadcn/ui** | Component primitives | Latest |
| **Zod** | Schema validation | 3.x |
| **React Hook Form** | Form state management | 7.x |

### Component Libraries

- **shadcn/ui** - Button, Input, Select, Dialog, Alert, etc.
- **flag-icons** - SVG country flags (7.5.0)
- **Lucide React** - Icon library
- **Recharts** - Chart visualizations (analytics dashboard)

---

## UI/UX Features

### Color System

The application uses **Tailwind CSS v4** with CSS custom properties for theming.

#### CSS Variables

The color system is defined in `frontend/src/styles/global.css` using CSS custom properties:

```css
:root {
  --background: 220 18% 97%;
  --foreground: 220 16% 20%;
  --primary: 213 40% 48%;
  --primary-foreground: 0 0% 100%;
  --destructive: 354 42% 56%;
  --destructive-foreground: 0 0% 100%;
  /* ... other semantic color tokens */
}

.dark {
  --background: 220 18% 16%;
  --foreground: 218 24% 88%;
  --primary: 213 42% 55%;
  /* ... dark mode variants */
}
```

**Note**: Tailwind CSS v4 uses CSS-based configuration instead of JavaScript config files. Colors are referenced as `hsl(var(--background))` in component styles.

### Dark/Light Mode

**Dark Mode:**
- Dark gray backgrounds (220 18% 16%)
- Light text (218 24% 88%)
- Blue primary accent (213 42% 55%)

**Light Mode:**
- Light gray backgrounds (220 18% 97%)
- Dark text (220 16% 20%)
- Blue primary accent (213 40% 48%)

**Implementation:**
```typescript
// Toggle handled by Astro's built-in dark mode
// Uses prefers-color-scheme media query
// Persisted in localStorage
```

### SVG Flags

Country flags rendered using the **flag-icons** library:
- Small bundle size (vs. image sprites)
- Sharp rendering at any size
- CSS-based flag rendering
- Supports 200+ countries

**Usage:**
```typescript
// Imported in global.css
@import "flag-icons/css/flag-icons.min.css";

// Used in components
<span className={`fi fi-${countryCode.toLowerCase()}`} />
```

### Form Components

#### Custom International Phone Input

**Implementation:** Custom-built phone input component (not a library dependency).

**Features:**
- 200+ countries with dial codes
- SVG flag icons (via flag-icons library)
- Searchable country dropdown
- Auto-formatting per country
- E.164 normalization
- Automatic country detection via geolocation API

**Components:**
```
frontend/src/components/phone/
├── PhoneInput.tsx       # Main phone input
├── CountrySelect.tsx    # Country selector dropdown
├── countries.ts         # Country data (200+ countries)
└── index.ts            # Barrel exports
```

**See [PHONE-INPUT.md](./PHONE-INPUT.md) for detailed documentation.**

#### Enhanced Date Picker

**Features:**
- Calendar popup interface
- Keyboard navigation
- Visual feedback (hover, focus states)
- Date validation (age requirements)
- Accessible (ARIA labels)

**Implementation:**
```typescript
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';

<Popover>
  <PopoverTrigger asChild>
    <Button variant="outline">
      {date ? format(date, 'PPP') : 'Pick a date'}
    </Button>
  </PopoverTrigger>
  <PopoverContent>
    <Calendar
      mode="single"
      selected={date}
      onSelect={setDate}
    />
  </PopoverContent>
</Popover>
```

#### Visual Submission Flow

**4-Stage Progress Indicator:**

```
1. [●] Idle            → User fills form
2. [●] Validating      → Client-side validation
3. [●] Server Validation → Turnstile + fraud detection
4. [✓] Success / [✗] Error
```

**States:**
- **Idle** - Initial state, form ready
- **Validating** - Client-side validation in progress
- **Server Validation** - Turnstile + backend processing
- **Success** - Green checkmark, success message
- **Error** - Red X, error message with retry

**Implementation:**
```typescript
const [flowStep, setFlowStep] = useState<FlowStep>('idle');

// Update flow step during submission
const onSubmit = async (data) => {
  setFlowStep('validating');
  // ... validation
  setFlowStep('server-validation');
  // ... submit
  setFlowStep('success'); // or 'error'
};
```

### Responsive Design

#### Mobile-First Approach

All components designed mobile-first, then enhanced for larger screens.

**Breakpoints:**
```css
/* Tailwind default breakpoints */
sm:  640px  /* Phones landscape */
md:  768px  /* Tablets */
lg:  1024px /* Laptops */
xl:  1280px /* Desktops */
2xl: 1536px /* Large desktops */
```

**Example:**
```jsx
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
  {/* 1 column mobile, 2 tablets, 3 desktop */}
</div>
```

#### Searchable Dropdowns

**Features:**
- Keyboard navigation (arrow keys, enter, escape)
- Type-to-search filtering
- Virtualization for long lists (200+ countries)
- Accessible (ARIA labels, focus management)

**Implementation:**
```typescript
import { Command, CommandInput, CommandList, CommandItem } from '@/components/ui/command';

<Command>
  <CommandInput placeholder="Search..." />
  <CommandList>
    {items.map((item) => (
      <CommandItem key={item.id} onSelect={() => select(item)}>
        {item.label}
      </CommandItem>
    ))}
  </CommandList>
</Command>
```

#### Custom Scrollbars

Consistent scrollbar styling across browsers using CSS custom properties:

```css
.custom-scrollbar::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

.custom-scrollbar::-webkit-scrollbar-track {
  background: hsl(var(--muted));
  border-radius: 4px;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background: hsl(var(--muted-foreground) / 0.3);
  border-radius: 4px;
}

.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: hsl(var(--muted-foreground) / 0.5);
}

/* Firefox */
.custom-scrollbar {
  scrollbar-width: thin;
  scrollbar-color: hsl(var(--muted-foreground) / 0.3) hsl(var(--muted));
}
```

---

## Component Structure

### Directory Tree

```
frontend/src/
├── components/
│   ├── SubmissionForm.tsx          # Main form with validation
│   ├── TurnstileWidget.tsx         # Turnstile integration
│   ├── AnalyticsDashboard.tsx      # Analytics UI (modular design)
│   │
│   ├── analytics/                  # Analytics dashboard components
│   │   ├── RiskScoreInfo.tsx       # Educational fraud detection explanation
│   │   ├── FraudAssessment.tsx     # Risk score breakdown visualization
│   │   ├── JA4SignalsDetail.tsx    # JA4 fingerprint intelligence display
│   │   │
│   │   ├── cards/                  # Alert and warning cards
│   │   │   └── FraudAlert.tsx
│   │   │
│   │   ├── charts/                 # Data visualizations (5 types)
│   │   │   ├── BarChart.tsx
│   │   │   ├── DonutChart.tsx
│   │   │   ├── PieChart.tsx
│   │   │   ├── RadarChart.tsx
│   │   │   └── TimeSeriesChart.tsx
│   │   │
│   │   ├── controls/               # Dashboard controls
│   │   │   └── GlobalControlsBar.tsx
│   │   │
│   │   ├── filters/                # Filter components (5 types)
│   │   │   ├── SearchBar.tsx
│   │   │   ├── MultiSelect.tsx     # Multi-value dropdown with search
│   │   │   ├── SingleSelect.tsx    # Single-value dropdown with icons
│   │   │   ├── DateRangePicker.tsx
│   │   │   └── RangeSlider.tsx
│   │   │
│   │   ├── sections/               # Dashboard sections (7 components)
│   │   │   ├── OverviewStats.tsx   # 5 metrics with trend indicators
│   │   │   ├── FraudAlert.tsx
│   │   │   ├── RecentSubmissionsSection.tsx  # With filtering & pagination
│   │   │   ├── SecurityEvents.tsx  # Unified security events
│   │   │   ├── ChartsSection.tsx
│   │   │   ├── SubmissionDetailDialog.tsx    # Modal for submission inspection
│   │   │   └── ValidationDetailDialog.tsx    # Modal for validation inspection
│   │   │
│   │   └── tables/                 # Data tables
│   │       ├── DataTable.tsx
│   │       └── columns.tsx         # Table column definitions
│   │
│   └── ui/                         # shadcn/ui base components
│       ├── button.tsx
│       ├── input.tsx
│       ├── select.tsx
│       ├── dialog.tsx
│       ├── alert.tsx
│       ├── card.tsx
│       ├── table.tsx
│       ├── popover.tsx
│       ├── calendar.tsx
│       └── ... (30+ components)
│
├── hooks/
│   ├── useAnalytics.ts             # Core analytics data fetching
│   ├── useSubmissions.ts           # Submissions with filters & pagination
│   ├── useBlacklist.ts             # Active blacklist entries
│   ├── useBlockedValidations.ts    # Recent blocked attempts
│   └── useConfig.ts                # Fraud detection configuration
│
├── pages/
│   ├── index.astro                 # Form page (/)
│   └── analytics.astro             # Analytics page (/analytics)
│
└── lib/
    ├── validation.ts               # Shared Zod schemas (client/server)
    └── utils.ts                    # Tailwind merge utility (cn)
```

---

## Analytics Dashboard

### Overview

The analytics dashboard provides comprehensive fraud monitoring and submission analytics.

**Architecture:**
- **Modular Design**: 330-line main component with 7 section components
- **Custom Hooks**: 5 hooks for data fetching and state management
- **Real-time Updates**: Polling with configurable intervals
- **Responsive**: Mobile, tablet, desktop layouts

### Dashboard Sections

#### 1. GlobalControlsBar

**Location:** Top of dashboard

**Features:**
- Export data (CSV/JSON)
- Refresh data
- Clear all filters
- Last updated timestamp

**Actions:**
```typescript
- exportData() → Downloads CSV/JSON
- refresh() → Refetches all data
- clearFilters() → Resets all filter state
```

#### 2. OverviewStats

**5 Key Metrics:**

| Metric | Description | Trend Indicator |
|--------|-------------|-----------------|
| Total Validations | All validation attempts | TrendingUp/Down icon |
| Allowed Rate | Percentage of successful submissions | Color-coded (green/red) |
| Avg Risk Score | Average risk score (0-100) | Numerical change |
| Session Hopping Blocks | JA4 fraud detections | Count with trend |
| Email Fraud Blocks | Markov-Mail blocks | Count with trend |

**Trend Calculations:**
```typescript
const trend = current - previous;
const trendPercentage = (trend / previous) * 100;

// Color coding
if (metric === 'allowedRate') {
  return trend > 0 ? 'text-green-500' : 'text-red-500';
} else {
  return trend > 0 ? 'text-red-500' : 'text-green-500';
}
```

#### 3. FraudAlert

**Purpose:** Display critical fraud pattern warnings

**Alert Types:**
- High block rate (>50%)
- Spike in fraudulent submissions
- New attack patterns detected
- System anomalies

**Example:**
```typescript
{isHighBlockRate && (
  <Alert variant="destructive">
    <AlertTriangle className="h-4 w-4" />
    <AlertTitle>High Block Rate Detected</AlertTitle>
    <AlertDescription>
      {blockRate}% of submissions are being blocked. Investigate recent activity.
    </AlertDescription>
  </Alert>
)}
```

#### 4. RecentSubmissionsSection

**Features:**
- Searchable/filterable table with pagination
- Risk score visualization
- Clickable rows → submission detail dialog
- RiskScoreInfo component (educational tooltip)

**Filters:**
- Search (name, email)
- Date range
- Country (multi-select)
- Bot score range
- Status (allowed/blocked)

**Columns:**
- ID
- Name
- Email
- Country (with flag)
- Bot Score
- Risk Score
- Created At
- Actions (View Details)

**Pagination:**
```typescript
const [page, setPage] = useState(1);
const [limit, setLimit] = useState(10);

const { data, total } = useSubmissions({ page, limit, ...filters });

const totalPages = Math.ceil(total / limit);
```

#### 5. SecurityEvents

**Purpose:** Unified view of active blocks and past detections

**Features:**
- Combined blacklist + blocked validations
- Filtering by detection type, status, risk level
- Pagination (10/25/50/100 per page)
- Clickable rows → validation detail dialog
- Time remaining for active blocks

**Filters:**
- Detection Type (ephemeral ID, email fraud, JA4, IP diversity)
- Status (active, expired, all)
- Risk Level (low, medium, high)

**Columns:**
- Detection Type (badge)
- Reason
- Risk Score (colored)
- Status (active/expired)
- Time Remaining / Expired At
- Actions (View Details)

**ValidationDetailDialog** shows all 35+ validation fields:
- Geographic data (country, region, city, lat/long)
- Network data (ASN, colo, HTTP protocol, TLS)
- Bot detection (bot score, detection IDs, verified bot)
- Fingerprints (JA3 hash, JA4 string, JA4 signals)

#### 6. ChartsSection

**8 Visualizations:**

1. **Time Series Chart** - Submissions over time (hourly/daily)
2. **Country Distribution** - Top 10 countries (pie chart)
3. **Bot Scores** - Distribution by risk category (bar chart)
4. **ASN Distribution** - Top ASNs (donut chart)
5. **TLS Versions** - Protocol breakdown (pie chart)
6. **JA3 Hashes** - Top 10 fingerprints (bar chart)
7. **JA4 Fingerprints** - Top 10 JA4 strings (bar chart)
8. **Risk Score Trends** - Average risk over time (line chart)

**Chart Library:** Recharts

**Example:**
```typescript
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

<ResponsiveContainer width="100%" height={300}>
  <BarChart data={botScoreData}>
    <CartesianGrid strokeDasharray="3 3" />
    <XAxis dataKey="category" />
    <YAxis />
    <Tooltip />
    <Bar dataKey="count" fill="hsl(213, 32%, 52%)" />
  </BarChart>
</ResponsiveContainer>
```

---

## Custom Hooks

### useAnalytics

**Purpose:** Fetch core analytics statistics

**Returns:**
```typescript
{
  data: {
    totalSubmissions: number;
    totalValidations: number;
    allowedRate: number;
    avgRiskScore: number;
    blockedCount: number;
    // ... more stats
  };
  isLoading: boolean;
  error: Error | null;
  refresh: () => void;
}
```

**API Endpoint:** `GET /api/analytics/stats`

**Authentication:** `X-API-KEY` header required

### useSubmissions

**Purpose:** Fetch submissions with filtering and pagination

**Parameters:**
```typescript
{
  page: number;
  limit: number;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  countries?: string[];
  botScoreMin?: number;
  botScoreMax?: number;
  status?: 'allowed' | 'blocked';
}
```

**Returns:**
```typescript
{
  data: Submission[];
  total: number;
  isLoading: boolean;
  error: Error | null;
  refresh: () => void;
}
```

**API Endpoint:** `GET /api/analytics/submissions`

### useBlacklist

**Purpose:** Fetch active blacklist entries

**Returns:**
```typescript
{
  data: BlacklistEntry[];
  isLoading: boolean;
  error: Error | null;
  refresh: () => void;
}
```

**API Endpoint:** `GET /api/analytics/blacklist`

### useBlockedValidations

**Purpose:** Fetch recent blocked validation attempts

**Returns:**
```typescript
{
  data: Validation[];
  isLoading: boolean;
  error: Error | null;
  refresh: () => void;
}
```

**API Endpoint:** `GET /api/analytics/validations/blocked`

### useConfig

**Purpose:** Fetch fraud detection configuration

**Returns:**
```typescript
{
  data: FraudDetectionConfig;
  isLoading: boolean;
  error: Error | null;
}
```

**API Endpoint:** `GET /api/config`

**Usage:**
```typescript
const { data: config } = useConfig();

// Access thresholds
const blockThreshold = config?.risk?.blockThreshold ?? 70;
const weights = config?.risk?.weights;
```

---

## Form Components

### SubmissionForm

**File:** `frontend/src/components/SubmissionForm.tsx`

**Features:**
- React Hook Form integration
- Zod schema validation (client-side)
- International phone input
- Date picker
- Turnstile widget integration
- 4-stage submission flow
- Error handling with user-friendly messages
- Rate limit countdown timer
- Optional fields (phone, address, date_of_birth)

**Form Fields:**
- firstName (required)
- lastName (required)
- email (required)
- phone (optional)
- address (optional)
- dateOfBirth (optional)

**Validation:**
```typescript
import { zodResolver } from '@hookform/resolvers/zod';
import { formSchema } from '../lib/validation';

const form = useForm({
  resolver: zodResolver(formSchema),
  defaultValues: {
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    address: '',
    dateOfBirth: '',
  },
});
```

**Submission Flow:**
```typescript
const onSubmit = async (data: FormData) => {
  setFlowStep('validating');

  // Check if Turnstile token available
  if (!turnstileToken) {
    // Request Turnstile challenge
    setFlowStep('turnstile');
    return;
  }

  setFlowStep('server-validation');

  // Submit form
  const response = await fetch('/api/submissions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...data, turnstileToken }),
  });

  if (response.ok) {
    setFlowStep('success');
  } else {
    setFlowStep('error');
  }
};
```

### TurnstileWidget

**File:** `frontend/src/components/TurnstileWidget.tsx`

**Features:**
- Explicit rendering
- Interaction-only appearance (hidden until needed)
- Execute mode (manual challenge trigger)
- 5 callback handlers
- Dark mode synchronization
- Token expiration handling

**Callbacks:**
```typescript
<TurnstileWidget
  siteKey={TURNSTILE_SITEKEY}
  onSuccess={(token) => {
    console.log('Turnstile success', token);
    setToken(token);
  }}
  onError={(error) => {
    console.error('Turnstile error', error);
  }}
  onExpire={() => {
    console.log('Turnstile expired');
    setToken(null);
  }}
  onTimeout={() => {
    console.log('Turnstile timeout');
  }}
  onBeforeInteractive={() => {
    console.log('Turnstile before interactive');
  }}
/>
```

**See [TURNSTILE.md](./TURNSTILE.md) for detailed documentation.**

---

## Styling System

### Tailwind CSS

**Utility-First Approach:**
```jsx
<button className="bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2 rounded-md">
  Submit
</button>
```

**Benefits:**
- No CSS file bloat
- Consistent spacing/sizing
- Responsive utilities (md:, lg:, etc.)
- Dark mode support (dark:)

### shadcn/ui

**Component Primitives:**
- Accessible by default (ARIA labels, keyboard nav)
- Customizable via Tailwind
- Copy-paste components (not npm package)
- Built on Radix UI primitives

**Example Component:**
```tsx
import { Button } from '@/components/ui/button';

<Button variant="default" size="lg">
  Click me
</Button>
```

**Variants:**
- default, destructive, outline, secondary, ghost, link
- Sizes: sm, default, lg, icon

### CSS Variables

**Theme Configuration:**
```css
:root {
  --background: 220 16% 22%;
  --foreground: 218 27% 92%;
  --primary: 213 32% 52%;
  --primary-foreground: 218 27% 94%;
  --secondary: 220 16% 28%;
  --secondary-foreground: 218 27% 92%;
  --destructive: 354 42% 56%;
  --destructive-foreground: 218 27% 94%;
  --muted: 220 16% 28%;
  --muted-foreground: 219 28% 88%;
  --accent: 220 16% 32%;
  --accent-foreground: 218 27% 92%;
  --border: 220 16% 36%;
  --input: 220 16% 36%;
  --ring: 213 32% 52%;
  --radius: 0.5rem;
}
```

**Usage:**
```tsx
<div className="bg-background text-foreground border border-border">
  Content
</div>
```

### cn() Utility

**Purpose:** Merge Tailwind classes with conflict resolution

```typescript
// lib/utils.ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

**Usage:**
```tsx
<Button className={cn('bg-primary', isLoading && 'opacity-50')}>
  Submit
</Button>
```

---

## State Management

### Local State (useState)

**For component-specific state:**
```typescript
const [isOpen, setIsOpen] = useState(false);
const [selectedCountry, setSelectedCountry] = useState('US');
```

### Form State (React Hook Form)

**For complex forms:**
```typescript
const form = useForm({
  resolver: zodResolver(formSchema),
  defaultValues: {},
});

const { handleSubmit, formState: { errors } } = form;
```

### Server State (Custom Hooks)

**For API data:**
```typescript
const { data, isLoading, error, refresh } = useAnalytics();
```

**Implementation:**
```typescript
export function useAnalytics() {
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = async () => {
    try {
      const response = await fetch('/api/analytics/stats', {
        headers: { 'X-API-KEY': API_KEY },
      });
      const json = await response.json();
      setData(json);
    } catch (err) {
      setError(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  return { data, isLoading, error, refresh: fetchData };
}
```

### URL State (For Filters)

**For shareable dashboard filters:**
```typescript
const [searchParams, setSearchParams] = useSearchParams();

const page = parseInt(searchParams.get('page') || '1');
const search = searchParams.get('search') || '';

// Update URL
setSearchParams({ page: '2', search: 'test' });
```

---

## Related Documentation

- [ARCHITECTURE.md](./ARCHITECTURE.md) - Overall system architecture
- [PHONE-INPUT.md](./PHONE-INPUT.md) - Phone input component details
- [TURNSTILE.md](./TURNSTILE.md) - Turnstile widget integration
- [FORM-VALIDATION.md](./FORM-VALIDATION.md) - Form validation system
- [API-REFERENCE.md](./API-REFERENCE.md) - Analytics API endpoints

---

## Quick Reference

### Component Locations

```bash
# Main form
frontend/src/components/SubmissionForm.tsx

# Analytics dashboard
frontend/src/components/AnalyticsDashboard.tsx
frontend/src/components/analytics/

# shadcn/ui components
frontend/src/components/ui/

# Custom hooks
frontend/src/hooks/

# Pages
frontend/src/pages/index.astro
frontend/src/pages/analytics.astro
```

### Common Tasks

**Add new form field:**
1. Update Zod schema in `lib/validation.ts`
2. Add field to form in `SubmissionForm.tsx`
3. Update backend schema in `src/lib/validation.ts`
4. Add column to D1 table in `schema.sql`

**Add new analytics chart:**
1. Create chart component in `components/analytics/charts/`
2. Import in `ChartsSection.tsx`
3. Fetch data via custom hook or inline fetch
4. Configure chart with Recharts

**Add new dashboard filter:**
1. Create filter component in `components/analytics/filters/`
2. Add filter state to dashboard
3. Pass filter to API endpoint
4. Update query in backend

**Customize theme colors:**
1. Edit `tailwind.config.mjs`
2. Update CSS variables in `globals.css`
3. Rebuild frontend: `npm run build`
