# Security

## Overview

Forminator implements multiple layers of security to protect against common web application vulnerabilities and bot attacks. This document outlines the security measures currently in place.

## Turnstile Integration

### Single-Step Validation Flow

The application uses atomic validation to prevent token replay attacks:

1. Client submits form data with Turnstile token in a single request
2. Server validates token with Cloudflare API (consumed once)
3. Server performs fraud detection
4. Server creates submission and logs validation atomically

**Critical**: Tokens are validated exactly once. The single-step flow eliminates the window for replay attacks that exists in multi-step flows.

### Token Replay Protection

- Tokens are hashed with SHA256 before storage
- Unique index on `token_hash` enforces one-time use
- Replay attempts are blocked and logged with maximum risk score

### Hostname Validation

Only requests from configured allowed hostnames are accepted. Hostname validation occurs during Turnstile token verification.

## Fraud Detection

### 5-Layer Detection System

**Layer 0 - Pre-Validation Blacklist** (~10ms):
- Fast D1 lookup before expensive Turnstile API call
- 85-90% reduction in API calls for repeat offenders
- Checks ephemeral_id, ip_address, ja4 against fraud_blacklist table

**Layer 1 - Email Fraud Detection** (0.1-0.5ms):
- Worker-to-Worker RPC call to Markov-Mail service
- Markov Chain pattern analysis (83% accuracy, 0% false positives)
- Detects sequential, dated, formatted email patterns
- Disposable domain detection (71K+ domains)
- Fail-open design (allows submission if service unavailable)

**Layer 2 - Ephemeral ID Fraud Detection** (24h window):
- Blocks 2+ submissions from same ephemeral ID
- Registration forms should only be submitted once per user

**Layer 3 - Validation Frequency Monitoring** (1h window):
- Blocks 3+ validation attempts from same ephemeral ID
- Catches rapid-fire attacks before database replication

**Layer 4 - JA4 Session Hopping Detection**:
- **4a**: IP Clustering (same subnet + same JA4 + 2+ ephemeral IDs in 1h)
- **4b**: Rapid Global (same JA4 + 3+ ephemeral IDs in 5 min)
- **4c**: Extended Global (same JA4 + 5+ ephemeral IDs in 1h)
- Detects incognito/browser switching attacks via TLS fingerprinting

**Layer 5 - IP Diversity Detection** (24h window):
- Blocks 2+ unique IPs for same ephemeral ID
- Detects proxy rotation and distributed attacks

### Normalized Risk Scoring

All detections contribute to a 0-100 risk score with weighted components:
- **Token Replay**: 35% (instant block)
- **Ephemeral ID**: 18%
- **Email Fraud**: 17%
- **Validation Frequency**: 13%
- **IP Diversity**: 9%
- **JA4 Session Hopping**: 8%

**Block Threshold**: Risk score ≥ 70

### Progressive Timeout System

Repeat offenders receive escalating timeout periods:

- 1st offense: 1 hour
- 2nd offense: 4 hours
- 3rd offense: 8 hours
- 4th offense: 12 hours
- 5th+ offense: 24 hours

### Graceful Degradation

**Ephemeral ID** (Enterprise feature, preferred):
- Tracks users across ~7 days without cookies
- More accurate fraud detection

**IP-based fallback** (when ephemeral ID unavailable):
- Higher thresholds to account for shared IPs
- Less accurate but still effective

## Input Validation

### Server-Side Validation

All inputs are validated using Zod schemas with:

- Type checking
- Length constraints
- Pattern matching (regex)
- Data transformation (trim, lowercase)
- Custom business logic validation

### Input Sanitization

HTML and potentially dangerous characters are stripped from user inputs before storage.

### SQL Injection Prevention

- All database queries use parameterized statements
- User inputs are never interpolated into SQL strings
- Analytics queries use whitelisted values for dynamic parameters

## Rate Limiting

### IP-based Rate Limiting

- Tracks validation attempts per IP address
- Configurable limits and time windows
- Returns 429 status with retry-after header when exceeded

### Fraud Blacklist Cache

- Pre-validation check against known fraudulent ephemeral IDs and IPs
- 10x faster than Turnstile API (~10ms vs ~150ms)
- Reduces API calls by 85-90%
- Automatic expiry based on progressive timeout

## CORS and CSRF Protection

### CORS Configuration

- Strict origin validation
- Only configured origins allowed
- Credentials support for authenticated requests
- Preflight caching for performance

### Origin Validation

Middleware validates both `Origin` and `Referer` headers against allowlist before processing requests.

## Security Headers

The following security headers are applied to all responses:

- `X-Content-Type-Options: nosniff` - Prevents MIME type sniffing
- `X-Frame-Options: DENY` - Prevents clickjacking
- `X-XSS-Protection: 1; mode=block` - Enables browser XSS protection
- `Referrer-Policy: strict-origin-when-cross-origin` - Controls referrer information
- `Permissions-Policy` - Restricts browser features (geolocation, camera, microphone)
- `Content-Security-Policy` - Defines trusted content sources

### Content Security Policy

```
default-src 'self';
script-src 'self' https://challenges.cloudflare.com;
frame-src https://challenges.cloudflare.com;
connect-src 'self' https://challenges.cloudflare.com;
style-src 'self' 'unsafe-inline';
img-src 'self' data: https:;
```

## Request Metadata Collection

### Bot Detection Signals

Over 40 fields captured from Cloudflare's `request.cf` object:

**Geographic**: country, region, city, postal code, timezone, coordinates
**Network**: ASN, AS organization, colo, HTTP protocol, TLS version/cipher
**Bot Signals**: bot score, client trust score, verified bot, detection IDs
**Fingerprints**: JA3 hash, JA4 string, JA4 signals

**Note**: Enterprise-only fields (bot_score, ja3_hash, ja4, detection_ids) require Cloudflare Bot Management.

## Authentication

### Analytics API

Analytics endpoints are protected with API key authentication:

- Require `X-API-Key` header
- Key validated against environment variable
- Returns 401 for missing or invalid keys

### Testing Bypass

**For CI/CD and local development only**

The testing bypass allows automated testing without Turnstile widgets while maintaining security:

**Security Requirements:**
- **Dual-factor authentication**: Requires BOTH environment flag AND valid API key
- **Environment flag**: `ALLOW_TESTING_BYPASS` must be explicitly set to `"true"`
- **API key header**: `X-API-KEY` must match configured secret
- **Production protection**: Flag MUST be `"false"` in production

**What is NOT Bypassed:**
- Email fraud detection (Markov-Mail RPC still runs)
- Ephemeral ID fraud detection (mock ID generated for testing)
- Validation frequency monitoring
- JA4 session hopping detection
- IP diversity detection
- All normalized risk scoring

**What IS Bypassed:**
- Turnstile site-verify API call only
- Mock ephemeral ID generated for fraud detection testing

**Security Implications:**
- No security reduction: All fraud detection layers still active
- Testing surface: Allows testing fraud detection without Turnstile dependency
- Fail-secure: Missing API key or wrong flag → normal Turnstile validation

**Example Configuration:**
```jsonc
// wrangler.jsonc (development)
"vars": {
  "ALLOW_TESTING_BYPASS": "true"  // Enable for dev/staging only
}

// wrangler.jsonc (production)
"vars": {
  "ALLOW_TESTING_BYPASS": "false"  // MUST be false
}
```

**Implementation** (`src/routes/submissions.ts:78-87`):
```typescript
const apiKey = c.req.header('X-API-KEY');

if (env.ALLOW_TESTING_BYPASS === 'true' && apiKey && apiKey === env['X-API-KEY']) {
  // Generate mock validation for testing
  validation = createMockValidation(sanitizedData.email, metadata);
} else {
  // Normal Turnstile validation path
  if (!data.turnstileToken) {
    return c.json({ error: 'Turnstile token required' }, 400);
  }
  validation = await validateTurnstileToken(/* ... */);
}
```

## Data Protection

### Token Storage

- Never store plaintext Turnstile tokens
- Only SHA256 hashes are stored
- Tokens never logged or exposed in responses

### Sensitive Data Handling

- Database uses proper column types and constraints
- Optional fields (phone, address, DOB) allow empty values
- Foreign key constraints maintain referential integrity

## Limitations

### D1 Eventual Consistency

D1 is eventually consistent. Fraud detection is pattern-based and tolerates this. For strict real-time guarantees, consider Durable Objects.

### Not Implemented

The following are intentionally not implemented:

- Email verification (out of scope for demo)
- Advanced bot mitigation beyond Turnstile + fraud detection
- Durable Objects for strict rate limiting (eventual consistency acceptable)

## Reporting Vulnerabilities

To report security vulnerabilities:

1. Do not create public GitHub issues
2. Email security concerns to the repository owner
3. Include detailed reproduction steps
4. Allow reasonable time for response

## Security Checklist

When deploying or modifying the application:

- [ ] Update allowed hostnames in environment configuration
- [ ] Set Turnstile secret key via `wrangler secret put TURNSTILE-SECRET-KEY`
- [ ] Set API key via `wrangler secret put X-API-KEY`
- [ ] **Set `ALLOW_TESTING_BYPASS="false"` in production**
- [ ] Configure CORS origins for production domains
- [ ] Configure custom routes in `ROUTES` environment variable
- [ ] Configure service binding to Markov-Mail worker
- [ ] Initialize D1 schema with proper indexes
- [ ] Test Turnstile widget on production domain
- [ ] Verify CSP headers allow Turnstile iframe
- [ ] Monitor logs for security events
- [ ] Review fraud detection thresholds (risk score ≥ 70)
- [ ] Test all 5 fraud detection layers
- [ ] Test rate limiting configuration
- [ ] Validate all endpoints require proper authentication
- [ ] Verify dynamic routing matches expected paths
- [ ] Test testing bypass is disabled in production

## References

- [FRAUD-DETECTION.md](./FRAUD-DETECTION.md) - Detailed fraud detection strategy
- [API-REFERENCE.md](./API-REFERENCE.md) - Complete API documentation
- [DATABASE-OPERATIONS.md](./DATABASE-OPERATIONS.md) - Database management guide
