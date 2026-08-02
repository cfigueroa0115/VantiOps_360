"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { FilterParams } from "@/lib/types";
import { serializeFilters } from "@/lib/api-client";

export interface QualityDimensions {
  completeness: number;
  validity: number;
  consistency: number;
  uniqueness: number;
  timeliness: number;
  domainConformity: number;
}

export interface QualityViolation {
  ruleId: string;
  dimension: string;
  field: string;
  description: string;
  count: number;
  percentage: number;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  recommendedAction: string;
}

export interface QualityReportData {
  overallScore: number;
  dimensions: QualityDimensions;
  violations: QualityViolation[];
  metadata: {
    recordCount: number;
    generatedAt: string;
    datasetVersion: string;
    source: string;
    methodology: string;
  };
}

export interface UseQualityReportResult {
  data: QualityReportData | null;
  loading: boolean;
  error: string | null;
  retry: () => void;
}

export function useQualityReport(filters?: FilterParams): UseQualityReportResult {
  const [data, setData] = useState<QualityReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestIdRef.current;
    setLoading(true);
    setError(null);

    try {
      const qs = serializeFilters(filters);
      const response = await fetch(`/api/quality${qs}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const result = await response.json();
      if (id === requestIdRef.current) {
        setData(result);
      }
    } catch (e) {
      if (id === requestIdRef.current) {
        setError(e instanceof Error ? e.message : "Error al obtener reporte de calidad");
      }
    } finally {
      if (id === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  return { data, loading, error, retry: load };
}
