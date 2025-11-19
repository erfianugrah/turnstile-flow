# Commands Reference

Complete reference for all npm and wrangler commands used in the Forminator project.

## Table of Contents

- [Overview](#overview)
- [Development Commands](#development-commands)
- [Testing Commands](#testing-commands)
- [Building Commands](#building-commands)
- [Deployment Commands](#deployment-commands)
- [Database Commands](#database-commands)
- [Monitoring Commands](#monitoring-commands)
- [Troubleshooting](#troubleshooting)

---

## Overview

The Forminator project uses two separate package.json files:
- **Root** (`/package.json`) - Worker backend dependencies and scripts
- **Frontend** (`/frontend/package.json`) - Astro frontend dependencies and scripts

Always run commands from the appropriate directory.

---

## Development Commands

### Install Dependencies

```bash
# Install worker dependencies (from root)
npm install

# Install frontend dependencies
cd frontend
npm install
cd ..
```

### Local Development

#### Option 1: Remote D1 (Recommended)

```bash
# Terminal 1: Run worker with remote D1 database
wrangler dev --remote

# Terminal 2: Build frontend in watch mode
cd frontend
npm run dev
```

The `--remote` flag uses your production D1 database for local testing.

#### Option 2: Local D1

```bash
# Initialize local D1 database first
wrangler d1 execute DB --file=./schema.sql --local

# Run worker with local D1
wrangler dev

# In separate terminal: Build frontend
cd frontend
npm run dev
```

### Frontend Watch Mode

```bash
cd frontend
npm run dev
```

This starts Astro dev server with hot module replacement (HMR).

---

## Testing Commands

### Run All Tests

```bash
npm test
```

Runs all Playwright test suites. Requires worker to be running (`wrangler dev --remote`).

### Run Specific Test Suites

```bash
# Basic form submission and ephemeral ID tests
npm run test:basic

# Fraud detection stress tests
npm run test:fraud

# Run fraud tests with browser visible
npm run test:fraud:headed
```

### Test with UI

```bash
npm run test:ui
```

Opens Playwright UI for interactive test debugging.

### Test with Browser Visible

```bash
npm run test:headed
```

Runs all tests with browser window visible (non-headless mode).

### Test Files

Test files are configured in package.json but not yet implemented. The test commands reference:
- `tests/form-submission.spec.ts` - For basic form validation and submission tests
- `tests/ephemeral-id.spec.ts` - For ephemeral ID fraud detection pattern tests
- `tests/fraud-stress-test.spec.ts` - For high-volume submission pattern tests

---

## Building Commands

### Build Frontend Only

```bash
npm run build
```

Builds Astro frontend to `frontend/dist/`. Does NOT deploy worker.

### Build in Watch Mode

```bash
cd frontend
npm run dev
```

Auto-rebuilds on file changes during development.

---

## Deployment Commands

### Deploy Everything (Frontend + Worker)

```bash
npm run deploy
```

This command:
1. Builds frontend (`npm run build`)
2. Type-checks worker (`npx tsc --noEmit`)
3. Deploys worker with built frontend (`wrangler deploy`)

### Deploy Worker Only

```bash
wrangler deploy
```

Deploys worker only. Assumes frontend is already built in `frontend/dist/`.

### Check Types Before Deploy

```bash
npx tsc --noEmit
```

Type-checks TypeScript without emitting files. Runs automatically in `npm run deploy`.

---

## Database Commands

See [DATABASE-OPERATIONS.md](./DATABASE-OPERATIONS.md) for comprehensive database management guide.

### Quick Reference

#### Initialize Schema

```bash
# Production database
wrangler d1 execute DB --file=./schema.sql --remote

# Local database
wrangler d1 execute DB --file=./schema.sql --local
```

#### View Recent Submissions

```bash
wrangler d1 execute DB --command="SELECT * FROM submissions ORDER BY created_at DESC LIMIT 10" --remote
```

#### Count Records in All Tables

```bash
wrangler d1 execute DB --command="
  SELECT 'submissions' as table_name, COUNT(*) as count FROM submissions
  UNION ALL SELECT 'validations', COUNT(*) FROM turnstile_validations
  UNION ALL SELECT 'blacklist', COUNT(*) FROM fraud_blacklist
  UNION ALL SELECT 'fraud_blocks', COUNT(*) FROM fraud_blocks
" --remote
```

#### Clear All Data

```bash
# Delete in this order (foreign key constraints)
wrangler d1 execute DB --command="DELETE FROM turnstile_validations" --remote
wrangler d1 execute DB --command="DELETE FROM submissions" --remote
wrangler d1 execute DB --command="DELETE FROM fraud_blacklist" --remote
wrangler d1 execute DB --command="DELETE FROM fraud_blocks" --remote
```

#### View Active Blacklist

```bash
wrangler d1 execute DB --command="
  SELECT ephemeral_id, block_reason, expires_at,
         CAST((julianday(expires_at) - julianday('now')) * 24 AS INTEGER) as hours_remaining
  FROM fraud_blacklist WHERE expires_at > datetime('now')
" --remote
```

#### Remove Expired Blacklist Entries

```bash
wrangler d1 execute DB --command="
  DELETE FROM fraud_blacklist WHERE expires_at <= datetime('now')
" --remote
```

---

## Monitoring Commands

### Tail Worker Logs

```bash
npm run tail
```

Or directly:

```bash
wrangler tail
```

Streams real-time logs from the deployed worker.

### Filter Logs

```bash
# Filter by log level
wrangler tail --status ok
wrangler tail --status error

# Filter by request method
wrangler tail --method POST
```

---

## Troubleshooting

### Worker Not Starting

**Issue:** `wrangler dev` fails to start

**Solutions:**
```bash
# Check wrangler version
wrangler --version

# Update wrangler
npm install -g wrangler@latest

# Check wrangler.jsonc syntax
# Ensure valid JSON with comments
```

### Frontend Build Fails

**Issue:** `npm run build` fails

**Solutions:**
```bash
# Check Node.js version (requires 18+)
node --version

# Clear node_modules and reinstall
cd frontend
rm -rf node_modules package-lock.json
npm install

# Check for TypeScript errors
npx tsc --noEmit
```

### Tests Failing

**Issue:** Tests fail with connection errors

**Solutions:**
```bash
# Ensure worker is running
wrangler dev --remote

# Check worker URL in test config
# Default: http://localhost:8787

# Verify D1 database is initialized
wrangler d1 execute DB --file=./schema.sql --remote
```

### Database Not Found

**Issue:** `Couldn't find DB with name...`

**Solutions:**
```bash
# List databases
wrangler d1 list

# Verify database_id in wrangler.jsonc matches
# Update wrangler.jsonc if needed

# Create database if missing
wrangler d1 create DB
```

### Secrets Not Loading

**Issue:** Worker can't access secrets

**Solutions:**
```bash
# For local development: Create .dev.vars
cat > .dev.vars << EOF
TURNSTILE-SECRET-KEY=your_secret_key
X-API-KEY=your_api_key
EOF

# For production: Set via wrangler
wrangler secret put TURNSTILE-SECRET-KEY
wrangler secret put X-API-KEY

# Verify secrets are set
wrangler secret list
```

### Port Already in Use

**Issue:** `Error: listen EADDRINUSE: address already in use :::8787`

**Solutions:**
```bash
# Find process using port 8787
lsof -ti:8787

# Kill the process
kill -9 $(lsof -ti:8787)

# Or use different port
wrangler dev --port 8788
```

---

## Package.json Scripts Reference

### Root package.json

```json
{
  "scripts": {
    "build": "cd frontend && npm run build",
    "deploy": "npm run build && npx tsc --noEmit && wrangler deploy",
    "test": "playwright test",
    "test:basic": "playwright test tests/form-submission.spec.ts tests/ephemeral-id.spec.ts",
    "test:fraud": "playwright test tests/fraud-stress-test.spec.ts",
    "test:fraud:headed": "playwright test tests/fraud-stress-test.spec.ts --headed",
    "test:ui": "playwright test --ui",
    "test:headed": "playwright test --headed",
    "tail": "wrangler tail"
  }
}
```

### Frontend package.json

```json
{
  "scripts": {
    "dev": "astro dev",
    "build": "astro build",
    "preview": "astro preview"
  }
}
```

---

## Environment-Specific Commands

### Local Development

```bash
# Use local D1 database
wrangler dev

# Use remote D1 database (recommended)
wrangler dev --remote

# Use specific port
wrangler dev --port 8788

# Enable verbose logging
wrangler dev --log-level debug
```

### Staging/Testing

```bash
# Deploy to staging environment (if configured)
wrangler deploy --env staging

# Test with bypass enabled
# Set ALLOW_TESTING_BYPASS=true in wrangler.jsonc vars
# Use X-API-KEY header for API requests
```

### Production

```bash
# Deploy to production
npm run deploy

# Or manually
npm run build
wrangler deploy

# Monitor logs
npm run tail
```

---

## Wrangler CLI Reference

### Common Wrangler Commands

```bash
# Login to Cloudflare
wrangler login

# Logout
wrangler logout

# Show account info
wrangler whoami

# List all workers
wrangler list

# List D1 databases
wrangler d1 list

# List secrets
wrangler secret list

# Delete secret
wrangler secret delete SECRET_NAME

# View worker logs
wrangler tail

# Publish worker
wrangler deploy
```

### Wrangler Help

```bash
# General help
wrangler --help

# Command-specific help
wrangler dev --help
wrangler d1 --help
wrangler secret --help
```

---

## Related Documentation

- [DATABASE-OPERATIONS.md](./DATABASE-OPERATIONS.md) - Complete D1 database management
- [DEPLOYMENT.md](./DEPLOYMENT.md) - Production deployment guide
- [TESTING.md](./TESTING.md) - Testing strategies and setup
- [../README.md](../README.md) - Project overview and quick start

---

## Quick Command Cheatsheet

```bash
# Development
npm install                           # Install dependencies
wrangler dev --remote                 # Run worker with remote D1
cd frontend && npm run dev            # Build frontend in watch mode

# Testing
npm test                              # Run all tests
npm run test:headed                   # Run tests with browser visible

# Building
npm run build                         # Build frontend only

# Deployment
npm run deploy                        # Build and deploy everything
wrangler deploy                       # Deploy worker only

# Database
wrangler d1 execute DB --file=./schema.sql --remote
wrangler d1 execute DB --command="SELECT COUNT(*) FROM submissions" --remote

# Monitoring
npm run tail                          # Stream worker logs
```
