-- Migration: Add detection_type and risk_score_breakdown columns
-- Date: 2025-11-15
-- Phase: 1.5 - Blocked Attempt Scoring & Analytics Fixes

-- Add detection_type column to turnstile_validations
ALTER TABLE turnstile_validations
ADD COLUMN detection_type TEXT;

-- Add risk_score_breakdown column to turnstile_validations
ALTER TABLE turnstile_validations
ADD COLUMN risk_score_breakdown TEXT;

-- Add detection_type column to fraud_blacklist
ALTER TABLE fraud_blacklist
ADD COLUMN detection_type TEXT;

-- Possible detection_type values:
-- - 'token_replay'           - Token already used
-- - 'ephemeral_id_fraud'     - Multiple submissions from same device
-- - 'ja4_session_hopping'    - Browser/incognito hopping
-- - 'ip_diversity'           - Same device, multiple IPs
-- - 'validation_frequency'   - Too many validation attempts
-- - 'turnstile_failed'       - Turnstile validation failed
-- - 'duplicate_email'        - Email already registered
-- - null                     - Allowed submission

-- Add indexes for analytics queries
CREATE INDEX IF NOT EXISTS idx_validations_detection_type
ON turnstile_validations(detection_type);

CREATE INDEX IF NOT EXISTS idx_blacklist_detection_type
ON fraud_blacklist(detection_type);

-- Backfill existing turnstile_validations records (best effort based on block_reason patterns)
UPDATE turnstile_validations
SET detection_type = CASE
  WHEN allowed = 0 AND block_reason LIKE '%Token replay%' THEN 'token_replay'
  WHEN allowed = 0 AND (block_reason LIKE '%Ephemeral%' OR block_reason LIKE '%Automated:%') THEN 'ephemeral_id_fraud'
  WHEN allowed = 0 AND (block_reason LIKE '%JA4%' OR block_reason LIKE '%session hopping%') THEN 'ja4_session_hopping'
  WHEN allowed = 0 AND block_reason LIKE '%Turnstile%' THEN 'turnstile_failed'
  WHEN allowed = 0 AND block_reason LIKE '%Duplicate email%' THEN 'duplicate_email'
  WHEN allowed = 0 AND (block_reason LIKE '%IP%' OR block_reason LIKE '%proxy%') THEN 'ip_diversity'
  ELSE NULL
END
WHERE detection_type IS NULL AND allowed = 0;

-- Backfill existing fraud_blacklist records
UPDATE fraud_blacklist
SET detection_type = CASE
  WHEN block_reason LIKE '%JA4%' OR block_reason LIKE '%session hopping%' THEN 'ja4_session_hopping'
  WHEN block_reason LIKE '%Automated:%' OR block_reason LIKE '%Multiple submissions%' THEN 'ephemeral_id_fraud'
  ELSE NULL
END
WHERE detection_type IS NULL;
