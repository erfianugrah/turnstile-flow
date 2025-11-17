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
- **5-Layer Fraud Detection**: Pre-validation blacklist, email fraud (Markov-Mail), ephemeral ID, validation frequency, JA4 session hopping, IP diversity
- **Normalized Risk Scoring**: Mathematical 0-100 scale with weighted components (6 layers, weights total 100%)
- **Progressive Timeout System**: Auto-blacklist with escalating timeouts (1h → 24h)
- **Email Fraud Detection**: Worker-to-Worker RPC with Markov Chain analysis (83% accuracy, 0% false positives)
- **JA4 Session Hopping**: Detects incognito/browser switching attacks via TLS fingerprinting
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

### UI & Analytics
- **Dark Mode**: Full support with enhanced accent colors and shadows
- **Custom Phone Input**: International phone selector with 200+ countries, SVG flags, searchable dropdown
- **Real-time Analytics**: 14 API endpoints covering stats, submissions, validations, time-series, exports
- **Form Validation**: Client and server-side with Zod schemas
- **Visual Submission Flow**: 4-stage progress indicator with interactive callback integration
- **Risk Transparency**: Educational component explaining 6-layer fraud detection scoring system
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
  "address": "123 Main St",
  "dateOfBirth": "1990-01-01",
  "turnstileToken": "0.xxx..."
}
```

Processing flow:
1. Extract request metadata (40+ fields from request.cf)
2. Validate form data (Zod schema)
3. Sanitize inputs
4. Hash Turnstile token (SHA256)
5. Check token reuse (D1 lookup)
6. Pre-validation blacklist check (fraud_blacklist table)
7. Validate with Turnstile siteverify API
8. Fraud pattern detection (ephemeral ID or IP-based)
9. Create submission in D1
10. Log validation attempt
11. Return success/error

### Analytics (Protected with X-API-KEY header)

**GET /api/analytics/stats**
Validation statistics summary (total, success rate, avg risk score).

**GET /api/analytics/submissions**
Paginated submissions with filtering (country, bot score range, date range, search).

**GET /api/analytics/submissions/:id**
Single submission details.

**GET /api/analytics/validations/:id**
Single validation details with all 35+ fields.

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

**GET /api/analytics/time-series**
Trend data (6 metrics: submissions, validations, success_rate, bot_score_avg, risk_score_avg, allowed_rate; 4 intervals: hour, day, week, month).

**GET /api/analytics/fraud-patterns**
Detected fraud patterns with high-risk submissions.

**GET /api/analytics/export**
CSV or JSON export of submissions with all filters applied.

### Utilities

**GET /api/geo**
Detect user country from Cloudflare headers.

**GET /api/health**
Service health check.

## Database Schema

### submissions (42 fields)
- Form data: first_name, last_name, email, phone, address, date_of_birth
- Geographic: country, region, city, postal_code, timezone, latitude, longitude, continent, is_eu_country
- Network: asn, as_organization, colo, http_protocol, tls_version, tls_cipher
- Bot signals: bot_score, client_trust_score, verified_bot, detection_ids (JSON)
- Fingerprints: ja3_hash, ja4, ja4_signals (JSON)
- Metadata: remote_ip, user_agent, ephemeral_id, created_at

### turnstile_validations (35 fields)
- Validation: token_hash (unique), success, allowed, block_reason, challenge_ts, hostname, action, risk_score
- All request metadata fields (same as submissions)
- Foreign key: submission_id

### fraud_blacklist (9 fields)
Pre-validation fraud detection cache. Blocks detected fraudulent activity before expensive Turnstile API calls.

- Identifiers: ephemeral_id, ip_address (at least one required)
- Block metadata: block_reason, detection_confidence (high/medium/low)
- Timing: blocked_at, expires_at (automatic expiry based on risk score)
- Detection context: submission_count, last_seen_at, detection_metadata (JSON)

Auto-populated when risk score ≥70:
- 100 risk: 7-day block
- 80-99 risk: 3-day block
- 70-79 risk: 1-day block

### Indexes (11 total)
**Token replay prevention:**
- UNIQUE: token_hash

**Performance (submissions):**
- ephemeral_id, created_at, email, country, ja3_hash, ja4

**Performance (turnstile_validations):**
- ephemeral_id, created_at, country, bot_score, ja3_hash, ja4

**Blacklist lookups:**
- (ephemeral_id, expires_at), (ip_address, expires_at), expires_at

## Fraud Detection Algorithm

### 5-Layer Detection System

**Layer 0: Pre-validation Blacklist**
- Fast D1 lookup before Turnstile API call
- Significantly reduces API calls for repeat offenders
- Checks ephemeral_id, ip_address, ja4 against fraud_blacklist table

**Layer 1: Email Fraud Detection (Markov-Mail Integration)**
- Worker-to-Worker RPC service binding
- Markov Chain pattern analysis (83% accuracy, 0% false positives)
- Pattern classification: sequential, dated, formatted, gibberish
- Out-of-Distribution (OOD) detection for unusual formats
- Disposable domain detection (71K+ domains)
- TLD risk profiling (143 TLDs analyzed)
- Fail-open design: allows submissions if service unavailable

**Layer 2: Ephemeral ID Fraud Detection**
- Tracks same device across ~7 days without cookies
- 2+ submissions in 24h window: Block immediately
- Detects repeat registration attempts

**Layer 3: Validation Frequency Monitoring**
- 3+ validation attempts in 1h: Block immediately
- 2 validation attempts in 1h: High risk (allows one retry)
- Catches rapid-fire attacks before D1 replication lag

**Layer 4: JA4 Session Hopping Detection (3 sub-layers)**
- **4a: IP Clustering (1h)**: Same subnet + same JA4 + 2+ ephemeral IDs
- **4b: Rapid Global (5min)**: Same JA4 + 3+ ephemeral IDs globally
- **4c: Extended Global (1h)**: Same JA4 + 5+ ephemeral IDs globally
- Detects incognito mode/browser hopping attacks
- TLS fingerprint-based device tracking

**Layer 5: IP Diversity Detection**
- 2+ unique IPs for same ephemeral ID in 24h: Block immediately
- Detects proxy rotation and distributed botnets

### Normalized Risk Scoring
All components contribute to normalized 0-100 risk score (weights total exactly 100%):
- **Token Replay**: 35% (instant block, highest priority)
- **Ephemeral ID**: 18% (device tracking, core fraud signal)
- **Email Fraud**: 17% (Markov-Mail pattern detection)
- **Validation Frequency**: 13% (attempt rate monitoring)
- **IP Diversity**: 9% (proxy rotation detection)
- **JA4 Session Hopping**: 8% (browser hopping detection)

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
- **[docs/TURNSTILE-ENHANCEMENTS.md](./docs/TURNSTILE-ENHANCEMENTS.md)** - Optional enhancement opportunities

## License

MIT
