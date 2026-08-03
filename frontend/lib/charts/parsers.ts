/**
 * Runtime type guards and parsers for chart data.
 * Replaces unsafe `as unknown as Type[]` casts with validated parsing.
 */

import { asFiniteNumber } from "./number-format";
import type {
  ParetoDataPoint,
  TopCauseDataPoint,
  CancellationDataPoint,
  DistributionDataPoint,
  TemporalDataPoint,
  P90DataPoint,
  HistogramDataPoint,
} from "./types";

/** Parse raw API response data into typed ParetoDataPoint[] */
export function parseParetoData(raw: unknown): ParetoDataPoint[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item: any) => ({
    causa: String(item?.causa ?? ""),
    count: asFiniteNumber(item?.count),
    percentage: asFiniteNumber(item?.percentage),
    cumulative_pct: asFiniteNumber(item?.cumulative_pct),
    aggregated: Boolean(item?.aggregated),
  }));
}

export function parseTopCauseData(raw: unknown): TopCauseDataPoint[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item: any) => ({
    causa: String(item?.causa ?? ""),
    count: asFiniteNumber(item?.count),
  }));
}

export function parseCancellationData(raw: unknown): CancellationDataPoint[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item: any) => ({
    category: String(item?.category ?? ""),
    count: asFiniteNumber(item?.count),
    percentage: asFiniteNumber(item?.percentage),
  }));
}

export function parseDistributionData(raw: unknown): DistributionDataPoint[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item: any) => ({
    category: String(item?.category ?? ""),
    count: asFiniteNumber(item?.count),
  }));
}

export function parseTemporalData(raw: unknown): TemporalDataPoint[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item: any) => ({
    period: String(item?.period ?? ""),
    count: asFiniteNumber(item?.count),
  }));
}

export function parseP90Data(raw: unknown): P90DataPoint[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item: any) => ({
    causa: String(item?.causa ?? ""),
    p90: asFiniteNumber(item?.p90),
    count: asFiniteNumber(item?.count),
  }));
}

export function parseHistogramData(raw: unknown): HistogramDataPoint[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item: any) => ({
    bucket: String(item?.bucket ?? ""),
    count: asFiniteNumber(item?.count),
  }));
}
