# Geolocation Implementation

## Overview

Uses Cloudflare's built-in geolocation via request headers.

**Usage:**
- Auto-detect user's country for phone input
- Collect geographic metadata for submissions
- Enable country-based analytics

## Implementation

Cloudflare adds `CF-IPCountry` header to every request based on client IP.

**Header format:** ISO 3166-1 alpha-2 (2 letters, uppercase)
- Examples: `US`, `GB`, `NL`, `AU`, `JP`
- Special: `XX` (unknown), `T1` (Tor), `A1` (proxy), `A2` (satellite)

## Backend API

```typescript
// src/routes/geo.ts
geo.get('/', (c) => {
  const countryCode = c.req.header('CF-IPCountry') || 'US';
  return c.json({
    success: true,
    countryCode: countryCode.toLowerCase(), // Lowercase format for consistency
  });
});
```

**Response:**
```json
{
  "success": true,
  "countryCode": "nl"
}
```

## Frontend Integration

```typescript
// frontend/src/components/SubmissionForm.tsx
const [defaultCountry, setDefaultCountry] = useState<CountryIso2>('us');

useEffect(() => {
  fetch('/api/geo')
    .then(r => r.json())
    .then(data => setDefaultCountry(data.countryCode))
    .catch(() => {/* silently fallback to 'us' */});
}, []);
```

Page loads with US flag as default, then updates to user's country after API call.

## Extended Geolocation Data

Cloudflare provides additional geographic data via `request.cf`:

```typescript
const cf = c.req.raw.cf;
// Available: country, region, city, postalCode, timezone,
//            latitude, longitude, continent, asn, colo
```

Currently using only `country` for phone input. Extended data stored with submissions for analytics.

## Behavior with VPNs/Proxies

**VPNs/Proxies:**
- Returns VPN/proxy country, not user's actual country
- May be detected as `A1` (anonymous proxy)
- Phone input allows manual country selection

**Mobile Networks:**
- May geolocate to carrier headquarters
- Country usually accurate
- City/region may be inaccurate

**Tor:**
- Returns exit node country
- Detected as `T1`

## Testing

**Production:**
```bash
curl https://form.erfi.dev/api/geo
# Returns detected country for your IP
```

**Development:**
```bash
# Mock country header in wrangler dev
curl http://localhost:8787/api/geo -H "CF-IPCountry: JP"
```

## References

- Phone input usage: PHONE-INPUT.md
- Submission metadata collection: API-REFERENCE.md
- Analytics by country: Analytics dashboard implementation
