import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/server/database";
import { getRequestIdentity } from "@/lib/server/auth-context";

export const dynamic = "force-dynamic";

/**
 * Allowed roles for accessing the approvals endpoint per RBAC matrix.
 * Only SYSTEM_ADMIN, LEGAL_APPROVER, and VP_APPROVER can access approvals.
 */
const APPROVALS_ALLOWED_ROLES = new Set([
  "SYSTEM_ADMIN",
  "LEGAL_APPROVER",
  "VP_APPROVER",
]);

/**
 * Operations requiring approval (REQ-15.3).
 */
const VALID_OPERATIONS = new Set([
  "PRODUCTION_MIGRATION",
  "RBAC_CHANGE",
  "DATA_DELETION",
  "SECURITY_CONFIG_CHANGE",
  "PARTNER_ONBOARDING",
]);

/**
 * Maps operations to their required approver roles.
 */
const OPERATION_APPROVER_MAP: Record<string, string[]> = {
  PRODUCTION_MIGRATION: ["VP_APPROVER"],
  RBAC_CHANGE: ["LEGAL_APPROVER", "VP_APPROVER"],
  DATA_DELETION: ["LEGAL_APPROVER"],
  SECURITY_CONFIG_CHANGE: ["LEGAL_APPROVER", "VP_APPROVER"],
  PARTNER_ONBOARDING: ["LEGAL_APPROVER", "VP_APPROVER"],
};

/**
 * Operations that require sequential multi-step approval.
 * For these, step_order 1 = LEGAL_APPROVER must be approved before step_order 2 = VP_APPROVER.
 */
const SEQUENTIAL_OPERATIONS = new Set(["PARTNER_ONBOARDING", "RBAC_CHANGE", "SECURITY_CONFIG_CHANGE"]);

/**
 * 72-hour expiration in milliseconds (REQ-15.4).
 */
const EXPIRATION_HOURS = 72;
const EXPIRATION_MS = EXPIRATION_HOURS * 60 * 60 * 1000;

/**
 * Minimum justification length (REQ-15.2).
 */
const MIN_JUSTIFICATION_LENGTH = 10;

/**
 * GET /api/approvals
 *
 * Returns paginated approval requests with optional filters.
 * Only accessible by SYSTEM_ADMIN, LEGAL_APPROVER, VP_APPROVER.
 *
 * Query Parameters:
 *   - page: Page number (default: 1)
 *   - page_size: Results per page (default: 50, max: 200)
 *   - status: Filter by status (pending, approved, rejected, expired)
 *   - operation: Filter by operation type
 *   - approver_role: Filter by required approver role
 *
 * Response 200:
 *   { data: ApprovalRecord[], total: number, page: number, pageSize: number }
 *
 * Response 403: Unauthorized role
 * Response 400: Invalid query parameters
 *
 * Requirements: 15.1, 15.2, 15.3, 15.4
 */
export async function GET(request: NextRequest) {
  // --- RBAC Check (identity from verified JWT or POC fallback) ---
  const identity = await getRequestIdentity(request);
  const userRole = identity.role;
  if (!APPROVALS_ALLOWED_ROLES.has(userRole)) {
    return NextResponse.json(
      {
        error: {
          code: "FORBIDDEN",
          message:
            "Insufficient permissions. Only SYSTEM_ADMIN, LEGAL_APPROVER, and VP_APPROVER roles can access approvals.",
        },
      },
      { status: 403 }
    );
  }

  // --- Parse Query Parameters ---
  const searchParams = request.nextUrl.searchParams;

  const pageParam = searchParams.get("page");
  const pageSizeParam = searchParams.get("page_size");
  const status = searchParams.get("status");
  const operation = searchParams.get("operation");
  const approverRole = searchParams.get("approver_role");

  const page = pageParam ? parseInt(pageParam, 10) : 1;
  const pageSize = Math.min(
    pageSizeParam ? parseInt(pageSizeParam, 10) : 50,
    200
  );

  if (isNaN(page) || page < 1) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "page must be a positive integer",
        },
      },
      { status: 400 }
    );
  }

  if (isNaN(pageSize) || pageSize < 1) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "page_size must be a positive integer",
        },
      },
      { status: 400 }
    );
  }

  // --- Auto-expire pending approvals past 72h (REQ-15.4) ---
  try {
    await query(
      `UPDATE approval_steps
       SET status = 'expired'
       WHERE status = 'pending' AND expires_at < NOW()`
    );
  } catch {
    // Non-critical: expiration check may fail if DB unavailable
    console.warn("Failed to auto-expire approvals");
  }

  // --- Build SQL Query ---
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;

  if (status) {
    conditions.push(`s.status = $${paramIdx}`);
    params.push(status);
    paramIdx++;
  }

  if (operation) {
    conditions.push(`a.application_type = $${paramIdx}`);
    params.push(operation);
    paramIdx++;
  }

  if (approverRole) {
    conditions.push(`s.approver_role = $${paramIdx}`);
    params.push(approverRole);
    paramIdx++;
  }

  const whereClause =
    conditions.length > 0 ? conditions.join(" AND ") : "1=1";
  const offset = (page - 1) * pageSize;

  try {
    // Get total count
    const countResult = await query<{ count: string }>(
      `SELECT COUNT(*) as count
       FROM approval_steps s
       JOIN partner_applications a ON s.application_id = a.id
       WHERE ${whereClause}`,
      params
    );
    const total = parseInt(countResult[0]?.count ?? "0", 10);

    // Get paginated data
    const dataParams = [...params, pageSize, offset];
    const rows = await query<{
      id: string;
      operation: string;
      requester_id: string | null;
      approver_role: string;
      justification: string | null;
      status: string;
      approved_by: string | null;
      approved_at: string | null;
      expires_at: string;
      created_at: string;
    }>(
      `SELECT
         s.id,
         a.application_type as operation,
         a.partner_id::text as requester_id,
         s.approver_role,
         s.justification,
         s.status,
         s.approved_by::text,
         s.approved_at,
         s.expires_at,
         s.created_at
       FROM approval_steps s
       JOIN partner_applications a ON s.application_id = a.id
       WHERE ${whereClause}
       ORDER BY s.created_at DESC
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      dataParams
    );

    const data = rows.map((row) => ({
      id: row.id,
      operation: row.operation,
      requesterId: row.requester_id,
      approverRole: row.approver_role,
      justification: row.justification,
      status: row.status,
      approvedBy: row.approved_by,
      approvedAt: row.approved_at,
      expiresAt: row.expires_at,
      requestedAt: row.created_at,
    }));

    return NextResponse.json({
      data,
      total,
      page,
      pageSize,
    });
  } catch (error) {
    console.error("Error querying approvals:", error);
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to query approval records",
        },
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/approvals
 *
 * Create a new approval request or approve/reject an existing one.
 * Only accessible by SYSTEM_ADMIN, LEGAL_APPROVER, VP_APPROVER.
 *
 * Body for creating a request:
 *   { action: "request", operation: string, approverRole: string, justification: string }
 *
 * Body for approving/rejecting:
 *   { action: "approve" | "reject", approvalId: string, justification: string }
 *
 * Response 201: Created approval request
 * Response 200: Approved/rejected
 * Response 400: Validation error
 * Response 403: Unauthorized role
 * Response 404: Approval not found
 * Response 410: Approval expired
 *
 * Requirements: 15.1, 15.2, 15.3, 15.4
 */
export async function POST(request: NextRequest) {
  // --- RBAC Check (identity from verified JWT or POC fallback) ---
  const identity = await getRequestIdentity(request);
  const userRole = identity.role;
  const userId = identity.userId;

  if (!APPROVALS_ALLOWED_ROLES.has(userRole)) {
    return NextResponse.json(
      {
        error: {
          code: "FORBIDDEN",
          message:
            "Insufficient permissions. Only SYSTEM_ADMIN, LEGAL_APPROVER, and VP_APPROVER roles can manage approvals.",
        },
      },
      { status: 403 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Invalid JSON body" } },
      { status: 400 }
    );
  }

  const action = body.action as string;

  if (action === "request") {
    return handleCreateRequest(body, userId, userRole, request);
  } else if (action === "approve") {
    return handleApproveReject(body, userId, userRole, "approved", request);
  } else if (action === "reject") {
    return handleApproveReject(body, userId, userRole, "rejected", request);
  } else {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message:
            "Invalid action. Must be 'request', 'approve', or 'reject'.",
        },
      },
      { status: 400 }
    );
  }
}

async function handleCreateRequest(
  body: Record<string, unknown>,
  userId: string,
  userRole: string,
  request: NextRequest
): Promise<NextResponse> {
  const operation = body.operation as string;
  const approverRole = body.approverRole as string;
  const justification = body.justification as string;

  // Validate operation type (REQ-15.3)
  if (!operation || !VALID_OPERATIONS.has(operation)) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: `Invalid operation. Must be one of: ${Array.from(VALID_OPERATIONS).join(", ")}`,
        },
      },
      { status: 400 }
    );
  }

  // Validate approver role for this operation
  const validRoles = OPERATION_APPROVER_MAP[operation] || [];
  if (!approverRole || !validRoles.includes(approverRole)) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: `Operation '${operation}' requires approval from: ${validRoles.join(", ")}`,
        },
      },
      { status: 400 }
    );
  }

  // Validate justification (REQ-15.2)
  if (!justification || justification.length < MIN_JUSTIFICATION_LENGTH) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: `Justification must be at least ${MIN_JUSTIFICATION_LENGTH} characters`,
        },
      },
      { status: 400 }
    );
  }

  // Calculate expiration (REQ-15.4)
  const now = new Date();
  const expiresAt = new Date(now.getTime() + EXPIRATION_MS);

  try {
    // Create a partner_application record for the operation
    const appResult = await query<{ id: string }>(
      `INSERT INTO partner_applications (partner_id, application_type, status, submitted_at)
       VALUES (
         (SELECT id FROM partners LIMIT 1),
         $1, 'submitted', NOW()
       )
       RETURNING id`,
      [operation]
    );

    if (!appResult.length) {
      return NextResponse.json(
        {
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to create application record",
          },
        },
        { status: 500 }
      );
    }

    const applicationId = appResult[0].id;

    // Create approval steps (sequential operations get Legal + VP)
    const roles = OPERATION_APPROVER_MAP[operation] || [approverRole];
    const isSequential = SEQUENTIAL_OPERATIONS.has(operation);

    let primaryStep: { id: string; created_at: string; expires_at: string };

    if (isSequential && roles.length > 1) {
      // Create Legal step first (step_order 1)
      const legalResult = await query<{ id: string; created_at: string; expires_at: string }>(
        `INSERT INTO approval_steps
           (application_id, step_order, approver_role, status, justification, expires_at)
         VALUES ($1, 1, 'LEGAL_APPROVER', 'pending', $2, $3)
         RETURNING id, created_at, expires_at`,
        [applicationId, justification, expiresAt.toISOString()]
      );
      primaryStep = legalResult[0];

      // Create VP step (step_order 2) — blocked until Legal approves
      await query(
        `INSERT INTO approval_steps
           (application_id, step_order, approver_role, status, justification, expires_at)
         VALUES ($1, 2, 'VP_APPROVER', 'pending', $2, $3)`,
        [applicationId, justification, expiresAt.toISOString()]
      );
    } else {
      // Single-step approval
      const stepResult = await query<{ id: string; created_at: string; expires_at: string }>(
        `INSERT INTO approval_steps
           (application_id, step_order, approver_role, status, justification, expires_at)
         VALUES ($1, 1, $2, 'pending', $3, $4)
         RETURNING id, created_at, expires_at`,
        [applicationId, approverRole, justification, expiresAt.toISOString()]
      );
      primaryStep = stepResult[0];
    }

    const step = primaryStep;

    // Log approval event
    await query(
      `INSERT INTO approval_events (step_id, event_type, actor_id, actor_role, justification)
       VALUES ($1, 'requested', (SELECT id FROM app_users WHERE email = $2 LIMIT 1), $3, $4)`,
      [step.id, userId, userRole, justification]
    );

    // Log audit event
    await query(
      `INSERT INTO audit_events (user_id, action, resource, resource_id, result, details)
       VALUES ($1, 'APPROVAL_REQUESTED', '/api/approvals', $2, 'success', $3)`,
      [
        userId,
        step.id,
        JSON.stringify({ operation, approverRole, expiresAt: expiresAt.toISOString() }),
      ]
    );

    return NextResponse.json(
      {
        data: {
          id: step.id,
          operation,
          requesterId: userId,
          approverRole,
          justification,
          status: "pending",
          expiresAt: step.expires_at,
          requestedAt: step.created_at,
        },
        message: "Approval request created successfully",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creating approval request:", error);
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to create approval request",
        },
      },
      { status: 500 }
    );
  }
}

async function handleApproveReject(
  body: Record<string, unknown>,
  userId: string,
  userRole: string,
  newStatus: "approved" | "rejected",
  request: NextRequest
): Promise<NextResponse> {
  const approvalId = body.approvalId as string;
  const justification = body.justification as string;

  if (!approvalId) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "approvalId is required",
        },
      },
      { status: 400 }
    );
  }

  // Validate justification (REQ-15.2)
  if (!justification || justification.length < MIN_JUSTIFICATION_LENGTH) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: `Justification must be at least ${MIN_JUSTIFICATION_LENGTH} characters`,
        },
      },
      { status: 400 }
    );
  }

  try {
    // Fetch the approval step
    const steps = await query<{
      id: string;
      approver_role: string;
      status: string;
      expires_at: string;
      application_type: string;
    }>(
      `SELECT s.id, s.approver_role, s.status, s.expires_at, a.application_type
       FROM approval_steps s
       JOIN partner_applications a ON s.application_id = a.id
       WHERE s.id = $1`,
      [approvalId]
    );

    if (!steps.length) {
      return NextResponse.json(
        {
          error: { code: "NOT_FOUND", message: "Approval request not found" },
        },
        { status: 404 }
      );
    }

    const step = steps[0];

    // Check if already processed
    if (step.status !== "pending") {
      return NextResponse.json(
        {
          error: {
            code: "INVALID_STATUS",
            message: `Approval is not pending (current status: ${step.status})`,
          },
        },
        { status: 400 }
      );
    }

    // Check expiration (REQ-15.4)
    const expiresAt = new Date(step.expires_at);
    if (new Date() > expiresAt) {
      // Auto-expire
      await query(
        `UPDATE approval_steps SET status = 'expired' WHERE id = $1`,
        [approvalId]
      );
      await query(
        `INSERT INTO approval_events (step_id, event_type, actor_role, justification)
         VALUES ($1, 'expired', 'SYSTEM', '72-hour expiration window exceeded')`,
        [approvalId]
      );
      return NextResponse.json(
        {
          error: {
            code: "EXPIRED",
            message:
              "Approval has expired (72-hour window exceeded). A new request is required.",
          },
        },
        { status: 410 }
      );
    }

    // Check role matches (REQ-15.1)
    if (
      userRole !== "SYSTEM_ADMIN" &&
      userRole !== step.approver_role
    ) {
      return NextResponse.json(
        {
          error: {
            code: "ROLE_MISMATCH",
            message: `This approval requires role '${step.approver_role}'`,
          },
        },
        { status: 403 }
      );
    }

    // Enforce sequential approval: VP cannot approve before Legal (REQ-15.5)
    if (step.approver_role === "VP_APPROVER") {
      const priorSteps = await query<{ status: string }>(
        `SELECT s2.status FROM approval_steps s2
         WHERE s2.application_id = (SELECT application_id FROM approval_steps WHERE id = $1)
         AND s2.step_order < (SELECT step_order FROM approval_steps WHERE id = $1)
         AND s2.approver_role = 'LEGAL_APPROVER'`,
        [approvalId]
      );
      // Only enforce if a Legal step exists for this application
      if (priorSteps.length > 0) {
        const legalNotApproved = priorSteps.some((s) => s.status !== "approved");
        if (legalNotApproved) {
          return NextResponse.json(
            {
              error: {
                code: "SEQUENTIAL_VIOLATION",
                message: "VP approval requires prior Legal approval. Legal step must be approved first.",
              },
            },
            { status: 403 }
          );
        }
      }
    }

    // Update the approval step
    await query(
      `UPDATE approval_steps
       SET status = $1,
           approved_by = (SELECT id FROM app_users WHERE email = $2 LIMIT 1),
           approved_at = NOW()
       WHERE id = $3`,
      [newStatus, userId, approvalId]
    );

    // Log approval event
    const eventType = newStatus === "approved" ? "approved" : "rejected";
    await query(
      `INSERT INTO approval_events (step_id, event_type, actor_id, actor_role, justification)
       VALUES ($1, $2, (SELECT id FROM app_users WHERE email = $3 LIMIT 1), $4, $5)`,
      [approvalId, eventType, userId, userRole, justification]
    );

    // Log audit event
    const auditAction =
      newStatus === "approved" ? "APPROVAL_GRANTED" : "APPROVAL_REJECTED";
    await query(
      `INSERT INTO audit_events (user_id, action, resource, resource_id, result, details)
       VALUES ($1, $2, '/api/approvals', $3, 'success', $4)`,
      [
        userId,
        auditAction,
        approvalId,
        JSON.stringify({
          operation: step.application_type,
          justification,
        }),
      ]
    );

    return NextResponse.json({
      data: {
        id: approvalId,
        operation: step.application_type,
        approverRole: step.approver_role,
        status: newStatus,
        approvedBy: userId,
        approvedAt: new Date().toISOString(),
        justification,
      },
      message: `Approval ${newStatus} successfully`,
    });
  } catch (error) {
    console.error(`Error processing approval ${newStatus}:`, error);
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: `Failed to ${newStatus === "approved" ? "approve" : "reject"} request`,
        },
      },
      { status: 500 }
    );
  }
}
