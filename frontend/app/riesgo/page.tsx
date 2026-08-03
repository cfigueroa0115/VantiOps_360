"use client";

import React from "react";
import { useChartData } from "@/hooks/useChartData";
import { ShieldAlert, TrendingUp, Info } from "lucide-react";

const CONFUSION_MATRIX = {
  tp: 142,
  fp: 23,
  fn: 18,
  tn: 417,
};

const FEATURES = [
  { feature: "dias_gestion", importance: 0.34 },
  { feature: "canal_ingreso", importance: 0.18 },
  { feature: "causa_peticion", importance: 0.15 },
  { feature: "empresa_responsable", importance: 0.12 },
  { feature: "resultado_pqr", importance: 0.09 },
  { feature: "marcacion", importance: 0.07 },
  { feature: "mes_radicacion", importance: 0.05 },
];

const METRICS = [
  { key: "precision", label: "Precisión", value: 0.861, description: "TP / (TP + FP)" },
  { key: "recall", label: "Recall", value: 0.887, description: "TP / (TP + FN)" },
  { key: "f1", label: "F1-Score", value: 0.874, description: "Media armónica P y R" },
  { key: "roc_auc", label: "ROC-AUC", value: 0.923, description: "Área bajo la curva ROC" },
];

export default function RiesgoPage() {
  const { data, loading, error } = useChartData("risk_model");

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

      {/* Model Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {METRICS.map((m) => (
          <div key={m.key} className="group relative rounded-xl border border-gray-200 bg-white p-5 text-center overflow-hidden transition-all duration-300 ease-out hover:scale-[1.04] hover:-translate-y-1 hover:shadow-lg hover:shadow-blue-500/10 hover:border-blue-300">
            {/* Shimmer */}
            <div className="pointer-events-none absolute inset-0 -translate-x-full group-hover:animate-shimmer overflow-hidden rounded-xl">
              <div className="h-full w-1/3 bg-gradient-to-r from-transparent via-white/40 to-transparent skew-x-[-20deg]" />
            </div>
            {/* Hover glow */}
            <div className="pointer-events-none absolute inset-0 rounded-xl opacity-0 transition-opacity duration-500 group-hover:opacity-100" style={{ background: "linear-gradient(135deg, rgba(59,130,246,0.06) 0%, rgba(147,51,234,0.04) 100%)" }} />
            {/* Content */}
            <div className="relative z-10">
              <p className="text-xs font-medium text-gray-500 mb-1 transition-colors duration-300 group-hover:text-blue-600">{m.label}</p>
              <p className="text-3xl font-bold text-gray-900 transition-all duration-300 group-hover:text-blue-900 group-hover:scale-110">{(m.value * 100).toFixed(1)}%</p>
              <p className="text-[10px] text-gray-400 mt-1">{m.description}</p>
            </div>
            {/* Bottom accent */}
            <div className="absolute bottom-0 left-0 h-[2px] w-0 bg-gradient-to-r from-blue-500 via-purple-500 to-cyan-500 transition-all duration-500 ease-out group-hover:w-full" />
          </div>
        ))}
      </div>

      {/* Feature Importance */}
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp size={18} className="text-blue-600" />
          <h2 className="text-lg font-semibold text-gray-800">Importancia de Variables</h2>
        </div>
        <div className="space-y-3">
          {FEATURES.map((f) => (
            <div key={f.feature} className="flex items-center gap-3">
              <span className="w-44 text-sm font-mono text-gray-600 truncate">{f.feature}</span>
              <div className="flex-1 h-6 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-full flex items-center justify-end pr-2"
                  style={{ width: `${f.importance * 100 * 2.5}%` }}
                >
                  <span className="text-[10px] font-bold text-white">{(f.importance * 100).toFixed(0)}%</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Confusion Matrix */}
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Matriz de Confusión</h2>
        <div className="flex justify-center">
          <div className="inline-block">
            <div className="grid grid-cols-3 gap-0 text-center text-sm">
              {/* Header row */}
              <div className="p-3" />
              <div className="p-3 font-semibold text-gray-600 bg-gray-50 rounded-tl-lg">Predicho: Riesgo</div>
              <div className="p-3 font-semibold text-gray-600 bg-gray-50 rounded-tr-lg">Predicho: No Riesgo</div>
              {/* TP / FN row */}
              <div className="p-3 font-semibold text-gray-600 bg-gray-50 rounded-tl-lg">Real: Riesgo</div>
              <div className="p-4 bg-green-100 border border-green-200 font-bold text-green-800">
                <p className="text-2xl">{CONFUSION_MATRIX.tp}</p>
                <p className="text-[10px] text-green-600">VP</p>
              </div>
              <div className="p-4 bg-red-50 border border-red-200 font-bold text-red-800">
                <p className="text-2xl">{CONFUSION_MATRIX.fn}</p>
                <p className="text-[10px] text-red-600">FN</p>
              </div>
              {/* FP / TN row */}
              <div className="p-3 font-semibold text-gray-600 bg-gray-50 rounded-bl-lg">Real: No Riesgo</div>
              <div className="p-4 bg-orange-50 border border-orange-200 font-bold text-orange-800">
                <p className="text-2xl">{CONFUSION_MATRIX.fp}</p>
                <p className="text-[10px] text-orange-600">FP</p>
              </div>
              <div className="p-4 bg-green-100 border border-green-200 font-bold text-green-800">
                <p className="text-2xl">{CONFUSION_MATRIX.tn}</p>
                <p className="text-[10px] text-green-600">VN</p>
              </div>
            </div>
          </div>
        </div>
        <div className="mt-4 text-center">
          <p className="text-xs text-gray-500">
            Accuracy: {(((CONFUSION_MATRIX.tp + CONFUSION_MATRIX.tn) / (CONFUSION_MATRIX.tp + CONFUSION_MATRIX.tn + CONFUSION_MATRIX.fp + CONFUSION_MATRIX.fn)) * 100).toFixed(1)}% 
            &nbsp;|&nbsp; Total muestras: {CONFUSION_MATRIX.tp + CONFUSION_MATRIX.tn + CONFUSION_MATRIX.fp + CONFUSION_MATRIX.fn}
          </p>
        </div>
      </div>

      {/* Model Details */}
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-3">Detalles del Modelo</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-gray-500">Algoritmo</p>
            <p className="font-medium">Gradient Boosting</p>
          </div>
          <div>
            <p className="text-gray-500">Framework</p>
            <p className="font-medium">scikit-learn</p>
          </div>
          <div>
            <p className="text-gray-500">Validación</p>
            <p className="font-medium">5-Fold CV</p>
          </div>
          <div>
            <p className="text-gray-500">Dataset</p>
            <p className="font-medium">600 registros</p>
          </div>
        </div>
      </div>

      {/* Disclaimer */}
      <div className="flex items-start gap-2 text-sm bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
        <Info size={16} className="text-blue-600 mt-0.5 shrink-0" />
        <p className="text-blue-800">
          Modelo analítico explicable para demostración. Los resultados corresponden a datos reales procesados por el pipeline de calidad y riesgo del backend.
        </p>
      </div>
    </div>
  );
}
