# Documentation Index

Comprehensive technical documentation for **Forminator** - I'm collecting all your data.

**Last Updated:** 2025-11-14

## Quick Start

**New to the project?** Start here:
1. [../README.md](../README.md) - Project overview and quick start guide
2. [ARCHITECTURE.md](./ARCHITECTURE.md) - Understand the system architecture
3. [API-REFERENCE.md](./API-REFERENCE.md) - Learn the API endpoints

**Implementing a feature?** Jump to:
- [FORM-VALIDATION.md](./FORM-VALIDATION.md) - Form validation system
- [PHONE-INPUT.md](./PHONE-INPUT.md) - International phone input
- [TURNSTILE.md](./TURNSTILE.md) - Turnstile integration

## Documentation Categories

### System Architecture

| Document | Description |
|----------|-------------|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Complete system architecture and design decisions |
| [SECURITY.md](./SECURITY.md) | Security implementation details and best practices |
| [API-REFERENCE.md](./API-REFERENCE.md) | Exhaustive API documentation for all endpoints |

### Features & Components

| Document | Description |
|----------|-------------|
| [FORM-VALIDATION.md](./FORM-VALIDATION.md) | Exhaustive form validation system guide |
| [PHONE-INPUT.md](./PHONE-INPUT.md) | Custom phone input implementation |
| [GEOLOCATION.md](./GEOLOCATION.md) | Country detection via Cloudflare |
| [TURNSTILE.md](./TURNSTILE.md) | Turnstile integration and verification |
| [FRAUD-DETECTION.md](./FRAUD-DETECTION.md) | Ephemeral ID fraud detection with progressive timeouts |
| [../CONFIGURATION-SYSTEM.md](../CONFIGURATION-SYSTEM.md) | Fraud detection configuration and customization guide |
| [DATABASE-OPERATIONS.md](./DATABASE-OPERATIONS.md) | Complete D1 database management guide |

## Document Summaries

### [ARCHITECTURE.md](./ARCHITECTURE.md)
**Complete system architecture and design decisions**

**You'll learn:**
- Project structure (frontend + worker separation)
- Tech stack rationale (Astro, Hono, D1, React Hook Form)
- Request flow from form submission to database
- Key design decisions and trade-offs
- Why single-step validation
- Why explicit Turnstile rendering

**Read this if:**
- You want the big picture
- You're evaluating the tech stack
- You're making architectural changes
- You need to explain the system to others

---

### [SECURITY.md](./SECURITY.md)
**Security implementation details and best practices**

**You'll learn:**
- Single-step validation (prevents race conditions)
- Token replay protection (SHA256 hashing)
- SQL injection prevention (parameterized queries)
- Input sanitization (HTML stripping, normalization)
- CORS and origin validation
- Security headers (CSP, X-Frame-Options, etc.)
- Threat model and mitigations

**Read this if:**
- You're performing a security audit
- You're implementing security features
- You need to document security compliance
- You're troubleshooting security issues

---

### [API-REFERENCE.md](./API-REFERENCE.md)
**Exhaustive API documentation for all endpoints**

**You'll learn:**
- Every endpoint with complete request/response formats
- Error handling and status codes
- CORS configuration
- Security headers
- Code examples (cURL, JavaScript)
- Testing strategies
- Rate limiting approach

**Endpoints documented:**
- `POST /api/submissions` - Submit form with Turnstile
- `GET /api/geo` - Get user's country code
- `GET /api/analytics/stats` - Get statistics
- `GET /api/analytics/submissions` - Get recent submissions
- `GET /api/analytics/countries` - Get country distribution
- `GET /api/analytics/bot-scores` - Get bot score distribution
- `GET /api/health` - Health check

**Read this if:**
- You're integrating with the API
- You need to understand error responses
- You're writing tests
- You're debugging API issues
- You want complete examples

---

### [FORM-VALIDATION.md](./FORM-VALIDATION.md)
**Exhaustive guide to the form validation system**

**You'll learn:**
- React Hook Form integration (step-by-step)
- Zod schema validation (client + server)
- Client-side validation (onBlur timing explained)
- Server-side validation (with sanitization)
- Error handling and display (with accessibility)
- Field-by-field validation rules breakdown
- Phone number normalization to E.164
- Input sanitization techniques
- Complete request flow with timing
- Performance considerations
- Security features (XSS, SQL injection)
- Testing strategies
- Troubleshooting guide

**Visual aids:**
- Complete validation flow diagram (10 steps)
- Error handling flowchart
- Field validation examples table

**Read this if:**
- You're adding new form fields
- You're debugging validation issues
- You want to understand client/server validation
- You need to customize validation rules
- You're implementing similar validation elsewhere
- Validation errors not showing properly

---

### [PHONE-INPUT.md](./PHONE-INPUT.md)
**Complete guide to the international phone input system**

**You'll learn:**
- react-international-phone library integration
- Automatic country detection via geolocation API
- 200+ country support with flags and dial codes
- Auto-formatting per country rules
- E.164 normalization for database storage
- Dark mode styling (complete CSS breakdown)
- PhoneInput component structure (with diagram)
- Client-side formatting (how it works)
- Server-side normalization (transform + pipe)
- Complete request flow (page load → submission)
- Performance optimization
- Troubleshooting guide

**Visual aids:**
- Component structure diagram
- Country detection flow (with timing)
- Phone normalization examples table
- Dark mode CSS explanation

**Read this if:**
- Phone input not detecting country correctly
- Dark mode styling issues (black on black)
- Phone validation failing on server
- Want to customize phone input appearance
- Need to understand E.164 format
- Implementing similar international inputs
- Dropdown not appearing properly

---

### [GEOLOCATION.md](./GEOLOCATION.md)
**Comprehensive guide to the geolocation system**

**You'll learn:**
- How Cloudflare geolocation works (data sources)
- CF-IPCountry header (with special values)
- request.cf object (40+ available fields)
- Backend /api/geo endpoint implementation
- Frontend country detection with useEffect
- Integration with phone input (complete flow)
- Complete data flow diagrams
- Accuracy and limitations by level (country/city/coordinates)
- VPN/proxy/Tor handling
- Mobile network considerations
- Privacy considerations (GDPR compliance)
- Testing strategies (VPN, WARP, mocking)
- Performance analysis

**Use cases covered:**
- Phone input country detection
- Analytics country distribution
- Geographic fraud detection
- Content localization

**Read this if:**
- Country detection not working
- Want to collect more geo metadata
- Need to understand geolocation accuracy
- Implementing country-based features
- Troubleshooting location issues
- Understanding privacy implications
- Testing with different countries

---

### [TURNSTILE.md](./TURNSTILE.md)
**Turnstile integration and verification guide**

**You'll learn:**
- Widget configuration (explicit vs auto-render)
- Interaction-only appearance (hidden until needed)
- Manual execution flow (execute mode)
- Callback implementations (5 callbacks)
- Dark mode synchronization
- Server-side validation with siteverify API
- Token replay protection
- Testing strategies (test keys)
- Error handling

**Read this if:**
- You're integrating Turnstile
- Widget not loading/rendering
- Verification failing
- Want to customize Turnstile appearance
- Need to test Turnstile locally
- Understanding challenge flow

---

### [FRAUD-DETECTION.md](./FRAUD-DETECTION.md)
**Ephemeral ID-based fraud detection with progressive timeouts**

**You'll learn:**
- Why ephemeral IDs (not strict rate limiting)
- What ephemeral IDs are (Enterprise Bot Management)
- 7-day detection window rationale
- Pattern recognition algorithm (not real-time blocking)
- Progressive timeout system (1h → 4h → 8h → 12h → 24h)
- Risk scoring formula
  - Ephemeral ID checks (preferred, 7-day window)
  - IP-based fallback (1-hour window)
  - Blocking threshold: 70 risk score
- Pattern examples and edge cases
- Database schema for validation tracking
- Why not strict rate limiting (D1 eventual consistency)
- When to use Durable Objects (strict limits)

**Read this if:**
- You're implementing fraud detection
- Want to understand ephemeral IDs
- Need to adjust risk thresholds or timeout durations
- Experiencing false positives/negatives
- Want strict rate limiting (guide to Durable Objects)
- Understanding trade-offs

---

### [DATABASE-OPERATIONS.md](./DATABASE-OPERATIONS.md)
**Complete D1 database management guide**

**You'll learn:**
- Database configuration and connection
- Common viewing operations (count, recent, filtered)
- Data cleanup commands (delete all, delete old, delete specific)
- Analytics queries (submissions over time, fraud stats, geographic analysis)
- Fraud management (view blacklist, manually block/unblock, progressive timeouts)
- Schema management (initialize, view, migrations)
- Backup and restore procedures
- Troubleshooting common issues (foreign keys, timeouts, syntax errors)
- Performance tips and best practices

**Commands documented:**
- View submissions, validations, blacklist entries
- Count records and check database status
- Delete data (all, old, or specific entries)
- Manage fraud blacklist (add, remove, view timeouts)
- Run analytics queries
- Export and import data

**Read this if:**
- You need to manage the D1 database
- Want to clear test data
- Need to view or export submissions
- Managing fraud blacklist entries
- Troubleshooting database issues
- Setting up backups
- Learning D1 query syntax

---

### [TURNSTILE-ENHANCEMENTS.md](./TURNSTILE-ENHANCEMENTS.md)
**Optional enhancement opportunities**

**You'll learn:**
- Already implemented features (comprehensive checklist)
- High-priority enhancements:
  - Resource hints (preconnect to Cloudflare)
  - Action parameter for analytics
  - Testing key support (local development)
- Medium/low-priority optional features
- Features not recommended (with rationale)
- Priority matrix and implementation guide

**Read this if:**
- You want to improve Turnstile integration
- Need ideas for enhancements
- Planning future improvements
- Want to optimize performance
- Understanding what's already done

---

## Finding Information

### By Task

| What you want to do | Where to look |
|---------------------|---------------|
| Add a new form field | [FORM-VALIDATION.md](./FORM-VALIDATION.md) → Field-by-Field section |
| Fix phone input not working | [PHONE-INPUT.md](./PHONE-INPUT.md) → Troubleshooting section |
| Country detection failing | [GEOLOCATION.md](./GEOLOCATION.md) → Troubleshooting section |
| API returning 400 error | [API-REFERENCE.md](./API-REFERENCE.md) → Error Responses section |
| Turnstile widget not loading | [TURNSTILE.md](./TURNSTILE.md) → Troubleshooting section |
| Dark mode text not visible | [PHONE-INPUT.md](./PHONE-INPUT.md) → Dark Mode Styling section |
| Understand the architecture | [ARCHITECTURE.md](./ARCHITECTURE.md) |
| Security audit required | [SECURITY.md](./SECURITY.md) |
| Fraud detection too aggressive | [FRAUD-DETECTION.md](./FRAUD-DETECTION.md) → Risk Score section |
| Customize fraud detection thresholds | [../CONFIGURATION-SYSTEM.md](../CONFIGURATION-SYSTEM.md) |
| Test API endpoints | [API-REFERENCE.md](./API-REFERENCE.md) → Testing section |
| Clear database or view data | [DATABASE-OPERATIONS.md](./DATABASE-OPERATIONS.md) → Common Operations |
| Manage fraud blacklist | [DATABASE-OPERATIONS.md](./DATABASE-OPERATIONS.md) → Fraud Management |
| Database query errors | [DATABASE-OPERATIONS.md](./DATABASE-OPERATIONS.md) → Troubleshooting |

### By System Component

| Component | Documentation |
|-----------|---------------|
| **Frontend** | |
| React components | [ARCHITECTURE.md](./ARCHITECTURE.md) → Frontend section |
| Form validation (client) | [FORM-VALIDATION.md](./FORM-VALIDATION.md) → Client-Side section |
| Phone input component | [PHONE-INPUT.md](./PHONE-INPUT.md) → Component Structure |
| Dark mode | [PHONE-INPUT.md](./PHONE-INPUT.md) → Dark Mode Styling |
| **Backend** | |
| API endpoints | [API-REFERENCE.md](./API-REFERENCE.md) |
| Form validation (server) | [FORM-VALIDATION.md](./FORM-VALIDATION.md) → Server-Side section |
| Geolocation API | [GEOLOCATION.md](./GEOLOCATION.md) → Backend API |
| Turnstile verification | [TURNSTILE.md](./TURNSTILE.md) → Server-Side section |
| Fraud detection | [FRAUD-DETECTION.md](./FRAUD-DETECTION.md) |
| **Database** | |
| Schema | [../schema.sql](../schema.sql) + [ARCHITECTURE.md](./ARCHITECTURE.md) |
| D1 Operations | [DATABASE-OPERATIONS.md](./DATABASE-OPERATIONS.md) |
| Metadata fields | [SECURITY.md](./SECURITY.md) → Request Metadata |
| **Cloudflare** | |
| Geolocation headers | [GEOLOCATION.md](./GEOLOCATION.md) → Cloudflare Geolocation |
| Turnstile integration | [TURNSTILE.md](./TURNSTILE.md) |
| Bot Management | [FRAUD-DETECTION.md](./FRAUD-DETECTION.md) → Ephemeral IDs |

### By Error Message

| Error | Documentation |
|-------|---------------|
| "Phone must contain 7-15 digits" | [PHONE-INPUT.md](./PHONE-INPUT.md) → Phone Normalization |
| "Turnstile verification failed" | [TURNSTILE.md](./TURNSTILE.md) → Troubleshooting |
| "Validation failed" (400) | [FORM-VALIDATION.md](./FORM-VALIDATION.md) → Error Handling |
| "Submission blocked due to suspicious activity" (403) | [FRAUD-DETECTION.md](./FRAUD-DETECTION.md) → Risk Score |
| "Failed to detect country" | [GEOLOCATION.md](./GEOLOCATION.md) → Troubleshooting |
| Dark mode black on black | [PHONE-INPUT.md](./PHONE-INPUT.md) → Dark Mode Styling |

## Documentation Standards

### What Makes Our Documentation Exhaustive

1. **Complete Coverage**
   - Every step explained in detail
   - No assumptions about prior knowledge
   - Code examples for every concept
   - Real-world use cases

2. **Visual Aids**
   - ASCII diagrams for flows
   - Tables for comparisons
   - Code structure visualizations
   - Timing breakdowns

3. **Practical Focus**
   - Real code examples from the project
   - Troubleshooting sections
   - Common mistakes highlighted
   - Performance considerations

4. **Cross-References**
   - Links to related documentation
   - "See also" sections
   - Context for when to use each approach

5. **Testing & Debugging**
   - Testing strategies
   - Debugging steps
   - Common issues and solutions
   - Performance metrics

### Document Structure

Each document follows this structure:

```
# Title - Brief Description

## Table of Contents
- Detailed section links

## Overview
- What this covers
- Why it exists
- When to use

## [Main Technical Sections]
- Detailed implementation
- Code examples
- Diagrams
- Tables

## Troubleshooting
- Common issues
- Solutions
- Debugging steps

## Related Documentation
- Links to related docs
- Cross-references
```

## Contributing to Documentation

### When to Update Docs

Update documentation when:
- ✅ Adding new features
- ✅ Changing existing behavior
- ✅ Fixing bugs that affect documented behavior
- ✅ Discovering undocumented edge cases
- ✅ Users ask questions not covered in docs
- ✅ Finding errors or outdated information

### Documentation Checklist

When adding/updating a feature:

- [ ] Update relevant technical doc
- [ ] Add code examples (TypeScript/JavaScript)
- [ ] Include error cases and handling
- [ ] Add troubleshooting section
- [ ] Update API reference if API changed
- [ ] Update README if public-facing
- [ ] Cross-reference related docs
- [ ] Update this index if adding new doc

### Writing Style

**Be specific:**
```
❌ "The phone input validates the number"
✅ "The phone input validates that the number contains 7-15 digits"
```

**Use examples:**
```
❌ "Invalid phone numbers are rejected"
✅ "Invalid phone numbers are rejected:
    - 123 (too short: 3 digits)
    - +123456789012345678 (too long: 18 digits)"
```

**Show code:**
```
❌ "Configure the validator"
✅ "Configure the validator:
    const schema = z.string().min(1).email();"
```

**Include context:**
```
❌ "Use onBlur validation"
✅ "Use onBlur validation (validates when user leaves field)
    - Good balance between UX and performance
    - User gets feedback after completing field"
```

## Related Files

- **[../.dev.vars.example](../.dev.vars.example)** - Local development secrets template
- **[../schema.sql](../schema.sql)** - D1 database schema
- **[../wrangler.jsonc](../wrangler.jsonc)** - Worker configuration

## Documentation Metrics

### Coverage Status

| System | Documentation | Completeness |
|--------|--------------|--------------|
| Form validation | FORM-VALIDATION.md | Exhaustive |
| Phone input | PHONE-INPUT.md | Exhaustive |
| Geolocation | GEOLOCATION.md | Exhaustive |
| API endpoints | API-REFERENCE.md | Complete |
| Turnstile | TURNSTILE.md | Complete |
| Fraud detection | FRAUD-DETECTION.md | Complete |
| Configuration | CONFIGURATION-SYSTEM.md | Complete |
| Architecture | ARCHITECTURE.md | Complete |
| Security | SECURITY.md | Complete |
| Database | DATABASE-OPERATIONS.md | Complete |
| Analytics UI | Not documented | Needs doc |
| Deployment | README only | Needs doc |

### Recent Updates

**2025-11-16:** Configuration system documentation
- Added CONFIGURATION-SYSTEM.md - Complete fraud detection configuration guide (12KB)
- Updated API-REFERENCE.md - Added /api/config endpoint documentation
- Updated FRAUD-DETECTION.md - Added configuration system section
- Updated SCORING-ANALYSIS.md - Note that thresholds are configurable
- Updated this index with configuration system navigation

**2025-11-13:** Database operations & fraud detection updates
- Added DATABASE-OPERATIONS.md - Complete D1 management guide (35KB)
- Updated FRAUD-DETECTION.md - Progressive timeout system (1h → 24h)
- Updated this index with database operations navigation

**2024-11-12:** Major documentation expansion
- Added FORM-VALIDATION.md - Exhaustive validation guide (30KB)
- Added PHONE-INPUT.md - Complete phone system (32KB)
- Added GEOLOCATION.md - Comprehensive geo guide (28KB)
- Added API-REFERENCE.md - Complete API docs
- Updated this index with comprehensive navigation

---

## Questions?

**Setup issues?** See [../README.md](../README.md) Troubleshooting section

**Missing documentation?** Open an issue or add a TODO comment in the doc

**Found an error?** Submit a correction or note it in the document
