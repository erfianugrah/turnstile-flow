# Missing or Unverified Features

This document tracks features mentioned in documentation or removed editorial content that may not be fully implemented. Features are categorized by verification status and implementation priority.

---

## Already Implemented (Needs Verification)

These features are referenced in code documentation but should be verified against actual implementation:

### Action Parameter
**Location**: `frontend/src/components/TurnstileWidget.tsx`
**Expected**: `action: 'submit-form'` in widget config
**Verification**: Check line 190 in cleaned TURNSTILE.md references line 190 in actual file
**Benefit**: Differentiate between multiple forms, better analytics in Cloudflare dashboard
**Status**: ✅ Documented as implemented

### Interactive Callbacks
**Location**: `frontend/src/components/TurnstileWidget.tsx`
**Expected**: `before-interactive-callback` and `after-interactive-callback` implemented
**Verification**: Check callbacks list around line 29 in actual file
**Benefit**: Show loading states when interactive challenge appears
**Status**: ✅ Documented as implemented (line 48-49 in TURNSTILE.md)

### Tabindex for Accessibility
**Location**: `frontend/src/components/TurnstileWidget.tsx`
**Expected**: `tabindex: 0` in widget config
**Verification**: Check line 31 in actual file
**Benefit**: Improved keyboard navigation and accessibility compliance
**Status**: ✅ Documented as implemented (line 31 in TURNSTILE.md)

### Testing Mode Bypass
**Location**: `wrangler.jsonc` vars and `.dev.vars`
**Expected**: `ALLOW_TESTING_BYPASS` environment variable
**Verification**: Check wrangler.jsonc and .dev.vars.example
**Benefit**: Enable testing without consuming Turnstile API credits
**Status**: ✅ Documented as implemented (lines 332-352 in TURNSTILE.md)

---

## Quick Wins (< 10 minutes)

Features that can be implemented quickly with minimal effort:

### Resource Hints (Preconnect)
**Effort**: 1 minute
**Priority**: High
**Impact**: Medium (reduces Turnstile load time)

**Implementation**:
```html
<!-- Add to frontend/src/pages/index.astro in <head> section -->
<link rel="preconnect" href="https://challenges.cloudflare.com">
```

**Benefit**: Establishes early connection to Cloudflare, reducing widget load time

**Source**: Removed from TURNSTILE.md lines 944-958 (Enhancement Opportunities section)

---

### Test Sitekeys Documentation
**Effort**: 5 minutes
**Priority**: Medium
**Impact**: Medium (better development experience)

**Implementation**:
```bash
# Add to .dev.vars.example
# Optional: Use testing keys for development (no conflicts with dev tools)
# Always pass (visible):
# TURNSTILE-SECRET-KEY=1x0000000000000000000000000000000AA
# TURNSTILE-SITE-KEY=1x00000000000000000000AA

# Always fail (visible):
# TURNSTILE-SECRET-KEY=2x0000000000000000000000000000000AA
# TURNSTILE-SITE-KEY=2x00000000000000000000AB

# Force interactive challenge:
# TURNSTILE-SITE-KEY=3x00000000000000000000FF
```

**Benefit**: Predictable testing scenarios, no conflicts with browser dev tools

**Source**: Removed from TURNSTILE.md lines 1024-1056 (Enhancement Opportunities section)

---

## Future Enhancements (Optional)

Features that could improve the system but are not critical:

### Idempotency Key for Siteverify
**Effort**: 10 minutes
**Priority**: Medium
**Impact**: Low (safer retry logic)

**Implementation** in `src/lib/turnstile.ts`:
```typescript
import { randomUUID } from 'crypto';

const idempotencyKey = randomUUID();

const response = await fetch(
  'https://challenges.cloudflare.com/turnstile/v0/siteverify',
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      secret: env['TURNSTILE-SECRET-KEY'],
      response: token,
      remoteip: ip,
      idempotency_key: idempotencyKey,
    }),
  }
);
```

**Benefit**: Safe retries on network failures, prevents duplicate validation logging

**Source**: Removed from TURNSTILE.md lines 1059-1090 (Enhancement Opportunities section)

---

### Token Age Validation
**Effort**: 5 minutes
**Priority**: Low
**Impact**: Low (better debugging)

**Implementation** in `src/lib/turnstile.ts` after successful validation:
```typescript
const challengeTime = new Date(result.challenge_ts);
const now = new Date();
const ageMinutes = (now.getTime() - challengeTime.getTime()) / (1000 * 60);

if (ageMinutes > 4) {
  logger.warn('Token age warning', {
    ageMinutes: ageMinutes.toFixed(1),
    threshold: '5 minutes'
  });
}
```

**Benefit**: Early warning for slow form submissions, better debugging for timeout errors

**Source**: Removed from TURNSTILE.md lines 1093-1117 (Enhancement Opportunities section)

---

### Enhanced Logging and Monitoring
**Effort**: 30 minutes
**Priority**: Low
**Impact**: Medium (better observability)

**Implementation**:

Add monitoring queries to a separate monitoring script or dashboard:

```sql
-- Active blacklist entries
SELECT COUNT(*) FROM fraud_blacklist
WHERE expires_at > datetime('now');

-- Block rate (should be <5% for legitimate traffic)
SELECT
  SUM(CASE WHEN allowed = 0 THEN 1 ELSE 0 END) * 100.0 / COUNT(*) as block_rate
FROM turnstile_validations
WHERE created_at > datetime('now', '-1 hour');

-- JA4 clustering events
SELECT ja4, COUNT(DISTINCT ephemeral_id) as ids
FROM submissions
WHERE created_at > datetime('now', '-1 hour')
GROUP BY ja4
HAVING ids >= 2;
```

**Benefit**: Proactive fraud detection monitoring, performance tracking

**Source**: Removed from FRAUD-DETECTION.md lines 772-792 (Monitoring Recommendations section)

---

## Not Recommended

These features were explicitly marked as "not recommended" in removed content:

### cData Parameter
**Reason**: Comprehensive metadata extraction (40+ fields) already implemented. Adding cData doesn't provide additional value.

### Custom Retry/Refresh Configuration
**Reason**: Default auto-retry and auto-refresh behavior is optimal. Error callbacks handle edge cases.

### Specific Language Override
**Reason**: `auto` respects user's browser language preference, providing the best experience.

### Pre-clearance Mode
**Reason**: Pre-clearance is for `cf_clearance` cookies for WAF/firewall bypass. This system uses Turnstile for form protection, not site-wide clearance.

---

## Features Removed as Editorial

These were documentation sections removed because they were recommendations or research, not implementation:

### Implicit vs Explicit Rendering Analysis
**Source**: TURNSTILE.md lines 1-105
**Reason**: Decision already made (explicit rendering). Historical analysis not needed in implementation docs.

### Configuration Strategy Recommendations
**Source**: TURNSTILE.md lines 106-172
**Reason**: Actual configuration documented in "Our Implementation" section. Recommendations removed.

### Advanced Features Examples
**Source**: TURNSTILE.md lines 473-578
**Reason**: Example code for unimplemented features. Dark mode sync, form validation flow, analytics integration need verification.

### Security Considerations Checklist
**Source**: TURNSTILE.md lines 729-746
**Reason**: Redundant with "Security Implementation" section. Checklists with checkmarks removed.

### Accessibility Recommendations
**Source**: TURNSTILE.md lines 806-835
**Reason**: Recommendations removed. Actual implementation should be verified and documented in main sections.

### Final Recommendations & Next Steps
**Source**: TURNSTILE.md lines 839-899
**Reason**: Editorial recommendations and todo lists that are obsolete since system is implemented.

### Core Principles and Key Metrics
**Source**: FRAUD-DETECTION.md lines 24-38
**Reason**: Editorial/marketing content. Actual metrics folded into technical sections.

### Design Rationale Sections
**Source**: FRAUD-DETECTION.md lines 590-602 ("Why 24h Maximum?")
**Reason**: Design justification removed. Implementation should be self-explanatory.

### Summary and Conclusion
**Source**: FRAUD-DETECTION.md lines 754-792
**Reason**: Editorial summary with system strengths/weaknesses checklist. Removed for factual focus.

---

## Verification Checklist

Before marking features as "fully implemented", verify:

- [ ] Resource hints - Check `frontend/src/pages/index.astro` for preconnect link
- [ ] Action parameter - Verify line 190 in `frontend/src/components/TurnstileWidget.tsx`
- [ ] Interactive callbacks - Verify lines 48-49 callbacks in widget config
- [ ] Tabindex - Verify line 31 in widget config
- [ ] Test sitekeys - Check `.dev.vars.example` for documentation
- [ ] Testing bypass - Verify `ALLOW_TESTING_BYPASS` in wrangler.jsonc
- [ ] Dark mode sync - Check if MutationObserver implementation exists
- [ ] Form validation flow - Verify client-side validation before Turnstile execution
- [ ] Analytics integration - Check if Turnstile events are tracked
- [ ] Error handling - Cross-reference `src/lib/turnstile-errors.ts` with documented errors

---

## Implementation Priority

### Immediate (Do Now)
1. ✅ Verify all "Already Implemented" features against actual code
2. ⚡ Add resource hints (preconnect) - 1 minute
3. 📝 Document test sitekeys in .dev.vars.example - 5 minutes

### Short Term (Next Sprint)
4. 🔄 Implement idempotency key (if frequent network issues observed)
5. 📊 Add token age validation warnings
6. 🎯 Enhance monitoring with SQL queries

### Long Term (Future Consideration)
7. 🔍 Review analytics integration completeness
8. ♿ Audit accessibility beyond tabindex
9. 🎨 Verify dark mode synchronization works as expected

---

## Notes

- All removed content is preserved in git history if needed
- Features should only be added to implementation docs after verification
- This document should be updated as features are implemented or verified
- Consider creating a ROADMAP.md for planned features vs this document for verification
