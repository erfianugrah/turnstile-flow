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
  - [GET /api/analytics/submissions/:id](#get-apianalyticssubmissionsid)
  - [GET /api/analytics/countries](#get-apianalyticscountries)
  - [GET /api/analytics/bot-scores](#get-apianalyticsbot-scores)
  - [GET /api/analytics/asn](#get-apianalyticsasn)
  - [GET /api/analytics/tls](#get-apianalyticstls)
  - [GET /api/analytics/ja3](#get-apianalyticsja3)
  - [GET /api/analytics/ja4](#get-apianalyticsja4)
  - [GET /api/analytics/time-series](#get-apianalyticstime-series)
  - [GET /api/analytics/fraud-patterns](#get-apianalyticsfraud-patterns)
  - [GET /api/analytics/export](#get-apianalyticsexport)
  - [GET /api/health](#get-apihealth)

## Base URL

**Production:** `https://form.erfi.dev`

**Development:** `http://localhost:8787` (with `wrangler dev`)

## Authentication

**Public endpoints:**
- POST /api/submissions
- GET /api/geo
- GET /api/health

**Protected endpoints (require X-API-KEY header):**
- GET /api/analytics/* (all analytics endpoints)

**Why analytics require auth:**
- Sensitive submission data exposure
- PII and fraud detection data
- Production deployments should protect analytics with API keys

**Implementation:**
```typescript
// src/routes/analytics.ts
const apiKey = c.req.header('X-API-KEY');
if (!apiKey || apiKey !== c.env['API-KEY']) {
  return c.json({ error: 'Unauthorized' }, 401);
}
```

**Adding authentication (future):**
```typescript
// Middleware
app.use('/api/analytics/*', async (c, next) => {
  const token = c.req.header('Authorization');
  if (!token || !await verifyToken(token)) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  await next();
});
```

## Rate Limiting

**Current implementation:** Pattern-based fraud detection (see FRAUD-DETECTION.md)

**NOT strict rate limiting:**
- No "429 Too Many Requests" responses
- No fixed time windows
- Relies on Turnstile for bot protection

**Limits enforced:**
- Turnstile: ~1 token per 5 seconds per user
- Fraud detection: Blocks suspicious patterns
- D1: ~50 writes/sec per database

**For strict rate limiting:**
- Use Durable Objects for distributed counters
- Implement sliding window algorithm
- Return 429 with Retry-After header

## Error Responses

### Standard Error Format

```json
{
  "success": false,
  "message": "Human-readable error message",
  "errors": {
    "field": ["error 1", "error 2"]
  }
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
  "phone": "+1 (555) 123-4567",
  "address": "123 Main St, San Francisco, CA 94102",
  "dateOfBirth": "1990-01-15",
  "turnstileToken": "0.AbCdEfGhIjKlMnOpQrStUvWxYz..."
}
```

**Field requirements:**

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| firstName | string | Yes | 1-50 chars, letters/spaces/hyphens/apostrophes only |
| lastName | string | Yes | 1-50 chars, letters/spaces/hyphens/apostrophes only |
| email | string | Yes | Valid email, max 100 chars |
| phone | string | Yes | 7-15 digits (any format accepted) |
| address | string | Yes | 1-200 chars |
| dateOfBirth | string | Yes | YYYY-MM-DD format, age 18-120 |
| turnstileToken | string | Yes | Valid Turnstile token |

#### Response

**Success (200):**
```json
{
  "success": true,
  "message": "Form submitted successfully",
  "submissionId": "12345"
}
```

**Validation error (400):**
```json
{
  "success": false,
  "message": "Validation failed",
  "errors": {
    "email": ["Invalid email address"]
  }
}
```

**Turnstile failed (400):**
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
1. Parse request body → JSON
2. Validate schema → Zod validation
3. Sanitize inputs → Remove HTML, normalize

4. [BYPASS CHECK]
   - If X-API-KEY header present AND ALLOW_TESTING_BYPASS=true:
     → Create mock validation object (skips steps 5-7)
     → Generate mock ephemeral ID for testing fraud detection
     → Continue to step 8
   - Otherwise:
     → Continue to step 5 (normal Turnstile flow)

5. Hash token → SHA256
6. Check token reuse → D1 lookup
7. Verify Turnstile → API call to Cloudflare
   → Extract real ephemeral ID from response

8. Email fraud check → Markov-Mail RPC (Layer 1)
9. Fraud check → Ephemeral ID / validation frequency / JA4 / IP patterns (Layers 2-5)
10. Extract metadata → 40+ fields from request
11. Insert submission → D1 transaction
12. Insert validation log → Same transaction
13. Return success → 201 Created
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
    "address": "123 Main St",
    "dateOfBirth": "1990-01-15",
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
    address: '123 Main St',
    dateOfBirth: '1990-01-15',
    turnstileToken: token,
  }),
});

const data = await response.json();

if (data.success) {
  console.log('Submission successful:', data.submissionId);
} else {
  console.error('Submission failed:', data.message);
}
```

---

### GET /api/geo

Get user's country code based on IP geolocation.

**Location:** `/src/routes/geo.ts`

#### Request

**Headers:** None required

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

Get overall submission and validation statistics.

**Location:** `/src/routes/analytics.ts`

#### Request

**Headers:** None required

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
    "unique_ephemeral_ids": 98
  }
}
```

**Field details:**

| Field | Type | Description |
|-------|------|-------------|
| total | number | Total submissions attempted |
| successful | number | Successful Turnstile validations |
| allowed | number | Submissions not blocked by fraud detection |
| avg_risk_score | number \| null | Average fraud risk score (0-100) |
| unique_ephemeral_ids | number | Unique users (Enterprise only) |

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
```

#### cURL Example

```bash
curl https://form.erfi.dev/api/analytics/stats

# Response:
# {"success":true,"data":{"total":150,"successful":145,...}}
```

#### JavaScript Example

```javascript
const response = await fetch('/api/analytics/stats');
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

**Headers:** None required

**Query parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| limit | number | 50 | Number of submissions to return (max 100) |
| offset | number | 0 | Number of submissions to skip |

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
      "bot_score": 1,
      "allowed": 1,
      "created_at": "2024-11-12T20:30:00Z"
    },
    {
      "id": 122,
      "first_name": "Jane",
      "last_name": "Smith",
      "email": "jane@example.com",
      "phone": "+442079460958",
      "country": "GB",
      "city": "London",
      "bot_score": 2,
      "allowed": 1,
      "created_at": "2024-11-12T19:45:00Z"
    }
  ]
}
```

**Fields returned:**

| Field | Type | Description |
|-------|------|-------------|
| id | number | Submission ID |
| first_name | string | User's first name |
| last_name | string | User's last name |
| email | string | User's email (normalized) |
| phone | string | User's phone (E.164 format) |
| country | string | Country code (from IP) |
| city | string \| null | City name |
| bot_score | number \| null | Bot Management score (Enterprise) |
| allowed | boolean | Whether submission was allowed |
| created_at | string | ISO 8601 timestamp |

**Ordering:** Most recent first (ORDER BY created_at DESC)

#### cURL Example

```bash
# Get first 10 submissions
curl 'https://form.erfi.dev/api/analytics/submissions?limit=10'

# Get page 2
curl 'https://form.erfi.dev/api/analytics/submissions?limit=10&offset=10'
```

#### JavaScript Example

```javascript
// Load initial page
const response = await fetch('/api/analytics/submissions?limit=20');
const { data } = await response.json();

// Load next page
const nextPage = await fetch('/api/analytics/submissions?limit=20&offset=20');
const { data: moreData } = await nextPage.json();
```

---

### GET /api/analytics/countries

Get submission counts by country.

**Location:** `/src/routes/analytics.ts`

#### Request

**Headers:** None required

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
curl https://form.erfi.dev/api/analytics/countries
```

#### JavaScript Example

```javascript
const response = await fetch('/api/analytics/countries');
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

**Headers:** None required

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
curl https://form.erfi.dev/api/analytics/bot-scores
```

#### JavaScript Example

```javascript
const response = await fetch('/api/analytics/bot-scores');
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

Get time-series data for trend visualization with 6 metrics across 4 intervals.

**Location:** `/src/routes/analytics.ts`

#### Request

**Headers:**
```
X-API-KEY: your_api_key_here
```

**Query parameters:**

| Parameter | Type | Required | Description | Valid Values |
|-----------|------|----------|-------------|--------------|
| metric | string | Yes | Metric to retrieve | submissions, validations, validation_success_rate, bot_score_avg, risk_score_avg, allowed_rate |
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
- 5+ submissions in 7 days: +30 risk
- 10+ submissions in 7 days: +40 risk
- 10+ validations in 1 hour: +25 risk
- 3+ submissions from different IPs (proxy rotation): +40 risk
- Block threshold: risk_score ≥ 70

---

### GET /api/health

Health check endpoint.

**Location:** `/src/index.ts`

#### Request

**Headers:** None required

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

**Why each header:**
- `X-Content-Type-Options`: Prevents MIME sniffing attacks
- `X-Frame-Options`: Prevents clickjacking
- `X-XSS-Protection`: Enables browser XSS filter
- `Referrer-Policy`: Controls referrer information
- `Permissions-Policy`: Restricts browser features
- `Content-Security-Policy`: Prevents XSS and injection attacks

## Request ID Tracking

**Not implemented** but recommended for production:

```typescript
// Middleware to add request ID
app.use('*', async (c, next) => {
  const requestId = crypto.randomUUID();
  c.set('requestId', requestId);
  c.header('X-Request-ID', requestId);
  await next();
});

// Include in error responses
return c.json({
  success: false,
  message: 'Internal server error',
  requestId: c.get('requestId'),
}, 500);
```

**Benefits:**
- Correlate logs across systems
- Debug specific requests
- Support tickets reference
- Distributed tracing

## API Versioning

**Current:** No versioning (v1 implicit)

**For future:**
```typescript
// URL versioning
app.route('/api/v1/submissions', submissionsV1);
app.route('/api/v2/submissions', submissionsV2);

// Header versioning
const version = c.req.header('API-Version') || 'v1';
```

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

- [FORM-VALIDATION.md](./FORM-VALIDATION.md) - Input validation details
- [TURNSTILE.md](./TURNSTILE.md) - Turnstile verification
- [FRAUD-DETECTION.md](./FRAUD-DETECTION.md) - Fraud detection algorithm
- [DATABASE-SCHEMA.md](./DATABASE-SCHEMA.md) - Database structure
- [GEOLOCATION.md](./GEOLOCATION.md) - Geolocation system
