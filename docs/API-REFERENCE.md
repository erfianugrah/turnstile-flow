# API Reference - Complete Documentation

This document provides exhaustive details on every API endpoint, including request/response formats, error handling, and implementation details.

## Table of Contents
- [Base URL](#base-url)
- [Authentication](#authentication)
- [Rate Limiting](#rate-limiting)
- [Error Responses](#error-responses)
- [Endpoints](#endpoints)
  - [POST /api/submissions](#post-apisubmissions)
  - [GET /api/geo](#get-apigeo)
  - [GET /api/analytics/stats](#get-apianalyticsstats)
  - [GET /api/analytics/submissions](#get-apianalyticssubmissions)
  - [GET /api/analytics/validations/:id](#get-apianalyticsvalidationsid)
  - [GET /api/analytics/validations/by-erfid/:erfid](#get-apianalyticsvalidationsby-erfiderfid)
  - [GET /api/analytics/countries](#get-apianalyticscountries)
  - [GET /api/analytics/bot-scores](#get-apianalyticsbot-scores)
  - [GET /api/analytics/asn](#get-apianalyticsasn)
  - [GET /api/analytics/tls](#get-apianalyticstls)
  - [GET /api/analytics/ja3](#get-apianalyticsja3)
  - [GET /api/analytics/ja4](#get-apianalyticsja4)
  - [GET /api/analytics/email-patterns](#get-apianalyticsemail-patterns)
  - [GET /api/analytics/submissions/:id](#get-apianalyticssubmissionsid)
  - [GET /api/analytics/time-series](#get-apianalyticstime-series)
  - [GET /api/analytics/export](#get-apianalyticsexport)
  - [GET /api/analytics/fraud-patterns](#get-apianalyticsfraud-patterns)
  - [GET /api/analytics/blocked-stats](#get-apianalyticsblocked-stats)
  - [GET /api/analytics/block-reasons](#get-apianalyticsblock-reasons)
  - [GET /api/analytics/blacklist](#get-apianalyticsblacklist)
  - [GET /api/analytics/blacklist-stats](#get-apianalyticsblacklist-stats)
  - [GET /api/analytics/blocked-validations](#get-apianalyticsblocked-validations)
  - [GET /api/health](#get-apihealth)
  - [GET /api/config](#get-apiconfig)

## Base URL

**Production:** `https://form.erfi.dev`

**Development:** `http://localhost:8787` (with `wrangler dev`)

## Authentication

**Public endpoints:**
- POST /api/submissions
- GET /api/geo
- GET /api/health
- GET /api/config

**Protected endpoints (require X-API-KEY header):**
- GET /api/analytics/* (all analytics endpoints)

**Implementation:**
```typescript
// src/routes/analytics.ts
const apiKey = c.req.header('X-API-KEY');
const expectedKey = c.env['X-API-KEY'];

if (!expectedKey) {
  console.warn('X-API-KEY not configured - analytics temporarily unprotected');
} else if (!apiKey || apiKey !== expectedKey) {
  return c.json({ error: 'Unauthorized' }, 401);
}
```

## Rate Limiting

Pattern-based fraud detection (see FRAUD-DETECTION.md). Turnstile provides bot protection. D1 supports ~50 writes/sec per database.

## Error Responses

### Standard Error Format

```json
{
  "error": "ValidationError",
  "message": "Human-readable error message",
  "details": {
    "errors": {
      "field": ["error 1", "error 2"]
    }
  },
  "erfid": "erf_123..."
}
```

### HTTP Status Codes

| Code | Meaning | When Used |
|------|---------|-----------|
| 200 | OK | Successful request |
| 400 | Bad Request | Validation failed, invalid input |
| 403 | Forbidden | Fraud detected, submission blocked |
| 404 | Not Found | Endpoint doesn't exist |
| 429 | Too Many Requests | Rate limit exceeded (not implemented) |
| 500 | Internal Server Error | Unexpected error, database failure |

### Error Examples

**Validation error (400):**
```json
{
  "error": "ValidationError",
  "message": "Please check your form data and try again",
  "details": {
    "errors": {
      "firstName": ["First name is required"],
      "email": ["Invalid email address"],
      "phone": ["Phone must contain 7-15 digits"]
    }
  },
  "erfid": "erf_c81c7b0b-9443-4ea0-9a4c-ae7b4a470d8b"
}
```

**Turnstile verification failed (400):**
```json
{
  "error": "ExternalServiceError",
  "message": "A required service is temporarily unavailable. Please try again in a moment",
  "details": {
    "service": "Turnstile",
    "errors": ["timeout-or-duplicate"]
  },
  "erfid": "erf_c81c7b0b-9443-4ea0-9a4c-ae7b4a470d8b"
}
```

**Fraud detected (403):**
```json
{
  "error": "Too many requests",
  "message": "Suspicious browser activity detected. Please wait 1 hour before trying again.",
  "retryAfter": 3600,
  "expiresAt": "2025-11-25T10:00:00.000Z",
  "erfid": "erf_c81c7b0b-9443-4ea0-9a4c-ae7b4a470d8b"
}
```

**Server error (500):**
```json
{
  "error": "Internal server error",
  "message": "An unexpected error occurred. Please try again",
  "erfid": "erf_c81c7b0b-9443-4ea0-9a4c-ae7b4a470d8b"
}
```

### Request Tracing

- Every response includes an `erfid` for end-to-end tracing and mirrors the same value via the `X-Request-Id` header.
- Analytics endpoints such as `/api/analytics/validations/by-erfid/:erfid` accept this identifier to fetch the exact validation record.
- Rate-limit errors also emit a `Retry-After` HTTP header plus `retryAfter` + `expiresAt` fields in the JSON body.

## Endpoints

---

### POST /api/submissions

Submit form data with Turnstile verification.

**Location:** `/src/routes/submissions.ts`

#### Request

**Headers:**
```
Content-Type: application/json
```

**Body:**
```json
{
  "firstName": "John",
  "lastName": "Doe",
  "email": "john.doe@example.com",
  "phone": "+15551234567",
  "address": {
    "street": "123 Main St",
    "city": "San Francisco",
    "state": "CA",
    "postalCode": "94102",
    "country": "US"
  },
  "dateOfBirth": "1990-01-01",
  "turnstileToken": "0.AbCdEfGhIjKlMnOpQrStUvWxYz..."
}
```

**Field requirements:**

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| firstName | string | Yes | 1-50 chars, letters/spaces/hyphens/apostrophes only |
| lastName | string | Yes | 1-50 chars, letters/spaces/hyphens/apostrophes only |
| email | string | Yes | Valid email, max 100 chars |
| phone | string | No | Normalized to E.164 (+countrycodeXXXXXXXX) if provided |
| address | object | No | Fields: street, street2, city, state, postalCode, country. `country` is required when any other field is provided |
| dateOfBirth | string | No | Optional, but must be `YYYY-MM-DD` and age 18-120 when supplied |
| turnstileToken | string | Yes (see note) | Non-empty Turnstile token. Optional only when `ALLOW_TESTING_BYPASS=true` **and** a valid `X-API-KEY` header is sent |

#### Response

**Success (201):**
```json
{
  "success": true,
  "submissionId": 12345,
  "erfid": "erf_5f6824bf-7d43-4ab5-b0ce-ef9a2b7db7c8",
  "message": "Form submitted successfully"
}
```

**Headers:**
- `X-Request-Id`: mirrors the `erfid` in the JSON body for downstream logging

**Validation error (400):**
```json
{
  "error": "ValidationError",
  "message": "Please check your form data and try again",
  "details": {
    "errors": {
      "email": ["Invalid email address"]
    }
  },
  "erfid": "erf_5f6824bf-7d43-4ab5-b0ce-ef9a2b7db7c8"
}
```

**Turnstile failed (400):**
```json
{
  "error": "ExternalServiceError",
  "message": "Please complete the verification challenge",
  "details": {
    "service": "Turnstile",
    "errors": ["invalid-input-response"]
  },
  "erfid": "erf_5f6824bf-7d43-4ab5-b0ce-ef9a2b7db7c8"
}
```

**Fraud detected (403):**
```json
{
  "error": "Too many requests",
  "message": "Suspicious browser activity detected. Please wait 1 hour before trying again.",
  "retryAfter": 3600,
  "expiresAt": "2025-11-25T10:00:00.000Z",
  "erfid": "erf_5f6824bf-7d43-4ab5-b0ce-ef9a2b7db7c8"
}
```

**Server error (500):**
```json
{
  "error": "Internal server error",
  "message": "An unexpected error occurred. Please try again",
  "erfid": "erf_5f6824bf-7d43-4ab5-b0ce-ef9a2b7db7c8"
}
```

#### Testing Bypass

**For development and CI/CD testing only**

When `ALLOW_TESTING_BYPASS=true` in environment, you can bypass Turnstile validation using API key authentication:

**Headers:**
```
Content-Type: application/json
X-API-KEY: your_api_key_here
```

**Body:**
```json
{
  "firstName": "Test",
  "lastName": "User",
  "email": "test@example.com"
  // turnstileToken optional when bypass enabled
}
```

**Behavior:**
- Turnstile site-verify API call is skipped
- Mock ephemeral ID is generated for testing
- **All fraud detection layers still run** (email fraud, JA4, IP diversity, etc.)
- Only the Turnstile validation step is bypassed

**Security:**
- Requires both `ALLOW_TESTING_BYPASS=true` AND valid `X-API-KEY` header
- **Must be disabled in production** (set `ALLOW_TESTING_BYPASS=false`)
- No security bypass - fraud detection still active

**Use Cases:**
- Automated testing (Playwright, Cypress, etc.)
- CI/CD pipelines
- Local development without Turnstile widget
- API testing with curl/Postman

**Example curl test:**
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

#### Processing Flow

```
1. Generate erfid → Set `X-Request-Id` header up-front for tracing
2. Parse & validate → Zod schema (supports optional phone/address/DOB)
3. Sanitize → Lowercase email, normalize phone/address, persist raw payload + extracted KV fields
4. Determine bypass → Requires `ALLOW_TESTING_BYPASS=true` + valid `X-API-KEY`, otherwise Turnstile token is mandatory
5. Hash token → SHA256 + replay check in D1 (`turnstile_validations.token_hash`)
6. Layer 0 → Pre-validation blacklist (email, ephemeral_id, ja4, ip) with progressive timeout cache
7. Turnstile verify → Siteverify call (or mock validation in bypass mode) + ephemeral ID extraction
8. Collect signals → Email RPC (Markov-Mail), ephemeral ID telemetry (submissions/validations/IP diversity), JA4 session hopping, IP rate-limit behavioral score
9. Duplicate email guard → First duplicate returns 409, repeated attempts escalate to blacklist + progressive timeout
10. Normalize risk → 10-component scoring + block trigger detection (token replay, behavioral, and fingerprint layers)
11. Block path → Add to `fraud_blacklist` + `fraud_blocks`, log validation (`allowed=false`), throw `RateLimitError` (429 with Retry-After)
12. Allow path → Create submission row with risk breakdown + email fraud signals + raw form payload
13. Log validation → Always write `turnstile_validations` row with detection_type, risk breakdown, `erfid`
14. Respond → `201 Created` with `{ success, submissionId, erfid }` + `X-Request-Id`
```

**What "Generate mock ephemeral ID" means:**
- The bypass creates a fake validation response (mimics what Turnstile would return)
- Includes a mock ephemeral ID like `test_bypass_<timestamp>_<email_hash>`
- This mock ID is used for fraud detection testing (not skipped!)
- All fraud detection layers (email, JA4, IP diversity) still run normally
- Only the Turnstile API call (steps 5-7) is skipped

**Timing:** ~200-500ms total

**Database writes:**
- 1 row in `submissions` table
- 1 row in `turnstile_validations` table
- Atomic transaction (both succeed or both fail)

#### cURL Example

```bash
curl -X POST https://form.erfi.dev/api/submissions \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "John",
    "lastName": "Doe",
    "email": "john.doe@example.com",
    "phone": "+15551234567",
    "address": {
      "street": "123 Main St",
      "city": "San Francisco",
      "state": "CA",
      "postalCode": "94102",
      "country": "US"
    },
    "dateOfBirth": "1990-01-01",
    "turnstileToken": "0.test_token"
  }'
```

#### JavaScript Example

```javascript
const response = await fetch('https://form.erfi.dev/api/submissions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    firstName: 'John',
    lastName: 'Doe',
    email: 'john.doe@example.com',
    phone: '+15551234567',
    address: {
      street: '123 Main St',
      city: 'San Francisco',
      state: 'CA',
      postalCode: '94102',
      country: 'US',
    },
    dateOfBirth: '1990-01-01',
    turnstileToken: token,
  }),
});

const data = await response.json();

if (data.success) {
  console.log('Submission successful:', data.submissionId, data.erfid);
  console.log('Trace via X-Request-Id header:', response.headers.get('X-Request-Id'));
} else {
  console.error('Submission failed:', data.message, data.erfid);
}
```

---

### GET /api/geo

Get user's country code based on IP geolocation.

**Location:** `/src/routes/geo.ts`

#### Request

**Headers:** `X-API-KEY: your_api_key_here`

**Query parameters:** None

**Body:** None

#### Response

**Success (200):**
```json
{
  "success": true,
  "countryCode": "nl"
}
```

**Field details:**

| Field | Type | Description |
|-------|------|-------------|
| success | boolean | Always true |
| countryCode | string | ISO 3166-1 alpha-2 country code (lowercase) |

**Country codes:** See [ISO 3166-1 alpha-2](https://en.wikipedia.org/wiki/ISO_3166-1_alpha-2)

**Examples:**
- `us` - United States
- `gb` - United Kingdom
- `nl` - Netherlands
- `au` - Australia
- `jp` - Japan

#### How It Works

1. Cloudflare adds `CF-IPCountry` header to request
2. Worker reads header value
3. Converts to lowercase (library expects lowercase)
4. Returns JSON response

**Timing:** ~1-2ms (just reading header)

#### cURL Example

```bash
curl https://form.erfi.dev/api/geo

# Response:
# {"success":true,"countryCode":"nl"}
```

#### JavaScript Example

```javascript
const response = await fetch('/api/geo');
const data = await response.json();

console.log('User country:', data.countryCode);
// User country: nl
```

#### Usage

**Phone input initialization:**
```typescript
useEffect(() => {
  fetch('/api/geo')
    .then(r => r.json())
    .then(data => setDefaultCountry(data.countryCode));
}, []);
```

**Content localization:**
```typescript
const { countryCode } = await fetch('/api/geo').then(r => r.json());
const language = getLanguageForCountry(countryCode);
```

---

### GET /api/analytics/stats

> **Authentication**  
> Include `X-API-KEY: <value>` in every `/api/analytics/*` request (Wrangler `vars.X-API-KEY`).

Get overall submission and validation statistics.

**Location:** `/src/routes/analytics.ts`

#### Request

**Headers:** `X-API-KEY: your_api_key_here`

**Query parameters:** None

**Body:** None

#### Response

**Success (200):**
```json
{
  "success": true,
  "data": {
    "total": 150,
    "successful": 145,
    "allowed": 140,
    "avg_risk_score": 12.5,
    "unique_ephemeral_ids": 98,
    "ja4_fraud_blocks": 12,
    "active_blacklist": 23,
    "email_fraud": {
      "total_with_email_check": 150,
      "markov_detected": 18,
      "ood_detected": 4,
      "avg_email_risk_score": 42.3
    }
  }
}
```

**Field details:**

| Field | Type | Description |
|-------|------|-------------|
| total | number | Total validation attempts recorded |
| successful | number | Turnstile validations that returned `success=true` |
| allowed | number | Attempts that passed fraud detection |
| avg_risk_score | number \| null | Average normalized risk score (0-100) |
| unique_ephemeral_ids | number | Unique Turnstile ephemeral IDs (Enterprise only) |
| ja4_fraud_blocks | number | Blocks triggered by JA4 session hopping |
| active_blacklist | number | Currently active entries in `fraud_blacklist` |
| email_fraud.* | object | Aggregated metrics from Markov-Mail (counts + averages) |

**Calculations:**

```sql
-- Total submissions
COUNT(*) FROM submissions

-- Successful validations
COUNT(*) FROM turnstile_validations WHERE success = 1

-- Allowed submissions
COUNT(*) FROM turnstile_validations WHERE allowed = 1

-- Average risk score
AVG(risk_score) FROM turnstile_validations WHERE risk_score IS NOT NULL

-- Unique ephemeral IDs
COUNT(DISTINCT ephemeral_id) FROM submissions WHERE ephemeral_id IS NOT NULL

-- JA4 fraud blocks
SUM(CASE WHEN allowed = 0 AND block_reason LIKE '%JA4%' THEN 1 ELSE 0 END)

-- Active blacklist entries
SELECT COUNT(*) FROM fraud_blacklist WHERE expires_at > datetime('now')

-- Email fraud aggregate
SELECT
  COUNT(*) as total_with_email_check,
  SUM(CASE WHEN email_markov_detected = 1 THEN 1 ELSE 0 END) as markov_detected,
  SUM(CASE WHEN email_ood_detected = 1 THEN 1 ELSE 0 END) as ood_detected,
  AVG(email_risk_score) as avg_email_risk_score
FROM submissions
WHERE email_risk_score IS NOT NULL
```

#### cURL Example

```bash
curl https://form.erfi.dev/api/analytics/stats \
  -H "X-API-KEY: $X_API_KEY"

# Response:
# {"success":true,"data":{"total":150,"successful":145,...}}
```

#### JavaScript Example

```javascript
const response = await fetch('/api/analytics/stats', {
  headers: { 'X-API-KEY': process.env.ANALYTICS_KEY! },
});
const { data } = await response.json();

console.log(`Total: ${data.total}`);
console.log(`Success rate: ${(data.successful / data.total * 100).toFixed(1)}%`);
console.log(`Fraud rate: ${((data.total - data.allowed) / data.total * 100).toFixed(1)}%`);
```

---

### GET /api/analytics/submissions

Get recent submissions with pagination.

**Location:** `/src/routes/analytics.ts`

#### Request

**Headers:** `X-API-KEY: your_api_key_here`

**Query parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| limit | number | 50 | Number of submissions to return (max 100) |
| offset | number | 0 | Number of submissions to skip |
| sortBy | string | `created_at` | `created_at`, `bot_score`, `email`, `country`, `first_name`, `last_name`, `risk_score` |
| sortOrder | string | `desc` | `asc` or `desc` |
| countries | string | — | Comma-separated list (e.g. `US,GB,CA`) |
| botScoreMin | number | — | Minimum bot score (0-100) |
| botScoreMax | number | — | Maximum bot score (0-100) |
| startDate | string | — | ISO datetime filter (inclusive) |
| endDate | string | — | ISO datetime filter (inclusive) |
| verifiedBot | boolean | — | `true` or `false` |
| hasJa3 | boolean | — | `true` (only) or `false` (missing JA3) |
| hasJa4 | boolean | — | `true` (only) or `false` (missing JA4) |
| search | string | — | Fuzzy search across email, first_name, last_name, remote_ip |

**Examples:**
- `/api/analytics/submissions` - First 50
- `/api/analytics/submissions?limit=10` - First 10
- `/api/analytics/submissions?limit=20&offset=20` - Page 2 (items 21-40)

#### Response

**Success (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": 123,
      "first_name": "John",
      "last_name": "Doe",
      "email": "john.doe@example.com",
      "phone": "+15551234567",
      "country": "US",
      "city": "San Francisco",
      "remote_ip": "203.0.113.42",
      "bot_score": 12,
      "verified_bot": 0,
      "created_at": "2024-11-12T20:30:00Z",
      "tls_version": "TLSv1.3",
      "asn": 13335,
      "ja3_hash": "d4f7c2f0f7200fb71b021c1ac7d0263b",
      "ja4": "t13d1515h_none_none",
      "erfid": "erf_5f6824bf-7d43-4ab5-b0ce-ef9a2b7db7c8",
      "ephemeral_id": "AAABBBCCC",
      "risk_score": 18.6,
      "risk_score_breakdown": {
        "tokenReplay": 0,
        "emailFraud": 22,
        "ephemeralId": 10,
        "validationFrequency": 5,
        "ipDiversity": 0,
        "ja4SessionHopping": 0,
        "ipRateLimit": 0,
        "total": 18.6
      },
      "validation_erfid": "erf_5f6824bf-7d43-4ab5-b0ce-ef9a2b7db7c8"
    }
  ],
  "pagination": {
    "limit": 20,
    "offset": 0,
    "count": 20,
    "total": 120
  },
  "filters": {
    "countries": ["US", "CA"],
    "botScoreMax": 50
  }
}
```

**Fields returned:**

| Field | Type | Description |
|-------|------|-------------|
| id | number | Submission ID |
| first_name / last_name | string | Provided form values |
| email | string | Normalized lowercase email |
| phone | string \| null | Normalized E.164 phone (if provided) |
| country / city | string \| null | Geo data from Cloudflare |
| remote_ip | string | Connecting IP |
| bot_score | number \| null | Cloudflare Bot Management score |
| verified_bot | number | 1 = verified bot, 0 = unknown |
| created_at | string | ISO 8601 timestamp |
| tls_version | string \| null | TLS version reported by Cloudflare |
| asn | number \| null | Autonomous System Number |
| ja3_hash / ja4 | string \| null | TLS fingerprints |
| risk_score | number \| null | Normalized score from latest validation |
| risk_score_breakdown | object \| null | Component-level contributions |
| erfid | string \| null | Request-level tracing identifier |
| validation_erfid | string \| null | Validation record `erfid` (matches request for allowed submissions) |
| pagination | object | Echoes limit/offset/count/total |
| filters | object | Echoes applied filters for client-side display |

**Ordering:** Most recent first (ORDER BY created_at DESC)

#### cURL Example

```bash
# Get first 10 submissions
curl 'https://form.erfi.dev/api/analytics/submissions?limit=10' \
  -H "X-API-KEY: $X_API_KEY"

# Get page 2
curl 'https://form.erfi.dev/api/analytics/submissions?limit=10&offset=10' \
  -H "X-API-KEY: $X_API_KEY"
```

#### JavaScript Example

```javascript
// Load initial page
const response = await fetch('/api/analytics/submissions?limit=20&countries=US,CA', {
  headers: { 'X-API-KEY': process.env.ANALYTICS_KEY! },
});
const { data } = await response.json();

// Load next page
const nextPage = await fetch('/api/analytics/submissions?limit=20&offset=20', {
  headers: { 'X-API-KEY': process.env.ANALYTICS_KEY! },
});
const { data: moreData } = await nextPage.json();
```

---

### GET /api/analytics/validations/:id

Fetch a single validation record (row from `turnstile_validations`).

**Location:** `/src/routes/analytics.ts`

#### Request

**Headers:**
```
X-API-KEY: your_api_key_here
```

**Path parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| id | integer | Yes | Validation ID (`turnstile_validations.id`) |

#### Response

**Success (200):**
```json
{
  "success": true,
  "data": {
    "id": 987,
    "token_hash": "f2c58c7c0b1b5f5a8d4b1b0d6e9c8a0a",
    "success": 1,
    "allowed": 0,
    "block_reason": "Risk score 84 >= 70. Triggers: Email: sequential",
    "detection_type": "email_fraud_detection",
    "risk_score": 84.1,
    "risk_score_breakdown": {
      "emailFraud": 84,
      "tokenReplay": 0,
      "ephemeralId": 10,
      "validationFrequency": 5,
      "ipDiversity": 0,
      "ja4SessionHopping": 0,
      "ipRateLimit": 0,
      "total": 84.1
    },
    "remote_ip": "203.0.113.42",
    "country": "US",
    "bot_score": 9,
    "client_trust_score": 86,
    "ja3_hash": "579ccef312d18482fc42e2b822ca2430",
    "ja4": "t13d1517h2_5e1f3e8f3e5f_e3f5e3e5e3f5",
    "detection_ids": "[12345,67890]",
    "submission_id": 654,
    "erfid": "erf_0d1b6f55-5ca1-4dc9-9a7d-1e4e9d82f7e1",
    "created_at": "2025-11-25T09:44:00Z"
  }
}
```

**Notes:**
- All columns from `turnstile_validations` are returned (cloud metadata, TLS info, bot signals, etc.).
- `risk_score_breakdown` is JSON stored as text—parse on the client for visualizations.
- Returns `404` with `{ "error": "Validation not found" }` if the ID does not exist.

---

### GET /api/analytics/validations/by-erfid/:erfid

Look up the most recent validation by `erfid` (the value returned via `X-Request-Id`).

**Location:** `/src/routes/analytics.ts`

#### Request

**Headers:**
```
X-API-KEY: your_api_key_here
```

**Path parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| erfid | string | Yes | Request identifier (`erf_*`) returned by `/api/submissions` |

#### Response

**Success (200):**
```json
{
  "success": true,
  "data": {
    "id": 990,
    "submission_id": 12345,
    "allowed": 1,
    "risk_score": 12.5,
    "risk_score_breakdown": {
      "emailFraud": 5,
      "ephemeralId": 8,
      "total": 12.5
    },
    "remote_ip": "198.51.100.24",
    "country": "NL",
    "bot_score": 1,
    "ja4": null,
    "erfid": "erf_5f6824bf-7d43-4ab5-b0ce-ef9a2b7db7c8",
    "created_at": "2025-11-25T10:15:00Z"
  }
}
```

**Notes:**
- Useful for debugging client-reported `erfid` values without knowing the numeric validation ID.
- Returns the most recent validation row that matches the supplied identifier.
- Responds with `404` if no validation exists for that `erfid`.

---

### GET /api/analytics/countries

Get submission counts by country.

**Location:** `/src/routes/analytics.ts`

#### Request

**Headers:** `X-API-KEY: your_api_key_here`

**Query parameters:** None

**Body:** None

#### Response

**Success (200):**
```json
{
  "success": true,
  "data": [
    {
      "country": "US",
      "count": 85
    },
    {
      "country": "GB",
      "count": 42
    },
    {
      "country": "NL",
      "count": 23
    }
  ]
}
```

**Field details:**

| Field | Type | Description |
|-------|------|-------------|
| country | string | ISO 3166-1 alpha-2 country code |
| count | number | Number of submissions from this country |

**Ordering:** Highest count first (ORDER BY count DESC)

**SQL query:**
```sql
SELECT country, COUNT(*) as count
FROM submissions
WHERE country IS NOT NULL
GROUP BY country
ORDER BY count DESC
```

#### cURL Example

```bash
curl https://form.erfi.dev/api/analytics/countries \
  -H "X-API-KEY: $X_API_KEY"
```

#### JavaScript Example

```javascript
const response = await fetch('/api/analytics/countries', {
  headers: { 'X-API-KEY': process.env.ANALYTICS_KEY! },
});
const { data } = await response.json();

data.forEach(({ country, count }) => {
  console.log(`${country}: ${count} submissions`);
});
```

---

### GET /api/analytics/bot-scores

Get bot score distribution (Enterprise only).

**Location:** `/src/routes/analytics.ts`

#### Request

**Headers:** `X-API-KEY: your_api_key_here`

**Query parameters:** None

**Body:** None

#### Response

**Success (200):**
```json
{
  "success": true,
  "data": [
    {
      "bot_score": 1,
      "count": 125
    },
    {
      "bot_score": 2,
      "count": 18
    },
    {
      "bot_score": 30,
      "count": 5
    },
    {
      "bot_score": 99,
      "count": 2
    }
  ]
}
```

**Field details:**

| Field | Type | Description |
|-------|------|-------------|
| bot_score | number | Bot Management score (1-99) |
| count | number | Number of submissions with this score |

**Bot score meanings:**
- 1-29: Human (very likely)
- 30-49: Likely human
- 50-79: Likely bot
- 80-99: Bot (very likely)

**Ordering:** Score ascending (ORDER BY bot_score ASC)

**SQL query:**
```sql
SELECT bot_score, COUNT(*) as count
FROM submissions
WHERE bot_score IS NOT NULL
GROUP BY bot_score
ORDER BY bot_score ASC
```

**Note:** Returns empty array if:
- No Enterprise Bot Management
- No submissions with bot scores

#### cURL Example

```bash
curl https://form.erfi.dev/api/analytics/bot-scores \
  -H "X-API-KEY: $X_API_KEY"
```

#### JavaScript Example

```javascript
const response = await fetch('/api/analytics/bot-scores', {
  headers: { 'X-API-KEY': process.env.ANALYTICS_KEY! },
});
const { data } = await response.json();

const humans = data.filter(d => d.bot_score < 30);
const bots = data.filter(d => d.bot_score >= 80);

console.log(`Humans: ${humans.reduce((sum, d) => sum + d.count, 0)}`);
console.log(`Bots: ${bots.reduce((sum, d) => sum + d.count, 0)}`);
```

---

### GET /api/analytics/asn

Get ASN (Autonomous System Number) distribution.

**Location:** `/src/routes/analytics.ts`

#### Request

**Headers:**
```
X-API-KEY: your_api_key_here
```

**Query parameters:** None

**Body:** None

#### Response

**Success (200):**
```json
{
  "success": true,
  "data": [
    {
      "asn": 13335,
      "as_organization": "Cloudflare, Inc.",
      "count": 145
    },
    {
      "asn": 15169,
      "as_organization": "Google LLC",
      "count": 89
    }
  ]
}
```

**Field details:**

| Field | Type | Description |
|-------|------|-------------|
| asn | number | Autonomous System Number |
| as_organization | string | Organization name |
| count | number | Number of submissions from this ASN |

**Ordering:** Count descending (top 10)

---

### GET /api/analytics/tls

Get TLS version distribution.

**Location:** `/src/routes/analytics.ts`

#### Request

**Headers:**
```
X-API-KEY: your_api_key_here
```

**Query parameters:** None

**Body:** None

#### Response

**Success (200):**
```json
{
  "success": true,
  "data": [
    {
      "tls_version": "TLSv1.3",
      "count": 1245
    },
    {
      "tls_version": "TLSv1.2",
      "count": 89
    }
  ]
}
```

**Field details:**

| Field | Type | Description |
|-------|------|-------------|
| tls_version | string | TLS protocol version |
| count | number | Number of submissions using this TLS version |

**Ordering:** Count descending (top 10)

---

### GET /api/analytics/ja3

Get JA3 fingerprint distribution.

**Location:** `/src/routes/analytics.ts`

#### Request

**Headers:**
```
X-API-KEY: your_api_key_here
```

**Query parameters:** None

**Body:** None

#### Response

**Success (200):**
```json
{
  "success": true,
  "data": [
    {
      "ja3_hash": "579ccef312d18482fc42e2b822ca2430",
      "count": 523
    },
    {
      "ja3_hash": "bd4e03c6cf8ec9e2e7e5f5e3e3f5e3e5",
      "count": 342
    }
  ]
}
```

**Field details:**

| Field | Type | Description |
|-------|------|-------------|
| ja3_hash | string | JA3 TLS fingerprint hash |
| count | number | Number of submissions with this fingerprint |

**Ordering:** Count descending (top 10)

**Note:** JA3 fingerprints require Cloudflare Enterprise with Bot Management.

---

### GET /api/analytics/ja4

Get JA4 fingerprint distribution.

**Location:** `/src/routes/analytics.ts`

#### Request

**Headers:**
```
X-API-KEY: your_api_key_here
```

**Query parameters:** None

**Body:** None

#### Response

**Success (200):**
```json
{
  "success": true,
  "data": [
    {
      "ja4": "t13d1517h2_5e1f3e8f3e5f_e3f5e3e5e3f5",
      "count": 678
    },
    {
      "ja4": "t13d1517h2_8f3e5f3e5f3e_3e5f3e5f3e5f",
      "count": 445
    }
  ]
}
```

**Field details:**

| Field | Type | Description |
|-------|------|-------------|
| ja4 | string | JA4 TLS fingerprint string |
| count | number | Number of submissions with this fingerprint |

**Ordering:** Count descending (top 10)

**Note:** JA4 fingerprints require Cloudflare Enterprise with Bot Management.

---

### GET /api/analytics/email-patterns

Email fraud pattern distribution aggregated from Markov-Mail signals.

**Location:** `/src/routes/analytics.ts`

#### Request

**Headers:**
```
X-API-KEY: your_api_key_here
```

**Query parameters:** None

#### Response

**Success (200):**
```json
{
  "success": true,
  "data": [
    {
      "email_pattern_type": "sequential",
      "count": 42,
      "avg_risk_score": 78.4,
      "markov_detected_count": 39
    },
    {
      "email_pattern_type": "formatted",
      "count": 18,
      "avg_risk_score": 33.2,
      "markov_detected_count": 12
    }
  ]
}
```

**Fields:**

| Field | Type | Description |
|-------|------|-------------|
| email_pattern_type | string | Pattern class returned by Markov-Mail (`sequential`, `dated`, `formatted`, `gibberish`, etc.) |
| count | number | Number of submissions classified with this pattern |
| avg_risk_score | number | Average normalized email risk score (0-100) |
| markov_detected_count | number | How many submissions triggered `markovDetected=true` |

**Use cases:**
- Trend email attack patterns over time
- Build stacked bar charts in the analytics dashboard
- Quickly see which pattern type contributes most to high-risk submissions

---

### GET /api/analytics/submissions/:id

Get single submission by ID with full details.

**Location:** `/src/routes/analytics.ts`

#### Request

**Headers:**
```
X-API-KEY: your_api_key_here
```

**Path parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| id | integer | Yes | Submission ID |

**Query parameters:** None

**Body:** None

#### Response

**Success (200):**
```json
{
  "success": true,
  "data": {
    "id": 12345,
    "first_name": "John",
    "last_name": "Doe",
    "email": "john@example.com",
    "phone": "+15551234567",
    "address": "123 Main St",
    "date_of_birth": "1990-01-15",
    "ephemeral_id": "x:9f78e0ed210960d7693b167e",
    "remote_ip": "203.0.113.42",
    "user_agent": "Mozilla/5.0...",
    "country": "US",
    "region": "California",
    "city": "San Francisco",
    "postal_code": "94102",
    "timezone": "America/Los_Angeles",
    "latitude": "37.7749",
    "longitude": "-122.4194",
    "continent": "NA",
    "is_eu_country": "0",
    "asn": 13335,
    "as_organization": "Cloudflare, Inc.",
    "colo": "SFO",
    "http_protocol": "HTTP/2",
    "tls_version": "TLSv1.3",
    "tls_cipher": "AEAD-AES128-GCM-SHA256",
    "bot_score": 1,
    "client_trust_score": 95,
    "verified_bot": false,
    "detection_ids": "[\"credential_stuffing\"]",
    "ja3_hash": "579ccef312d18482fc42e2b822ca2430",
    "ja4": "t13d1517h2_5e1f3e8f3e5f_e3f5e3e5e3f5",
    "ja4_signals": "{\"h2h3_ratio_1h\":0.95}",
    "created_at": "2024-11-13T10:30:00.000Z"
  }
}
```

**Error (404):**
```json
{
  "error": "Submission not found"
}
```

**Error (400):**
```json
{
  "error": "Invalid ID"
}
```

---

### GET /api/analytics/time-series

Get time-series data for trend visualization with multiple fraud/telemetry metrics across 4 intervals.

**Location:** `/src/routes/analytics.ts`

#### Request

**Headers:**
```
X-API-KEY: your_api_key_here
```

**Query parameters:**

| Parameter | Type | Required | Description | Valid Values |
|-----------|------|----------|-------------|--------------|
| metric | string | Yes | Metric to retrieve | submissions, validations, validation_success_rate, bot_score_avg, risk_score_avg, allowed_rate, fingerprint_header_blocks, fingerprint_tls_blocks, fingerprint_latency_blocks, testing_bypass |
| interval | string | Yes | Time interval for grouping | hour, day, week, month |
| start | string | No | Start date (ISO 8601) | YYYY-MM-DDTHH:mm:ss.sssZ (default: 30 days ago) |
| end | string | No | End date (ISO 8601) | YYYY-MM-DDTHH:mm:ss.sssZ (default: now) |

**Body:** None

#### Response

**Success (200):**
```json
{
  "success": true,
  "data": [
    {
      "timestamp": "2024-11-13T00:00:00.000Z",
      "value": 145
    },
    {
      "timestamp": "2024-11-13T01:00:00.000Z",
      "value": 178
    }
  ],
  "meta": {
    "metric": "submissions",
    "interval": "hour",
    "start": "2024-11-12T00:00:00.000Z",
    "end": "2024-11-13T23:59:59.999Z",
    "total_points": 48
  }
}
```

**Metric overview**

| Metric | Description |
|--------|-------------|
| `submissions` | Count of stored submissions per interval |
| `validations` | Count of Turnstile validations (pass + fail) |
| `validation_success_rate` | Average % of validations reporting `success=1` |
| `bot_score_avg` | Average bot score from `submissions.bot_score` |
| `risk_score_avg` | Average normalized risk score from `turnstile_validations` |
| `allowed_rate` | % of validations where `allowed=1` |
| `fingerprint_header_blocks` | Count of validations blocked due to header fingerprint reuse |
| `fingerprint_tls_blocks` | Count of TLS fingerprint anomaly blocks |
| `fingerprint_latency_blocks` | Count of latency mismatch blocks (non-zero RTT measurements only) |
| `testing_bypass` | Count of validations/submissions flagged with `testing_bypass=1` |

**Field details:**

| Field | Type | Description |
|-------|------|-------------|
| timestamp | string | ISO 8601 timestamp for data point |
| value | number | Metric value at this timestamp |

**Metric descriptions:**

| Metric | Type | Description |
|--------|------|-------------|
| submissions | count | Number of submissions |
| validations | count | Number of validation attempts |
| validation_success_rate | percentage | % of successful validations (0-100) |
| bot_score_avg | average | Average bot score (0-100) |
| risk_score_avg | average | Average fraud risk score (0-100) |
| allowed_rate | percentage | % of submissions allowed (0-100) |

**Error (400):**
```json
{
  "success": false,
  "error": "Invalid metric",
  "message": "Metric must be one of: submissions, validations, validation_success_rate, bot_score_avg, risk_score_avg, allowed_rate"
}
```

---

### GET /api/analytics/export

Export submissions data as CSV or JSON with all applied filters.

**Location:** `/src/routes/analytics.ts`

#### Request

**Headers:**
```
X-API-KEY: your_api_key_here
```

**Query parameters:**

| Parameter | Type | Required | Description | Valid Values |
|-----------|------|----------|-------------|--------------|
| format | string | No | Export format | csv, json (default: csv) |
| countries | string | No | Comma-separated country codes | US,CA,GB |
| botScoreMin | number | No | Minimum bot score (0-100) | 0-100 |
| botScoreMax | number | No | Maximum bot score (0-100) | 0-100 |
| startDate | string | No | Start date (ISO 8601) | YYYY-MM-DDTHH:mm:ss.sssZ |
| endDate | string | No | End date (ISO 8601) | YYYY-MM-DDTHH:mm:ss.sssZ |
| verifiedBot | boolean | No | Filter by verified bot status | true, false |
| hasJa3 | boolean | No | Filter by JA3 presence | true, false |
| hasJa4 | boolean | No | Filter by JA4 presence | true, false |
| search | string | No | Search in email/name/address | any string |
| allowed | string | No | Filter by decision | `true`, `false`, `all` (default `all`) |
| fingerprintHeader | boolean | No | Only submissions flagged for header reuse | true, false |
| fingerprintTls | boolean | No | Only submissions flagged for TLS anomaly | true, false |
| fingerprintLatency | boolean | No | Only submissions flagged for latency mismatch | true, false |

**Body:** None

#### Response

**Success (200) - CSV format:**
```
Content-Type: text/csv
Content-Disposition: attachment; filename="submissions_2024-11-13.csv"

id,first_name,last_name,email,phone,address,date_of_birth,country,bot_score,created_at
12345,John,Doe,john@example.com,+15551234567,"123 Main St",1990-01-15,US,1,2024-11-13T10:30:00.000Z
12346,Jane,Smith,jane@example.com,+15559876543,"456 Oak Ave",1985-06-20,CA,2,2024-11-13T10:35:00.000Z
```

**Success (200) - JSON format:**
```json
{
  "success": true,
  "data": [
    {
      "id": 12345,
      "first_name": "John",
      "last_name": "Doe",
      "email": "john@example.com",
      "phone": "+15551234567",
      "address": "123 Main St",
      "date_of_birth": "1990-01-15",
      "country": "US",
      "bot_score": 1,
      "created_at": "2024-11-13T10:30:00.000Z"
    }
  ],
  "meta": {
    "total": 2,
    "format": "json",
    "exported_at": "2024-11-13T15:00:00.000Z"
  }
}
```

**Error (400):**
```json
{
  "success": false,
  "error": "Invalid format",
  "message": "Format must be either \"csv\" or \"json\""
}
```

---

### GET /api/analytics/exports/security-events

Download the current active blacklist entries and the most recent blocked validations (post- and pre-Turnstile) as JSON. Respects the same X-API-KEY middleware as the rest of the analytics routes.

**Headers:**
```
X-API-KEY: your_api_key_here
```

**Query parameters:**

| Parameter | Type | Required | Description | Valid Values |
|-----------|------|----------|-------------|--------------|
| startDate | string | No | Filter events created after this ISO timestamp | `YYYY-MM-DDTHH:mm:ss.sssZ` |
| endDate | string | No | Filter events created before this ISO timestamp | `YYYY-MM-DDTHH:mm:ss.sssZ` |
| status | string | No | Filter by row type | `all` (default), `active`, `detection` |
| riskLevel | string | No | Filter by resolved risk score | `low`, `medium`, `high`, `critical` |
| limit | number | No | Maximum rows per section (1-5000, default 1000) | `500` |

**Success (200):**
```json
{
  "success": true,
  "fileName": "security-events-1732646400000.json",
  "generatedAt": "2025-11-26T09:45:00.000Z",
  "filters": {
    "startDate": "2025-11-26T09:00:00.000Z",
    "endDate": "2025-11-26T10:00:00.000Z",
    "status": "all",
    "riskLevel": "high",
    "limit": 500
  },
  "data": {
    "activeBlocks": [
      {
        "id": 123,
        "ephemeral_id": "b:....",
        "block_reason": "Risk score 82 >= 70. Triggers: Email: simple, ...",
        "risk_score": 82,
        "detection_type": "ephemeral_id_tracking",
        "expires_at": "2025-11-26T13:15:00Z"
      }
    ],
    "detections": [
      {
        "id": 987,
        "ip_address": "203.0.113.4",
        "block_reason": "Risk score 75 >= 70. Triggers: JA4 ..., IP rate limit ...",
        "risk_score": 75,
        "source": "validation"
      }
    ]
  }
}
```

---

### GET /api/analytics/exports/validations

Export the raw `turnstile_validations` rows (allowed and blocked) as JSON for deeper analysis or long-term archival.

**Headers:**
```
X-API-KEY: your_api_key_here
```

**Query parameters:**

| Parameter | Type | Required | Description | Valid Values |
|-----------|------|----------|-------------|--------------|
| startDate | string | No | Start of the window (ISO-8601) | `YYYY-MM-DDTHH:mm:ss.sssZ` |
| endDate | string | No | End of the window (ISO-8601) | `YYYY-MM-DDTHH:mm:ss.sssZ` |
| limit | number | No | Row cap (1-5000, default 1000) | `2500` |

**Success (200):**
```json
{
  "success": true,
  "fileName": "validations-1732646400000.json",
  "generatedAt": "2025-11-26T09:45:00.000Z",
  "filters": {
    "startDate": "2025-11-26T09:00:00.000Z",
    "endDate": "2025-11-26T10:00:00.000Z",
    "limit": 1000
  },
  "data": [
    {
      "id": 1,
      "token_hash": "abc123...",
      "success": false,
      "allowed": false,
      "block_reason": "Risk score 78 >= 70. Triggers: Email: dated, ...",
      "risk_score": 78,
      "detection_type": "email_fraud_detection",
      "remote_ip": "198.51.100.10",
      "ja4": "q1....",
      "created_at": "2025-11-26 09:12:44"
    }
  ]
}
```

---

### GET /api/analytics/fraud-patterns

Detect potential fraud patterns across submissions.

**Location:** `/src/routes/analytics.ts`

#### Request

**Headers:**
```
X-API-KEY: your_api_key_here
```

**Query parameters:** None

**Body:** None

#### Response

**Success (200):**
```json
{
  "success": true,
  "data": {
    "high_risk_ephemeral_ids": [
      {
        "ephemeral_id": "x:9f78e0ed210960d7693b167e",
        "submission_count": 12,
        "unique_emails": 8,
        "unique_ips": 5,
        "first_seen": "2024-11-10T08:00:00.000Z",
        "last_seen": "2024-11-13T14:30:00.000Z",
        "risk_score": 95
      }
    ],
    "high_risk_ips": [
      {
        "ip_address": "203.0.113.42",
        "submission_count": 8,
        "unique_emails": 6,
        "first_seen": "2024-11-13T10:00:00.000Z",
        "last_seen": "2024-11-13T14:00:00.000Z",
        "risk_score": 75
      }
    ],
    "recent_blocks": [
      {
        "identifier": "x:abc123",
        "identifier_type": "ephemeral_id",
        "block_reason": "High submission frequency",
        "detection_confidence": "high",
        "blocked_at": "2024-11-13T14:00:00.000Z",
        "expires_at": "2024-11-20T14:00:00.000Z",
        "submission_count": 15
      }
    ]
  }
}
```

**Field details:**

| Field | Type | Description |
|-------|------|-------------|
| high_risk_ephemeral_ids | array | Ephemeral IDs with suspicious patterns |
| high_risk_ips | array | IP addresses with suspicious patterns |
| recent_blocks | array | Recently blacklisted identifiers |

**Pattern detection criteria:**
- 3+ submissions in 1 hour: High risk (rapid submission)
- 3+ different IPs in 1 hour (proxy rotation): High risk
- 10+ validations in 1 hour: High risk (rapid token generation)
- 2+ submissions in 24 hours: Block (ephemeral ID fraud)
- Block threshold: risk_score ≥ 70

---

### GET /api/analytics/blocked-stats

Aggregate counts for blocked validations vs. pre-validation fraud blocks.

**Headers:** `X-API-KEY: your_api_key_here`

**Success (200):**
```json
{
  "success": true,
  "data": {
    "total_blocked": 214,
    "unique_ephemeral_ids": 58,
    "unique_ips": 132,
    "avg_risk_score": 71.3,
    "validation_blocks": 180,
    "fraud_blocks": 34,
    "unique_block_reasons": 0
  }
}
```

**Notes:**
- `validation_blocks` counts rows from `turnstile_validations` where `allowed = 0`.
- `fraud_blocks` counts rows written to the `fraud_blocks` forensic log.
- `unique_block_reasons` is included for parity with `block-reasons` (always 0 currently; computed there).

---

### GET /api/analytics/block-reasons

Breakdown of block reasons across validation vs. fraud-block sources.

**Headers:** `X-API-KEY: your_api_key_here`

**Success (200):**
```json
{
  "success": true,
  "data": [
    {
      "block_reason": "Risk score 90 >= 70. Triggers: JA4 session hopping",
      "count": 32,
      "unique_ephemeral_ids": 11,
      "unique_ips": 27,
      "avg_risk_score": 88.2,
      "source": "validation"
    },
    {
      "block_reason": "Repeated duplicate email attempts (3 attempts)",
      "count": 9,
      "unique_ephemeral_ids": 0,
      "unique_ips": 6,
      "avg_risk_score": 74.5,
      "source": "fraud_block"
    }
  ]
}
```

- `risk_score_breakdown` mirrors the normalized JSON stored with submissions/validations so dashboards can surface token/email/JA4 contributions even when the block happened before Turnstile.
- `detection_metadata` remains a free-form JSON payload for layer-specific context (duplicate counts, JA4 cluster stats, fingerprint warnings, etc.).

---

### GET /api/analytics/blacklist

List active entries from `fraud_blacklist` (max 100, newest first).

**Headers:** `X-API-KEY: your_api_key_here`

**Success (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": 512,
      "ephemeral_id": "x:9f78e0ed210960d7693b167e",
      "ip_address": "203.0.113.42",
      "ja4": "t13d1517h2_5e1f3e8f3e5f_e3f5e3e5e3f5",
      "block_reason": "Risk score 82 >= 70. Triggers: Email: sequential, Multiple submissions detected (3 total in 24h)",
      "detection_confidence": "high",
      "erfid": "erf_0d1b6f55-5ca1-4dc9-9a7d-1e4e9d82f7e1",
      "blocked_at": "2025-11-25T09:45:00Z",
      "expires_at": "2025-11-26T09:45:00Z",
      "submission_count": 3,
      "last_seen_at": "2025-11-25T09:40:00Z",
      "detection_metadata": "{\"warnings\":[\"Multiple submissions detected\"],\"email_fraud\":{\"pattern\":\"sequential\"}}",
      "country": "US",
      "city": "San Francisco",
      "offense_count": 2,
      "risk_score": 88.6,
      "risk_score_breakdown": {
        "total": 88.6,
        "components": {
          "ephemeralId": { "score": 100, "weight": 0.15, "contribution": 15, "reason": "3 submissions in 1h" },
          "validationFrequency": { "score": 100, "weight": 0.10, "contribution": 10, "reason": "3 validations in 1h" },
          "ipDiversity": { "score": 100, "weight": 0.07, "contribution": 7, "reason": "Proxy rotation detected" }
        }
      }
    }
  ]
}
```

---

### GET /api/analytics/blacklist-stats

Snapshot of active blacklist totals grouped by confidence level and identifier type.

**Headers:** `X-API-KEY: your_api_key_here`

**Success (200):**
```json
{
  "success": true,
  "data": {
    "total_active": 47,
    "high_confidence": 19,
    "medium_confidence": 18,
    "low_confidence": 10,
    "ephemeral_id_blocks": 35,
    "ip_blocks": 28
  }
}
```

---

### GET /api/analytics/blocked-validations

Recent blocked validations from both Turnstile (post-check) and `fraud_blocks` (pre-check).

**Headers:** `X-API-KEY: your_api_key_here`

**Query parameters:**

| Parameter | Default | Description |
|-----------|---------|-------------|
| limit | 50 | Number of rows to return (1-500) |

**Success (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": 3210,
      "ephemeral_id": "x:abc123",
      "ip_address": "203.0.113.42",
      "country": "US",
      "city": "San Francisco",
      "block_reason": "Risk score 90 >= 70. Triggers: Email: sequential",
      "detection_type": "email_fraud_detection",
      "risk_score": 90.2,
      "risk_score_breakdown": {
        "total": 90.2,
        "components": {
          "emailFraud": { "score": 100, "weight": 0.14, "contribution": 14, "reason": "Sequential pattern" },
          "ephemeralId": { "score": 80, "weight": 0.15, "contribution": 12, "reason": "2 submissions detected" }
        }
      },
      "bot_score": 8,
      "user_agent": "Mozilla/5.0 ...",
      "ja4": "t13d1517h2_5e1f3e8f3e5f_e3f5e3e5e3f5",
      "erfid": "erf_b2c5c87c-b03c-4b88-9eea-8fdc0d1af5a4",
      "challenge_ts": "2025-11-25T09:44:00Z",
      "fraud_signals_json": null,
      "source": "validation"
    },
    {
      "id": 118,
      "ephemeral_id": null,
      "ip_address": "198.51.100.24",
      "country": null,
      "city": null,
      "block_reason": "Blocked by duplicate_email",
      "detection_type": "duplicate_email",
      "risk_score": 70,
      "bot_score": null,
      "user_agent": "curl/8.6.0",
      "ja4": null,
      "erfid": "erf_c1c2c3c4-aaaa-bbbb-cccc-ddddeeeeffff",
      "challenge_ts": "2025-11-25T09:30:00Z",
      "risk_score_breakdown": null,
      "fraud_signals_json": "{\"duplicateCount\":3}",
      "source": "fraud_block"
    }
  ]
}
```

- `risk_score_breakdown` mirrors the JSON stored with validations. Parse it client-side to display component contributions.
- `fraud_signals_json` surfaces detection-specific context for pre-validation (`source = "fraud_block"`) entries.

---

### GET /api/health

Health check endpoint.

**Location:** `/src/index.ts`

#### Request

**Headers:** `X-API-KEY: your_api_key_here`

**Query parameters:** None

**Body:** None

#### Response

**Success (200):**
```json
{
  "status": "ok",
  "timestamp": "2024-11-12T20:30:45.123Z"
}
```

**Field details:**

| Field | Type | Description |
|-------|------|-------------|
| status | string | Always "ok" if responding |
| timestamp | string | Current server time (ISO 8601) |

#### Usage

**Uptime monitoring:**
```bash
# Check if service is up
curl https://form.erfi.dev/api/health

# Expected: 200 OK with {"status":"ok",...}
```

**Load balancer health check:**
```
Health Check URL: https://form.erfi.dev/api/health
Expected Status: 200
Expected Body: Contains "ok"
Interval: 30 seconds
Timeout: 5 seconds
```

---

### GET /api/config

Get fraud detection configuration.

**Location:** `/src/routes/config.ts`

#### Request

**Headers:** None required

**Query parameters:** None

**Body:** None

#### Response

**Success (200):**
```json
{
  "success": true,
  "version": "2.0.0",
  "customized": false,
  "data": {
    "risk": {
      "blockThreshold": 70,
      "levels": {
        "low": { "min": 0, "max": 39 },
        "medium": { "min": 40, "max": 69 },
        "high": { "min": 70, "max": 100 }
      },
      "weights": {
        "tokenReplay": 0.28,
        "emailFraud": 0.14,
        "ephemeralId": 0.15,
        "validationFrequency": 0.10,
        "ipDiversity": 0.07,
        "ja4SessionHopping": 0.06,
        "ipRateLimit": 0.07,
        "headerFingerprint": 0.07,
        "tlsAnomaly": 0.04,
        "latencyMismatch": 0.02
      }
    },
    "ja4": {
      "ipsQuantileThreshold": 0.95,
      "reqsQuantileThreshold": 0.99,
      "heuristicRatioThreshold": 0.8,
      "browserRatioThreshold": 0.2,
      "h2h3RatioThreshold": 0.9,
      "cacheRatioThreshold": 0.5
    },
    "detection": {
      "ephemeralIdSubmissionThreshold": 2,
      "validationFrequencyBlockThreshold": 3,
      "validationFrequencyWarnThreshold": 2,
      "ipDiversityThreshold": 2,
      "ipRateLimitThreshold": 3,
      "ipRateLimitWindow": 3600,
      "ja4Clustering": {
        "ipClusteringThreshold": 2,
        "rapidGlobalThreshold": 3,
        "rapidGlobalWindowMinutes": 5,
        "extendedGlobalThreshold": 5,
        "extendedGlobalWindowMinutes": 60
      }
    },
    "fingerprint": {
      "headerReuse": {
        "windowMinutes": 60,
        "minRequests": 3,
        "minDistinctIps": 2,
        "minDistinctJa4": 2
      },
      "tlsAnomaly": {
        "baselineHours": 24,
        "minJa4Observations": 5
      },
      "latency": {
        "mobileRttThresholdMs": 6,
        "inspectPlatforms": ["Android", "iOS"]
      },
      "datacenterAsns": [16509, 14618, 8075, 15169, 13335, 9009, 61317, 49544]
    },
    "timeouts": {
      "schedule": [3600, 14400, 28800, 43200, 86400],
      "maximum": 86400
    }
  }
}
```

**Field details:**

| Field | Type | Description |
|-------|------|-------------|
| success | boolean | Always true if successful |
| version | string | Configuration schema version |
| customized | boolean | True if FRAUD_CONFIG environment variable is set |
| data | object | Complete fraud detection configuration |
| data.risk | object | Risk scoring configuration |
| data.risk.blockThreshold | number | Block submissions with risk score ≥ this value (default: 70) |
| data.risk.levels | object | Risk level ranges (low, medium, high) |
| data.risk.weights | object | Component weights (must sum to 1.0) |
| data.ja4 | object | JA4 fingerprint signal thresholds |
| data.ja4.ipsQuantileThreshold | number | IP diversity percentile (default: 0.95 = 95th percentile) |
| data.ja4.reqsQuantileThreshold | number | Request volume percentile (default: 0.99 = 99th percentile) |
| data.detection | object | Detection thresholds |
| data.detection.ephemeralIdSubmissionThreshold | number | Max submissions per device in 24h (default: 2) |
| data.detection.validationFrequencyBlockThreshold | number | Max validation attempts in 1h to block (default: 3) |
| data.detection.validationFrequencyWarnThreshold | number | Validation attempts to warn (default: 2) |
| data.detection.ipDiversityThreshold | number | Max IPs per device in 24h (default: 2) |
| data.detection.ipRateLimitThreshold | number | Threshold for IP rate limit risk curve (default: 3) |
| data.detection.ipRateLimitWindow | number | Window for IP rate limiting in seconds (default: 3600 = 1 hour) |
| data.detection.ja4Clustering | object | JA4 session hopping detection thresholds |
| data.fingerprint | object | Header/TLS/latency fingerprint heuristics |
| data.fingerprint.headerReuse | object | Rolling-window counts for header fingerprint reuse |
| data.fingerprint.tlsAnomaly | object | Baseline size + lookback for TLS extension hashes |
| data.fingerprint.latency | object | RTT thresholds per platform |
| data.fingerprint.datacenterAsns | array<number> | Hosting ASNs that should never present mobile RTTs |
| data.timeouts | object | Progressive timeout schedule |

#### Usage

**Get current configuration:**
```bash
curl https://form.erfi.dev/api/config | jq '.data.risk.blockThreshold'
# Output: 70
```

**Check if customized:**
```bash
curl https://form.erfi.dev/api/config | jq '.customized'
# Output: false (using defaults) or true (FRAUD_CONFIG set)
```

**Frontend usage:**
```typescript
// React component
import { useConfig } from './hooks/useConfig';

function MyComponent() {
  const { config, loading } = useConfig();

  if (loading) return <div>Loading...</div>;

  return (
    <div>
      <p>Block Threshold: {config.risk.blockThreshold}</p>
      <p>Email Weight: {config.risk.weights.emailFraud}</p>
    </div>
  );
}
```

#### Configuration Customization

**Via Cloudflare Dashboard:**
1. Navigate to Workers & Pages → forminator → Settings → Variables
2. Add secret `FRAUD_CONFIG` with JSON value:
```json
{
  "risk": {
    "blockThreshold": 80,
    "weights": {
      "emailFraud": 0.25
    }
  },
  "detection": {
    "ephemeralIdSubmissionThreshold": 3
  }
}
```

**Via wrangler CLI:**
```bash
echo '{"risk":{"blockThreshold":80}}' | wrangler secret put FRAUD_CONFIG
```

**Deep merge:** Only specified values are overridden. All other values use defaults.

**Documentation:** See [CONFIGURATION-SYSTEM.md](./CONFIGURATION-SYSTEM.md) for complete guide.

#### Implementation Details

**Source:** `src/lib/config.ts`
- Default configuration with research-backed rationale
- Deep merge algorithm for partial overrides
- Type-safe with FraudDetectionConfig interface
- Zero hardcoded values in fraud detection code

**Integration:**
- All fraud detection functions accept config parameter
- Frontend fetches config on mount via useConfig hook
- Analytics UI displays dynamic thresholds

**Testing:**
```bash
# Test default configuration
curl https://form.erfi.dev/api/config | jq '.customized'
# Expected: false

# Set custom configuration
echo '{"risk":{"blockThreshold":80}}' | wrangler secret put FRAUD_CONFIG

# Verify custom configuration applied
sleep 3
curl https://form.erfi.dev/api/config | jq '{customized, blockThreshold: .data.risk.blockThreshold}'
# Expected: {"customized": true, "blockThreshold": 80}
```

#### cURL Example

```bash
curl -i https://form.erfi.dev/api/health

# HTTP/2 200
# content-type: application/json
#
# {"status":"ok","timestamp":"2024-11-12T20:30:45.123Z"}
```

---

## CORS Configuration

**Allowed origins:**
```typescript
const ALLOWED_ORIGINS = [
  'https://form.erfi.dev',
  'https://erfi.dev',
  'https://erfianugrah.com',
];

// Development
if (process.env.NODE_ENV === 'development') {
  ALLOWED_ORIGINS.push('http://localhost:8787', 'http://localhost:4321');
}
```

**CORS headers:**
```
Access-Control-Allow-Origin: https://form.erfi.dev
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: Content-Type
Access-Control-Max-Age: 86400
```

**Preflight requests:**
- `OPTIONS` requests handled automatically
- 24-hour cache (86400 seconds)

## Security Headers

**All responses include:**

```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: geolocation=(), microphone=(), camera=()
Content-Security-Policy: default-src 'self'; script-src 'self' https://challenges.cloudflare.com; ...
```

## API Versioning

No versioning (v1 implicit).

## Testing

### Integration Tests

```bash
# Test submission flow
curl -X POST https://form.erfi.dev/api/submissions \
  -H "Content-Type: application/json" \
  -d @test-data.json

# Test analytics
curl https://form.erfi.dev/api/analytics/stats

# Test geolocation
curl https://form.erfi.dev/api/geo

# Test health
curl https://form.erfi.dev/api/health
```

### Load Testing

```bash
# Using Apache Bench
ab -n 1000 -c 10 https://form.erfi.dev/api/health

# Using wrk
wrk -t4 -c100 -d30s https://form.erfi.dev/api/analytics/stats
```

### Automated Tests

```typescript
describe('API Endpoints', () => {
  test('POST /api/submissions validates input', async () => {
    const response = await fetch('/api/submissions', {
      method: 'POST',
      body: JSON.stringify({ firstName: 'John' }), // Missing fields
    });
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.success).toBe(false);
    expect(data.errors).toBeDefined();
  });

  test('GET /api/geo returns country code', async () => {
    const response = await fetch('/api/geo');
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.countryCode).toMatch(/^[a-z]{2}$/);
  });
});
```

## Related Documentation

- [CONFIGURATION-SYSTEM.md](./CONFIGURATION-SYSTEM.md) - Fraud detection configuration guide
- [FORM-VALIDATION.md](./FORM-VALIDATION.md) - Input validation details
- [TURNSTILE.md](./TURNSTILE.md) - Turnstile verification
- [FRAUD-DETECTION.md](./FRAUD-DETECTION.md) - Fraud detection algorithm
- [DATABASE-SCHEMA.md](./DATABASE-SCHEMA.md) - Database structure
- [GEOLOCATION.md](./GEOLOCATION.md) - Geolocation system
