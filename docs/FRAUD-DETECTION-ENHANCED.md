# Enhanced Fraud Detection with D1 and Ephemeral IDs

**Date:** 2025-11-13
**Status:** Implementation Proposal
**Related:** FRAUD-DETECTION-RESEARCH.md

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Current Flow Analysis](#current-flow-analysis)
3. [Proposed 3-Layer Strategy](#proposed-3-layer-strategy)
4. [Implementation Details](#implementation-details)
5. [Database Schema Changes](#database-schema-changes)
6. [Performance Considerations](#performance-considerations)
7. [Implementation Roadmap](#implementation-roadmap)

---

## Executive Summary

### Problem Statement

Current fraud detection happens **AFTER** Turnstile validation, wasting API calls and compute on known bad actors. We need a multi-layered approach that:

1. **Blocks known fraudsters before validation** (saves API calls)
2. **Uses Turnstile response signals** (bot scores, detection IDs)
3. **Implements research findings** (velocity weighting, form fingerprinting)
4. **Maintains D1 blocklist** for repeat offenders

### Proposed Solution: 3-Layer Defense

```
┌─────────────────────────────────────────────────────────────┐
│ Layer 1: Pre-Validation Blocking (Fast Path)               │
│ - Check D1 for blacklisted ephemeral IDs/IPs               │
│ - < 10ms query time, blocks before Turnstile API call      │
│ - Reduces 90%+ of fraud attempts                           │
└─────────────────────────────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────┐
│ Layer 2: Turnstile Validation & Signal Extraction          │
│ - Validate token with Cloudflare                           │
│ - Extract ephemeral ID, bot score, detection IDs           │
│ - Check token replay                                        │
└─────────────────────────────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────┐
│ Layer 3: Advanced Fraud Analysis (Research-Based)          │
│ - Velocity weighting (recent = higher risk)                │
│ - Form field fingerprinting                                │
│ - Geographic velocity analysis                             │
│ - Risk score tiering (0-100 scale)                         │
│ - Update D1 blocklist for future requests                  │
└─────────────────────────────────────────────────────────────┘
```

### Expected Impact

| Metric | Current | Enhanced | Improvement |
|--------|---------|----------|-------------|
| API calls saved | 0% | 85-90% | Huge cost reduction |
| Block latency | ~150ms | ~10ms | 15x faster |
| False positives | Unknown | < 5% | Better UX |
| Catch rate | ~60% | 85%+ | 25% more bots caught |

---

## Current Flow Analysis

### Location
- `src/routes/submissions.ts:18-199` - Request handler
- `src/lib/turnstile.ts:122-265` - Fraud detection logic

### Current Flow (Detailed)

```typescript
// Step 1: Parse request (~5ms)
const body = await c.req.json();
const metadata = extractRequestMetadata(cfRequest);

// Step 2: Token reuse check (~10ms D1 query)
const tokenHash = hashToken(turnstileToken);
const isReused = await checkTokenReuse(tokenHash, db);
if (isReused) return 400;

// Step 3: Turnstile validation (~100-200ms API call)
const validation = await validateTurnstileToken(token, remoteIp, secretKey);
if (!validation.valid) return 400;

// Step 4: Fraud detection (~20-30ms D1 queries)
if (validation.ephemeralId) {
  fraudCheck = await checkEphemeralIdFraud(validation.ephemeralId, db);
} else {
  fraudCheck = await checkIpFraud(metadata.remoteIp, db);
}
if (!fraudCheck.allowed) return 429;

// Step 5: Create submission (~20ms D1 write)
const submissionId = await createSubmission(db, ...);
```

**Total Latency:** ~155-270ms per request

### Problems with Current Flow

1. **Turnstile API Called for Known Bad Actors**
   - Wastes ~100-200ms per request
   - Costs money (API calls)
   - Known fraudsters should be blocked immediately

2. **No Ephemeral ID Blacklist**
   - If ephemeral ID is blocked once, why check again?
   - Should cache block decision for fast rejection

3. **Fraud Check After Validation**
   - Validation is expensive operation
   - Fraud check should inform whether to validate

4. **Simple Threshold Detection**
   - Doesn't implement research findings
   - No velocity weighting
   - No form fingerprinting
   - No geographic analysis

5. **No Signal Extraction**
   - Bot scores not used
   - Detection IDs ignored
   - JA4 fingerprints not tracked

---

## Proposed 3-Layer Strategy

### Layer 1: Pre-Validation Blocking (Fast Path)

**Goal:** Block known bad actors BEFORE expensive Turnstile validation

**Implementation:**

```typescript
// New function in src/lib/turnstile.ts
export async function checkPreValidationBlock(
  ephemeralId: string | null,
  remoteIp: string,
  db: D1Database
): Promise<{blocked: boolean, reason?: string, cacheFor?: number}> {

  // Check ephemeral ID blacklist (if available)
  if (ephemeralId) {
    const blacklistCheck = await db
      .prepare(`
        SELECT block_reason, expires_at
        FROM fraud_blacklist
        WHERE ephemeral_id = ? AND expires_at > datetime('now')
        LIMIT 1
      `)
      .bind(ephemeralId)
      .first<{block_reason: string, expires_at: string}>();

    if (blacklistCheck) {
      logger.warn({ephemeralId}, 'Blocked by ephemeral ID blacklist');
      return {
        blocked: true,
        reason: blacklistCheck.block_reason,
        cacheFor: 3600 // 1 hour
      };
    }
  }

  // Check IP blacklist
  const ipBlacklistCheck = await db
    .prepare(`
      SELECT block_reason, expires_at
      FROM fraud_blacklist
      WHERE remote_ip = ? AND expires_at > datetime('now')
      LIMIT 1
    `)
    .bind(remoteIp)
    .first<{block_reason: string, expires_at: string}>();

  if (ipBlacklistCheck) {
    logger.warn({remoteIp}, 'Blocked by IP blacklist');
    return {
      blocked: true,
      reason: ipBlacklistCheck.block_reason,
      cacheFor: 3600
    };
  }

  return {blocked: false};
}
```

**Database Table:**

```sql
CREATE TABLE IF NOT EXISTS fraud_blacklist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ephemeral_id TEXT,
  remote_ip TEXT,
  block_reason TEXT NOT NULL,
  risk_score INTEGER NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL, -- Blocks are temporary (24-72 hours)

  -- Indexes for fast lookup
  UNIQUE(ephemeral_id, remote_ip)
);

CREATE INDEX idx_blacklist_ephemeral
ON fraud_blacklist(ephemeral_id, expires_at)
WHERE ephemeral_id IS NOT NULL;

CREATE INDEX idx_blacklist_ip
ON fraud_blacklist(remote_ip, expires_at);
```

**Usage in submissions.ts:**

```typescript
app.post('/', async (c) => {
  // Extract metadata
  const metadata = extractRequestMetadata(cfRequest);

  // LAYER 1: Pre-validation blocking (~10ms)
  const preBlock = await checkPreValidationBlock(
    null, // Don't know ephemeral ID yet
    metadata.remoteIp,
    db
  );

  if (preBlock.blocked) {
    logger.warn({remoteIp: metadata.remoteIp}, 'Blocked before validation');
    return c.json(
      {
        error: 'Request blocked',
        message: 'Too many failed attempts. Try again later.'
      },
      429,
      {'Retry-After': preBlock.cacheFor?.toString() || '3600'}
    );
  }

  // Continue with token reuse check, validation, etc.
  // ...
});
```

**Benefits:**
- ⚡ **10ms vs 150ms** - 15x faster rejection
- 💰 **Saves API calls** - No Turnstile validation for known attackers
- 🔒 **Reduces load** - Blocks distributed attacks early

---

### Layer 2: Turnstile Validation & Signal Extraction

**Goal:** Extract all available signals from Turnstile response

**Enhanced validateTurnstileToken():**

```typescript
export interface TurnstileSignals {
  ephemeralId: string | null;
  botScore: number | null;          // Enterprise: 1-99
  detectionIds: string[] | null;    // Enterprise: [50331648, 50331649, 50331651]
  ja3Hash: string | null;            // Enterprise: TLS fingerprint
  ja4Hash: string | null;            // Enterprise: Enhanced fingerprint
  action: string | null;             // Widget action
  cdata: string | null;              // Custom data
}

export async function validateTurnstileToken(
  token: string,
  remoteIp: string,
  secretKey: string
): Promise<TurnstileValidationResult & {signals?: TurnstileSignals}> {

  // ... existing validation logic ...

  // Extract ALL available signals
  const signals: TurnstileSignals = {
    ephemeralId: result.metadata?.ephemeral_id || null,
    botScore: result.metadata?.bot_score || null,
    detectionIds: result.metadata?.detection_ids || null,
    ja3Hash: result.metadata?.ja3_hash || null,
    ja4Hash: result.metadata?.ja4_hash || null,
    action: result.action || null,
    cdata: result.cdata || null,
  };

  return {
    valid: true,
    data: result,
    ephemeralId: signals.ephemeralId,
    signals
  };
}
```

**Note:** Bot scores, detection IDs, and JA3/JA4 require Enterprise Bot Management

---

### Layer 3: Advanced Fraud Analysis

**Goal:** Implement research findings for sophisticated detection

#### 3.1 Velocity Weighting

**Problem:** Current system treats all submissions equally (5 submissions in 1 hour = 5 submissions in 7 days)

**Solution:** Weight recent activity higher

```typescript
export async function checkEphemeralIdFraudEnhanced(
  ephemeralId: string,
  db: D1Database,
  signals?: TurnstileSignals
): Promise<FraudCheckResult> {

  const warnings: string[] = [];
  let riskScore = 0;

  // Get all submissions in last 7 days WITH timestamps
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const submissions = await db
    .prepare(`
      SELECT created_at
      FROM submissions
      WHERE ephemeral_id = ? AND created_at > ?
      ORDER BY created_at DESC
    `)
    .bind(ephemeralId, sevenDaysAgo)
    .all<{created_at: string}>();

  // Apply velocity weighting
  const now = Date.now();
  let weightedScore = 0;

  for (const sub of submissions.results) {
    const ageHours = (now - new Date(sub.created_at).getTime()) / (1000 * 3600);

    if (ageHours < 1) {
      weightedScore += 3;  // Recent: 3x weight
    } else if (ageHours < 24) {
      weightedScore += 2;  // Medium: 2x weight
    } else {
      weightedScore += 1;  // Old: 1x weight
    }
  }

  // Risk calculation based on weighted score
  if (weightedScore >= 15) {
    warnings.push('High velocity attack detected');
    riskScore += 50;
  } else if (weightedScore >= 10) {
    warnings.push('Elevated activity');
    riskScore += 30;
  } else if (weightedScore >= 5) {
    warnings.push('Moderate activity');
    riskScore += 15;
  }

  // Factor in bot score (if available)
  if (signals?.botScore !== null) {
    if (signals.botScore < 30) {
      warnings.push('Low bot score (likely automated)');
      riskScore += 40;
    } else if (signals.botScore < 60) {
      warnings.push('Suspicious bot score');
      riskScore += 20;
    }
  }

  // Check for residential proxy detection (ID 50331651)
  if (signals?.detectionIds?.includes('50331651')) {
    warnings.push('Residential proxy detected');
    riskScore += 30;
  }

  // Determine block threshold with tiers
  let allowed = true;
  let blockReason: string | undefined;

  if (riskScore >= 100) {
    allowed = false;
    blockReason = 'Critical risk - automated attack';
  } else if (riskScore >= 80) {
    allowed = false;
    blockReason = 'High risk - likely fraud';
  } else if (riskScore >= 60) {
    // Soft block - could implement challenge here
    warnings.push('Warning threshold reached');
  }

  return {
    allowed,
    reason: blockReason,
    riskScore,
    warnings
  };
}
```

#### 3.2 Form Field Fingerprinting

**Problem:** Attackers reuse similar form data (email patterns, sequential phones)

**Solution:** Track form patterns per ephemeral ID

```typescript
export async function analyzeFormEntropy(
  ephemeralId: string,
  formData: {email: string, phone: string, firstName: string, lastName: string},
  db: D1Database
): Promise<{riskScore: number, warnings: string[]}> {

  let riskScore = 0;
  const warnings: string[] = [];

  // Get recent submissions for this ephemeral ID
  const recentSubmissions = await db
    .prepare(`
      SELECT email, phone, first_name, last_name
      FROM submissions
      WHERE ephemeral_id = ?
      ORDER BY created_at DESC
      LIMIT 10
    `)
    .bind(ephemeralId)
    .all<{email: string, phone: string, first_name: string, last_name: string}>();

  if (recentSubmissions.results.length === 0) {
    return {riskScore: 0, warnings: []};
  }

  const emails = recentSubmissions.results.map(s => s.email);
  const phones = recentSubmissions.results.map(s => s.phone);

  // Check 1: Same email, different names
  if (emails.includes(formData.email)) {
    const sameEmailDifferentName = recentSubmissions.results.some(
      s => s.email === formData.email &&
           (s.first_name !== formData.firstName || s.last_name !== formData.lastName)
    );

    if (sameEmailDifferentName) {
      warnings.push('Email reused with different names');
      riskScore += 25;
    }
  }

  // Check 2: Similar emails (Levenshtein distance)
  const similarEmails = emails.filter(e =>
    levenshteinDistance(e, formData.email) <= 2 && e !== formData.email
  );

  if (similarEmails.length > 0) {
    warnings.push('Similar email patterns detected');
    riskScore += 20;
  }

  // Check 3: Sequential phone numbers
  const phoneNumbers = phones.map(p => p.replace(/\D/g, '')); // Remove non-digits
  const currentPhone = formData.phone.replace(/\D/g, '');

  if (areSequential(phoneNumbers.concat(currentPhone))) {
    warnings.push('Sequential phone numbers detected');
    riskScore += 20;
  }

  return {riskScore, warnings};
}

// Helper: Levenshtein distance
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

// Helper: Check if numbers are sequential
function areSequential(numbers: string[]): boolean {
  if (numbers.length < 2) return false;

  const sorted = numbers.map(n => parseInt(n, 10)).sort((a, b) => a - b);

  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] - sorted[i-1] === 1) {
      return true; // Found sequential pair
    }
  }

  return false;
}
```

#### 3.3 Geographic Velocity Analysis

**Problem:** Impossible travel (US → China in 30 seconds) indicates distributed attack

**Solution:** Calculate great-circle distance between submissions

```typescript
export async function analyzeGeographicVelocity(
  ephemeralId: string,
  currentLocation: {latitude: number, longitude: number, country: string},
  db: D1Database
): Promise<{riskScore: number, warnings: string[]}> {

  let riskScore = 0;
  const warnings: string[] = [];

  // Get most recent submission with location
  const lastSubmission = await db
    .prepare(`
      SELECT latitude, longitude, country, created_at
      FROM submissions
      WHERE ephemeral_id = ? AND latitude IS NOT NULL AND longitude IS NOT NULL
      ORDER BY created_at DESC
      LIMIT 1
    `)
    .bind(ephemeralId)
    .first<{latitude: number, longitude: number, country: string, created_at: string}>();

  if (!lastSubmission) {
    return {riskScore: 0, warnings: []};
  }

  // Calculate distance in kilometers
  const distance = greatCircleDistance(
    lastSubmission.latitude,
    lastSubmission.longitude,
    currentLocation.latitude,
    currentLocation.longitude
  );

  // Calculate time elapsed in hours
  const timeElapsed = (Date.now() - new Date(lastSubmission.created_at).getTime()) / (1000 * 3600);

  // Check for impossible travel (max speed: 1000 km/h = airplane)
  const maxPossibleSpeed = 1000; // km/h

  if (distance > (maxPossibleSpeed * timeElapsed)) {
    warnings.push(`Impossible travel: ${distance.toFixed(0)}km in ${timeElapsed.toFixed(1)}h`);
    riskScore += 30;
  }

  // Check for country changes (suspicious even if possible)
  if (lastSubmission.country !== currentLocation.country && timeElapsed < 24) {
    warnings.push('Country changed within 24 hours');
    riskScore += 15;
  }

  return {riskScore, warnings};
}

// Helper: Great-circle distance (Haversine formula)
function greatCircleDistance(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const R = 6371; // Earth radius in kilometers
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distance in kilometers
}

function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}
```

#### 3.4 Update Blacklist Based on Risk

**After fraud analysis, update D1 blacklist for future pre-validation blocking:**

```typescript
async function updateBlacklistIfNeeded(
  ephemeralId: string | null,
  remoteIp: string,
  riskScore: number,
  blockReason: string | undefined,
  db: D1Database
): Promise<void> {

  // Only blacklist if risk score is very high
  if (riskScore < 80) return;

  // Determine block duration based on risk
  let blockHours = 24; // Default: 24 hours

  if (riskScore >= 100) {
    blockHours = 72; // Critical: 72 hours
  } else if (riskScore >= 90) {
    blockHours = 48; // High: 48 hours
  }

  const expiresAt = new Date(Date.now() + blockHours * 60 * 60 * 1000).toISOString();

  // Insert into blacklist
  await db
    .prepare(`
      INSERT OR REPLACE INTO fraud_blacklist
      (ephemeral_id, remote_ip, block_reason, risk_score, expires_at)
      VALUES (?, ?, ?, ?, ?)
    `)
    .bind(ephemeralId, remoteIp, blockReason || 'High risk activity', riskScore, expiresAt)
    .run();

  logger.info(
    {ephemeralId, remoteIp, riskScore, blockHours},
    'Added to fraud blacklist'
  );
}
```

---

## Database Schema Changes

### New Tables

```sql
-- Fraud blacklist for pre-validation blocking
CREATE TABLE IF NOT EXISTS fraud_blacklist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ephemeral_id TEXT,
  remote_ip TEXT,
  block_reason TEXT NOT NULL,
  risk_score INTEGER NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,

  UNIQUE(ephemeral_id, remote_ip)
);

CREATE INDEX idx_blacklist_ephemeral
ON fraud_blacklist(ephemeral_id, expires_at)
WHERE ephemeral_id IS NOT NULL;

CREATE INDEX idx_blacklist_ip
ON fraud_blacklist(remote_ip, expires_at);

-- Track Turnstile signals for analysis
CREATE TABLE IF NOT EXISTS turnstile_signals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ephemeral_id TEXT,
  bot_score INTEGER,
  detection_ids TEXT, -- JSON array
  ja3_hash TEXT,
  ja4_hash TEXT,
  action TEXT,
  remote_ip TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_signals_ephemeral
ON turnstile_signals(ephemeral_id, created_at DESC);

CREATE INDEX idx_signals_ja4
ON turnstile_signals(ja4_hash, created_at DESC)
WHERE ja4_hash IS NOT NULL;
```

### Schema Additions to Existing Tables

```sql
-- Add columns to submissions table
ALTER TABLE submissions
ADD COLUMN bot_score INTEGER;

ALTER TABLE submissions
ADD COLUMN detection_ids TEXT; -- JSON array

ALTER TABLE submissions
ADD COLUMN ja4_hash TEXT;

-- Add indexes for new columns
CREATE INDEX idx_submissions_bot_score
ON submissions(bot_score)
WHERE bot_score IS NOT NULL;

CREATE INDEX idx_submissions_ja4
ON submissions(ja4_hash, created_at DESC)
WHERE ja4_hash IS NOT NULL;
```

---

## Performance Considerations

### Query Optimization

**Current:**
```sql
-- checkEphemeralIdFraud: 2 queries (~30ms total)
SELECT COUNT(*) FROM submissions WHERE ephemeral_id = ? AND created_at > ?
SELECT COUNT(*) FROM turnstile_validations WHERE ephemeral_id = ? AND created_at > ?
```

**Enhanced:**
```sql
-- Pre-validation block: 1 query (~10ms)
SELECT block_reason, expires_at FROM fraud_blacklist
WHERE (ephemeral_id = ? OR remote_ip = ?) AND expires_at > datetime('now')
LIMIT 1

-- Advanced fraud analysis: 1 query with full data (~25ms)
SELECT created_at, email, phone, latitude, longitude, country
FROM submissions
WHERE ephemeral_id = ?
ORDER BY created_at DESC
LIMIT 10
```

### D1 Eventually Consistent

**Challenge:** D1 is eventually consistent (writes may not be immediately visible)

**Solution:**
- Pre-validation blacklist tolerates stale reads (attacker gets 1-2 extra tries)
- Not a problem since blocks are based on patterns, not single events
- Fresh fraud check still happens at Layer 3

### Caching Strategy

**Ephemeral ID Blacklist:**
```typescript
// Cache blacklist checks in Worker KV for 1 hour
const cacheKey = `blacklist:${ephemeralId || remoteIp}`;
const cached = await c.env.KV?.get(cacheKey);

if (cached) {
  return JSON.parse(cached);
}

const result = await checkPreValidationBlock(ephemeralId, remoteIp, db);

if (result.blocked) {
  await c.env.KV?.put(cacheKey, JSON.stringify(result), {
    expirationTtl: result.cacheFor || 3600
  });
}
```

---

## Implementation Roadmap

### Phase 1: Pre-Validation Blocking (1-2 days)

**Priority:** HIGH - Saves API calls immediately

1. Create `fraud_blacklist` table
2. Implement `checkPreValidationBlock()`
3. Add pre-validation check to submissions route
4. Implement `updateBlacklistIfNeeded()`
5. Test with known bad actors

**Files to modify:**
- `src/lib/database.ts` - Add blacklist table
- `src/lib/turnstile.ts` - Add pre-validation function
- `src/routes/submissions.ts` - Add Layer 1 check
- `schema.sql` - Add table definitions

### Phase 2: Velocity Weighting (1 day)

**Priority:** HIGH - Major accuracy improvement

1. Refactor `checkEphemeralIdFraud()` to fetch full timestamps
2. Implement velocity weighting algorithm
3. Test with historical data
4. Adjust risk thresholds based on results

**Files to modify:**
- `src/lib/turnstile.ts` - Enhance fraud check

### Phase 3: Form Fingerprinting (2 days)

**Priority:** HIGH - Catches repeat attackers

1. Implement `analyzeFormEntropy()`
2. Add Levenshtein distance helper
3. Integrate into fraud check flow
4. Add form pattern analytics to dashboard

**Files to modify:**
- `src/lib/turnstile.ts` - Add form analysis
- `src/routes/submissions.ts` - Integrate check

### Phase 4: Geographic Velocity (2 days)

**Priority:** MEDIUM - Catches distributed attacks

1. Implement `analyzeGeographicVelocity()`
2. Add great-circle distance calculation
3. Store latitude/longitude in submissions (if not already)
4. Test with multi-location scenarios

**Files to modify:**
- `src/lib/turnstile.ts` - Add geographic analysis

### Phase 5: Signal Extraction (2-3 days)

**Priority:** MEDIUM - Requires Enterprise features

1. Enhance `validateTurnstileToken()` to extract all signals
2. Create `turnstile_signals` table
3. Store bot scores, detection IDs, JA4 hashes
4. Factor signals into risk calculation

**Files to modify:**
- `src/lib/turnstile.ts` - Enhance signal extraction
- `src/lib/database.ts` - Add signals table
- `src/lib/types.ts` - Add signal types

---

## Testing Strategy

### Unit Tests

```typescript
// test/fraud-detection.test.ts
describe('Pre-validation blocking', () => {
  it('should block blacklisted ephemeral ID', async () => {
    // Add to blacklist
    await db.prepare(`
      INSERT INTO fraud_blacklist (ephemeral_id, block_reason, risk_score, expires_at)
      VALUES (?, ?, ?, ?)
    `).bind('bad-id', 'Test block', 100, futureDate).run();

    // Check should block
    const result = await checkPreValidationBlock('bad-id', '1.2.3.4', db);
    expect(result.blocked).toBe(true);
  });
});

describe('Velocity weighting', () => {
  it('should weight recent submissions higher', async () => {
    // Create submissions with timestamps
    // Assert risk score increases for recent activity
  });
});

describe('Form fingerprinting', () => {
  it('should detect similar emails', () => {
    const distance = levenshteinDistance('test@example.com', 'test1@example.com');
    expect(distance).toBe(1);
  });

  it('should detect sequential phones', () => {
    const phones = ['5551234567', '5551234568', '5551234569'];
    expect(areSequential(phones)).toBe(true);
  });
});
```

### Integration Tests

```bash
# Stress test with curl
for i in {1..20}; do
  curl -X POST http://localhost:8787/api/submissions \
    -H "Content-Type: application/json" \
    -d '{"turnstileToken": "test-token", ...}'
done

# Should block after threshold
```

---

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| **API Call Reduction** | 85-90% | Monitor Turnstile API calls before/after |
| **Block Latency** | < 15ms | Log pre-validation check times |
| **False Positives** | < 5% | Track legitimate users blocked |
| **Catch Rate** | > 85% | Test with known bot traffic |
| **Database Performance** | < 50ms | Monitor D1 query times |

---

## Next Steps

1. Review this proposal
2. Choose implementation phase (recommend Phase 1 first)
3. Create feature branch
4. Implement pre-validation blocking
5. Test with production traffic
6. Iterate based on results

---

**Document Status:** Implementation Proposal
**Estimated Total Effort:** 8-10 days for all phases
**Recommended Start:** Phase 1 (Pre-Validation Blocking)

