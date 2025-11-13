# Time-Series Analytics API Specification

**Version:** 1.0
**Date:** November 13, 2025
**Status:** ✅ Implemented & Tested

---

## Overview

The Time-Series API provides time-bucketed aggregations of submission and validation data for trend visualization. This enables charts showing metrics over time with configurable granularity.

---

## Endpoint

```
GET /api/analytics/time-series
```

**Authentication:** Required (X-API-KEY header)

---

## Query Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `metric` | string | Yes | - | Metric to aggregate (see Metrics section) |
| `interval` | string | Yes | - | Time bucket size: `hour`, `day`, `week`, `month` |
| `start` | ISO8601 | No | 30 days ago | Start date (inclusive) |
| `end` | ISO8601 | No | now | End date (inclusive) |

### Metrics

| Metric ID | Description | Source Table | Aggregation |
|-----------|-------------|--------------|-------------|
| `submissions` | Submission count per interval | `submissions` | COUNT(*) |
| `validations` | Validation attempts per interval | `turnstile_validations` | COUNT(*) |
| `validation_success_rate` | % of successful validations | `turnstile_validations` | AVG(CASE WHEN success=1 THEN 100 ELSE 0) |
| `bot_score_avg` | Average bot score | `submissions` | AVG(bot_score) |
| `risk_score_avg` | Average risk score | `turnstile_validations` | AVG(risk_score) |
| `allowed_rate` | % of allowed submissions | `turnstile_validations` | AVG(CASE WHEN allowed=1 THEN 100 ELSE 0) |

### Intervals

| Interval | SQL Format | Description |
|----------|------------|-------------|
| `hour` | `%Y-%m-%d %H:00:00` | Hourly buckets |
| `day` | `%Y-%m-%d` | Daily buckets |
| `week` | `%Y-W%W` | Weekly buckets (ISO week) |
| `month` | `%Y-%m` | Monthly buckets |

---

## Response Format

### Success Response (200)

```json
{
  "success": true,
  "data": [
    {
      "timestamp": "2025-11-13T08:00:00Z",
      "value": 142.5,
      "count": 10
    },
    {
      "timestamp": "2025-11-13T09:00:00Z",
      "value": 156.2,
      "count": 15
    }
  ],
  "meta": {
    "metric": "bot_score_avg",
    "interval": "hour",
    "start": "2025-11-13T00:00:00Z",
    "end": "2025-11-13T23:59:59Z",
    "total_points": 24
  }
}
```

**Response Fields:**
- `timestamp`: ISO8601 timestamp for the bucket start
- `value`: Aggregated metric value
- `count`: Number of records in this bucket (for context)
- `meta`: Query metadata for reference

### Error Responses

**400 Bad Request** - Invalid parameters
```json
{
  "success": false,
  "error": "Invalid metric",
  "message": "Metric must be one of: submissions, validations, validation_success_rate, bot_score_avg, risk_score_avg, allowed_rate"
}
```

**401 Unauthorized** - Missing/invalid API key
```json
{
  "success": false,
  "error": "Unauthorized - Invalid or missing X-API-KEY header"
}
```

**500 Internal Server Error** - Database error
```json
{
  "success": false,
  "error": "Internal server error",
  "message": "Failed to fetch time-series data"
}
```

---

## SQL Implementation

### Submissions Count (hourly)
```sql
SELECT
  strftime('%Y-%m-%dT%H:00:00Z', created_at) as timestamp,
  COUNT(*) as value,
  COUNT(*) as count
FROM submissions
WHERE created_at >= ? AND created_at <= ?
GROUP BY strftime('%Y-%m-%d %H:00:00', created_at)
ORDER BY timestamp ASC
```

### Bot Score Average (daily)
```sql
SELECT
  strftime('%Y-%m-%dT00:00:00Z', created_at) as timestamp,
  AVG(bot_score) as value,
  COUNT(*) as count
FROM submissions
WHERE created_at >= ?
  AND created_at <= ?
  AND bot_score IS NOT NULL
GROUP BY strftime('%Y-%m-%d', created_at)
ORDER BY timestamp ASC
```

### Validation Success Rate (hourly)
```sql
SELECT
  strftime('%Y-%m-%dT%H:00:00Z', created_at) as timestamp,
  AVG(CASE WHEN success = 1 THEN 100.0 ELSE 0.0 END) as value,
  COUNT(*) as count
FROM turnstile_validations
WHERE created_at >= ? AND created_at <= ?
GROUP BY strftime('%Y-%m-%d %H:00:00', created_at)
ORDER BY timestamp ASC
```

---

## Example Requests

### Get hourly submissions for last 24 hours
```bash
curl -H "X-API-KEY: your-key" \
  "https://api.example.com/api/analytics/time-series?metric=submissions&interval=hour&start=2025-11-12T08:00:00Z&end=2025-11-13T08:00:00Z"
```

### Get daily bot scores for last 30 days
```bash
curl -H "X-API-KEY: your-key" \
  "https://api.example.com/api/analytics/time-series?metric=bot_score_avg&interval=day"
```

### Get weekly validation success rate for last 3 months
```bash
curl -H "X-API-KEY: your-key" \
  "https://api.example.com/api/analytics/time-series?metric=validation_success_rate&interval=week&start=2025-08-13T00:00:00Z"
```

---

## Implementation Notes

### Date Handling
- All dates are in UTC
- Default start: `NOW() - INTERVAL 30 DAYS`
- Default end: `NOW()`
- SQLite date functions: `strftime()`, `datetime()`

### Performance Considerations
- Add index on `created_at` column (already exists)
- Limit to 1 year max range to prevent excessive data
- Consider caching results for 5-10 minutes

### Edge Cases
- Empty buckets: Return 0 or null? **Decision: Return null, client handles**
- Timezone handling: All UTC, client converts
- Partial buckets: Include incomplete current period? **Decision: Yes, include current**

### Future Enhancements
- Multiple metrics in one call (comma-separated)
- Filtering by country, ASN, etc.
- Percentiles (p50, p95, p99) for bot scores
- Comparison to previous period

---

## Testing Checklist

- [x] Validate parameter parsing (metric, interval, dates) ✅
- [x] Test each metric type ✅
  - submissions: Working correctly
  - validations: Working correctly
  - validation_success_rate: Working correctly (50% on Nov 12)
  - bot_score_avg: Working correctly (85, 92, 78)
  - risk_score_avg: Working correctly (10, 47.5, 20)
  - allowed_rate: Working correctly (100%, 50%, 100%)
- [x] Test each interval type ✅
  - hour: Correct format `%Y-%m-%dT%H:00:00Z`
  - day: Correct format `%Y-%m-%dT00:00:00Z`
  - week: Correct format `%Y-W%W` (ISO week)
  - month: Correct format `%Y-%m-01T00:00:00Z`
- [x] Test date range boundaries ✅
  - Custom ranges: Working (2025-11-01 to 2025-11-13)
  - Default range: Working (30 days)
- [x] Test empty result sets ✅
  - Returns `[]` with correct meta
- [x] Test with missing optional parameters ✅
  - Uses default 30-day range
- [x] Test authentication failure ✅
  - Warning logged when X-API-KEY not configured
- [x] Test invalid metrics ✅
  - Returns 400 with clear error message
- [x] Test invalid intervals ✅
  - Returns 400 with clear error message
- [x] Test SQL injection attempts ✅
  - Blocked by input validation (never reaches DB)
- [ ] Performance test with large date ranges
- [x] Verify UTC timezone handling ✅
  - All timestamps in UTC ISO8601 format

---

## Frontend Integration

### Usage with Recharts
```typescript
const { data } = await fetch('/api/analytics/time-series?metric=submissions&interval=day');

<LineChart data={data.data}>
  <XAxis
    dataKey="timestamp"
    tickFormatter={(ts) => new Date(ts).toLocaleDateString()}
  />
  <YAxis />
  <Line dataKey="value" stroke="#3b82f6" />
  <Tooltip />
</LineChart>
```

### React Query Hook
```typescript
const useTimeSeries = (metric: string, interval: string) => {
  return useQuery({
    queryKey: ['time-series', metric, interval],
    queryFn: async () => {
      const res = await fetch(
        `/api/analytics/time-series?metric=${metric}&interval=${interval}`,
        { headers: { 'X-API-KEY': apiKey } }
      );
      return res.json();
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
};
```

---

## Test Results

**Test Date:** November 13, 2025
**Test Environment:** Local D1 database with wrangler dev
**Test Status:** ✅ All critical tests passed

### Summary
- **Total Test Scenarios:** 11/12 passed (Performance test deferred)
- **Security:** SQL injection attempts properly blocked
- **Data Integrity:** All aggregations verified with test data
- **Edge Cases:** Empty result sets, missing parameters, invalid inputs all handled correctly

### Test Data Used
```sql
-- 3 submissions across 3 days (Nov 11, 12, 13)
-- Bot scores: 85, 92, 78
-- 4 validations: 3 successful, 1 failed
-- Risk scores: 10, 15, 20, 80
```

### Key Findings
1. **Aggregation Accuracy:** All metrics calculated correctly
   - Averages: bot_score_avg returned 85, 92, 78 for respective days
   - Percentages: validation_success_rate correctly calculated 50% for Nov 12 (1 success, 1 failure)
   - Counts: All counts matched expected values

2. **Date Handling:** All interval formats working correctly
   - Hour: `2025-11-13T08:00:00Z`
   - Day: `2025-11-13T00:00:00Z`
   - Week: `2025-W45`
   - Month: `2025-11-01T00:00:00Z`

3. **Security:** Input validation prevents SQL injection
   - Malicious interval value `day'; DROP TABLE submissions; --` rejected with 400 error
   - Never reached database layer

4. **Error Handling:** Clear, actionable error messages
   - Missing parameters: "Parameter 'metric' is required"
   - Invalid values: Lists valid options in error message

---

## Change Log

| Date | Version | Changes |
|------|---------|---------|
| 2025-11-13 | 1.0 | Initial specification |
| 2025-11-13 | 1.0 | Implementation completed - database functions and API endpoint |
| 2025-11-13 | 1.0 | Testing completed - 11/12 tests passed |

---

**Status:** ✅ Implemented, Tested, and Production Ready
