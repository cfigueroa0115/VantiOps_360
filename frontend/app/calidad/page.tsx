"use client";

import React from "react";
import { Database, AlertTriangle, CheckCircle2, RefreshCw, Loader2 } from "lucide-react";
import { useQualityReport } from "@/hooks/useQualityReport";

const DIMENSIONS: { key: keyof typeof DIMENSION_LABELS; label: string; description: string }[] = [
  { key: "completeness", label: "Completitud", description: "Campos sin valores nulos en campos obligatorios" },
  { key: "validity", label: "Validez", description: "Valores dentro de dominios y rangos esperados" },
  { key: "consistency", label: "Consistencia", description: "Coherencia lógica entre campos relacionados" },
  { key: "uniqueness", label: "Unicidad", description: "Registros sin duplicados exactos" },
  { key: "timeliness", label: "Oportunidad", description: "Datos dentro de ventana temporal de 365 días" },
  { key: "domainConformity", label: "Conformidad de Dominio", description: "Valores conformes al catálogo de dominio" },
];

const DIMENSION_LABELS = {
  completeness: "Completitud",
  validity: "Validez",
  consistency: "Consistencia",
  uniqueness: "Unicidad",
  timeliness: "Oportunidad",
  domainConformity: "Conformidad de Dominio",
};

const SEVERITY_MAP: Record<string, { label: string; className: string }> = {
  LOW: { label: "Baja", className: "bg-green-100 text-green-700" },
  MEDIUM: { label: "Media", className: "bg-amber-100 text-amber-700" },
  HIGH: { label: "Alta", className: "bg-red-100 text-red-700" },
  CRITICAL: { label: "Crítica", className: "bg-purple-100 text-purple-700" },
};

function ScoreGauge({ score, label }: { score: number; label: string }) {
  const color = score >= 90 ? "text-green-600" : score >= 70 ? "text-amber-600" : "text-red-600";
  const bgColor = score >= 90 ? "bg-green-50 border-green-200" : score >= 70 ? "bg-amber-50 border-amber-200" : "bg-red-50 border-red-200";

  return (
    <div className={`rounded-xl border p-4 ${bgColor} text-center`}>
      <p className="text-xs font-medium text-gray-500 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{score.toFixed(1)}%</p>
    </div>
  );
}

export default function CalidadPage() {
  const { data, loading, error, retry } = useQualityReport();

  // ─── LOADING STATE ───
  if (loading && !data) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[400px] gap-4">
        <Loader2 size={40} className="text-blue-500 animate-spin" />
        <p className="text-gray-500 text-sm">Calculando métricas de calidad...</p>
      </div>
    );
  }

  // ─── ERROR STATE ───
  if (error && !data) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[400px] gap-4">
        <AlertTriangle size={40} className="text-red-500" />
        <p className="text-gray-700 font-medium">Error al cargar el reporte de calidad</p>
        <p className="text-gray-500 text-sm">{error}</p>
        <button
          onClick={retry}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <RefreshCw size={16} />
          Reintentar
        </button>
      </div>
    );
  }

  if (!data) return null;

  const { overallScore, dimensions, violations, metadata } = data;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
          <Database size={20} className="text-blue-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Calidad de Datos</h1>
          <p className="text-sm text-gray-500">6 dimensiones de calidad — puntaje compuesto ponderado</p>
        </div>
      </div>

      {/* Overall Score */}
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-800">Puntaje General de Calidad</h2>
          {loading && <span className="text-xs text-gray-400 animate-pulse">Actualizando...</span>}
          {error && (
            <button onClick={retry} className="text-xs text-red-500 hover:underline">
              Error — Reintentar
            </button>
          )}
        </div>
        <div className="flex items-center gap-6">
          <div className="text-center">
            <p className={`text-5xl font-bold ${overallScore >= 85 ? "text-green-600" : overallScore >= 70 ? "text-amber-600" : "text-red-600"}`}>
              {overallScore.toFixed(1)}%
            </p>
            <p className="text-xs text-gray-500 mt-1">Score Compuesto</p>
          </div>
          <div className="flex-1 h-4 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${overallScore >= 85 ? "bg-green-500" : overallScore >= 70 ? "bg-amber-500" : "bg-red-500"}`}
              style={{ width: `${Math.min(overallScore, 100)}%` }}
            />
          </div>
        </div>
      </div>

      {/* 6 Dimensions Grid */}
      <div>
        <h2 className="text-lg font-semibold text-gray-800 mb-3">Dimensiones de Calidad</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {DIMENSIONS.map((dim) => (
            <ScoreGauge
              key={dim.key}
              score={dimensions[dim.key] || 0}
              label={dim.label}
            />
          ))}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mt-2">
          {DIMENSIONS.map((dim) => (
            <p key={dim.key} className="text-[10px] text-gray-400 text-center px-1">
              {dim.description}
            </p>
          ))}
        </div>
      </div>

      {/* Violations Table */}
      {violations.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
            <AlertTriangle size={16} className="text-amber-500" />
            <h2 className="text-lg font-semibold text-gray-800">Violaciones Detectadas</h2>
            <span className="ml-auto text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
              {violations.length} reglas
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Dimensión</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Campo</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Descripción</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">Violaciones</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">%</th>
                  <th className="px-4 py-3 text-center font-medium text-gray-500">Severidad</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Acción Recomendada</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {violations.map((v, i) => {
                  const sev = SEVERITY_MAP[v.severity] || SEVERITY_MAP.LOW;
                  return (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-xs capitalize">{v.dimension}</td>
                      <td className="px-4 py-3 font-mono text-xs">{v.field}</td>
                      <td className="px-4 py-3 text-xs text-gray-700">{v.description}</td>
                      <td className="px-4 py-3 text-right font-medium">{v.count.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right">{v.percentage.toFixed(2)}%</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${sev.className}`}>
                          {sev.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600">{v.recommendedAction}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Metadata */}
      <div className="flex flex-col gap-2 text-sm text-gray-500 bg-white rounded-lg border border-gray-200 px-4 py-3">
        <div className="flex items-center gap-2">
          <CheckCircle2 size={16} className="text-green-500" />
          <span>{metadata.recordCount.toLocaleString()} registros evaluados — generado {new Date(metadata.generatedAt).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" })}</span>
        </div>
        <p className="text-xs text-gray-400">{metadata.methodology}</p>
      </div>
    </div>
  );
}
