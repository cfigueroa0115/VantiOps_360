import { NextRequest, NextResponse } from "next/server";
import { query, withTransaction } from "@/lib/server/database";
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
  // Optimistic concurrency: accept optional expectedVersion
  const expectedVersion = body.expectedVersion as number | undefined;

  // --- Execute transition atomically ---
  try {
    const result = await withTransaction(async (client) => {
      // SELECT FOR UPDATE to prevent concurrent modifications
      const rows = await client.query(
        `SELECT id, current_state, version FROM cancellation_requests WHERE id = $1 FOR UPDATE`,
        [id]
      );

      if (!rows.rows.length) {
        return { error: "NOT_FOUND", status: 404 } as const;
      }

      const currentState = rows.rows[0].current_state;
      const currentVersion = rows.rows[0].version;

      // AUTHORIZATION FIRST: check if role can mutate at all
      // This must happen BEFORE state/concurrency validation (403 > 409)
      const NEVER_MUTATE_ROLES = new Set(["INTERN_READONLY", "AUDITOR", "PARTNER_ADMIN", "PARTNER_OPERATOR", "CONTRACTOR_OPERATOR"]);
      if (NEVER_MUTATE_ROLES.has(userRole)) {
        await client.query(
          `INSERT INTO audit_events (user_id, action, resource, resource_id, result, details)
           VALUES ($1, 'ANNULATION_TRANSITION_DENIED', '/api/annulations/transition', $2, 'failure', $3)`,
          [userId, id, JSON.stringify({ currentState, targetState, role: userRole, reason: "ROLE_NOT_AUTHORIZED" })]
        );
        return { error: "FORBIDDEN", status: 403, currentState, authorizedRoles: [] } as const;
      }

      // Check optimistic concurrency
      if (expectedVersion !== undefined && expectedVersion !== currentVersion) {
        return { error: "CONCURRENT_MODIFICATION", status: 409, currentVersion } as const;
      }

      // Check terminal state
      if (TERMINAL_STATES.has(currentState)) {
        return { error: "TERMINAL_STATE", status: 409, currentState } as const;
      }

      // Check structural validity
      const transitions = VALID_TRANSITIONS[currentState];
      if (!transitions || !transitions[targetState]) {
        const validTargets = getValidTargets(currentState);
        return { error: "INVALID_TRANSITION", status: 409, currentState, validTargets } as const;
      }

      // Check specific role authorization for this transition
      const authorizedRoles = transitions[targetState];
      if (!authorizedRoles.has(userRole)) {
        // Log denied to audit
        await client.query(
          `INSERT INTO audit_events (user_id, action, resource, resource_id, result, details)
           VALUES ($1, 'TRANSITION_DENIED', '/api/annulations/transition', $2, 'failure', $3)`,
          [userId, id, JSON.stringify({ currentState, targetState, role: userRole })]
        );
        return { error: "FORBIDDEN", status: 403, currentState, authorizedRoles: Array.from(authorizedRoles).sort() } as const;
      }

      // All validations passed — execute atomic transition
      await client.query(
        `UPDATE cancellation_requests SET current_state = $1, version = version + 1, updated_at = NOW() WHERE id = $2`,
        [targetState, id]
      );

      await client.query(
        `INSERT INTO cancellation_state_history
          (cancellation_id, from_state, to_state, transitioned_by, transitioned_by_role, justification)
         VALUES ($1, $2, $3, (SELECT id FROM app_users WHERE email = $4 LIMIT 1), $5, $6)`,
        [id, currentState, targetState, userId, userRole, justification.trim()]
      );

      await client.query(
        `INSERT INTO audit_events (user_id, action, resource, resource_id, result, details)
         VALUES ($1, 'ANNULATION_TRANSITION', '/api/annulations/transition', $2, 'success', $3)`,
        [userId, id, JSON.stringify({ fromState: currentState, toState: targetState, role: userRole, justification: justification.trim() })]
      );

      return { success: true, previousState: currentState, newVersion: currentVersion + 1 } as const;
    });

    // Handle result
    if ("error" in result) {
      if (result.error === "NOT_FOUND") {
        return NextResponse.json({ error: { code: "NOT_FOUND", message: `Cancellation request '${id}' not found.` } }, { status: 404 });
      }
      if (result.error === "CONCURRENT_MODIFICATION") {
        return NextResponse.json({ error: { code: "CONCURRENT_MODIFICATION", message: "La solicitud fue modificada por otro usuario. Actualiza la información e intenta nuevamente." } }, { status: 409 });
      }
      if (result.error === "TERMINAL_STATE") {
        return NextResponse.json({ error: { code: "INVALID_STATE_TRANSITION", message: `State '${result.currentState}' is a terminal state. No transitions are allowed.`, currentState: result.currentState, targetState, validTargets: [] } }, { status: 409 });
      }
      if (result.error === "INVALID_TRANSITION") {
        return NextResponse.json({ error: { code: "INVALID_STATE_TRANSITION", message: `Transition from '${result.currentState}' to '${targetState}' is not valid.`, currentState: result.currentState, targetState, validTargets: result.validTargets } }, { status: 409 });
      }
      if (result.error === "FORBIDDEN") {
        return NextResponse.json({ error: { code: "FORBIDDEN", message: `Role '${userRole}' is not authorized for this transition.`, currentState: result.currentState, targetState, authorizedRoles: result.authorizedRoles } }, { status: 403 });
      }
    }

    if ("success" in result) {
      return NextResponse.json({
        data: { id, previousState: result.previousState, currentState: targetState, transitionedBy: userId, role: userRole, justification: justification.trim(), version: result.newVersion, transitionedAt: new Date().toISOString() },
        message: `Transition from '${result.previousState}' to '${targetState}' executed successfully.`,
      });
    }

    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Unexpected state" } }, { status: 500 });
  } catch (error) {
    console.error("Error executing transition:", error);
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Failed to execute state transition" } }, { status: 500 });
  }
}
