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

// All protected routes that should have visual baselines
const PROTECTED_ROUTES = [
  { path: "/", name: "dashboard" },
  { path: "/anulaciones", name: "anulaciones" },
  { path: "/auditoria", name: "auditoria" },
  { path: "/aprobaciones", name: "aprobaciones" },
  { path: "/capacidad", name: "capacidad" },
  { path: "/evidencia", name: "evidencia" },
  { path: "/admin", name: "admin" },
];

// 0.1% pixel difference threshold
const MAX_DIFF_PIXEL_RATIO = 0.001;

test.describe("Visual Regression — Screenshot Baselines", () => {
  for (const route of PROTECTED_ROUTES) {
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
