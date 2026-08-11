import { NextRequest, NextResponse } from "next/server";
import { getRequestIdentity } from "@/lib/server/auth-context";

export const dynamic = "force-dynamic";

/**
 * Allowed roles for accessing the capacity endpoint.
 * Per RBAC matrix: SYSTEM_ADMIN, OPERATIONS_LEAD, BUSINESS_OWNER.
 */
const CAPACITY_ALLOWED_ROLES = new Set([
  "SYSTEM_ADMIN",
  "OPERATIONS_LEAD",
  "BUSINESS_OWNER",
]);

// ---------------------------------------------------------------------------
// Capacity Model Constants (REQ-20.1)
// ---------------------------------------------------------------------------

const MONTHLY_HOURS_BASE = 160;
const PQR_DEDICATION = 0.20;
const DEFAULT_PRODUCTIVITY_FACTOR = 0.85;

// Alert thresholds (utilization percentages) — per design Section 24
const ALERT_THRESHOLD_GREEN_MAX = 85;
const ALERT_THRESHOLD_YELLOW_MAX = 100;
const ALERT_THRESHOLD_ORANGE_MAX = 120;

type AlertLevel = "green" | "yellow" | "orange" | "red";

// ---------------------------------------------------------------------------
// Team Configuration
// ---------------------------------------------------------------------------

interface TeamBreakdown {
  name: string;
  analysts: number;
  monthlyHoursBase: number;
  pqrDedication: number;
  productivityFactor: number;
  availableHours: number;
  netCapacity: number;
  currentLoad: number;
  utilization: number;
  alertLevel: AlertLevel;
}

/**
 * Default team configuration for VantiOps 360.
 * Represents the 42-user operational model split into functional teams.
 */
const TEAM_CONFIGS = [
  {
    name: "Interns",
    analysts: 12,
    currentLoad: 30, // estimated demand hours
  },
  {
    name: "Contractors",
    analysts: 20,
    currentLoad: 45, // estimated demand hours
  },
  {
    name: "Business",
    analysts: 10,
    currentLoad: 20, // estimated demand hours
  },
];

// ---------------------------------------------------------------------------
// Capacity Calculation Functions
// ---------------------------------------------------------------------------

function calculateNetCapacity(hours: number, productivityFactor: number): number {
  return hours * productivityFactor;
}

function calculateUtilization(currentLoad: number, netCapacity: number): number {
  if (netCapacity <= 0) {
    return currentLoad > 0 ? 100 : 0;
  }
  return (currentLoad / netCapacity) * 100;
}

function getAlertLevel(utilization: number): AlertLevel {
  if (utilization <= ALERT_THRESHOLD_GREEN_MAX) return "green";
  if (utilization <= ALERT_THRESHOLD_YELLOW_MAX) return "yellow";
  if (utilization <= ALERT_THRESHOLD_ORANGE_MAX) return "orange";
  return "red";
}

function computeTeamBreakdown(config: {
  name: string;
  analysts: number;
  currentLoad: number;
  monthlyHoursBase?: number;
  pqrDedication?: number;
  productivityFactor?: number;
}): TeamBreakdown {
  const monthlyHoursBase = config.monthlyHoursBase ?? MONTHLY_HOURS_BASE;
  const pqrDedication = config.pqrDedication ?? PQR_DEDICATION;
  const productivityFactor = config.productivityFactor ?? DEFAULT_PRODUCTIVITY_FACTOR;

  const availableHours = config.analysts * monthlyHoursBase * pqrDedication;
  const netCapacity = calculateNetCapacity(availableHours, productivityFactor);
  const utilization = calculateUtilization(config.currentLoad, netCapacity);
  const alertLevel = getAlertLevel(utilization);

  return {
    name: config.name,
    analysts: config.analysts,
    monthlyHoursBase,
    pqrDedication,
    productivityFactor,
    availableHours: Math.round(availableHours * 100) / 100,
    netCapacity: Math.round(netCapacity * 100) / 100,
    currentLoad: config.currentLoad,
    utilization: Math.round(utilization * 100) / 100,
    alertLevel,
  };
}

// ---------------------------------------------------------------------------
// GET /api/capacity
// ---------------------------------------------------------------------------

/**
 * GET /api/capacity
 *
 * Returns current capacity status including net capacity, utilization,
 * alert level, and breakdown by team.
 *
 * Access: SYSTEM_ADMIN, OPERATIONS_LEAD, BUSINESS_OWNER (per middleware).
 *
 * Response 200:
 *   {
 *     totalAnalysts: number,
 *     monthlyHoursBase: number,
 *     pqrDedication: number,
 *     netCapacity: number,
 *     currentDemandHours: number,
 *     utilization: number,
 *     alertLevel: AlertLevel,
 *     breakdown: TeamBreakdown[],
 *     dataProvenance: "DERIVED_DATA",
 *     generatedAt: string
 *   }
 *
 * Response 403: Unauthorized role
 *
 * Requirements: 20.1, 20.2, 20.3
 */
export async function GET(request: NextRequest) {
  // --- RBAC Check (identity from verified JWT or POC fallback) ---
  const identity = await getRequestIdentity(request);
  const userRole = identity.role;
  if (!CAPACITY_ALLOWED_ROLES.has(userRole)) {
    return NextResponse.json(
      {
        error: {
          code: "FORBIDDEN",
          message:
            "Insufficient permissions. Only SYSTEM_ADMIN, OPERATIONS_LEAD, and BUSINESS_OWNER roles can access capacity metrics.",
        },
      },
      { status: 403 }
    );
  }

  // --- Compute capacity for each team ---
  const breakdown = TEAM_CONFIGS.map(computeTeamBreakdown);

  // --- Aggregate totals ---
  const totalAnalysts = breakdown.reduce((sum, t) => sum + t.analysts, 0);
  const totalNetCapacity = breakdown.reduce((sum, t) => sum + t.netCapacity, 0);
  const totalCurrentLoad = breakdown.reduce((sum, t) => sum + t.currentLoad, 0);
  const totalUtilization = calculateUtilization(totalCurrentLoad, totalNetCapacity);
  const overallAlertLevel = getAlertLevel(totalUtilization);

  return NextResponse.json({
    totalAnalysts,
    monthlyHoursBase: MONTHLY_HOURS_BASE,
    pqrDedication: PQR_DEDICATION,
    netCapacity: Math.round(totalNetCapacity * 100) / 100,
    currentDemandHours: totalCurrentLoad,
    utilization: Math.round(totalUtilization * 100) / 100,
    alertLevel: overallAlertLevel,
    breakdown,
    dataProvenance: "DERIVED_DATA",
    generatedAt: new Date().toISOString(),
  });
}
