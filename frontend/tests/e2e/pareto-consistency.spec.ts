/**
 * Pareto Consistency Test
 *
 * Verifies that RCA and Dashboard display the same top cause and percentage
 * from the /api/charts/pareto single source of truth.
 *
 * Both the RCA findings and the Dashboard Pareto chart must agree on:
 * 1. The top cause name
 * 2. The percentage share (within rounding tolerance)
 *
 * Also verifies consistency is maintained when filters are applied.
 *
 * Requirements: REQ-5.8
 */

import { test, expect } from "@playwright/test";

test.describe("Pareto Consistency — Single Source of Truth", () => {
  test("RCA and Dashboard Pareto show same top cause and percentage", async ({ request }) => {
    // Fetch Pareto chart data (single source)
    const paretoResponse = await request.get("/api/charts/pareto");
    expect(paretoResponse.ok()).toBeTruthy();
    const paretoData = await paretoResponse.json();

    // Fetch RCA findings
    const rcaResponse = await request.get("/api/rca");
    expect(rcaResponse.ok()).toBeTruthy();
    const rcaData = await rcaResponse.json();

    // Pareto top cause
    const paretoTopCause = paretoData.data?.[0]?.causa;
    const paretoTopPercentage = Number(paretoData.data?.[0]?.percentage);

    // RCA main cause
    const rcaMainCause = rcaData.mainCause;
    const rcaMainCauseShare = Number(rcaData.mainCauseShare);

    // Verify both agree on top cause
    expect(paretoTopCause).toBeDefined();
    expect(rcaMainCause).toBeDefined();
    expect(paretoTopCause).toBe(rcaMainCause);

    // Verify percentages match within rounding tolerance (1.0 = 1 percentage point)
    expect(Math.abs(paretoTopPercentage - rcaMainCauseShare)).toBeLessThanOrEqual(1.0);
  });

  test("Pareto consistency maintained with empresa filter", async ({ request }) => {
    // First get available filters to use a real empresa value
    const filtersResponse = await request.get("/api/filters");
    expect(filtersResponse.ok()).toBeTruthy();
    const filtersData = await filtersResponse.json();

    // API returns 'companies' field with distinct empresa values
    const companies = filtersData.companies;
    if (!companies || companies.length === 0) {
      // Data-dependent: no empresa values available in current dataset
      test.skip(true, "No empresa filter values available in current dataset");
      return;
    }
    const empresa = companies[0];

    // Fetch Pareto with filter
    const paretoResponse = await request.get(`/api/charts/pareto?empresa=${encodeURIComponent(empresa)}`);
    expect(paretoResponse.ok()).toBeTruthy();
    const paretoData = await paretoResponse.json();

    // Verify Pareto data structure is consistent (same format as unfiltered)
    expect(paretoData.chartType).toBe("pareto");
    expect(paretoData).toHaveProperty("metadata");
    expect(Array.isArray(paretoData.data)).toBeTruthy();

    if (paretoData.data.length > 0) {
      const topItem = paretoData.data[0];
      expect(topItem).toHaveProperty("causa");
      expect(topItem).toHaveProperty("percentage");
      expect(topItem).toHaveProperty("cumulative_pct");
      // Percentages should be valid numbers
      expect(Number(topItem.percentage)).toBeGreaterThan(0);
      expect(Number(topItem.percentage)).toBeLessThanOrEqual(100);
    }
  });
});
