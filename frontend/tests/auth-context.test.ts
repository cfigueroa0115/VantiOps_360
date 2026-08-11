/**
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SignJWT } from "jose";
import type { NextRequest } from "next/server";

vi.mock("next/server", () => ({
  NextResponse: { json: (b: unknown, i?: { status?: number }) => ({ body: b, status: i?.status || 200 }) },
}));

import { getRequestIdentity, getVerifiedIdentity } from "@/lib/server/auth-context";

const TEST_SECRET = "test-jwt-secret-for-auth-context-tests";

function createMockRequest(cookies: Record<string, string> = {}, headers: Record<string, string> = {}): NextRequest {
  return {
    cookies: {
      get: (name: string) => {
        const value = cookies[name];
        return value ? { name, value } : undefined;
      },
    },
    headers: {
      get: (name: string) => headers[name] || null,
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

async function createExpiredToken(payload: Record<string, unknown>): Promise<string> {
  const key = new TextEncoder().encode(TEST_SECRET);
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
    .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
    .sign(key);
}

describe("Auth Context — Security Tests", () => {
  beforeEach(() => {
    vi.stubEnv("JWT_SECRET", TEST_SECRET);
    vi.stubEnv("NODE_ENV", "production");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("JWT validation", () => {
    it("returns verified identity for valid JWT", async () => {
      const token = await createToken({ role: "ANALYST", sub: "user@vanti.com.co" });
      const req = createMockRequest({ "session-token": token });
      const identity = await getVerifiedIdentity(req);
      expect(identity.verified).toBe(true);
      expect(identity.role).toBe("ANALYST");
    });

    it("rejects invalid JWT", async () => {
      const req = createMockRequest({ "session-token": "not-a-real-jwt" });
      const identity = await getVerifiedIdentity(req);
      expect(identity.verified).toBe(false);
      expect(identity.role).toBe("");
    });

    it("rejects expired JWT", async () => {
      const token = await createExpiredToken({ role: "SYSTEM_ADMIN" });
      const req = createMockRequest({ "session-token": token });
      const identity = await getVerifiedIdentity(req);
      expect(identity.verified).toBe(false);
    });

    it("rejects JWT without valid role", async () => {
      const token = await createToken({ role: "HACKER", sub: "evil@attacker.com" });
      const req = createMockRequest({ "session-token": token });
      const identity = await getVerifiedIdentity(req);
      expect(identity.verified).toBe(false);
    });

    it("rejects JWT signed with wrong secret", async () => {
      const key = new TextEncoder().encode("wrong-secret");
      const token = await new SignJWT({ role: "SYSTEM_ADMIN" })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime("1h")
        .sign(key);
      const req = createMockRequest({ "session-token": token });
      const identity = await getVerifiedIdentity(req);
      expect(identity.verified).toBe(false);
    });
  });

  describe("Privilege escalation prevention", () => {
    it("CRITICAL: spoofed x-user-role header does NOT elevate INTERN_READONLY to SYSTEM_ADMIN", async () => {
      const token = await createToken({ role: "INTERN_READONLY", sub: "intern@vanti.com.co" });
      const req = createMockRequest(
        { "session-token": token },
        { "x-user-role": "SYSTEM_ADMIN", "x-user-id": "admin@vanti.com.co" }
      );
      const identity = await getRequestIdentity(req);
      // Must derive from JWT, NOT from spoofed header
      expect(identity.role).toBe("INTERN_READONLY");
      expect(identity.role).not.toBe("SYSTEM_ADMIN");
    });

    it("no JWT + spoofed SYSTEM_ADMIN header in secure mode returns unauthorized", async () => {
      const req = createMockRequest(
        {},
        { "x-user-role": "SYSTEM_ADMIN", "x-user-id": "admin@vanti.com.co" }
      );
      const identity = await getRequestIdentity(req);
      expect(identity.verified).toBe(false);
      expect(identity.role).toBe("");
    });
  });

  describe("Fail closed behavior", () => {
    it("without JWT_SECRET in non-test env, rejects all", async () => {
      vi.stubEnv("JWT_SECRET", "");
      vi.stubEnv("NEXTAUTH_SECRET", "");
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("VITEST", "");

      const req = createMockRequest(
        {},
        { "x-user-role": "SYSTEM_ADMIN" }
      );
      const identity = await getRequestIdentity(req);
      expect(identity.role).toBe("");
      expect(identity.verified).toBe(false);
    });

    it("in test env without JWT_SECRET, allows header fallback", async () => {
      vi.stubEnv("JWT_SECRET", "");
      vi.stubEnv("NEXTAUTH_SECRET", "");
      vi.stubEnv("VITEST", "true");

      const req = createMockRequest(
        {},
        { "x-user-role": "LEGAL_APPROVER", "x-user-id": "legal@vanti.com.co" }
      );
      const identity = await getRequestIdentity(req);
      expect(identity.role).toBe("LEGAL_APPROVER");
    });
  });

  describe("Role-specific access", () => {
    it("LEGAL_APPROVER gets legal role from JWT", async () => {
      const token = await createToken({ role: "LEGAL_APPROVER", sub: "legal@vanti.com.co" });
      const req = createMockRequest({ "session-token": token });
      const identity = await getRequestIdentity(req);
      expect(identity.role).toBe("LEGAL_APPROVER");
    });

    it("VP_APPROVER gets VP role from JWT", async () => {
      const token = await createToken({ role: "VP_APPROVER", sub: "vp@vanti.com.co" });
      const req = createMockRequest({ "session-token": token });
      const identity = await getRequestIdentity(req);
      expect(identity.role).toBe("VP_APPROVER");
    });
  });
});
