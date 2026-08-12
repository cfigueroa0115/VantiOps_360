import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockQuery = vi.hoisted(() => vi.fn());
vi.mock("@/lib/server/database", () => ({ query: mockQuery }));

import { POST } from "@/app/api/approvals/route";

function createRequest(body: Record<string, unknown>, role = "SYSTEM_ADMIN", userId = "admin@vanti.com.co"): NextRequest {
  return new NextRequest("http://localhost:3000/api/approvals", {
    method: "POST",
    headers: { "x-user-role": role, "x-user-id": userId, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PARTNER_ONBOARDING approvals", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns 400 when partnerId is missing for PARTNER_ONBOARDING", async () => {
    const req = createRequest({
      action: "request",
      operation: "PARTNER_ONBOARDING",
      approverRole: "LEGAL_APPROVER",
      justification: "New partner onboarding request for evaluation",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.message).toContain("partnerId");
  });

  it("returns 400 when partnerId does not exist", async () => {
    // Mock: partner check returns empty
    mockQuery.mockResolvedValueOnce([]);

    const req = createRequest({
      action: "request",
      operation: "PARTNER_ONBOARDING",
      approverRole: "LEGAL_APPROVER",
      justification: "New partner onboarding request for evaluation",
      partnerId: "nonexistent-uuid",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.message).toContain("Partner not found");
  });

  it("creates application linked to the specific partnerId", async () => {
    const partnerId = "real-partner-uuid-123";
    // Mock: partner exists
    mockQuery.mockResolvedValueOnce([{ id: partnerId }]);
    // Mock: partner_applications insert
    mockQuery.mockResolvedValueOnce([{ id: "app-001" }]);
    // Mock: Legal step insert
    mockQuery.mockResolvedValueOnce([{ id: "step-legal", created_at: "2025-01-01T00:00:00Z", expires_at: "2025-01-04T00:00:00Z" }]);
    // Mock: VP step insert
    mockQuery.mockResolvedValueOnce([]);
    // Mock: approval_event
    mockQuery.mockResolvedValueOnce([]);
    // Mock: audit_event
    mockQuery.mockResolvedValueOnce([]);

    const req = createRequest({
      action: "request",
      operation: "PARTNER_ONBOARDING",
      approverRole: "LEGAL_APPROVER",
      justification: "Onboarding partner for gas services contract",
      partnerId,
    });
    const res = await POST(req);
    expect(res.status).toBe(201);

    // Verify the partner_applications INSERT used the correct partnerId
    const appInsertCall = mockQuery.mock.calls[1];
    expect(appInsertCall[1]).toContain(partnerId);
  });

  it("creates Legal step_order=1 and VP step_order=2 for PARTNER_ONBOARDING", async () => {
    const partnerId = "partner-seq-test";
    mockQuery.mockResolvedValueOnce([{ id: partnerId }]);
    mockQuery.mockResolvedValueOnce([{ id: "app-002" }]);
    mockQuery.mockResolvedValueOnce([{ id: "step-l", created_at: "2025-01-01T00:00:00Z", expires_at: "2025-01-04T00:00:00Z" }]);
    mockQuery.mockResolvedValueOnce([]);
    mockQuery.mockResolvedValueOnce([]);
    mockQuery.mockResolvedValueOnce([]);

    const req = createRequest({
      action: "request",
      operation: "PARTNER_ONBOARDING",
      approverRole: "LEGAL_APPROVER",
      justification: "Sequential approval test for onboarding",
      partnerId,
    });
    await POST(req);

    // Legal step (call index 2): step_order=1, LEGAL_APPROVER
    const legalCall = mockQuery.mock.calls[2];
    expect(legalCall[0]).toContain("step_order");
    expect(legalCall[0]).toContain("LEGAL_APPROVER");
    expect(legalCall[1]).toContain("app-002");

    // VP step (call index 3): step_order=2, VP_APPROVER
    const vpCall = mockQuery.mock.calls[3];
    expect(vpCall[0]).toContain("VP_APPROVER");
  });

  it("VP cannot approve before Legal (SEQUENTIAL_VIOLATION)", async () => {
    // Mock: step query returns VP step
    mockQuery.mockResolvedValueOnce([{
      id: "vp-step",
      approver_role: "VP_APPROVER",
      status: "pending",
      expires_at: new Date(Date.now() + 86400000).toISOString(),
      application_type: "PARTNER_ONBOARDING",
    }]);
    // Mock: sequential check returns Legal step still pending
    mockQuery.mockResolvedValueOnce([{ status: "pending" }]);

    const req = createRequest({
      action: "approve",
      approvalId: "vp-step",
      justification: "Attempting VP approval before Legal",
    }, "VP_APPROVER", "vp@vanti.com.co");

    const res = await POST(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("SEQUENTIAL_VIOLATION");
  });

  it("VP can approve after Legal is approved", async () => {
    // Mock: step query returns VP step
    mockQuery.mockResolvedValueOnce([{
      id: "vp-step-ok",
      approver_role: "VP_APPROVER",
      status: "pending",
      expires_at: new Date(Date.now() + 86400000).toISOString(),
      application_type: "PARTNER_ONBOARDING",
    }]);
    // Mock: sequential check returns Legal already approved
    mockQuery.mockResolvedValueOnce([{ status: "approved" }]);
    // Mock: UPDATE approval_steps
    mockQuery.mockResolvedValueOnce([]);
    // Mock: INSERT approval_event
    mockQuery.mockResolvedValueOnce([]);
    // Mock: INSERT audit_event
    mockQuery.mockResolvedValueOnce([]);

    const req = createRequest({
      action: "approve",
      approvalId: "vp-step-ok",
      justification: "VP approves after Legal confirmation",
    }, "VP_APPROVER", "vp@vanti.com.co");

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.status).toBe("approved");
  });

  it("non-PARTNER_ONBOARDING does not require partnerId", async () => {
    // Mock: partner fallback
    mockQuery.mockResolvedValueOnce([{ id: "fallback-partner" }]);
    // Mock: partner_applications insert
    mockQuery.mockResolvedValueOnce([{ id: "app-gen" }]);
    // Mock: approval_step insert
    mockQuery.mockResolvedValueOnce([{ id: "step-gen", created_at: "2025-01-01T00:00:00Z", expires_at: "2025-01-04T00:00:00Z" }]);
    // Mock: approval_event
    mockQuery.mockResolvedValueOnce([]);
    // Mock: audit_event
    mockQuery.mockResolvedValueOnce([]);

    const req = createRequest({
      action: "request",
      operation: "DATA_DELETION",
      approverRole: "LEGAL_APPROVER",
      justification: "Delete expired data per retention policy",
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
  });
});
