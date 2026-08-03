import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * Mock the database query function used by the annulations routes.
 */
const mockQuery = vi.hoisted(() => vi.fn());

vi.mock("@/lib/server/database", () => ({
  query: mockQuery,
}));

import { GET, POST } from "@/app/api/annulations/route";

/**
 * Helper to create a NextRequest for GET /api/annulations.
 */
function createGetRequest(
  params: Record<string, string> = {},
  role: string = "SYSTEM_ADMIN"
): NextRequest {
  const url = new URL("http://localhost:3000/api/annulations");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return new NextRequest(url, {
    headers: { "x-user-role": role },
  });
}

/**
 * Helper to create a NextRequest for POST /api/annulations.
 */
function createPostRequest(
  body: Record<string, unknown>,
  role: string = "SYSTEM_ADMIN",
  userId: string = "admin@vanti.com.co"
): NextRequest {
  return new NextRequest("http://localhost:3000/api/annulations", {
    method: "POST",
    headers: {
      "x-user-role": role,
      "x-user-id": userId,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

describe("GET /api/annulations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("RBAC authorization", () => {
    it("returns 403 when user has no role header", async () => {
      const request = createGetRequest({}, "");
      const response = await GET(request);
      const body = await response.json();

      expect(response.status).toBe(403);
      expect(body.error.code).toBe("FORBIDDEN");
    });

    it("returns 403 for INTERN_READONLY role", async () => {
      const request = createGetRequest({}, "INTERN_READONLY");
      const response = await GET(request);

      expect(response.status).toBe(403);
    });

    it("returns 403 for CONTRACTOR_OPERATOR role", async () => {
      const request = createGetRequest({}, "CONTRACTOR_OPERATOR");
      const response = await GET(request);

      expect(response.status).toBe(403);
    });

    it("allows SYSTEM_ADMIN to list annulations", async () => {
      mockQuery
        .mockResolvedValueOnce([{ count: "0" }])
        .mockResolvedValueOnce([]);

      const request = createGetRequest({}, "SYSTEM_ADMIN");
      const response = await GET(request);

      expect(response.status).toBe(200);
    });

    it("allows OPERATIONS_LEAD to list annulations", async () => {
      mockQuery
        .mockResolvedValueOnce([{ count: "0" }])
        .mockResolvedValueOnce([]);

      const request = createGetRequest({}, "OPERATIONS_LEAD");
      const response = await GET(request);

      expect(response.status).toBe(200);
    });

    it("allows ANALYST to list annulations", async () => {
      mockQuery
        .mockResolvedValueOnce([{ count: "0" }])
        .mockResolvedValueOnce([]);

      const request = createGetRequest({}, "ANALYST");
      const response = await GET(request);

      expect(response.status).toBe(200);
    });

    it("allows BUSINESS_OWNER to list annulations", async () => {
      mockQuery
        .mockResolvedValueOnce([{ count: "0" }])
        .mockResolvedValueOnce([]);

      const request = createGetRequest({}, "BUSINESS_OWNER");
      const response = await GET(request);

      expect(response.status).toBe(200);
    });
  });

  describe("pagination", () => {
    it("returns default pagination (page 1, pageSize 50)", async () => {
      mockQuery
        .mockResolvedValueOnce([{ count: "0" }])
        .mockResolvedValueOnce([]);

      const request = createGetRequest({});
      const response = await GET(request);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.page).toBe(1);
      expect(body.pageSize).toBe(50);
      expect(body.total).toBe(0);
      expect(body.data).toEqual([]);
    });

    it("respects custom page and page_size parameters", async () => {
      mockQuery
        .mockResolvedValueOnce([{ count: "25" }])
        .mockResolvedValueOnce([]);

      const request = createGetRequest({ page: "2", page_size: "10" });
      const response = await GET(request);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.page).toBe(2);
      expect(body.pageSize).toBe(10);
      expect(body.total).toBe(25);
    });

    it("caps page_size at 200 maximum", async () => {
      mockQuery
        .mockResolvedValueOnce([{ count: "0" }])
        .mockResolvedValueOnce([]);

      const request = createGetRequest({ page_size: "500" });
      const response = await GET(request);
      const body = await response.json();

      expect(body.pageSize).toBe(200);
    });

    it("returns 400 for invalid page number", async () => {
      const request = createGetRequest({ page: "0" });
      const response = await GET(request);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("status filter", () => {
    it("filters by valid status", async () => {
      mockQuery
        .mockResolvedValueOnce([{ count: "3" }])
        .mockResolvedValueOnce([]);

      const request = createGetRequest({ status: "Solicitada" });
      await GET(request);

      const countCall = mockQuery.mock.calls[0];
      expect(countCall[0]).toContain("cr.current_state = $1");
      expect(countCall[1]).toContain("Solicitada");
    });

    it("returns 400 for invalid status filter", async () => {
      const request = createGetRequest({ status: "InvalidState" });
      const response = await GET(request);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error.code).toBe("VALIDATION_ERROR");
      expect(body.error.message).toContain("Invalid status filter");
    });
  });

  describe("response format", () => {
    it("returns cancellation requests with camelCase keys", async () => {
      const mockRow = {
        id: "uuid-1",
        radicado: "ANU-123",
        pqr_id: "PQR-001",
        current_state: "Solicitada",
        requested_by: "user-uuid",
        justification: "Need to cancel this PQR",
        created_at: "2024-01-15T10:30:00Z",
        updated_at: "2024-01-15T10:30:00Z",
      };

      mockQuery
        .mockResolvedValueOnce([{ count: "1" }])
        .mockResolvedValueOnce([mockRow]);

      const request = createGetRequest({});
      const response = await GET(request);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.data).toHaveLength(1);
      expect(body.data[0]).toEqual({
        id: "uuid-1",
        radicado: "ANU-123",
        pqrId: "PQR-001",
        currentState: "Solicitada",
        requestedBy: "user-uuid",
        justification: "Need to cancel this PQR",
        createdAt: "2024-01-15T10:30:00Z",
        updatedAt: "2024-01-15T10:30:00Z",
      });
    });
  });

  describe("error handling", () => {
    it("returns 500 when database query throws", async () => {
      mockQuery.mockRejectedValueOnce(new Error("Connection refused"));

      const request = createGetRequest({});
      const response = await GET(request);
      const body = await response.json();

      expect(response.status).toBe(500);
      expect(body.error.code).toBe("INTERNAL_ERROR");
    });
  });
});

describe("POST /api/annulations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("RBAC authorization", () => {
    it("returns 403 for INTERN_READONLY role", async () => {
      const request = createPostRequest(
        { pqrId: "PQR-001", justification: "Need to cancel this PQR request" },
        "INTERN_READONLY"
      );
      const response = await POST(request);

      expect(response.status).toBe(403);
    });

    it("returns 403 for ANALYST role", async () => {
      const request = createPostRequest(
        { pqrId: "PQR-001", justification: "Need to cancel this PQR request" },
        "ANALYST"
      );
      const response = await POST(request);

      expect(response.status).toBe(403);
    });

    it("allows SYSTEM_ADMIN to create", async () => {
      mockQuery
        .mockResolvedValueOnce([
          {
            id: "uuid-1",
            radicado: "ANU-123",
            pqr_id: "PQR-001",
            current_state: "Solicitada",
            created_at: "2024-01-15T10:30:00Z",
          },
        ])
        .mockResolvedValueOnce([]); // audit

      const request = createPostRequest(
        { pqrId: "PQR-001", justification: "Need to cancel this PQR request" },
        "SYSTEM_ADMIN"
      );
      const response = await POST(request);

      expect(response.status).toBe(201);
    });

    it("allows BUSINESS_OWNER to create", async () => {
      mockQuery
        .mockResolvedValueOnce([
          {
            id: "uuid-2",
            radicado: "ANU-456",
            pqr_id: "PQR-002",
            current_state: "Solicitada",
            created_at: "2024-01-15T11:00:00Z",
          },
        ])
        .mockResolvedValueOnce([]); // audit

      const request = createPostRequest(
        { pqrId: "PQR-002", justification: "Business reason for cancellation" },
        "BUSINESS_OWNER"
      );
      const response = await POST(request);

      expect(response.status).toBe(201);
    });
  });

  describe("validation", () => {
    it("returns 400 when pqrId is missing", async () => {
      const request = createPostRequest({
        justification: "Valid justification here",
      });
      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error.code).toBe("VALIDATION_ERROR");
      expect(body.error.message).toContain("pqrId");
    });

    it("returns 400 when justification is missing", async () => {
      const request = createPostRequest({ pqrId: "PQR-001" });
      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error.code).toBe("VALIDATION_ERROR");
      expect(body.error.message).toContain("Justification");
      expect(body.error.message).toContain("10");
    });

    it("returns 400 when justification is too short (< 10 chars)", async () => {
      const request = createPostRequest({
        pqrId: "PQR-001",
        justification: "short",
      });
      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error.code).toBe("VALIDATION_ERROR");
      expect(body.error.message).toContain("10");
    });

    it("returns 400 for invalid JSON body", async () => {
      const request = new NextRequest("http://localhost:3000/api/annulations", {
        method: "POST",
        headers: {
          "x-user-role": "SYSTEM_ADMIN",
          "x-user-id": "admin@vanti.com.co",
          "content-type": "application/json",
        },
        body: "not json{{{",
      });
      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("successful creation", () => {
    it("creates with initial state Solicitada and logs audit", async () => {
      mockQuery
        .mockResolvedValueOnce([
          {
            id: "uuid-new",
            radicado: "ANU-test",
            pqr_id: "PQR-100",
            current_state: "Solicitada",
            created_at: "2024-02-01T09:00:00Z",
          },
        ])
        .mockResolvedValueOnce([]); // audit

      const request = createPostRequest({
        pqrId: "PQR-100",
        justification: "This PQR needs to be cancelled due to duplicate",
      });
      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(201);
      expect(body.data.currentState).toBe("Solicitada");
      expect(body.data.pqrId).toBe("PQR-100");
      expect(body.message).toContain("successfully");

      // Verify audit was logged
      expect(mockQuery).toHaveBeenCalledTimes(2);
      const auditCall = mockQuery.mock.calls[1];
      expect(auditCall[0]).toContain("INSERT INTO audit_events");
      expect(auditCall[0]).toContain("CREATE_ANNULATION");
    });
  });
});
