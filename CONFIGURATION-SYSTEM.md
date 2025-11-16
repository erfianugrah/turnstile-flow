# Fraud Detection Configuration System

**Status**: ✅ Production Ready
**Version**: 2.0.0
**Last Updated**: 2025-11-16
**Deployment**: b0c61b9a-40f9-4f9b-906d-a327dcad603d

## Overview

Comprehensive configuration system for fraud detection thresholds and risk scoring weights. Allows users to customize detection behavior via environment variables without code changes.

## Features

✅ **Centralized Configuration** - Single source of truth in `src/lib/config.ts`
✅ **Deep Merge** - Partial overrides at any nesting level
✅ **Environment-Based** - Set via `FRAUD_CONFIG` environment variable
✅ **Type-Safe** - Full TypeScript support
✅ **API Exposure** - Frontend access via `/api/config` endpoint
✅ **Research-Backed Defaults** - All values documented with rationale
✅ **Zero Hardcoded Values** - All thresholds configurable

## Default Configuration

```typescript
{
  risk: {
    blockThreshold: 70,                    // Block when risk >= 70
    weights: {                             // Component weights (sum = 1.0)
      tokenReplay: 0.35,                   // 35% - Token replay attacks
      emailFraud: 0.17,                    // 17% - Email pattern fraud
      ephemeralId: 0.18,                   // 18% - Device tracking
      validationFrequency: 0.13,           // 13% - Attempt rate monitoring
      ipDiversity: 0.09,                   //  9% - Proxy rotation detection
      ja4SessionHopping: 0.08,             //  8% - Browser hopping attacks
    },
  },
  ja4: {
    ipsQuantileThreshold: 0.95,            // 95th percentile for IP diversity
    reqsQuantileThreshold: 0.99,           // 99th percentile for request volume
  },
  detection: {
    ephemeralIdSubmissionThreshold: 2,     // Block on 2+ submissions in 24h
    validationFrequencyBlockThreshold: 3,  // Block on 3+ attempts in 1h
    validationFrequencyWarnThreshold: 2,   // Warn on 2 attempts in 1h
    ipDiversityThreshold: 2,               // Block on 2+ IPs per ephemeral ID
    ja4Clustering: {
      ipClusteringThreshold: 2,            // 2+ ephemeral IDs from same IP
      rapidGlobalThreshold: 3,             // 3+ ephemeral IDs in 5 minutes
      rapidGlobalWindowMinutes: 5,         // Rapid detection window
      extendedGlobalThreshold: 5,          // 5+ ephemeral IDs in 1 hour
      extendedGlobalWindowMinutes: 60,     // Extended detection window
    },
  },
}
```

## Usage

### Setting Custom Configuration

**Via Cloudflare Dashboard:**
1. Navigate to Workers & Pages → forminator → Settings → Variables
2. Add environment variable: `FRAUD_CONFIG`
3. Value (JSON string):

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

**Via wrangler.toml:**
```toml
[vars]
FRAUD_CONFIG = '''
{
  "risk": {"blockThreshold": 80},
  "detection": {"validationFrequencyBlockThreshold": 5}
}
'''
```

**Via wrangler CLI:**
```bash
echo '{"risk":{"blockThreshold":80}}' | wrangler secret put FRAUD_CONFIG
```

### Accessing Configuration

**Backend (Worker):**
```typescript
import { getConfig } from './lib/config';

const config = getConfig(c.env);
const threshold = config.risk.blockThreshold;  // 80 (custom) or 70 (default)
```

**Frontend (React):**
```typescript
import { useConfig } from './hooks/useConfig';

function MyComponent() {
  const { config, loading } = useConfig();
  return <div>Block Threshold: {config.risk.blockThreshold}</div>;
}
```

**API Endpoint:**
```bash
curl https://form.erfi.dev/api/config | jq '.'
```

Response:
```json
{
  "success": true,
  "version": "2.0.0",
  "customized": true,
  "data": { /* full configuration */ }
}
```

## Configuration Integration

### Backend Functions Using Config

All fraud detection functions accept and use configuration:

1. **checkEphemeralIdFraud()** - `src/lib/turnstile.ts`
   - Uses: `detection.ephemeralIdSubmissionThreshold`
   - Uses: `detection.validationFrequencyBlockThreshold`
   - Uses: `detection.validationFrequencyWarnThreshold`
   - Uses: `detection.ipDiversityThreshold`

2. **checkJA4FraudPatterns()** - `src/lib/ja4-fraud-detection.ts`
   - Uses: `ja4.ipsQuantileThreshold`
   - Uses: `ja4.reqsQuantileThreshold`
   - Uses: `detection.ja4Clustering.*` (5 thresholds)

3. **calculateNormalizedRiskScore()** - `src/lib/scoring.ts`
   - Uses: `risk.weights.*` (6 components)
   - Uses: `risk.blockThreshold`
   - Uses: `detection.*` (3 thresholds)

### Request Flow

```
POST /api/submissions
  ↓
const config = getConfig(c.env)                          // Load config
  ↓
checkJA4FraudPatterns(..., config)                       // JA4 detection
  ↓
checkEphemeralIdFraud(ephemeralId, db, config)          // Ephemeral ID detection
  ↓
calculateNormalizedRiskScore({...}, config)              // Risk scoring
  ↓
Block if riskScore >= config.risk.blockThreshold
```

## Use Cases

### 1. A/B Testing
Test different thresholds to optimize fraud detection vs. user experience:
```json
{
  "risk": {"blockThreshold": 75}  // Stricter (was 70)
}
```

### 2. Fine-Tuning Based on Traffic
Adjust based on production abuse patterns:
```json
{
  "detection": {
    "validationFrequencyBlockThreshold": 5,  // More lenient (was 3)
    "ephemeralIdSubmissionThreshold": 3      // More lenient (was 2)
  }
}
```

### 3. Email Fraud Focus
Increase email fraud detection weight:
```json
{
  "risk": {
    "weights": {
      "emailFraud": 0.30,      // Increase from 0.17
      "tokenReplay": 0.32      // Decrease from 0.35 (keep sum = 1.0)
    }
  }
}
```

### 4. JA4 Sensitivity Adjustment
Reduce false positives for popular browsers:
```json
{
  "ja4": {
    "ipsQuantileThreshold": 0.99,  // More lenient (was 0.95)
    "reqsQuantileThreshold": 0.995  // More lenient (was 0.99)
  }
}
```

### 5. Progressive Hardening
Start lenient, tighten based on abuse:
```json
{
  "risk": {"blockThreshold": 60},  // Week 1: Lenient
  "detection": {
    "ephemeralIdSubmissionThreshold": 4,
    "validationFrequencyBlockThreshold": 6
  }
}
```

Then gradually increase over time as you understand traffic patterns.

## Verification

### Code Verification (100% Complete)

**No hardcoded thresholds remain:**
```bash
# Check turnstile.ts
grep -n "effectiveCount >= [0-9]" src/lib/turnstile.ts
# No results ✅

# Check scoring.ts
grep -n "0\.35\|0\.17\|0\.18" src/lib/scoring.ts
# No results ✅

# Check ja4-fraud-detection.ts
grep -n "> 0\.95\|> 0\.99" src/lib/ja4-fraud-detection.ts
# Only documentation comments ✅
```

**All function calls pass config:**
```bash
grep -n "checkEphemeralIdFraud\|checkJA4FraudPatterns\|calculateNormalizedRiskScore" \
  src/routes/submissions.ts
# All 9 calls include config parameter ✅
```

**TypeScript compilation:**
```bash
npx tsc --noEmit
# Exit code: 0 ✅
```

### Production Testing

**Default configuration:**
```bash
curl -s https://form.erfi.dev/api/config | jq '{customized, blockThreshold}'
# {"customized": false, "blockThreshold": 70} ✅
```

**Custom configuration:**
```bash
echo '{"risk":{"blockThreshold":80}}' | wrangler secret put FRAUD_CONFIG
sleep 3
curl -s https://form.erfi.dev/api/config | jq '{customized, blockThreshold}'
# {"customized": true, "blockThreshold": 80} ✅
```

**Deep merge verification:**
```bash
curl -s https://form.erfi.dev/api/config | jq '.data.risk.weights.tokenReplay'
# 0.35 (default preserved when only blockThreshold customized) ✅
```

## Implementation Details

### Deep Merge Algorithm

Custom configuration is deeply merged with defaults:
```typescript
function mergeConfig(defaults, custom) {
  const result = { ...defaults };
  for (const [key, value] of Object.entries(custom)) {
    if (typeof value === 'object' && !Array.isArray(value)) {
      result[key] = mergeConfig(defaults[key] || {}, value);
    } else {
      result[key] = value;
    }
  }
  return result;
}
```

**Example:**
```json
// Custom: {"risk": {"blockThreshold": 80}}
// Result: All weights preserved, only blockThreshold changed ✅
```

### Type Safety

Full TypeScript interfaces:
```typescript
export interface FraudDetectionConfig {
  risk: RiskConfig;
  ja4: JA4Config;
  detection: DetectionConfig;
}
```

IDE autocomplete and compile-time type checking throughout codebase.

### Validation

- Weights should sum to 1.0 (enforced by normalized scoring)
- Thresholds should be positive integers
- Percentile thresholds should be 0.0-1.0
- No validation errors will crash the worker (graceful fallback to defaults)

## Bug Fixes

### Bug #1: checkEphemeralIdFraud() Not Using Config
**Discovered**: During "double check agin" verification
**Impact**: 4 hardcoded thresholds prevented user customization
**Fixed**: Commit cc0fa2f - Added config parameter, updated all threshold checks

### Bug #2: Detection Type Classification
**Discovered**: During "double check again" verification
**Impact**: Detection type classification used hardcoded values
**Fixed**: Commit f817113 - Updated 2 threshold checks to use config

## Migration Guide

No migration needed - system is backward compatible:
- Without `FRAUD_CONFIG`: Uses defaults (identical to previous hardcoded values)
- With `FRAUD_CONFIG`: Applies customizations via deep merge

## Best Practices

1. **Start with Defaults** - Monitor production traffic before customizing
2. **Small Changes** - Adjust one threshold at a time to measure impact
3. **Document Rationale** - Keep notes on why you changed specific values
4. **Monitor Metrics** - Track allowed rate, false positives, and user complaints
5. **Version Control** - Store FRAUD_CONFIG values in documentation or infrastructure-as-code

## Troubleshooting

### Configuration Not Applied
**Symptoms**: Changes to FRAUD_CONFIG don't reflect in API
**Causes**:
- Invalid JSON syntax
- Worker hasn't restarted (wait 1-2 minutes for propagation)
- Environment variable set in wrong deployment/environment

**Debug**:
```bash
# Check if customized flag is true
curl -s https://form.erfi.dev/api/config | jq '.customized'

# Check specific value
curl -s https://form.erfi.dev/api/config | jq '.data.risk.blockThreshold'
```

### Unexpected Blocking
**Symptoms**: Legitimate users blocked after config change
**Causes**: Threshold too strict

**Solution**:
1. Check analytics for blocked validations
2. Review risk score breakdown
3. Temporarily increase threshold:
   ```json
   {"risk": {"blockThreshold": 80}}
   ```
4. Monitor for 24-48 hours
5. Adjust individual component weights if needed

### Deep Merge Not Working
**Symptoms**: Setting one value changes others
**Causes**: Incorrect nesting or object structure

**Example Problem**:
```json
{
  "risk": {
    "weights": 0.5  // ❌ Wrong: Not an object
  }
}
```

**Correct**:
```json
{
  "risk": {
    "weights": {
      "emailFraud": 0.25  // ✅ Correct: Nested object
    }
  }
}
```

## Files

- `src/lib/config.ts` - Configuration definition and merge logic
- `src/routes/config.ts` - API endpoint exposing configuration
- `frontend/src/hooks/useConfig.ts` - React hook for configuration
- `src/lib/types.ts` - TypeScript interfaces (Env with FRAUD_CONFIG)

## API Reference

### GET /api/config

Returns current fraud detection configuration.

**Authentication**: None required (public endpoint)

**Response**:
```json
{
  "success": true,
  "version": "2.0.0",
  "customized": boolean,  // true if FRAUD_CONFIG set
  "data": FraudDetectionConfig
}
```

**Example**:
```bash
curl https://form.erfi.dev/api/config | jq '.data.risk.blockThreshold'
```

## Future Enhancements

Potential features (not implemented):
- Per-route configuration (different thresholds for different forms)
- Time-based configuration (stricter at night, lenient during business hours)
- Dynamic thresholds based on historical traffic patterns
- Configuration versioning and rollback
- Real-time configuration updates without deployment

## Support

**Documentation**: See `CLAUDE.md` for full project details
**Issues**: Report at https://github.com/anthropics/claude-code/issues
**Production URL**: https://form.erfi.dev

---

**Last Verified**: 2025-11-16
**Verification**: Code review, TypeScript compilation, production API testing
**Status**: ✅ All tests passed, zero hardcoded values remain
