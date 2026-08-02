"use client";

import React, { useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { ChartWrapper } from "./ChartWrapper";

interface TemporalDataPoint {
  period: string;
  count: number;
}

type Granularity = "monthly" | "weekly";

interface TemporalTrendProps {
  data: TemporalDataPoint[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onGranularityChange?: (granularity: Granularity) => void;
  defaultGranularity?: Granularity;
}

/**
 * Line chart showing PQR volume over time with monthly/weekly toggle.
 * Defaults to monthly granularity.
 * Validates: Requirements 6.5
 */
export function TemporalTrend({
  data,
  loading,
  error,
  onRetry,
  onGranularityChange,
  defaultGranularity = "monthly",
}: TemporalTrendProps) {
  const [granularity, setGranularity] = useState<Granularity>(defaultGranularity);

  const handleGranularityChange = (newGranularity: Granularity) => {
    setGranularity(newGranularity);
    onGranularityChange?.(newGranularity);
  };

  return (
    <ChartWrapper
      loading={loading}
      error={error}
      onRetry={onRetry}
      data={data}
      title="Tendencia Temporal de PQR"
    >
      <div
        aria-label={`Gráfico de línea mostrando tendencia temporal de volumen de PQR con granularidad ${granularity === "monthly" ? "mensual" : "semanal"}`}
        role="img"
      >
        {/* Granularity toggle */}
        <div className="mb-4 flex items-center gap-1 rounded-lg bg-gray-100 p-1 w-fit">
          <button
            onClick={() => handleGranularityChange("monthly")}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              granularity === "monthly"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-600 hover:text-gray-800"
            }`}
            aria-pressed={granularity === "monthly"}
          >
            Mensual
          </button>
          <button
            onClick={() => handleGranularityChange("weekly")}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              granularity === "weekly"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-600 hover:text-gray-800"
            }`}
            aria-pressed={granularity === "weekly"}
          >
            Semanal
          </button>
        </div>

        <ResponsiveContainer width="100%" height={300}>
          <LineChart
            data={data}
            margin={{ top: 10, right: 20, left: 10, bottom: 30 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="period"
              tick={{ fontSize: 11, fill: "#6b7280" }}
              angle={-20}
              textAnchor="end"
              height={50}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "#6b7280" }}
              label={{
                value: "Cantidad",
                angle: -90,
                position: "insideLeft",
                style: { fontSize: 12, fill: "#6b7280" },
              }}
            />
            <Tooltip
              formatter={(value: number) => [value, "PQR"]}
              labelStyle={{ fontWeight: 600 }}
              labelFormatter={(label: string) =>
                `Periodo: ${label}`
              }
            />
            <Line
              type="monotone"
              dataKey="count"
              stroke="#8b5cf6"
              strokeWidth={2}
              dot={{ r: 3, fill: "#8b5cf6" }}
              activeDot={{ r: 5 }}
              name="Volumen PQR"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </ChartWrapper>
  );
}
