import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/server/database";

export const dynamic = "force-dynamic";

/**
 * Allowed roles for accessing audit logs per RBAC matrix.
 * Only SYSTEM_ADMIN and AUDITOR can read audit events.
 */
const AUDIT_ALLOWED_ROLES = new Set(["SYSTEM_ADMIN", "AUDITOR"]);

/**
 * Validates that a date string is a valid ISO-8601 format.
 */
function isValidISODate(dateStr: string): boolean {
  const d = new Date(dateStr);
  return !isNaN(d.getTime());
}

/**
 * GET /api/audit
 *
 * Returns paginated audit events with optional filters.
 * Only accessible by SYSTEM_ADMIN and AUDITOR roles.
 *
 * Query Parameters:
 *   - page: Page number (default: 1)
 *   - page_size: Results per page (default: 50, max: 200)
 *   - date_start: ISO-8601 start date filter (inclusive)
 *   - date_end: ISO-8601 end date filter (inclusive)
 *   - user_id: Filter by user identifier
 *   - action: Filter by action type
 *   - resource: Filter by resource path/entity
 *
 * Response 200:
 *   { data: AuditEvent[], total: number, page: number, pageSize: number }
 *
 * Response 403: Unauthorized role
 * Response 400: Invalid query parameters
 *
 * Requirements: 14.1, 14.2, 14.3, 14.4, 14.5
 */
export async function GET(request: NextRequest) {
  // --- RBAC Check ---
  // Extract role from request headers (set by middleware or JWT validation)
  const userRole = request.headers.get("x-user-role") || "";
  if (!AUDIT_ALLOWED_ROLES.has(userRole)) {
    return NextResponse.json(
      {
        error: {
          code: "FORBIDDEN",
          message: "Insufficient permissions. Only SYSTEM_ADMIN and AUDITOR roles can access audit logs.",
        },
      },
      { status: 403 }
    );
  }

  // --- Parse Query Parameters ---
  const searchParams = request.nextUrl.searchParams;

  const pageParam = searchParams.get("page");
  const pageSizeParam = searchParams.get("page_size");
  const dateStart = searchParams.get("date_start");
  const dateEnd = searchParams.get("date_end");
  const userId = searchParams.get("user_id");
  const action = searchParams.get("action");
  const resource = searchParams.get("resource");

  // Parse pagination
  const page = pageParam ? parseInt(pageParam, 10) : 1;
  const pageSize = Math.min(pageSizeParam ? parseInt(pageSizeParam, 10) : 50, 200);

  if (isNaN(page) || page < 1) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "page must be a positive integer" } },
      { status: 400 }
    );
  }

  if (isNaN(pageSize) || pageSize < 1) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "page_size must be a positive integer" } },
      { status: 400 }
    );
  }

  // Validate date formats
  if (dateStart && !isValidISODate(dateStart)) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "date_start must be a valid ISO-8601 date" } },
      { status: 400 }
    );
  }

  if (dateEnd && !isValidISODate(dateEnd)) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "date_end must be a valid ISO-8601 date" } },
      { status: 400 }
    );
  }

  // --- Build SQL Query with parameterized filters ---
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;

  if (dateStart) {
    conditions.push(`timestamp >= $${paramIdx}::timestamptz`);
    params.push(dateStart);
    paramIdx++;
  }

  if (dateEnd) {
    conditions.push(`timestamp <= $${paramIdx}::timestamptz`);
    params.push(dateEnd);
    paramIdx++;
  }

  if (userId) {
    conditions.push(`user_id = $${paramIdx}`);
    params.push(userId);
    paramIdx++;
  }

  if (action) {
    conditions.push(`action = $${paramIdx}`);
    params.push(action);
    paramIdx++;
  }

  if (resource) {
    conditions.push(`resource = $${paramIdx}`);
    params.push(resource);
    paramIdx++;
  }

  const whereClause = conditions.length > 0 ? conditions.join(" AND ") : "1=1";
  const offset = (page - 1) * pageSize;

  try {
    // Get total count
    const countResult = await query<{ count: string }>(
      `SELECT COUNT(*) as count FROM audit_events WHERE ${whereClause}`,
      params
    );
    const total = parseInt(countResult[0]?.count ?? "0", 10);

    // Get paginated data
    const dataParams = [...params, pageSize, offset];
    const rows = await query<{
      id: string;
      timestamp: string;
      user_id: string;
      action: string;
      resource: string;
      resource_id: string | null;
      result: string;
      ip_address: string | null;
      details: Record<string, unknown> | null;
      correlation_id: string | null;
    }>(
      `SELECT id, timestamp, user_id, action, resource, resource_id, result, ip_address, details, correlation_id
       FROM audit_events
       WHERE ${whereClause}
       ORDER BY timestamp DESC
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      dataParams
    );

    // Map to camelCase response format per design contract
    const data = rows.map((row) => ({
      id: row.id,
      timestamp: row.timestamp,
      userId: row.user_id,
      action: row.action,
      resource: row.resource,
      resourceId: row.resource_id,
      result: row.result,
      ipAddress: row.ip_address,
      details: row.details,
      correlationId: row.correlation_id,
    }));

    return NextResponse.json({
      data,
      total,
      page,
      pageSize,
    });
  } catch (error) {
    console.error("Error querying audit events:", error);
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to query audit events",
        },
      },
      { status: 500 }
    );
  }
}
