import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * Mock the database query function used by the audit route.
 */
const mockQuery = vi.hoisted(() => vi.fn());

vi.mock("@/lib/server/database", () => ({
  query: mockQuery,
}));

import { GET } from "@/app/api/audit/route";

/**
 * Helper to create a NextRequest with specific headers and search params.
 */
function createAuditRequest(
  params: Record<string, string> = {},
  role: string = "SYSTEM_ADMIN"
): NextRequest {
  const url = new URL("http://localhost:3000/api/audit");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return new NextRequest(url, {
    headers: { "x-user-role": role },
  });
}

describe("GET /api/audit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("RBAC authorization", () => {
    it("returns 403 when user has no role header", async () => {
      const request = createAuditRequest({}, "");
      const response = await GET(request);
      const body = await response.json();

      expect(response.status).toBe(403);
      expect(body.error.code).toBe("FORBIDDEN");
      expect(body.error.message).toContain("SYSTEM_ADMIN");
      expect(body.error.message).toContain("AUDITOR");
    });

    it("returns 403 for INTERN_READONLY role", async () => {
      const request = createAuditRequest({}, "INTERN_READONLY");
      const response = await GET(request);

      expect(response.status).toBe(403);
    });

    it("returns 403 for ANALYST role", async () => {
      const request = createAuditRequest({}, "ANALYST");
      const response = await GET(request);

      expect(response.status).toBe(403);
    });

    it("returns 403 for CONTRACTOR_OPERATOR role", async () => {
      const request = createAuditRequest({}, "CONTRACTOR_OPERATOR");
      const response = await GET(request);

      expect(response.status).toBe(403);
    });

    it("allows SYSTEM_ADMIN to access audit logs", async () => {
      mockQuery
        .mockResolvedValueOnce([{ count: "0" }])
        .mockResolvedValueOnce([]);

      const request = createAuditRequest({}, "SYSTEM_ADMIN");
      const response = await GET(request);

      expect(response.status).toBe(200);
    });

    it("allows AUDITOR to access audit logs", async () => {
      mockQuery
        .mockResolvedValueOnce([{ count: "0" }])
        .mockResolvedValueOnce([]);

      const request = createAuditRequest({}, "AUDITOR");
      const response = await GET(request);

      expect(response.status).toBe(200);
    });
  });

  describe("pagination", () => {
    it("returns default pagination (page 1, pageSize 50)", async () => {
      mockQuery
        .mockResolvedValueOnce([{ count: "0" }])
        .mockResolvedValueOnce([]);

      const request = createAuditRequest({});
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

      const request = createAuditRequest({ page: "2", page_size: "10" });
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

      const request = createAuditRequest({ page_size: "500" });
      const response = await GET(request);
      const body = await response.json();

      expect(body.pageSize).toBe(200);
    });

    it("returns 400 for invalid page number", async () => {
      const request = createAuditRequest({ page: "0" });
      const response = await GET(request);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error.code).toBe("VALIDATION_ERROR");
      expect(body.error.message).toContain("page");
    });

    it("returns 400 for non-numeric page", async () => {
      const request = createAuditRequest({ page: "abc" });
      const response = await GET(request);

      expect(response.status).toBe(400);
    });
  });

  describe("filters", () => {
    it("passes date_start filter to SQL query", async () => {
      mockQuery
        .mockResolvedValueOnce([{ count: "3" }])
        .mockResolvedValueOnce([]);

      const request = createAuditRequest({ date_start: "2024-01-01T00:00:00Z" });
      await GET(request);

      // First call is count query, check it includes the date filter
      const countCall = mockQuery.mock.calls[0];
      expect(countCall[0]).toContain("timestamp >= $1::timestamptz");
      expect(countCall[1]).toContain("2024-01-01T00:00:00Z");
    });

    it("passes date_end filter to SQL query", async () => {
      mockQuery
        .mockResolvedValueOnce([{ count: "2" }])
        .mockResolvedValueOnce([]);

      const request = createAuditRequest({ date_end: "2024-12-31T23:59:59Z" });
      await GET(request);

      const countCall = mockQuery.mock.calls[0];
      expect(countCall[0]).toContain("timestamp <= $1::timestamptz");
      expect(countCall[1]).toContain("2024-12-31T23:59:59Z");
    });

    it("passes user_id filter to SQL query", async () => {
      mockQuery
        .mockResolvedValueOnce([{ count: "1" }])
        .mockResolvedValueOnce([]);

      const request = createAuditRequest({ user_id: "user-123" });
      await GET(request);

      const countCall = mockQuery.mock.calls[0];
      expect(countCall[0]).toContain("user_id = $1");
      expect(countCall[1]).toContain("user-123");
    });

    it("passes action filter to SQL query", async () => {
      mockQuery
        .mockResolvedValueOnce([{ count: "5" }])
        .mockResolvedValueOnce([]);

      const request = createAuditRequest({ action: "LOGIN" });
      await GET(request);

      const countCall = mockQuery.mock.calls[0];
      expect(countCall[0]).toContain("action = $1");
      expect(countCall[1]).toContain("LOGIN");
    });

    it("passes resource filter to SQL query", async () => {
      mockQuery
        .mockResolvedValueOnce([{ count: "4" }])
        .mockResolvedValueOnce([]);

      const request = createAuditRequest({ resource: "/api/annulations" });
      await GET(request);

      const countCall = mockQuery.mock.calls[0];
      expect(countCall[0]).toContain("resource = $1");
      expect(countCall[1]).toContain("/api/annulations");
    });

    it("combines multiple filters with AND", async () => {
      mockQuery
        .mockResolvedValueOnce([{ count: "1" }])
        .mockResolvedValueOnce([]);

      const request = createAuditRequest({
        user_id: "user-1",
        action: "CREATE",
        resource: "/api/users",
      });
      await GET(request);

      const countCall = mockQuery.mock.calls[0];
      expect(countCall[0]).toContain("user_id = $1");
      expect(countCall[0]).toContain("action = $2");
      expect(countCall[0]).toContain("resource = $3");
    });

    it("returns 400 for invalid date_start format", async () => {
      const request = createAuditRequest({ date_start: "not-a-date" });
      const response = await GET(request);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error.code).toBe("VALIDATION_ERROR");
      expect(body.error.message).toContain("date_start");
    });

    it("returns 400 for invalid date_end format", async () => {
      const request = createAuditRequest({ date_end: "invalid" });
      const response = await GET(request);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error.code).toBe("VALIDATION_ERROR");
      expect(body.error.message).toContain("date_end");
    });
  });

  describe("response format", () => {
    it("returns audit events with camelCase keys", async () => {
      const mockRow = {
        id: "evt-123",
        timestamp: "2024-01-15T10:30:00Z",
        user_id: "user-admin",
        action: "LOGIN",
        resource: "/api/auth",
        resource_id: null,
        result: "success",
        ip_address: "192.168.1.1",
        details: { browser: "Chrome" },
        correlation_id: null,
      };

      mockQuery
        .mockResolvedValueOnce([{ count: "1" }])
        .mockResolvedValueOnce([mockRow]);

      const request = createAuditRequest({});
      const response = await GET(request);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.data).toHaveLength(1);
      expect(body.data[0]).toEqual({
        id: "evt-123",
        timestamp: "2024-01-15T10:30:00Z",
        userId: "user-admin",
        action: "LOGIN",
        resource: "/api/auth",
        resourceId: null,
        result: "success",
        ipAddress: "192.168.1.1",
        details: { browser: "Chrome" },
        correlationId: null,
      });
    });

    it("returns total count matching filter results", async () => {
      mockQuery
        .mockResolvedValueOnce([{ count: "42" }])
        .mockResolvedValueOnce([]);

      const request = createAuditRequest({ action: "LOGIN" });
      const response = await GET(request);
      const body = await response.json();

      expect(body.total).toBe(42);
    });
  });

  describe("error handling", () => {
    it("returns 500 when database query throws", async () => {
      mockQuery.mockRejectedValueOnce(new Error("Connection refused"));

      const request = createAuditRequest({});
      const response = await GET(request);
      const body = await response.json();

      expect(response.status).toBe(500);
      expect(body.error.code).toBe("INTERNAL_ERROR");
      expect(body.error.message).toContain("Failed to query audit events");
    });
  });
});
