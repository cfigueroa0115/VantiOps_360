"use client";

import React from "react";
import { Database, CheckCircle2, AlertTriangle } from "lucide-react";
import { cn, formatPercentage } from "@/lib/utils";

/** Names of the 6 data quality dimensions */
const QUALITY_DIMENSIONS = [
  { key: "completeness", label: "Completitud" },
  { key: "validity", label: "Validez" },
  { key: "consistency", label: "Consistencia" },
  { key: "uniqueness", label: "Unicidad" },
  { key: "timeliness", label: "Oportunidad" },
  { key: "referentialIntegrity", label: "Integridad referencial" },
] as const;

export interface DataQualityScoreProps {
  /** Overall composite quality score as a percentage (0-100) */
  score: number;
  /** Optional per-dimension scores; if provided, displays breakdown */
  dimensions?: {
    completeness: number;
    validity: number;
    consistency: number;
    uniqueness: number;
    timeliness: number;
    referentialIntegrity: number;
  };
  /** Additional class names */
  className?: string;
}

/**
 * Data Quality Score display — shows the composite percentage from 6 dimensions.
 * Color-coded: green (≥80), yellow (≥60), red (<60).
 * (Req 14.8: Data quality score as composite of 6 dimensions)
 */
export function DataQualityScore({
  score,
  dimensions,
  className,
}: DataQualityScoreProps) {
  const colorClass = getScoreColor(score);
  const Icon = score >= 80 ? CheckCircle2 : AlertTriangle;

  return (
    <div
      className={cn(
        "rounded-lg border bg-white p-4 shadow-sm",
        className,
      )}
    >
      <div className="flex items-center justify-between">
        {/* Title & overall score */}
        <div className="flex items-center gap-3">
          <div className={cn("flex h-10 w-10 items-center justify-center rounded-full", colorClass.bg)}>
            <Database size={20} className={colorClass.text} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-800">
              Score Calidad de Datos
            </h3>
            <p className="text-xs text-gray-500">
              Compuesto de 6 dimensiones
            </p>
          </div>
        </div>

        {/* Score display */}
        <div className="flex items-center gap-2">
          <Icon size={16} className={colorClass.text} />
          <span className={cn("text-2xl font-bold", colorClass.text)}>
            {formatPercentage(score)}
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mt-3">
        <div className="h-2 w-full rounded-full bg-gray-100">
          <div
            className={cn("h-2 rounded-full transition-all duration-500", colorClass.bar)}
            style={{ width: `${Math.min(score, 100)}%` }}
          />
        </div>
      </div>

      {/* Dimension breakdown (if available) */}
      {dimensions && (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {QUALITY_DIMENSIONS.map((dim) => {
            const dimScore = dimensions[dim.key];
            const dimColor = getScoreColor(dimScore);
            return (
              <div key={dim.key} className="text-center">
                <p className="text-xs text-gray-500 truncate" title={dim.label}>
                  {dim.label}
                </p>
                <p className={cn("text-sm font-semibold", dimColor.text)}>
                  {formatPercentage(dimScore)}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Returns color classes based on score thresholds */
function getScoreColor(score: number) {
  if (score >= 80) {
    return {
      text: "text-green-600",
      bg: "bg-green-50",
      bar: "bg-green-500",
    };
  }
  if (score >= 60) {
    return {
      text: "text-yellow-600",
      bg: "bg-yellow-50",
      bar: "bg-yellow-500",
    };
  }
  return {
    text: "text-red-600",
    bg: "bg-red-50",
    bar: "bg-red-500",
  };
}
