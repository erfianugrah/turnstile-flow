# Erfid (Erfi ID) Tracking System

## Overview

**Erfid** is a customizable request tracking system that enables correlation of events across the entire request lifecycle in Forminator.

**Status**: 🚧 In Development (Branch: `feat/ray-id-tracking`)

---

## Problem Solved

### Before Erfid:
- **Data Integrity Confusion**: 35 validation records, but unclear relationship between validations, submissions, and blocks
- **No Correlation**: Cannot trace a single request through validation → fraud check → submission/block
- **Analytics Confusion**: Counts don't align (35 validations, 10 submissions, 25 blocked - but how are they related?)
- **Debugging Difficulty**: Cannot see full history of a blocked request

### With Erfid:
- **Single Source of Truth**: One erfid tracks entire request lifecycle
- **Complete Audit Trail**: See all events (validation, fraud checks, blocks) for a single request
- **Accurate Analytics**: Count unique requests, not just records
- **Easy Debugging**: Query by erfid to see everything that happened

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                       Request Lifecycle                           │
│                                                                   │
│  erfid: erf_550e8400-e29b-41d4-a716-446655440000                 │
│    │                                                              │
│    ├─→ turnstile_validations.erfid                               │
│    │   - Every validation attempt logged                         │
│    │   - success=1: Turnstile passed                             │
│    │   - Links to submission via erfid + submission_id           │
│    │                                                              │
│    ├─→ submissions.erfid (if allowed)                            │
│    │   - Only successful submissions (risk_score < 70)           │
│    │   - Primary record for allowed request                      │
│    │                                                              │
│    └─→ fraud_blacklist.erfid (if blocked)                        │
│        - Block events from all fraud layers (0-5)                │
│        - Tracks which erfid caused the block                     │
└──────────────────────────────────────────────────────────────────┘
```

---

## Customization

Erfid is fully customizable to fit your needs:

### Configuration Options

```jsonc
{
  "ERFID_CONFIG": {
    // Custom prefix for IDs (default: "erf")
    "prefix": "myapp",

    // ID format: "uuid" | "nano" | "custom" (default: "uuid")
    "format": "uuid",

    // Include timestamp in ID (default: false)
    "includeTimestamp": true
  }
}
```

### ID Formats

**1. UUID (default)**
```
erf_550e8400-e29b-41d4-a716-446655440000
```
- Standard UUID v4
- 36 characters (without prefix)
- Globally unique, collision-resistant

**2. Nano ID**
```
erf_V1StGXR8_Z5jdHi6B-myT
```
- Shorter alternative (21 chars)
- URL-safe alphabet
- Still highly unique

**3. Custom Prefix**
```
myapp_550e8400-e29b-41d4-a716-446655440000
```
- Use your own brand/app name
- Helps identify source in logs

**4. With Timestamp**
```
erf_1700000000000_550e8400-e29b-41d4-a716-446655440000
```
- Includes millisecond timestamp
- Enables time-based sorting/filtering

---

## Configuration

### Via wrangler.jsonc

```jsonc
{
  "vars": {
    "ERFID_CONFIG": {
      "prefix": "form",
      "format": "uuid"
    }
  }
}
```

### Via Cloudflare Dashboard

1. Navigate to: Workers & Pages → forminator → Settings → Variables
2. Add variable: `ERFID_CONFIG`
3. Value: `{"prefix":"form","format":"uuid"}`

### Via wrangler CLI

```bash
wrangler secret put ERFID_CONFIG
# Paste JSON: {"prefix":"form","format":"uuid"}
```

---

## Database Schema

### Migration 0001: Add Erfid Tracking

```sql
-- Add erfid column to all tracking tables
ALTER TABLE submissions ADD COLUMN erfid TEXT;
ALTER TABLE turnstile_validations ADD COLUMN erfid TEXT;
ALTER TABLE fraud_blacklist ADD COLUMN erfid TEXT;

-- Create indexes for fast lookups
CREATE INDEX idx_submissions_erfid ON submissions(erfid);
CREATE INDEX idx_validations_erfid ON turnstile_validations(erfid);
CREATE INDEX idx_blacklist_erfid ON fraud_blacklist(erfid);
```

**Apply Migration:**
```bash
wrangler d1 migrations apply DB --remote
```

---

## Implementation Status

### ✅ Completed

1. **Core Implementation**
   - `src/lib/erfid.ts`: Full erfid generation and validation system
   - Supports UUID, Nano ID, custom formats
   - Configurable prefix and timestamp
   - Validation and parsing utilities

2. **Database Schema**
   - Migration 0001: Add erfid columns to all tables
   - Indexes for fast lookups
   - Backward compatible (nullable for existing records)

3. **Type Definitions**
   - `ErfidConfig` interface for configuration
   - Added `ERFID_CONFIG` to `Env` interface
   - TypeScript support throughout

4. **Configuration System**
   - Environment variable support
   - Global configuration management
   - JSON parsing for config

### 🚧 In Progress

5. **Worker Integration**
   - Initialize erfid config on worker startup
   - Generate erfid for each request
   - Pass erfid through all operations

6. **Database Operations**
   - Update `createSubmission()` to store erfid
   - Update `logValidation()` to store erfid
   - Update blacklist writes to store erfid

7. **Analytics Queries**
   - Update analytics to group by erfid
   - Show unique requests vs total records
   - Add erfid-based filtering/search

### ⏳ Pending

8. **Testing**
   - End-to-end erfid tracking tests
   - Verify correlation across tables
   - Test custom configurations

9. **Documentation**
   - API documentation updates
   - Analytics guide updates
   - Configuration examples

---

## Usage Examples

### Generate Erfid

```typescript
import { generateErfid } from './lib/erfid';

// Default (UUID with "erf" prefix)
const erfid = generateErfid();
// Result: "erf_550e8400-e29b-41d4-a716-446655440000"

// Custom prefix
const erfid = generateErfid({ prefix: 'myapp' });
// Result: "myapp_550e8400-e29b-41d4-a716-446655440000"

// Nano ID (shorter)
const erfid = generateErfid({ format: 'nano' });
// Result: "erf_V1StGXR8_Z5jdHi6B-myT"

// With timestamp
const erfid = generateErfid({ includeTimestamp: true });
// Result: "erf_1700000000000_550e8400-e29b-41d4-a716-446655440000"
```

### Query by Erfid

```sql
-- Get all events for a specific request
SELECT 'validation' as event, id, success, risk_score, created_at
FROM turnstile_validations
WHERE erfid = 'erf_550e8400-e29b-41d4-a716-446655440000'

UNION ALL

SELECT 'submission', id, NULL, NULL, created_at
FROM submissions
WHERE erfid = 'erf_550e8400-e29b-41d4-a716-446655440000'

UNION ALL

SELECT 'block', id, NULL, NULL, created_at
FROM fraud_blacklist
WHERE erfid = 'erf_550e8400-e29b-41d4-a716-446655440000'

ORDER BY created_at;
```

---

## Analytics Improvements

### Before

```
Total Validations: 35
Submissions: 10
Blocked Events: ?? (unclear)
```

### After

```
Unique Requests (by erfid): 35
├─ Allowed (submissions): 10
└─ Blocked (no submission): 25
   ├─ Layer 0 (Pre-validation): 5
   ├─ Layer 1 (Email fraud): 8
   ├─ Layer 2 (Ephemeral ID): 7
   ├─ Layer 3 (IP diversity): 3
   └─ Layer 4 (JA4 hopping): 2
```

---

## Related Documentation

- [FRAUD-DETECTION.md](./FRAUD-DETECTION.md) - Fraud detection system overview
- [API-REFERENCE.md](./API-REFERENCE.md) - API endpoints and schemas
- [DATABASE-OPERATIONS.md](./DATABASE-OPERATIONS.md) - Database management guide
- [CONFIGURATION-SYSTEM.md](./CONFIGURATION-SYSTEM.md) - Configuration guide

---

## Future Enhancements

1. **Erfid-based Rate Limiting**: Rate limit by erfid instead of IP
2. **Request Replay Detection**: Detect same erfid used multiple times (suspicious)
3. **Erfid Expiration**: Auto-expire old erfids from analytics
4. **Cross-Service Tracking**: Use erfid across multiple workers (forminator ↔ markov-mail)
5. **Erfid in Response Headers**: Return erfid to client for debugging

---

## Migration Guide

### For New Deployments

```bash
# 1. Initialize database with migration
wrangler d1 migrations apply DB --remote

# 2. Deploy worker
npm run deploy
```

### For Existing Deployments

```bash
# 1. Back up database (recommended)
wrangler d1 execute DB --command="SELECT * FROM submissions" --remote > backup.json

# 2. Apply migration (adds nullable erfid column)
wrangler d1 migrations apply DB --remote

# 3. Deploy new worker code
npm run deploy

# 4. Verify erfid is being generated
wrangler d1 execute DB --command="SELECT erfid FROM submissions WHERE erfid IS NOT NULL LIMIT 5" --remote
```

**Note**: Existing records will have `erfid = NULL`. Only new requests will have erfids. This is intentional for backward compatibility.

---

## Troubleshooting

### Issue: Erfid is NULL in database

**Cause**: Old records created before migration

**Solution**: This is expected. New records will have erfids. To clean up old records:
```sql
-- Count records without erfid
SELECT COUNT(*) FROM submissions WHERE erfid IS NULL;

-- Optional: Delete old test records
DELETE FROM submissions WHERE erfid IS NULL AND created_at < datetime('now', '-7 days');
```

### Issue: Custom prefix not working

**Check configuration:**
```bash
# View current config
wrangler secret list

# Update ERFID_CONFIG
wrangler secret put ERFID_CONFIG
# Paste: {"prefix":"myapp"}
```

### Issue: Analytics showing duplicate counts

**Cause**: Query not grouping by erfid

**Solution**: Update analytics queries to use `COUNT(DISTINCT erfid)` instead of `COUNT(*)`

---

## Security Considerations

- **Erfid is not secret**: It's a tracking ID, not a security token
- **Don't use for authentication**: Use proper authentication tokens
- **Don't expose in public URLs**: Erfid in logs/database only, not in client-facing URLs
- **Rate limiting**: Consider rate limiting by erfid to prevent abuse

---

## Version History

- **v1.1.0** (2025-11-17): Initial erfid implementation with customization support
