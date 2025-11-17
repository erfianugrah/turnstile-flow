# Turnstile Implementation

## Overview

This document describes the Turnstile CAPTCHA implementation in the forminator application, including both frontend widget integration and backend server-side validation with fraud detection.

The implementation uses explicit rendering for programmatic control over the widget lifecycle, integrating with a 6-layer fraud detection system.

---

## Frontend Implementation

### TurnstileWidget.tsx

**Configuration** (`frontend/src/components/TurnstileWidget.tsx:92-136`)

```typescript
turnstile.render(container, {
  sitekey: TURNSTILE_SITEKEY,
  theme: 'auto',                    // Auto-sync with system preference
  size: 'flexible',                 // Responsive widget (300px-100%)
  appearance: 'execute',            // Show only when executed
  execution: 'execute',             // Manual trigger on submit
  retry: 'auto',                    // Auto-retry failed challenges
  'refresh-expired': 'auto',        // Auto-refresh expired tokens
  'response-field': false,          // Manual token handling via callback
  action: 'submit-form',            // Analytics tracking
  callback, error-callback, expired-callback, timeout-callback,
  'before-interactive-callback', 'after-interactive-callback', 'unsupported-callback',
  language: 'auto',
  tabindex: 0,
});
```

### Widget Behavior

1. **Manual Execution** (`execution: 'execute'`) - Widget only runs when `turnstile.execute()` is called on form submit
2. **Hidden Until Needed** (`appearance: 'execute'`) - Widget appears only when verification starts
3. **Automatic Recovery** (`retry: 'auto', 'refresh-expired': 'auto'`) - Handles transient errors and token expiration
4. **Manual Token Management** (`'response-field': false`) - Token passed via callback, not hidden input field

### Callbacks Implemented

- `callback` - Receives token, passes to parent component (`onValidated`)
- `error-callback` - Shows user-friendly error, logs to console
- `expired-callback` - Token expired (5min), shows "Verification expired" message
- `timeout-callback` - Interactive challenge timed out
- `before-interactive-callback` - User entered interactive mode (updates UI)
- `after-interactive-callback` - User left interactive mode (updates UI)
- `unsupported-callback` - Browser doesn't support Turnstile

### Exposed Methods

The widget component exposes these methods (`TurnstileWidgetHandle:54-57`):
- `execute()` - Start verification challenge
- `reset()` - Reset widget to initial state

---

## Backend Implementation

### Server-Side Validation Flow

The backend implements a 6-layer fraud detection system integrated with Turnstile validation (`src/routes/submissions.ts`):

**Layer 0: Pre-Validation Blacklist** (lines 100-140)
```typescript
const blacklist = await checkPreValidationBlock(ephemeralId, remoteIp, db);
if (blacklist.blocked) return 403; // Previously flagged as fraudulent
```

Fast D1 lookup before expensive Turnstile API call. Blocks repeat offenders on `ephemeral_id`, `ip_address`, or `ja4` identifiers.

**Token Replay Detection** (lines 58-87)
```typescript
const tokenHash = hashToken(turnstileToken);
const isReused = await checkTokenReuse(tokenHash, db);
if (isReused) return 400; // Token replay attack
```

SHA256 hash check before calling Turnstile API to prevent token reuse. Blocks replay attempts early while providing a fraud signal.

**Layer 1: Email Fraud Detection**
```typescript
const emailResult = await detectEmailFraud(email, env.FRAUD_DETECTOR);
if (emailResult.decision === 'block') return 400; // Fraudulent email pattern
```

Worker-to-Worker RPC call to markov-mail service (0.1-0.5ms). Detects sequential patterns, disposable domains, and unusual formats using Markov Chain analysis.

**Layer 1.5: Turnstile Validation** (lines 89-94)
```typescript
const validation = await validateTurnstileToken(token, remoteIp, secretKey);
// Extracts ephemeral ID even on failed validations for fraud tracking
```

Validates token with Cloudflare siteverify API and extracts ephemeral ID from response metadata.

**Layer 2: Ephemeral ID Fraud Detection** (lines 142-178)

Three sub-layers analyzing behavioral patterns:

- **Layer 2a: Submission Count (24h)** - 2+ submissions from same device → Block
- **Layer 2b: Validation Frequency (1h)** - 3+ validation attempts → Block (catches rapid-fire before D1 replication)
- **Layer 2c: IP Diversity (24h)** - 2+ unique IPs for same device → Block (proxy rotation detection)

```typescript
const fraudCheck = await checkEphemeralIdFraud(ephemeralId, db);
if (!fraudCheck.allowed) return 429; // High risk detected
```

**Layer 4: JA4 Session Hopping Detection**

Three sub-layers detecting browser/incognito hopping:

- **Layer 4a: IP Clustering (1h)** - Same subnet + same JA4 + 2+ ephemeral IDs → Block
- **Layer 4b: Rapid Global (5min)** - Same JA4 + 3+ ephemeral IDs globally → Block
- **Layer 4c: Extended Global (1h)** - Same JA4 + 5+ ephemeral IDs globally → Block

Detects attacks where users clear cookies or open incognito mode to bypass ephemeral ID tracking (JA4 fingerprint remains constant).

**Validation Result Check** (lines 185-208)

After fraud detection runs, check if Turnstile validation was successful:

```typescript
if (!validation.valid) {
  // Enhanced error responses with user-friendly messages
  return 400; // Validation failed with error code dictionary
}
```

**Duplicate Email Check** (lines 212-242)
```typescript
const existing = await db.query('SELECT id FROM submissions WHERE email = ?');
if (existing) return 409; // Duplicate email conflict
```

### Error Handling

**Error Dictionary** (`src/lib/turnstile-errors.ts`)

Maps 30+ error codes from Cloudflare documentation to user-friendly messages:
- User-friendly messages (shown to users)
- Debug messages (logged for developers)
- Action recommendations (retry/reload/contact_support/check_config)
- Pattern matching: `102001` → `102xxx`, `110601` → `11060x`

**Error Response Format** (`src/routes/submissions.ts:199-207`):
```json
{
  "error": "Verification failed",
  "message": "Verification expired. Please complete the verification again.",
  "errorCode": "106010",
  "debug": {
    "codes": ["106010"],
    "messages": ["Challenge timeout"],
    "actions": ["retry"],
    "categories": ["client"]
  }
}
```

### Token Lifecycle

1. User submits form → `turnstile.execute()` called
2. Turnstile runs challenge (usually silently, sometimes interactive)
3. `callback(token)` receives token (valid for 300 seconds)
4. Token sent to `/api/submissions` with form data
5. Server validation:
   - Hash token → Check reuse (Layer 0)
   - Validate with Cloudflare → Extract ephemeral ID (Layer 1.5)
   - Check blacklist + fraud patterns (Layers 0, 2, 4)
   - Check validation result
   - Check duplicate email
   - Create submission
6. All validations logged to D1 with metadata and risk scores

---

## Request Flow

### User Journey

```
1. User lands on form page
   ↓
2. Astro page loads (static HTML)
   ↓
3. Turnstile script loads in background
   ↓
4. User fills form fields
   ↓
5. User clicks submit
   ↓
6. Client-side validation (Zod)
   ↓ (if valid)
7. Call turnstile.execute()
   ↓
8. Widget appears (if needed) OR silently completes
   ↓
9. Token generated via callback
   ↓
10. POST to /api/submissions
   ↓ (if valid)
11. Success message + store in D1
```

### Code Architecture

```
frontend/src/components/
├── SubmissionForm.tsx        # Main form with validation
├── TurnstileWidget.tsx        # Turnstile widget component
└── AnalyticsDashboard.tsx     # Analytics UI

src/
├── index.ts                   # Hono app with routing
├── routes/
│   └── submissions.ts         # Form submission + validation
└── lib/
    ├── turnstile.ts           # Token validation, fraud detection
    ├── turnstile-errors.ts    # Error code dictionary
    ├── email-fraud-detection.ts  # Layer 1 (Markov-Mail RPC)
    ├── fraud-prevalidation.ts    # Layer 0 (blacklist check)
    ├── ja4-fraud-detection.ts    # Layer 4 (session hopping)
    ├── database.ts            # D1 operations
    └── validation.ts          # Zod schemas, input sanitization
```

---

## Widget Lifecycle Management

### API Methods

**`render(container, config)`**
- Initial widget creation on component mount
- Returns widgetId for future operations

**`execute(widgetId)`**
- Trigger challenge manually
- Used with `execution: 'execute'` config
- Called when user submits form after validation passes

**`reset(widgetId)`**
- Clear widget and re-run challenge
- Used after form submission (success or error)
- Used when token expires or theme changes

**`remove(widgetId)`**
- Destroy widget completely
- Called on component unmount

**`getResponse(widgetId)`**
- Retrieve current token
- Check if token exists before submission

**`isExpired(widgetId)`**
- Check token validity
- Used to decide whether to reset widget

---

## Security Implementation

### Token Security

1. **SHA256 Hashing** - Tokens hashed before storage (never store plaintext)
2. **Unique Index** - `token_hash` column has unique constraint enforcing one-time use
3. **Replay Detection** - Replay attempts logged with risk_score=100 for forensics
4. **Ephemeral ID Tracking** - 7-day device tracking without cookies (Enterprise feature)
5. **IP Fallback** - Falls back to IP-based detection if ephemeral ID unavailable

### Server-Side Validation

All token validation happens server-side:

```typescript
const validation = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    secret: env['TURNSTILE-SECRET-KEY'],
    response: token,
    remoteip: request.headers.get('CF-Connecting-IP')
  })
});
```

Verification checks:
- `success` is true
- `hostname` matches expected domain
- `action` matches if specified
- `challenge_ts` is recent (< 5 min)

### Content Security Policy

CSP headers configured in worker (`src/index.ts`):

```
script-src 'self' https://challenges.cloudflare.com
frame-src https://challenges.cloudflare.com
connect-src 'self' https://challenges.cloudflare.com
```

---

## Configuration

### Frontend Environment Variables

Create `frontend/.env`:
```
PUBLIC_TURNSTILE_SITEKEY=0x4AAAAAACAjw0bmUZ7V7fh2
```

### Backend Secrets

Set via `wrangler secret put`:
```bash
wrangler secret put TURNSTILE-SECRET-KEY
wrangler secret put X-API-KEY
```

Or via `.dev.vars` for local development:
```
TURNSTILE-SECRET-KEY=your_secret_key
X-API-KEY=your_api_key
```

### Testing Bypass

For local testing and CI/CD, bypass Turnstile while still running fraud detection:

**Requirements:**
- `ALLOW_TESTING_BYPASS=true` in environment
- Valid `X-API-KEY` header in request

**Example:**
```bash
curl -X POST http://localhost:8787/api/submissions \
  -H "Content-Type: application/json" \
  -H "X-API-KEY: your_test_api_key" \
  -d '{
    "firstName": "Test",
    "lastName": "User",
    "email": "test@example.com"
  }'
```

Only Turnstile site-verify API call is skipped. All fraud detection layers still run.

---

## Testing

### Test Environment

Cloudflare provides test sitekeys:

| Sitekey | Behavior | Secret Key |
|---------|----------|------------|
| `1x00000000000000000000AA` | Always passes (visible) | `1x0000000000000000000000000000000AA` |
| `2x00000000000000000000AB` | Always blocks (visible) | `2x0000000000000000000000000000000AA` |
| `3x00000000000000000000FF` | Forces interactive challenge | `3x0000000000000000000000000000000AA` |

### Test Coverage

Playwright tests cover (`tests/` directory):
- Form validation and submission flow
- Ephemeral ID fraud detection patterns
- High-volume submission stress tests
- Error handling scenarios

Run tests with:
```bash
npm test                  # All tests
npm run test:basic        # Basic flow
npm run test:fraud        # Fraud detection
npm run test:headed       # With browser visible
```

Tests require worker running: `wrangler dev --remote`

---

## Database Schema

### turnstile_validations Table

```sql
CREATE TABLE turnstile_validations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash TEXT NOT NULL,
  success BOOLEAN NOT NULL,
  allowed BOOLEAN NOT NULL,
  block_reason TEXT,
  ephemeral_id TEXT,
  risk_score INTEGER DEFAULT 0,
  risk_score_breakdown TEXT,
  detection_type TEXT,
  remote_ip TEXT,
  country TEXT,
  ja3_hash TEXT,
  ja4 TEXT,
  bot_score INTEGER,
  -- ... 40+ metadata fields
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (submission_id) REFERENCES submissions(id)
);

CREATE UNIQUE INDEX idx_token_hash ON turnstile_validations(token_hash);
```

The unique index on `token_hash` enforces one-time token use at the database level.

### fraud_blacklist Table

```sql
CREATE TABLE fraud_blacklist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ephemeral_id TEXT,
  ip_address TEXT,
  ja4 TEXT,
  block_reason TEXT NOT NULL,
  detection_confidence TEXT CHECK(detection_confidence IN ('high','medium','low')),
  blocked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  submission_count INTEGER DEFAULT 0,
  last_seen_at DATETIME,
  detection_metadata TEXT,
  detection_type TEXT,
  CHECK((ephemeral_id IS NOT NULL) OR (ip_address IS NOT NULL) OR (ja4 IS NOT NULL))
);

CREATE INDEX idx_blacklist_ephemeral_id ON fraud_blacklist(ephemeral_id, expires_at);
CREATE INDEX idx_blacklist_ip ON fraud_blacklist(ip_address, expires_at);
CREATE INDEX idx_blacklist_ja4 ON fraud_blacklist(ja4, expires_at);
```

Supports lookup by any combination of ephemeral_id, ip_address, or ja4 fingerprint. Entries automatically expire based on progressive timeout system.

---

## Performance

### Latency Characteristics

```
Pre-validation blacklist hit:  Fast (most repeat attempts)
Token replay check:            D1 lookup
Email fraud RPC:               Worker-to-Worker
Turnstile API call:            External service (slowest)
Ephemeral ID fraud check:      D1 aggregations
JA4 fraud check:               D1 aggregation
```

### Performance Optimization

Pre-validation blacklist:
- Blocks most repeat attempts without calling Turnstile API
- Turnstile API only called for new/unknown requests
- Progressive timeouts make attacks impractical

---

## References

- Implementation: `frontend/src/components/TurnstileWidget.tsx`
- Backend validation: `src/lib/turnstile.ts`, `src/routes/submissions.ts`
- Fraud detection: `src/lib/fraud-prevalidation.ts`, `src/lib/ja4-fraud-detection.ts`
- Error handling: `src/lib/turnstile-errors.ts`
- Database schema: `schema.sql`
- Related docs: `FRAUD-DETECTION.md`, `API-REFERENCE.md`, `CONFIGURATION-SYSTEM.md`
