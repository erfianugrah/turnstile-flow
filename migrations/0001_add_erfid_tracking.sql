-- ============================================================================
-- Migration 0001: Add Erfid Tracking
-- ============================================================================
-- Version: 1.1.0
-- Date: 2025-11-17
-- Description: Add erfid (Erfi ID) for request lifecycle correlation
-- ============================================================================

-- Add erfid to submissions table
ALTER TABLE submissions ADD COLUMN erfid TEXT;

-- Add erfid to turnstile_validations table
ALTER TABLE turnstile_validations ADD COLUMN erfid TEXT;

-- Add erfid to fraud_blacklist table
ALTER TABLE fraud_blacklist ADD COLUMN erfid TEXT;

-- Create indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_submissions_erfid ON submissions(erfid);
CREATE INDEX IF NOT EXISTS idx_validations_erfid ON turnstile_validations(erfid);
CREATE INDEX IF NOT EXISTS idx_blacklist_erfid ON fraud_blacklist(erfid) WHERE erfid IS NOT NULL;

-- ============================================================================
-- Notes:
-- - erfid is nullable for backward compatibility with existing records
-- - New records MUST include erfid
-- - Format: UUID v4 (e.g., "550e8400-e29b-41d4-a716-446655440000")
-- - Generated server-side using crypto.randomUUID()
-- - Enables correlation of validation attempts, submissions, and blocks
-- - Independent of Cloudflare's cf-ray (we still log cf-ray separately)
-- ============================================================================
