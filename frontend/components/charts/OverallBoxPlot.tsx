"use client";

import React from "react";
import { ResponsiveContainer } from "recharts";
import { ChartWrapper } from "./ChartWrapper";

interface OverallBoxPlotDataPoint {
  q1: number;
  median: number;
  q3: number;
  whisker_low: number;
  whisker_high: number;
  record_count: number;
  outliers?: number[];
}

interface OverallBoxPlotProps {
  data: OverallBoxPlotDataPoint[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}

/**
 * Custom SVG-based single box plot showing overall management time distribution.
 * Includes outlier points beyond 1.5×IQR whiskers.
 * Validates: Requirements 6.7
 */
export function OverallBoxPlot({
  data,
  loading,
  error,
  onRetry,
}: OverallBoxPlotProps) {
  const stats = data[0];

  // Compute display range (include outliers if present)
  const allValues = stats
    ? [
        stats.whisker_low,
        stats.whisker_high,
        ...(stats.outliers || []),
      ]
    : [];
  const displayMin = allValues.length ? Math.min(...allValues) : 0;
  const displayMax = allValues.length ? Math.max(...allValues) : 100;
  const padding = (displayMax - displayMin) * 0.1 || 10;
  const rangeMin = displayMin - padding;
  const rangeMax = displayMax + padding;

  // SVG dimensions
  const svgWidth = 600;
  const svgHeight = 120;
  const plotLeft = 40;
  const plotRight = svgWidth - 40;
  const plotWidth = plotRight - plotLeft;
  const centerY = svgHeight / 2;
  const boxHeight = 40;

  const scale = (val: number) =>
    plotLeft + ((val - rangeMin) / (rangeMax - rangeMin)) * plotWidth;

  return (
    <ChartWrapper
      loading={loading}
      error={error}
      onRetry={onRetry}
      data={data}
      title="Distribución General del Tiempo de Gestión"
    >
      <div
        aria-label="Box plot general mostrando distribución del tiempo de gestión con mediana, cuartiles y outliers"
        role="img"
      >
        {stats && (
          <>
            <ResponsiveContainer width="100%" height={140}>
              <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} width="100%" height="100%">
                {/* Whisker line */}
                <line
                  x1={scale(stats.whisker_low)}
                  y1={centerY}
                  x2={scale(stats.whisker_high)}
                  y2={centerY}
                  stroke="#374151"
                  strokeWidth={1.5}
                />
                {/* Whisker caps */}
                <line
                  x1={scale(stats.whisker_low)}
                  y1={centerY - 10}
                  x2={scale(stats.whisker_low)}
                  y2={centerY + 10}
                  stroke="#374151"
                  strokeWidth={1.5}
                />
                <line
                  x1={scale(stats.whisker_high)}
                  y1={centerY - 10}
                  x2={scale(stats.whisker_high)}
                  y2={centerY + 10}
                  stroke="#374151"
                  strokeWidth={1.5}
                />
                {/* Q1–Q3 box */}
                <rect
                  x={scale(stats.q1)}
                  y={centerY - boxHeight / 2}
                  width={scale(stats.q3) - scale(stats.q1)}
                  height={boxHeight}
                  fill="#3b82f6"
                  fillOpacity={0.25}
                  stroke="#3b82f6"
                  strokeWidth={1.5}
                  rx={3}
                />
                {/* Median line */}
                <line
                  x1={scale(stats.median)}
                  y1={centerY - boxHeight / 2}
                  x2={scale(stats.median)}
                  y2={centerY + boxHeight / 2}
                  stroke="#dc2626"
                  strokeWidth={2.5}
                />
                {/* Outlier points */}
                {(stats.outliers || []).map((val, i) => (
                  <circle
                    key={i}
                    cx={scale(val)}
                    cy={centerY}
                    r={4}
                    fill="#f59e0b"
                    stroke="#d97706"
                    strokeWidth={1}
                  />
                ))}
                {/* Axis labels */}
                <text
                  x={scale(stats.whisker_low)}
                  y={centerY + boxHeight / 2 + 16}
                  textAnchor="middle"
                  fontSize={10}
                  fill="#6b7280"
                >
                  {stats.whisker_low}d
                </text>
                <text
                  x={scale(stats.q1)}
                  y={centerY - boxHeight / 2 - 6}
                  textAnchor="middle"
                  fontSize={10}
                  fill="#6b7280"
                >
                  Q1: {stats.q1}
                </text>
                <text
                  x={scale(stats.median)}
                  y={centerY - boxHeight / 2 - 6}
                  textAnchor="middle"
                  fontSize={10}
                  fill="#dc2626"
                >
                  Med: {stats.median}
                </text>
                <text
                  x={scale(stats.q3)}
                  y={centerY - boxHeight / 2 - 6}
                  textAnchor="middle"
                  fontSize={10}
                  fill="#6b7280"
                >
                  Q3: {stats.q3}
                </text>
                <text
                  x={scale(stats.whisker_high)}
                  y={centerY + boxHeight / 2 + 16}
                  textAnchor="middle"
                  fontSize={10}
                  fill="#6b7280"
                >
                  {stats.whisker_high}d
                </text>
              </svg>
            </ResponsiveContainer>
            <p className="mt-2 text-center text-xs text-gray-500">
              Registros analizados: {stats.record_count.toLocaleString()}
              {stats.outliers && stats.outliers.length > 0 && (
                <span className="ml-2">
                  • Outliers: {stats.outliers.length}
                </span>
              )}
            </p>
          </>
        )}
        {/* Accessible summary */}
        <div className="sr-only">
          {stats && (
            <p>
              Distribución general: mínimo {stats.whisker_low} días, Q1{" "}
              {stats.q1} días, mediana {stats.median} días, Q3 {stats.q3}{" "}
              días, máximo {stats.whisker_high} días. Total registros:{" "}
              {stats.record_count}.
            </p>
          )}
        </div>
      </div>
    </ChartWrapper>
  );
}
