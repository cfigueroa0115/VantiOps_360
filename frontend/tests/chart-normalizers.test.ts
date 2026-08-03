import { describe, it, expect } from "vitest";
import { normalizeParetoRows, normalizeCancellationRows, normalizeP90Rows } from "@/lib/server/chart-normalizers";

describe("chart-normalizers", () => {
  it("converts string numbers to real numbers", () => {
    const rows = [{ causa: "Test", count: 100, percentage: "50.08", cumulative_pct: "50.08" }];
    const result = normalizeParetoRows(rows as any);
    expect(typeof result[0].percentage).toBe("number");
    expect(typeof result[0].cumulative_pct).toBe("number");
    expect(result[0].percentage).toBe(50.08);
  });

  it("keeps real numbers unchanged", () => {
    const rows = [{ causa: "Test", count: 42, percentage: 30.5, cumulative_pct: 30.5 }];
    const result = normalizeParetoRows(rows);
    expect(result[0].count).toBe(42);
    expect(result[0].percentage).toBe(30.5);
  });

  it("handles null gracefully (returns 0)", () => {
    const rows = [{ causa: "X", count: null, percentage: null, cumulative_pct: null }];
    const result = normalizeParetoRows(rows as any);
    expect(result[0].count).toBe(0);
    expect(result[0].percentage).toBe(0);
  });

  it("handles text gracefully (returns 0)", () => {
    const rows = [{ causa: "X", count: "abc", percentage: "xyz", cumulative_pct: "!" }];
    const result = normalizeParetoRows(rows as any);
    expect(result[0].count).toBe(0);
  });

  it("normalizes cancellation donut strings", () => {
    const rows = [{ category: "Main", count: 100, percentage: "49.96" }];
    const result = normalizeCancellationRows(rows as any);
    expect(result[0].percentage).toBe(49.96);
    expect(typeof result[0].percentage).toBe("number");
  });

  it("normalizes P90 strings", () => {
    const rows = [{ causa: "X", p90: "12.50", count: 30 }];
    const result = normalizeP90Rows(rows as any);
    expect(result[0].p90).toBe(12.5);
  });
});
