# Database Schema Initialization Guide

## Overview

This guide covers D1 database setup for Forminator (this repository). For Markov-Mail schema setup, see the [Markov-Mail documentation](https://github.com/erfianugrah/markov-mail/blob/main/docs/SCHEMA-INITIALIZATION.md).

---

## Forminator Database Setup

### For New Deployments

Forminator uses a single `schema.sql` file that contains the complete database schema.

**File**: [`schema.sql`](../schema.sql) (this repo)

**Tables**:

- `submissions` - Form submission data with full request.cf metadata
- `turnstile_validations` - Turnstile validation attempts with token replay protection
- `fraud_blacklist` - Pre-validation blacklist for performance optimization

**Initialize Database**:

```bash
# Initialize remote database (production)
wrangler d1 execute DB --file=./schema.sql --remote

# Initialize local database (development)
wrangler d1 execute DB --file=./schema.sql --local
```

**Verify Initialization**:

```bash
# Check tables were created
wrangler d1 execute DB --command="SELECT name FROM sqlite_master WHERE type='table'" --remote

# Expected output:
# - submissions
# - turnstile_validations
# - fraud_blacklist
```

---

## Schema Version

**Version**: 1.0 (Production Ready)
**Last Updated**: 2025-11-17
**Columns**: 54 total

| Category      | Columns                                                                                              |
| ------------- | ---------------------------------------------------------------------------------------------------- |
| Form Fields   | first_name, last_name, email, phone, address, date_of_birth                                          |
| Geographic    | country, region, city, postal_code, timezone, latitude, longitude, continent, is_eu_country          |
| Network       | asn, as_organization, colo, http_protocol, tls_version, tls_cipher                                   |
| Bot Detection | bot_score, client_trust_score, verified_bot, detection_ids                                           |
| Fingerprints  | ja3_hash, ja4, ja4_signals                                                                           |
| Email Fraud   | email_risk_score, email_fraud_signals, email_pattern_type, email_markov_detected, email_ood_detected |
| Request Snapshots | form_data, request_headers, extended_metadata                                                       |
| Fingerprint Cache | fingerprint_baselines (type, fingerprint_key, ja4_bucket, asn_bucket, hit_count, last_seen)        |

**Indexes**: 14 indexes for performance

---

## Common Issues

### Issue: "Table already exists"

**Symptom**: Error when running schema.sql on existing database

**Solution**: Database already initialized - check if tables exist

```bash
# Check existing tables
wrangler d1 execute DB --command="SELECT name FROM sqlite_master WHERE type='table'" --remote
```

---

### Issue: "Column does not exist"

**Symptom**: SQL errors about missing columns after deployment

**Solution**: Schema not initialized

```bash
# Initialize schema
wrangler d1 execute DB --file=./schema.sql --remote
```

---

### Issue: "Database not found"

**Symptom**: Wrangler reports database binding not found

**Solution**: Verify database ID in wrangler.jsonc matches your D1 database

```bash
# List your D1 databases
wrangler d1 list

# Update wrangler.jsonc with correct database_id
```

---

## Testing Schema

### Test Database Connection

```bash
# Insert test submission
wrangler d1 execute DB --command="
INSERT INTO submissions (first_name, last_name, email, country, region, city)
VALUES ('Test', 'User', 'test@example.com', 'US', 'CA', 'San Francisco')
" --remote

# Verify
wrangler d1 execute DB --command="
SELECT first_name, email, region, city FROM submissions ORDER BY id DESC LIMIT 1
" --remote

# Clean up
wrangler d1 execute DB --command="DELETE FROM submissions WHERE email = 'test@example.com'" --remote
```

---

## Best Practices

### Initial Setup

1. Use `schema.sql` for initial deployment
2. Initialize local database for development: `wrangler dev --local`
3. Verify schema after deployment
4. Keep wrangler.jsonc database IDs correct

### Production

1. Never run schema.sql on production with data (it will wipe data)
2. Backup database before major schema changes
3. Test schema changes on staging/local first
4. Document any custom schema modifications

---

## Development Workflow

### Local Development

```bash
# 1. Initialize local database
wrangler d1 execute DB --file=./schema.sql --local

# 2. Start local development
wrangler dev --local

# 3. Test application
curl -X POST http://localhost:8787/api/submissions \
  -H "Content-Type: application/json" \
  -H "X-API-KEY: your_test_key" \
  -d '{"firstName":"Test","lastName":"User","email":"test@example.com"}'
```

### Production Deployment

```bash
# 1. Build frontend
npm run build

# 2. Deploy worker
wrangler deploy

# 3. Verify database connection
wrangler d1 execute DB --command="SELECT COUNT(*) FROM submissions" --remote
```

---

## Related Documentation

### This Repository (Forminator)

- [RPC Integration](./RPC-INTEGRATION.md) - Worker-to-Worker RPC with Markov-Mail
- [Database Schema](../schema.sql) - Complete D1 schema definition

### External Resources

- [Markov-Mail Documentation](https://github.com/erfianugrah/markov-mail/blob/main/docs/SCHEMA-INITIALIZATION.md) - Email fraud detection service schema
- [Cloudflare D1 Documentation](https://developers.cloudflare.com/d1/) - Official D1 database guide
