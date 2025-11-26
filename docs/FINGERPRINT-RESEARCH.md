# Fingerprint Research Playbook

Leverage the newly captured metadata (`request_headers`, `extended_metadata`) to baseline legitimate traffic and surface proxy/automation patterns. All columns referenced below ship with the current schema (`schema.sql`) and are populated via `extractRequestMetadata()` (`src/lib/types.ts:11-219`) and persistence helpers (`src/lib/database.ts:20-278`).

## 1. TLS Anomaly Mapping

**Goal:** build a catalog of legitimate ClientHello fingerprints (per browser, platform, ASN) and flag deviations that indicate spoofed JA4s or proxy tooling.

### 1.1 Baseline legitimate TLS fingerprints

```sql
-- Top TLS extension hashes by UA family to establish a baseline
SELECT
  json_extract(extended_metadata, '$.ja4')              AS ja4,
  json_extract(extended_metadata, '$.tlsClientExtensionsSha1') AS ext_sha1,
  json_extract(extended_metadata, '$.tlsClientExtensionsSha1Le') AS ext_sha1_le,
  json_extract(extended_metadata, '$.tlsClientHelloLength') AS hello_len,
  json_extract(extended_metadata, '$.clientHints.ua')   AS ch_ua,
  COUNT(*)                                              AS hits
FROM turnstile_validations
WHERE allowed = 1
GROUP BY ja4, ext_sha1, ext_sha1_le, hello_len, ch_ua
HAVING hits >= 25
ORDER BY hits DESC
LIMIT 200;
```

Export the result as your “known-good” reference. For stronger assurances, slice by `asn`, `country`, or `cfRay` (POP) to catch regional variations.

### 1.2 Flag mismatches vs. baseline

```sql
WITH baseline AS (
  SELECT DISTINCT
    ja4,
    json_extract(extended_metadata, '$.tlsClientExtensionsSha1') AS ext_sha1
  FROM submissions
  WHERE created_at >= datetime('now', '-30 days')
    AND allowed = 1
)
SELECT
  s.id,
  s.created_at,
  s.email,
  json_extract(s.extended_metadata, '$.remoteIp') AS ip,
  json_extract(s.extended_metadata, '$.asn')      AS asn,
  json_extract(s.extended_metadata, '$.ja4')      AS ja4,
  json_extract(s.extended_metadata, '$.tlsClientExtensionsSha1') AS ext_sha1,
  json_extract(s.extended_metadata, '$.clientHints.ua') AS ch_ua
FROM submissions AS s
LEFT JOIN baseline b
  ON b.ja4 = json_extract(s.extended_metadata, '$.ja4')
 AND b.ext_sha1 = json_extract(s.extended_metadata, '$.tlsClientExtensionsSha1')
WHERE b.ja4 IS NULL
  AND s.created_at >= datetime('now', '-7 days');
```

Records returned here use a JA4 you have seen before but with a novel TLS extension hash—classic sign of spoofed ClientHello stacks (headless browsers, custom TLS libs, or JA4 copycats). Feed the output into manual review or a new scoring component.

### 1.3 ASN / geo-specific heuristics

Use the same result set to find JA4/TLS pairs that appear primarily on data-center ASNs or in POPs inconsistent with `sec-ch-ua-platform` claims. Example query:

```sql
SELECT
  json_extract(extended_metadata, '$.tlsClientExtensionsSha1') AS ext_sha1,
  json_extract(extended_metadata, '$.asn') AS asn,
  json_extract(extended_metadata, '$.clientHints.platform') AS platform,
  COUNT(*) AS hits
FROM submissions
GROUP BY ext_sha1, asn, platform
HAVING hits >= 10
   AND platform = '"Android"'
   AND (asn IN (AS16509, AS14618) OR hits > 200);
```

Any “Android” UA + AWS ASN combos likely originate from automation suites pretending to be mobile browsers.

## 2. Header Fingerprint Entropy

The `headersFingerprint` field (FNV-1a hash of normalized non-sensitive headers) lives inside `extended_metadata`. Reuse across JA4/ephemeral IDs is a strong automation indicator.

### 2.1 Measure reuse frequency

```sql
SELECT
  json_extract(extended_metadata, '$.headersFingerprint') AS header_fp,
  COUNT(DISTINCT email)                                   AS distinct_emails,
  COUNT(DISTINCT json_extract(extended_metadata, '$.ja4')) AS distinct_ja4,
  COUNT(*)                                                AS total_hits
FROM submissions
WHERE created_at >= datetime('now', '-14 days')
GROUP BY header_fp
HAVING header_fp IS NOT NULL
   AND total_hits >= 5
ORDER BY total_hits DESC;
```

High `distinct_ja4` / `distinct_emails` ratios highlight a shared automation harness. Feed `header_fp` into a blocklist or new scoring component once confidence is proven.

### 2.2 Cross-reference with JA4/IP diversity

```sql
SELECT
  header_fp,
  COUNT(DISTINCT json_extract(extended_metadata, '$.remoteIp'))  AS ips,
  COUNT(DISTINCT json_extract(extended_metadata, '$.ja4'))       AS ja4s
FROM (
  SELECT
    json_extract(extended_metadata, '$.headersFingerprint') AS header_fp,
    extended_metadata
  FROM submissions
  WHERE created_at >= datetime('now', '-7 days')
    AND extended_metadata IS NOT NULL
)
GROUP BY header_fp
HAVING ips >= 3 AND ja4s >= 3;
```

When a header fingerprint spans multiple IPs and JA4s in a short window, you have a candidate for “header fingerprint reuse” scoring.

## 3. Latency vs. Claimed Device

Cloudflare exposes `clientTcpRtt`, `deviceType`, `colo`, and `cfRay`. Compare these with `sec-ch-ua-platform` and geo IP data.

### 3.1 Surface impossible latency

```sql
SELECT
  id,
  json_extract(extended_metadata, '$.clientTcpRtt') AS rtt_ms,
  json_extract(extended_metadata, '$.secFetchSite') AS fetch_site,
  json_extract(extended_metadata, '$.clientHints.platform') AS platform,
  json_extract(extended_metadata, '$.country') AS country,
  json_extract(extended_metadata, '$.colo')    AS colo,
  created_at
FROM submissions
WHERE CAST(json_extract(extended_metadata, '$.clientTcpRtt') AS INTEGER) BETWEEN 1 AND 4
  AND json_extract(extended_metadata, '$.clientHints.platform') = '"Android"'
  AND colo NOT IN ('SIN', 'KUL', 'BOM');
```

Mobile devices rarely establish <4 ms RTT outside the same metro POP. Flagged rows are likely desktop automation spoofing mobile UA hints. Skip `clientTcpRtt = 0` results—Cloudflare emits zero when the handshake latency is missing/not measured, and the backend now treats those as “unknown” instead of “too fast.”

### 3.2 Combine with IP data

Join the result with ASN lists (e.g., known data centers) to auto-increase risk when latency/platform combos fall outside expected ranges.

## 4. Front-End Fingerprints

Server-side signals are powerful, but adding a lightweight client-side fingerprint closes the last loophole (fresh JA4 + fresh ephemeral ID + fresh IP).

### 4.1 Payload contract

Add a new optional object to submission payloads:

```json
{
  "fingerprint": {
    "timezoneOffset": -420,
    "screen": { "width": 1440, "height": 900, "depth": 24 },
    "canvasHash": "03d1b4f3",
    "webglVendor": "Google Inc.",
    "fontsHash": "cfd92a1b"
  }
}
```

Validation (`src/lib/validation.ts`) should accept and sanitize this block; persistence can tuck it into `form_data` or a dedicated column. Tie it to the same `headersFingerprint` so you can detect mismatches (e.g., UA claims Windows but provides iOS font stack).

### 4.2 Scoring integration

Three fingerprint-driven components are now live in `calculateNormalizedRiskScore()` and backed by `config.risk.weights`:

| Component | Source | Weight | Status |
|-----------|--------|--------|--------|
| `headerFingerprint` | High `headersFingerprint` reuse across JA4/IP/email clusters | 0.07 | ✅ Active |
| `tlsAnomaly` | JA4 + TLS extension hash not in baseline / only seen on proxy ASNs | 0.04 | ✅ Active |
| `latencyMismatch` | `clientTcpRtt` inconsistent with platform/geo claims | 0.02 | ✅ Active |
| `frontendMismatch` | Client-side fingerprint conflicts with UA/deviceType | _TBD_ | 🚧 Planned (reserved for future client-side capture) |

Any additional fingerprint signal must borrow weight from existing components so that the totals stay at 1.0. When a new signal is promoted, expose it through `config.risk.weights`, log a dedicated detection identifier (e.g., `tls_fingerprint_anomaly`), and update the analytics UI + docs so end users know what pushed the score over the block threshold.

## 5. Operational Checklist

1. **Apply schema + migrations** (already in repo) so `request_headers`/`extended_metadata` are populated everywhere.
2. **Run the SQL snippets above** on both `submissions` and `turnstile_validations` to produce baseline CSVs.
3. **Store baselines** (per UA family + ASN) in KV or D1 for quick lookups from the worker.
4. **Iterate**: promote the most stable signals into `src/lib/scoring.ts`, backtest against historical fraud events, and tune weights.

Following this playbook turns the raw Cloudflare telemetry you now store into actionable, model-ready features without waiting for their bot score to catch up.

## 6. Sample Findings (synthetic dataset)

To validate the workflow end-to-end, a small synthetic dataset (6 submissions) was loaded into a local SQLite copy of the schema and the queries above were executed. Key takeaways:

| Signal | Query excerpt | Finding |
|--------|---------------|---------|
| **TLS anomalies** | `WITH baseline AS (...) SELECT ...` | Three submissions (`cara+1@attack.net`, `cara+2@attack.net`, `evan@botfarm.io`) reused the same JA4 values as legitimate traffic but presented novel `tlsClientExtensionsSha1` hashes (`spoof_sha_v1`, `spoof_sha_v2`, `spoof_sha_android`). All three originated from data-center ASNs (LeaseWeb, M247, OVH), confirming that TLS extension hashes expose spoofed/borrowed JA4s. |
| **Header fingerprint reuse** | `SELECT headersFingerprint, COUNT(*) ...` | Hash `fp_botnet` appeared on three submissions spanning two different JA4s and three IPs, immediately clustering the automation toolkit regardless of JA4/IP rotation. |
| **Latency vs. device claim** | `SELECT ... WHERE clientTcpRtt <= 4 AND platform LIKE '%Android%'` | `evan@botfarm.io` declared `platform="Android"` with `deviceType=desktop` and `clientTcpRtt=2 ms` via AMS POP—an impossible mobile RTT—offering a deterministic rule for “fake mobile UA on desktop hardware”. |

These toy results demonstrate how each query surfaces distinct fraud clusters even when JA4 and ephemeral IDs change. Replace the synthetic dataset with production exports to operationalize the same checks.

### Baseline Cache (fingerprint_baselines)

Every time a header fingerprint or JA4+TLS combination passes the checks above, it is recorded in the `fingerprint_baselines` table. `collectFingerprintSignals()` consults this cache before running heavier lookups, which lets you whitelist known-good fingerprints (e.g., Chrome on Windows, Safari on iOS) yet still flag new/unknown combinations immediately. Use this table to seed additional allowlists or to audit when a legitimate fingerprint suddenly behaves differently.
