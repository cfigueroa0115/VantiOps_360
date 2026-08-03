import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/server/database";

export const dynamic = "force-dynamic";

/**
 * ⚠️ CONCEPTUAL_DESIGN: Mock endpoint for Power Automate webhook integration.
 *
 * This endpoint simulates receiving callbacks from Microsoft Power Automate flows.
 * It is NOT connected to Microsoft 365 or any Power Automate production environment.
 * Its purpose is to validate contracts, demonstrate the integration design, and
 * log invocations for audit trail purposes.
 *
 * Requirements: 24.1, 24.2, 24.3, 24.4, 24.5
 */

/**
 * Valid flow IDs that this mock endpoint accepts.
 * Corresponds to the 8 designed flows in docs/power-automate-design.md.
 */
const VALID_FLOW_IDS = new Set([
  "PA-FLOW-001-INGESTA",
  "PA-FLOW-002-VALIDACION",
  "PA-FLOW-003-ADJUNTOS",
  "PA-FLOW-004-TICKET",
  "PA-FLOW-005-APROBACIONES",
  "PA-FLOW-006-RECORDATORIOS",
  "PA-FLOW-007-ESCALAMIENTO",
  "PA-FLOW-008-NOTIFICACIONES",
]);

/**
 * Valid actions per flow for basic contract validation.
 */
const VALID_ACTIONS: Record<string, string[]> = {
  "PA-FLOW-001-INGESTA": ["EMAIL_RECEIVED"],
  "PA-FLOW-002-VALIDACION": ["VALIDATE_SENDER"],
  "PA-FLOW-003-ADJUNTOS": ["PROCESS_ATTACHMENTS"],
  "PA-FLOW-004-TICKET": ["CREATE_PQR_TICKET"],
  "PA-FLOW-005-APROBACIONES": ["REQUEST_APPROVAL"],
  "PA-FLOW-006-RECORDATORIOS": ["SLA_REMINDER"],
  "PA-FLOW-007-ESCALAMIENTO": ["SLA_ESCALATION"],
  "PA-FLOW-008-NOTIFICACIONES": ["STATE_CHANGE_NOTIFICATION"],
};

/**
 * Validates the Bearer token from the Authorization header.
 * Uses timing-safe comparison to prevent timing attacks.
 *
 * The expected token is read from the POWER_AUTOMATE_WEBHOOK_SECRET env var.
 * If the env var is not set, a default mock token is used for development.
 */
function validateBearerToken(authHeader: string | null): boolean {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return false;
  }

  const token = authHeader.slice(7); // Remove "Bearer " prefix
  const expectedToken =
    process.env.POWER_AUTOMATE_WEBHOOK_SECRET || "mock-dev-token-vantiops-360";

  // Timing-safe comparison
  if (token.length !== expectedToken.length) {
    return false;
  }

  let mismatch = 0;
  for (let i = 0; i < token.length; i++) {
    mismatch |= token.charCodeAt(i) ^ expectedToken.charCodeAt(i);
  }
  return mismatch === 0;
}

/**
 * Logs webhook invocation to the audit_events table.
 * This provides full traceability of all Power Automate callbacks.
 */
async function logWebhookInvocation(
  correlationId: string,
  flowId: string,
  action: string,
  result: "success" | "failure",
  details: Record<string, unknown>,
  ipAddress: string
): Promise<void> {
  try {
    await query(
      `INSERT INTO audit_events
        (user_id, action, resource, resource_id, result, ip_address, details, correlation_id)
       VALUES ($1, $2, $3, $4, $5, $6::inet, $7, $8)`,
      [
        "SYSTEM_POWER_AUTOMATE",
        `WEBHOOK_${action}`,
        "/api/webhooks/power-automate",
        correlationId,
        result,
        ipAddress || "0.0.0.0",
        JSON.stringify({ flowId, ...details }),
        correlationId,
      ]
    );
  } catch (error) {
    // Log to console but don't fail the webhook response
    // Audit logging is best-effort for the mock endpoint
    console.error("Failed to log webhook invocation to audit:", error);
  }
}

/**
 * POST /api/webhooks/power-automate
 *
 * Mock endpoint for Power Automate webhook callbacks.
 * ⚠️ CONCEPTUAL_DESIGN — not connected to Microsoft 365 production.
 *
 * Headers:
 *   Authorization: Bearer {token}
 *
 * Request Body:
 *   {
 *     "flowId": "PA-FLOW-001-INGESTA" (one of 8 valid flow IDs),
 *     "action": "EMAIL_RECEIVED" (valid action for the flow),
 *     "payload": { ... } (flow-specific payload)
 *   }
 *
 * Response 200: { received: true, timestamp, correlationId, flowId, status }
 * Response 401: { error: { code: "UNAUTHORIZED", message } }
 * Response 400: { error: { code: "VALIDATION_ERROR", message } }
 * Response 500: { error: { code: "INTERNAL_ERROR", message } }
 *
 * Requirements: 24.1, 24.2, 24.3, 24.4, 24.5
 */
export async function POST(request: NextRequest) {
  const correlationId = crypto.randomUUID();
  const timestamp = new Date().toISOString();
  const ipAddress =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "0.0.0.0";

  // --- Bearer Token Validation (REQ-24.3) ---
  const authHeader = request.headers.get("Authorization");
  if (!validateBearerToken(authHeader)) {
    // Log unauthorized attempt to audit
    await logWebhookInvocation(
      correlationId,
      "UNKNOWN",
      "UNAUTHORIZED_ATTEMPT",
      "failure",
      { reason: "Invalid or missing bearer token" },
      ipAddress
    );

    return NextResponse.json(
      {
        error: {
          code: "UNAUTHORIZED",
          message: "Invalid or missing bearer token. Provide a valid Authorization: Bearer {token} header.",
        },
      },
      { status: 401 }
    );
  }

  // --- Parse and Validate Request Body ---
  let body: { flowId?: string; action?: string; payload?: Record<string, unknown> };
  try {
    body = await request.json();
  } catch {
    await logWebhookInvocation(
      correlationId,
      "UNKNOWN",
      "INVALID_PAYLOAD",
      "failure",
      { reason: "Invalid JSON body" },
      ipAddress
    );

    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Request body must be valid JSON with flowId, action, and payload fields.",
        },
      },
      { status: 400 }
    );
  }

  const { flowId, action, payload } = body;

  // Validate flowId
  if (!flowId || !VALID_FLOW_IDS.has(flowId)) {
    await logWebhookInvocation(
      correlationId,
      flowId || "UNKNOWN",
      "INVALID_FLOW_ID",
      "failure",
      { providedFlowId: flowId },
      ipAddress
    );

    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: `Invalid flowId. Must be one of: ${Array.from(VALID_FLOW_IDS).join(", ")}`,
        },
      },
      { status: 400 }
    );
  }

  // Validate action for the given flow
  const validActions = VALID_ACTIONS[flowId] || [];
  if (!action || !validActions.includes(action)) {
    await logWebhookInvocation(
      correlationId,
      flowId,
      "INVALID_ACTION",
      "failure",
      { providedAction: action, validActions },
      ipAddress
    );

    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: `Invalid action '${action}' for flow '${flowId}'. Valid actions: ${validActions.join(", ")}`,
        },
      },
      { status: 400 }
    );
  }

  // Validate payload exists
  if (!payload || typeof payload !== "object") {
    await logWebhookInvocation(
      correlationId,
      flowId,
      action,
      "failure",
      { reason: "Missing or invalid payload" },
      ipAddress
    );

    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "payload must be a non-null object.",
        },
      },
      { status: 400 }
    );
  }

  // --- Log successful invocation to audit (REQ-24.3) ---
  await logWebhookInvocation(
    correlationId,
    flowId,
    action,
    "success",
    {
      payloadKeys: Object.keys(payload),
      dataProvenance: "CONCEPTUAL_DESIGN",
    },
    ipAddress
  );

  // --- Return acknowledgment ---
  return NextResponse.json(
    {
      received: true,
      timestamp,
      correlationId,
      flowId,
      status: "ACCEPTED",
      dataProvenance: "CONCEPTUAL_DESIGN",
      disclaimer:
        "Mock endpoint — not connected to Microsoft 365 production. See docs/power-automate-design.md for full design.",
    },
    { status: 200 }
  );
}
