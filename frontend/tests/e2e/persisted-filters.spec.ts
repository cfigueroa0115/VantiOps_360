import { test, expect } from "@playwright/test";

test.describe("Dashboard with corrupted sessionStorage", () => {
  const cases = [
    { name: "invalid JSON", value: "{invalid-json" },
    { name: "object instead of array", value: JSON.stringify({ companies: { value: "VANTI" } }) },
    { name: "legacy format", value: JSON.stringify({ company: "VANTI", status: "cerrado" }) },
    { name: "wrong types", value: JSON.stringify({ companies: 123, causes: {}, channels: "telefónico", statuses: null, results: [1, 2, 3], responsibleUnits: [null, {}], dateRange: "2026", managementTimeRange: [] }) },
    { name: "null root", value: "null" },
    { name: "array root", value: JSON.stringify(["VANTI"]) },
  ];

  for (const { name, value } of cases) {
    test(`recovers from corrupted sessionStorage: ${name}`, async ({ page }) => {
      const pageErrors: string[] = [];

      page.on("pageerror", (error) => {
        pageErrors.push(error.message);
      });

      // Inject corrupted sessionStorage BEFORE navigation
      await page.addInitScript((val) => {
        sessionStorage.setItem("pqr-analytics-filters", val);
      }, value);

      await page.goto("/", { waitUntil: "networkidle" });

      // Dashboard must be functional (renders without crashing)
      await expect(page.getByTestId("dashboard-root")).toBeVisible();
      await expect(page.getByTestId("kpi-section")).toBeVisible();
      await expect(page.getByTestId("pareto-chart")).toBeVisible();

      // Error views must be absent — corrupted filters must NOT crash the page
      await expect(page.getByTestId("page-error-view")).toHaveCount(0);
      await expect(page.getByTestId("global-error-view")).toHaveCount(0);

      // No uncaught runtime exceptions (page errors from corrupted data)
      expect(pageErrors).toEqual([]);
    });
  }

  test("preserves valid V1 filters after reload", async ({ page }) => {
    const validState = JSON.stringify({
      version: 1,
      filters: { companies: ["VANTI S.A. ESP"] },
    });

    await page.addInitScript((val) => {
      sessionStorage.setItem("pqr-analytics-filters", val);
    }, validState);

    await page.goto("/", { waitUntil: "networkidle" });
    await expect(page.getByTestId("dashboard-root")).toBeVisible();

    // Reload and verify still works
    await page.reload({ waitUntil: "networkidle" });
    await expect(page.getByTestId("dashboard-root")).toBeVisible();
    await expect(page.getByTestId("page-error-view")).toHaveCount(0);
  });

  test("clean context works normally", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    await expect(page.getByTestId("dashboard-root")).toBeVisible();
    await expect(page.getByTestId("kpi-section")).toBeVisible();
    await expect(page.getByTestId("pareto-chart")).toBeVisible();
    await expect(page.getByTestId("page-error-view")).toHaveCount(0);
  });
});
