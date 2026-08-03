import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

test.describe("Dashboard Error Diagnosis", () => {
  test("capture all errors from production dashboard", async ({ page }) => {
    const consoleMessages: string[] = [];
    const pageErrors: string[] = [];
    const failedRequests: string[] = [];
    const httpErrors: string[] = [];

    page.on("console", (message) => {
      const line = `[browser-console:${message.type()}] ${message.text()}`;
      consoleMessages.push(line);
      console.log(line);
    });

    page.on("pageerror", (error) => {
      const line = `[pageerror] ${error.message}\n${error.stack}`;
      pageErrors.push(line);
      console.log(line);
    });

    page.on("requestfailed", (request) => {
      const line = `[requestfailed] ${request.url()} ${JSON.stringify(request.failure())}`;
      failedRequests.push(line);
      console.log(line);
    });

    page.on("response", (response) => {
      if (response.status() >= 400) {
        const line = `[http-error] ${response.status()} ${response.url()}`;
        httpErrors.push(line);
        console.log(line);
      }
    });

    await page.goto("/", { waitUntil: "networkidle", timeout: 30000 });

    // Wait a bit for any delayed errors
    await page.waitForTimeout(3000);

    // Check what's visible
    const dashboardRoot = await page.getByTestId("dashboard-root").count();
    const pageErrorView = await page.getByTestId("page-error-view").count();
    const globalErrorView = await page.getByTestId("global-error-view").count();
    const errorText = await page.locator("text=Se presentó un error").count();

    console.log("\n=== VISIBILITY STATE ===");
    console.log(`dashboard-root: ${dashboardRoot}`);
    console.log(`page-error-view: ${pageErrorView}`);
    console.log(`global-error-view: ${globalErrorView}`);
    console.log(`error text visible: ${errorText}`);

    // Get page content for analysis
    const bodyText = await page.locator("body").textContent();
    console.log(`\n=== PAGE CONTENT (first 2000 chars) ===`);
    console.log(bodyText?.substring(0, 2000));

    // Save artifacts
    const artifactsDir = path.join(__dirname, "../../artifacts/errors");
    fs.mkdirSync(artifactsDir, { recursive: true });
    fs.mkdirSync(path.join(__dirname, "../../artifacts/screenshots"), { recursive: true });

    fs.writeFileSync(
      path.join(artifactsDir, "dashboard-console.txt"),
      consoleMessages.join("\n") || "(no console messages)"
    );
    fs.writeFileSync(
      path.join(artifactsDir, "dashboard-pageerror.txt"),
      pageErrors.join("\n") || "(no page errors)"
    );
    fs.writeFileSync(
      path.join(artifactsDir, "dashboard-http-errors.txt"),
      [...httpErrors, ...failedRequests].join("\n") || "(no http errors)"
    );

    await page.screenshot({
      path: path.join(__dirname, "../../artifacts/screenshots/dashboard-error-before.png"),
      fullPage: true,
    });

    // Output summary
    console.log("\n=== DIAGNOSIS SUMMARY ===");
    console.log(`Console errors: ${consoleMessages.filter(m => m.includes(":error]")).length}`);
    console.log(`Page errors: ${pageErrors.length}`);
    console.log(`HTTP errors: ${httpErrors.length}`);
    console.log(`Failed requests: ${failedRequests.length}`);

    // This test always passes - it's diagnostic
    expect(true).toBe(true);
  });
});
