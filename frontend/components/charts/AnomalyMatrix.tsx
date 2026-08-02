"use client";

import React from "react";
import { ChartWrapper } from "./ChartWrapper";

interface AnomalyDataPoint {
  causa: string;
  channel: string;
  count: number;
  z_score: number;
  is_anomaly: boolean;
}

interface AnomalyMatrixProps {
  data: AnomalyDataPoint[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}

/**
 * Deviation heatmap highlighting cells where z_score > 2 (anomalous).
 * Similar to CauseChannelHeatmap but uses z-score based coloring with
 * >2σ cells highlighted in red.
 * Validates: Requirements 6.12
 */
export function AnomalyMatrix({
  data,
  loading,
  error,
  onRetry,
}: AnomalyMatrixProps) {
  // Extract unique causes and channels
  const causes = Array.from(new Set(data.map((d) => d.causa)));
  const channels = Array.from(new Set(data.map((d) => d.channel)));

  // Build lookup map
  const dataMap = new Map<string, AnomalyDataPoint>();
  data.forEach((d) => {
    dataMap.set(`${d.causa}|${d.channel}`, d);
  });

  // Color function based on z-score
  const getCellStyle = (
    point: AnomalyDataPoint | undefined
  ): React.CSSProperties => {
    if (!point) {
      return { backgroundColor: "#f9fafb", color: "#9ca3af" };
    }

    if (point.is_anomaly || point.z_score > 2) {
      // Anomaly: red intensity based on z_score magnitude
      const intensity = Math.min(point.z_score / 5, 1);
      return {
        backgroundColor: `rgba(239, 68, 68, ${0.2 + intensity * 0.6})`,
        color: intensity > 0.4 ? "#ffffff" : "#991b1b",
        fontWeight: 600,
      };
    }

    // Normal: blue scale based on z_score (0 to 2)
    const intensity = Math.max(0, point.z_score) / 2;
    return {
      backgroundColor: `rgba(59, 130, 246, ${intensity * 0.3})`,
      color: "#374151",
    };
  };

  const anomalyCount = data.filter((d) => d.is_anomaly).length;

  return (
    <ChartWrapper
      loading={loading}
      error={error}
      onRetry={onRetry}
      data={data}
      title="Matriz de Anomalías (Desviaciones >2σ)"
    >
      <div
        aria-label="Matriz de anomalías mostrando desviaciones significativas (mayor a 2 sigma) entre causas y canales, con celdas rojas indicando anomalías"
        role="img"
      >
        {anomalyCount > 0 && (
          <p className="mb-2 text-xs text-red-600">
            ⚠ {anomalyCount} combinaciones anómalas detectadas (z-score &gt; 2)
          </p>
        )}
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
                  <td className="border border-gray-200 bg-white p-2 font-medium text-gray-700">
                    {causa}
                  </td>
                  {channels.map((ch) => {
                    const point = dataMap.get(`${causa}|${ch}`);
                    const style = getCellStyle(point);
                    return (
                      <td
                        key={`${causa}-${ch}`}
                        className="border border-gray-200 p-2 text-center"
                        style={style}
                        title={
                          point
                            ? `${causa} - ${ch}: count=${point.count}, z=${point.z_score.toFixed(2)}${point.is_anomaly ? " ⚠ ANOMALÍA" : ""}`
                            : `${causa} - ${ch}: sin datos`
                        }
                      >
                        {point ? (
                          <span>
                            {point.count}
                            {point.is_anomaly && (
                              <span className="ml-0.5" aria-label="anomalía">
                                ⚠
                              </span>
                            )}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* Legend */}
        <div className="mt-3 flex items-center gap-4 text-xs text-gray-500">
          <div className="flex items-center gap-1">
            <div
              className="h-3 w-3 rounded"
              style={{ backgroundColor: "rgba(59, 130, 246, 0.3)" }}
            />
            <span>Normal</span>
          </div>
          <div className="flex items-center gap-1">
            <div
              className="h-3 w-3 rounded"
              style={{ backgroundColor: "rgba(239, 68, 68, 0.6)" }}
            />
            <span>Anomalía (&gt;2σ)</span>
          </div>
        </div>
      </div>
    </ChartWrapper>
  );
}
