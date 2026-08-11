/**
 * Enhanced Health Check Endpoint — GET /api/health
 *
 * Provides:
 * - DB connectivity validation (SELECT 1)
 * - Application version from package.json
 * - Server uptime
 * - Degraded mode detection (stale cache when latency P95 > 2s or error rate > 1% for 3 min)
 * - 60-second interval health check scheduling support
 *
 * Requirements: REQ-34.2, REQ-39.1, REQ-39.2, REQ-39.3
 */

import { NextResponse } from "next/server";
import { query } from "@/lib/server/database";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Uptime tracking
// ---------------------------------------------------------------------------
const START_TIME = Date.now();

// ---------------------------------------------------------------------------
// Metrics tracking for degraded mode detection
// ---------------------------------------------------------------------------
interface HealthMetric {
  timestamp: number;
  latencyMs: number;
  isError: boolean;
}

const METRICS_WINDOW_MS = 3 * 60 * 1000; // 3 minutes
const HEALTH_CHECK_INTERVAL_MS = 60 * 1000; // 60 seconds
const P95_LATENCY_THRESHOLD_MS = 2000; // 2 seconds
const ERROR_RATE_THRESHOLD = 0.01; // 1%

let metrics: HealthMetric[] = [];
let lastHealthCheck: { timestamp: number; result: HealthResult } | null = null;

interface HealthResult {
  status: "healthy" | "degraded" | "unhealthy";
  service: string;
  version: string;
  uptime: string;
  uptimeMs: number;
  timestamp: string;
  deploymentCommit: string | null;
  database: { connected: boolean; latencyMs: number };
  degradedMode: {
    active: boolean;
    reason: string | null;
    p95LatencyMs: number | null;
    errorRate: number | null;
    windowMinutes: number;
  };
  healthCheckIntervalMs: number;
}

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

function getUptimeString(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
  if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

function pruneMetrics(): void {
  const cutoff = Date.now() - METRICS_WINDOW_MS;
  metrics = metrics.filter((m) => m.timestamp >= cutoff);
}

function calculateP95Latency(): number | null {
  if (metrics.length === 0) return null;
  const sorted = metrics.map((m) => m.latencyMs).sort((a, b) => a - b);
  const idx = Math.ceil(sorted.length * 0.95) - 1;
  return sorted[Math.max(0, idx)];
}

function calculateErrorRate(): number | null {
  if (metrics.length === 0) return null;
  const errors = metrics.filter((m) => m.isError).length;
  return errors / metrics.length;
}

function isDegraded(): { active: boolean; reason: string | null } {
  pruneMetrics();
  const p95 = calculateP95Latency();
  const errorRate = calculateErrorRate();

  if (p95 !== null && p95 > P95_LATENCY_THRESHOLD_MS) {
    return { active: true, reason: `P95 latency ${p95}ms exceeds ${P95_LATENCY_THRESHOLD_MS}ms threshold` };
  }
  if (errorRate !== null && errorRate > ERROR_RATE_THRESHOLD) {
    return {
      active: true,
      reason: `Error rate ${(errorRate * 100).toFixed(2)}% exceeds ${ERROR_RATE_THRESHOLD * 100}% threshold over 3 min window`,
    };
  }
  return { active: false, reason: null };
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

export async function GET() {
  const now = Date.now();
  const uptimeMs = now - START_TIME;

  // Use cached result if within interval and not stale
  if (
    lastHealthCheck &&
    now - lastHealthCheck.timestamp < HEALTH_CHECK_INTERVAL_MS
  ) {
    return NextResponse.json(lastHealthCheck.result, {
      status: lastHealthCheck.result.status === "unhealthy" ? 503 : 200,
    });
  }

  // DB connectivity check
  let dbConnected = false;
  let dbLatencyMs = 0;
  let isError = false;

  const dbStart = Date.now();
  try {
    await query("SELECT 1 AS health_check");
    dbConnected = true;
    dbLatencyMs = Date.now() - dbStart;
  } catch {
    dbLatencyMs = Date.now() - dbStart;
    isError = true;
  }

  // Record metric
  metrics.push({ timestamp: now, latencyMs: dbLatencyMs, isError });

  // Determine degraded mode
  const degraded = isDegraded();

  // Determine overall status
  let status: "healthy" | "degraded" | "unhealthy";
  if (!dbConnected) {
    status = "unhealthy";
  } else if (degraded.active) {
    status = "degraded";
  } else {
    status = "healthy";
  }

  const result: HealthResult = {
    status,
    service: "vantiops-360",
    version: process.env.npm_package_version || "0.1.0",
    uptime: getUptimeString(uptimeMs),
    uptimeMs,
    timestamp: new Date().toISOString(),
    deploymentCommit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    database: {
      connected: dbConnected,
      latencyMs: dbLatencyMs,
    },
    degradedMode: {
      active: degraded.active,
      reason: degraded.reason,
      p95LatencyMs: calculateP95Latency(),
      errorRate: calculateErrorRate(),
      windowMinutes: 3,
    },
    healthCheckIntervalMs: HEALTH_CHECK_INTERVAL_MS,
  };

  // Cache result
  lastHealthCheck = { timestamp: now, result };

  return NextResponse.json(result, {
    status: status === "unhealthy" ? 503 : 200,
  });
}
