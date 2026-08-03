import { NextResponse } from "next/server";
import { loadRiskModelFile } from "@/lib/server/risk-model-loader";

export const dynamic = "force-dynamic";

/**
 * Validates that a metric value is within the valid [0, 1] range.
 */
function isValidMetric(value: unknown): value is number {
  return typeof value === "number" && value >= 0 && value <= 1;
}

/**
 * GET /api/risk/model
 *
 * Reads `data/curated/risk_model_results.json` from the project root and returns
 * the risk model results with provenance metadata and disclaimer.
 *
 * Returns 404 with code MODEL_NOT_TRAINED if the file does not exist.
 * Returns 500 if the file exists but contains invalid data.
 *
 * Requirements: 7.3, 7.4, 7.5, 3.3
 */
export async function GET() {
  const result = await loadRiskModelFile();

  if (!result.ok) {
    if (result.error === "NOT_FOUND") {
      return NextResponse.json(
        {
          error: {
            code: "MODEL_NOT_TRAINED",
            message: "Risk model results not available. The model has not been trained yet.",
          },
        },
        { status: 404 }
      );
    }

    if (result.error === "PARSE_ERROR") {
      console.error("Risk model file parse error: invalid JSON");
      return NextResponse.json(
        { error: { code: "INTERNAL_ERROR", message: "Risk model results file contains invalid JSON" } },
        { status: 500 }
      );
    }

    console.error("Risk model file read error:", result.message);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to read risk model results" } },
      { status: 500 }
    );
  }

  const data = result.data;

  // Validate metrics are in [0, 1] range
  const metrics = data.metrics;
  if (metrics) {
    const metricFields = ["precision", "recall", "f1_score", "roc_auc"] as const;
    for (const field of metricFields) {
      const value = metrics[field];
      if (value !== undefined && !isValidMetric(value)) {
        return NextResponse.json(
          {
            error: {
              code: "VALIDATION_ERROR",
              message: `Metric '${field}' has invalid value ${value}. Must be in range [0, 1].`,
            },
          },
          { status: 500 }
        );
      }
    }
  }

  // Build the response following the RiskModelResponse contract from design doc
  const response = {
    modelType: data.model_type ?? "logistic_regression",
    metrics: {
      precision: data.metrics?.precision ?? 0,
      recall: data.metrics?.recall ?? 0,
      f1Score: data.metrics?.f1_score ?? 0,
      rocAuc: data.metrics?.roc_auc ?? 0,
    },
    featureImportance: data.feature_importance ?? [],
    p90Threshold: data.p90_threshold ?? 0,
    trainingSize: data.training_size ?? 0,
    testSize: data.test_size ?? 0,
    classBalance: data.class_balance ?? {},
    limitations: data.limitations ?? [],
    disclaimer:
      "This is a statistical model for analytical demonstration only. Not for production decision-making without expert validation.",
    lastTrainedAt: data.generated_at ?? null,
    modelVersion: data.model_version ?? "1.0.0",
    dataProvenance: "DERIVED_DATA" as const,
  };

  return NextResponse.json(response);
}
