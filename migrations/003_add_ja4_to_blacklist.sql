-- Migration 003: Add JA4 fingerprint support to fraud_blacklist table
-- This enables blocking by JA4 fingerprint for session-hopping detection
-- Created: 2025-11-14

-- Add ja4 column to fraud_blacklist table
ALTER TABLE fraud_blacklist ADD COLUMN ja4 TEXT;

-- Create index for efficient JA4 blacklist lookups
CREATE INDEX IF NOT EXISTS idx_blacklist_ja4_expires
ON fraud_blacklist(ja4, expires_at);

-- Verify migration
SELECT COUNT(*) as total_entries,
       SUM(CASE WHEN ja4 IS NOT NULL THEN 1 ELSE 0 END) as ja4_entries
FROM fraud_blacklist;
