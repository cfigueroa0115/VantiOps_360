import { NextResponse } from "next/server";
import { loadRiskModelFile } from "@/lib/server/risk-model-loader";

export const dynamic = "force-dynamic";

/**
 * GET /api/risk
 *
 * Legacy endpoint — delegates to the same canonical risk model source as /api/risk/model.
 * Single source of truth: data/curated/risk_model_results.json
 *
 * Returns 503 RISK_MODEL_UNAVAILABLE if the artifact is missing, invalid, or incomplete.
 * No hardcoded metrics. No separate data source. No fallback values.
 */
export async function GET() {
  const result = await loadRiskModelFile();

  if (!result.ok) {
    return NextResponse.json(
      { error: { code: "RISK_MODEL_UNAVAILABLE", message: "Analytical risk model result is unavailable." } },
      { status: 503 }
    );
  }

  const data = result.data;

  return NextResponse.json({
    modelType: data.model_type,
    metrics: {
      precision: data.metrics.precision,
      recall: data.metrics.recall,
      f1Score: data.metrics.f1_score,
      rocAuc: data.metrics.roc_auc,
    },
    featureImportance: (data.feature_importance ?? []).slice(0, 10),
    p90Threshold: data.p90_threshold,
    trainingSize: data.training_size,
    testSize: data.test_size,
    classBalance: data.class_balance ?? null,
    disclaimer: "Analytical demonstration derived from assessment dataset. Not a production-grade model.",
    dataProvenance: "DERIVED_DATA",
  });
}
