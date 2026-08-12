"use client";

import React, { useEffect, useState } from "react";
import { ShieldAlert, TrendingUp, Info, AlertTriangle } from "lucide-react";

interface RiskModelData {
  modelType: string;
  metrics: { precision: number; recall: number; f1Score: number; rocAuc: number };
  featureImportance: { feature: string; importance: number }[];
  p90Threshold?: number;
  trainingSize?: number;
  testSize?: number;
  classBalance?: Record<string, number>;
  disclaimer?: string;
  dataProvenance?: string;
}

function formatPct(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${(v * 100).toFixed(2)}%`;
}

function modelLabel(type: string): string {
  const map: Record<string, string> = {
    logistic_regression: "Regresión Logística",
    gradient_boosting: "Gradient Boosting",
    random_forest: "Random Forest",
    xgboost: "XGBoost",
  };
  return map[type] || type;
}

export default function RiesgoPage() {
  const [model, setModel] = useState<RiskModelData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/risk/model")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => { setModel(data); setLoading(false); })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, []);

  if (loading) {
    return <div className="p-6 text-gray-500">Cargando modelo analítico...</div>;
  }

  if (error || !model) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800 flex items-start gap-2">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">Resultado analítico no disponible</p>
            <p className="text-sm text-red-600 mt-1">El modelo de riesgo no pudo cargarse. {error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-100">
          <ShieldAlert size={20} className="text-red-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Modelo de Riesgo</h1>
          <p className="text-sm text-gray-500">Clasificación binaria — PQR con riesgo de incumplimiento ANS</p>
        </div>
      </div>

      {/* Model Info */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-800" data-testid="model-type">{modelLabel(model.modelType)}</h2>
          <span className="text-[10px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full border border-blue-100" data-testid="provenance">
            {model.dataProvenance || "DERIVED_DATA"}
          </span>
        </div>
        {model.trainingSize && model.testSize && (
          <div className="grid grid-cols-3 gap-3 text-xs text-gray-600 mb-4">
            <div><p className="text-gray-500">Dataset</p><p className="font-medium">51.008 registros</p></div>
            <div><p className="text-gray-500">Entrenamiento</p><p className="font-medium">{model.trainingSize.toLocaleString()}</p></div>
            <div><p className="text-gray-500">Test</p><p className="font-medium">{model.testSize.toLocaleString()}</p></div>
          </div>
        )}
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { key: "precision", label: "Precisión", value: model.metrics.precision, desc: "TP / (TP + FP)" },
          { key: "recall", label: "Recall", value: model.metrics.recall, desc: "TP / (TP + FN)" },
          { key: "f1", label: "F1-Score", value: model.metrics.f1Score, desc: "Media armónica P y R" },
          { key: "roc_auc", label: "ROC-AUC", value: model.metrics.rocAuc, desc: "Área bajo la curva ROC" },
        ].map((m) => (
          <div key={m.key} className="rounded-xl border border-gray-200 bg-white p-5 text-center" data-testid={`metric-${m.key}`}>
            <p className="text-xs font-medium text-gray-500 mb-1">{m.label}</p>
            <p className="text-3xl font-bold text-gray-900">{formatPct(m.value)}</p>
            <p className="text-[10px] text-gray-400 mt-1">{m.desc}</p>
          </div>
        ))}
      </div>

      {/* Feature Importance */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp size={18} className="text-blue-600" />
          <h2 className="text-lg font-semibold text-gray-800">Importancia de Variables</h2>
        </div>
        <div className="space-y-2">
          {model.featureImportance.slice(0, 10).map((f, i) => {
            const maxImp = Math.max(...model.featureImportance.slice(0, 10).map(x => Math.abs(x.importance)));
            const pct = maxImp > 0 ? (Math.abs(f.importance) / maxImp) * 100 : 0;
            return (
              <div key={i} className="flex items-center gap-3">
                <span className="w-44 text-sm font-mono text-gray-600 truncate">{f.feature}</span>
                <div className="flex-1 h-4 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${f.importance >= 0 ? "bg-gradient-to-r from-blue-500 to-blue-600" : "bg-gradient-to-r from-red-400 to-red-500"}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="text-xs font-mono text-gray-500 w-16 text-right">{f.importance.toFixed(3)}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Class Balance */}
      {model.classBalance && (
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="text-lg font-semibold text-gray-800 mb-3">Balance de Clases</h2>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="bg-green-50 rounded-lg p-3 text-center">
              <p className="text-gray-600">Sin riesgo (0)</p>
              <p className="text-2xl font-bold text-green-700">{((model.classBalance["0"] || 0) * 100).toFixed(1)}%</p>
            </div>
            <div className="bg-red-50 rounded-lg p-3 text-center">
              <p className="text-gray-600">Con riesgo (1)</p>
              <p className="text-2xl font-bold text-red-700">{((model.classBalance["1"] || 0) * 100).toFixed(1)}%</p>
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-2">Desbalance significativo: el 4% de registros presenta riesgo. Esto explica la baja precisión del modelo.</p>
        </div>
      )}

      {/* Disclaimer */}
      <div className="flex items-start gap-2 text-sm bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
        <Info size={16} className="text-blue-600 mt-0.5 shrink-0" />
        <div>
          <p className="text-blue-800" data-testid="disclaimer">
            Modelo analítico POC calculado a partir del dataset PQR suministrado para la prueba técnica.
            Su desempeño evidencia que requiere enriquecimiento de variables, calibración y validación antes de uso productivo.
            No constituye una integración con sistemas internos de Vanti.
          </p>
          <p className="text-xs text-blue-600 mt-1">Provenance: DERIVED_DATA · {model.disclaimer}</p>
        </div>
      </div>
    </div>
  );
}
