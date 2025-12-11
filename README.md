# Forminator

**Forminator** - I'm collecting all your data.

Production-ready form submission platform powered by Cloudflare Turnstile with advanced fraud detection using Bot Management signals. Built with Astro frontend, Cloudflare Workers backend (Hono), and D1 database.

## Architecture

```
forminator/
├── frontend/              # Astro static site (UI only)
│   ├── src/
│   │   ├── components/   # React components (shadcn/ui)
│   │   ├── layouts/      # Astro layouts
│   │   ├── pages/        # Static pages (NO API routes)
│   │   └── styles/       # CSS
│   └── package.json
│
├── src/                   # Cloudflare Worker (Backend)
│   ├── index.ts          # Hono app + asset serving
│   ├── routes/           # API routes (submissions, analytics)
│   └── lib/              # Business logic (Turnstile, D1, validation)
│
├── wrangler.jsonc        # Worker configuration
├── package.json          # Worker dependencies
└── schema.sql            # D1 database schema
```

## Features

### Security & Fraud Detection
- **Turnstile Integration**: Explicit rendering with interaction-only appearance
- **Single-step Validation**: Token validation + fraud check + submission in one atomic operation
- **Token Replay Protection**: SHA256 hashing with unique index
- **Multi-layer Fraud Detection**: Pre-validation blacklist, IP behavioral signals, email RPC, ephemeral ID, validation frequency, JA4 session hopping, IP diversity
- **Normalized Risk Scoring**: Mathematical 0-100 scale with 10 weighted components (core layers + header fingerprint reuse, TLS anomalies, and latency mismatches)
- **Fingerprint Enforcement**: Header signature reuse detection, TLS ClientHello anomaly checks, and RTT/platform mismatch scoring stacked on top of Cloudflare metadata
- **Progressive Timeout System**: Auto-blacklist with escalating timeouts (1h → 24h)
- **Email Fraud Detection**: Worker-to-Worker RPC with Markov Chain analysis (83% accuracy, 0% false positives)
- **JA4 Session Hopping**: Detects incognito/browser switching attacks via TLS fingerprinting
- **Erfid Request Tracing**: Unique `erfid` values returned in the JSON body + `X-Request-Id` header for every request
- **Testing Bypass**: API key-authenticated testing mode for CI/CD
- **Dynamic Routing**: Configurable API endpoints via environment variables
- **SQL Injection Prevention**: Parameterized queries with whitelisting
- **Input Sanitization**: HTML stripping and normalization

### Rich Metadata Collection
Captures 40+ fields from `request.cf` and headers:
- **Geographic**: Country, region, city, postal code, lat/long, timezone
- **Network**: ASN, AS organization, colo, HTTP protocol, TLS version/cipher
- **Bot Management**: Bot score, client trust score, verified bot flag, JS detection
- **Fingerprints**: JA3 hash, JA4 string, JA4 signals (h2h3_ratio, heuristic_ratio, etc.)
- **Detection**: Detection IDs array from Bot Management
- **HTTP Signals**: `sec-ch-ua*` client hints, `sec-fetch-*`, Accept-Language/Encoding, DNT, HTTP/2 priority, header fingerprint snapshot
- **TLS Internals**: ClientHello length, ClientRandom, TLS extension hashes, exported authenticator, client-auth metadata, client RTT, CF Ray, device type

### UI & Analytics
- **Dark Mode**: Full support with enhanced accent colors and shadows
- **Custom Phone Input**: International phone selector with 200+ countries, SVG flags, searchable dropdown
- **Real-time Analytics**: 20 endpoints covering submissions, validations, blacklist, fraud reasons, exports, and per-erfid lookups
- **Form Validation**: Client and server-side with Zod schemas
- **Visual Submission Flow**: 4-stage progress indicator with interactive callback integration
- **Risk Transparency**: Educational component explaining the 10-component fraud detection scoring system
- **Detailed Inspection**: Modal dialogs for both submissions and blocked validations with 35+ fields
- **Security Events Detail View**: Comprehensive validation inspection with geographic, network, bot detection, and fingerprint data

## Quick Start

### Prerequisites
- Node.js 18+
- Wrangler CLI: `npm install -g wrangler`
- Cloudflare account with D1 database created

### 1. Install Dependencies

```bash
# Worker (root)
npm install

# Frontend
cd frontend
npm install
cd ..
```

### 2. Set Up D1 Database

```bash
# Create D1 database (if not already created)
wrangler d1 create turnstile-demo

# Note the database_id from the output and update worker/wrangler.jsonc

# Initialize schema
wrangler d1 execute turnstile-demo --file=./schema.sql --remote
```

### 3. Configure Secrets

```bash
# Set secrets for production
wrangler secret put TURNSTILE-SECRET-KEY
wrangler secret put TURNSTILE-SITE-KEY
wrangler secret put X-API-KEY

# For local development, create .dev.vars in root
cat > .dev.vars << EOF
TURNSTILE-SECRET-KEY=your_secret_key_here
TURNSTILE-SITE-KEY=0x4AAAAAACAjw0bmUZ7V7fh2
X-API-KEY=your_api_key_here
ALLOW_TESTING_BYPASS=true
EOF
```

**Optional env vars**
- `ALLOWED_ORIGINS`: Comma-separated CORS allowlist (defaults to `https://form.erfi.dev`; dev also whitelists `http://localhost:8787` and `http://localhost:4321` automatically).
- `DISABLE_STATIC_ASSETS`: `"true"` to run backend-only (no Astro assets).
- `ROUTES`: JSON map to rename `/api/*` prefixes (e.g., `{"submissions":"/forms"}`).
- `FRAUD_CONFIG`: JSON to override risk weights/thresholds (deep-merged with defaults).
- `ERFID_CONFIG`: JSON to customize the `erfid` generator (prefix/entropy/length).

### 4. Update Configuration

Edit `wrangler.jsonc`:
- Update `database_id` with your D1 database ID
- Verify `routes` section has your custom domain (form.erfi.dev)

### 5. Build & Deploy

```bash
# Deploy (automatically builds frontend first)
npm run deploy

# Or manually:
# npm run build  # Build frontend only
# wrangler deploy  # Deploy worker only
```

## Development

### Local Development with Remote D1

```bash
# Terminal 1: Build frontend (watch mode)
cd frontend
npm run dev

# Terminal 2: Run worker with remote D1 (from root)
cd ..
wrangler dev --remote
```

The `--remote` flag uses your production D1 database for testing.

## API Endpoints

### Form Submission

**POST /api/submissions**
Submit form with Turnstile validation (atomic operation).

Request body:
```json
{
  "firstName": "John",
  "lastName": "Doe",
  "email": "john@example.com",
  "phone": "+1234567890",
  "address": {
    "street": "123 Main St",
    "city": "San Francisco",
    "state": "CA",
    "postalCode": "94102",
    "country": "US"
  },
  "dateOfBirth": "1990-01-01",
  "turnstileToken": "0.xxx..."
}
```

Notes:
- `phone`, `address`, and `dateOfBirth` are optional. Phone numbers are normalized to E.164 and address objects must include `country` when other fields are provided.
- `turnstileToken` is required unless `ALLOW_TESTING_BYPASS=true` **and** the request includes a valid `X-API-KEY` header (used for CI and load tests).

Processing flow:
1. Generate an `erfid` and expose it via the JSON response and `X-Request-Id` header
2. Extract 40+ Cloudflare metadata fields plus optional field-mapping metadata for analytics
3. Validate & sanitize payload with Zod (optional phone/address/DOB supported)
4. Hash the Turnstile token (unless bypassed) and block replays before calling the API
5. Run the Layer 0 blacklist check (email, ephemeral ID, JA4, IP) for instant cached blocks
6. Validate Turnstile (or inject a mock validation in bypass mode)
7. Collect fraud signals: email RPC (Markov-Mail), ephemeral ID (submissions/validations/IP diversity), JA4 session hopping, and IP rate-limit behavior
8. Detect duplicate email attempts (returns 409 for first duplicate, rate-limits recurring abuse)
9. Normalize scores across the 10-component risk model and determine block triggers
10. Apply progressive timeouts + blacklist writes for blocked attempts, otherwise insert the submission with risk breakdown + raw payload metadata
11. Log every validation (allowed or blocked) with `erfid`, detection type, and normalized component scores for analytics dashboards

#### Risk modes & deterministic blockers

The scorer now supports two modes, configured via `risk.mode`:

- **`defensive` (default)** – deterministic triggers (token replay, duplicate email, Layer 2/3 thresholds, JA4 session hopping, repeat offenders) can override the additive total once their paired condition also fires (e.g., high JA4 score **and** elevated IP velocity). This keeps the “multi-signal” guarantee but still blocks obvious abuse immediately.
- **`additive`** – every component remains purely additive. Even when Layer 2/3 spikes, the request is only blocked if the weighted total ≥ block threshold. Use this for QA or lab environments.

Every block reason logged to `turnstile_validations`/`fraud_blacklist` includes the component explanations plus a note when a repeat offender short-circuit was applied.

### Analytics (Protected with X-API-KEY header)

**GET /api/analytics/stats**
Validation statistics summary (total, success rate, avg risk score).

**GET /api/analytics/submissions**
Paginated submissions with filtering (country, bot score range, date range, search).

**GET /api/analytics/submissions/:id**
Single submission details.

**GET /api/analytics/countries**
Submissions by country (top 20).

**GET /api/analytics/bot-scores**
Bot score distribution (binned: 0-29, 30-49, 50-69, 70-89, 90-100).

**GET /api/analytics/asn**
Network ASN distribution (top 10).

**GET /api/analytics/tls**
TLS version distribution (top 10).

**GET /api/analytics/ja3**
JA3 fingerprint distribution (top 10).

**GET /api/analytics/ja4**
JA4 fingerprint distribution (top 10).

**GET /api/analytics/email-patterns**
Distribution of email fraud pattern types detected by Markov-Mail.

**GET /api/analytics/time-series**
Trend data (6 metrics: submissions, validations, success_rate, bot_score_avg, risk_score_avg, allowed_rate; 4 intervals: hour, day, week, month).

**GET /api/analytics/fraud-patterns**
Detected fraud patterns with high-risk submissions.

**GET /api/analytics/blocked-stats**
Aggregate counts for blocked validations vs pre-validation fraud blocks, including average risk score.

**GET /api/analytics/block-reasons**
Breakdown of block reasons across validation and fraud-block sources.

**GET /api/analytics/blacklist**
Paginated view of active blacklist entries with offense counts and expiry timestamps.

**GET /api/analytics/blacklist-stats**
High-level snapshot (total active, by confidence level, identifiers used).

**GET /api/analytics/blocked-validations**
Recent blocked validations across both pipelines (limit configurable via `?limit=`).

**GET /api/analytics/export**
CSV or JSON export of submissions with all filters applied.

**GET /api/analytics/validations/:id**
Single validation details with all 35+ fields.

**GET /api/analytics/validations/by-erfid/:erfid**
Lookup any validation attempt directly via the `erfid` returned to clients.

### Utilities

**GET /api/geo**
Detect user country from Cloudflare headers.

**GET /api/config**
Expose the merged fraud detection configuration (`success`, `data`, `version`, `customized`) for UI hints and transparency.

**GET /api/health**
Service health check.

## Database Schema

### submissions (40+ columns)
- **Form data**: first_name, last_name, email, phone, structured address JSON, date_of_birth
- **Email risk**: email_risk_score, email_fraud_signals JSON, email_pattern_type, email_markov_detected, email_ood_detected
- **Risk metadata**: risk_score_breakdown JSON, raw form_data payload, extracted_email, extracted_phone
- **Request metadata**: remote_ip, user_agent, geo fields (country, region, city, postal_code, timezone, latitude, longitude, continent, is_eu_country)
- **Network/Bot**: asn, as_organization, colo, http_protocol, tls_version, tls_cipher, bot_score, client_trust_score, verified_bot, detection_ids JSON
- **Fingerprints**: ja3_hash, ja4, ja4_signals JSON
- **Tracking**: ephemeral_id, erfid, created_at timestamps

### turnstile_validations (35+ columns)
- **Validation data**: token_hash (unique), success, allowed, block_reason, challenge_ts, hostname, action, detection_type
- **Risk**: normalized risk_score plus risk_score_breakdown JSON for transparency
- **Request metadata**: identical geo/network/bot fields as submissions
- **Linkage**: submission_id (nullable), erfid, warnings, raw error codes

### fraud_blacklist (progressive mitigation cache)
- **Identifiers**: email, ephemeral_id, ip_address, ja4 (any combination)
- **Block metadata**: block_reason, detection_type, detection_confidence, detection_metadata JSON, submission_count, last_seen_at, erfid
- **Risk transparency**: persisted risk_score plus risk_score_breakdown JSON (same structure as submissions/validations) so analytics can explain pre-validation blocks
- **Timing**: blocked_at + expires_at derived from the progressive timeout schedule (1h → 4h → 8h → 12h → 24h) whenever risk ≥ 70
- **Purpose**: Layer 0 cache so repeat offenders are blocked before Turnstile calls

### fraud_blocks (forensic log)
- **Scope**: Tracks pre-Turnstile blocks (email RPC failures, blacklist hits, etc.)
- **Fields**: detection_type, block_reason, risk_score, remote_ip, user_agent, country, metadata_json, fraud_signals_json, erfid, created_at
- **Purpose**: Feed analytics dashboards without slowing down Layer 0 decisions

### Indexes
- **Token replay**: UNIQUE index on `turnstile_validations.token_hash`
- **Submissions**: created_at, ephemeral_id, email, country, ja3_hash, ja4, email_pattern_type, extracted_email, extracted_phone
- **Validations**: ephemeral_id, created_at, country, bot_score, ja3_hash, ja4
- **Fraud caches**: composite indexes on fraud_blacklist (ephemeral_id, ip_address, ja4, email + expires_at) and fraud_blocks (detection_type, created_at, remote_ip, country)

## Fraud Detection Algorithm

### Layered Detection System

**Layer 0: Pre-validation Blacklist**
- Fast D1 lookup before Turnstile API call
- Significantly reduces API calls for repeat offenders
- Checks email, ephemeral_id, ja4, and IP address against `fraud_blacklist`

**Layer 0.5: IP Behavioral Signal**
- Counts submissions per IP in the last hour
- Contributes to risk scoring (0/25/50/75/100) but never blocks on its own
- Designed to detect browser-switching attacks that change fingerprints

**Layer 1: Email Fraud Detection (Markov-Mail Integration)**
- Worker-to-Worker RPC service binding
- Markov Chain pattern analysis (83% accuracy, 0% false positives)
- Pattern classification: sequential, dated, formatted, gibberish
- Out-of-Distribution (OOD) detection for unusual formats
- Disposable domain detection (71K+ domains)
- TLD risk profiling (143 TLDs analyzed)
- Fail-open design: allows submissions if service unavailable

**Layer 2: Ephemeral ID Fraud Detection**
- Tracks same device across a few days without cookies
- Defensive mode: 2+ submissions in 24h block immediately; additive mode just boosts the risk score
- Detects repeat registration attempts without requiring cookies

**Layer 3: Validation Frequency Monitoring**
- Defensive mode: 3+ validation attempts in 1h block immediately; additive mode treats them as high risk while still allowing
- 2 validation attempts in 1h: High risk (allows one retry)
- Catches rapid-fire attacks before D1 replication lag

**Layer 3.5: Repeat Offender Memory**
- Any detection type that blocked in the last 30 minutes for the same email/ephemeral/IP will immediately block again
- Prevents attackers from oscillating between “allowed” and “blocked” states across attempts

**Layer 4: JA4 Session Hopping Detection (3 sub-layers)**
- **4a: IP Clustering (1h)**: Same subnet + same JA4 + 2+ ephemeral IDs
- **4b: Rapid Global (5min)**: Same JA4 + 3+ ephemeral IDs globally
- **4c: Extended Global (1h)**: Same JA4 + 5+ ephemeral IDs globally
- Defensive mode only blocks when the JA4 spike is paired with abnormal velocity/IP rate; reusing the exact same ephemeral ID no longer counts as “+1”
- Detects incognito mode/browser hopping attacks
- TLS fingerprint-based device tracking

**Layer 5: IP Diversity Detection**
- 2+ unique IPs for same ephemeral ID in 24h: Block immediately
- Detects proxy rotation and distributed botnets

**Duplicate Email Protection**
- First duplicate attempt returns HTTP 409 with guidance
- 3+ duplicate attempts in 24h escalate to the blacklist with progressive timeouts

### Normalized Risk Scoring
All components contribute to normalized 0-100 risk score (weights total exactly 100%):
- **Token Replay**: 28% (instant block, highest priority)
- **Email Fraud**: 14% (Markov-Mail pattern detection)
- **Ephemeral ID**: 15% (device tracking, core fraud signal)
- **Validation Frequency**: 10% (attempt rate monitoring)
- **IP Diversity**: 7% (proxy rotation detection)
- **JA4 Session Hopping**: 6% (browser hopping detection)
- **IP Rate Limit**: 7% (browser switching detection / behavioral signal only)
- **Header Fingerprint**: 7% (shared header stack reuse across JA4/IP/email clusters)
- **TLS Anomaly**: 4% (JA4 presents unknown ClientHello/TLS extension hash)
- **Latency Mismatch**: 2% (claimed mobile devices with impossible RTT/device type)

**Block Threshold**: riskScore >= 70

### Progressive Timeout System
Auto-blacklist with escalating timeouts:
- 1st offense: 1 hour
- 2nd offense: 4 hours
- 3rd offense: 8 hours
- 4th offense: 12 hours
- 5th+ offense: 24 hours (maximum)

## Custom Domain Setup

The worker is configured for `form.erfi.dev`. To use your own domain:

1. Update `worker/wrangler.jsonc`:
```jsonc
"routes": [
  {
    "pattern": "your-domain.com",
    "custom_domain": true
  },
  {
    "pattern": "your-domain.com/*",
    "custom_domain": true
  }
]
```

2. In Cloudflare Dashboard:
   - Add custom domain to your Worker
   - Ensure DNS points to Cloudflare

## Troubleshooting

### D1 Database Not Found
```bash
wrangler d1 list
# Verify database_id matches worker/wrangler.jsonc
```

### Secrets Not Loading
Ensure `.dev.vars` exists in `worker/` directory for local development.

### Turnstile Widget Not Loading
1. Check browser console for errors
2. Verify sitekey in `TurnstileWidget.tsx` matches your widget
3. Ensure script tag is present in Layout.astro

### Bot Scores Always Null
Bot Management signals (bot_score, ja3_hash, ja4, detection_ids) require Cloudflare Enterprise with Bot Management enabled.

### Frontend Changes Not Reflecting
```bash
# Rebuild frontend
cd frontend
npm run build

# Redeploy worker
cd ../worker
wrangler deploy
```

## Documentation

### Core Documentation
- **[.dev.vars.example](./.dev.vars.example)** - Local development secrets template
- **[docs/README.md](./docs/README.md)** - Complete documentation index

### System Architecture (`docs/`)
- **[docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)** - Complete architecture and design decisions
- **[docs/SECURITY.md](./docs/SECURITY.md)** - Security implementation details
- **[docs/API-REFERENCE.md](./docs/API-REFERENCE.md)** - Complete API documentation for all endpoints

### Features (`docs/`)
- **[docs/FORM-VALIDATION.md](./docs/FORM-VALIDATION.md)** - Exhaustive form validation system guide
- **[docs/PHONE-INPUT.md](./docs/PHONE-INPUT.md)** - International phone input system
- **[docs/GEOLOCATION.md](./docs/GEOLOCATION.md)** - Country detection via Cloudflare
- **[docs/TURNSTILE.md](./docs/TURNSTILE.md)** - Turnstile integration guide
- **[docs/FRAUD-DETECTION.md](./docs/FRAUD-DETECTION.md)** - Ephemeral ID fraud detection strategy
- **[docs/CONFIGURATION-SYSTEM.md](./docs/CONFIGURATION-SYSTEM.md)** - Fraud configuration overrides and API exposure
- **[docs/SCORING-ANALYSIS.md](./docs/SCORING-ANALYSIS.md)** - Deep dive on normalized scoring math
- **[docs/ERFID-TRACKING.md](./docs/ERFID-TRACKING.md)** - Request-level tracing via erfid + `X-Request-Id`
- **[docs/RPC-INTEGRATION.md](./docs/RPC-INTEGRATION.md)** - Worker-to-Worker integration (Markov-Mail)
- **[docs/SCHEMA-INITIALIZATION.md](./docs/SCHEMA-INITIALIZATION.md)** - Bootstrapping D1 schema + migrations
- **[docs/MISSING-FEATURES.md](./docs/MISSING-FEATURES.md)** - Backlog and open enhancement ideas

## License

MIT
### Using Forminator with your own frontend

You can deploy the Worker as a backend-only service and point any form at the `/api/submissions` endpoint. Set `DISABLE_STATIC_ASSETS=true` (or remove the `assets` binding) to disable the bundled Astro UI, configure `ALLOWED_ORIGINS` with your domains, and follow the [backend-only guide](docs/backend-only.md) for deployment + integration details. The Worker continues to expose:

- `POST /api/submissions` — Turnstile + fraud detection pipeline (returns `erfid`, 4xx errors with `retryAfter` metadata, etc.)
- `GET /api/config` — The effective fraud config for client-side widgets.
- `GET /api/analytics/*` — All analytics endpoints (require `X-API-KEY`).

This repo’s Astro form remains as a demo, but standalone deployments only need the Worker + Turnstile keys.

> Tip: grab the ready-made fetch helper in [`clients/forminator-client.ts`](clients/forminator-client.ts) so your own UI can submit and surface rate-limit errors without reimplementing the response parsing.
