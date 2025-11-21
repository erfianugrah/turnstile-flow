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

## Complete Configuration Reference

**Example File**: [`fraud-config.example.json`](../config/fraud-config.example.json) contains the complete default configuration structure.

### Risk Configuration (`risk`)

Controls overall risk scoring and blocking behavior.

#### `risk.blockThreshold` (default: `70`)

- **Type**: Integer (0-100)
- **Purpose**: Minimum risk score required to block a submission
- **Rationale**: Set at 70 to balance security vs. user experience. Allows medium-risk submissions (40-69) while blocking high-risk (70+)
- **Common Values**:
  - `60`: Lenient (blocks only obvious fraud)
  - `70`: Balanced (recommended default)
  - `80`: Strict (may have false positives)

#### `risk.levels` (default: `{low: {min: 0, max: 39}, medium: {min: 40, max: 69}, high: {min: 70, max: 100}}`)

- **Type**: Object with min/max ranges
- **Purpose**: Define risk level classifications for UI display
- **Rationale**: Standard three-tier risk classification
- **Note**: Should align with blockThreshold (high.min should equal blockThreshold)

#### `risk.weights` (default: weights sum to 1.0)

Component weights for normalized risk scoring. **Must sum to 1.0**.

- **`tokenReplay`** (default: `0.35`): Token replay attack weight (35%)
  - Highest weight because replays are definitive fraud
  - Instant block indicator

- **`emailFraud`** (default: `0.17`): Email pattern fraud weight (17%)
  - Markov-Mail detection: sequential, dated, formatted patterns
  - 83% accuracy, 0% false positives

- **`ephemeralId`** (default: `0.18`): Device tracking weight (18%)
  - Multiple submissions from same device
  - Core fraud signal

- **`validationFrequency`** (default: `0.13`): Validation attempt rate weight (13%)
  - Rapid-fire submission attempts
  - Catches attacks before D1 replication

- **`ipDiversity`** (default: `0.09`): Proxy rotation detection weight (9%)
  - Same device from multiple IPs
  - Lower weight due to legitimate VPN usage

- **`ja4SessionHopping`** (default: `0.08`): Browser hopping detection weight (8%)
  - Incognito mode / browser switching attacks
  - Lower weight due to complexity

### JA4 Signal Configuration (`ja4`)

Thresholds for Cloudflare Bot Management JA4 fingerprint signals. Requires Enterprise plan.

#### `ja4.ipsQuantileThreshold` (default: `0.95`)

- **Type**: Float (0.0-1.0)
- **Purpose**: IP diversity percentile threshold
- **Rationale**: High values indicate widespread JA4 use (legitimate browsers OR proxy networks). 95th percentile catches outliers while allowing Firefox/Chrome
- **Common Values**: `0.90` (lenient), `0.95` (balanced), `0.99` (strict)

#### `ja4.reqsQuantileThreshold` (default: `0.99`)

- **Type**: Float (0.0-1.0)
- **Purpose**: Request volume percentile threshold
- **Rationale**: Only flags top 1% of request generators. Bot networks typically 99th+ percentile
- **Common Values**: `0.95` (lenient), `0.99` (balanced), `0.995` (strict)

#### `ja4.heuristicRatioThreshold` (default: `0.8`)

- **Type**: Float (0.0-1.0)
- **Purpose**: Minimum ratio of bot detections to consider suspicious
- **Rationale**: 80% bot detections indicates likely bot traffic
- **Range**: 0.5-0.9 (lower = more sensitive)

#### `ja4.browserRatioThreshold` (default: `0.2`)

- **Type**: Float (0.0-1.0)
- **Purpose**: Minimum ratio of browser-like behavior
- **Rationale**: <20% browser-like behavior suggests automation
- **Range**: 0.1-0.3 (higher = more lenient)

#### `ja4.h2h3RatioThreshold` (default: `0.9`)

- **Type**: Float (0.0-1.0)
- **Purpose**: HTTP/2-3 protocol usage threshold
- **Rationale**: Modern browsers use HTTP/2-3. High ratio can indicate legitimate traffic or sophisticated bots
- **Range**: 0.7-0.95 (context-dependent)

#### `ja4.cacheRatioThreshold` (default: `0.5`)

- **Type**: Float (0.0-1.0)
- **Purpose**: Cacheable response ratio threshold
- **Rationale**: Bots often have different caching patterns than browsers
- **Range**: 0.3-0.7 (use case dependent)

### Detection Thresholds (`detection`)

Core fraud detection behavior configuration.

#### `detection.ephemeralIdSubmissionThreshold` (default: `2`)

- **Type**: Integer
- **Purpose**: Maximum submissions allowed per device in 24h window
- **Rationale**: Registration forms should only be submitted ONCE. 2+ = definite fraud
- **Common Values**: `2` (strict for registration), `5` (lenient for contact forms), `10` (very lenient)
- **Window**: 24 hours

#### `detection.validationFrequencyBlockThreshold` (default: `3`)

- **Type**: Integer
- **Purpose**: Maximum validation attempts before blocking (1h window)
- **Rationale**: Catches rapid-fire attacks before D1 replication completes
- **Common Values**: `3` (strict), `5` (balanced), `10` (lenient)
- **Window**: 1 hour

#### `detection.validationFrequencyWarnThreshold` (default: `2`)

- **Type**: Integer
- **Purpose**: Validation attempts to trigger warning (not block)
- **Rationale**: Allows one retry for form errors/network issues
- **Common Values**: `2` (standard), `3` (lenient)
- **Window**: 1 hour

#### `detection.ipDiversityThreshold` (default: `2`)

- **Type**: Integer
- **Purpose**: Maximum unique IPs per ephemeral ID in 24h
- **Rationale**: Same device from 2+ IPs = proxy rotation. Legitimate users rarely change IPs within 24h
- **Common Values**: `2` (strict), `3` (balanced), `5` (lenient for mobile users)
- **Window**: 24 hours
- **Note**: VPN changes may trigger false positives (acceptable trade-off)

#### `detection.ja4Clustering`

JA4 session hopping detection for incognito/browser switching attacks.

- **`ipClusteringThreshold`** (default: `2`): Ephemeral IDs from same IP/subnet (1h window)
  - Catches incognito mode from same location
  - IPv6 /64 subnet matching for privacy extensions
  - **Common Values**: `2` (strict), `3` (balanced)

- **`rapidGlobalThreshold`** (default: `3`): Ephemeral IDs globally (5min window)
  - Legitimate users can't create 3 sessions in 5 minutes
  - Catches VPN hopping and IPv4↔IPv6 switching
  - **Common Values**: `3` (strict), `5` (lenient)

- **`rapidGlobalWindowMinutes`** (default: `5`): Rapid detection window
  - Very short window ensures high confidence
  - **Common Values**: `5` (strict), `10` (balanced)

- **`extendedGlobalThreshold`** (default: `5`): Ephemeral IDs globally (1h window)
  - Catches slower, distributed attacks
  - Higher threshold reduces false positives
  - **Common Values**: `5` (balanced), `10` (lenient)

- **`extendedGlobalWindowMinutes`** (default: `60`): Extended detection window
  - Balances detection vs. legitimate multi-device use
  - **Common Values**: `60` (standard), `120` (lenient)

### Timeout Configuration (`timeouts`)

Progressive penalty system for repeat offenders.

#### `timeouts.schedule` (default: `[3600, 14400, 28800, 43200, 86400]`)

- **Type**: Array of integers (seconds)
- **Purpose**: Escalating timeout durations for 1st, 2nd, 3rd, 4th, 5th+ offenses
- **Default Values**:
  - 1st offense: 3600s (1 hour) - Might be legitimate error
  - 2nd offense: 14400s (4 hours) - Suspicious pattern
  - 3rd offense: 28800s (8 hours) - Clear abuse
  - 4th offense: 43200s (12 hours) - Persistent attacker
  - 5th+ offense: 86400s (24 hours) - Maximum deterrent
- **Rationale**: Progressive escalation deters attackers while allowing legitimate user recovery
- **Common Values**: Multiply all by 0.5 (lenient) or 2.0 (strict)

#### `timeouts.maximum` (default: `86400`)

- **Type**: Integer (seconds)
- **Purpose**: Absolute maximum timeout duration
- **Rationale**: 24h respects few-day ephemeral ID lifespan. Long enough to deter, short enough to not permanently block
- **Common Values**: `43200` (12h, lenient), `86400` (24h, balanced), `604800` (7 days, very strict)

---

### Quick Reference (Partial Override Examples)

**Lenient Configuration** (fewer blocks, more user-friendly):

```json
{
	"risk": { "blockThreshold": 80 },
	"detection": {
		"ephemeralIdSubmissionThreshold": 5,
		"validationFrequencyBlockThreshold": 10
	}
}
```

**Strict Configuration** (more blocks, security-focused):

```json
{
	"risk": { "blockThreshold": 60 },
	"detection": {
		"ephemeralIdSubmissionThreshold": 2,
		"validationFrequencyBlockThreshold": 2
	}
}
```

## Usage

### Quick Start

1. **Review complete defaults**: Open [`fraud-config.example.json`](../config/fraud-config.example.json) to see all available configuration options
2. **Identify changes**: Decide which values you want to customize
3. **Create partial override**: Only include the fields you want to change (see examples below)
4. **Deploy**: Set via Cloudflare Dashboard, wrangler CLI, or .dev.vars

**Important**: The configuration system uses **deep merge** - you only need to specify values you want to change. All other values will use defaults from [`fraud-config.example.json`](../config/fraud-config.example.json).

### Setting Custom Configuration

**Note**: All configuration examples below show **partial overrides**. You only need to specify the values you want to change. For the complete default configuration, see [`fraud-config.example.json`](../config/fraud-config.example.json).

**Via Cloudflare Dashboard (Recommended for Production):**

1. Navigate to Workers & Pages → forminator → Settings → Variables
2. Add environment variable: `FRAUD_CONFIG`
3. Value (JSON string - partial override example):

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
const threshold = config.risk.blockThreshold; // 80 (custom) or 70 (default)
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
	"data": {
		/* full configuration */
	}
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
	"risk": { "blockThreshold": 75 } // Stricter (was 70)
}
```

### 2. Fine-Tuning Based on Traffic

Adjust based on production abuse patterns:

```json
{
	"detection": {
		"validationFrequencyBlockThreshold": 5, // More lenient (was 3)
		"ephemeralIdSubmissionThreshold": 3 // More lenient (was 2)
	}
}
```

### 3. Email Fraud Focus

Increase email fraud detection weight:

```json
{
	"risk": {
		"weights": {
			"emailFraud": 0.3, // Increase from 0.17
			"tokenReplay": 0.32 // Decrease from 0.35 (keep sum = 1.0)
		}
	}
}
```

### 4. JA4 Sensitivity Adjustment

Reduce false positives for popular browsers:

```json
{
	"ja4": {
		"ipsQuantileThreshold": 0.99, // More lenient (was 0.95)
		"reqsQuantileThreshold": 0.995 // More lenient (was 0.99)
	}
}
```

### 5. Progressive Hardening

Start lenient, tighten based on abuse:

```json
{
	"risk": { "blockThreshold": 60 }, // Week 1: Lenient
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
   { "risk": { "blockThreshold": 80 } }
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
		"weights": 0.5 // ❌ Wrong: Not an object
	}
}
```

**Correct**:

```json
{
	"risk": {
		"weights": {
			"emailFraud": 0.25 // ✅ Correct: Nested object
		}
	}
}
```

## Files

- **[`fraud-config.example.json`](../config/fraud-config.example.json)** - Complete configuration example with all fields and default values
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

**Production URL**: https://form.erfi.dev

---
