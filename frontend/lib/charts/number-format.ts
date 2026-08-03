/**
 * Defensive number formatting for chart components.
 * Never calls .toFixed() or .toLocaleString() on unknown types directly.
 */

/**
 * Convert unknown value to a finite number.
 * Returns 0 if value is not convertible (does not throw).
 */
export function asFiniteNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

/** Format as integer with thousands separator */
export function formatInteger(value: unknown): string {
  return asFiniteNumber(value).toLocaleString("es-CO", { maximumFractionDigits: 0 });
}

/** Format as decimal with configurable decimals */
export function formatDecimal(value: unknown, decimals = 1): string {
  return asFiniteNumber(value).toFixed(decimals);
}

/** Format as percentage with configurable decimals */
export function formatPercent(value: unknown, decimals = 1): string {
  return `${asFiniteNumber(value).toFixed(decimals)}%`;
}
