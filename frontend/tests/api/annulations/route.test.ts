import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Mock the database module
vi.mock("@/lib/server/database", () => ({
  query: vi.fn(),
}));

// Mock partner email validator
vi.mock("@/lib/server/partner-email-validator", () => ({
  validatePartnerEmail: vi.fn().mockResolvedValue({ authorized: true, partnerId: "p-1", partnerName: "Test" }),
  logPartnerEmailDenied: vi.fn().mockResolvedValue(undefined),
}));

import { GET, POST } from "@/app/api/annulations/route";
import { query } from "@/lib/server/database";

const mockedQuery = vi.mocked(query);

function createRequest(
  url: string,
  options: { method?: string; headers?: Record<string, string>; body?: unknown } = {}
): NextRequest {
  const { method = "GET", headers = {}, body } = options;
  const init: RequestInit = {
    method,
    headers: {
      "content-type": "application/json",
      ...headers,
    },
  };
  if (body) {
    init.body = JSON.stringify(body);
  }
  return new NextRequest(new URL(url, "http://localhost:3000"), init as any);
}

describe("GET /api/annulations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 403 for unauthorized role", async () => {
    const req = createRequest("/api/annulations", {
      headers: { "x-user-role": "INTERN_READONLY" },
    });

    const res = await GET(req);
    expect(res.status).toBe(403);

    const json = await res.json();
    expect(json.error.code).toBe("FORBIDDEN");
  });

  it("returns 403 when no role header is provided", async () => {
    const req = createRequest("/api/annulations");

    const res = await GET(req);
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid page parameter", async () => {
    const req = createRequest("/api/annulations?page=abc", {
      headers: { "x-user-role": "SYSTEM_ADMIN" },
    });

    const res = await GET(req);
    expect(res.status).toBe(400);

    const json = await res.json();
    expect(json.error.code).toBe("VALIDATION_ERROR");
    expect(json.error.message).toContain("page");
  });

  it("returns 400 for invalid page_size parameter", async () => {
    const req = createRequest("/api/annulations?page_size=abc", {
      headers: { "x-user-role": "SYSTEM_ADMIN" },
    });

    const res = await GET(req);
    expect(res.status).toBe(400);

    const json = await res.json();
    expect(json.error.code).toBe("VALIDATION_ERROR");
    expect(json.error.message).toContain("page_size");
  });

  it("returns 400 for invalid status filter", async () => {
    const req = createRequest("/api/annulations?status=InvalidState", {
      headers: { "x-user-role": "SYSTEM_ADMIN" },
    });

    const res = await GET(req);
    expect(res.status).toBe(400);

    const json = await res.json();
    expect(json.error.code).toBe("VALIDATION_ERROR");
    expect(json.error.message).toContain("Invalid status filter");
  });

  it("returns paginated results for authorized role", async () => {
    mockedQuery
      .mockResolvedValueOnce([{ count: "2" }] as never)
      .mockResolvedValueOnce([
        {
          id: "uuid-1",
          radicado: "ANU-001",
          pqr_id: "pqr-1",
          current_state: "Solicitada",
          requested_by: "user-1",
          justification: "Valid justification for cancellation",
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
        },
        {
          id: "uuid-2",
          radicado: "ANU-002",
          pqr_id: "pqr-2",
          current_state: "En_Revision",
          requested_by: "user-2",
          justification: "Another valid justification text",
          created_at: "2024-01-02T00:00:00Z",
          updated_at: "2024-01-02T00:00:00Z",
        },
      ] as never);

    const req = createRequest("/api/annulations?page=1&page_size=50", {
      headers: { "x-user-role": "OPERATIONS_LEAD" },
    });

    const res = await GET(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.data).toHaveLength(2);
    expect(json.total).toBe(2);
    expect(json.page).toBe(1);
    expect(json.pageSize).toBe(50);
    expect(json.data[0].currentState).toBe("Solicitada");
    expect(json.data[1].currentState).toBe("En_Revision");
  });

  it("applies status filter in query", async () => {
    mockedQuery
      .mockResolvedValueOnce([{ count: "1" }] as never)
      .mockResolvedValueOnce([
        {
          id: "uuid-1",
          radicado: "ANU-001",
          pqr_id: "pqr-1",
          current_state: "Solicitada",
          requested_by: "user-1",
          justification: "Valid justification for cancellation",
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
        },
      ] as never);

    const req = createRequest("/api/annulations?status=Solicitada", {
      headers: { "x-user-role": "ANALYST" },
    });

    const res = await GET(req);
    expect(res.status).toBe(200);

    // Verify the SQL includes the status condition
    expect(mockedQuery).toHaveBeenCalledTimes(2);
    const countCall = mockedQuery.mock.calls[0];
    expect(countCall[0]).toContain("cr.current_state = $1");
    expect(countCall[1]).toContain("Solicitada");
  });

  it("applies requester filter in query", async () => {
    mockedQuery
      .mockResolvedValueOnce([{ count: "1" }] as never)
      .mockResolvedValueOnce([
        {
          id: "uuid-1",
          radicado: "ANU-001",
          pqr_id: "pqr-1",
          current_state: "Solicitada",
          requested_by: "user-1",
          justification: "Valid justification for cancellation",
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
        },
      ] as never);

    const req = createRequest("/api/annulations?requester=user@vanti.com.co", {
      headers: { "x-user-role": "SYSTEM_ADMIN" },
    });

    const res = await GET(req);
    expect(res.status).toBe(200);

    // Verify the SQL includes the requester condition
    expect(mockedQuery).toHaveBeenCalledTimes(2);
    const countCall = mockedQuery.mock.calls[0];
    expect(countCall[0]).toContain("requested_by");
    expect(countCall[1]).toContain("user@vanti.com.co");
  });

  it("caps page_size at 200", async () => {
    mockedQuery
      .mockResolvedValueOnce([{ count: "0" }] as never)
      .mockResolvedValueOnce([] as never);

    const req = createRequest("/api/annulations?page_size=500", {
      headers: { "x-user-role": "SYSTEM_ADMIN" },
    });

    const res = await GET(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.pageSize).toBe(200);
  });

  it("returns 500 on database error", async () => {
    mockedQuery.mockRejectedValueOnce(new Error("Connection failed"));

    const req = createRequest("/api/annulations", {
      headers: { "x-user-role": "SYSTEM_ADMIN" },
    });

    const res = await GET(req);
    expect(res.status).toBe(500);

    const json = await res.json();
    expect(json.error.code).toBe("INTERNAL_ERROR");
  });

  it("allows all authorized roles to list annulations", async () => {
    const authorizedRoles = [
      "SYSTEM_ADMIN",
      "OPERATIONS_LEAD",
      "ANALYST",
      "LEGAL_APPROVER",
      "VP_APPROVER",
      "BUSINESS_OWNER",
      "AUDITOR",
      "PARTNER_OPERATOR",
    ];

    for (const role of authorizedRoles) {
      vi.clearAllMocks();
      mockedQuery
        .mockResolvedValueOnce([{ count: "0" }] as never)
        .mockResolvedValueOnce([] as never);

      const req = createRequest("/api/annulations", {
        headers: { "x-user-role": role },
      });

      const res = await GET(req);
      expect(res.status).toBe(200);
    }
  });
});

describe("POST /api/annulations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 403 for unauthorized role", async () => {
    const req = createRequest("/api/annulations", {
      method: "POST",
      headers: { "x-user-role": "INTERN_READONLY", "x-user-id": "user@test.com" },
      body: { partnerId: "p-1", senderEmail: "test@partner.co", pqrId: "pqr-1", justification: "Valid justification for this request" },
    });

    const res = await POST(req);
    expect(res.status).toBe(403);

    const json = await res.json();
    expect(json.error.code).toBe("FORBIDDEN");
  });

  it("returns 403 for ANALYST role (cannot create)", async () => {
    const req = createRequest("/api/annulations", {
      method: "POST",
      headers: { "x-user-role": "ANALYST", "x-user-id": "user@test.com" },
      body: { partnerId: "p-1", senderEmail: "test@partner.co", pqrId: "pqr-1", justification: "Valid justification for this request" },
    });

    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it("returns 400 for missing pqrId", async () => {
    const req = createRequest("/api/annulations", {
      method: "POST",
      headers: { "x-user-role": "SYSTEM_ADMIN", "x-user-id": "admin@vanti.com.co" },
      body: { partnerId: "p-1", senderEmail: "test@partner.co", justification: "Valid justification for this request" },
    });

    const res = await POST(req);
    expect(res.status).toBe(400);

    const json = await res.json();
    expect(json.error.code).toBe("VALIDATION_ERROR");
    expect(json.error.message).toContain("pqrId");
  });

  it("returns 400 for missing justification", async () => {
    const req = createRequest("/api/annulations", {
      method: "POST",
      headers: { "x-user-role": "SYSTEM_ADMIN", "x-user-id": "admin@vanti.com.co" },
      body: { partnerId: "p-1", senderEmail: "test@partner.co", pqrId: "pqr-1" },
    });

    const res = await POST(req);
    expect(res.status).toBe(400);

    const json = await res.json();
    expect(json.error.code).toBe("VALIDATION_ERROR");
    expect(json.error.message).toContain("Justification");
  });

  it("returns 400 for justification shorter than 10 characters", async () => {
    const req = createRequest("/api/annulations", {
      method: "POST",
      headers: { "x-user-role": "SYSTEM_ADMIN", "x-user-id": "admin@vanti.com.co" },
      body: { partnerId: "p-1", senderEmail: "test@partner.co", pqrId: "pqr-1", justification: "short" },
    });

    const res = await POST(req);
    expect(res.status).toBe(400);

    const json = await res.json();
    expect(json.error.code).toBe("VALIDATION_ERROR");
    expect(json.error.message).toContain("at least 10 characters");
    expect(json.error.message).toContain("Received 5 characters");
  });

  it("returns 400 for justification of exactly 9 characters", async () => {
    const req = createRequest("/api/annulations", {
      method: "POST",
      headers: { "x-user-role": "BUSINESS_OWNER", "x-user-id": "owner@vanti.com.co" },
      body: { partnerId: "p-1", senderEmail: "test@partner.co", pqrId: "pqr-1", justification: "123456789" },
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid JSON body", async () => {
    const req = new NextRequest(new URL("/api/annulations", "http://localhost:3000"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-user-role": "SYSTEM_ADMIN",
        "x-user-id": "admin@vanti.com.co",
      },
      body: "invalid-json{",
    });

    const res = await POST(req);
    expect(res.status).toBe(400);

    const json = await res.json();
    expect(json.error.code).toBe("VALIDATION_ERROR");
    expect(json.error.message).toContain("Invalid JSON");
  });

  it("creates cancellation request with valid input (SYSTEM_ADMIN)", async () => {
    mockedQuery
      .mockResolvedValueOnce([
        {
          id: "uuid-new",
          radicado: "ANU-123456-ABCDEF",
          pqr_id: "pqr-1",
          current_state: "Solicitada",
          created_at: "2024-01-15T10:00:00Z",
        },
      ] as never)
      .mockResolvedValueOnce([] as never); // audit log insert

    const req = createRequest("/api/annulations", {
      method: "POST",
      headers: { "x-user-role": "SYSTEM_ADMIN", "x-user-id": "admin@vanti.com.co" },
      body: { partnerId: "p-1", senderEmail: "test@partner.co", pqrId: "pqr-1", justification: "Valid justification for this cancellation request" },
    });

    const res = await POST(req);
    expect(res.status).toBe(201);

    const json = await res.json();
    expect(json.data.id).toBe("uuid-new");
    expect(json.data.pqrId).toBe("pqr-1");
    expect(json.data.currentState).toBe("Solicitada");
    expect(json.message).toContain("created successfully");
  });

  it("creates cancellation request with valid input (BUSINESS_OWNER)", async () => {
    mockedQuery
      .mockResolvedValueOnce([
        {
          id: "uuid-new-2",
          radicado: "ANU-789012-GHIJKL",
          pqr_id: "pqr-2",
          current_state: "Solicitada",
          created_at: "2024-01-15T11:00:00Z",
        },
      ] as never)
      .mockResolvedValueOnce([] as never); // audit log insert

    const req = createRequest("/api/annulations", {
      method: "POST",
      headers: { "x-user-role": "BUSINESS_OWNER", "x-user-id": "owner@vanti.com.co" },
      body: { partnerId: "p-1", senderEmail: "test@partner.co", pqrId: "pqr-2", justification: "Business reason for cancellation" },
    });

    const res = await POST(req);
    expect(res.status).toBe(201);

    const json = await res.json();
    expect(json.data.currentState).toBe("Solicitada");
  });

  it("logs audit event on successful creation", async () => {
    mockedQuery
      .mockResolvedValueOnce([
        {
          id: "uuid-audit",
          radicado: "ANU-AUDIT-TEST",
          pqr_id: "pqr-audit",
          current_state: "Solicitada",
          created_at: "2024-01-15T12:00:00Z",
        },
      ] as never)
      .mockResolvedValueOnce([] as never); // audit log insert

    const req = createRequest("/api/annulations", {
      method: "POST",
      headers: { "x-user-role": "SYSTEM_ADMIN", "x-user-id": "admin@vanti.com.co" },
      body: { partnerId: "p-1", senderEmail: "test@partner.co", pqrId: "pqr-audit", justification: "Justification for audit test case" },
    });

    await POST(req);

    // Verify audit log INSERT was called
    expect(mockedQuery).toHaveBeenCalledTimes(2);
    const auditCall = mockedQuery.mock.calls[1];
    expect(auditCall[0]).toContain("INSERT INTO audit_events");
    expect(auditCall[0]).toContain("CREATE_ANNULATION");
  });

  it("returns 500 when database insert fails", async () => {
    mockedQuery.mockRejectedValueOnce(new Error("DB connection timeout"));

    const req = createRequest("/api/annulations", {
      method: "POST",
      headers: { "x-user-role": "SYSTEM_ADMIN", "x-user-id": "admin@vanti.com.co" },
      body: { partnerId: "p-1", senderEmail: "test@partner.co", pqrId: "pqr-1", justification: "Valid justification for this request" },
    });

    const res = await POST(req);
    expect(res.status).toBe(500);

    const json = await res.json();
    expect(json.error.code).toBe("INTERNAL_ERROR");
  });

  it("trims justification whitespace", async () => {
    mockedQuery
      .mockResolvedValueOnce([
        {
          id: "uuid-trim",
          radicado: "ANU-TRIM-TEST",
          pqr_id: "pqr-trim",
          current_state: "Solicitada",
          created_at: "2024-01-15T13:00:00Z",
        },
      ] as never)
      .mockResolvedValueOnce([] as never);

    const req = createRequest("/api/annulations", {
      method: "POST",
      headers: { "x-user-role": "SYSTEM_ADMIN", "x-user-id": "admin@vanti.com.co" },
      body: { partnerId: "p-1", senderEmail: "test@partner.co", pqrId: "pqr-trim", justification: "   Justification with leading spaces   " },
    });

    const res = await POST(req);
    expect(res.status).toBe(201);

    const json = await res.json();
    expect(json.data.justification).toBe("Justification with leading spaces");
  });
});
