import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Mock fs and path modules using importOriginal pattern
const mockReadFileSync = vi.hoisted(() => vi.fn());
const mockExistsSync = vi.hoisted(() => vi.fn());

vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>();
  return {
    ...actual,
    readFileSync: mockReadFileSync,
    existsSync: mockExistsSync,
  };
});

vi.mock("path", async (importOriginal) => {
  const actual = await importOriginal<typeof import("path")>();
  return {
    ...actual,
    join: (...args: string[]) => args.join("/"),
  };
});

import { POST } from "@/app/api/auth/validate/route";

function getAuditLog() {
  return (globalThis as any).__emailValidateAuditLog || [];
}

function _resetWhitelistCache() {
  if ((globalThis as any).__emailValidateResetCache) {
    (globalThis as any).__emailValidateResetCache();
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createRequest(body: unknown, headers?: Record<string, string>): NextRequest {
  const init: RequestInit = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(headers || {}),
    },
    body: JSON.stringify(body),
  };
  return new NextRequest("http://localhost:3000/api/auth/validate", init as any);
}

function createInvalidJsonRequest(): NextRequest {
  return new NextRequest("http://localhost:3000/api/auth/validate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "not-json{{{",
  } as any);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/auth/validate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetWhitelistCache();
    // Default: whitelist file does not exist
    mockExistsSync.mockReturnValue(false);
  });

  describe("400 Bad Request — invalid input", () => {
    it("returns 400 for invalid JSON body", async () => {
      const req = createInvalidJsonRequest();
      const res = await POST(req);
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.authorized).toBe(false);
      expect(body.reason).toBe("INVALID_REQUEST_BODY");
    });

    it("returns 400 when email is missing", async () => {
      const req = createRequest({});
      const res = await POST(req);
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.authorized).toBe(false);
      expect(body.reason).toBe("MISSING_EMAIL");
    });

    it("returns 400 when email is not a string", async () => {
      const req = createRequest({ email: 12345 });
      const res = await POST(req);
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.authorized).toBe(false);
      expect(body.reason).toBe("MISSING_EMAIL");
    });

    it("returns 400 for invalid email format", async () => {
      const req = createRequest({ email: "not-an-email" });
      const res = await POST(req);
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.authorized).toBe(false);
      expect(body.reason).toBe("INVALID_EMAIL_FORMAT");
    });

    it("returns 400 for empty email string", async () => {
      const req = createRequest({ email: "" });
      const res = await POST(req);
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.authorized).toBe(false);
    });
  });

  describe("200 OK — authorized emails", () => {
    it("authorizes corporate domain email (@vanti.com.co)", async () => {
      const req = createRequest({ email: "usuario@vanti.com.co" });
      const res = await POST(req);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.authorized).toBe(true);
      expect(body.reason).toBe("CORPORATE_DOMAIN");
    });

    it("authorizes corporate domain case-insensitively", async () => {
      const req = createRequest({ email: "Admin@Vanti.Com.Co" });
      const res = await POST(req);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.authorized).toBe(true);
      expect(body.reason).toBe("CORPORATE_DOMAIN");
    });

    it("authorizes whitelisted email entry", async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(
        JSON.stringify([
          { email: "partner@external.com", expires_at: null },
        ])
      );

      const req = createRequest({ email: "partner@external.com" });
      const res = await POST(req);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.authorized).toBe(true);
      expect(body.reason).toBe("WHITELIST_EMAIL");
    });

    it("authorizes whitelisted domain entry", async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(
        JSON.stringify([
          { domain: "@allowed-partner.com", expires_at: null },
        ])
      );

      const req = createRequest({ email: "anyone@allowed-partner.com" });
      const res = await POST(req);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.authorized).toBe(true);
      expect(body.reason).toBe("WHITELIST_DOMAIN");
    });
  });

  describe("403 Forbidden — unauthorized emails (REQ-17.2)", () => {
    it("denies non-corporate non-whitelisted email with 403", async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue("[]");

      const req = createRequest({ email: "hacker@evil.org" });
      const res = await POST(req);
      const body = await res.json();

      expect(res.status).toBe(403);
      expect(body.authorized).toBe(false);
      expect(body.reason).toBe("EMAIL_NOT_IN_AUTHORIZED_LIST");
    });

    it("denies expired whitelist email entry", async () => {
      const pastDate = new Date(Date.now() - 86400000).toISOString();
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(
        JSON.stringify([
          { email: "expired@partner.com", expires_at: pastDate },
        ])
      );

      const req = createRequest({ email: "expired@partner.com" });
      const res = await POST(req);
      const body = await res.json();

      expect(res.status).toBe(403);
      expect(body.authorized).toBe(false);
      expect(body.reason).toBe("WHITELIST_ENTRY_EXPIRED");
    });

    it("denies expired whitelist domain entry", async () => {
      const pastDate = new Date(Date.now() - 86400000).toISOString();
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(
        JSON.stringify([
          { domain: "@old-partner.com", expires_at: pastDate },
        ])
      );

      const req = createRequest({ email: "user@old-partner.com" });
      const res = await POST(req);
      const body = await res.json();

      expect(res.status).toBe(403);
      expect(body.authorized).toBe(false);
      expect(body.reason).toBe("WHITELIST_DOMAIN_EXPIRED");
    });

    it("creates audit event on 403 denial", async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue("[]");

      const req = createRequest(
        { email: "intruder@malicious.net" },
        { "x-forwarded-for": "192.168.1.100" }
      );
      const res = await POST(req);

      expect(res.status).toBe(403);

      const log = getAuditLog();
      expect(log.length).toBeGreaterThan(0);

      const lastEntry = log[log.length - 1];
      expect(lastEntry.action).toBe("AUTH_EMAIL_DENIED");
      expect(lastEntry.email).toBe("intruder@malicious.net");
      expect(lastEntry.ip).toBe("192.168.1.100");
      expect(lastEntry.reason).toBe("EMAIL_NOT_IN_AUTHORIZED_LIST");
      expect(lastEntry.timestamp).toBeTruthy();
    });
  });

  describe("Whitelist edge cases", () => {
    it("handles missing whitelist file gracefully", async () => {
      mockExistsSync.mockReturnValue(false);

      const req = createRequest({ email: "user@unknown.com" });
      const res = await POST(req);
      const body = await res.json();

      expect(res.status).toBe(403);
      expect(body.authorized).toBe(false);
    });

    it("handles malformed whitelist file gracefully", async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockImplementation(() => {
        throw new SyntaxError("Unexpected token");
      });

      const req = createRequest({ email: "user@external.com" });
      const res = await POST(req);
      const body = await res.json();

      // Should not crash, just treat as no whitelist
      expect(res.status).toBe(403);
      expect(body.authorized).toBe(false);
    });
  });
});
