# Risk Scoring System: Re-Normalization Impact Analysis

> **Note**: All weights and thresholds shown below are **default values** and are fully configurable. See [CONFIGURATION-SYSTEM.md](./CONFIGURATION-SYSTEM.md) for customization options.

## Weight Changes

### Before (Over-weighted at 115%)
| Component | Old Weight | Example Contribution (high risk) |
|-----------|------------|----------------------------------|
| Token Replay | 40% | 40 points |
| Email Fraud | 20% | 20 points (100 score) |
| Ephemeral ID | 20% | 20 points (100 score) |
| Validation Frequency | 15% | 15 points (100 score) |
| IP Diversity | 10% | 10 points (100 score) |
| JA4 Session Hopping | 10% | 10 points (100 score) |
| **Total** | **115%** | **115 points → capped at 100** |

### After (Normalized to 100%)
| Component | New Weight | Change | Example Contribution (high risk) |
|-----------|------------|--------|----------------------------------|
| Token Replay | 32% | -8% | 32 points |
| Email Fraud | 16% | -4% | 16 points (100 score) |
| Ephemeral ID | 17% | -3% | 17 points (100 score) |
| Validation Frequency | 12% | -3% | 12 points (100 score) |
| IP Diversity | 8% | -2% | 8 points (100 score) |
| JA4 Session Hopping | 7% | -3% | 7 points (100 score) |
| IP Rate Limit | 8% | +8% | 8 points (100 score) |
| **Total** | **100%** | **0%** | **100 points (no cap needed)** |

## Test Scenarios

### Scenario 1: Token Replay (Instant Block)
**Before**: 40 points → **100** (instant block logic)
**After**: 32 points → **100** (instant block logic)
**Impact**: ✅ **No change** - instant block logic overrides weight

### Scenario 2: Email Fraud Only (High Risk)
**Before**: 100 * 0.20 = **20 points**
**After**: 100 * 0.16 = **16 points**
**Impact**: ✅ **Still below threshold** (70) - correctly allows

### Scenario 3: Multiple Ephemeral IDs
**Before**: 100 * 0.20 = **20 points**
**After**: 100 * 0.17 = **17 points**
**Impact**: ✅ **Still below threshold** alone, but triggers block via blockTrigger logic

### Scenario 4: Combined Fraud (2 ephemeral IDs + 3 validations + email 60)
**Before**:
- Ephemeral (70): 70 * 0.20 = 14 points
- Validation (100): 100 * 0.15 = 15 points
- Email (60): 60 * 0.20 = 12 points
- **Total**: 41 points → ❌ **Allowed** (under 70)

**After**:
- Ephemeral (70): 70 * 0.17 = 11.9 points
- Validation (100): 100 * 0.12 = 12 points
- Email (60): 60 * 0.16 = 9.6 points
- **Total**: 33.5 points → ❌ **Allowed** (under 70)

**Impact**: ✅ **Same behavior** - correctly allows, blockTrigger logic would handle if threshold crossed

### Scenario 5: High-Risk Combo (3+ ephemeral + 3+ validations + proxy)
**Before**:
- Ephemeral (100): 100 * 0.20 = 20 points
- Validation (100): 100 * 0.15 = 15 points
- IP Diversity (100): 100 * 0.10 = 10 points
- JA4 (100): 100 * 0.10 = 10 points
- **Total**: 55 points → ❌ **Allowed** (under 70, but blockTrigger ensures ≥70)

**After**:
- Ephemeral (100): 100 * 0.17 = 17 points
- Validation (100): 100 * 0.12 = 12 points
- IP Diversity (100): 100 * 0.08 = 8 points
- JA4 (100): 100 * 0.07 = 7 points
- **Total**: 44 points → ❌ **Allowed** (under 70, but blockTrigger ensures ≥70)

**Impact**: ✅ **No change** - blockTrigger logic ensures blocked attempts score ≥70*

> *Core block triggers (ephemeral ID, validation frequency, IP diversity, JA4, token replay, IP rate limit) force the recalculated score up to the block threshold or higher. Operational triggers such as `turnstile_failed` and `duplicate_email` still block immediately earlier in the pipeline, so their logged scores can sit slightly below 70 even though the user already received a block response.*

### Scenario 6: All Signals High (Except Token Replay)
**Before**:
- Email (90): 90 * 0.20 = 18 points
- Ephemeral (100): 100 * 0.20 = 20 points
- Validation (100): 100 * 0.15 = 15 points
- IP Diversity (100): 100 * 0.10 = 10 points
- JA4 (100): 100 * 0.10 = 10 points
- **Total**: 73 points → ✅ **Blocked** (over 70)

**After**:
- Email (90): 90 * 0.16 = 14.4 points
- Ephemeral (100): 100 * 0.17 = 17 points
- Validation (100): 100 * 0.12 = 12 points
- IP Diversity (100): 100 * 0.08 = 8 points
- JA4 (100): 100 * 0.07 = 7 points
- **Total**: 58.4 points → ❌ **Allowed** (under 70)

**Impact**: ⚠️ **Potential change** - this edge case would be allowed instead of blocked. This scenario is extremely unlikely (all 5 signals at max, no blockTrigger). In practice, any single high signal would trigger blockTrigger logic.
