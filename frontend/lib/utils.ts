import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge Tailwind CSS classes with conflict resolution */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Format a numeric value as days with 1 decimal place.
 * Example: 6.3 → "6.3 días"
 */
export function formatDays(value: number): string {
  return `${value.toFixed(1)} días`;
}

/**
 * Format a numeric value as a percentage with 1 decimal place.
 * Example: 85.2 → "85.2%"
 */
export function formatPercentage(value: number): string {
  return `${value.toFixed(1)}%`;
}

/**
 * Format an integer with thousands separator (locale-aware).
 * Example: 51008 → "51,008" (en) or "51.008" (es)
 */
export function formatNumber(value: number): string {
  return Math.round(value).toLocaleString("es-CO");
}
