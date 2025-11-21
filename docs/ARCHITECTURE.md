# Architecture

## Overview

Forminator is a full-stack Cloudflare Turnstile demonstration showcasing:
- **Frontend**: Astro static site with React components (shadcn/ui) and dark mode
- **Backend**: Cloudflare Worker with Hono routing framework
- **Database**: D1 for storing form submissions with rich metadata (40+ fields)
- **Security**: Single-step Turnstile validation with fraud detection

## Project Structure

```
forminator/
├── frontend/                    # Astro static site (UI only)
│   ├── src/
│   │   ├── components/         # React components (shadcn/ui)
│   │   │   ├── SubmissionForm.tsx
│   │   │   ├── AnalyticsDashboard.tsx (modular design)
│   │   │   └── analytics/     # Analytics components
│   │   ├── hooks/              # Custom React hooks
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

```mermaid
graph TB
    subgraph Client["Client Layer (Browser)"]
        A[Astro 5.x<br/>Static Site Generation]
        B[React 19<br/>Component Framework]
        C[shadcn/ui<br/>UI Components]
        D[Tailwind CSS 4<br/>Styling]
        E[Zod<br/>Client Validation]
    end

    subgraph Edge["Edge Layer (Cloudflare Workers)"]
        F[Hono 4.x<br/>Routing Framework]
        G[Pino<br/>Structured Logging]
        H[Zod<br/>Server Validation]
    end

    subgraph Security["Security Layer"]
        I[Turnstile<br/>CAPTCHA Alternative]
        J[Ephemeral IDs<br/>Bot Management]
        K[SHA256 Hashing<br/>Token Replay Protection]
        L[Input Sanitization<br/>XSS Prevention]
    end

    subgraph Data["Data Layer"]
        M[D1 Database<br/>SQLite at Edge]
        N[KV Storage<br/>Key-Value Store]
        O[Markov-Mail<br/>Worker RPC]
    end

    A --> F
    B --> F
    C --> D
    E --> H
    F --> I
    F --> J
    F --> K
    F --> L
    F --> M
    F --> O
    I --> J

    style Client fill:#5e81ac,color:#fff
    style Edge fill:#88c0d0,color:#000
    style Security fill:#a3be8c,color:#000
    style Data fill:#ebcb8b,color:#000
```

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

```mermaid
sequenceDiagram
    participant Browser as Client Browser<br/>(form.erfi.dev)
    participant Worker as Cloudflare Worker<br/>(Hono App)
    participant Turnstile as Turnstile API<br/>(siteverify)
    participant D1 as D1 Database

    Note over Browser: Static Astro pages (UI)<br/>TurnstileWidget<br/>SubmissionForm<br/>AnalyticsDashboard

    Browser->>Worker: POST /api/submissions<br/>{formData, turnstileToken}

    Note over Worker: 1. Extract request metadata<br/>(IP, geo, bot signals)
    Note over Worker: 2. Validate form data (Zod)
    Note over Worker: 3. Sanitize inputs (HTML strip)
    Note over Worker: 4. Hash token (SHA256)

    Worker->>D1: 5. Check token reuse
    D1-->>Worker: Token status

    Worker->>Turnstile: 6. Validate token (siteverify)
    Note over Turnstile: Returns:<br/>• success<br/>• challenge_ts<br/>• hostname<br/>• action<br/>• metadata.ephemeral_id
    Turnstile-->>Worker: Validation result

    Note over Worker: 7. Fraud detection<br/>(ephemeral ID or IP-based)

    Worker->>D1: 8. Create submission
    Worker->>D1: 9. Log validation attempt

    Note over D1: Tables:<br/>• submissions (42 fields)<br/>• turnstile_validations (35 fields)<br/><br/>Metadata:<br/>• Geographic (country, city, etc)<br/>• Network (ASN, colo, TLS)<br/>• Bot signals (scores, JA3, JA4)<br/>• Detection IDs, JA4 signals

    Worker->>Browser: 10. Return success/error
```

### Request Processing Pipeline

```mermaid
flowchart TD
    Start([POST /api/submissions]) --> Extract[Extract Request Metadata<br/>IP, geo, bot signals from request.cf]
    Extract --> Validate[Validate Form Data<br/>Zod schema validation]
    Validate --> Sanitize[Sanitize Inputs<br/>HTML stripping for XSS prevention]
    Sanitize --> Hash[Hash Turnstile Token<br/>SHA256 hashing]
    Hash --> CheckReuse{Check Token<br/>Reuse in D1}

    CheckReuse -->|Replay Detected| RejectReplay[Reject: Token replay attack<br/>risk_score=100]
    CheckReuse -->|New Token| CallTurnstile[Call Turnstile API<br/>siteverify endpoint]

    CallTurnstile --> TurnstileResult{Turnstile<br/>Success?}
    TurnstileResult -->|Failed| RejectTurnstile[Reject: Turnstile validation failed]
    TurnstileResult -->|Success| FraudCheck[Fraud Detection<br/>Ephemeral ID or IP-based]

    FraudCheck --> RiskScore{Risk Score<br/>≥ 70?}
    RiskScore -->|Yes| RejectFraud[Reject: Fraud detected<br/>Auto-blacklist]
    RiskScore -->|No| CreateSubmission[Create Submission in D1<br/>42 fields + metadata]

    CreateSubmission --> LogValidation[Log Validation Attempt<br/>35 fields]
    LogValidation --> Success([Return Success])

    RejectReplay --> LogRejection[Log Rejection]
    RejectTurnstile --> LogRejection
    RejectFraud --> LogRejection
    LogRejection --> Error([Return Error])

    style Start fill:#5e81ac
    style Success fill:#a3be8c
    style Error fill:#bf616a
    style RejectReplay fill:#bf616a
    style RejectTurnstile fill:#bf616a
    style RejectFraud fill:#bf616a
```

## Key Implementation Details

### Worker at Root Level

The Worker is the main project, with the frontend as a subdirectory:
- `src/` contains Worker code (Hono app, routes, lib)
- `frontend/` contains Astro static site
- Worker serves static assets from `frontend/dist` via ASSETS binding
- Single deploy: `npm run deploy` builds frontend + deploys worker

### Single-Step Validation

Turnstile tokens are single-use. The implementation uses a single endpoint:
- Client collects form data + Turnstile token
- Single POST to `/api/submissions` with all data
- Server validates token, checks fraud, creates submission atomically
- Token is hashed (SHA256) and stored to prevent replay attacks

### Static Site Generation

Frontend uses Astro SSG:
- `frontend/dist/` contains static HTML, CSS, JS
- Worker serves these files directly
- Hydration for React components (client:load)

### Fraud Detection Strategy

```mermaid
flowchart TD
    Start([Form Submission]) --> Layer0{Layer 0:<br/>Pre-Validation<br/>Blacklist}

    Layer0 -->|In Blacklist| BlockFast[❌ Block: Fast reject<br/>~10ms lookup<br/>85-90% API reduction]
    Layer0 -->|Not in Blacklist| TokenReplay{Token Replay<br/>Detection}

    TokenReplay -->|Replay| Block1[❌ Block: Token replay<br/>risk_score=100<br/>35% weight]
    TokenReplay -->|New Token| Layer1{Layer 1:<br/>Email Fraud<br/>Markov-Mail RPC}

    Layer1 -->|Fraud Detected| Block2[❌ Block: Email fraud<br/>Pattern/OOD/Disposable<br/>17% weight<br/>+ Add to blacklist 1h]
    Layer1 -->|Pass/Fail-open| Layer2{Layer 2:<br/>Ephemeral ID<br/>Submission Count}

    Layer2 -->|≥2 submissions<br/>in 24h| Block3[❌ Block: Duplicate device<br/>risk_score≥70<br/>18% weight]
    Layer2 -->|Pass| Layer3{Layer 3:<br/>Validation<br/>Frequency}

    Layer3 -->|≥3 attempts<br/>in 1h| Block4[❌ Block: Rate limit<br/>risk_score≥70<br/>13% weight]
    Layer3 -->|Pass| Layer4{Layer 4:<br/>IP Diversity}

    Layer4 -->|≥2 IPs<br/>in 24h| Block5[❌ Block: Proxy rotation<br/>risk_score≥80<br/>9% weight]
    Layer4 -->|Pass| Layer5{Layer 5:<br/>JA4 Session<br/>Hopping}

    Layer5 -->|Clustering<br/>Rapid/Extended| Block6[❌ Block: Browser hopping<br/>risk_score≥75<br/>8% weight]
    Layer5 -->|Pass| RiskCalc[Calculate Total<br/>Risk Score<br/>0-100 normalized]

    RiskCalc --> FinalCheck{Risk Score<br/>≥ 70?}
    FinalCheck -->|Yes| BlockFinal[❌ Block + Auto-Blacklist<br/>Progressive timeout:<br/>1h→4h→8h→12h→24h]
    FinalCheck -->|No| Allow[✅ Allow Submission<br/>Log to D1]

    BlockFast --> End([End])
    Block1 --> End
    Block2 --> End
    Block3 --> End
    Block4 --> End
    Block5 --> End
    Block6 --> End
    BlockFinal --> End
    Allow --> End

    style Start fill:#5e81ac
    style Allow fill:#a3be8c
    style BlockFast fill:#bf616a
    style Block1 fill:#bf616a
    style Block2 fill:#bf616a
    style Block3 fill:#bf616a
    style Block4 fill:#bf616a
    style Block5 fill:#bf616a
    style Block6 fill:#bf616a
    style BlockFinal fill:#bf616a
```

**Ephemeral ID Detection**:
- Enterprise Bot Management feature
- 7-day detection window (IDs rotate after a few days)
- Checks: submission count, validation attempts, unique emails, rapid submissions
- Risk score calculation with 70-point block threshold

**IP-based Fallback**:
- Used when ephemeral ID unavailable
- 1-hour detection window
- Lower risk scores to reduce false positives on shared IPs

### Database Schema Design

```mermaid
erDiagram
    submissions ||--o{ turnstile_validations : "has many"

    submissions {
        int id PK
        string first_name
        string last_name
        string email
        string phone
        string address
        date date_of_birth
        string ephemeral_id "Indexed"
        string remote_ip
        string user_agent
        string country "Indexed"
        string region
        string city
        string postal_code
        float latitude
        float longitude
        string timezone
        string continent
        bool is_eu_country
        int asn
        string as_organization
        string colo
        string http_protocol
        string tls_version
        string tls_cipher
        int bot_score "Indexed - Enterprise"
        int client_trust_score
        bool verified_bot
        string ja3_hash "Indexed - Enterprise"
        string ja4 "Indexed - Enterprise"
        json ja4_signals "Enterprise"
        json detection_ids "Enterprise"
        datetime created_at "Indexed"
    }

    turnstile_validations {
        int id PK
        string token_hash UK "SHA256, Unique Index"
        int submission_id FK "NULL for blocks"
        bool success
        bool allowed
        string block_reason
        int risk_score
        string challenge_ts
        string hostname
        string action
        string ephemeral_id "From Turnstile API"
        string remote_ip
        string user_agent
        string country
        json metadata "40+ fields from request.cf"
        datetime created_at
    }

    fraud_blocks {
        int id PK
        string detection_type
        string block_reason
        int risk_score
        string email
        string pattern_type "Email fraud"
        bool markov_detected
        bool ood_detected
        bool disposable_domain
        float tld_risk_score
        string remote_ip
        string user_agent
        string country
        string erfid "Ephemeral ID (if available)"
        datetime created_at
    }

    fraud_blacklist {
        int id PK
        string ephemeral_id "Indexed with expires_at"
        string ip_address "Indexed with expires_at"
        string ja4
        string block_reason
        int detection_confidence
        string detection_type
        datetime blocked_at
        datetime expires_at "Indexed - Auto-expiry"
        datetime last_seen_at
        int offense_count "Progressive timeout"
    }
```

**Four Main Tables**:

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

3. **fraud_blocks** (16 fields)
   - Pre-Turnstile fraud detection (email fraud, etc.)
   - Detection info (detection_type, block_reason, risk_score)
   - Email fraud signals (pattern_type, markov_detected, ood_detected, disposable_domain, tld_risk_score)
   - Request metadata (remote_ip, user_agent, country)
   - Tracking (erfid, created_at)

4. **fraud_blacklist** (13 fields)
   - Active blocking cache (ephemeral_id, ip_address, ja4)
   - Block metadata (block_reason, detection_confidence, detection_type)
   - Timing (blocked_at, expires_at, last_seen_at)
   - Progressive timeout tracking

**Key Indexes**:
- `token_hash` (unique) - Prevents token reuse
- `ephemeral_id` - Fast fraud detection queries
- `created_at` - Time-based analytics
- `email`, `country`, `ja3_hash`, `ja4`, `bot_score` - Analytics performance

### Metadata Extraction

40+ fields extracted from request.cf:

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

### Dynamic Routing System

Configurable API endpoints via environment variables:

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

Features:
- In-memory caching (single parse per worker instance)
- Longest-prefix matching prevents `/api/sub` matching `/api/submissions`
- Route configuration visible in wrangler.jsonc

### Testing Bypass System

API key-authenticated testing mode for CI/CD and local development:

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

Requirements:
- Requires **both** `ALLOW_TESTING_BYPASS=true` AND valid `X-API-KEY` header
- All fraud detection layers still run (email, JA4, IP diversity, etc.)
- Only skips Turnstile site-verify API call
- Never enabled in production

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

Unified deployment process:

```bash
# Build frontend + deploy worker
npm run deploy

# Or step-by-step:
npm run build      # Build frontend only
wrangler deploy    # Deploy worker only
```

### Deployment Flow

```mermaid
flowchart LR
    subgraph Local["Local Development"]
        A[npm run build] --> B[cd frontend &&<br/>npm run build]
        B --> C[Astro SSG<br/>Generates static files]
        C --> D[frontend/dist/<br/>HTML, CSS, JS]
    end

    subgraph Deploy["Deployment"]
        E[wrangler deploy] --> F[Bundle Worker code<br/>src/index.ts + routes + lib]
        F --> G[Upload to<br/>Cloudflare]
    end

    subgraph Production["Production (form.erfi.dev)"]
        H[Worker Runtime] --> I[ASSETS binding<br/>serves frontend/dist/]
        H --> J[API routes<br/>/api/*]
        H --> K[D1 Database<br/>submissions + validations]
    end

    D --> E
    G --> H

    style A fill:#5e81ac
    style E fill:#5e81ac
    style H fill:#a3be8c
    style I fill:#88c0d0
    style J fill:#88c0d0
    style K fill:#88c0d0
```

**Flow Breakdown**:
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

Local development with remote D1:

```bash
# Terminal 1: Build frontend (watch mode)
cd frontend && npm run dev

# Terminal 2: Run worker with remote D1
cd .. && wrangler dev --remote
```

Remote D1 usage provides consistency with production and avoids local/remote data sync issues.

## Security Implementation

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
- Submissions per country
- Bot score distribution

**Logs**:
- All validation attempts (success + failure)
- Fraud detection decisions
- Token replay attempts
- Rate limit hits
- Error codes

## References

- [SECURITY.md](./SECURITY.md) - Security implementation details
- [TURNSTILE.md](./TURNSTILE.md) - Turnstile integration
- [FRAUD-DETECTION.md](./FRAUD-DETECTION.md) - Fraud detection system
- [API-REFERENCE.md](./API-REFERENCE.md) - Complete API documentation
