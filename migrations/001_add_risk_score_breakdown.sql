-- Migration: Add risk_score_breakdown column to submissions table
-- Date: 2025-11-15
-- Phase: 1 - Risk Score Normalization

-- Add risk_score_breakdown column (stores JSON with breakdown components)
ALTER TABLE submissions
ADD COLUMN risk_score_breakdown TEXT;

-- Update existing records with default breakdown (preserving any existing risk_score from turnstile_validations)
-- Note: Existing submissions won't have detailed breakdown, this provides a baseline
UPDATE submissions
SET risk_score_breakdown = json_object(
  'total', 0,
  'tokenReplay', 0,
  'emailFraud', 0,
  'ephemeralId', 0,
  'validationFrequency', 0,
  'ipDiversity', 0,
  'ja4SessionHopping', 0,
  'legacy', 1,
  'migrated_at', datetime('now')
)
WHERE risk_score_breakdown IS NULL;
