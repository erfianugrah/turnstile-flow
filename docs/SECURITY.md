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

### Multi-Layer Detection System

**Layer 1 - Submission Check (24h window)**:
- Blocks 2+ submissions from same ephemeral ID
- Registration forms should only be submitted once per user

**Layer 2 - Validation Attempt Check (1h window)**:
- Blocks 3+ validation attempts from same ephemeral ID
- Catches rapid-fire attacks before database replication

**Layer 3 - IP Diversity Check (24h window)**:
- Blocks 2+ unique IPs for same ephemeral ID
- Detects proxy rotation and distributed attacks

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
- [ ] Set Turnstile secret key via `wrangler secret put`
- [ ] Configure CORS origins for production domains
- [ ] Initialize D1 schema with proper indexes
- [ ] Test Turnstile widget on production domain
- [ ] Verify CSP headers allow Turnstile iframe
- [ ] Monitor logs for security events
- [ ] Review fraud detection thresholds
- [ ] Test rate limiting configuration
- [ ] Validate all endpoints require proper authentication

## References

- [FRAUD-DETECTION.md](./FRAUD-DETECTION.md) - Detailed fraud detection strategy
- [API-REFERENCE.md](./API-REFERENCE.md) - Complete API documentation
- [DATABASE-OPERATIONS.md](./DATABASE-OPERATIONS.md) - Database management guide
