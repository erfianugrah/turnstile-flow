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
| Token Replay | 28% | -12% | 28 points (still instant block) |
| Email Fraud | 14% | -6% | 14 points (100 score) |
| Ephemeral ID | 15% | -5% | 15 points (100 score) |
| Validation Frequency | 10% | -5% | 10 points (100 score) |
| IP Diversity | 7% | -3% | 7 points (100 score) |
| JA4 Session Hopping | 6% | -4% | 6 points (100 score) |
| IP Rate Limit | 7% | -1% | 7 points (100 score) |
| Header Fingerprint | 7% | +7% | 7 points (100 score) |
| TLS Anomaly | 4% | +4% | 4 points (100 score) |
| Latency Mismatch | 2% | +2% | 2 points (100 score) |
| **Total** | **100%** | **0%** | **100 points (no cap needed)** |

## Scoring Modes & Triggers (current runtime)

- **Modes**  
  - `defensive` (default): deterministic triggers can floor the score to `blockThreshold` once paired conditions are met (see `qualifiesForDeterministicBlock` in `src/lib/scoring.ts`).  
  - `additive`: disables deterministic floors; only the weighted sum matters.

- **Force-block triggers**: `token_replay`, `turnstile_failed` → force score to 100.
- **Deterministic triggers (defensive mode only)**: `email_fraud`, `ephemeral_id_fraud`, `validation_frequency`, `ja4_session_hopping`, `duplicate_email`, `repeat_offender`.
- **Behavior-only signals**: `ip_rate_limit` and `ip_diversity` never block alone; they only contribute to the weighted total to avoid shared-IP false positives.
- **Fingerprint triggers**: `header_fingerprint`, `tls_anomaly`, `latency_mismatch` set the recorded `blockTrigger` when non-zero so analytics show the primary cause, but they still require the weighted total (or another deterministic trigger) to reach `blockThreshold`.

### Trigger Outcomes by Mode (truth table)

| Trigger | Defensive mode (`risk.mode=defensive`) | Additive mode (`risk.mode=additive`) | Notes |
|---------|-----------------------------------------|---------------------------------------|-------|
| `token_replay` | Forced to 100 (always block) | Forced to 100 (always block) | Turnstile replay, Phase 1 |
| `turnstile_failed` | ≥ blockThreshold (often 100) | ≥ blockThreshold (often 100) | External service failure |
| `email_fraud` | Floors to blockThreshold once paired check passes | Weighted sum only | Uses Markov-Mail RPC score |
| `ephemeral_id_fraud` | Floors to blockThreshold once paired check passes | Weighted sum only | Submission count threshold |
| `validation_frequency` | Floors to blockThreshold once paired check passes | Weighted sum only | Rapid Turnstile attempts |
| `ja4_session_hopping` | Floors to blockThreshold once paired check passes | Weighted sum only | Same-browser session hopping |
| `duplicate_email` | Floors near blockThreshold (block) | Weighted sum only | 409 Conflict earlier in pipeline |
| `repeat_offender` | Floors to blockThreshold (block) | Weighted sum only | Short-circuits repeat abuse |
| `header_fingerprint` | Attribution only; needs weighted total ≥ threshold | Attribution only; needs weighted total ≥ threshold | Reused header stack |
| `tls_anomaly` | Attribution only; needs weighted total ≥ threshold | Attribution only; needs weighted total ≥ threshold | New TLS hash for JA4 |
| `latency_mismatch` | Attribution only; needs weighted total ≥ threshold | Attribution only; needs weighted total ≥ threshold | Impossible RTT/device |
| `ip_diversity` | Weighted-only; cannot force block | Weighted-only; cannot force block | Keeps shared-IP cases from hard blocking |
| `ip_rate_limit` | Weighted-only; cannot force block | Weighted-only; cannot force block | Prevents shared-IP false positives |

## Component Reference: What Each Score Means

| Component | Signal source | Window / threshold | Normalization to 0–100 | Block role |
|-----------|---------------|---------------------|------------------------|------------|
| Token Replay | Turnstile token hash reuse (DB uniqueness) | Instant check; any reuse | 0 or 100 | **Force block** (always 100) |
| Email Fraud | Markov-Mail RPC risk score (0–1) | Per email | RPC score × 100 | Deterministic in defensive mode; can block alone |
| Ephemeral ID | Submission count per `ephemeral_id` | 24h, threshold 2 | 1→10, 2→70, ≥3→100 | Deterministic in defensive mode when paired |
| Validation Frequency | Turnstile attempts per `ephemeral_id` | 1h, warn=2, block=3 | 1→0, 2→40, ≥3→100 | Deterministic in defensive mode when paired |
| IP Diversity | Unique IPs per `ephemeral_id` | 24h, threshold 2 | 1→0, 2→50, ≥3→100 | Weighted-only (supports score; not a trigger) |
| JA4 Session Hopping | JA4 clustering + velocity | 5m (rapid), 1h (extended), 1h IP cluster | Raw 0–230 → normalized; ≥140 treated as hopping | Deterministic in defensive mode when paired |
| IP Rate Limit | Submission count per IP (any fingerprints) | 1h; risk curve 1→0, 2→25, 3→50, 4→75, 5+→100 | Direct curve above | **Never blocks alone** (behavioral weight only) |
| Header Fingerprint | FNV-1a hash of non-sensitive headers across IP/JA4/email | 60 min; min 3 requests, 2 IPs, 2 JA4 | 0 or 100 | Attribution trigger; still needs total ≥ threshold |
| TLS Anomaly | JA4 + TLS extension hash baseline | 24h baseline; min 5 JA4 samples | 0 or 100 | Attribution trigger; still needs total ≥ threshold |
| Latency Mismatch | RTT vs claimed mobile platform/device | Single request; <6 ms on mobile/ASN list | 0 or 80 (configurable) | Attribution trigger; still needs total ≥ threshold |

Interpretation:
- “Deterministic when paired” means the total is floored to `blockThreshold` in defensive mode once the component plus its paired condition qualifies (see `qualifiesForDeterministicBlock`).
- Attribution triggers set `blockTrigger` for logging/analytics so the UI shows the root cause, but do not override the threshold by themselves.

## Test Scenarios

### Scenario 1: Token Replay (Instant Block)
**Before**: 40 points → **100** (instant block logic)
**After**: 28 points → **100** (instant block logic)
**Impact**: ✅ **No change** - instant block logic overrides weight

### Scenario 2: Email Fraud Only (High Risk)
**Before**: 100 * 0.20 = **20 points**
**After**: 100 * 0.14 = **14 points**
**Impact**: ✅ **Still below threshold** (70) - correctly allows

### Scenario 3: Multiple Ephemeral IDs
**Before**: 100 * 0.20 = **20 points**
**After**: 100 * 0.15 = **15 points**
**Impact**: ✅ **Still below threshold** alone, but triggers block via blockTrigger logic

### Scenario 4: Combined Fraud (2 ephemeral IDs + 3 validations + email 60)
**Before**:
- Ephemeral (70): 70 * 0.20 = 14 points
- Validation (100): 100 * 0.15 = 15 points
- Email (60): 60 * 0.20 = 12 points
- **Total**: 41 points → ❌ **Allowed** (under 70)

**After**:
- Ephemeral (70): 70 * 0.15 = 10.5 points
- Validation (100): 100 * 0.10 = 10 points
- Email (60): 60 * 0.14 = 8.4 points
- **Total**: 28.9 points → ❌ **Allowed** (under 70)

**Impact**: ✅ **Same behavior** - correctly allows, blockTrigger logic would handle if threshold crossed

### Scenario 5: High-Risk Combo (3+ ephemeral + 3+ validations + proxy)
**Before**:
- Ephemeral (100): 100 * 0.20 = 20 points
- Validation (100): 100 * 0.15 = 15 points
- IP Diversity (100): 100 * 0.10 = 10 points
- JA4 (100): 100 * 0.10 = 10 points
- **Total**: 55 points → ❌ **Allowed** (under 70; needs another signal to block)

**After**:
- Ephemeral (100): 100 * 0.15 = 15 points
- Validation (100): 100 * 0.10 = 10 points
- IP Diversity (100): 100 * 0.07 = 7 points
- JA4 (100): 100 * 0.06 = 6 points
- **Total**: 38 points → ❌ **Allowed** (under 70; needs another signal like email/fingerprint/IP velocity to block)

**Impact**: ✅ **No change** – still allowed unless combined with another strong signal.

> Deterministic floors apply only to token replay, turnstile failure, email/ephemeral/validation/JA4 triggers, duplicate email, and repeat offender. IP diversity and IP rate limit are weighted-only; they cannot force the score over the threshold by themselves.

### Scenario 6: All Signals High (Except Token Replay)
**Before**:
- Email (90): 90 * 0.20 = 18 points
- Ephemeral (100): 100 * 0.20 = 20 points
- Validation (100): 100 * 0.15 = 15 points
- IP Diversity (100): 100 * 0.10 = 10 points
- JA4 (100): 100 * 0.10 = 10 points
- **Total**: 73 points → ✅ **Blocked** (over 70)

**After**:
- Email (90): 90 * 0.14 = 12.6 points
- Ephemeral (100): 100 * 0.15 = 15 points
- Validation (100): 100 * 0.10 = 10 points
- IP Diversity (100): 100 * 0.07 = 7 points
- JA4 (100): 100 * 0.06 = 6 points
- IP Rate Limit (100): 100 * 0.07 = 7 points
- Header Fingerprint (100): 100 * 0.07 = 7 points
- TLS Anomaly (100): 100 * 0.04 = 4 points
- Latency Mismatch (100): 100 * 0.02 = 2 points
- **Total**: 70.6 points → ✅ **Blocked** (over 70)

**Impact**: ✅ **Stronger protection** - when the behavioral and fingerprint signals all agree, the nine non-token components sum to 72 points, so the block threshold is satisfied even if token replay never fires.
