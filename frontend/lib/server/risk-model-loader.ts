import { readFile } from "fs/promises";
import path from "path";

/**
 * Shape of the risk_model_results.json file produced by the Python risk model pipeline.
 * All analytical fields are REQUIRED for a valid artifact.
 */
export interface RiskModelFileData {
  model_type: string;
  metrics: {
    precision: number;
    recall: number;
    f1_score: number;
    roc_auc: number;
  };
  feature_importance: Array<{ feature: string; importance: number }>;
  p90_threshold: number;
  training_size: number;
  test_size: number;
  class_balance: Record<string, number>;
  limitations: string[];
  disclaimer?: string;
  generated_at?: string;
  model_version?: string;
}

export type LoadResult =
  | { ok: true; data: RiskModelFileData }
  | { ok: false; error: "NOT_FOUND" | "READ_ERROR" | "PARSE_ERROR" | "VALIDATION_ERROR"; message: string };

/**
 * Validates that a value is a finite number within [0, 1].
 */
function isValidMetric(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 1
  );
}

/**
 * Validates that a value is a finite non-negative number.
 */
function isValidSize(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

/**
 * Strictly validates the risk model artifact.
 * Returns a validation error message if invalid, or null if valid.
 */
function validateRiskModelData(data: unknown): string | null {
  if (data === null || data === undefined || typeof data !== "object") {
    return "Artifact is not an object";
  }

  const obj = data as Record<string, unknown>;

  // model_type: required, non-empty string
  if (typeof obj.model_type !== "string" || obj.model_type.trim() === "") {
    return "model_type is required and must be a non-empty string";
  }

  // metrics: required object with all four metric fields
  if (obj.metrics === null || obj.metrics === undefined || typeof obj.metrics !== "object") {
    return "metrics object is required";
  }

  const metrics = obj.metrics as Record<string, unknown>;
  const requiredMetrics = ["precision", "recall", "f1_score", "roc_auc"] as const;

  for (const field of requiredMetrics) {
    if (!(field in metrics)) {
      return `metrics.${field} is required`;
    }
    if (!isValidMetric(metrics[field])) {
      return `metrics.${field} must be a finite number in [0, 1], got: ${String(metrics[field])}`;
    }
  }

  // training_size: required, finite, >= 0
  if (!isValidSize(obj.training_size)) {
    return `training_size must be a finite non-negative number, got: ${String(obj.training_size)}`;
  }

  // test_size: required, finite, >= 0
  if (!isValidSize(obj.test_size)) {
    return `test_size must be a finite non-negative number, got: ${String(obj.test_size)}`;
  }

  return null;
}

/**
 * Loads, parses, and strictly validates the risk model results JSON file
 * from the project data directory.
 *
 * If the artifact is incomplete or invalid, returns a VALIDATION_ERROR.
 * No fallback values are applied.
 */
export async function loadRiskModelFile(): Promise<LoadResult> {
  const filePath = path.resolve(process.cwd(), "..", "data", "curated", "risk_model_results.json");

  let rawContent: string;
  try {
    rawContent = await readFile(filePath, "utf-8");
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && err.code === "ENOENT") {
      return { ok: false, error: "NOT_FOUND", message: "File not found" };
    }
    return { ok: false, error: "READ_ERROR", message: String(err) };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawContent);
  } catch {
    return { ok: false, error: "PARSE_ERROR", message: "Invalid JSON" };
  }

  const validationError = validateRiskModelData(parsed);
  if (validationError) {
    return { ok: false, error: "VALIDATION_ERROR", message: validationError };
  }

  return { ok: true, data: parsed as RiskModelFileData };
}
