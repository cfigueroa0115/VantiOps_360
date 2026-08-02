"use client";

import React from "react";
import { ChartWrapper } from "./ChartWrapper";

type Severity = "critical" | "high" | "medium" | "low";

interface FindingRow {
  description: string;
  affected_metric: string;
  severity: Severity;
  recommended_action: string;
}

interface FindingsTableProps {
  data: FindingRow[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}

/** Severity badge styling */
const SEVERITY_STYLES: Record<
  Severity,
  { bg: string; text: string; label: string }
> = {
  critical: { bg: "bg-red-100", text: "text-red-800", label: "Crítico" },
  high: { bg: "bg-orange-100", text: "text-orange-800", label: "Alto" },
  medium: { bg: "bg-yellow-100", text: "text-yellow-800", label: "Medio" },
  low: { bg: "bg-green-100", text: "text-green-800", label: "Bajo" },
};

/**
 * Executive findings table showing up to 10 key findings with description,
 * affected metric, severity badge (color-coded), and recommended action.
 * Validates: Requirements 6.13
 */
export function FindingsTable({
  data,
  loading,
  error,
  onRetry,
}: FindingsTableProps) {
  // Limit to 10 rows
  const findings = data.slice(0, 10);

  return (
    <ChartWrapper
      loading={loading}
      error={error}
      onRetry={onRetry}
      data={data}
      title="Hallazgos Ejecutivos"
    >
      <div
        aria-label="Tabla de hallazgos ejecutivos con descripción, métrica afectada, severidad y acción recomendada. Máximo 10 filas."
        role="region"
      >
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="p-3 text-left font-medium text-gray-700">
                  Hallazgo
                </th>
                <th className="p-3 text-left font-medium text-gray-700">
                  Métrica Afectada
                </th>
                <th className="p-3 text-center font-medium text-gray-700">
                  Severidad
                </th>
                <th className="p-3 text-left font-medium text-gray-700">
                  Acción Recomendada
                </th>
              </tr>
            </thead>
            <tbody>
              {findings.map((finding, index) => {
                const severity =
                  SEVERITY_STYLES[finding.severity] || SEVERITY_STYLES.low;
                return (
                  <tr
                    key={index}
                    className={`border-b border-gray-100 ${
                      index % 2 === 0 ? "bg-white" : "bg-gray-50/50"
                    }`}
                  >
                    <td className="p-3 text-gray-800">
                      {finding.description}
                    </td>
                    <td className="p-3 text-gray-600">
                      {finding.affected_metric}
                    </td>
                    <td className="p-3 text-center">
                      <span
                        className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${severity.bg} ${severity.text}`}
                      >
                        {severity.label}
                      </span>
                    </td>
                    <td className="p-3 text-gray-600">
                      {finding.recommended_action}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {data.length > 10 && (
          <p className="mt-2 text-xs text-gray-500">
            Mostrando 10 de {data.length} hallazgos
          </p>
        )}
      </div>
    </ChartWrapper>
  );
}
