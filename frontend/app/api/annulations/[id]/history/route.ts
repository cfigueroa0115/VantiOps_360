import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/server/database";
import { getRequestIdentity } from "@/lib/server/auth-context";

export const dynamic = "force-dynamic";

/**
 * GET /api/annulations/[id]/history
 *
 * Returns the state transition history for a cancellation request.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const identity = await getRequestIdentity(request);
  if (!identity.role) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Authentication required" } },
      { status: 401 }
    );
  }

  try {
    // Get the cancellation request info
    const reqRows = await query<{
      id: string; radicado: string; pqr_id: string; current_state: string;
      justification: string; created_at: string; updated_at: string;
    }>(
      `SELECT id, radicado, pqr_id, current_state, justification, created_at, updated_at
       FROM cancellation_requests WHERE id = $1`,
      [id]
    );

    if (!reqRows.length) {
      return NextResponse.json({ error: { code: "NOT_FOUND", message: "Not found" } }, { status: 404 });
    }

    // Get state history
    const historyRows = await query<{
      id: string; from_state: string; to_state: string;
      transitioned_by_role: string; justification: string; transitioned_at: string;
    }>(
      `SELECT csh.id, csh.from_state, csh.to_state, csh.transitioned_by_role,
              csh.justification, csh.transitioned_at
       FROM cancellation_state_history csh
       WHERE csh.cancellation_id = $1
       ORDER BY csh.transitioned_at ASC`,
      [id]
    );

    const request_data = reqRows[0];

    return NextResponse.json({
      request: {
        id: request_data.id,
        radicado: request_data.radicado,
        pqrId: request_data.pqr_id,
        currentState: request_data.current_state,
        justification: request_data.justification,
        createdAt: request_data.created_at,
        updatedAt: request_data.updated_at,
      },
      history: historyRows.map((h) => ({
        id: h.id,
        fromState: h.from_state,
        toState: h.to_state,
        role: h.transitioned_by_role,
        justification: h.justification,
        transitionedAt: h.transitioned_at,
      })),
    });
  } catch (error) {
    console.error("Error fetching history:", error);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to fetch history" } },
      { status: 500 }
    );
  }
}
