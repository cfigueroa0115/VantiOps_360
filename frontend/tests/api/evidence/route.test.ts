import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

// Mock the evidence helpers module
const mockGenerateEvidenceArtifact = vi.fn();

vi.mock("@/lib/server/evidence-helpers", () => ({
  getCommitHash: vi.fn(() => "abc1234567890def1234567890abcdef12345678"),
  getStackVersions: vi.fn(() => ({
    nextjs: "14.2.21",
    react: "18.3.1",
    typescript: "5.7.3",
    python: ">=3.11",
    polars: "1.14.0",
  })),
  getTestResults: vi.fn(() => ({
    unit: { total: 100, passed: 98, failed: 1, skipped: 1 },
    e2e: { total: 12, passed: 12, failed: 0, skipped: 0 },
  })),
  getCoverageMetrics: vi.fn(() => ({
    statements: 70.43,
    branches: 64.35,
    functions: 69.11,
    lines: 69.49,
  })),
  generateEvidenceArtifact: (...args: unknown[]) => mockGenerateEvidenceArtifact(...args),
}));

import { GET } from "@/app/api/evidence/route";
import { getCommitHash } from "@/lib/server/evidence-helpers";

const mockedGetCommitHash = vi.mocked(getCommitHash);

function createRequest(
  url: string,
  options: { headers?: Record<string, string> } = {}
): NextRequest {
  const { headers = {} } = options;
  return new NextRequest(new URL(url, "http://localhost:3000"), {
    method: "GET",
    headers: {
      "content-type": "application/json",
      ...headers,
    },
  });
}

describe("GET /api/evidence", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns 403 for unauthorized role (INTERN_READONLY)", async () => {
    const req = createRequest("/api/evidence", {
      headers: { "x-user-role": "INTERN_READONLY" },
    });

    const res = await GET(req);
    expect(res.status).toBe(403);

    const json = await res.json();
    expect(json.error.code).toBe("FORBIDDEN");
  });

  it("returns 403 for unauthorized role (CONTRACTOR_OPERATOR)", async () => {
    const req = createRequest("/api/evidence", {
      headers: { "x-user-role": "CONTRACTOR_OPERATOR" },
    });

    const res = await GET(req);
    expect(res.status).toBe(403);
  });

  it("returns 403 for unauthorized role (ANALYST)", async () => {
    const req = createRequest("/api/evidence", {
      headers: { "x-user-role": "ANALYST" },
    });

    const res = await GET(req);
    expect(res.status).toBe(403);
  });

  it("returns 403 when no role header is provided", async () => {
    const req = createRequest("/api/evidence");

    const res = await GET(req);
    expect(res.status).toBe(403);
  });

  it("returns 200 with evidence data for SYSTEM_ADMIN", async () => {
    const req = createRequest("/api/evidence", {
      headers: { "x-user-role": "SYSTEM_ADMIN" },
    });

    const res = await GET(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.commitHash).toBe("abc1234567890def1234567890abcdef12345678");
    expect(json.buildDate).toBeDefined();
    expect(json.stack).toBeDefined();
    expect(json.stack.nextjs).toBe("14.2.21");
    expect(json.stack.react).toBe("18.3.1");
    expect(json.stack.typescript).toBe("5.7.3");
    expect(json.stack.python).toBe(">=3.11");
    expect(json.stack.polars).toBe("1.14.0");
    expect(json.tests).toBeDefined();
    expect(json.coverage).toBeDefined();
    expect(json.dataProvenance).toBe("REAL_DATA");
    expect(json.generatedAt).toBeDefined();
  });

  it("returns 200 with evidence data for OPERATIONS_LEAD", async () => {
    const req = createRequest("/api/evidence", {
      headers: { "x-user-role": "OPERATIONS_LEAD" },
    });

    const res = await GET(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.commitHash).toBeDefined();
    expect(json.dataProvenance).toBe("REAL_DATA");
  });

  it("returns 200 with evidence data for AUDITOR", async () => {
    const req = createRequest("/api/evidence", {
      headers: { "x-user-role": "AUDITOR" },
    });

    const res = await GET(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.commitHash).toBeDefined();
    expect(json.dataProvenance).toBe("REAL_DATA");
  });

  it("includes coverage metrics", async () => {
    const req = createRequest("/api/evidence", {
      headers: { "x-user-role": "SYSTEM_ADMIN" },
    });

    const res = await GET(req);
    const json = await res.json();
    expect(json.coverage.statements).toBe(70.43);
    expect(json.coverage.branches).toBe(64.35);
    expect(json.coverage.functions).toBe(69.11);
    expect(json.coverage.lines).toBe(69.49);
  });

  it("includes test results", async () => {
    const req = createRequest("/api/evidence", {
      headers: { "x-user-role": "SYSTEM_ADMIN" },
    });

    const res = await GET(req);
    const json = await res.json();
    expect(json.tests.unit.total).toBe(100);
    expect(json.tests.unit.passed).toBe(98);
    expect(json.tests.unit.failed).toBe(1);
    expect(json.tests.unit.skipped).toBe(1);
    expect(json.tests.e2e.total).toBe(12);
    expect(json.tests.e2e.passed).toBe(12);
  });

  it("includes environment from VERCEL_ENV or NODE_ENV", async () => {
    process.env.VERCEL_ENV = "production";

    const req = createRequest("/api/evidence", {
      headers: { "x-user-role": "SYSTEM_ADMIN" },
    });

    const res = await GET(req);
    const json = await res.json();
    expect(json.environment).toBe("production");
  });

  it("generates evidence artifact on successful request", async () => {
    const req = createRequest("/api/evidence", {
      headers: { "x-user-role": "SYSTEM_ADMIN" },
    });

    await GET(req);

    expect(mockGenerateEvidenceArtifact).toHaveBeenCalledTimes(1);
    expect(mockGenerateEvidenceArtifact).toHaveBeenCalledWith(
      expect.objectContaining({
        commitHash: "abc1234567890def1234567890abcdef12345678",
        dataProvenance: "REAL_DATA",
        stack: expect.objectContaining({ nextjs: "14.2.21" }),
      })
    );
  });

  it("uses BUILD_DATE env when available", async () => {
    process.env.BUILD_DATE = "2024-06-15T12:00:00Z";

    const req = createRequest("/api/evidence", {
      headers: { "x-user-role": "SYSTEM_ADMIN" },
    });

    const res = await GET(req);
    const json = await res.json();
    expect(json.buildDate).toBe("2024-06-15T12:00:00Z");
  });

  it("does not generate artifact for unauthorized requests", async () => {
    const req = createRequest("/api/evidence", {
      headers: { "x-user-role": "INTERN_READONLY" },
    });

    await GET(req);

    expect(mockGenerateEvidenceArtifact).not.toHaveBeenCalled();
  });

  it("calls getCommitHash to retrieve commit", async () => {
    const req = createRequest("/api/evidence", {
      headers: { "x-user-role": "SYSTEM_ADMIN" },
    });

    await GET(req);

    expect(mockedGetCommitHash).toHaveBeenCalled();
  });
});
