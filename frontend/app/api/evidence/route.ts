import { NextRequest, NextResponse } from "next/server";
import {
  getCommitHash,
  getStackVersions,
  getTestResults,
  getCoverageMetrics,
  generateEvidenceArtifact,
  type EvidencePayload,
} from "@/lib/server/evidence-helpers";

export const dynamic = "force-dynamic";

/**
 * Allowed roles for accessing the evidence endpoint.
 * Per RBAC matrix: SYSTEM_ADMIN, OPERATIONS_LEAD, AUDITOR.
 */
const EVIDENCE_ALLOWED_ROLES = new Set([
  "SYSTEM_ADMIN",
  "OPERATIONS_LEAD",
  "AUDITOR",
]);

// ---------------------------------------------------------------------------
// GET /api/evidence
// ---------------------------------------------------------------------------

/**
 * GET /api/evidence
 *
 * Returns current build evidence including commit hash, build date, stack versions,
 * test results, and coverage metrics. Also generates an evidence artifact file
 * in frontend/artifacts/evidence/{date}_{commit}/.
 *
 * Access: SYSTEM_ADMIN, OPERATIONS_LEAD, AUDITOR (per middleware).
 *
 * Response 200:
 *   {
 *     commitHash: string,
 *     buildDate: string (ISO-8601),
 *     stack: { nextjs, react, typescript, python, polars },
 *     tests: { unit: {...}, e2e: {...} },
 *     coverage: { statements, branches, functions, lines },
 *     environment: string,
 *     dataProvenance: "REAL_DATA",
 *     generatedAt: string (ISO-8601)
 *   }
 *
 * Response 403: Unauthorized role
 *
 * Requirements: 29.1, 29.2, 29.3, 29.4
 */
export async function GET(request: NextRequest) {
  // --- RBAC Check ---
  const userRole = request.headers.get("x-user-role") || "";
  if (!EVIDENCE_ALLOWED_ROLES.has(userRole)) {
    return NextResponse.json(
      {
        error: {
          code: "FORBIDDEN",
          message:
            "Insufficient permissions. Only SYSTEM_ADMIN, OPERATIONS_LEAD, and AUDITOR roles can access evidence data.",
        },
      },
      { status: 403 }
    );
  }

  // --- Gather evidence data ---
  const commitHash = getCommitHash();
  const buildDate = process.env.BUILD_DATE || new Date().toISOString();
  const stack = getStackVersions();
  const tests = getTestResults();
  const coverage = getCoverageMetrics();
  const environment = process.env.VERCEL_ENV || process.env.NODE_ENV || "development";
  const generatedAt = new Date().toISOString();

  const evidence: EvidencePayload = {
    commitHash,
    buildDate,
    stack,
    tests,
    coverage,
    environment,
    dataProvenance: "REAL_DATA",
    generatedAt,
  };

  // --- Generate artifact ---
  generateEvidenceArtifact(evidence);

  return NextResponse.json(evidence);
}
