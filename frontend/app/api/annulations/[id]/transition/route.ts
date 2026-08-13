import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/server/database";
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
 * Terminal states — no outgoing transitions allowed (REQ-16.1).
 */
const TERMINAL_STATES = new Set(["Cerrada", "Rechazada"]);

/**
 * Valid transitions table mapping (from, to) → authorized roles (REQ-16.2).
 */
const VALID_TRANSITIONS: Record<string, Record<string, Set<string>>> = {
  Solicitada: {
    En_Revision: new Set(["OPERATIONS_LEAD", "ANALYST"]),
  },
  En_Revision: {
    Aprobada: new Set(["LEGAL_APPROVER", "VP_APPROVER", "SYSTEM_ADMIN", "ASSESSMENT_COORDINATOR"]),
    Rechazada: new Set(["LEGAL_APPROVER", "VP_APPROVER", "SYSTEM_ADMIN", "ASSESSMENT_COORDINATOR"]),
  },
  Aprobada: {
    En_Ejecucion: new Set(["OPERATIONS_LEAD", "SYSTEM_ADMIN", "ASSESSMENT_COORDINATOR"]),
  },
  En_Ejecucion: {
    Cerrada: new Set(["OPERATIONS_LEAD", "SYSTEM_ADMIN", "ASSESSMENT_COORDINATOR"]),
  },
};

/**
 * Minimum justification length per REQ-16.6.
 */
const MIN_JUSTIFICATION_LENGTH = 10;

/**
 * All valid roles from Lista Maestra.
 */
const ALL_VALID_ROLES = new Set([
  "SYSTEM_ADMIN",
  "OPERATIONS_LEAD",
  "ANALYST",
  "LEGAL_APPROVER",
  "VP_APPROVER",
  "BUSINESS_OWNER",
  "AUDITOR",
  "PARTNER_ADMIN",
  "PARTNER_OPERATOR",
  "CONTRACTOR_OPERATOR",
  "INTERN_READONLY",
  "ASSESSMENT_COORDINATOR",
]);

/**
 * Get valid target states from a given state (regardless of role).
 */
function getValidTargets(currentState: string): string[] {
  const transitions = VALID_TRANSITIONS[currentState];
  if (!transitions) return [];
  return Object.keys(transitions).sort();
}

/**
 * POST /api/annulations/[id]/transition
 *
 * Execute a state transition on a cancellation request.
 * Validates in order:
 *   1. Justification ≥ 10 characters → 400 if invalid
 *   2. Role authorization → 403 if unauthorized
 *   3. Transition validity → 422 if invalid transition
 *
 * Body:
 *   { targetState: string, justification: string }
 *
 * Response 200: Transition executed successfully
 * Response 400: Validation error (short/missing justification)
 * Response 403: Unauthorized role for this transition
 * Response 404: Cancellation request not found
 * Response 422: Invalid state transition
 *
 * Requirements: 16.1, 16.2, 16.3, 16.5, 16.6
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // --- Extract user info from verified identity ---
  const identity = await getRequestIdentity(request);
  const userRole = identity.role;
  const userId = identity.userId;

  // --- Validate role is a known role ---
  if (!ALL_VALID_ROLES.has(userRole)) {
    return NextResponse.json(
      {
        error: {
          code: "FORBIDDEN",
          message: `Invalid or missing role. Access denied.`,
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

  const targetState = body.targetState as string | undefined;
  const justification = body.justification as string | undefined;

  // --- Step 1: Validate justification (REQ-16.6) → 400 ---
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

  // --- Validate targetState is provided ---
  if (!targetState) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "targetState is required",
        },
      },
      { status: 400 }
    );
  }

  // --- Validate targetState is a valid state name ---
  if (!VALID_STATES.has(targetState)) {
    return NextResponse.json(
      {
        error: {
          code: "INVALID_STATE_TRANSITION",
          message: `Invalid target state: '${targetState}'.`,
          validStates: Array.from(VALID_STATES),
        },
      },
      { status: 409 }
    );
  }

  // --- Fetch current state from database ---
  let currentState: string;
  try {
    const rows = await query<{ id: string; current_state: string }>(
      `SELECT id, current_state FROM cancellation_requests WHERE id = $1`,
      [id]
    );

    if (!rows.length) {
      return NextResponse.json(
        {
          error: {
            code: "NOT_FOUND",
            message: `Cancellation request '${id}' not found.`,
          },
        },
        { status: 404 }
      );
    }

    currentState = rows[0].current_state;
  } catch (error) {
    console.error("Error fetching cancellation request:", error);
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to fetch cancellation request",
        },
      },
      { status: 500 }
    );
  }

  // --- Step 3a: Check terminal state (REQ-16.1) → 409 ---
  if (TERMINAL_STATES.has(currentState)) {
    return NextResponse.json(
      {
        error: {
          code: "INVALID_STATE_TRANSITION",
          message: `State '${currentState}' is a terminal state. No transitions are allowed.`,
          currentState,
          targetState,
          validTargets: [],
        },
      },
      { status: 409 }
    );
  }

  // --- Step 3b: Check transition structural validity (REQ-16.2, REQ-16.5) → 409 ---
  const transitions = VALID_TRANSITIONS[currentState];
  if (!transitions || !transitions[targetState]) {
    const validTargets = getValidTargets(currentState);
    return NextResponse.json(
      {
        error: {
          code: "INVALID_STATE_TRANSITION",
          message: `Transition from '${currentState}' to '${targetState}' is not valid. Valid transitions from '${currentState}': ${JSON.stringify(validTargets)}.`,
          currentState,
          targetState,
          validTargets,
        },
      },
      { status: 409 }
    );
  }

  // --- Step 2: Validate role authorization → 403 ---
  const authorizedRoles = transitions[targetState];
  if (!authorizedRoles.has(userRole)) {
    // Log denied access to audit (REQ-14.1)
    try {
      await query(
        `INSERT INTO audit_events (user_id, action, resource, resource_id, result, details)
         VALUES ($1, 'TRANSITION_DENIED', '/api/annulations/transition', $2, 'failure', $3)`,
        [
          userId,
          id,
          JSON.stringify({
            currentState,
            targetState,
            role: userRole,
            reason: "Unauthorized role for this transition",
          }),
        ]
      );
    } catch {
      // Non-critical: audit write failure shouldn't block the 403 response
      console.warn("Failed to log denied transition to audit");
    }

    return NextResponse.json(
      {
        error: {
          code: "FORBIDDEN",
          message: `Role '${userRole}' is not authorized to transition from '${currentState}' to '${targetState}'. Authorized roles: ${JSON.stringify(Array.from(authorizedRoles).sort())}.`,
          currentState,
          targetState,
          authorizedRoles: Array.from(authorizedRoles).sort(),
        },
      },
      { status: 403 }
    );
  }

  // --- Execute transition ---
  try {
    // Update current state
    await query(
      `UPDATE cancellation_requests SET current_state = $1, updated_at = NOW() WHERE id = $2`,
      [targetState, id]
    );

    // Write to state history (REQ-16.3, REQ-16.4)
    await query(
      `INSERT INTO cancellation_state_history
        (cancellation_id, from_state, to_state, transitioned_by, transitioned_by_role, justification)
       VALUES ($1, $2, $3, (SELECT id FROM app_users WHERE email = $4 LIMIT 1), $5, $6)`,
      [id, currentState, targetState, userId, userRole, justification.trim()]
    );

    // Log audit event (REQ-16.3, REQ-14.3 — synchronous)
    await query(
      `INSERT INTO audit_events (user_id, action, resource, resource_id, result, details)
       VALUES ($1, 'ANNULATION_TRANSITION', '/api/annulations/transition', $2, 'success', $3)`,
      [
        userId,
        id,
        JSON.stringify({
          fromState: currentState,
          toState: targetState,
          role: userRole,
          justification: justification.trim(),
        }),
      ]
    );

    return NextResponse.json({
      data: {
        id,
        previousState: currentState,
        currentState: targetState,
        transitionedBy: userId,
        role: userRole,
        justification: justification.trim(),
        transitionedAt: new Date().toISOString(),
      },
      message: `Transition from '${currentState}' to '${targetState}' executed successfully.`,
    });
  } catch (error) {
    console.error("Error executing transition:", error);
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to execute state transition",
        },
      },
      { status: 500 }
    );
  }
}
