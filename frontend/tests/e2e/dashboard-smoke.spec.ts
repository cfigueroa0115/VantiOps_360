import { test, expect } from "@playwright/test";

test.describe("Dashboard Smoke Test", () => {
  test("dashboard loads without errors", async ({ page }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    const failedResponses: string[] = [];

    page.on("console", (message) => {
      if (message.type() === "error") {
        consoleErrors.push(message.text());
      }
    });

    page.on("pageerror", (error) => {
      pageErrors.push(error.message);
    });

    page.on("response", (response) => {
      if (response.status() >= 500) {
        failedResponses.push(`${response.status()} ${response.url()}`);
      }
    });

    await page.goto("/", { waitUntil: "networkidle" });

    // Dashboard is functional
    await expect(page.getByTestId("dashboard-root")).toBeVisible();
    await expect(page.getByTestId("kpi-section")).toBeVisible();
    await expect(page.getByTestId("pareto-chart")).toBeVisible();

    // Error views are absent
    await expect(page.getByTestId("global-error-view")).toHaveCount(0);
    await expect(page.getByTestId("page-error-view")).toHaveCount(0);

    // Real content visible
    await expect(page.getByText("Total PQR")).toBeVisible();
    await expect(page.getByText("Diagrama de Pareto — Causas Principales")).toBeVisible();

    // No errors
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
    expect(failedResponses).toEqual([]);
  });

  test("captures screenshot", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    await expect(page.getByTestId("dashboard-root")).toBeVisible();
    await page.screenshot({ path: "artifacts/screenshots/dashboard-local.png", fullPage: true });
  });
});
