/**
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SignJWT } from "jose";
import type { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Mock Next.js server modules before imports
// ---------------------------------------------------------------------------

vi.mock("next/server", () => {
  class MockNextResponse {
    status: number;
    headers: Map<string, string>;
    body: unknown;
    redirectUrl?: string;
    __isNext?: boolean;
    __isRedirect?: boolean;
    [key: string]: unknown;

    constructor(body?: unknown, init?: { status?: number; headers?: Record<string, string> }) {
      this.body = body;
      this.status = init?.status || 200;
      this.headers = new Map(Object.entries(init?.headers || {}));
    }

    async json() {
      return this.body;
    }

    static json(body: unknown, init?: { status?: number }) {
      const resp = new MockNextResponse(body, init);
      resp.json = async () => body;
      return resp;
    }

    static next() {
      const resp = new MockNextResponse(null, { status: 200 });
      resp.__isNext = true;
      return resp;
    }

    static redirect(url: URL | string) {
      const resp = new MockNextResponse(null, { status: 307 });
      resp.redirectUrl = typeof url === "string" ? url : url.toString();
      resp.__isRedirect = true;
      return resp;
    }
  }

  return { NextResponse: MockNextResponse };
});

// ---------------------------------------------------------------------------
// Test response helpers
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MockResponse = any;

import {
  middleware,
  extractToken,
  verifyTokenAndGetRole,
  findAllowedRoles,
  isApiRoute,
  PROTECTED_ROUTES,
  VALID_ROLES,
} from "@/middleware";

// ---------------------------------------------------------------------------
// Test Utilities
// ---------------------------------------------------------------------------

const TEST_SECRET = "test-secret-key-for-vantiops-360-middleware";

function createMockRequest(pathname: string, cookies: Record<string, string> = {}): NextRequest {
  const url = new URL(pathname, "http://localhost:3000");
  // Add clone() method to simulate NextURL behavior
  (url as unknown as Record<string, unknown>).clone = () => new URL(url.toString());
  return {
    nextUrl: url,
    cookies: {
      get: (name: string) => {
        const value = cookies[name];
        return value ? { name, value } : undefined;
      },
    },
  } as unknown as NextRequest;
}

async function createToken(payload: Record<string, unknown>, secret = TEST_SECRET): Promise<string> {
  const key = new TextEncoder().encode(secret);
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(key);
}

async function createExpiredToken(payload: Record<string, unknown>, secret = TEST_SECRET): Promise<string> {
  const key = new TextEncoder().encode(secret);
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
    .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
    .sign(key);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("RBAC Middleware", () => {
  beforeEach(() => {
    vi.stubEnv("JWT_SECRET", TEST_SECRET);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // =========================================================================
  // PROTECTED_ROUTES configuration
  // =========================================================================

  describe("PROTECTED_ROUTES config", () => {
    it("contains all expected protected API routes", () => {
      const apiRoutes = Object.keys(PROTECTED_ROUTES).filter((r) => r.startsWith("/api/"));
      expect(apiRoutes).toContain("/api/admin");
      expect(apiRoutes).toContain("/api/audit");
      expect(apiRoutes).toContain("/api/approvals");
      expect(apiRoutes).toContain("/api/annulations");
      expect(apiRoutes).toContain("/api/capacity");
      expect(apiRoutes).toContain("/api/evidence");
      expect(apiRoutes).toContain("/api/migration");
      expect(apiRoutes).toContain("/api/users");
      expect(apiRoutes).toContain("/api/email");
    });

    it("each route maps to an array of valid roles", () => {
      for (const [route, roles] of Object.entries(PROTECTED_ROUTES)) {
        expect(Array.isArray(roles), `${route} should have an array of roles`).toBe(true);
        expect(roles.length, `${route} should have at least one role`).toBeGreaterThan(0);
        for (const role of roles) {
          expect(VALID_ROLES).toContain(role);
        }
      }
    });

    it("SYSTEM_ADMIN has access to all protected routes", () => {
      for (const [route, roles] of Object.entries(PROTECTED_ROUTES)) {
        expect(roles, `SYSTEM_ADMIN should have access to ${route}`).toContain("SYSTEM_ADMIN");
      }
    });
  });

  // =========================================================================
  // VALID_ROLES
  // =========================================================================

  describe("VALID_ROLES", () => {
    it("contains exactly 12 roles from the Lista Maestra", () => {
      expect(VALID_ROLES).toHaveLength(12);
      expect(VALID_ROLES).toContain("SYSTEM_ADMIN");
      expect(VALID_ROLES).toContain("OPERATIONS_LEAD");
      expect(VALID_ROLES).toContain("ANALYST");
      expect(VALID_ROLES).toContain("LEGAL_APPROVER");
      expect(VALID_ROLES).toContain("VP_APPROVER");
      expect(VALID_ROLES).toContain("BUSINESS_OWNER");
      expect(VALID_ROLES).toContain("AUDITOR");
      expect(VALID_ROLES).toContain("PARTNER_ADMIN");
      expect(VALID_ROLES).toContain("PARTNER_OPERATOR");
      expect(VALID_ROLES).toContain("CONTRACTOR_OPERATOR");
      expect(VALID_ROLES).toContain("INTERN_READONLY");
    });
  });

  // =========================================================================
  // extractToken
  // =========================================================================

  describe("extractToken", () => {
    it("returns token from 'session-token' cookie", () => {
      const req = createMockRequest("/api/audit", { "session-token": "abc123" });
      expect(extractToken(req)).toBe("abc123");
    });

    it("returns token from 'next-auth.session-token' cookie", () => {
      const req = createMockRequest("/api/audit", { "next-auth.session-token": "xyz789" });
      expect(extractToken(req)).toBe("xyz789");
    });

    it("prefers 'session-token' over 'next-auth.session-token'", () => {
      const req = createMockRequest("/api/audit", {
        "session-token": "primary",
        "next-auth.session-token": "secondary",
      });
      expect(extractToken(req)).toBe("primary");
    });

    it("returns null when no token cookie is present", () => {
      const req = createMockRequest("/api/audit", {});
      expect(extractToken(req)).toBeNull();
    });

    it("returns null when token cookie is empty string", () => {
      const req = createMockRequest("/api/audit", { "session-token": "" });
      expect(extractToken(req)).toBeNull();
    });
  });

  // =========================================================================
  // verifyTokenAndGetRole
  // =========================================================================

  describe("verifyTokenAndGetRole", () => {
    it("returns role for a valid token with known role", async () => {
      const token = await createToken({ role: "ANALYST" });
      const role = await verifyTokenAndGetRole(token);
      expect(role).toBe("ANALYST");
    });

    it("returns null for a token with invalid role", async () => {
      const token = await createToken({ role: "DEVELOPER" });
      const role = await verifyTokenAndGetRole(token);
      expect(role).toBeNull();
    });

    it("returns null for a token without role claim", async () => {
      const token = await createToken({ sub: "user-123" });
      const role = await verifyTokenAndGetRole(token);
      expect(role).toBeNull();
    });

    it("returns null for an expired token", async () => {
      const token = await createExpiredToken({ role: "SYSTEM_ADMIN" });
      const role = await verifyTokenAndGetRole(token);
      expect(role).toBeNull();
    });

    it("returns null for a token signed with wrong secret", async () => {
      const token = await createToken({ role: "SYSTEM_ADMIN" }, "wrong-secret");
      const role = await verifyTokenAndGetRole(token);
      expect(role).toBeNull();
    });

    it("returns null for malformed token string", async () => {
      const role = await verifyTokenAndGetRole("not-a-valid-jwt");
      expect(role).toBeNull();
    });

    it("returns null for empty string", async () => {
      const role = await verifyTokenAndGetRole("");
      expect(role).toBeNull();
    });
  });

  // =========================================================================
  // findAllowedRoles
  // =========================================================================

  describe("findAllowedRoles", () => {
    it("returns roles for an exact match", () => {
      const roles = findAllowedRoles("/api/admin");
      expect(roles).toEqual(["SYSTEM_ADMIN"]);
    });

    it("returns roles for a sub-path match", () => {
      const roles = findAllowedRoles("/api/audit/events/123");
      expect(roles).toContain("SYSTEM_ADMIN");
      expect(roles).toContain("AUDITOR");
    });

    it("returns null for unprotected routes", () => {
      expect(findAllowedRoles("/")).toBeNull();
      expect(findAllowedRoles("/api/health")).toBeNull();
      expect(findAllowedRoles("/api/charts/pareto")).toBeNull();
      expect(findAllowedRoles("/dashboard")).toBeNull();
    });

    it("does not match partial path segments (e.g. /api/admins should not match /api/admin)", () => {
      // /api/admins should NOT match /api/admin
      expect(findAllowedRoles("/api/admins")).toBeNull();
    });
  });

  // =========================================================================
  // isApiRoute
  // =========================================================================

  describe("isApiRoute", () => {
    it("returns true for /api/ paths", () => {
      expect(isApiRoute("/api/audit")).toBe(true);
      expect(isApiRoute("/api/health")).toBe(true);
    });

    it("returns false for non-API paths", () => {
      expect(isApiRoute("/dashboard")).toBe(false);
      expect(isApiRoute("/admin")).toBe(false);
      expect(isApiRoute("/")).toBe(false);
    });
  });

  // =========================================================================
  // middleware() — Unprotected routes
  // =========================================================================

  describe("middleware — unprotected routes", () => {
    it("allows access to unprotected routes without token", async () => {
      const req = createMockRequest("/dashboard");
      const res = (await middleware(req)) as MockResponse;
      expect(res.__isNext).toBe(true);
    });

    it("allows access to /api/health without token", async () => {
      const req = createMockRequest("/api/health");
      const res = (await middleware(req)) as MockResponse;
      expect(res.__isNext).toBe(true);
    });

    it("allows access to /api/charts/pareto without token", async () => {
      const req = createMockRequest("/api/charts/pareto");
      const res = (await middleware(req)) as MockResponse;
      expect(res.__isNext).toBe(true);
    });
  });

  // =========================================================================
  // middleware() — API routes without token (401)
  // =========================================================================

  describe("middleware — API routes without token", () => {
    it("returns 401 with UNAUTHORIZED code for API route without token", async () => {
      const req = createMockRequest("/api/audit");
      const res = (await middleware(req)) as MockResponse;
      const body = await res.json();

      expect(res.status).toBe(401);
      expect(body.error.code).toBe("UNAUTHORIZED");
    });

    it("returns 401 for /api/admin without token", async () => {
      const req = createMockRequest("/api/admin");
      const res = (await middleware(req)) as MockResponse;

      expect(res.status).toBe(401);
    });
  });

  // =========================================================================
  // middleware() — Page routes without token (redirect to login)
  // =========================================================================

  describe("middleware — page routes without token", () => {
    it("redirects to /login for page route without token", async () => {
      const req = createMockRequest("/auditoria");
      const res = (await middleware(req)) as MockResponse;

      expect(res.__isRedirect).toBe(true);
      expect(res.redirectUrl).toContain("/login");
    });

    it("includes callbackUrl in redirect", async () => {
      const req = createMockRequest("/auditoria");
      const res = (await middleware(req)) as MockResponse;

      expect(res.redirectUrl).toContain("callbackUrl=%2Fauditoria");
    });
  });

  // =========================================================================
  // middleware() — API routes with unauthorized role (403)
  // =========================================================================

  describe("middleware — API routes with unauthorized role", () => {
    it("returns 403 FORBIDDEN when INTERN_READONLY tries /api/admin", async () => {
      const token = await createToken({ role: "INTERN_READONLY" });
      const req = createMockRequest("/api/admin", { "session-token": token });
      const res = (await middleware(req)) as MockResponse;
      const body = await res.json();

      expect(res.status).toBe(403);
      expect(body.error.code).toBe("FORBIDDEN");
      expect(body.error.message).toBeTruthy();
    });

    it("returns 403 when CONTRACTOR_OPERATOR tries /api/audit", async () => {
      const token = await createToken({ role: "CONTRACTOR_OPERATOR" });
      const req = createMockRequest("/api/audit", { "session-token": token });
      const res = (await middleware(req)) as MockResponse;

      expect(res.status).toBe(403);
    });

    it("returns 403 when ANALYST tries /api/approvals", async () => {
      const token = await createToken({ role: "ANALYST" });
      const req = createMockRequest("/api/approvals", { "session-token": token });
      const res = (await middleware(req)) as MockResponse;

      expect(res.status).toBe(403);
    });
  });

  // =========================================================================
  // middleware() — Page routes with unauthorized role (redirect to access-denied)
  // =========================================================================

  describe("middleware — page routes with unauthorized role", () => {
    it("redirects to /access-denied when INTERN_READONLY tries /admin", async () => {
      const token = await createToken({ role: "INTERN_READONLY" });
      const req = createMockRequest("/admin", { "session-token": token });
      const res = (await middleware(req)) as MockResponse;

      expect(res.__isRedirect).toBe(true);
      expect(res.redirectUrl).toContain("/access-denied");
    });

    it("includes 'from' param in access-denied redirect", async () => {
      const token = await createToken({ role: "INTERN_READONLY" });
      const req = createMockRequest("/admin", { "session-token": token });
      const res = (await middleware(req)) as MockResponse;

      expect(res.redirectUrl).toContain("from=%2Fadmin");
    });

    it("redirects PARTNER_OPERATOR from /aprobaciones", async () => {
      const token = await createToken({ role: "PARTNER_OPERATOR" });
      const req = createMockRequest("/aprobaciones", { "session-token": token });
      const res = (await middleware(req)) as MockResponse;

      expect(res.__isRedirect).toBe(true);
      expect(res.redirectUrl).toContain("/access-denied");
    });
  });

  // =========================================================================
  // middleware() — Authorized access
  // =========================================================================

  describe("middleware — authorized access", () => {
    it("allows SYSTEM_ADMIN to access /api/admin", async () => {
      const token = await createToken({ role: "SYSTEM_ADMIN" });
      const req = createMockRequest("/api/admin", { "session-token": token });
      const res = (await middleware(req)) as MockResponse;

      expect(res.__isNext).toBe(true);
    });

    it("allows AUDITOR to access /api/audit", async () => {
      const token = await createToken({ role: "AUDITOR" });
      const req = createMockRequest("/api/audit", { "session-token": token });
      const res = (await middleware(req)) as MockResponse;

      expect(res.__isNext).toBe(true);
    });

    it("allows LEGAL_APPROVER to access /api/approvals", async () => {
      const token = await createToken({ role: "LEGAL_APPROVER" });
      const req = createMockRequest("/api/approvals", { "session-token": token });
      const res = (await middleware(req)) as MockResponse;

      expect(res.__isNext).toBe(true);
    });

    it("allows OPERATIONS_LEAD to access /api/capacity", async () => {
      const token = await createToken({ role: "OPERATIONS_LEAD" });
      const req = createMockRequest("/api/capacity", { "session-token": token });
      const res = (await middleware(req)) as MockResponse;

      expect(res.__isNext).toBe(true);
    });

    it("allows SYSTEM_ADMIN to access /admin page route", async () => {
      const token = await createToken({ role: "SYSTEM_ADMIN" });
      const req = createMockRequest("/admin", { "session-token": token });
      const res = (await middleware(req)) as MockResponse;

      expect(res.__isNext).toBe(true);
    });

    it("allows access via next-auth.session-token cookie", async () => {
      const token = await createToken({ role: "SYSTEM_ADMIN" });
      const req = createMockRequest("/api/admin", { "next-auth.session-token": token });
      const res = (await middleware(req)) as MockResponse;

      expect(res.__isNext).toBe(true);
    });
  });

  // =========================================================================
  // middleware() — Invalid/expired tokens
  // =========================================================================

  describe("middleware — invalid tokens", () => {
    it("returns 403 for API route with expired token", async () => {
      const token = await createExpiredToken({ role: "SYSTEM_ADMIN" });
      const req = createMockRequest("/api/admin", { "session-token": token });
      const res = (await middleware(req)) as MockResponse;

      expect(res.status).toBe(403);
    });

    it("redirects page route with expired token to access-denied", async () => {
      const token = await createExpiredToken({ role: "SYSTEM_ADMIN" });
      const req = createMockRequest("/admin", { "session-token": token });
      const res = (await middleware(req)) as MockResponse;

      expect(res.__isRedirect).toBe(true);
      expect(res.redirectUrl).toContain("/access-denied");
    });

    it("returns 403 for token with no role claim on API route", async () => {
      const token = await createToken({ sub: "user-no-role" });
      const req = createMockRequest("/api/admin", { "session-token": token });
      const res = (await middleware(req)) as MockResponse;

      expect(res.status).toBe(403);
    });

    it("returns 403 for token with invalid role value on API route", async () => {
      const token = await createToken({ role: "SUPER_HACKER" });
      const req = createMockRequest("/api/admin", { "session-token": token });
      const res = (await middleware(req)) as MockResponse;

      expect(res.status).toBe(403);
    });
  });

  // =========================================================================
  // Performance — validation completes quickly (< 500ms)
  // =========================================================================

  describe("performance", () => {
    it("completes validation within 500ms", async () => {
      const token = await createToken({ role: "SYSTEM_ADMIN" });
      const req = createMockRequest("/api/admin", { "session-token": token });

      const start = performance.now();
      await middleware(req);
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(500);
    });

    it("completes denied validation within 500ms", async () => {
      const token = await createToken({ role: "INTERN_READONLY" });
      const req = createMockRequest("/api/admin", { "session-token": token });

      const start = performance.now();
      await middleware(req);
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(500);
    });
  });
});
