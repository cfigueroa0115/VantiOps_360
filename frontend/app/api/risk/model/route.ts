import { NextResponse } from "next/server";
import { loadRiskModelFile } from "@/lib/server/risk-model-loader";

export const dynamic = "force-dynamic";

/**
 * GET /api/risk/model
 *
 * Reads `data/curated/risk_model_results.json` from the project root and returns
 * the risk model results with provenance metadata and disclaimer.
 *
 * Returns 503 RISK_MODEL_UNAVAILABLE if the artifact is missing, unreadable,
 * unparseable, or fails strict validation.
 *
 * No fallback values. No ?? 0. No default model type.
 * Incomplete artifact = 503.
 *
 * Requirements: 7.3, 7.4, 7.5, 3.3
 */
export async function GET() {
  const result = await loadRiskModelFile();

  if (!result.ok) {
    return NextResponse.json(
      {
        error: {
          code: "RISK_MODEL_UNAVAILABLE",
          message: `Analytical risk model result is unavailable. Reason: ${result.error} — ${result.message}`,
        },
      },
      { status: 503 }
    );
  }

  const data = result.data;

  // Build the response — all values come directly from the validated artifact.
  // No fallback defaults are applied.
  const response = {
    modelType: data.model_type,
    metrics: {
      precision: data.metrics.precision,
      recall: data.metrics.recall,
      f1Score: data.metrics.f1_score,
      rocAuc: data.metrics.roc_auc,
    },
    featureImportance: data.feature_importance ?? [],
    p90Threshold: data.p90_threshold,
    trainingSize: data.training_size,
    testSize: data.test_size,
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
