import { readFile } from "fs/promises";
import path from "path";

/**
 * Shape of the risk_model_results.json file produced by the Python risk model pipeline.
 */
export interface RiskModelFileData {
  model_type?: string;
  metrics?: {
    precision?: number;
    recall?: number;
    f1_score?: number;
    roc_auc?: number;
  };
  feature_importance?: Array<{ feature: string; importance: number }>;
  p90_threshold?: number;
  training_size?: number;
  test_size?: number;
  class_balance?: Record<string, number>;
  limitations?: string[];
  disclaimer?: string;
  generated_at?: string;
  model_version?: string;
}

export type LoadResult =
  | { ok: true; data: RiskModelFileData }
  | { ok: false; error: "NOT_FOUND" | "READ_ERROR" | "PARSE_ERROR"; message: string };

/**
 * Loads and parses the risk model results JSON file from the project data directory.
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

  try {
    const data: RiskModelFileData = JSON.parse(rawContent);
    return { ok: true, data };
  } catch {
    return { ok: false, error: "PARSE_ERROR", message: "Invalid JSON" };
  }
}
