import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Mock the database module
vi.mock("@/lib/server/database", () => ({
  query: vi.fn(),
}));

import { POST } from "@/app/api/annulations/[id]/transition/route";
import { query } from "@/lib/server/database";

const mockedQuery = vi.mocked(query);

function createTransitionRequest(
  id: string,
  options: { headers?: Record<string, string>; body?: unknown } = {}
): [NextRequest, { params: Promise<{ id: string }> }] {
  const { headers = {}, body } = options;
  const req = new NextRequest(
    new URL(`/api/annulations/${id}/transition`, "http://localhost:3000"),
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    }
  );
  return [req, { params: Promise.resolve({ id }) }];
}

describe("POST /api/annulations/[id]/transition", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // --- 400 Validation Errors ---

  it("returns 400 for missing justification", async () => {
    const [req, ctx] = createTransitionRequest("uuid-1", {
      headers: { "x-user-role": "OPERATIONS_LEAD", "x-user-id": "user@vanti.com.co" },
      body: { targetState: "En_Revision" },
    });

    const res = await POST(req, ctx);
    expect(res.status).toBe(400);

    const json = await res.json();
    expect(json.error.code).toBe("VALIDATION_ERROR");
    expect(json.error.message).toContain("Justification");
    expect(json.error.message).toContain("at least 10 characters");
  });

  it("returns 400 for justification shorter than 10 characters", async () => {
    const [req, ctx] = createTransitionRequest("uuid-1", {
      headers: { "x-user-role": "OPERATIONS_LEAD", "x-user-id": "user@vanti.com.co" },
      body: { targetState: "En_Revision", justification: "too short" },
    });

    const res = await POST(req, ctx);
    expect(res.status).toBe(400);

    const json = await res.json();
    expect(json.error.code).toBe("VALIDATION_ERROR");
    expect(json.error.message).toContain("Received 9 characters");
  });

  it("returns 400 for empty justification string", async () => {
    const [req, ctx] = createTransitionRequest("uuid-1", {
      headers: { "x-user-role": "OPERATIONS_LEAD", "x-user-id": "user@vanti.com.co" },
      body: { targetState: "En_Revision", justification: "" },
    });

    const res = await POST(req, ctx);
    expect(res.status).toBe(400);
  });

  it("returns 400 for whitespace-only justification", async () => {
    const [req, ctx] = createTransitionRequest("uuid-1", {
      headers: { "x-user-role": "OPERATIONS_LEAD", "x-user-id": "user@vanti.com.co" },
      body: { targetState: "En_Revision", justification: "         " },
    });

    const res = await POST(req, ctx);
    expect(res.status).toBe(400);
  });

  it("returns 400 for missing targetState", async () => {
    const [req, ctx] = createTransitionRequest("uuid-1", {
      headers: { "x-user-role": "OPERATIONS_LEAD", "x-user-id": "user@vanti.com.co" },
      body: { justification: "Valid justification text here" },
    });

    const res = await POST(req, ctx);
    expect(res.status).toBe(400);

    const json = await res.json();
    expect(json.error.code).toBe("VALIDATION_ERROR");
    expect(json.error.message).toContain("targetState");
  });

  it("returns 400 for invalid JSON body", async () => {
    const req = new NextRequest(
      new URL("/api/annulations/uuid-1/transition", "http://localhost:3000"),
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-user-role": "OPERATIONS_LEAD",
          "x-user-id": "user@vanti.com.co",
        },
        body: "not-valid-json{",
      }
    );
    const ctx = { params: Promise.resolve({ id: "uuid-1" }) };

    const res = await POST(req, ctx);
    expect(res.status).toBe(400);

    const json = await res.json();
    expect(json.error.code).toBe("VALIDATION_ERROR");
    expect(json.error.message).toContain("Invalid JSON");
  });

  // --- 403 Permission Errors ---

  it("returns 403 for invalid/missing role", async () => {
    const [req, ctx] = createTransitionRequest("uuid-1", {
      headers: { "x-user-role": "UNKNOWN_ROLE", "x-user-id": "user@vanti.com.co" },
      body: { targetState: "En_Revision", justification: "Valid justification text here" },
    });

    const res = await POST(req, ctx);
    expect(res.status).toBe(403);

    const json = await res.json();
    expect(json.error.code).toBe("FORBIDDEN");
  });

  it("returns 403 when role is not authorized for transition", async () => {
    // INTERN_READONLY trying to move Solicitada -> En_Revision (not authorized)
    mockedQuery.mockResolvedValueOnce([
      { id: "uuid-1", current_state: "Solicitada" },
    ] as never);
    // Audit log for denied access
    mockedQuery.mockResolvedValueOnce([] as never);

    const [req, ctx] = createTransitionRequest("uuid-1", {
      headers: { "x-user-role": "INTERN_READONLY", "x-user-id": "intern@vanti.com.co" },
      body: { targetState: "En_Revision", justification: "Valid justification text here" },
    });

    const res = await POST(req, ctx);
    expect(res.status).toBe(403);

    const json = await res.json();
    expect(json.error.code).toBe("FORBIDDEN");
    expect(json.error.message).toContain("not authorized");
    expect(json.error.authorizedRoles).toBeDefined();
    expect(json.error.authorizedRoles).toContain("OPERATIONS_LEAD");
  });

  it("logs audit event for denied transition", async () => {
    mockedQuery.mockResolvedValueOnce([
      { id: "uuid-1", current_state: "Solicitada" },
    ] as never);
    mockedQuery.mockResolvedValueOnce([] as never); // audit log

    const [req, ctx] = createTransitionRequest("uuid-1", {
      headers: { "x-user-role": "AUDITOR", "x-user-id": "auditor@vanti.com.co" },
      body: { targetState: "En_Revision", justification: "Valid justification for audit" },
    });

    await POST(req, ctx);

    // Verify audit denial was logged
    expect(mockedQuery).toHaveBeenCalledTimes(2);
    const auditCall = mockedQuery.mock.calls[1];
    expect(auditCall[0]).toContain("TRANSITION_DENIED");
    expect(auditCall[0]).toContain("audit_events");
  });

  // --- 409 Invalid Transition Errors ---

  it("returns 409 for invalid target state name", async () => {
    const [req, ctx] = createTransitionRequest("uuid-1", {
      headers: { "x-user-role": "OPERATIONS_LEAD", "x-user-id": "user@vanti.com.co" },
      body: { targetState: "NonExistentState", justification: "Valid justification text here" },
    });

    const res = await POST(req, ctx);
    expect(res.status).toBe(409);

    const json = await res.json();
    expect(json.error.code).toBe("INVALID_STATE_TRANSITION");
    expect(json.error.validStates).toBeDefined();
  });

  it("returns 409 for transition from terminal state (Cerrada)", async () => {
    mockedQuery.mockResolvedValueOnce([
      { id: "uuid-1", current_state: "Cerrada" },
    ] as never);

    const [req, ctx] = createTransitionRequest("uuid-1", {
      headers: { "x-user-role": "SYSTEM_ADMIN", "x-user-id": "admin@vanti.com.co" },
      body: { targetState: "Solicitada", justification: "Valid justification text here" },
    });

    const res = await POST(req, ctx);
    expect(res.status).toBe(409);

    const json = await res.json();
    expect(json.error.code).toBe("INVALID_STATE_TRANSITION");
    expect(json.error.message).toContain("terminal state");
    expect(json.error.validTargets).toEqual([]);
  });

  it("returns 409 for transition from terminal state (Rechazada)", async () => {
    mockedQuery.mockResolvedValueOnce([
      { id: "uuid-1", current_state: "Rechazada" },
    ] as never);

    const [req, ctx] = createTransitionRequest("uuid-1", {
      headers: { "x-user-role": "SYSTEM_ADMIN", "x-user-id": "admin@vanti.com.co" },
      body: { targetState: "Solicitada", justification: "Valid justification text here" },
    });

    const res = await POST(req, ctx);
    expect(res.status).toBe(409);

    const json = await res.json();
    expect(json.error.code).toBe("INVALID_STATE_TRANSITION");
    expect(json.error.message).toContain("terminal state");
  });

  it("returns 409 for structurally invalid transition (Solicitada → Cerrada)", async () => {
    mockedQuery.mockResolvedValueOnce([
      { id: "uuid-1", current_state: "Solicitada" },
    ] as never);

    const [req, ctx] = createTransitionRequest("uuid-1", {
      headers: { "x-user-role": "SYSTEM_ADMIN", "x-user-id": "admin@vanti.com.co" },
      body: { targetState: "Cerrada", justification: "Valid justification text here" },
    });

    const res = await POST(req, ctx);
    expect(res.status).toBe(409);

    const json = await res.json();
    expect(json.error.code).toBe("INVALID_STATE_TRANSITION");
    expect(json.error.validTargets).toContain("En_Revision");
    expect(json.error.message).toContain("not valid");
  });

  // --- 404 Not Found ---

  it("returns 404 when cancellation request does not exist", async () => {
    mockedQuery.mockResolvedValueOnce([] as never);

    const [req, ctx] = createTransitionRequest("nonexistent-uuid", {
      headers: { "x-user-role": "OPERATIONS_LEAD", "x-user-id": "user@vanti.com.co" },
      body: { targetState: "En_Revision", justification: "Valid justification text here" },
    });

    const res = await POST(req, ctx);
    expect(res.status).toBe(404);

    const json = await res.json();
    expect(json.error.code).toBe("NOT_FOUND");
  });

  // --- Successful Transitions ---

  it("executes valid transition Solicitada → En_Revision (OPERATIONS_LEAD)", async () => {
    // Fetch current state
    mockedQuery.mockResolvedValueOnce([
      { id: "uuid-1", current_state: "Solicitada" },
    ] as never);
    // Update state
    mockedQuery.mockResolvedValueOnce([] as never);
    // Insert state history
    mockedQuery.mockResolvedValueOnce([] as never);
    // Insert audit event
    mockedQuery.mockResolvedValueOnce([] as never);

    const [req, ctx] = createTransitionRequest("uuid-1", {
      headers: { "x-user-role": "OPERATIONS_LEAD", "x-user-id": "lead@vanti.com.co" },
      body: { targetState: "En_Revision", justification: "Moving request to review phase" },
    });

    const res = await POST(req, ctx);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.data.id).toBe("uuid-1");
    expect(json.data.previousState).toBe("Solicitada");
    expect(json.data.currentState).toBe("En_Revision");
    expect(json.data.role).toBe("OPERATIONS_LEAD");
    expect(json.data.justification).toBe("Moving request to review phase");
    expect(json.message).toContain("executed successfully");
  });

  it("executes valid transition En_Revision → Aprobada (LEGAL_APPROVER)", async () => {
    mockedQuery.mockResolvedValueOnce([
      { id: "uuid-2", current_state: "En_Revision" },
    ] as never);
    mockedQuery.mockResolvedValueOnce([] as never);
    mockedQuery.mockResolvedValueOnce([] as never);
    mockedQuery.mockResolvedValueOnce([] as never);

    const [req, ctx] = createTransitionRequest("uuid-2", {
      headers: { "x-user-role": "LEGAL_APPROVER", "x-user-id": "legal@vanti.com.co" },
      body: { targetState: "Aprobada", justification: "Legal review completed, approved" },
    });

    const res = await POST(req, ctx);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.data.previousState).toBe("En_Revision");
    expect(json.data.currentState).toBe("Aprobada");
  });

  it("executes valid transition En_Revision → Rechazada (VP_APPROVER)", async () => {
    mockedQuery.mockResolvedValueOnce([
      { id: "uuid-3", current_state: "En_Revision" },
    ] as never);
    mockedQuery.mockResolvedValueOnce([] as never);
    mockedQuery.mockResolvedValueOnce([] as never);
    mockedQuery.mockResolvedValueOnce([] as never);

    const [req, ctx] = createTransitionRequest("uuid-3", {
      headers: { "x-user-role": "VP_APPROVER", "x-user-id": "vp@vanti.com.co" },
      body: { targetState: "Rechazada", justification: "Request does not meet criteria" },
    });

    const res = await POST(req, ctx);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.data.currentState).toBe("Rechazada");
  });

  it("executes valid transition En_Ejecucion → Cerrada (SYSTEM_ADMIN)", async () => {
    mockedQuery.mockResolvedValueOnce([
      { id: "uuid-4", current_state: "En_Ejecucion" },
    ] as never);
    mockedQuery.mockResolvedValueOnce([] as never);
    mockedQuery.mockResolvedValueOnce([] as never);
    mockedQuery.mockResolvedValueOnce([] as never);

    const [req, ctx] = createTransitionRequest("uuid-4", {
      headers: { "x-user-role": "SYSTEM_ADMIN", "x-user-id": "admin@vanti.com.co" },
      body: { targetState: "Cerrada", justification: "Execution complete, closing request" },
    });

    const res = await POST(req, ctx);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.data.previousState).toBe("En_Ejecucion");
    expect(json.data.currentState).toBe("Cerrada");
  });

  it("writes to cancellation_state_history on successful transition", async () => {
    mockedQuery.mockResolvedValueOnce([
      { id: "uuid-history", current_state: "Solicitada" },
    ] as never);
    mockedQuery.mockResolvedValueOnce([] as never); // update state
    mockedQuery.mockResolvedValueOnce([] as never); // state history
    mockedQuery.mockResolvedValueOnce([] as never); // audit

    const [req, ctx] = createTransitionRequest("uuid-history", {
      headers: { "x-user-role": "ANALYST", "x-user-id": "analyst@vanti.com.co" },
      body: { targetState: "En_Revision", justification: "Analyst initiating review process" },
    });

    await POST(req, ctx);

    // Verify state history insert
    expect(mockedQuery).toHaveBeenCalledTimes(4);
    const historyCall = mockedQuery.mock.calls[2];
    expect(historyCall[0]).toContain("cancellation_state_history");
    expect(historyCall[1]).toContain("uuid-history"); // cancellation_id
    expect(historyCall[1]).toContain("Solicitada"); // from_state
    expect(historyCall[1]).toContain("En_Revision"); // to_state
  });

  it("writes audit event on successful transition", async () => {
    mockedQuery.mockResolvedValueOnce([
      { id: "uuid-audit", current_state: "Aprobada" },
    ] as never);
    mockedQuery.mockResolvedValueOnce([] as never);
    mockedQuery.mockResolvedValueOnce([] as never);
    mockedQuery.mockResolvedValueOnce([] as never);

    const [req, ctx] = createTransitionRequest("uuid-audit", {
      headers: { "x-user-role": "OPERATIONS_LEAD", "x-user-id": "lead@vanti.com.co" },
      body: { targetState: "En_Ejecucion", justification: "Starting execution phase" },
    });

    await POST(req, ctx);

    // Verify audit event insert
    const auditCall = mockedQuery.mock.calls[3];
    expect(auditCall[0]).toContain("INSERT INTO audit_events");
    expect(auditCall[0]).toContain("ANNULATION_TRANSITION");
  });

  it("returns 500 on database error during transition", async () => {
    mockedQuery.mockResolvedValueOnce([
      { id: "uuid-err", current_state: "Solicitada" },
    ] as never);
    mockedQuery.mockRejectedValueOnce(new Error("Connection lost"));

    const [req, ctx] = createTransitionRequest("uuid-err", {
      headers: { "x-user-role": "OPERATIONS_LEAD", "x-user-id": "lead@vanti.com.co" },
      body: { targetState: "En_Revision", justification: "Valid justification text here" },
    });

    const res = await POST(req, ctx);
    expect(res.status).toBe(500);

    const json = await res.json();
    expect(json.error.code).toBe("INTERNAL_ERROR");
  });

  it("accepts exactly 10-character justification", async () => {
    mockedQuery.mockResolvedValueOnce([
      { id: "uuid-min", current_state: "Solicitada" },
    ] as never);
    mockedQuery.mockResolvedValueOnce([] as never);
    mockedQuery.mockResolvedValueOnce([] as never);
    mockedQuery.mockResolvedValueOnce([] as never);

    const [req, ctx] = createTransitionRequest("uuid-min", {
      headers: { "x-user-role": "OPERATIONS_LEAD", "x-user-id": "lead@vanti.com.co" },
      body: { targetState: "En_Revision", justification: "1234567890" },
    });

    const res = await POST(req, ctx);
    expect(res.status).toBe(200);
  });

  // --- Validation priority order ---

  it("validates justification before checking DB (returns 400 not 404)", async () => {
    // No DB mock needed - should fail before reaching DB
    const [req, ctx] = createTransitionRequest("nonexistent-uuid", {
      headers: { "x-user-role": "OPERATIONS_LEAD", "x-user-id": "user@vanti.com.co" },
      body: { targetState: "En_Revision", justification: "short" },
    });

    const res = await POST(req, ctx);
    expect(res.status).toBe(400);

    // DB should NOT be called
    expect(mockedQuery).not.toHaveBeenCalled();
  });

  it("validates role before checking transition validity", async () => {
    // Invalid role should be caught before DB lookup for transition validity
    const [req, ctx] = createTransitionRequest("uuid-1", {
      headers: { "x-user-role": "FAKE_ROLE", "x-user-id": "fake@test.com" },
      body: { targetState: "En_Revision", justification: "Valid justification text here" },
    });

    const res = await POST(req, ctx);
    expect(res.status).toBe(403);

    // DB should NOT be called for role validation
    expect(mockedQuery).not.toHaveBeenCalled();
  });
});
