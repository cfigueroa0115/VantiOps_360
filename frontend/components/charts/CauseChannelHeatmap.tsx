"use client";

import React from "react";
import { ChartWrapper } from "./ChartWrapper";

interface HeatmapDataPoint {
  causa: string;
  channel: string;
  count: number;
}

interface CauseChannelHeatmapProps {
  data: HeatmapDataPoint[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}

/**
 * Grid/table-based heatmap with causes as rows and channels as columns.
 * Cell background color intensity is proportional to count.
 * Validates: Requirements 6.9
 */
export function CauseChannelHeatmap({
  data,
  loading,
  error,
  onRetry,
}: CauseChannelHeatmapProps) {
  // Extract unique causes and channels
  const causes = Array.from(new Set(data.map((d) => d.causa)));
  const channels = Array.from(new Set(data.map((d) => d.channel)));

  // Build lookup map
  const countMap = new Map<string, number>();
  let maxCount = 0;
  data.forEach((d) => {
    const key = `${d.causa}|${d.channel}`;
    countMap.set(key, d.count);
    if (d.count > maxCount) maxCount = d.count;
  });

  // Color intensity function (green scale)
  const getCellColor = (count: number): string => {
    if (maxCount === 0) return "rgb(243 244 246)"; // gray-100
    const intensity = count / maxCount;
    // Interpolate from gray-100 to green-600
    const r = Math.round(243 - intensity * (243 - 22));
    const g = Math.round(244 - intensity * (244 - 163));
    const b = Math.round(246 - intensity * (246 - 74));
    return `rgb(${r} ${g} ${b})`;
  };

  const getTextColor = (count: number): string => {
    if (maxCount === 0) return "#374151";
    return count / maxCount > 0.5 ? "#ffffff" : "#374151";
  };

  return (
    <ChartWrapper
      loading={loading}
      error={error}
      onRetry={onRetry}
      data={data}
      title="Mapa de Calor: Causa × Canal"
    >
      <div
        aria-label="Mapa de calor mostrando la relación entre causas y canales de atención con intensidad de color proporcional a la cantidad"
        role="img"
      >
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr>
                <th className="border border-gray-200 bg-gray-50 p-2 text-left text-gray-700">
                  Causa / Canal
                </th>
                {channels.map((ch) => (
                  <th
                    key={ch}
                    className="border border-gray-200 bg-gray-50 p-2 text-center text-gray-700"
                  >
                    {ch}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {causes.map((causa) => (
                <tr key={causa}>
                  <td className="border border-gray-200 p-2 font-medium text-gray-700">
                    {causa}
                  </td>
                  {channels.map((ch) => {
                    const count = countMap.get(`${causa}|${ch}`) || 0;
                    return (
                      <td
                        key={`${causa}-${ch}`}
                        className="border border-gray-200 p-2 text-center font-medium"
                        style={{
                          backgroundColor: getCellColor(count),
                          color: getTextColor(count),
                        }}
                        title={`${causa} - ${ch}: ${count}`}
                      >
                        {count > 0 ? count : "—"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* Legend */}
        <div className="mt-3 flex items-center gap-2 text-xs text-gray-500">
          <span>Bajo</span>
          <div className="flex h-3 w-32 overflow-hidden rounded">
            {Array.from({ length: 10 }, (_, i) => (
              <div
                key={i}
                className="flex-1"
                style={{
                  backgroundColor: getCellColor((maxCount / 10) * (i + 1)),
                }}
              />
            ))}
          </div>
          <span>Alto</span>
        </div>
      </div>
    </ChartWrapper>
  );
}
