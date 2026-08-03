# Data Normalization Policy — VantiOps 360

## Scope

This policy governs how data values from PostgreSQL (via Neon) are converted to JavaScript numbers for chart rendering and KPI display.

## Problem

PostgreSQL `ROUND()` returns `numeric` type which the Neon driver serializes as **strings** in JSON (e.g., `"50.08"` not `50.08`). Additionally, NULL values from empty aggregation groups need handling.

## Functions

### `toNumber(value: unknown): number`

**Location:** `lib/server/chart-normalizers.ts`  
**Context:** Server-side API normalization

| Input | Output | Behavior |
|-------|--------|----------|
| `42` (finite number) | `42` | Pass through |
| `"50.08"` (numeric string) | `50.08` | Convert |
| `null` | `0` | Default (Postgres empty group) |
| `undefined` | `0` | Default |
| `""` (empty string) | `0` | Default |
| `"abc"` (text) | `0` | Default + dev warning |
| `NaN` | `0` | Default |
| `Infinity` | `0` | Default |

**Risk:** Converting null/invalid to 0 may mask data issues. Mitigated by `warnIfInvalid` logging in development.

### `toFiniteNumber(value, fieldName, rowIndex): number`

**Location:** `lib/server/chart-normalizers.ts`  
**Context:** Strict validation (throws on truly invalid data)

| Input | Output | Behavior |
|-------|--------|----------|
| Finite number | Same value | Pass |
| Numeric string | Converted number | Pass |
| `null`/`undefined` | `0` | Fallback (production) |
| Text/NaN/Infinity | THROWS | `ChartDataValidationError` |

### `asFiniteNumber(value: unknown): number`

**Location:** `lib/charts/number-format.ts`  
**Context:** Client-side defensive formatting

| Input | Output |
|-------|--------|
| Finite number | Same |
| Numeric string | Converted |
| null/undefined/NaN/Infinity/text | `0` |

**Design decision:** Client-side returns 0 silently because the ErrorBoundary catches render crashes. The API layer is responsible for data integrity.

### `formatPercent(value: unknown, decimals = 1): string`

Calls `asFiniteNumber` then `.toFixed(decimals) + "%"`.  
Never throws. Never returns "NaN%" or "Infinity%".

### `formatDecimal(value: unknown, decimals = 1): string`

Same pattern. Safe for Recharts tooltip formatters.

### Chart Parsers (`lib/charts/parsers.ts`)

Each parser (`parseParetoData`, `parseCancellationData`, etc.):
- Accepts `unknown` input
- Returns empty array for non-array input
- Converts each field using `asFiniteNumber`
- Converts labels using `String(value ?? "")`
- Never throws

## Privacy

- `warnIfInvalid` never logs the full value in production
- Never logs customer names, emails, IDs, or PII
- Log format: `[chart-normalizers] Unexpected value for "fieldName" (row N)`

## Limitations

1. Converting null to 0 may affect aggregation totals when Postgres returns NULL for empty HAVING groups
2. The `asFiniteNumber` client fallback means truly invalid data renders as 0 rather than showing an error state
3. String numbers from Postgres ROUND() are expected and valid — not an error condition
