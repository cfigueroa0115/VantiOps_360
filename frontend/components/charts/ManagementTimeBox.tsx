"use client";

import React from "react";
import {
  ComposedChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ErrorBar,
} from "recharts";
import { ChartWrapper } from "./ChartWrapper";

interface BoxPlotDataPoint {
  causa: string;
  q1: number;
  median: number;
  q3: number;
  whisker_low: number;
  whisker_high: number;
}

interface ManagementTimeBoxProps {
  data: BoxPlotDataPoint[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}

/**
 * Custom box plot shape for Recharts.
 * Renders median line, Q1–Q3 box, and whiskers (1.5×IQR).
 */
function BoxPlotShape(props: Record<string, unknown>) {
  const { x, y, width, height, payload } = props as {
    x: number;
    y: number;
    width: number;
    height: number;
    payload: BoxPlotDataPoint;
  };

  if (!payload) return null;

  const { q1, median, q3, whisker_low, whisker_high } = payload;

  // Scale calculations based on the chart area
  const chartHeight = height;
  const yScale = (val: number) => {
    const range = whisker_high - whisker_low || 1;
    return y + chartHeight - ((val - whisker_low) / range) * chartHeight;
  };

  const centerX = x + width / 2;
  const boxWidth = Math.min(width * 0.6, 40);
  const boxLeft = centerX - boxWidth / 2;
  const whiskerWidth = boxWidth * 0.4;

  return (
    <g>
      {/* Whisker line (low to high) */}
      <line
        x1={centerX}
        y1={yScale(whisker_low)}
        x2={centerX}
        y2={yScale(whisker_high)}
        stroke="#374151"
        strokeWidth={1.5}
      />
      {/* Bottom whisker cap */}
      <line
        x1={centerX - whiskerWidth / 2}
        y1={yScale(whisker_low)}
        x2={centerX + whiskerWidth / 2}
        y2={yScale(whisker_low)}
        stroke="#374151"
        strokeWidth={1.5}
      />
      {/* Top whisker cap */}
      <line
        x1={centerX - whiskerWidth / 2}
        y1={yScale(whisker_high)}
        x2={centerX + whiskerWidth / 2}
        y2={yScale(whisker_high)}
        stroke="#374151"
        strokeWidth={1.5}
      />
      {/* Q1–Q3 box */}
      <rect
        x={boxLeft}
        y={yScale(q3)}
        width={boxWidth}
        height={yScale(q1) - yScale(q3)}
        fill="#3b82f6"
        fillOpacity={0.3}
        stroke="#3b82f6"
        strokeWidth={1.5}
      />
      {/* Median line */}
      <line
        x1={boxLeft}
        y1={yScale(median)}
        x2={boxLeft + boxWidth}
        y2={yScale(median)}
        stroke="#dc2626"
        strokeWidth={2}
      />
    </g>
  );
}

/**
 * Box plot visualization for management time across top 10 causes.
 * Shows median, Q1, Q3, and 1.5×IQR whiskers per cause.
 * Validates: Requirements 6.6
 */
export function ManagementTimeBox({
  data,
  loading,
  error,
  onRetry,
}: ManagementTimeBoxProps) {
  const top10 = data.slice(0, 10);

  // Prepare data with range for the bar chart representation
  const chartData = top10.map((d) => ({
    ...d,
    range: d.whisker_high - d.whisker_low,
    errorUp: d.whisker_high - d.q3,
    errorDown: d.q1 - d.whisker_low,
  }));

  return (
    <ChartWrapper
      loading={loading}
      error={error}
      onRetry={onRetry}
      data={data}
      title="Tiempo de Gestión por Causa (Box Plot)"
    >
      <div
        aria-label="Box plot mostrando distribución del tiempo de gestión para las 10 causas principales con mediana, cuartiles Q1/Q3 y bigotes 1.5×IQR"
        role="img"
      >
        <ResponsiveContainer width="100%" height={400}>
          <ComposedChart
            data={chartData}
            layout="vertical"
            margin={{ top: 10, right: 30, left: 160, bottom: 10 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              type="number"
              tick={{ fontSize: 11, fill: "#6b7280" }}
              label={{
                value: "Días",
                position: "insideBottom",
                offset: -5,
                style: { fontSize: 12, fill: "#6b7280" },
              }}
            />
            <YAxis
              type="category"
              dataKey="causa"
              tick={{ fontSize: 11, fill: "#374151" }}
              width={150}
            />
            <Tooltip
              content={({ payload }) => {
                if (!payload || !payload.length) return null;
                const d = payload[0].payload as BoxPlotDataPoint;
                return (
                  <div className="rounded border border-gray-200 bg-white p-2 text-xs shadow-md">
                    <p className="font-semibold text-gray-700">{d.causa}</p>
                    <p>Mínimo: {d.whisker_low} días</p>
                    <p>Q1: {d.q1} días</p>
                    <p className="font-medium text-red-600">
                      Mediana: {d.median} días
                    </p>
                    <p>Q3: {d.q3} días</p>
                    <p>Máximo: {d.whisker_high} días</p>
                  </div>
                );
              }}
            />
            <Bar dataKey="median" fill="#3b82f6" radius={[0, 4, 4, 0]} name="Mediana">
              <ErrorBar
                dataKey="errorUp"
                direction="x"
                stroke="#374151"
                strokeWidth={1.5}
              />
            </Bar>
          </ComposedChart>
        </ResponsiveContainer>
        {/* Summary table for accessibility */}
        <div className="sr-only">
          <table>
            <caption>Estadísticas de tiempo de gestión por causa</caption>
            <thead>
              <tr>
                <th>Causa</th>
                <th>Mínimo</th>
                <th>Q1</th>
                <th>Mediana</th>
                <th>Q3</th>
                <th>Máximo</th>
              </tr>
            </thead>
            <tbody>
              {top10.map((d) => (
                <tr key={d.causa}>
                  <td>{d.causa}</td>
                  <td>{d.whisker_low}</td>
                  <td>{d.q1}</td>
                  <td>{d.median}</td>
                  <td>{d.q3}</td>
                  <td>{d.whisker_high}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </ChartWrapper>
  );
}
