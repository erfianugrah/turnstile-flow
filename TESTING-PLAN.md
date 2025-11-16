# Configuration System Testing Plan

## Critical Issues Found

### 🔴 **CRITICAL: Backend Not Using Configuration**

**Problem**: The configuration system exists but the backend fraud detection code is NOT using it.

**Evidence**:
- `getConfig()` only called by `/api/config` endpoint
- `scoring.ts` still uses hardcoded weights: `0.35, 0.17, 0.18`
- `ja4-fraud-detection.ts` still uses hardcoded thresholds: `0.95, 0.99`
- Block threshold `70` hardcoded in multiple places

**Impact**:
- ❌ Frontend displays config values that backend doesn't use
- ❌ User customization in `FRAUD_CONFIG` has NO EFFECT on fraud detection
- ❌ UI shows one config, backend uses different values (mismatch)

**Files That Need Updates**:
1. `src/lib/scoring.ts` - Accept and use config for weights and block threshold
2. `src/lib/ja4-fraud-detection.ts` - Accept and use config for JA4 thresholds
3. `src/lib/turnstile.ts` - Accept and use config for detection thresholds
4. `src/routes/submissions.ts` - Get config and pass to fraud detection functions

### Required Changes

#### 1. Update `src/lib/scoring.ts`
```typescript
// BEFORE: Hardcoded weights
export function calculateRiskScore(...) {
  const emailContribution = emailScore * 0.17;
  // ...
}

// AFTER: Use config
export function calculateRiskScore(
  ...,
  config: FraudDetectionConfig
) {
  const emailContribution = emailScore * config.risk.weights.emailFraud;
  // ...
}
```

#### 2. Update `src/lib/ja4-fraud-detection.ts`
```typescript
// BEFORE: Hardcoded thresholds
highGlobalDistribution: ipsQuantile > 0.95

// AFTER: Use config
export function detectJA4Fraud(
  ...,
  config: FraudDetectionConfig
) {
  highGlobalDistribution: ipsQuantile > config.ja4.ipsQuantileThreshold
  // ...
}
```

#### 3. Update `src/routes/submissions.ts`
```typescript
// Add at top of handler
const config = getConfig(c.env);

// Pass to all fraud detection functions
const riskAssessment = calculateRiskScore(..., config);
const ja4Fraud = await detectJA4Fraud(..., config);
```

## Testing Plan (After Fixes)

### Phase 1: Code Review
- [ ] Verify all hardcoded thresholds removed from fraud detection code
- [ ] Confirm `getConfig()` called in submissions route
- [ ] Check config passed to all fraud detection functions
- [ ] Validate TypeScript types updated correctly

### Phase 2: Local Testing

#### Test 1: Default Configuration
```bash
# No FRAUD_CONFIG in environment
wrangler dev --remote
```

**Expected**:
- ✅ `/api/config` returns default values
- ✅ Fraud detection uses default thresholds (70, 0.95, etc.)
- ✅ Frontend displays default values

#### Test 2: Custom Configuration
```bash
# Add to .dev.vars:
FRAUD_CONFIG={"risk":{"blockThreshold":80},"ja4":{"ipsQuantileThreshold":0.98}}

wrangler dev --remote
```

**Expected**:
- ✅ `/api/config` returns custom values
- ✅ Fraud detection blocks at 80 instead of 70
- ✅ JA4 uses 0.98 threshold instead of 0.95
- ✅ Frontend displays custom values

#### Test 3: Partial Override
```bash
# Only override one value
FRAUD_CONFIG={"risk":{"blockThreshold":60}}
```

**Expected**:
- ✅ Block threshold = 60 (custom)
- ✅ All other values = defaults
- ✅ Weights still sum to 1.0

#### Test 4: Invalid Configuration
```bash
# Malformed JSON
FRAUD_CONFIG={"risk":{invalid}

# Invalid values
FRAUD_CONFIG={"risk":{"blockThreshold":150}}
```

**Expected**:
- ✅ Falls back to defaults gracefully
- ✅ Warning logged to console
- ✅ System continues working

#### Test 5: Frontend Integration
1. Open analytics dashboard
2. Check RiskScoreInfo component
3. Inspect submission/validation detail dialogs

**Expected**:
- ✅ FraudAssessment shows correct weights
- ✅ JA4SignalsDetail shows correct thresholds
- ✅ Values match `/api/config` response

### Phase 3: Fraud Detection Testing

#### Test 6: Block Threshold
```bash
# Set block threshold to 50
FRAUD_CONFIG={"risk":{"blockThreshold":50}}

# Submit form with medium-risk email (score ~45)
```

**Expected**:
- ✅ Submission allowed (45 < 50)

```bash
# Change to 40
FRAUD_CONFIG={"risk":{"blockThreshold":40}}
```

**Expected**:
- ✅ Same submission now blocked (45 >= 40)

#### Test 7: Weight Changes
```bash
# Increase email fraud weight to 30%
FRAUD_CONFIG={"risk":{"weights":{"emailFraud":0.30}}}

# Submit with fraudulent email pattern
```

**Expected**:
- ✅ Higher risk score due to increased email weight
- ✅ May block when would have been allowed before

#### Test 8: JA4 Thresholds
```bash
# More lenient JA4 check
FRAUD_CONFIG={"ja4":{"ipsQuantileThreshold":0.99}}

# Submit from browser with high JA4 distribution
```

**Expected**:
- ✅ Not flagged as suspicious (below 0.99)
- ✅ Previously would have been flagged at 0.95

### Phase 4: Integration Testing

#### Test 9: Full Fraud Detection Flow
1. Pre-validation blacklist check
2. Email fraud detection (Markov-Mail)
3. Ephemeral ID fraud check
4. Validation frequency check
5. IP diversity check
6. JA4 session hopping check

**For each layer**:
- ✅ Uses config values
- ✅ Risk score calculated correctly
- ✅ Block decision matches threshold

#### Test 10: Progressive Timeouts
```bash
# Customize timeout schedule
FRAUD_CONFIG={"timeouts":{"schedule":[7200,14400,28800,43200,86400]}}

# Trigger multiple blocks
```

**Expected**:
- ✅ 1st offense: 2 hours (7200s) instead of 1 hour
- ✅ Blacklist expires_at uses custom schedule

### Phase 5: Production Validation

#### Test 11: Deployment
```bash
npm run deploy
```

**Expected**:
- ✅ Worker deploys successfully
- ✅ Frontend builds without errors
- ✅ `/api/config` endpoint accessible

#### Test 12: Production Config
**In Cloudflare Dashboard**:
1. Navigate to Worker settings
2. Add FRAUD_CONFIG environment variable
3. Verify changes take effect

**Expected**:
- ✅ Config updates without redeployment
- ✅ No service interruption

## Analytics Success Rate Issue

### Current Metrics Shown:
1. **Total Submissions**
2. **Success Rate** - Turnstile validation succeeded
3. **Allowed Rate** - Fraud detection allowed submission
4. **Average Risk Score**
5. **JA4 Fraud Blocks**

### Problem:
- **Success Rate** and **Allowed Rate** are confusing when shown together
- Users care about "what got through" vs "what was blocked"
- Turnstile success is less interesting than fraud detection results

### Recommendation:
**Remove "Success Rate" from overview, keep only "Allowed Rate"**

**Rationale**:
- Allowed rate directly shows fraud detection effectiveness
- If Turnstile fails, request never reaches fraud detection
- Most users care about final outcome (allowed/blocked), not intermediate Turnstile success
- Reduces cognitive load - one rate is clearer than two

### Alternative:
**Rename metrics for clarity**:
- "Turnstile Pass Rate" (was "Success Rate")
- "Fraud Detection Pass Rate" (was "Allowed Rate")

## Test Results

| Test | Status | Notes |
|------|--------|-------|
| Backend uses config | ❌ TODO | Critical fix needed |
| Default config works | ⏸️ Pending | After backend fix |
| Custom config works | ⏸️ Pending | After backend fix |
| Partial override works | ⏸️ Pending | After backend fix |
| Invalid config handled | ⏸️ Pending | After backend fix |
| Frontend integration | ⏸️ Pending | After backend fix |
| Block threshold test | ⏸️ Pending | After backend fix |
| Weight changes test | ⏸️ Pending | After backend fix |
| JA4 thresholds test | ⏸️ Pending | After backend fix |
| Full fraud detection | ⏸️ Pending | After backend fix |
| Progressive timeouts | ⏸️ Pending | After backend fix |
| Deployment | ⏸️ Pending | After backend fix |

## Summary

### Must Fix Before Merge:
1. ❌ **Update backend fraud detection to use getConfig()**
   - scoring.ts
   - ja4-fraud-detection.ts
   - turnstile.ts
   - submissions.ts

2. ❌ **Test custom configuration actually affects fraud detection**

3. ❌ **Address analytics success rate confusion**

### Nice to Have:
- Add config validation (reject invalid values)
- Add config caching (avoid repeated parsing)
- Add tests for config deep merge logic
