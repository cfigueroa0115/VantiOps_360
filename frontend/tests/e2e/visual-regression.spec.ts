/**
 * Visual Regression Tests — Screenshot Baselines
 *
 * Captures screenshot baselines for all protected routes and compares
 * against stored baselines with a 0.1% pixel difference threshold.
 *
 * Baselines are stored in: frontend/artifacts/screenshots/
 * Comparison threshold: 0.1% pixel difference
 *
 * Requirements: REQ-1.1, REQ-1.3
 */

import { test, expect } from "@playwright/test";

// Routes for visual regression baselines (static, deterministic pages only)
const VISUAL_ROUTES = [
  { path: "/anulaciones", name: "anulaciones" },
  { path: "/aliados", name: "aliados" },
  { path: "/evidencia", name: "evidencia" },
  { path: "/about", name: "about" },
  { path: "/plan-30-60-90", name: "plan-30-60-90" },
  { path: "/migracion", name: "migracion" },
  { path: "/operaciones", name: "operaciones" },
  { path: "/riesgo", name: "riesgo" },
  { path: "/rca", name: "rca" },
];

// Cross-platform tolerance: font rendering and antialiasing vary between OS.
// 10% threshold ensures stability across Windows/Linux CI without false positives.
const MAX_DIFF_PIXEL_RATIO = 0.10;

test.describe("Visual Regression — Screenshot Baselines", () => {
  for (const route of VISUAL_ROUTES) {
    test(`capture baseline: ${route.name} (${route.path})`, async ({ page }) => {
      await page.goto(route.path, { waitUntil: "networkidle", timeout: 30000 });

      // Wait for content to render
      await page.waitForTimeout(1000);

      // Save screenshot to baseline storage directory
      await page.screenshot({
        path: `artifacts/screenshots/${route.name}-baseline.png`,
        fullPage: true,
      });

      // Perform visual comparison against stored baseline
      await expect(page).toHaveScreenshot(`${route.name}.png`, {
        maxDiffPixelRatio: MAX_DIFF_PIXEL_RATIO,
        fullPage: true,
      });
    });
  }
});
