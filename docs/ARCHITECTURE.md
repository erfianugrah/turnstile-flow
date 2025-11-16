# Architecture

## Overview

Forminator is a full-stack Cloudflare Turnstile demonstration showcasing:
- **Frontend**: Astro static site with React components (shadcn/ui) and dark mode
- **Backend**: Cloudflare Worker with Hono routing framework
- **Database**: D1 for storing form submissions with rich metadata (40+ fields)
- **Security**: Single-step Turnstile validation with fraud detection

##

 Project Structure

```
forminator/
├── frontend/                    # Astro static site (UI only)
│   ├── src/
│   │   ├── components/         # React components (shadcn/ui)
│   │   │   ├── SubmissionForm.tsx
│   │   │   ├── AnalyticsDashboard.tsx (modular - 330 lines)
│   │   │   └── analytics/     # Analytics components (20 files)
│   │   ├── hooks/              # Custom React hooks (4 files)
│   │   ├── layouts/            # Astro layouts
│   │   ├── pages/              # Astro pages (NO API routes)
│   │   └── styles/             # Global CSS
│   ├── astro.config.mjs
│   └── package.json
│
├── src/                         # Cloudflare Worker (Backend - at root)
│   ├── index.ts                # Hono app entry + asset serving + dynamic routing
│   ├── routes/                 # API routes
│   │   ├── submissions.ts      # Form submission endpoint (with testing bypass)
│   │   ├── analytics.ts        # Analytics endpoints
│   │   └── geo.ts              # Geolocation endpoint
│   └── lib/                    # Business logic
│       ├── router.ts           # Dynamic route configuration
│       ├── turnstile.ts        # Turnstile validation + fraud detection
│       ├── database.ts         # D1 operations
│       ├── validation.ts       # Form validation (Zod)
│       ├── email-fraud-detection.ts  # Markov-Mail RPC
│       ├── scoring.ts          # Normalized risk scoring
│       ├── fraud-prevalidation.ts    # Pre-validation blacklist
│       ├── ja4-fraud-detection.ts    # JA4 session hopping
│       ├── logger.ts           # Pino logging
│       └── types.ts            # TypeScript types + metadata extraction
│
├── wrangler.jsonc              # Worker configuration
├── package.json                # Worker dependencies
├── schema.sql                  # D1 database schema
├── docs/                       # Documentation
└── README.md                   # Main readme
```

## Tech Stack

### Frontend
- **Astro 5.x**: Static site generation
- **React 19**: Component framework
- **shadcn/ui**: Copy-paste component library
- **Tailwind CSS 4**: Utility-first CSS
- **Zod**: Client-side validation

### Backend
- **Hono 4.x**: Lightweight routing framework
- **Cloudflare Workers**: Edge compute platform
- **D1**: SQLite at the edge
- **Pino**: Structured logging
- **Zod**: Server-side validation

### Security
- **Turnstile**: CAPTCHA alternative
- **Ephemeral IDs**: Enterprise Bot Management feature
- **Token Replay Protection**: SHA256 hashing
- **Input Sanitization**: XSS prevention
- **Parameterized Queries**: SQL injection prevention

## Request Flow

```
┌──────────────────────────────────────────────────────────────┐
│  Client Browser                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ https://form.erfi.dev/                                  │  │
│  │  • Static Astro pages (UI)                              │  │
│  │  • TurnstileWidget (React component)                    │  │
│  │  • SubmissionForm                                       │  │
│  │  • AnalyticsDashboard                                   │  │
│  └────────────────────────────────────────────────────────┘  │
└───────┬──────────────────────────────────────────────────────┘
        │ POST /api/submissions { ...formData, turnstileToken }
        │
┌───────▼──────────────────────────────────────────────────────┐
│  Cloudflare Worker (form.erfi.dev)                           │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ Hono App (src/index.ts)                                 │  │
│  │  • Serves static assets from /frontend/dist (ASSETS)   │  │
│  │  • Routes /api/* to API handlers                        │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                               │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ POST /api/submissions (Single-Step Validation)         │  │
│  │                                                          │  │
│  │ 1. Extract request metadata (IP, geo, bot signals)      │  │
│  │ 2. Validate form data (Zod schema)                      │  │
│  │ 3. Sanitize inputs (HTML stripping)                     │  │
│  │ 4. Hash Turnstile token (SHA256)                        │  │
│  │ 5. Check token reuse (D1 lookup)                        │  │
│  │ 6. Validate with Turnstile API (siteverify)            │  │
│  │ 7. Fraud detection (ephemeral ID or IP-based)          │  │
│  │ 8. Create submission in D1                              │  │
│  │ 9. Log validation attempt                               │  │
│  │ 10. Return success/error                                │  │
│  └────────────────────────────────────────────────────────┘  │
└───────┬──────────────────────┬───────────────────────────────┘
        │                      │
┌───────▼──────────┐    ┌──────────▼──────────────────────────┐
│ Turnstile API    │    │ D1 Database                          │
│ siteverify       │    │  • submissions (42 fields + metadata)│
│                  │    │  • turnstile_validations (35 fields) │
│ Returns:         │    │                                       │
│ • success        │    │ Rich metadata captured:               │
│ • challenge_ts   │    │  - Geographic (country, city, etc)   │
│ • hostname       │    │  - Network (ASN, colo, TLS)          │
│ • action         │    │  - Bot signals (scores, JA3, JA4)    │
│ • metadata       │    │  - Detection IDs, JA4 signals        │
│   • ephemeral_id │    │  - Request.cf properties             │
└──────────────────┘    └──────────────────────────────────────┘
```

## Key Design Decisions

### 1. Worker at Root Level

The Worker is the main project, with the frontend as a subdirectory:
- `src/` contains Worker code (Hono app, routes, lib)
- `frontend/` contains Astro static site
- Worker serves static assets from `frontend/dist` via ASSETS binding
- Single deploy: `npm run deploy` builds frontend + deploys worker

### 2. Single-Step Validation

**Why Single-Step**: Turnstile tokens are single-use. A two-step flow (separate verify + submit endpoints) would consume the token twice.

**Implementation**:
- Client collects form data + Turnstile token
- Single POST to `/api/submissions` with all data
- Server validates token, checks fraud, creates submission atomically
- Token is hashed (SHA256) and stored to prevent replay attacks

### 3. Static Site Generation

**Why SSG**:
- Fast load times (pre-rendered HTML)
- Excellent SEO
- Low bandwidth usage
- Works with Workers Assets binding
- No server-side rendering needed

**Build Output**:
- `frontend/dist/` contains static HTML, CSS, JS
- Worker serves these files directly
- Hydration for React components (client:load)

### 4. Fraud Detection Strategy

**Ephemeral ID (Preferred)**:
- Enterprise Bot Management feature
- 7-day detection window (IDs rotate after a few days)
- Checks: submission count, validation attempts, unique emails, rapid submissions
- Risk score calculation with 70-point block threshold

**IP-based Fallback**:
- Used when ephemeral ID unavailable
- 1-hour detection window
- Less accurate (VPNs, proxies, shared IPs)
- Lower risk scores to reduce false positives

### 5. Database Schema Design

**Two Main Tables**:

1. **submissions** (42 fields)
   - Form data (first_name, last_name, email, etc.)
   - Geographic metadata (country, region, city, postal_code, lat/long, timezone, continent, is_eu_country)
   - Network metadata (ASN, colo, HTTP protocol, TLS version/cipher)
   - Bot signals (bot_score, client_trust_score, verified_bot, detection_ids)
   - Fingerprints (JA3 hash, JA4, JA4 signals)
   - Tracking (ephemeral_id, remote_ip, user_agent, created_at)

2. **turnstile_validations** (35 fields)
   - Validation result (success, allowed, block_reason, risk_score)
   - Turnstile data (challenge_ts, hostname, action, ephemeral_id)
   - Request metadata (same as submissions)
   - Linking (submission_id foreign key, token_hash for replay protection)

**Indexes**:
- `token_hash` (unique) - Prevents token reuse
- `ephemeral_id` - Fast fraud detection queries
- `created_at` - Time-based analytics
- `email`, `country`, `ja3_hash`, `ja4`, `bot_score` - Analytics performance

### 6. Metadata Extraction

**40+ Fields from request.cf**:
```typescript
export function extractRequestMetadata(request: CloudflareRequest): RequestMetadata {
  const cf = request.cf;

  return {
    // Geographic (9 fields)
    country: cf?.country,
    region: cf?.region,
    city: cf?.city,
    postalCode: cf?.postalCode,
    latitude: cf?.latitude,
    longitude: cf?.longitude,
    timezone: cf?.timezone,
    continent: cf?.continent,
    isEUCountry: cf?.isEUCountry,

    // Network (5 fields)
    asn: cf?.asn,
    asOrganization: cf?.asOrganization,
    colo: cf?.colo,
    httpProtocol: cf?.httpProtocol,
    tlsVersion: cf?.tlsVersion,
    tlsCipher: cf?.tlsCipher,

    // Bot Management (6+ fields - Enterprise only)
    botScore: cf?.botManagement?.score,
    clientTrustScore: cf?.botManagement?.clientTrustScore,
    verifiedBot: cf?.botManagement?.verifiedBot,
    ja3Hash: cf?.botManagement?.ja3Hash,
    ja4: cf?.botManagement?.ja4,
    ja4Signals: cf?.botManagement?.ja4Signals,
    detectionIds: cf?.botManagement?.detectionIds,

    // Request (3 fields)
    remoteIp: headers.get('cf-connecting-ip'),
    userAgent: headers.get('user-agent'),
    timestamp: new Date().toISOString()
  };
}
```

### 7. Dynamic Routing System

**Configurable API endpoints** via environment variables:

```jsonc
// wrangler.jsonc
"vars": {
  "ROUTES": {
    "submissions": "/api/submissions",  // or "/sign-ups", "/v2/forms", etc.
    "analytics": "/api/analytics",
    "admin": "/api/admin",
    "geo": "/api/geo",
    "health": "/api/health"
  }
}
```

**Implementation** (`src/lib/router.ts`):

```typescript
// Load routes from environment with in-memory caching
export function getRouteConfig(env: Env): RouteConfig {
  if (cachedRoutes !== null) return cachedRoutes;

  const routes = typeof env.ROUTES === 'string'
    ? JSON.parse(env.ROUTES)
    : env.ROUTES;

  const merged = { ...DEFAULT_ROUTES, ...routes };
  cachedRoutes = merged;
  return merged;
}

// Match incoming path against configured routes (longest-prefix matching)
export function matchRoute(path: string, routes: RouteConfig): keyof RouteConfig | null {
  const normalizedPath = path.endsWith('/') && path.length > 1
    ? path.slice(0, -1)
    : path;

  // Sort by length (longest first) for correct matching
  const sortedRoutes = Object.entries(routes).sort(
    ([, a], [, b]) => b.length - a.length
  );

  for (const [name, pattern] of sortedRoutes) {
    // Exact or prefix match
    if (normalizedPath === pattern || normalizedPath.startsWith(pattern + '/')) {
      return name as keyof RouteConfig;
    }
  }

  return null;
}

// Strip route prefix for handler normalization
export function stripRoutePrefix(path: string, routePattern: string): string {
  if (path === routePattern) return '/';
  if (path.startsWith(routePattern + '/')) {
    return path.slice(routePattern.length);
  }
  return path;
}
```

**Why This Works:**
- **Flexibility**: Deploy same worker to multiple domains with different paths
- **Performance**: In-memory caching (single parse per worker instance)
- **Safety**: Longest-prefix matching prevents `/api/sub` matching `/api/submissions`
- **Transparency**: Route configuration visible in wrangler.jsonc

**Use Cases:**
- Multi-tenant deployments (`/client-a/submit`, `/client-b/submit`)
- API versioning (`/v2/submissions`)
- Legacy path support (`/sign-ups` → same handler as `/api/submissions`)
- Custom branding (`/register` instead of `/api/submissions`)

### 8. Testing Bypass System

**API key-authenticated testing mode** for CI/CD and local development:

**Configuration:**
```jsonc
// wrangler.jsonc
"vars": {
  "ALLOW_TESTING_BYPASS": "false"  // MUST be false in production
}
```

**Implementation** (`src/routes/submissions.ts`):
```typescript
// Check if testing bypass is allowed
if (env.ALLOW_TESTING_BYPASS === 'true' && apiKey && apiKey === env['X-API-KEY']) {
  // Create mock validation for testing
  validation = createMockValidation(sanitizedData.email, metadata);
} else {
  // Normal Turnstile validation
  validation = await validateTurnstileToken(/* ... */);
}
```

**Security:**
- Requires **both** `ALLOW_TESTING_BYPASS=true` AND valid `X-API-KEY` header
- All fraud detection layers still run (email, JA4, IP diversity, etc.)
- Only skips Turnstile site-verify API call
- Never enabled in production

**Benefits:**
- Automated testing without Turnstile widget
- CI/CD pipeline integration
- curl/Postman API testing
- Local development without token generation

## API Endpoints

### POST /api/submissions
Submit form with Turnstile validation (single-step operation).

**Request**:
```json
{
  "firstName": "John",
  "lastName": "Doe",
  "email": "john@example.com",
  "phone": "+1234567890",
  "address": "123 Main St",
  "dateOfBirth": "1990-01-01",
  "turnstileToken": "0.xxx..."
}
```

**Response**:
```json
{
  "success": true,
  "id": 123,
  "message": "Submission created successfully"
}
```

### GET /api/analytics/stats
Get validation statistics.

### GET /api/analytics/submissions
Get recent submissions (supports pagination).

### GET /api/analytics/countries
Get submissions by country.

### GET /api/analytics/bot-scores
Get bot score distribution.

## Deployment

The project uses a unified deployment process:

```bash
# Build frontend + deploy worker
npm run deploy

# Or step-by-step:
npm run build      # Build frontend only
wrangler deploy    # Deploy worker only
```

**Deployment Flow**:
1. `npm run build` executes `cd frontend && npm run build && cd ..`
2. Astro generates static files to `frontend/dist/`
3. `wrangler deploy` bundles Worker code + uploads
4. Worker ASSETS binding serves files from `frontend/dist/`
5. Custom domain routes traffic to Worker

## Environment Setup

**Required Secrets** (via `wrangler secret`):
```bash
wrangler secret put TURNSTILE-SECRET-KEY
wrangler secret put TURNSTILE-SITE-KEY
```

**Configuration** (wrangler.jsonc):
```jsonc
{
  "name": "forminator",
  "main": "src/index.ts",
  "compatibility_date": "2025-11-12",

  "assets": {
    "binding": "ASSETS",
    "directory": "./frontend/dist"
  },

  "d1_databases": [{
    "binding": "DB",
    "database_name": "DB",
    "database_id": "YOUR-DATABASE-ID"
  }],

  "routes": [{
    "pattern": "form.erfi.dev",
    "custom_domain": true
  }]
}
```

## Development

**Local Development with Remote D1**:
```bash
# Terminal 1: Build frontend (watch mode)
cd frontend && npm run dev

# Terminal 2: Run worker with remote D1
cd .. && wrangler dev --remote
```

**Why Remote D1?**
- Consistency with production
- No local/remote data sync issues
- Realistic testing environment
- Easier debugging

## Performance Considerations

- **Static Assets**: Pre-rendered, served from edge
- **D1 Queries**: Indexed for fast lookups
- **Worker Execution**: < 50ms typical response time
- **Turnstile Validation**: Adds ~100-300ms
- **Total Submission Time**: Usually < 500ms

## Scalability

- **Workers**: Auto-scales globally
- **D1**: Eventual consistency, suitable for form submissions
- **Assets**: CDN-cached, instant delivery
- **Rate Limiting**: Basic D1-based (can upgrade to Durable Objects for strict enforcement)

## Security Highlights

1. **Single-Use Tokens**: Prevents replay attacks
2. **Token Hashing**: SHA256, not stored in plaintext
3. **Fraud Detection**: Ephemeral ID + IP-based fallback
4. **Input Validation**: Zod schemas client + server
5. **SQL Injection**: Parameterized queries only
6. **XSS Prevention**: Input sanitization
7. **CORS**: Configured for specific domains
8. **CSP Headers**: Prevents inline script injection
9. **Rate Limiting**: IP-based throttling

## Monitoring

**Key Metrics**:
- Total validations
- Success rate
- Block rate
- Fraud detection triggers
- Average response time
- Submissions per country
- Bot score distribution

**Logs**:
- All validation attempts (success + failure)
- Fraud detection decisions
- Token replay attempts
- Rate limit hits
- Error codes

## Further Reading

- [SECURITY.md](./SECURITY.md) - Security fixes and best practices
- [TURNSTILE.md](./TURNSTILE.md) - Turnstile integration guide
- [FRAUD-DETECTION.md](./FRAUD-DETECTION.md) - Ephemeral ID strategy
- [API-REFERENCE.md](./API-REFERENCE.md) - Complete API documentation
