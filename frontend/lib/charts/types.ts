export type ChartType =
  | "pareto" | "top_causes" | "cancellation_donut"
  | "distribution_company" | "distribution_channel" | "distribution_result"
  | "temporal_trend" | "p90_by_cause" | "open_cases_histogram";

export interface ParetoDataPoint {
  causa: string;
  count: number;
  percentage: number;
  cumulative_pct: number;
  aggregated?: boolean;
}

export interface TopCauseDataPoint {
  causa: string;
  count: number;
}

export interface CancellationDataPoint {
  category: string;
  count: number;
  percentage: number;
}

export interface DistributionDataPoint {
  category: string;
  count: number;
}

export interface TemporalDataPoint {
  period: string;
  count: number;
}

export interface P90DataPoint {
  causa: string;
  p90: number;
  count: number;
}

export interface HistogramDataPoint {
  bucket: string;
  count: number;
}
