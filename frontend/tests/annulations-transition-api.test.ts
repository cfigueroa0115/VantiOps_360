import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * Mock the database query function.
 */
const mockQuery = vi.hoisted(() => vi.fn());

vi.mock("@/lib/server/database", () => ({
  query: mockQuery,
}));

import { POST } from "@/app/api/annulations/[id]/transition/route";

/**
 * Helper to create a NextRequest for POST /api/annulations/[id]/transition.
 */
function createTransitionRequest(
  body: Record<string, unknown>,
  role: string = "OPERATIONS_LEAD",
  userId: string = "lead@vanti.com.co"
): NextRequest {
  return new NextRequest(
    "http://localhost:3000/api/annulations/uuid-1/transition",
    {
      method: "POST",
      headers: {
        "x-user-role": role,
        "x-user-id": userId,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );
}

/**
 * Helper to call POST with proper params context.
 */
async function callTransition(
  body: Record<string, unknown>,
  role: string = "OPERATIONS_LEAD",
  userId: string = "lead@vanti.com.co",
  id: string = "uuid-1"
) {
  const request = createTransitionRequest(body, role, userId);
  return POST(request, { params: Promise.resolve({ id }) });
}

describe("POST /api/annulations/[id]/transition", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("validation — justification (REQ-16.6) → 400", () => {
    it("returns 400 when justification is missing", async () => {
      const response = await callTransition({
        targetState: "En_Revision",
      });
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error.code).toBe("VALIDATION_ERROR");
      expect(body.error.message).toContain("Justification");
      expect(body.error.message).toContain("10");
    });

    it("returns 400 when justification is too short", async () => {
      const response = await callTransition({
        targetState: "En_Revision",
        justification: "short",
      });
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error.code).toBe("VALIDATION_ERROR");
      expect(body.error.message).toContain("10");
    });

    it("returns 400 when justification is empty string", async () => {
      const response = await callTransition({
        targetState: "En_Revision",
        justification: "",
      });
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error.code).toBe("VALIDATION_ERROR");
    });

    it("returns 400 when justification is only whitespace under 10 chars", async () => {
      const response = await callTransition({
        targetState: "En_Revision",
        justification: "     ",
      });
      const body = await response.json();

      expect(response.status).toBe(400);
    });
  });

  describe("RBAC authorization → 403", () => {
    it("returns 403 for invalid/missing role", async () => {
      const response = await callTransition(
        {
          targetState: "En_Revision",
          justification: "Moving to review for assessment",
        },
        "" // no role
      );
      const body = await response.json();

      expect(response.status).toBe(403);
      expect(body.error.code).toBe("FORBIDDEN");
    });

    it("returns 403 when INTERN_READONLY tries Solicitada → En_Revision", async () => {
      // Mock DB fetch of current state
      mockQuery.mockResolvedValueOnce([
        { id: "uuid-1", current_state: "Solicitada" },
      ]);
      // Mock audit log for denied access
      mockQuery.mockResolvedValueOnce([]);

      const response = await callTransition(
        {
          targetState: "En_Revision",
          justification: "Attempting unauthorized transition",
        },
        "INTERN_READONLY"
      );
      const body = await response.json();

      expect(response.status).toBe(403);
      expect(body.error.code).toBe("FORBIDDEN");
      expect(body.error.message).toContain("INTERN_READONLY");
      expect(body.error.authorizedRoles).toContain("OPERATIONS_LEAD");
    });

    it("returns 403 when BUSINESS_OWNER tries En_Revision → Aprobada", async () => {
      mockQuery.mockResolvedValueOnce([
        { id: "uuid-1", current_state: "En_Revision" },
      ]);
      mockQuery.mockResolvedValueOnce([]); // audit

      const response = await callTransition(
        {
          targetState: "Aprobada",
          justification: "Business owner trying to approve",
        },
        "BUSINESS_OWNER"
      );
      const body = await response.json();

      expect(response.status).toBe(403);
      expect(body.error.code).toBe("FORBIDDEN");
    });
  });

  describe("invalid transitions (REQ-16.2, REQ-16.5) → 409", () => {
    it("returns 409 when transition is not valid (Solicitada → Cerrada)", async () => {
      mockQuery.mockResolvedValueOnce([
        { id: "uuid-1", current_state: "Solicitada" },
      ]);

      const response = await callTransition(
        {
          targetState: "Cerrada",
          justification: "Trying to jump to closed state",
        },
        "SYSTEM_ADMIN"
      );
      const body = await response.json();

      expect(response.status).toBe(409);
      expect(body.error.code).toBe("INVALID_STATE_TRANSITION");
      expect(body.error.currentState).toBe("Solicitada");
      expect(body.error.targetState).toBe("Cerrada");
      expect(body.error.validTargets).toContain("En_Revision");
    });

    it("returns 409 for terminal state Cerrada", async () => {
      mockQuery.mockResolvedValueOnce([
        { id: "uuid-1", current_state: "Cerrada" },
      ]);

      const response = await callTransition(
        {
          targetState: "Solicitada",
          justification: "Trying to reopen a closed request",
        },
        "SYSTEM_ADMIN"
      );
      const body = await response.json();

      expect(response.status).toBe(409);
      expect(body.error.code).toBe("INVALID_STATE_TRANSITION");
      expect(body.error.message).toContain("terminal state");
      expect(body.error.validTargets).toEqual([]);
    });

    it("returns 409 for terminal state Rechazada", async () => {
      mockQuery.mockResolvedValueOnce([
        { id: "uuid-1", current_state: "Rechazada" },
      ]);

      const response = await callTransition(
        {
          targetState: "Solicitada",
          justification: "Trying to reopen a rejected request",
        },
        "SYSTEM_ADMIN"
      );
      const body = await response.json();

      expect(response.status).toBe(409);
      expect(body.error.code).toBe("INVALID_STATE_TRANSITION");
      expect(body.error.message).toContain("terminal state");
    });

    it("returns 409 for invalid target state name", async () => {
      const response = await callTransition(
        {
          targetState: "NonExistentState",
          justification: "Trying invalid state name",
        },
        "SYSTEM_ADMIN"
      );
      const body = await response.json();

      expect(response.status).toBe(409);
      expect(body.error.code).toBe("INVALID_STATE_TRANSITION");
    });
  });

  describe("successful transitions", () => {
    it("executes Solicitada → En_Revision with OPERATIONS_LEAD", async () => {
      // Fetch current state
      mockQuery.mockResolvedValueOnce([
        { id: "uuid-1", current_state: "Solicitada" },
      ]);
      // Update state
      mockQuery.mockResolvedValueOnce([]);
      // Insert state history
      mockQuery.mockResolvedValueOnce([]);
      // Insert audit event
      mockQuery.mockResolvedValueOnce([]);

      const response = await callTransition(
        {
          targetState: "En_Revision",
          justification: "Moving to review for quality assessment",
        },
        "OPERATIONS_LEAD"
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.data.previousState).toBe("Solicitada");
      expect(body.data.currentState).toBe("En_Revision");
      expect(body.data.role).toBe("OPERATIONS_LEAD");
      expect(body.message).toContain("successfully");

      // Verify state update query
      const updateCall = mockQuery.mock.calls[1];
      expect(updateCall[0]).toContain("UPDATE cancellation_requests");
      expect(updateCall[1]).toContain("En_Revision");

      // Verify history insert
      const historyCall = mockQuery.mock.calls[2];
      expect(historyCall[0]).toContain(
        "INSERT INTO cancellation_state_history"
      );

      // Verify audit event
      const auditCall = mockQuery.mock.calls[3];
      expect(auditCall[0]).toContain("INSERT INTO audit_events");
      expect(auditCall[0]).toContain("ANNULATION_TRANSITION");
    });

    it("executes En_Revision → Aprobada with LEGAL_APPROVER", async () => {
      mockQuery.mockResolvedValueOnce([
        { id: "uuid-1", current_state: "En_Revision" },
      ]);
      mockQuery.mockResolvedValueOnce([]);
      mockQuery.mockResolvedValueOnce([]);
      mockQuery.mockResolvedValueOnce([]);

      const response = await callTransition(
        {
          targetState: "Aprobada",
          justification: "Legal review complete, approved for cancellation",
        },
        "LEGAL_APPROVER"
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.data.previousState).toBe("En_Revision");
      expect(body.data.currentState).toBe("Aprobada");
    });

    it("executes En_Revision → Rechazada with VP_APPROVER", async () => {
      mockQuery.mockResolvedValueOnce([
        { id: "uuid-1", current_state: "En_Revision" },
      ]);
      mockQuery.mockResolvedValueOnce([]);
      mockQuery.mockResolvedValueOnce([]);
      mockQuery.mockResolvedValueOnce([]);

      const response = await callTransition(
        {
          targetState: "Rechazada",
          justification: "VP rejects this cancellation request",
        },
        "VP_APPROVER"
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.data.currentState).toBe("Rechazada");
    });

    it("executes En_Ejecucion → Cerrada with SYSTEM_ADMIN", async () => {
      mockQuery.mockResolvedValueOnce([
        { id: "uuid-1", current_state: "En_Ejecucion" },
      ]);
      mockQuery.mockResolvedValueOnce([]);
      mockQuery.mockResolvedValueOnce([]);
      mockQuery.mockResolvedValueOnce([]);

      const response = await callTransition(
        {
          targetState: "Cerrada",
          justification: "Cancellation execution complete, closing request",
        },
        "SYSTEM_ADMIN"
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.data.currentState).toBe("Cerrada");
    });
  });

  describe("not found", () => {
    it("returns 404 when cancellation request does not exist", async () => {
      mockQuery.mockResolvedValueOnce([]); // empty result

      const response = await callTransition(
        {
          targetState: "En_Revision",
          justification: "Transition on non-existent request",
        },
        "OPERATIONS_LEAD",
        "lead@vanti.com.co",
        "non-existent-uuid"
      );
      const body = await response.json();

      expect(response.status).toBe(404);
      expect(body.error.code).toBe("NOT_FOUND");
    });
  });

  describe("error handling", () => {
    it("returns 500 when database throws during state fetch", async () => {
      mockQuery.mockRejectedValueOnce(new Error("Connection lost"));

      const response = await callTransition(
        {
          targetState: "En_Revision",
          justification: "Valid justification for transition",
        },
        "OPERATIONS_LEAD"
      );
      const body = await response.json();

      expect(response.status).toBe(500);
      expect(body.error.code).toBe("INTERNAL_ERROR");
    });
  });
});
