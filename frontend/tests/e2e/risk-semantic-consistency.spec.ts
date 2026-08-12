import { test, expect } from "@playwright/test";

/**
 * Risk Data Truth Gate — E2E Semantic Consistency
 *
 * Validates that the API response and UI display are consistent:
 * artifact → API → UI (no silent divergence).
 *
 * This test does NOT hardcode expected metric values.
 * It dynamically reads from the API and compares against what the UI shows.
 */

function formatPct(v: number): string {
  return `${(v * 100).toFixed(2)}%`;
}

test.describe("Risk Semantic Consistency — API vs UI", () => {
  test("API returns valid risk model with all required fields", async ({ request }) => {
    const response = await request.get("/api/risk/model");
    expect(response.status()).toBe(200);

    const data = await response.json();

    // Required fields exist
    expect(data.modelType).toBeDefined();
    expect(typeof data.modelType).toBe("string");
    expect(data.modelType.length).toBeGreaterThan(0);

    // Metrics exist and are finite numbers in [0, 1]
    expect(data.metrics).toBeDefined();
    expect(typeof data.metrics.precision).toBe("number");
    expect(Number.isFinite(data.metrics.precision)).toBe(true);
    expect(data.metrics.precision).toBeGreaterThanOrEqual(0);
    expect(data.metrics.precision).toBeLessThanOrEqual(1);

    expect(typeof data.metrics.recall).toBe("number");
    expect(Number.isFinite(data.metrics.recall)).toBe(true);
    expect(data.metrics.recall).toBeGreaterThanOrEqual(0);
    expect(data.metrics.recall).toBeLessThanOrEqual(1);

    expect(typeof data.metrics.f1Score).toBe("number");
    expect(Number.isFinite(data.metrics.f1Score)).toBe(true);
    expect(data.metrics.f1Score).toBeGreaterThanOrEqual(0);
    expect(data.metrics.f1Score).toBeLessThanOrEqual(1);

    expect(typeof data.metrics.rocAuc).toBe("number");
    expect(Number.isFinite(data.metrics.rocAuc)).toBe(true);
    expect(data.metrics.rocAuc).toBeGreaterThanOrEqual(0);
    expect(data.metrics.rocAuc).toBeLessThanOrEqual(1);

    // Provenance
    expect(data.dataProvenance).toBe("DERIVED_DATA");

    // Disclaimer present
    expect(data.disclaimer).toBeDefined();
    expect(data.disclaimer.length).toBeGreaterThan(0);
  });

  test("UI displays same data as API — full semantic match", async ({ page, request }) => {
    // Step 1: Get API data
    const apiResponse = await request.get("/api/risk/model");
    expect(apiResponse.status()).toBe(200);
    const apiData = await apiResponse.json();

    // Step 2: Navigate to /riesgo
    await page.goto("/riesgo");
    await page.waitForLoadState("networkidle");

    // Step 3: Verify model type matches
    const modelTypeEl = page.locator("[data-testid='model-type']");
    await expect(modelTypeEl).toBeVisible();
    const modelTypeText = await modelTypeEl.textContent();

    // The UI translates model type to Spanish label
    const modelTypeMap: Record<string, string> = {
      logistic_regression: "Regresión Logística",
      gradient_boosting: "Gradient Boosting",
      random_forest: "Random Forest",
      xgboost: "XGBoost",
    };
    const expectedLabel = modelTypeMap[apiData.modelType] || apiData.modelType;
    expect(modelTypeText).toContain(expectedLabel);

    // Step 4: Verify precision matches
    const precisionEl = page.locator("[data-testid='metric-precision']");
    await expect(precisionEl).toBeVisible();
    const precisionText = await precisionEl.textContent();
    expect(precisionText).toContain(formatPct(apiData.metrics.precision));

    // Step 5: Verify recall matches
    const recallEl = page.locator("[data-testid='metric-recall']");
    await expect(recallEl).toBeVisible();
    const recallText = await recallEl.textContent();
    expect(recallText).toContain(formatPct(apiData.metrics.recall));

    // Step 6: Verify F1 matches
    const f1El = page.locator("[data-testid='metric-f1']");
    await expect(f1El).toBeVisible();
    const f1Text = await f1El.textContent();
    expect(f1Text).toContain(formatPct(apiData.metrics.f1Score));

    // Step 7: Verify ROC-AUC matches
    const rocAucEl = page.locator("[data-testid='metric-roc_auc']");
    await expect(rocAucEl).toBeVisible();
    const rocAucText = await rocAucEl.textContent();
    expect(rocAucText).toContain(formatPct(apiData.metrics.rocAuc));

    // Step 8: Verify provenance is visible
    const provenanceEl = page.locator("[data-testid='provenance']");
    await expect(provenanceEl).toBeVisible();
    const provenanceText = await provenanceEl.textContent();
    expect(provenanceText).toContain("DERIVED_DATA");

    // Step 9: Verify disclaimer is present
    const disclaimerEl = page.locator("[data-testid='disclaimer']");
    await expect(disclaimerEl).toBeVisible();
    const disclaimerText = await disclaimerEl.textContent();
    expect(disclaimerText!.length).toBeGreaterThan(0);
  });

  test("no divergent metrics — UI shows exactly API values", async ({ page, request }) => {
    const apiResponse = await request.get("/api/risk/model");
    expect(apiResponse.status()).toBe(200);
    const apiData = await apiResponse.json();

    await page.goto("/riesgo");
    await page.waitForLoadState("networkidle");

    // Collect all displayed metric values
    const metricKeys = ["precision", "recall", "f1", "roc_auc"];
    const apiValues = [
      apiData.metrics.precision,
      apiData.metrics.recall,
      apiData.metrics.f1Score,
      apiData.metrics.rocAuc,
    ];

    for (let i = 0; i < metricKeys.length; i++) {
      const el = page.locator(`[data-testid='metric-${metricKeys[i]}']`);
      const text = await el.textContent();
      const expected = formatPct(apiValues[i]);
      expect(text).toContain(expected);
    }
  });
});
