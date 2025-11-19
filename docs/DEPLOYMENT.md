# Deployment Guide

Complete guide for deploying Forminator to production on Cloudflare Workers.

## Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Production Checklist](#production-checklist)
- [Step-by-Step Deployment](#step-by-step-deployment)
- [Configuration Files](#configuration-files)
- [Post-Deployment Verification](#post-deployment-verification)
- [Rollback Procedure](#rollback-procedure)
- [Troubleshooting](#troubleshooting)

---

## Overview

Forminator is deployed as a Cloudflare Worker with:
- **Frontend**: Astro static site served via Workers Assets
- **Backend**: Hono API with D1 database
- **Custom Domain**: Configure in wrangler.jsonc routes section

**Deployment Architecture:**
```
Developer
    ↓ (npm run deploy)
Build Process
    ├─ Build Astro frontend → frontend/dist/
    ├─ Type-check TypeScript
    └─ wrangler deploy
        ↓
Cloudflare Workers
    ├─ Worker script (src/)
    ├─ Assets (frontend/dist/)
    ├─ D1 Database (remote)
    └─ KV namespaces (if configured)
```

---

## Prerequisites

Before deploying to production:

### 1. Cloudflare Account Setup

- [ ] Cloudflare account with Workers enabled
- [ ] Custom domain added to Cloudflare (optional but recommended)
- [ ] D1 database created
- [ ] Wrangler CLI installed and authenticated

```bash
# Install wrangler globally
npm install -g wrangler

# Login to Cloudflare
wrangler login

# Verify authentication
wrangler whoami
```

### 2. Required Secrets

Obtain the following secrets before deployment:

- [ ] **TURNSTILE-SECRET-KEY** - From Cloudflare Turnstile dashboard
- [ ] **TURNSTILE-SITE-KEY** - From Cloudflare Turnstile dashboard
- [ ] **X-API-KEY** - Generate secure random key for analytics API authentication

Generate secure API key:
```bash
# Generate random 32-character API key
openssl rand -hex 16
```

### 3. D1 Database

- [ ] D1 database created
- [ ] Database ID noted for wrangler.jsonc configuration

```bash
# Create D1 database
wrangler d1 create turnstile-demo

# Note the database_id from output
# Example: f36739a7-badb-456f-bbab-da0732722cae
```

### 4. Service Bindings (Optional)

If using email fraud detection with markov-mail:

- [ ] markov-mail worker deployed
- [ ] Service binding configured in wrangler.jsonc

---

## Production Checklist

Complete this checklist before deploying:

### Configuration

- [ ] Update `wrangler.jsonc`:
  - [ ] Set correct `database_id` for D1 database
  - [ ] Configure custom domain in `routes` section
  - [ ] Set `ENVIRONMENT=production` in `vars`
  - [ ] Set `ALLOWED_ORIGINS` to production domain(s)
  - [ ] Set `ALLOW_TESTING_BYPASS=false` (disable testing bypass)
  - [ ] Configure `ROUTES` for custom endpoint paths (optional)

- [ ] Create `frontend/.env`:
  - [ ] Set `PUBLIC_TURNSTILE_SITEKEY` with production site key

### Secrets

- [ ] Set production secrets via Cloudflare Dashboard or CLI:
  - [ ] `TURNSTILE-SECRET-KEY`
  - [ ] `TURNSTILE-SITE-KEY`
  - [ ] `X-API-KEY`
  - [ ] `FRAUD_CONFIG` (optional - for custom fraud detection thresholds)

### Database

- [ ] Initialize D1 schema:
  ```bash
  wrangler d1 execute DB --file=./schema.sql --remote
  ```

- [ ] Verify schema:
  ```bash
  wrangler d1 execute DB --command="SELECT name FROM sqlite_master WHERE type='table'" --remote
  ```

### Build & Deploy

- [ ] Build frontend locally to verify:
  ```bash
  npm run build
  ```

- [ ] Type-check TypeScript:
  ```bash
  npx tsc --noEmit
  ```

- [ ] Run tests:
  ```bash
  npm test
  ```

### Post-Deployment

- [ ] Test Turnstile widget on production domain
- [ ] Verify CSP headers allow Turnstile iframe
- [ ] Test form submission end-to-end
- [ ] Monitor logs for errors:
  ```bash
  npm run tail
  ```

- [ ] Test analytics dashboard with X-API-KEY
- [ ] Verify fraud detection is working (check blacklist table)

---

## Step-by-Step Deployment

### Step 1: Update wrangler.jsonc

Edit `wrangler.jsonc` with production values:

```jsonc
{
  "name": "forminator",
  "main": "src/index.ts",
  "compatibility_date": "2024-11-01",

  // Update with your D1 database ID
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "DB",
      "database_id": "YOUR_DATABASE_ID_HERE",
      "remote": true
    }
  ],

  // Configure custom domain
  "routes": [
    {
      "pattern": "form.yourdomain.com/*",
      "custom_domain": true
    }
  ],

  // Production environment variables
  "vars": {
    "ENVIRONMENT": "production",
    "ALLOWED_ORIGINS": "https://form.yourdomain.com",
    "ALLOW_TESTING_BYPASS": "false"
  },

  // Service binding for markov-mail (optional)
  "services": [
    {
      "binding": "FRAUD_DETECTOR",
      "service": "markov-mail",
      "entrypoint": "FraudDetectionService"
    }
  ],

  // Assets binding for frontend
  "assets": {
    "directory": "./frontend/dist",
    "binding": "ASSETS"
  }
}
```

### Step 2: Set Production Secrets

#### Option A: Via Cloudflare Dashboard (Recommended)

1. Go to Cloudflare Dashboard → Workers & Pages
2. Select your worker
3. Go to Settings → Variables
4. Add secrets:
   - `TURNSTILE-SECRET-KEY`
   - `TURNSTILE-SITE-KEY`
   - `X-API-KEY`
   - `FRAUD_CONFIG` (optional)

#### Option B: Via Wrangler CLI

```bash
# Set Turnstile secret key
wrangler secret put TURNSTILE-SECRET-KEY
# Paste secret when prompted

# Set Turnstile site key
wrangler secret put TURNSTILE-SITE-KEY
# Paste site key when prompted

# Set API key for analytics
wrangler secret put X-API-KEY
# Paste generated API key when prompted

# Optional: Customize fraud detection thresholds
echo '{"risk":{"blockThreshold":80}}' | wrangler secret put FRAUD_CONFIG
```

### Step 3: Configure Frontend Environment

Create `frontend/.env`:

```env
PUBLIC_TURNSTILE_SITEKEY=0x4AAAAAACAjw0bmUZ7V7fh2
```

**Important:** Use your production Turnstile site key, not the testing key.

### Step 4: Initialize Database Schema

```bash
# Initialize production database with schema
wrangler d1 execute DB --file=./schema.sql --remote

# Verify tables created
wrangler d1 execute DB --command="
  SELECT name FROM sqlite_master
  WHERE type='table'
  ORDER BY name
" --remote

# Expected output:
# - fraud_blacklist
# - submissions
# - turnstile_validations
```

### Step 5: Build Frontend

```bash
# Build Astro frontend
npm run build

# Verify dist directory exists
ls -la frontend/dist/
```

### Step 6: Run Pre-Deployment Tests

```bash
# Type-check TypeScript
npx tsc --noEmit

# Run Playwright tests (requires wrangler dev --remote)
npm test
```

### Step 7: Deploy to Production

```bash
# Deploy everything (recommended)
npm run deploy

# This runs:
# 1. npm run build (builds frontend)
# 2. npx tsc --noEmit (type-checks)
# 3. wrangler deploy (deploys worker + assets)
```

Or deploy manually:

```bash
# Build frontend
npm run build

# Type-check
npx tsc --noEmit

# Deploy worker
wrangler deploy
```

### Step 8: Verify Deployment

```bash
# Watch logs in real-time
npm run tail

# Or with filtering
wrangler tail --status error
```

---

## Configuration Files

### wrangler.jsonc

Main worker configuration file.

**Key Sections:**

#### D1 Database Binding
```jsonc
"d1_databases": [
  {
    "binding": "DB",              // Used in code as c.env.DB
    "database_name": "DB",        // Name for wrangler commands
    "database_id": "xxx",         // From wrangler d1 create
    "remote": true                // Use remote database
  }
]
```

#### Assets Binding (Frontend)
```jsonc
"assets": {
  "directory": "./frontend/dist", // Built Astro site
  "binding": "ASSETS"             // Used in code
}
```

#### Custom Domain Configuration
```jsonc
"routes": [
  {
    "pattern": "form.yourdomain.com/*",
    "custom_domain": true
  }
]
```

#### Environment Variables
```jsonc
"vars": {
  "ENVIRONMENT": "production",              // Environment identifier
  "ALLOWED_ORIGINS": "https://form.yourdomain.com",  // CORS allowed origins (comma-separated)
  "ALLOW_TESTING_BYPASS": "false",          // Disable testing bypass in production
  "ROUTES": {                               // Optional: Customize API endpoint paths
    "submissions": "/api/submissions",
    "analytics": "/api/analytics",
    "geo": "/api/geo",
    "health": "/api/health",
    "config": "/api/config"
  }
}
```

#### Service Bindings (Optional)
```jsonc
"services": [
  {
    "binding": "FRAUD_DETECTOR",        // Used in code as c.env.FRAUD_DETECTOR
    "service": "markov-mail",           // Name of worker to call
    "entrypoint": "FraudDetectionService"  // RPC entrypoint
  }
]
```

### .dev.vars

**For local development only.** Never commit this file.

```
TURNSTILE-SECRET-KEY=your_secret_key_here
X-API-KEY=your_api_key_here
ALLOW_TESTING_BYPASS=true
```

**Note:** Environment variables like `ENVIRONMENT` and `ALLOWED_ORIGINS` are set in wrangler.jsonc `vars`, not `.dev.vars`.

### frontend/.env

Astro environment variables.

```
PUBLIC_TURNSTILE_SITEKEY=0x4AAAAAACAjw0bmUZ7V7fh2
```

**Important:** The `PUBLIC_` prefix makes this variable available in client-side code.

---

## Post-Deployment Verification

### 1. Test Form Submission

Visit your production domain:

```
https://form.yourdomain.com/
```

Test form submission:
1. Fill out form with valid data
2. Complete Turnstile challenge
3. Submit form
4. Verify success message

### 2. Check Database

```bash
# Verify submission was saved
wrangler d1 execute DB --command="
  SELECT id, email, country, created_at
  FROM submissions
  ORDER BY created_at DESC
  LIMIT 5
" --remote

# Verify validation was logged
wrangler d1 execute DB --command="
  SELECT id, success, allowed, created_at
  FROM turnstile_validations
  ORDER BY created_at DESC
  LIMIT 5
" --remote
```

### 3. Test Analytics Dashboard

```bash
# Test analytics endpoint with API key
curl -H "X-API-KEY: your_api_key" \
  https://form.yourdomain.com/api/analytics/stats
```

Expected response:
```json
{
  "totalSubmissions": 1,
  "totalValidations": 1,
  "allowedRate": 100,
  "avgRiskScore": 0,
  "blockedCount": 0
}
```

### 4. Verify CSP Headers

```bash
# Check Content-Security-Policy header
curl -I https://form.yourdomain.com/

# Should include:
# Content-Security-Policy: frame-ancestors 'self'; frame-src 'self' https://challenges.cloudflare.com
```

### 5. Test Turnstile Widget

1. Open browser DevTools → Network tab
2. Load form page
3. Verify Turnstile iframe loads from `challenges.cloudflare.com`
4. Complete challenge
5. Verify token is received

### 6. Monitor Logs

```bash
# Watch real-time logs
npm run tail

# Look for errors
wrangler tail --status error

# Filter by method
wrangler tail --method POST
```

### 7. Test Fraud Detection

Submit multiple forms rapidly to trigger fraud detection:

```bash
# Check blacklist table
wrangler d1 execute DB --command="
  SELECT * FROM fraud_blacklist
  WHERE expires_at > datetime('now')
" --remote
```

---

## Rollback Procedure

If deployment fails or introduces issues:

### Option 1: Rollback via Cloudflare Dashboard

1. Go to Cloudflare Dashboard → Workers & Pages
2. Select your worker
3. Go to Deployments tab
4. Find previous working deployment
5. Click "Rollback to this deployment"

### Option 2: Rollback via Git

```bash
# Find last working commit
git log --oneline

# Revert to previous commit
git revert HEAD

# Or reset to specific commit (destructive)
git reset --hard <commit-hash>

# Redeploy
npm run deploy
```

### Option 3: Quick Fix Deploy

```bash
# Make fix in code
# Test locally
wrangler dev --remote

# Deploy immediately
npm run deploy
```

---

## Troubleshooting

### Deployment Fails

**Issue:** `wrangler deploy` fails with error

**Solutions:**

```bash
# Check wrangler version
wrangler --version
# Update if needed: npm install -g wrangler@latest

# Verify wrangler.jsonc syntax
# Use JSON validator to check for syntax errors

# Check authentication
wrangler whoami

# Re-authenticate if needed
wrangler login

# Clear wrangler cache
rm -rf ~/.wrangler

# Try deploying with verbose logging
wrangler deploy --log-level debug
```

### Database Connection Errors

**Issue:** Worker can't connect to D1 database

**Solutions:**

```bash
# Verify database exists
wrangler d1 list

# Check database_id in wrangler.jsonc matches

# Verify database binding name is "DB"
# Must match code: c.env.DB

# Re-initialize schema
wrangler d1 execute DB --file=./schema.sql --remote
```

### Turnstile Widget Not Loading

**Issue:** Turnstile iframe doesn't load on production

**Solutions:**

1. **Check CSP headers:**
   - Must allow `frame-src https://challenges.cloudflare.com`
   - Code in `src/index.ts` sets this header

2. **Verify site key:**
   - `frontend/.env` has correct `PUBLIC_TURNSTILE_SITEKEY`
   - Site key matches domain (Turnstile validates origin)

3. **Check browser console:**
   - Look for CSP violations
   - Look for network errors loading Turnstile

### Frontend Not Updating

**Issue:** Frontend changes not reflected after deployment

**Solutions:**

```bash
# Clear frontend/dist and rebuild
rm -rf frontend/dist
npm run build

# Verify dist directory has new files
ls -la frontend/dist/

# Redeploy
wrangler deploy

# Clear browser cache
# Or open in incognito mode
```

### Secrets Not Available

**Issue:** Worker can't access secrets (undefined)

**Solutions:**

```bash
# Verify secrets are set in production
wrangler secret list

# Set missing secrets
wrangler secret put SECRET_NAME

# For local development: Use .dev.vars
# Secrets in .dev.vars override wrangler secrets locally
```

### Custom Domain Not Working

**Issue:** Custom domain doesn't route to worker

**Solutions:**

1. **Verify domain is added to Cloudflare:**
   - Domain must be on Cloudflare DNS
   - Nameservers pointed to Cloudflare

2. **Check wrangler.jsonc routes:**
   ```jsonc
   "routes": [
     {
       "pattern": "form.yourdomain.com/*",
       "custom_domain": true
     }
   ]
   ```

3. **Verify DNS record:**
   - Go to Cloudflare Dashboard → DNS
   - Should have AAAA record: `form.yourdomain.com` → `100::`
   - Created automatically when deploying with custom domain

4. **Wait for propagation:**
   - DNS changes can take up to 48 hours
   - Check with: `dig form.yourdomain.com`

### High Error Rate After Deployment

**Issue:** Seeing many errors in logs

**Solutions:**

```bash
# Watch logs with filtering
wrangler tail --status error

# Common issues:
# 1. Database queries failing → Check schema
# 2. Turnstile validation failing → Check secret key
# 3. CORS errors → Check ALLOWED_ORIGINS in wrangler.jsonc
# 4. Fraud detection blocking → Check fraud_blacklist table

# Quick fix: Rollback deployment
# Go to Dashboard → Deployments → Rollback
```

---

## Development Workflow

Recommended workflow for making changes:

### 1. Make Changes Locally

```bash
# Create feature branch
git checkout -b feature/new-feature

# Make code changes
# ...

# Test locally
wrangler dev --remote
```

### 2. Test Thoroughly

```bash
# Type-check
npx tsc --noEmit

# Run tests
npm test

# Test frontend
cd frontend && npm run dev
```

### 3. Commit Changes

```bash
git add .
git commit -m "Add new feature"
```

### 4. Deploy to Staging (Optional)

If you have a staging environment configured:

```bash
wrangler deploy --env staging
```

### 5. Deploy to Production

```bash
# Merge to main branch
git checkout main
git merge feature/new-feature

# Deploy
npm run deploy

# Monitor logs
npm run tail
```

### 6. Verify Deployment

- Test form submission
- Check database
- Monitor logs for errors
- Test analytics dashboard

---

## Related Documentation

- [COMMANDS.md](./COMMANDS.md) - All npm and wrangler commands
- [DATABASE-OPERATIONS.md](./DATABASE-OPERATIONS.md) - Database management
- [CONFIGURATION-SYSTEM.md](./CONFIGURATION-SYSTEM.md) - Fraud detection configuration
- [TESTING.md](./TESTING.md) - Testing strategies
- [../README.md](../README.md) - Project overview

---

## Quick Deployment Reference

```bash
# Pre-deployment
npm install
cd frontend && npm install && cd ..
wrangler d1 execute DB --file=./schema.sql --remote

# Set secrets
wrangler secret put TURNSTILE-SECRET-KEY
wrangler secret put TURNSTILE-SITE-KEY
wrangler secret put X-API-KEY

# Deploy
npm run deploy

# Verify
npm run tail
curl https://form.yourdomain.com/api/health
```
