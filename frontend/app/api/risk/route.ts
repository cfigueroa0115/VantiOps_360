import { NextResponse } from "next/server";
import { loadRiskModelFile } from "@/lib/server/risk-model-loader";

export const dynamic = "force-dynamic";

/**
 * GET /api/risk
 *
 * Delegates to the same canonical risk model source as /api/risk/model.
 * Single source of truth: data/curated/risk_model_results.json
 *
 * No hardcoded metrics. No separate data source.
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
    modelType: data.model_type ?? "unknown",
    metrics: {
      precision: data.metrics?.precision ?? null,
      recall: data.metrics?.recall ?? null,
      f1Score: data.metrics?.f1_score ?? null,
      rocAuc: data.metrics?.roc_auc ?? null,
    },
    featureImportance: (data.feature_importance ?? []).slice(0, 10),
    p90Threshold: data.p90_threshold ?? null,
    trainingSize: data.training_size ?? null,
    testSize: data.test_size ?? null,
    classBalance: data.class_balance ?? null,
    disclaimer: "Analytical demonstration derived from assessment dataset. Not a production-grade model.",
    dataProvenance: "DERIVED_DATA",
  });
}
