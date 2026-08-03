import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

test.describe("Production Screenshot Capture", () => {
  test("capture production dashboard desktop", async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto("/", { waitUntil: "networkidle" });
    await expect(page.getByTestId("dashboard-root")).toBeVisible();
    await expect(page.getByTestId("kpi-section")).toBeVisible();
    await expect(page.getByTestId("pareto-chart")).toBeVisible();

    const dir = path.join(__dirname, "../../artifacts/screenshots");
    fs.mkdirSync(dir, { recursive: true });
    await page.screenshot({ path: path.join(dir, "dashboard-production.png"), fullPage: true });
  });

  test("capture production dashboard mobile", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/", { waitUntil: "networkidle" });
    await expect(page.getByTestId("dashboard-root")).toBeVisible();

    const dir = path.join(__dirname, "../../artifacts/screenshots");
    fs.mkdirSync(dir, { recursive: true });
    await page.screenshot({ path: path.join(dir, "dashboard-production-mobile.png"), fullPage: true });
  });
});
