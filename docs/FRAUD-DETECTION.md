# Fraud Detection System

## Table of Contents

1. [System Overview](#system-overview)
2. [Configuration](#configuration)
3. [Complete Request Flow](#complete-request-flow)
4. [Detection Layers](#detection-layers)
5. [Attack Scenarios](#attack-scenarios)
6. [Risk Scoring System](#risk-scoring-system)
7. [Progressive Timeout System](#progressive-timeout-system)
8. [Database Schema](#database-schema)
9. [Performance Characteristics](#performance-characteristics)

---

## System Overview

The fraud detection system uses multi-layer behavioral analysis combined with progressive timeouts to prevent abuse while minimizing false positives.

### Implementation Approach

- Behavior-based detection tracking patterns across time windows (1h, 24h)
- Progressive mitigation with escalating timeouts (1h → 4h → 8h → 12h → 24h)
- Fast-path optimization using pre-validation blacklist
- Fail-open design for service unavailability
- Forensic logging of all attempts for analysis

---

## Configuration

All fraud detection thresholds and risk scoring weights are configurable via environment variables. See [CONFIGURATION-SYSTEM.md](../CONFIGURATION-SYSTEM.md) for:

- Complete configuration reference
- Usage examples and use cases
- A/B testing and fine-tuning guidance
- Deep merge behavior for partial overrides

Default thresholds referenced throughout this document can be customized via the `FRAUD_CONFIG` environment variable.

---

## Complete Request Flow

```mermaid
flowchart TD
    Start([POST /api/submissions<br/>with form + token]) --> ExtractMeta[Extract Request Metadata<br/>IP, Country, JA4, etc.]

    ExtractMeta --> ValidateSchema{Schema<br/>Valid?}
    ValidateSchema -->|No| Block1[❌ 400 Bad Request<br/>Validation Error]

    ValidateSchema -->|Yes| EmailCheck[Layer 1: Email Fraud<br/>Markov-Mail RPC 0.1-0.5ms]
    EmailCheck --> EmailDecision{Email Fraud<br/>Decision}
    EmailDecision -->|block| Block2[❌ 400 Bad Request<br/>Fraudulent Email Pattern]

    EmailDecision -->|allow/warn| HashToken[Hash Token SHA256]
    HashToken --> TokenReplay{Token<br/>Replay?}
    TokenReplay -->|Yes| LogReplay[Log: risk=100<br/>token_replay]
    LogReplay --> Block3[❌ 400 Bad Request<br/>Token Already Used]

    TokenReplay -->|No| Blacklist[Layer 0: Pre-Validation<br/>Blacklist Check]
    Blacklist --> BlacklistHit{In Blacklist?<br/>ephemeral_id<br/>ip_address<br/>ja4}
    BlacklistHit -->|Yes| LogBlacklist[Log: validation attempt<br/>Update last_seen_at]
    LogBlacklist --> Block4[❌ 429 Rate Limit<br/>Wait X hours]

    BlacklistHit -->|No| CallTurnstile[Validate Turnstile<br/>API Call]
    CallTurnstile --> ExtractEID[Extract Ephemeral ID<br/>~7 day lifespan]

    ExtractEID --> EphemeralCheck[Layer 2: Ephemeral ID<br/>Fraud Detection]
    EphemeralCheck --> SubmissionCount{2+ submissions<br/>in 24h?}
    SubmissionCount -->|Yes| AddBlacklist1[Add to Blacklist<br/>Progressive Timeout]
    AddBlacklist1 --> Block5[❌ 429 Rate Limit<br/>Multiple Submissions]

    SubmissionCount -->|No| ValidationCount{3+ validations<br/>in 1h?}
    ValidationCount -->|Yes| AddBlacklist2[Add to Blacklist<br/>Progressive Timeout]
    AddBlacklist2 --> Block6[❌ 429 Rate Limit<br/>Rapid Fire Attack]

    ValidationCount -->|No| IPDiversity{2+ unique IPs<br/>in 24h?}
    IPDiversity -->|Yes| AddBlacklist3[Add to Blacklist<br/>Progressive Timeout]
    AddBlacklist3 --> Block7[❌ 429 Rate Limit<br/>Proxy Rotation]

    IPDiversity -->|No| JA4Check[Layer 4: JA4 Session<br/>Hopping Detection]
    JA4Check --> JA4Layer4a{Layer 4a:<br/>Same IP + JA4<br/>2+ ephemeral IDs?}
    JA4Layer4a -->|Yes| AddBlacklist4a[Add to Blacklist<br/>ephemeral_id + ja4 + ip]
    AddBlacklist4a --> Block8[❌ 429 Rate Limit<br/>Session Hopping]

    JA4Layer4a -->|No| JA4Layer4b{Layer 4b:<br/>Same JA4 globally<br/>3+ IDs in 5min?}
    JA4Layer4b -->|Yes| AddBlacklist4b[Add to Blacklist<br/>ephemeral_id + ja4 + ip]
    AddBlacklist4b --> Block9[❌ 429 Rate Limit<br/>Rapid Network Switch]

    JA4Layer4b -->|No| JA4Layer4c{Layer 4c:<br/>Same JA4 globally<br/>5+ IDs in 1h?}
    JA4Layer4c -->|Yes| AddBlacklist4c[Add to Blacklist<br/>ephemeral_id + ja4 + ip]
    AddBlacklist4c --> Block10[❌ 429 Rate Limit<br/>Distributed Attack]

    JA4Layer4c -->|No| TurnstileValid{Turnstile<br/>Valid?}
    TurnstileValid -->|No| LogFailed[Log: risk=65<br/>turnstile_failed]
    LogFailed --> Block11[❌ 403 Forbidden<br/>CAPTCHA Failed]

    TurnstileValid -->|Yes| DuplicateEmail{Email<br/>Exists?}
    DuplicateEmail -->|Yes| LogDuplicate[Log: risk=60<br/>duplicate_email]
    LogDuplicate --> Block12[❌ 409 Conflict<br/>Email Already Registered]

    DuplicateEmail -->|No| CalculateRisk[Calculate Normalized<br/>Risk Score 0-100]
    CalculateRisk --> CreateSubmission[Create Submission<br/>Store in D1]
    CreateSubmission --> LogSuccess[Log Validation<br/>allowed=true]
    LogSuccess --> Success[✅ 201 Created<br/>Submission ID]

    style Block1 fill:#ff6b6b,stroke:#c92a2a,color:#fff
    style Block2 fill:#ff6b6b,stroke:#c92a2a,color:#fff
    style Block3 fill:#ff6b6b,stroke:#c92a2a,color:#fff
    style Block4 fill:#ff8b1f,stroke:#d66800,color:#fff
    style Block5 fill:#ff8b1f,stroke:#d66800,color:#fff
    style Block6 fill:#ff8b1f,stroke:#d66800,color:#fff
    style Block7 fill:#ff8b1f,stroke:#d66800,color:#fff
    style Block8 fill:#ff8b1f,stroke:#d66800,color:#fff
    style Block9 fill:#ff8b1f,stroke:#d66800,color:#fff
    style Block10 fill:#ff8b1f,stroke:#d66800,color:#fff
    style Block11 fill:#ff6b6b,stroke:#c92a2a,color:#fff
    style Block12 fill:#ff6b6b,stroke:#c92a2a,color:#fff
    style Success fill:#51cf66,stroke:#2f9e44,color:#fff
    style LogReplay fill:#ffd43b,stroke:#f59f00,color:#000
    style LogBlacklist fill:#ffd43b,stroke:#f59f00,color:#000
    style LogFailed fill:#ffd43b,stroke:#f59f00,color:#000
    style LogDuplicate fill:#ffd43b,stroke:#f59f00,color:#000
    style LogSuccess fill:#a3e635,stroke:#65a30d,color:#000
```

---

## Detection Layers

### Layer 0: Pre-Validation Blacklist

Fast-path blocking before expensive Turnstile API calls.

**Implementation** (`src/lib/fraud-prevalidation.ts`):

```sql
SELECT * FROM fraud_blacklist
WHERE (ephemeral_id = ? OR ip_address = ? OR ja4 = ?)
  AND expires_at > datetime('now')
ORDER BY blocked_at DESC
LIMIT 1
```

**Decision Flow**:
- Found → Block immediately (429 Too Many Requests) + update `last_seen_at`
- Not Found → Continue to Turnstile validation

Most repeat offender requests blocked without Turnstile API call.

---

### Token Replay Detection

Prevents wasting Turnstile API calls on replayed tokens.

**Implementation** (`src/lib/turnstile.ts:130-146`):

1. Hash token with SHA256
2. Check `turnstile_validations` table for existing `token_hash`
3. If found → Block before calling Turnstile API
4. Log attempt with risk_score=100 for forensics

Cost optimization: Turnstile's API would reject replayed tokens anyway, but this blocks earlier to save API costs.

Replayed tokens cannot create submissions, so this only appears in validation logs.

---

### Layer 1: Email Fraud Detection

ML-based email pattern analysis using external service.

**Execution Time**: 0.1-0.5ms (Worker-to-Worker RPC)

**Implementation** (`src/lib/email-fraud-detection.ts`):

```typescript
const result = await env.FRAUD_DETECTOR.validate({
  email,
  consumer: 'FORMINATOR',
  flow: 'REGISTRATION'
});
```

**Detection Capabilities**:
- Markov Chain pattern analysis (sequential: user1, user2, user3)
- Out-of-Distribution (OOD) detection for unusual formats
- Disposable domain detection (71K+ domains)
- TLD risk profiling (143 TLDs analyzed)

**Decision Flow**:
- `block` → Reject immediately (before Turnstile validation)
- `warn` → Continue but contribute to risk score (17% weight)
- `allow` → Continue with risk_score=0 for email component
- Service unavailable → Fail open (allows submission)

---

### Layer 2: Ephemeral ID Fraud Detection

Behavioral analysis detecting repeat submissions from same device.

**Time Windows**:
- Submissions: 24h (registration forms typically submit once)
- Validations: 1h (catches rapid-fire before D1 replication)
- IP diversity: 24h (proxy rotation detection)

**Implementation** (`src/lib/turnstile.ts:212-387`):

#### Layer 2a: Submission Count

```sql
SELECT COUNT(*) FROM submissions
WHERE ephemeral_id = ?
  AND created_at > datetime('now', '-24 hours')
```

Threshold: 2+ submissions → Block (registration forms typically submitted once per user)

#### Layer 2b: Validation Frequency

```sql
SELECT COUNT(*) FROM turnstile_validations
WHERE ephemeral_id = ?
  AND created_at > datetime('now', '-1 hour')
```

Threshold: 3+ attempts → Block, 2 attempts → Warning (catches rapid-fire attacks before D1 replication lag)

#### Layer 2c: IP Diversity

```sql
SELECT COUNT(DISTINCT remote_ip) FROM submissions
WHERE ephemeral_id = ?
  AND created_at > datetime('now', '-24 hours')
```

Threshold: 2+ unique IPs → Block (same device from multiple IPs indicates proxy rotation)

Mitigation: Adds `ephemeral_id` to blacklist with progressive timeout.

---

### Layer 4: JA4 Session Hopping Detection

TLS fingerprinting to detect attacks bypassing ephemeral ID tracking by opening incognito/private windows or switching browsers.

JA4 fingerprint tracks the TLS client (browser + OS) which doesn't change when cookies are cleared or incognito mode is used.

**Implementation** (`src/lib/ja4-fraud-detection.ts`):

#### Layer 4a: IP Clustering (1h window)

```sql
SELECT COUNT(DISTINCT ephemeral_id) FROM submissions
WHERE ja4 = ? AND remote_ip IN (same /64 subnet)
  AND created_at > datetime('now', '-1 hour')
```

Threshold: 2+ ephemeral IDs from same IP/subnet + same JA4

Detects: Incognito mode, browser hopping from same location

#### Layer 4b: Rapid Global (5min window, no IP filter)

```sql
SELECT COUNT(DISTINCT ephemeral_id) FROM submissions
WHERE ja4 = ?
  AND created_at > datetime('now', '-5 minutes')
```

Threshold: 3+ ephemeral IDs globally with same JA4

Detects: Aggressive network-switching attacks (VPN hopping, IPv4↔IPv6)

#### Layer 4c: Extended Global (1h window, no IP filter)

```sql
SELECT COUNT(DISTINCT ephemeral_id) FROM submissions
WHERE ja4 = ?
  AND created_at > datetime('now', '-1 hour')
```

Threshold: 5+ ephemeral IDs globally with same JA4

Detects: Slower distributed attacks across networks

**Risk Scoring**:
- JA4 clustering signal: +80 points (primary)
- Rapid velocity (<60min): +60 points
- Global anomaly (high distribution): +50 points
- Bot pattern (high volume): +40 points
- Raw score: 0-230 (normalized to 0-100)

**Mitigation**: Adds three identifiers to blacklist:
- `ephemeral_id` (24h max)
- `ja4` (24h max)
- `ip_address` (progressive timeout)

Subsequent attempts blocked by Layer 0 on any of the three identifiers.

---

## Attack Scenarios

### Scenario 1: Token Replay Attack

```mermaid
sequenceDiagram
    actor Attacker
    participant Form
    participant Worker
    participant Turnstile
    participant D1

    Note over Attacker: Intercept token from<br/>first submission
    Attacker->>Form: Submit form with<br/>intercepted token
    Form->>Worker: POST /api/submissions
    Worker->>Worker: Hash token (SHA256)
    Worker->>D1: Check token_hash in<br/>turnstile_validations
    D1-->>Worker: Token found ❌
    Worker->>D1: Log attempt<br/>risk_score=100
    Worker-->>Attacker: ❌ 400 Bad Request<br/>"Token already used"

    Note over Worker,Turnstile: Turnstile API call<br/>NEVER made
```

Outcome: Blocked without calling Turnstile API, logged for forensics.

---

### Scenario 2: Incognito Mode (Session Hopping)

```mermaid
sequenceDiagram
    actor Attacker
    participant Normal as Normal Browser
    participant Incognito as Incognito Mode
    participant Worker
    participant D1

    Note over Attacker: First submission<br/>(establishes baseline)
    Attacker->>Normal: Submit form
    Normal->>Worker: Submit with<br/>ephemeral_id=ABC<br/>ja4=X1Y2Z3
    Worker->>D1: Create submission
    D1-->>Worker: Success
    Worker-->>Normal: ✅ 201 Created

    Note over Attacker: Open incognito<br/>(new ephemeral ID)
    Attacker->>Incognito: Submit form
    Incognito->>Worker: Submit with<br/>ephemeral_id=XYZ (NEW)<br/>ja4=X1Y2Z3 (SAME)
    Worker->>D1: Query JA4 clustering
    D1-->>Worker: 2 ephemeral IDs<br/>same JA4 + same IP
    Worker->>D1: Add to blacklist<br/>(ephemeral_id + ja4 + ip)
    Worker-->>Incognito: ❌ 429 Rate Limit<br/>"Session hopping detected"

    Note over Attacker: Try again<br/>(hits blacklist)
    Attacker->>Incognito: Submit again
    Incognito->>Worker: Same request
    Worker->>D1: Pre-validation check
    D1-->>Worker: JA4 blacklisted ❌
    Worker-->>Incognito: ❌ 429 Rate Limit
```

Outcome: Second attempt blocked by JA4 detection, third attempt blocked by pre-validation blacklist.

---

### Scenario 3: Proxy Rotation Attack

```mermaid
sequenceDiagram
    actor Attacker
    participant Proxy1 as Proxy 1<br/>IP: 1.1.1.1
    participant Proxy2 as Proxy 2<br/>IP: 2.2.2.2
    participant Worker
    participant D1

    Note over Attacker: First submission<br/>through Proxy 1
    Attacker->>Proxy1: Submit form
    Proxy1->>Worker: Submit with<br/>ephemeral_id=ABC<br/>remote_ip=1.1.1.1
    Worker->>D1: Create submission
    D1-->>Worker: Success
    Worker-->>Proxy1: ✅ 201 Created

    Note over Attacker: Rotate to Proxy 2<br/>(same device)
    Attacker->>Proxy2: Submit form
    Proxy2->>Worker: Submit with<br/>ephemeral_id=ABC (SAME)<br/>remote_ip=2.2.2.2 (DIFFERENT)
    Worker->>D1: Check IP diversity
    D1-->>Worker: 2 unique IPs<br/>same ephemeral_id
    Worker->>D1: Add to blacklist<br/>(ephemeral_id)
    Worker-->>Proxy2: ❌ 429 Rate Limit<br/>"Proxy rotation detected"
```

Outcome: Layer 2c (IP Diversity) catches proxy rotation, adds ephemeral_id to blacklist.

---

## Risk Scoring System

### Two Scoring Contexts

Risk scores exist in two different contexts:

#### Validation Logs (turnstile_validations table)

Includes all 6 components for forensic analysis of blocked attempts:

```
Token Replay:         35%  (only for replayed tokens)
Email Fraud:          17%  (Markov-Mail detection)
Ephemeral ID:         18%  (device tracking)
Validation Frequency: 13%  (attempt rate)
IP Diversity:          9%  (proxy rotation)
JA4 Session Hopping:   8%  (browser hopping)
─────────────────────────
Total:               100%
```

#### Submission Records (submissions table)

Excludes token replay because replayed tokens cannot create submissions:

```
Email Fraud:          17%
Ephemeral ID:         18%
Validation Frequency: 13%
IP Diversity:          9%
JA4 Session Hopping:   8%
─────────────────────────
Total:                65%  (remaining 35% never triggered)
```

### Block Triggers

When specific checks trigger blocks, minimum risk scores are enforced:

```typescript
switch (blockTrigger) {
  case 'token_replay':       total = 100
  case 'ip_diversity':       total = max(baseScore, 80)
  case 'ja4_session_hopping': total = max(baseScore, 75)
  case 'ephemeral_id_fraud': total = max(baseScore, 70)
  case 'validation_frequency': total = max(baseScore, 70)
  case 'turnstile_failed':   total = max(baseScore, 65)
  case 'duplicate_email':    total = max(baseScore, 60)
}
```

Block Threshold: riskScore ≥ 70

### Risk Score Breakdown

All risk scores include component breakdown stored as JSON:

```json
{
  "tokenReplay": 0,
  "emailFraud": 42,
  "ephemeralId": 70,
  "validationFrequency": 40,
  "ipDiversity": 0,
  "ja4SessionHopping": 0,
  "total": 67.3,
  "components": {
    "emailFraud": {
      "score": 42,
      "weight": 0.17,
      "contribution": 7.14,
      "reason": "Suspicious email pattern"
    },
    "ephemeralId": {
      "score": 70,
      "weight": 0.18,
      "contribution": 12.6,
      "reason": "2 submissions (suspicious)"
    }
  }
}
```

**Implementation**: `src/lib/scoring.ts`

---

## Progressive Timeout System

### Escalation Schedule

Repeat offenders face exponentially increasing timeouts:

```
1st offense:  3,600 seconds  (1 hour)
2nd offense: 14,400 seconds  (4 hours)
3rd offense: 28,800 seconds  (8 hours)
4th offense: 43,200 seconds  (12 hours)
5th+ offense: 86,400 seconds  (24 hours, maximum)
```

### Implementation

**Count Offenses** (last 24h):

```sql
SELECT COUNT(*) FROM fraud_blacklist
WHERE (ephemeral_id = ? OR ip_address = ?)
  AND blocked_at > datetime('now', '-24 hours')
```

**Calculate Timeout** (`src/lib/turnstile.ts:164-177`):

```typescript
function calculateProgressiveTimeout(offenseCount: number): number {
  const timeWindows = [3600, 14400, 28800, 43200, 86400];
  const index = Math.min(offenseCount - 1, timeWindows.length - 1);
  return timeWindows[Math.max(0, index)];
}
```

**Add to Blacklist**:

```typescript
await addToBlacklist(db, {
  ephemeralId,
  ja4,
  ipAddress,
  blockReason: 'Detection reason',
  confidence: 'high',
  expiresIn: timeoutSeconds,
  detectionType: 'ephemeral_id_fraud'
});
```

Ephemeral IDs have ~7 day lifespan. The 24h maximum timeout respects this rotation period while making attacks impractical for attackers and minimizing impact on legitimate users.

---

## Database Schema

### fraud_blacklist Table

Fast pre-validation blocking cache.

```sql
CREATE TABLE fraud_blacklist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- Identifiers (at least one required)
  ephemeral_id TEXT,
  ip_address TEXT,
  ja4 TEXT,

  -- Block metadata
  block_reason TEXT NOT NULL,
  detection_confidence TEXT CHECK(detection_confidence IN ('high','medium','low')),

  -- Timing
  blocked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,

  -- Context
  submission_count INTEGER DEFAULT 0,
  last_seen_at DATETIME,
  detection_metadata TEXT,  -- JSON
  detection_type TEXT,       -- Layer-specific types

  CHECK((ephemeral_id IS NOT NULL) OR
        (ip_address IS NOT NULL) OR
        (ja4 IS NOT NULL))
);

-- Performance indexes
CREATE INDEX idx_blacklist_ephemeral_id ON fraud_blacklist(ephemeral_id, expires_at);
CREATE INDEX idx_blacklist_ip ON fraud_blacklist(ip_address, expires_at);
CREATE INDEX idx_blacklist_ja4 ON fraud_blacklist(ja4, expires_at);
CREATE INDEX idx_blacklist_expires ON fraud_blacklist(expires_at);
```

---

### turnstile_validations Table

Forensic logging of all validation attempts.

```sql
CREATE TABLE turnstile_validations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- Turnstile data
  token_hash TEXT NOT NULL,
  success BOOLEAN NOT NULL,
  allowed BOOLEAN NOT NULL,
  block_reason TEXT,
  ephemeral_id TEXT,

  -- Risk scoring
  risk_score INTEGER DEFAULT 0,
  risk_score_breakdown TEXT,  -- JSON
  detection_type TEXT,

  -- Request metadata (40+ fields)
  remote_ip TEXT,
  country TEXT,
  ja3_hash TEXT,
  ja4 TEXT,
  bot_score INTEGER,
  -- ... other fields

  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (submission_id) REFERENCES submissions(id)
);

-- Critical index for token replay detection
CREATE UNIQUE INDEX idx_token_hash ON turnstile_validations(token_hash);
```

---

### submissions Table

Successful form submissions with full metadata.

```sql
CREATE TABLE submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- Form data
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT,
  address TEXT,
  date_of_birth TEXT,

  -- Fraud detection
  ephemeral_id TEXT,
  risk_score_breakdown TEXT,  -- JSON

  -- Email fraud detection
  email_risk_score REAL,
  email_fraud_signals TEXT,  -- JSON
  email_pattern_type TEXT,

  -- Request metadata (40+ fields)
  remote_ip TEXT,
  country TEXT,
  ja3_hash TEXT,
  ja4 TEXT,
  ja4_signals TEXT,  -- JSON (Cloudflare global intelligence)
  bot_score INTEGER,
  -- ... other fields

  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_submissions_ephemeral_id ON submissions(ephemeral_id);
CREATE INDEX idx_submissions_email ON submissions(email);
```

---

## Performance Characteristics

### Latency Breakdown

```
Pre-validation blacklist hit:  Fast (most repeat attempts)
Token replay check:            D1 lookup
Email fraud RPC:               Worker-to-Worker
Turnstile API call:            External service (slowest)
Ephemeral ID fraud check:      D1 aggregations
JA4 fraud check:               D1 aggregation
```

### Performance Optimization

Pre-validation blacklist blocks most repeat attempts before calling Turnstile API.
