import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * Annulations Access Denied Tests (REQ-18.1, REQ-18.3)
 *
 * Validates that unauthorized roles receive HTTP 403,
 * the annulation state remains unchanged, and
 * audit_events contains a DENY record on forbidden transitions.
 */

// --- Mock the database query function ---
const mockQuery = vi.hoisted(() => vi.fn());

vi.mock("@/lib/server/database", () => ({
  query: mockQuery,
}));

import { POST } from "@/app/api/annulations/[id]/transition/route";

// --- Helpers ---

function createTransitionRequest(
  body: Record<string, unknown>,
  role: string,
  userId: string = "test-user@vanti.com.co"
): NextRequest {
  return new NextRequest(
    "http://localhost:3000/api/annulations/ann-001/transition",
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

async function callTransition(
  body: Record<string, unknown>,
  role: string,
  userId: string = "test-user@vanti.com.co",
  id: string = "ann-001"
) {
  const request = createTransitionRequest(body, role, userId);
  return POST(request, { params: Promise.resolve({ id }) });
}

describe("Annulations Access Denied (REQ-18.1, REQ-18.3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("INTERN_READONLY cannot approve cancellation → HTTP 403", () => {
    it("returns 403 when INTERN_READONLY tries Solicitada → En_Revision", async () => {
      // Mock: DB returns current state "Solicitada"
      mockQuery.mockResolvedValueOnce([
        { id: "ann-001", current_state: "Solicitada" },
      ]);
      // Mock: audit insert succeeds
      mockQuery.mockResolvedValueOnce([]);

      const response = await callTransition(
        {
          targetState: "En_Revision",
          justification: "Intern attempting to move request to review",
        },
        "INTERN_READONLY",
        "intern@vanti.com.co"
      );
      const body = await response.json();

      expect(response.status).toBe(403);
      expect(body.error.code).toBe("FORBIDDEN");
      expect(body.error.message).toContain("INTERN_READONLY");
      expect(body.error.currentState).toBe("Solicitada");
      expect(body.error.targetState).toBe("En_Revision");
    });

    it("state remains unchanged after INTERN_READONLY denied attempt", async () => {
      // Mock: DB returns current state "Solicitada"
      mockQuery.mockResolvedValueOnce([
        { id: "ann-001", current_state: "Solicitada" },
      ]);
      // Mock: audit insert succeeds
      mockQuery.mockResolvedValueOnce([]);

      await callTransition(
        {
          targetState: "En_Revision",
          justification: "Intern attempting unauthorized state change",
        },
        "INTERN_READONLY",
        "intern@vanti.com.co"
      );

      // Verify the UPDATE query was NOT called (state preserved)
      const updateCalls = mockQuery.mock.calls.filter(
        (call) =>
          typeof call[0] === "string" &&
          call[0].includes("UPDATE cancellation_requests")
      );
      expect(updateCalls).toHaveLength(0);
    });

    it("audit_events contains DENY record after INTERN_READONLY attempt", async () => {
      // Mock: DB returns current state "Solicitada"
      mockQuery.mockResolvedValueOnce([
        { id: "ann-001", current_state: "Solicitada" },
      ]);
      // Mock: audit insert succeeds
      mockQuery.mockResolvedValueOnce([]);

      await callTransition(
        {
          targetState: "En_Revision",
          justification: "Intern attempting unauthorized state change",
        },
        "INTERN_READONLY",
        "intern@vanti.com.co"
      );

      // Verify audit event was logged with denial details
      const auditCalls = mockQuery.mock.calls.filter(
        (call) =>
          typeof call[0] === "string" &&
          call[0].includes("INSERT INTO audit_events")
      );
      expect(auditCalls).toHaveLength(1);

      const auditCall = auditCalls[0];
      expect(auditCall[0]).toContain("TRANSITION_DENIED");
      // Verify the parameters contain the denial info
      expect(auditCall[1]).toContain("intern@vanti.com.co"); // user_id
      expect(auditCall[1]).toContain("ann-001"); // resource_id

      // Verify the details JSON contains role and failure result
      const detailsJson = auditCall[1][2]; // third param is the JSON details
      const details = JSON.parse(detailsJson);
      expect(details.role).toBe("INTERN_READONLY");
      expect(details.reason).toContain("Unauthorized");
      expect(details.currentState).toBe("Solicitada");
      expect(details.targetState).toBe("En_Revision");

      // Verify result is 'failure' (DENY)
      expect(auditCall[0]).toContain("failure");
    });
  });

  describe("CONTRACTOR_OPERATOR cannot approve cancellation → HTTP 403", () => {
    it("returns 403 when CONTRACTOR_OPERATOR tries En_Revision → Aprobada", async () => {
      // Mock: DB returns current state "En_Revision"
      mockQuery.mockResolvedValueOnce([
        { id: "ann-001", current_state: "En_Revision" },
      ]);
      // Mock: audit insert succeeds
      mockQuery.mockResolvedValueOnce([]);

      const response = await callTransition(
        {
          targetState: "Aprobada",
          justification: "Contractor attempting to approve cancellation",
        },
        "CONTRACTOR_OPERATOR",
        "contractor@partner.com"
      );
      const body = await response.json();

      expect(response.status).toBe(403);
      expect(body.error.code).toBe("FORBIDDEN");
      expect(body.error.message).toContain("CONTRACTOR_OPERATOR");
      expect(body.error.currentState).toBe("En_Revision");
      expect(body.error.targetState).toBe("Aprobada");
      expect(body.error.authorizedRoles).toContain("LEGAL_APPROVER");
      expect(body.error.authorizedRoles).toContain("VP_APPROVER");
    });

    it("state remains unchanged after CONTRACTOR_OPERATOR denied attempt", async () => {
      // Mock: DB returns current state "En_Revision"
      mockQuery.mockResolvedValueOnce([
        { id: "ann-001", current_state: "En_Revision" },
      ]);
      // Mock: audit insert succeeds
      mockQuery.mockResolvedValueOnce([]);

      await callTransition(
        {
          targetState: "Aprobada",
          justification: "Contractor attempting unauthorized approval",
        },
        "CONTRACTOR_OPERATOR",
        "contractor@partner.com"
      );

      // Verify the UPDATE query was NOT called (state preserved)
      const updateCalls = mockQuery.mock.calls.filter(
        (call) =>
          typeof call[0] === "string" &&
          call[0].includes("UPDATE cancellation_requests")
      );
      expect(updateCalls).toHaveLength(0);
    });

    it("audit_events contains DENY record after CONTRACTOR_OPERATOR attempt", async () => {
      // Mock: DB returns current state "En_Revision"
      mockQuery.mockResolvedValueOnce([
        { id: "ann-001", current_state: "En_Revision" },
      ]);
      // Mock: audit insert succeeds
      mockQuery.mockResolvedValueOnce([]);

      await callTransition(
        {
          targetState: "Aprobada",
          justification: "Contractor attempting unauthorized approval",
        },
        "CONTRACTOR_OPERATOR",
        "contractor@partner.com"
      );

      // Verify audit event was logged with denial details
      const auditCalls = mockQuery.mock.calls.filter(
        (call) =>
          typeof call[0] === "string" &&
          call[0].includes("INSERT INTO audit_events")
      );
      expect(auditCalls).toHaveLength(1);

      const auditCall = auditCalls[0];
      expect(auditCall[0]).toContain("TRANSITION_DENIED");
      expect(auditCall[1]).toContain("contractor@partner.com"); // user_id
      expect(auditCall[1]).toContain("ann-001"); // resource_id

      // Verify details JSON
      const detailsJson = auditCall[1][2];
      const details = JSON.parse(detailsJson);
      expect(details.role).toBe("CONTRACTOR_OPERATOR");
      expect(details.reason).toContain("Unauthorized");
      expect(details.currentState).toBe("En_Revision");
      expect(details.targetState).toBe("Aprobada");

      // Verify result is 'failure' (DENY)
      expect(auditCall[0]).toContain("failure");
    });
  });
});
