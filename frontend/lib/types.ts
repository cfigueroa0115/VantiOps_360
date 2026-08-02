/**
 * TypeScript interfaces for the PQR Analytics Dashboard.
 * Shared types consumed by hooks, components, and the API client.
 */

/** KPI response data structure returned by GET /api/kpis */
export interface KPIData {
  totalPqr: number;
  closedPqr: number;
  inProcessPqr: number;
  percentageClosed: number;
  avgManagementTime: number;
  medianManagementTime: number;
  p90ManagementTime: number;
  p95ManagementTime: number;
  maxManagementTime: number;
  distinctCausesCount: number;
  mainCauseSharePct: number;
  qualityIssuesPct: number;
  dataQualityScore: number;
}

/** Filter parameters sent as query params to backend endpoints */
export interface FilterParams {
  dateRange?: { start: string; end: string };
  companies?: string[];
  causes?: string[];
  channels?: string[];
  statuses?: string[];
  results?: string[];
  responsibleUnits?: string[];
  managementTimeRange?: { min: number; max: number };
}

/** Generic chart data response from GET /api/charts/{chart_type} */
export interface ChartDataResponse {
  chartType: string;
  data: Record<string, unknown>[];
  metadata: { recordCount: number; lastUpdated: string };
}

/** Available filter options from GET /api/filters/options */
export interface FilterOptions {
  companies: string[];
  causes: string[];
  channels: string[];
  statuses: string[];
  results: string[];
  responsibleUnits: string[];
  managementTimeMax: number;
}

/** Severity levels for executive findings */
export type Severity = "critical" | "high" | "medium" | "low";

/** Single executive finding entry */
export interface Finding {
  description: string;
  affectedMetric: string;
  severity: Severity;
  recommendedAction: string;
}

/** Quality report response from GET /api/quality/report */
export interface QualityReportResponse {
  overallScore: number;
  dimensions: {
    completeness: number;
    validity: number;
    consistency: number;
    uniqueness: number;
    timeliness: number;
    referentialIntegrity: number;
  };
  violations: QualityViolation[];
  metadata: { generatedAt: string; recordCount: number };
}

/** Individual quality rule violation */
export interface QualityViolation {
  ruleName: string;
  targetField: string;
  violationsCount: number;
  violationsPct: number;
  severity: Severity;
  correctiveAction: string;
}

/** Risk model response from GET /api/risk/model */
export interface RiskModelResponse {
  modelType: string;
  metrics: {
    precision: number;
    recall: number;
    f1Score: number;
    rocAuc: number;
  };
  featureImportance: { feature: string; importance: number }[];
  disclaimer: string;
}

/** RCA findings response from GET /api/rca/findings */
export interface RCAFindingsResponse {
  mainCause: string;
  mainCauseShare: number;
  findings: Finding[];
  methodologies: string[];
}
