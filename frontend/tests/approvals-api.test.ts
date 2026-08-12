import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Mock the database query function
const mockQuery = vi.hoisted(() => vi.fn());
vi.mock("@/lib/server/database", () => ({
  query: mockQuery,
}));

import { GET, POST } from "@/app/api/approvals/route";

/**
 * Unit tests for the /api/approvals route handler.
 *
 * Requirements: 15.1, 15.2, 15.3, 15.4
 *
 * Tests cover:
 *   - RBAC: only SYSTEM_ADMIN, LEGAL_APPROVER, VP_APPROVER can access
 *   - GET: list pending approvals with filters and pagination
 *   - POST (request): create new approval request with validation
 *   - POST (approve/reject): approve or reject with role and expiration checks
 *   - 72-hour expiration auto-invalidation
 *   - Justification minimum 10 characters
 *   - Operation type validation (4 categories)
 */

function createRequest(
  method: "GET" | "POST",
  options: {
    role?: string;
    userId?: string;
    searchParams?: Record<string, string>;
    body?: Record<string, unknown>;
  } = {}
): NextRequest {
  const url = new URL("http://localhost:3000/api/approvals");
  if (options.searchParams) {
    for (const [key, value] of Object.entries(options.searchParams)) {
      url.searchParams.set(key, value);
    }
  }

  const headers = new Headers();
  if (options.role) headers.set("x-user-role", options.role);
  if (options.userId) headers.set("x-user-id", options.userId);

  const init: RequestInit = { method, headers };
  if (method === "POST" && options.body) {
    init.body = JSON.stringify(options.body);
  }

  return new NextRequest(url, init as any);
}

describe("GET /api/approvals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 403 for unauthorized roles", async () => {
    const request = createRequest("GET", { role: "INTERN_READONLY" });
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error.code).toBe("FORBIDDEN");
  });

  it("returns 403 when no role is provided", async () => {
    const request = createRequest("GET", {});
    const response = await GET(request);

    expect(response.status).toBe(403);
  });

  it("returns 403 for ANALYST role", async () => {
    const request = createRequest("GET", { role: "ANALYST" });
    const response = await GET(request);

    expect(response.status).toBe(403);
  });

  it("returns 200 with data for SYSTEM_ADMIN", async () => {
    // Mock auto-expire query
    mockQuery.mockResolvedValueOnce([]);
    // Mock count query
    mockQuery.mockResolvedValueOnce([{ count: "1" }]);
    // Mock data query
    mockQuery.mockResolvedValueOnce([
      {
        id: "step-001",
        operation: "DATA_DELETION",
        requester_id: "admin-001",
        approver_role: "LEGAL_APPROVER",
        justification: "Removing old PII records",
        status: "pending",
        approved_by: null,
        approved_at: null,
        expires_at: "2025-01-20T10:00:00Z",
        created_at: "2025-01-17T10:00:00Z",
      },
    ]);

    const request = createRequest("GET", { role: "SYSTEM_ADMIN" });
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe("step-001");
    expect(body.data[0].operation).toBe("DATA_DELETION");
    expect(body.data[0].approverRole).toBe("LEGAL_APPROVER");
    expect(body.data[0].status).toBe("pending");
    expect(body.total).toBe(1);
    expect(body.page).toBe(1);
    expect(body.pageSize).toBe(50);
  });

  it("returns 200 for LEGAL_APPROVER", async () => {
    mockQuery.mockResolvedValueOnce([]);
    mockQuery.mockResolvedValueOnce([{ count: "0" }]);
    mockQuery.mockResolvedValueOnce([]);

    const request = createRequest("GET", { role: "LEGAL_APPROVER" });
    const response = await GET(request);

    expect(response.status).toBe(200);
  });

  it("returns 200 for VP_APPROVER", async () => {
    mockQuery.mockResolvedValueOnce([]);
    mockQuery.mockResolvedValueOnce([{ count: "0" }]);
    mockQuery.mockResolvedValueOnce([]);

    const request = createRequest("GET", { role: "VP_APPROVER" });
    const response = await GET(request);

    expect(response.status).toBe(200);
  });

  it("applies pagination parameters", async () => {
    mockQuery.mockResolvedValueOnce([]);
    mockQuery.mockResolvedValueOnce([{ count: "5" }]);
    mockQuery.mockResolvedValueOnce([]);

    const request = createRequest("GET", {
      role: "SYSTEM_ADMIN",
      searchParams: { page: "2", page_size: "10" },
    });
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.page).toBe(2);
    expect(body.pageSize).toBe(10);
  });

  it("returns 400 for invalid page parameter", async () => {
    const request = createRequest("GET", {
      role: "SYSTEM_ADMIN",
      searchParams: { page: "-1" },
    });

    // The auto-expire query still runs first
    mockQuery.mockResolvedValueOnce([]);

    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("caps page_size at 200", async () => {
    mockQuery.mockResolvedValueOnce([]);
    mockQuery.mockResolvedValueOnce([{ count: "0" }]);
    mockQuery.mockResolvedValueOnce([]);

    const request = createRequest("GET", {
      role: "SYSTEM_ADMIN",
      searchParams: { page_size: "500" },
    });
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.pageSize).toBe(200);
  });

  it("handles DB errors gracefully with 500", async () => {
    mockQuery.mockResolvedValueOnce([]);
    mockQuery.mockRejectedValueOnce(new Error("Connection refused"));

    const request = createRequest("GET", { role: "SYSTEM_ADMIN" });
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error.code).toBe("INTERNAL_ERROR");
  });
});

describe("POST /api/approvals - Create Request", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 403 for unauthorized roles", async () => {
    const request = createRequest("POST", {
      role: "CONTRACTOR_OPERATOR",
      body: {
        action: "request",
        operation: "DATA_DELETION",
        approverRole: "LEGAL_APPROVER",
        justification: "Removing old records from system",
      },
    });
    const response = await POST(request);

    expect(response.status).toBe(403);
  });

  it("returns 400 for invalid operation type", async () => {
    const request = createRequest("POST", {
      role: "SYSTEM_ADMIN",
      userId: "admin@vanti.com.co",
      body: {
        action: "request",
        operation: "INVALID_OP",
        approverRole: "VP_APPROVER",
        justification: "This should fail due to invalid operation",
      },
    });
    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 when approver role does not match operation", async () => {
    // PRODUCTION_MIGRATION requires VP_APPROVER, not LEGAL_APPROVER
    const request = createRequest("POST", {
      role: "SYSTEM_ADMIN",
      userId: "admin@vanti.com.co",
      body: {
        action: "request",
        operation: "PRODUCTION_MIGRATION",
        approverRole: "LEGAL_APPROVER",
        justification: "Deploy release to production environment now",
      },
    });
    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 when justification is too short (< 10 chars)", async () => {
    const request = createRequest("POST", {
      role: "SYSTEM_ADMIN",
      userId: "admin@vanti.com.co",
      body: {
        action: "request",
        operation: "DATA_DELETION",
        approverRole: "LEGAL_APPROVER",
        justification: "short",
      },
    });
    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.message).toContain("10 characters");
  });

  it("returns 201 for a valid approval request", async () => {
    // Mock partner fallback query
    mockQuery.mockResolvedValueOnce([{ id: "p-fallback" }]);
    // Mock creating partner_application
    mockQuery.mockResolvedValueOnce([{ id: "app-001" }]);
    // Mock creating approval_step
    mockQuery.mockResolvedValueOnce([
      {
        id: "step-001",
        created_at: "2025-01-17T10:00:00Z",
        expires_at: "2025-01-20T10:00:00Z",
      },
    ]);
    // Mock approval_event insert
    mockQuery.mockResolvedValueOnce([]);
    // Mock audit_event insert
    mockQuery.mockResolvedValueOnce([]);

    const request = createRequest("POST", {
      role: "SYSTEM_ADMIN",
      userId: "admin@vanti.com.co",
      body: {
        action: "request",
        operation: "DATA_DELETION",
        approverRole: "LEGAL_APPROVER",
        justification: "Removing expired PII data per retention policy",
      },
    });
    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.data.id).toBe("step-001");
    expect(body.data.operation).toBe("DATA_DELETION");
    expect(body.data.approverRole).toBe("LEGAL_APPROVER");
    expect(body.data.status).toBe("pending");
    expect(body.message).toContain("successfully");
  });

  it("returns 400 for invalid action", async () => {
    const request = createRequest("POST", {
      role: "SYSTEM_ADMIN",
      userId: "admin@vanti.com.co",
      body: {
        action: "invalid_action",
      },
    });
    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 for invalid JSON body", async () => {
    const url = new URL("http://localhost:3000/api/approvals");
    const headers = new Headers();
    headers.set("x-user-role", "SYSTEM_ADMIN");
    headers.set("x-user-id", "admin@vanti.com.co");

    const req = new NextRequest(url, {
      method: "POST",
      headers,
      body: "not json",
    });
    const response = await POST(req);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("POST /api/approvals - Approve/Reject", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when approvalId is missing", async () => {
    const request = createRequest("POST", {
      role: "LEGAL_APPROVER",
      userId: "legal@vanti.com.co",
      body: {
        action: "approve",
        justification: "Reviewed and approved this request properly",
      },
    });
    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.message).toContain("approvalId");
  });

  it("returns 400 when justification is too short for approve", async () => {
    const request = createRequest("POST", {
      role: "LEGAL_APPROVER",
      userId: "legal@vanti.com.co",
      body: {
        action: "approve",
        approvalId: "step-001",
        justification: "ok",
      },
    });
    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 404 when approval step does not exist", async () => {
    mockQuery.mockResolvedValueOnce([]); // empty result for step lookup

    const request = createRequest("POST", {
      role: "LEGAL_APPROVER",
      userId: "legal@vanti.com.co",
      body: {
        action: "approve",
        approvalId: "nonexistent-id",
        justification: "Reviewed and approved this request properly",
      },
    });
    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("returns 400 when approval is not pending", async () => {
    mockQuery.mockResolvedValueOnce([
      {
        id: "step-001",
        approver_role: "LEGAL_APPROVER",
        status: "approved",
        expires_at: new Date(Date.now() + 3600000).toISOString(),
        application_type: "DATA_DELETION",
      },
    ]);

    const request = createRequest("POST", {
      role: "LEGAL_APPROVER",
      userId: "legal@vanti.com.co",
      body: {
        action: "approve",
        approvalId: "step-001",
        justification: "Trying to approve an already approved request",
      },
    });
    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("INVALID_STATUS");
  });

  it("returns 410 when approval has expired (REQ-15.4)", async () => {
    const expiredTime = new Date(Date.now() - 3600000).toISOString(); // 1 hour ago
    mockQuery.mockResolvedValueOnce([
      {
        id: "step-001",
        approver_role: "LEGAL_APPROVER",
        status: "pending",
        expires_at: expiredTime,
        application_type: "DATA_DELETION",
      },
    ]);
    // Mock the UPDATE to expire
    mockQuery.mockResolvedValueOnce([]);
    // Mock the approval_events insert
    mockQuery.mockResolvedValueOnce([]);

    const request = createRequest("POST", {
      role: "LEGAL_APPROVER",
      userId: "legal@vanti.com.co",
      body: {
        action: "approve",
        approvalId: "step-001",
        justification: "Trying to approve an expired request now",
      },
    });
    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(410);
    expect(body.error.code).toBe("EXPIRED");
    expect(body.error.message).toContain("72-hour");
  });

  it("returns 403 when approver role does not match step role", async () => {
    const futureTime = new Date(Date.now() + 86400000).toISOString();
    mockQuery.mockResolvedValueOnce([
      {
        id: "step-001",
        approver_role: "LEGAL_APPROVER",
        status: "pending",
        expires_at: futureTime,
        application_type: "DATA_DELETION",
      },
    ]);

    const request = createRequest("POST", {
      role: "VP_APPROVER", // Wrong role for this step
      userId: "vp@vanti.com.co",
      body: {
        action: "approve",
        approvalId: "step-001",
        justification: "Trying to approve with wrong role for this",
      },
    });
    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error.code).toBe("ROLE_MISMATCH");
  });

  it("successfully approves a pending request with correct role", async () => {
    const futureTime = new Date(Date.now() + 86400000).toISOString();
    // Fetch step
    mockQuery.mockResolvedValueOnce([
      {
        id: "step-001",
        approver_role: "LEGAL_APPROVER",
        status: "pending",
        expires_at: futureTime,
        application_type: "DATA_DELETION",
      },
    ]);
    // Update step
    mockQuery.mockResolvedValueOnce([]);
    // Insert approval_event
    mockQuery.mockResolvedValueOnce([]);
    // Insert audit_event
    mockQuery.mockResolvedValueOnce([]);

    const request = createRequest("POST", {
      role: "LEGAL_APPROVER",
      userId: "legal@vanti.com.co",
      body: {
        action: "approve",
        approvalId: "step-001",
        justification: "Reviewed compliance requirements and approved",
      },
    });
    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.id).toBe("step-001");
    expect(body.data.status).toBe("approved");
    expect(body.data.approvedBy).toBe("legal@vanti.com.co");
    expect(body.message).toContain("approved");
  });

  it("SYSTEM_ADMIN can approve any step regardless of approver_role", async () => {
    const futureTime = new Date(Date.now() + 86400000).toISOString();
    mockQuery.mockResolvedValueOnce([
      {
        id: "step-002",
        approver_role: "LEGAL_APPROVER",
        status: "pending",
        expires_at: futureTime,
        application_type: "SECURITY_CONFIG_CHANGE",
      },
    ]);
    mockQuery.mockResolvedValueOnce([]);
    mockQuery.mockResolvedValueOnce([]);
    mockQuery.mockResolvedValueOnce([]);

    const request = createRequest("POST", {
      role: "SYSTEM_ADMIN",
      userId: "admin@vanti.com.co",
      body: {
        action: "approve",
        approvalId: "step-002",
        justification: "Admin override: approved for emergency deployment",
      },
    });
    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.status).toBe("approved");
  });

  it("successfully rejects a pending request", async () => {
    const futureTime = new Date(Date.now() + 86400000).toISOString();
    mockQuery.mockResolvedValueOnce([
      {
        id: "step-001",
        approver_role: "VP_APPROVER",
        status: "pending",
        expires_at: futureTime,
        application_type: "PRODUCTION_MIGRATION",
      },
    ]);
    mockQuery.mockResolvedValueOnce([]);
    mockQuery.mockResolvedValueOnce([]);
    mockQuery.mockResolvedValueOnce([]);

    const request = createRequest("POST", {
      role: "VP_APPROVER",
      userId: "vp@vanti.com.co",
      body: {
        action: "reject",
        approvalId: "step-001",
        justification: "Not ready for production, needs more testing first",
      },
    });
    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.status).toBe("rejected");
    expect(body.message).toContain("rejected");
  });
});
