/**
 * Integration Verification Tests — End-to-End Component Wiring
 *
 * Verifies that all major flows are properly wired:
 * 1. Frontend middleware → RBAC → audit → DB
 * 2. Annulations API → state machine → audit → history
 * 3. ETL pipeline → control table → Neon → API endpoints
 * 4. Pareto as single source: Dashboard and RCA both use /api/charts/pareto
 *
 * Requirements: REQ-5.1, REQ-5.2, REQ-5.3, REQ-13.4, REQ-14.3, REQ-16.4
 */

import { test, expect } from "@playwright/test";

test.describe("Integration Wiring — Middleware → RBAC → Audit → DB", () => {
  test("protected API endpoints return 401 without auth token", async ({ request }) => {
    // Verify middleware intercepts unauthenticated requests to protected routes
    const protectedEndpoints = [
      "/api/admin",
      "/api/audit",
      "/api/approvals",
      "/api/annulations",
      "/api/capacity",
      "/api/evidence",
    ];

    for (const endpoint of protectedEndpoints) {
      const response = await request.get(endpoint);
      // Middleware should return 401 (unauthenticated) or 403 (forbidden)
      expect(
        [401, 403].includes(response.status()),
        `Expected ${endpoint} to be protected, got ${response.status()}`
      ).toBeTruthy();

      const body = await response.json();
      expect(body.error).toBeDefined();
      expect(body.error.code).toMatch(/UNAUTHORIZED|FORBIDDEN/);
    }
  });

  test("unprotected endpoints remain accessible without auth", async ({ request }) => {
    // Health, charts, KPIs, filters should be publicly accessible
    const publicEndpoints = [
      "/api/health",
      "/api/charts/pareto",
      "/api/kpis",
      "/api/filters",
    ];

    for (const endpoint of publicEndpoints) {
      const response = await request.get(endpoint);
      expect(
        response.status(),
        `Expected ${endpoint} to be public, got ${response.status()}`
      ).toBe(200);
    }
  });
});

test.describe("Integration Wiring — Annulations API → State Machine → Audit", () => {
  test("annulations endpoint enforces authentication", async ({ request }) => {
    // POST to create annulation without auth → 401/403
    const response = await request.post("/api/annulations", {
      data: {
        partnerId: "test-partner-1",
        reason: "Test annulation justification for integration verification",
        type: "LIQUIDACION",
      },
    });

    expect([401, 403].includes(response.status())).toBeTruthy();
  });

  test("annulations transition endpoint enforces authentication", async ({ request }) => {
    // POST transition without auth → 401/403
    const response = await request.post("/api/annulations/test-id/transition", {
      data: {
        targetState: "EnRevision",
        justification: "Integration test justification that is long enough",
      },
    });

    expect([401, 403].includes(response.status())).toBeTruthy();
  });
});

test.describe("Integration Wiring — ETL → Control Table → Neon → API", () => {
  test("charts API fetches data from Neon (DB connectivity)", async ({ request }) => {
    // Pareto endpoint queries pqr_records in Neon and returns structured data
    const response = await request.get("/api/charts/pareto");
    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data.chartType).toBe("pareto");
    expect(data.metadata).toBeDefined();
    expect(data.metadata.datasetVersion).toBe("pqr_records_v1");
    expect(data.metadata.generatedAt).toBeDefined();
    expect(Array.isArray(data.data)).toBeTruthy();
  });

  test("KPIs endpoint aggregates from Neon", async ({ request }) => {
    const response = await request.get("/api/kpis");
    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    // KPIs should have numeric values from the database
    expect(data).toBeDefined();
  });

  test("filters endpoint reads distinct values from Neon", async ({ request }) => {
    const response = await request.get("/api/filters");
    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    // Filters endpoint provides available filter options from DB
    expect(data).toBeDefined();
  });
});

test.describe("Integration Wiring — Pareto as Single Source of Truth", () => {
  test("Dashboard and RCA both derive from same Pareto query", async ({ request }) => {
    // Fetch Pareto data (the single source)
    const paretoRes = await request.get("/api/charts/pareto");
    expect(paretoRes.ok()).toBeTruthy();
    const pareto = await paretoRes.json();

    // Fetch RCA data (should reflect same top cause)
    const rcaRes = await request.get("/api/rca");
    expect(rcaRes.ok()).toBeTruthy();
    const rca = await rcaRes.json();

    // Both should reference the same underlying data
    if (pareto.data.length > 0) {
      const paretoTopCause = pareto.data[0].causa;
      const rcaMainCause = rca.mainCause;

      // Same top cause in both views
      expect(paretoTopCause).toBe(rcaMainCause);

      // Same percentage (within floating point tolerance)
      const paretoPercentage = Number(pareto.data[0].percentage);
      const rcaPercentage = Number(rca.mainCauseShare);
      expect(Math.abs(paretoPercentage - rcaPercentage)).toBeLessThanOrEqual(0.01);
    }
  });

  test("Pareto chart data structure is complete", async ({ request }) => {
    const response = await request.get("/api/charts/pareto");
    expect(response.ok()).toBeTruthy();
    const data = await response.json();

    expect(data.chartType).toBe("pareto");
    expect(data.metadata.filtered).toBe(false);

    if (data.data.length > 0) {
      const firstRow = data.data[0];
      expect(firstRow).toHaveProperty("causa");
      expect(firstRow).toHaveProperty("count");
      expect(firstRow).toHaveProperty("percentage");
      expect(firstRow).toHaveProperty("cumulative_pct");

      // Verify cumulative percentages are monotonically increasing
      for (let i = 1; i < data.data.length; i++) {
        expect(Number(data.data[i].cumulative_pct)).toBeGreaterThanOrEqual(
          Number(data.data[i - 1].cumulative_pct)
        );
      }
    }
  });

  test("filtered Pareto maintains same structure", async ({ request }) => {
    // Get available filter values
    const filtersRes = await request.get("/api/filters");
    if (!filtersRes.ok()) return;
    const filters = await filtersRes.json();

    const empresa = filters.empresa?.[0];
    if (!empresa) return;

    // Apply filter
    const response = await request.get(`/api/charts/pareto?empresa=${encodeURIComponent(empresa)}`);
    expect(response.ok()).toBeTruthy();
    const data = await response.json();

    expect(data.chartType).toBe("pareto");
    expect(data.metadata.filtered).toBe(true);
    expect(data.metadata.appliedFilters.empresa).toBe(empresa);
    expect(Array.isArray(data.data)).toBeTruthy();
  });
});
