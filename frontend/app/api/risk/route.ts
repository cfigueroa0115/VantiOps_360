import { NextResponse } from "next/server";

// Using Node.js runtime for Pool support

export async function GET() {
  return NextResponse.json({
    modelType: "logistic_regression",
    metrics: { precision: 0.72, recall: 0.65, f1Score: 0.68, rocAuc: 0.80 },
    featureImportance: [
      { feature: "causa_cancela_servihogar", importance: 0.342 },
      { feature: "canal_atencion_telefono", importance: 0.198 },
      { feature: "empresa_vanti_sa", importance: 0.156 },
      { feature: "tipo_pqr_queja", importance: 0.112 },
      { feature: "marcacion_urgente", importance: 0.089 },
    ],
    disclaimer: "Analytical demonstration — not a production-grade model",
  });
}
