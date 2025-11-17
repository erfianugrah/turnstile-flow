# Database Operations Guide

Complete guide to managing the D1 database for the Turnstile Flow application.

## Table of Contents

- [Overview](#overview)
- [Database Configuration](#database-configuration)
- [Common Operations](#common-operations)
  - [Viewing Data](#viewing-data)
  - [Cleaning Data](#cleaning-data)
  - [Analytics Queries](#analytics-queries)
  - [Fraud Management](#fraud-management)
- [Schema Management](#schema-management)
- [Backup & Restore](#backup--restore)
- [Troubleshooting](#troubleshooting)

---

## Overview

The application uses **Cloudflare D1**, a serverless SQLite database. All database operations use the `wrangler d1` CLI.

**Database Name:** `DB` (configured in wrangler.jsonc)
**Database ID:** `f36739a7-badb-456f-bbab-da0732722cae`

**Tables:**
1. `submissions` - Form submissions (42 fields)
2. `turnstile_validations` - Token validation attempts (35 fields)
3. `fraud_blacklist` - Blocked ephemeral IDs/IPs (9 fields)

---

## Database Configuration

### wrangler.jsonc Configuration

```jsonc
{
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "DB",
      "database_id": "f36739a7-badb-456f-bbab-da0732722cae",
      "remote": true
    }
  ]
}
```

### Connecting to Database

```bash
# Execute a single command (remote/production)
wrangler d1 execute DB --command="SELECT COUNT(*) FROM submissions" --remote

# Execute SQL file (remote/production)
wrangler d1 execute DB --file=./schema.sql --remote

# Local development (omit --remote)
wrangler d1 execute DB --command="SELECT * FROM submissions"
```

**Note:** Always use `--remote` for production database operations.

---

## Common Operations

### Viewing Data

#### Count Records

```bash
# Count submissions
wrangler d1 execute DB --command="SELECT COUNT(*) as total FROM submissions" --remote

# Count validations
wrangler d1 execute DB --command="SELECT COUNT(*) as total FROM turnstile_validations" --remote

# Count blocked entries
wrangler d1 execute DB --command="SELECT COUNT(*) as total FROM fraud_blacklist" --remote

# All counts in one query
wrangler d1 execute DB --command="
  SELECT 'submissions' as table_name, COUNT(*) as count FROM submissions
  UNION ALL
  SELECT 'validations', COUNT(*) FROM turnstile_validations
  UNION ALL
  SELECT 'blacklist', COUNT(*) FROM fraud_blacklist
" --remote
```

#### View Recent Submissions

```bash
# Last 10 submissions
wrangler d1 execute DB --command="
  SELECT
    id,
    first_name,
    last_name,
    email,
    country,
    created_at
  FROM submissions
  ORDER BY created_at DESC
  LIMIT 10
" --remote

# Last 10 with ephemeral ID
wrangler d1 execute DB --command="
  SELECT
    id,
    email,
    ephemeral_id,
    bot_score,
    country,
    created_at
  FROM submissions
  ORDER BY created_at DESC
  LIMIT 10
" --remote
```

#### View Blocked Submissions

```bash
# View current fraud blacklist
wrangler d1 execute DB --command="
  SELECT
    ephemeral_id,
    ip_address,
    block_reason,
    detection_confidence,
    submission_count,
    blocked_at,
    expires_at,
    CAST((julianday(expires_at) - julianday('now')) * 24 AS INTEGER) as hours_remaining
  FROM fraud_blacklist
  WHERE expires_at > datetime('now')
  ORDER BY blocked_at DESC
" --remote

# View blocked validation attempts
wrangler d1 execute DB --command="
  SELECT
    id,
    ephemeral_id,
    remote_ip,
    block_reason,
    risk_score,
    created_at
  FROM turnstile_validations
  WHERE allowed = 0
  ORDER BY created_at DESC
  LIMIT 20
" --remote
```

#### View by Country

```bash
# Submissions by country
wrangler d1 execute DB --command="
  SELECT
    country,
    COUNT(*) as count
  FROM submissions
  GROUP BY country
  ORDER BY count DESC
" --remote
```

#### View Bot Scores

```bash
# Bot score distribution
wrangler d1 execute DB --command="
  SELECT
    CASE
      WHEN bot_score >= 80 THEN '80-100 (Low Risk)'
      WHEN bot_score >= 50 THEN '50-79 (Medium Risk)'
      WHEN bot_score >= 20 THEN '20-49 (High Risk)'
      ELSE '0-19 (Very High Risk)'
    END as risk_category,
    COUNT(*) as count,
    AVG(bot_score) as avg_score
  FROM submissions
  WHERE bot_score IS NOT NULL
  GROUP BY risk_category
  ORDER BY avg_score DESC
" --remote
```

### Cleaning Data

#### Delete All Data (Fresh Start)

```bash
# Delete all validations first (due to foreign key constraint)
wrangler d1 execute DB --command="DELETE FROM turnstile_validations" --remote

# Delete all submissions
wrangler d1 execute DB --command="DELETE FROM submissions" --remote

# Delete fraud blacklist
wrangler d1 execute DB --command="DELETE FROM fraud_blacklist" --remote

# Verify all tables are empty
wrangler d1 execute DB --command="
  SELECT 'submissions' as table_name, COUNT(*) as count FROM submissions
  UNION ALL
  SELECT 'validations', COUNT(*) FROM turnstile_validations
  UNION ALL
  SELECT 'blacklist', COUNT(*) FROM fraud_blacklist
" --remote
```

#### Delete Old Data (Cleanup)

```bash
# Delete submissions older than 90 days
wrangler d1 execute DB --command="
  DELETE FROM submissions
  WHERE created_at < datetime('now', '-90 days')
" --remote

# Delete validations older than 30 days
wrangler d1 execute DB --command="
  DELETE FROM turnstile_validations
  WHERE created_at < datetime('now', '-30 days')
" --remote

# Delete expired blacklist entries
wrangler d1 execute DB --command="
  DELETE FROM fraud_blacklist
  WHERE expires_at <= datetime('now')
" --remote
```

#### Delete Specific Entry

```bash
# Delete by email
wrangler d1 execute DB --command="
  DELETE FROM submissions
  WHERE email = 'user@example.com'
" --remote

# Delete by ephemeral ID from blacklist
wrangler d1 execute DB --command="
  DELETE FROM fraud_blacklist
  WHERE ephemeral_id = 'b:AQJWUgBQUgAAAAAA:...'
" --remote

# Delete by IP from blacklist
wrangler d1 execute DB --command="
  DELETE FROM fraud_blacklist
  WHERE ip_address = '1.2.3.4'
" --remote
```

### Analytics Queries

#### Submission Stats

```bash
# Submissions over time (last 30 days, daily)
wrangler d1 execute DB --command="
  SELECT
    DATE(created_at) as date,
    COUNT(*) as submissions,
    COUNT(DISTINCT ephemeral_id) as unique_users,
    AVG(bot_score) as avg_bot_score
  FROM submissions
  WHERE created_at > datetime('now', '-30 days')
  GROUP BY DATE(created_at)
  ORDER BY date DESC
" --remote
```

#### Fraud Detection Stats

```bash
# Fraud detection effectiveness
wrangler d1 execute DB --command="
  SELECT
    COUNT(*) as total_validations,
    SUM(CASE WHEN allowed = 1 THEN 1 ELSE 0 END) as allowed,
    SUM(CASE WHEN allowed = 0 THEN 1 ELSE 0 END) as blocked,
    ROUND(SUM(CASE WHEN allowed = 0 THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) as block_rate,
    AVG(risk_score) as avg_risk_score
  FROM turnstile_validations
" --remote

# Block reason distribution
wrangler d1 execute DB --command="
  SELECT
    block_reason,
    COUNT(*) as count,
    COUNT(DISTINCT ephemeral_id) as unique_ids,
    AVG(risk_score) as avg_risk
  FROM turnstile_validations
  WHERE allowed = 0
  GROUP BY block_reason
  ORDER BY count DESC
" --remote
```

#### Geographic Analysis

```bash
# Top countries
wrangler d1 execute DB --command="
  SELECT
    country,
    COUNT(*) as submissions,
    AVG(bot_score) as avg_bot_score,
    SUM(CASE WHEN bot_score < 50 THEN 1 ELSE 0 END) as high_risk_count
  FROM submissions
  GROUP BY country
  ORDER BY submissions DESC
  LIMIT 10
" --remote
```

### Fraud Management

#### View Progressive Timeout Info

```bash
# View blacklist entries with timeout details
wrangler d1 execute DB --command="
  SELECT
    ephemeral_id,
    block_reason,
    detection_confidence,
    submission_count,
    blocked_at,
    expires_at,
    CAST((julianday(expires_at) - julianday(blocked_at)) * 24 AS REAL) as timeout_hours,
    CAST((julianday(expires_at) - julianday('now')) * 24 AS REAL) as hours_remaining
  FROM fraud_blacklist
  WHERE expires_at > datetime('now')
  ORDER BY blocked_at DESC
" --remote
```

#### Manually Blacklist

```bash
# Add ephemeral ID to blacklist (1 hour timeout)
wrangler d1 execute DB --command="
  INSERT INTO fraud_blacklist (
    ephemeral_id,
    block_reason,
    detection_confidence,
    expires_at,
    submission_count
  ) VALUES (
    'b:AQJWUgBQUgAAAAAA:...',
    'Manual block',
    'high',
    datetime('now', '+1 hour'),
    0
  )
" --remote

# Add IP to blacklist (24 hours)
wrangler d1 execute DB --command="
  INSERT INTO fraud_blacklist (
    ip_address,
    block_reason,
    detection_confidence,
    expires_at,
    submission_count
  ) VALUES (
    '1.2.3.4',
    'Manual block - suspected bot',
    'high',
    datetime('now', '+24 hours'),
    0
  )
" --remote
```

#### Unblock Entries

```bash
# Remove ephemeral ID from blacklist
wrangler d1 execute DB --command="
  DELETE FROM fraud_blacklist
  WHERE ephemeral_id = 'b:AQJWUgBQUgAAAAAA:...'
" --remote

# Remove IP from blacklist
wrangler d1 execute DB --command="
  DELETE FROM fraud_blacklist
  WHERE ip_address = '1.2.3.4'
" --remote

# Remove all expired entries
wrangler d1 execute DB --command="
  DELETE FROM fraud_blacklist
  WHERE expires_at <= datetime('now')
" --remote
```

---

## Schema Management

### Initialize Database

```bash
# Create tables from schema file
wrangler d1 execute DB --file=./schema.sql --remote
```

### View Schema

```bash
# List all tables
wrangler d1 execute DB --command="
  SELECT name FROM sqlite_master
  WHERE type='table'
  ORDER BY name
" --remote

# View table structure
wrangler d1 execute DB --command="
  PRAGMA table_info(submissions)
" --remote

# View indexes
wrangler d1 execute DB --command="
  SELECT name, tbl_name, sql
  FROM sqlite_master
  WHERE type='index'
  ORDER BY tbl_name, name
" --remote
```

### Database Migrations

D1 doesn't support ALTER TABLE easily. For schema changes:

1. Create migration SQL file
2. Test locally without `--remote`
3. Apply to production with `--remote`

**Example: Add column**
```sql
-- migrations/add_new_field.sql
ALTER TABLE submissions ADD COLUMN new_field TEXT;
```

```bash
wrangler d1 execute DB --file=./migrations/add_new_field.sql --remote
```

**Example: Remove NOT NULL constraint (recreate table)**
```sql
-- Cannot directly remove NOT NULL in SQLite
-- Must recreate table

BEGIN TRANSACTION;

-- Create new table
CREATE TABLE submissions_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone TEXT,  -- NOT NULL removed
  -- ... other fields
);

-- Copy data
INSERT INTO submissions_new SELECT * FROM submissions;

-- Drop old table
DROP TABLE submissions;

-- Rename new table
ALTER TABLE submissions_new RENAME TO submissions;

-- Recreate indexes
CREATE INDEX idx_submissions_email ON submissions(email);
-- ... other indexes

COMMIT;
```

---

## Backup & Restore

### Export Data

```bash
# Export submissions to JSON
wrangler d1 export DB --output=backup-$(date +%Y%m%d).sql --remote

# Query specific data and save locally
wrangler d1 execute DB --command="SELECT * FROM submissions" --remote > submissions_backup.json
```

### Import Data

```bash
# Import from SQL file
wrangler d1 execute DB --file=./backup-20251113.sql --remote
```

### Manual Backup Strategy

```bash
# 1. Export all data
wrangler d1 execute DB --command="SELECT * FROM submissions" --remote > submissions.json
wrangler d1 execute DB --command="SELECT * FROM turnstile_validations" --remote > validations.json
wrangler d1 execute DB --command="SELECT * FROM fraud_blacklist" --remote > blacklist.json

# 2. Store backups securely (S3, R2, local encrypted storage)

# 3. Test restore on local database
wrangler d1 execute DB --file=./schema.sql  # local
# ... import data
```

---

## Troubleshooting

### Common Issues

#### Foreign Key Constraint Failed

**Error:** `FOREIGN KEY constraint failed: SQLITE_CONSTRAINT [code: 7500]`

**Cause:** Trying to delete submissions before validations.

**Solution:** Delete in correct order:
```bash
# 1. Delete validations first
wrangler d1 execute DB --command="DELETE FROM turnstile_validations" --remote

# 2. Then delete submissions
wrangler d1 execute DB --command="DELETE FROM submissions" --remote
```

#### Database Not Found

**Error:** `Couldn't find DB with name 'turnstile-demo'`

**Solution:** Check database name in wrangler.jsonc matches command:
```bash
# List databases
wrangler d1 list

# Use correct name from wrangler.jsonc (DB, not turnstile-demo)
wrangler d1 execute DB --command="..." --remote
```

#### Query Timeout

**Error:** Query takes too long or times out

**Solution:** Add indexes or limit results:
```bash
# Add LIMIT
wrangler d1 execute DB --command="
  SELECT * FROM submissions
  LIMIT 100
" --remote

# Check indexes
wrangler d1 execute DB --command="
  SELECT name, tbl_name FROM sqlite_master
  WHERE type='index'
" --remote
```

#### Syntax Error

**Error:** SQL syntax error

**Solution:** Escape special characters, use proper SQL:
```bash
# Escape single quotes with double single quotes
wrangler d1 execute DB --command="
  SELECT * FROM submissions
  WHERE email = 'user''s@email.com'
" --remote

# Or use double quotes for command string
wrangler d1 execute DB --command="SELECT * FROM submissions WHERE email = 'user@example.com'" --remote
```

### Performance Tips

**1. Use Indexes**
```sql
-- Check if query uses index
EXPLAIN QUERY PLAN SELECT * FROM submissions WHERE ephemeral_id = '...';

-- Should see "SEARCH ... USING INDEX"
```

**2. Limit Large Queries**
```bash
# Bad: Return all rows
SELECT * FROM submissions

# Good: Limit and paginate
SELECT * FROM submissions LIMIT 100 OFFSET 0
```

**3. Use Batch Operations**
```bash
# Bad: Multiple small queries
wrangler d1 execute DB --command="SELECT COUNT(*) FROM submissions" --remote
wrangler d1 execute DB --command="SELECT COUNT(*) FROM validations" --remote

# Good: Single query with UNION
wrangler d1 execute DB --command="
  SELECT 'submissions' as table, COUNT(*) FROM submissions
  UNION ALL
  SELECT 'validations', COUNT(*) FROM turnstile_validations
" --remote
```

### Debugging Queries

```bash
# Check table exists
wrangler d1 execute DB --command="
  SELECT name FROM sqlite_master WHERE type='table' AND name='submissions'
" --remote

# Check column names
wrangler d1 execute DB --command="
  PRAGMA table_info(submissions)
" --remote

# Test query with EXPLAIN
wrangler d1 execute DB --command="
  EXPLAIN QUERY PLAN
  SELECT * FROM submissions WHERE ephemeral_id = 'test'
" --remote
```

---

## Related Documentation

- [../schema.sql](../schema.sql) - Complete database schema
- [FRAUD-DETECTION.md](./FRAUD-DETECTION.md) - Fraud blacklist usage
- [API-REFERENCE.md](./API-REFERENCE.md) - Analytics endpoints that query the database
- [ARCHITECTURE.md](./ARCHITECTURE.md) - Database design decisions

---

## Quick Reference

### Most Common Commands

```bash
# View recent data
wrangler d1 execute DB --command="SELECT * FROM submissions ORDER BY created_at DESC LIMIT 10" --remote

# Count records
wrangler d1 execute DB --command="SELECT COUNT(*) FROM submissions" --remote

# Delete all data
wrangler d1 execute DB --command="DELETE FROM turnstile_validations" --remote
wrangler d1 execute DB --command="DELETE FROM submissions" --remote
wrangler d1 execute DB --command="DELETE FROM fraud_blacklist" --remote

# View blacklist
wrangler d1 execute DB --command="SELECT * FROM fraud_blacklist WHERE expires_at > datetime('now')" --remote

# Remove expired blacklist entries
wrangler d1 execute DB --command="DELETE FROM fraud_blacklist WHERE expires_at <= datetime('now')" --remote
```
