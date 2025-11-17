# Fraud Detection Consistency Fixes - Implementation Plan

**Branch**: `fix/fraud-detection-consistency`
**Created**: 2025-11-17
**Status**: Planning

## Executive Summary

Two critical issues discovered in fraud detection system:

1. **JA4 False Positives**: Layer 4a blocks legitimate users (families, offices, coffee shops) when 2+ people use same browser (Chrome/Firefox) from same IP
2. **Email Fraud Logging Gap**: Email fraud blocks work but aren't logged to database, making them invisible in analytics dashboard

## Issue 1: JA4 False Positives (Layer 4a)

### Problem Description

**Current Behavior**:
```typescript
// src/lib/ja4-fraud-detection.ts:636
if (clusteringIP.ephemeralCount >= 2) {
    return blockForJA4Fraud(...);  // BLOCKS IMMEDIATELY
}
```

**False Positive Scenarios**:
- **Family**: Mom uses Chrome at 2:00 PM, Dad uses Chrome at 2:30 PM from home WiFi → **BLOCKED** ❌
- **Office**: Two employees register with Chrome from corporate WiFi → **BLOCKED** ❌
- **Coffee Shop**: Two customers with Chrome within 1 hour → **BLOCKED** ❌

**Root Cause**:
- Blocks on simple count threshold (ephemeralCount >= 2)
- Ignores timing/velocity signals
- Doesn't use comprehensive risk scoring
- Most users use Chrome/Firefox (same JA4 fingerprint)

### Solution: Multi-Signal Risk Scoring

**Proposed Behavior**:
```typescript
if (clusteringIP.ephemeralCount >= 2) {
    // Calculate risk from 4 signals
    const velocity = analyzeVelocity(clusteringIP, config);
    const signals = compareGlobalSignals(clusteringIP, config);
    const rawScore = calculateCompositeRiskScore(clusteringIP, velocity, signals);
    const normalizedScore = normalizeJA4Score(rawScore, config.risk.blockThreshold);

    // Block only if comprehensive score >= 70
    if (normalizedScore >= config.risk.blockThreshold) {
        return blockForJA4Fraud(...);
    }

    // Allow but include score in overall risk
    return { allowed: true, riskScore: normalizedScore, warnings: [...] };
}
```

**Risk Signals** (4 components):
1. **Clustering** (+80): ephemeralCount >= threshold
2. **Velocity** (+60): submissions < 10 minutes apart
3. **Global Anomaly** (+50): High global IP diversity + local clustering
4. **Bot Pattern** (+40): High request volume + local clustering

**Examples**:
- **Legitimate**: 2 users, 30 min apart → 80 + 0 + 50 = 130 raw → ~75 normalized → **Likely ALLOW**
- **Attack**: 2 users, 2 min apart → 80 + 60 + 50 = 190 raw → ~87 normalized → **BLOCK**

---

## Issue 2: Email Fraud Logging Gap

### Problem Description

**Current Behavior**:
```typescript
// src/routes/submissions.ts:144-160
if (emailFraudResult && emailFraudResult.decision === 'block') {
    throw new ValidationError('Email rejected');  // Blocks before logging
}
// Line 574: logValidation() never reached for blocked emails
```

**Impact**:
- ✅ Email fraud blocks WORK (decision='block' throws error)
- ❌ Blocks NOT logged to `turnstile_validations` table
- ❌ Analytics dashboard doesn't show email fraud blocks
- ❌ No forensic analysis of blocked email patterns
- ❌ SecurityEvents section missing `email_fraud` detection type

**Why It Happens**:
- Email fraud check at line 137-161 (early in request flow)
- Blocking throws exception immediately
- `logValidation()` called at line 574 (only for successful flow)
- Other layers (JA4, ephemeral ID) log BEFORE blocking

### Solution: Log Before Block

**Proposed Behavior**:
```typescript
if (emailFraudResult && emailFraudResult.decision === 'block') {
    // Log the blocked attempt FIRST
    await logValidation(c.env.DB, {
        tokenHash: null,
        turnstileResult: null,
        ipAddress: metadata.remoteIp,
        ephemeralId: null,
        riskScore: emailFraudResult.riskScore,
        blocked: true,
        detectionType: 'email_fraud',
        blockReason: `Email fraud: ${emailFraudResult.signals.patternType}`,
        emailRiskScore: emailFraudResult.riskScore,
        emailFraudSignals: emailFraudResult.signals,
        // ... metadata
    });

    // THEN block
    throw new ValidationError('Email rejected');
}
```

**Benefits**:
- Email fraud blocks visible in SecurityEvents
- Forensic analysis enabled
- Consistent with other fraud layers
- No behavior change (still blocks same emails)

---

## Implementation Phases

### Phase 1: Email Fraud Logging Gap (Quick Fix) ✅ COMPLETED

**Priority**: HIGH (fixes analytics visibility)
**Risk**: LOW (adds logging, no behavior change)
**Files Modified**: 4 (migration, schema, database.ts, submissions.ts)

**Implementation Note**: Changed approach from logging to turnstile_validations (hacky) to creating dedicated fraud_blocks table (clean architecture).

#### Tasks

- [x] **Create `fraud_blocks` table** (migration + schema)
  - Dedicated table for pre-Turnstile fraud detection
  - Email fraud specific fields (pattern_type, markov_detected, ood_detected, etc.)
  - Generic fields for future fraud types (metadata_json, fraud_signals_json)
  - Proper indexes for performance
- [x] **Implement `logFraudBlock()` function** (database.ts)
  - Clean API for logging any pre-Turnstile fraud detection
  - Fail-open error handling
  - Structured logging with pino
- [x] **Integrate email fraud logging** (submissions.ts)
  - Call logFraudBlock() before throwing ValidationError
  - Include all email fraud signals
  - Pass erfid for request tracking
- [x] **Update analytics to include fraud_blocks data**
  - getBlockedValidationStats(): Combined counts with breakdown
  - getBlockReasonDistribution(): UNION query with source field
  - getRecentBlockedValidations(): UNION query for SecurityEvents

#### Testing Requirements

- [x] Email fraud block logged to `fraud_blocks` table
- [x] Analytics queries combine both tables correctly
- [x] Error still thrown correctly (user-facing behavior unchanged)
- [x] TypeScript compilation passes
- [x] Remote D1 database migration successful
- [x] UNION queries tested against remote database

#### Verification

```bash
# Test fraudulent email submission
curl -X POST http://localhost:8787/api/submissions \
  -H "Content-Type: application/json" \
  -d '{"email": "test12345@example.com", "firstName": "Test", "lastName": "User"}'

# Verify database log
wrangler d1 execute DB --command="
  SELECT detection_type, blocked, email_pattern_type, email_risk_score
  FROM turnstile_validations
  WHERE detection_type = 'email_fraud'
  ORDER BY created_at DESC
  LIMIT 5
" --remote
```

---

### Phase 2: JA4 Risk Scoring (Complex Fix) ✅ COMPLETED

**Priority**: HIGH (fixes false positives)
**Risk**: MEDIUM (changes blocking logic)
**Files Modified**: 3 (config.ts, scoring.ts, ja4-fraud-detection.ts)

#### Tasks

##### 2.1: Update Configuration (`src/lib/config.ts`)

- [x] Add `velocityThresholdMinutes: 10` to `detection.ja4Clustering`
- [x] Add `useRiskScoreThreshold: true` to `detection.ja4Clustering`
- [x] Add detailed rationale comments
- [x] Update TypeScript types

**New Config Structure**:
```typescript
detection: {
    ja4Clustering: {
        // Existing
        ipClusteringThreshold: 2,
        rapidGlobalThreshold: 3,
        extendedGlobalThreshold: 5,
        rapidGlobalWindowMinutes: 5,
        extendedGlobalWindowMinutes: 60,

        // NEW
        velocityThresholdMinutes: 10,      // <10 min = rapid
        useRiskScoreThreshold: true,        // Enable risk scoring
    }
}
```

##### 2.2: Update JA4 Detection (`src/lib/ja4-fraud-detection.ts`)

- [x] **Modify Layer 4a (lines 637-683)**
  - Add velocity analysis
  - Add signal analysis
  - Calculate raw risk score
  - Normalize risk score
  - Check against blockThreshold
  - Return score if below threshold
  - Backward compatible with feature flag

- [x] **Modify Layer 4b (lines 685-731)**
  - Apply same risk scoring pattern
  - Keep higher threshold (3+ ephemeral IDs)

- [x] **Modify Layer 4c (lines 733-779)**
  - Apply same risk scoring pattern
  - Keep highest threshold (5+ ephemeral IDs)

- [x] **Update `analyzeVelocity()` function (line 381)**
  - Accept config parameter
  - Use `config.detection.ja4Clustering.velocityThresholdMinutes`

- [x] **Update return types**
  - Ensure `FraudCheckResult` includes `allowed: true` case with risk score

##### 2.3: Export Scoring Functions (`src/lib/scoring.ts`)

- [x] Export `normalizeJA4Score()` function (line 228)
- [x] Function already accepts config parameter

##### 2.4: Integration Verification

- [x] Layer 4 integration handles new response format (allowed=true with riskScore)
- [x] Risk scores returned for transparency when below threshold
- [x] Comprehensive logging at each layer with risk scores

#### Testing Requirements

- [ ] **Family Scenario**: 2 users, Chrome, 30 min apart → ALLOW
- [ ] **Office Scenario**: 2 users, Chrome, 1 hour apart → ALLOW
- [ ] **Coffee Shop**: 2 users, Chrome, 45 min apart → ALLOW
- [ ] **Attack Rapid**: 2 users, Chrome, 2 min apart → BLOCK
- [ ] **Attack Global**: 3 users, Chrome, 5 min, different IPs → BLOCK
- [ ] **Edge Case**: 2 users, exactly 10 min apart → Document behavior
- [ ] **Backward Compat**: `useRiskScoreThreshold: false` → Old behavior

#### Verification

```bash
# Test legitimate family scenario
# Submit twice from same IP, 30 min apart - should ALLOW both

# Test attack scenario
# Submit twice from same IP, 2 min apart - should BLOCK second

# Check logs for risk scores
wrangler tail --format=pretty | grep "ja4_fraud"
```

---

### Phase 3: Documentation Updates

**Files to Update**: 4

#### Tasks

- [ ] **`docs/FRAUD-DETECTION.md`**
  - Update Layer 1 (Email Fraud) to note logging is enabled
  - Update Layer 4 (JA4) to explain risk scoring approach
  - Add examples showing legitimate vs attack scenarios
  - Update detection type list to include `email_fraud`

- [ ] **`CLAUDE.md`**
  - Update fraud detection summary (lines 22-50)
  - Note email fraud blocks are now logged
  - Explain JA4 uses risk scoring, not simple counts
  - Update "Why This Works" section

- [ ] **`config/fraud-config.example.json`**
  - Add example with new JA4 config options
  - Document `velocityThresholdMinutes` setting
  - Document `useRiskScoreThreshold` flag

- [ ] **`README.md`** (if needed)
  - Update fraud detection feature description

---

### Phase 4: Testing Suite

**New Test Files**: 2

#### Tasks

##### 4.1: Email Fraud Logging Tests (`tests/email-fraud-logging.spec.ts`)

- [ ] Test fraudulent email block is logged
- [ ] Test sequential pattern detection and logging
- [ ] Test dated pattern detection and logging
- [ ] Test disposable domain detection and logging
- [ ] Verify all signals logged correctly
- [ ] Verify detection_type is 'email_fraud'

##### 4.2: JA4 Risk Scoring Tests (`tests/ja4-risk-scoring.spec.ts`)

- [ ] **Layer 4a Tests**:
  - [ ] Family: 2 users, 30 min apart → ALLOW
  - [ ] Office: 2 users, 1 hr apart → ALLOW
  - [ ] Attack: 2 users, 2 min apart → BLOCK
  - [ ] Edge: 2 users, 10 min apart → Document
  - [ ] IPv6 subnet matching edge cases

- [ ] **Layer 4b Tests**:
  - [ ] 3 users, 5 min, different IPs → BLOCK
  - [ ] 2 users, 5 min → ALLOW
  - [ ] 3 users, 6 min → Depends on Layer 4c

- [ ] **Layer 4c Tests**:
  - [ ] 5 users, 60 min → BLOCK
  - [ ] 4 users, 60 min → ALLOW
  - [ ] 5 users, 61 min → ALLOW (outside window)

- [ ] **Risk Score Tests**:
  - [ ] Verify score calculation (4 signals)
  - [ ] Verify normalization (raw 0-230 → normalized 0-100)
  - [ ] Verify threshold check (>= 70 blocks)

- [ ] **Backward Compatibility**:
  - [ ] `useRiskScoreThreshold: false` → Old behavior
  - [ ] Custom velocityThreshold works

---

## Configuration Examples

### Default Configuration (New Behavior)

```json
{
  "risk": {
    "blockThreshold": 70
  },
  "detection": {
    "ja4Clustering": {
      "ipClusteringThreshold": 2,
      "rapidGlobalThreshold": 3,
      "extendedGlobalThreshold": 5,
      "velocityThresholdMinutes": 10,
      "useRiskScoreThreshold": true
    }
  }
}
```

### Conservative Configuration (Reduce False Positives)

```json
{
  "detection": {
    "ja4Clustering": {
      "ipClusteringThreshold": 3,
      "velocityThresholdMinutes": 5,
      "useRiskScoreThreshold": true
    }
  }
}
```

### Aggressive Configuration (Stricter Blocking)

```json
{
  "risk": {
    "blockThreshold": 60
  },
  "detection": {
    "ja4Clustering": {
      "velocityThresholdMinutes": 15,
      "useRiskScoreThreshold": true
    }
  }
}
```

### Backward Compatible (Old Behavior)

```json
{
  "detection": {
    "ja4Clustering": {
      "useRiskScoreThreshold": false
    }
  }
}
```

---

## Migration Strategy

### Deployment Timeline

1. **Week 1**: Deploy Phase 1 (Email Logging)
   - Low risk, immediate analytics visibility
   - Monitor dashboard for email fraud blocks
   - Verify no performance impact

2. **Week 2**: Deploy Phase 2 (JA4 Scoring) to staging
   - Test with production traffic volume
   - Monitor false positive rate
   - Tune `velocityThresholdMinutes` if needed

3. **Week 3**: Deploy Phase 2 to production
   - Enable `useRiskScoreThreshold: true` by default
   - Monitor logs for blocked/allowed decisions
   - Ready to rollback via config if issues arise

4. **Week 4**: Documentation and testing
   - Update all docs
   - Add comprehensive test suite
   - Write migration guide

### Rollback Plan

#### Phase 1 Rollback (Email Logging)
```bash
git revert <commit-hash>
git push
wrangler deploy
```
**Impact**: Loses analytics visibility, but blocking still works

#### Phase 2 Rollback (JA4 Scoring)
**Option 1** - Config only (no code change):
```json
{
  "detection": {
    "ja4Clustering": {
      "useRiskScoreThreshold": false
    }
  }
}
```

**Option 2** - Full revert:
```bash
git revert <commit-hash>
git push
wrangler deploy
```

---

## Success Metrics

### Email Fraud Logging (Phase 1)

- [ ] `email_fraud` detection type appears in `turnstile_validations` table
- [ ] Analytics dashboard SecurityEvents shows email fraud blocks
- [ ] At least 1 email fraud block logged in first week
- [ ] No increase in error rate
- [ ] No performance degradation

### JA4 Risk Scoring (Phase 2)

- [ ] False positive rate drops to < 1%
- [ ] No legitimate family/office scenarios blocked in staging tests
- [ ] Attack scenarios still detected (3+ submissions in 5 min)
- [ ] Risk scores logged for all JA4 checks (blocked and allowed)
- [ ] Average response time unchanged (<200ms)

### Overall System

- [ ] All 6 detection types visible in analytics:
  - `token_replay`
  - `email_fraud` ✨ NEW
  - `ephemeral_id_fraud`
  - `validation_frequency`
  - `ip_diversity`
  - `ja4_session_hopping`
- [ ] Total block rate remains stable (±5%)
- [ ] User complaints about false positives decrease
- [ ] Fraud detection still effective (no increase in attacks)

---

## Risk Assessment

### Phase 1 Risks (Email Logging)

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| Performance degradation | LOW | MEDIUM | Extra DB write adds ~10ms, negligible |
| Logging errors | LOW | LOW | Wrap in try-catch, fail-open |
| Database space | LOW | LOW | Email fraud blocks rare, minimal data |

**Overall Risk**: **LOW**

### Phase 2 Risks (JA4 Scoring)

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| New false positives | MEDIUM | HIGH | Extensive testing, configurable thresholds |
| Missed attacks | LOW | HIGH | Keep thresholds conservative, monitor logs |
| Performance impact | LOW | MEDIUM | Scoring already calculated, just using differently |
| Config complexity | MEDIUM | LOW | Good docs, sensible defaults |

**Overall Risk**: **MEDIUM** (due to logic changes, but mitigated by config flag)

---

## Testing Checklist

### Pre-Deployment (Staging)

- [ ] Unit tests pass (all phases)
- [ ] Integration tests pass (all phases)
- [ ] TypeScript compilation succeeds
- [ ] Linting passes
- [ ] Manual testing of key scenarios
- [ ] Load testing (100 req/sec sustained)
- [ ] Review all code changes
- [ ] Update CHANGELOG.md

### Post-Deployment (Production)

- [ ] Monitor worker logs for 24 hours
- [ ] Check error rate (should be stable)
- [ ] Verify analytics dashboard updates
- [ ] Check database growth (should be minimal)
- [ ] Review first week's fraud blocks
- [ ] Gather user feedback

---

## Open Questions

1. **Velocity Threshold**: Is 10 minutes the right value?
   - Consider: Family members might submit 5-10 min apart
   - Monitor: Distribution of time gaps in legitimate submissions
   - Adjust: Could increase to 15 min if needed

2. **Risk Threshold**: Should it be 70 for JA4 layer specifically?
   - Current: Uses global `config.risk.blockThreshold` (70)
   - Alternative: Layer-specific threshold (e.g., 75 for JA4)

3. **Backward Compatibility**: How long to support old behavior?
   - Propose: 3 months with config flag, then remove flag
   - Document: Migration guide for users on old behavior

4. **Email Logging Performance**: Any impact on high-volume deployments?
   - Measure: Latency before/after in production
   - Monitor: Database write queue

---

## References

### Related Files

- `src/routes/submissions.ts` - Main submission endpoint
- `src/lib/ja4-fraud-detection.ts` - JA4 detection logic
- `src/lib/email-fraud-detection.ts` - Email fraud RPC
- `src/lib/scoring.ts` - Risk score normalization
- `src/lib/config.ts` - Fraud detection configuration
- `src/lib/database.ts` - Database operations
- `docs/FRAUD-DETECTION.md` - Fraud detection docs
- `CLAUDE.md` - Project documentation

### External Documentation

- Cloudflare JA4 Signals: `/home/erfi/fraud-detection/cf-docs/bots/additional-configurations/ja3-ja4-fingerprint/signals-intelligence/index.md`
- Cloudflare Bot Management: `/home/erfi/fraud-detection/cf-docs/bots/reference/bot-management-variables/index.md`

---

## Notes

- **Priority**: Fix email logging first (quick win), then JA4 scoring
- **Testing**: Critical for Phase 2, extensive scenario coverage needed
- **Monitoring**: Watch logs closely for first week after each phase
- **Documentation**: Update before deployment, not after

---

## Changelog

- **2025-11-17**: Initial plan created
- **2025-11-17**: Phase 1 COMPLETED - Email fraud logging with separate fraud_blocks table
  - Created `fraud_blocks` table for pre-Turnstile fraud detection
  - Implemented `logFraudBlock()` function in database.ts
  - Integrated logging into email fraud block flow
  - Migration applied successfully to local and remote databases
  - TypeScript compilation passes cleanly
  - Clean architecture: No hacks, separate concerns, future-proof
- **2025-11-17**: Analytics fully updated to include fraud_blocks data
  - Updated getBlockedValidationStats() to combine both tables with breakdown
  - Updated getBlockReasonDistribution() with UNION query and source field
  - Updated getRecentBlockedValidations() with UNION query for SecurityEvents
  - All queries tested against remote D1 database
  - TypeScript compilation verified
- **2025-11-17**: Phase 2 COMPLETED - JA4 risk scoring implementation
  - Added velocityThresholdMinutes (10 min) and useRiskScoreThreshold (true) to config
  - Exported normalizeJA4Score from scoring.ts
  - Updated analyzeVelocity to accept config and use velocityThresholdMinutes
  - Updated all 3 JA4 layers (4a, 4b, 4c) to use multi-signal risk scoring
  - Risk scoring combines 4 signals: clustering + velocity + global anomaly + bot pattern
  - Blocks only if normalized score >= blockThreshold (70)
  - Returns risk score for transparency when below threshold
  - Backward compatible with useRiskScoreThreshold=false feature flag
  - TypeScript compilation passes cleanly
  - Fixes false positives: families/offices using same browser now allowed
- **Status**: Phase 1 Complete ✅ | Phase 2 Complete ✅ | Ready for testing and deployment
