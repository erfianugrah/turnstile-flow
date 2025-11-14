-- Rollback Migration 003: Remove JA4 fingerprint support
-- This reverts the addition of ja4 column to fraud_blacklist table

-- Drop the JA4 index
DROP INDEX IF EXISTS idx_blacklist_ja4_expires;

-- Note: SQLite does not support DROP COLUMN
-- For full rollback, would need to recreate table without ja4 column
-- Since ja4 column being NULL is harmless, we only drop the index
-- and leave the column in place for backwards compatibility

-- If hard rollback is required, use these steps:
-- 1. Create new table without ja4 column
-- 2. Copy data from old table to new table
-- 3. Drop old table
-- 4. Rename new table to old name

-- For now, just verify the index is dropped
SELECT name FROM sqlite_master
WHERE type='index'
AND name='idx_blacklist_ja4_expires';
-- Should return no rows if rollback successful
