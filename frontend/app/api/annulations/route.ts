import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/server/database";
import { validatePartnerEmail, logPartnerEmailDenied } from "@/lib/server/partner-email-validator";
import { getRequestIdentity } from "@/lib/server/auth-context";

export const dynamic = "force-dynamic";

/**
 * Valid states for the annulations state machine (REQ-16.1).
 */
const VALID_STATES = new Set([
  "Solicitada",
  "En_Revision",
  "Aprobada",
  "Rechazada",
  "En_Ejecucion",
  "Cerrada",
]);

/**
 * Roles allowed to LIST cancellation requests (READ_ANNULATIONS permission).
 */
const LIST_ALLOWED_ROLES = new Set([
  "SYSTEM_ADMIN",
  "OPERATIONS_LEAD",
  "ANALYST",
  "LEGAL_APPROVER",
  "VP_APPROVER",
  "BUSINESS_OWNER",
  "AUDITOR",
  "PARTNER_OPERATOR",
]);

/**
 * Roles allowed to CREATE cancellation requests (CREATE_ANNULATION permission).
 */
const CREATE_ALLOWED_ROLES = new Set([
  "SYSTEM_ADMIN",
  "BUSINESS_OWNER",
]);

/**
 * Minimum justification length per REQ-16.6.
 */
const MIN_JUSTIFICATION_LENGTH = 10;

/**
 * GET /api/annulations
 *
 * Returns paginated list of cancellation requests with optional status filter.
 * Requires READ_ANNULATIONS permission.
 *
 * Query Parameters:
 *   - page: Page number (default: 1)
 *   - page_size: Results per page (default: 50, max: 200)
 *   - status: Filter by current_state
 *
 * Response 200:
 *   { data: CancellationRequest[], total: number, page: number, pageSize: number }
 *
 * Response 403: Unauthorized role
 * Response 400: Invalid query parameters
 *
 * Requirements: 16.1, 16.4
 */
export async function GET(request: NextRequest) {
  // --- RBAC Check (identity from verified JWT or POC fallback) ---
  const identity = await getRequestIdentity(request);
  const userRole = identity.role;
  if (!LIST_ALLOWED_ROLES.has(userRole)) {
    return NextResponse.json(
      {
        error: {
          code: "FORBIDDEN",
          message:
            "Insufficient permissions. Your role does not have access to annulations.",
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
  const requester = searchParams.get("requester");

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

  // Validate status filter if provided
  if (status && !VALID_STATES.has(status)) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: `Invalid status filter. Must be one of: ${Array.from(VALID_STATES).join(", ")}`,
        },
      },
      { status: 400 }
    );
  }

  // --- Build SQL Query ---
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;

  if (status) {
    conditions.push(`cr.current_state = $${paramIdx}`);
    params.push(status);
    paramIdx++;
  }

  if (requester) {
    conditions.push(`cr.requested_by IN (SELECT id FROM app_users WHERE email = $${paramIdx})`);
    params.push(requester);
    paramIdx++;
  }

  const whereClause =
    conditions.length > 0 ? conditions.join(" AND ") : "1=1";
  const offset = (page - 1) * pageSize;

  try {
    // Get total count
    const countResult = await query<{ count: string }>(
      `SELECT COUNT(*) as count FROM cancellation_requests cr WHERE ${whereClause}`,
      params
    );
    const total = parseInt(countResult[0]?.count ?? "0", 10);

    // Get paginated data
    const dataParams = [...params, pageSize, offset];
    const rows = await query<{
      id: string;
      radicado: string;
      pqr_id: string | null;
      current_state: string;
      requested_by: string;
      justification: string;
      created_at: string;
      updated_at: string;
    }>(
      `SELECT cr.id, cr.radicado, cr.pqr_id, cr.current_state,
              cr.requested_by::text, cr.justification, cr.created_at, cr.updated_at
       FROM cancellation_requests cr
       WHERE ${whereClause}
       ORDER BY cr.created_at DESC
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      dataParams
    );

    const data = rows.map((row) => ({
      id: row.id,
      radicado: row.radicado,
      pqrId: row.pqr_id,
      currentState: row.current_state,
      requestedBy: row.requested_by,
      justification: row.justification,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    return NextResponse.json({
      data,
      total,
      page,
      pageSize,
    });
  } catch (error) {
    console.error("Error querying cancellation requests:", error);
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to query cancellation requests",
        },
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/annulations
 *
 * Create a new cancellation request. Initial state is always "Solicitada".
 * Requires CREATE_ANNULATION permission.
 *
 * Body:
 *   { pqrId: string, justification: string }
 *
 * Response 201: Created cancellation request
 * Response 400: Validation error (missing fields, short justification)
 * Response 403: Unauthorized role
 *
 * Requirements: 16.1, 16.2, 16.5, 16.6
 */
export async function POST(request: NextRequest) {
  // --- RBAC Check (identity from verified JWT or POC fallback) ---
  const identity = await getRequestIdentity(request);
  const userRole = identity.role;
  const userId = identity.userId;

  if (!CREATE_ALLOWED_ROLES.has(userRole)) {
    return NextResponse.json(
      {
        error: {
          code: "FORBIDDEN",
          message:
            "Insufficient permissions. Only SYSTEM_ADMIN and BUSINESS_OWNER can create cancellation requests.",
        },
      },
      { status: 403 }
    );
  }

  // --- Parse Body ---
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Invalid JSON body" } },
      { status: 400 }
    );
  }

  const pqrId = body.pqrId as string | undefined;
  const justification = body.justification as string | undefined;
  const partnerId = body.partnerId as string | undefined;
  const senderEmail = body.senderEmail as string | undefined;

  // --- Partner Email Validation (when request comes from a partner) ---
  if (partnerId && senderEmail) {
    const validation = await validatePartnerEmail(partnerId, senderEmail);
    if (!validation.authorized) {
      await logPartnerEmailDenied(partnerId, senderEmail || "", validation.reason || "unknown");
      return NextResponse.json(
        {
          error: {
            code: "FORBIDDEN",
            message: `Partner email validation failed: ${validation.reason}. The sender email must match the active authorized email for the partner.`,
          },
        },
        { status: 403 }
      );
    }
  }

  // Validate required fields
  if (!pqrId) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "pqrId is required",
        },
      },
      { status: 400 }
    );
  }

  // Validate justification (REQ-16.6)
  if (
    !justification ||
    justification.trim().length < MIN_JUSTIFICATION_LENGTH
  ) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: `Justification is required and must be at least ${MIN_JUSTIFICATION_LENGTH} characters. Received ${justification ? justification.trim().length : 0} characters.`,
        },
      },
      { status: 400 }
    );
  }

  try {
    // Generate a unique radicado
    const radicado = `ANU-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    // Create the cancellation request (initial state: Solicitada)
    const result = await query<{
      id: string;
      radicado: string;
      pqr_id: string;
      current_state: string;
      created_at: string;
    }>(
      `INSERT INTO cancellation_requests (radicado, pqr_id, current_state, requested_by, justification)
       VALUES ($1, $2, 'Solicitada', (SELECT id FROM app_users WHERE email = $3 LIMIT 1), $4)
       RETURNING id, radicado, pqr_id, current_state, created_at`,
      [radicado, pqrId, userId, justification.trim()]
    );

    if (!result.length) {
      return NextResponse.json(
        {
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to create cancellation request",
          },
        },
        { status: 500 }
      );
    }

    const created = result[0];

    // Log audit event (REQ-16.3, REQ-14.3 — synchronous)
    await query(
      `INSERT INTO audit_events (user_id, action, resource, resource_id, result, details)
       VALUES ($1, 'CREATE_ANNULATION', '/api/annulations', $2, 'success', $3)`,
      [
        userId,
        created.id,
        JSON.stringify({
          pqrId,
          radicado: created.radicado,
          initialState: "Solicitada",
          justification: justification.trim(),
        }),
      ]
    );

    return NextResponse.json(
      {
        data: {
          id: created.id,
          radicado: created.radicado,
          pqrId: created.pqr_id,
          currentState: created.current_state,
          justification: justification.trim(),
          createdAt: created.created_at,
        },
        message: "Cancellation request created successfully",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creating cancellation request:", error);
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to create cancellation request",
        },
      },
      { status: 500 }
    );
  }
}
