import { describe, it, expect } from "vitest";
import { buildExecutivePareto } from "@/lib/charts/pareto";

describe("buildExecutivePareto with 73 elements", () => {
  // Create realistic fixture of 73 causes with descending counts
  const fixture = Array.from({ length: 73 }, (_, i) => ({
    causa: `Causa ${String(i + 1).padStart(2, "0")}`,
    count: Math.max(1, Math.round(25000 * Math.pow(0.85, i))),
    percentage: 0,
    cumulative_pct: 0,
  }));
  // Recompute percentages
  const totalInput = fixture.reduce((s, d) => s + d.count, 0);
  let cum = 0;
  fixture.forEach(d => {
    d.percentage = (d.count / totalInput) * 100;
    cum += d.percentage;
    d.cumulative_pct = cum;
  });

  const result = buildExecutivePareto(fixture);

  it("produces max 11 bars", () => {
    expect(result.data.length).toBeLessThanOrEqual(11);
  });

  it("preserves total count exactly", () => {
    const totalResult = result.data.reduce((s, d) => s + d.count, 0);
    expect(totalResult).toBe(totalInput);
  });

  it("last cumulative is 100", () => {
    expect(result.data[result.data.length - 1].cumulative_pct).toBe(100);
  });

  it("Otras causas contains the remainder", () => {
    const otras = result.data.find(d => d.aggregated);
    if (otras) {
      const displayedSum = result.data.filter(d => !d.aggregated).reduce((s, d) => s + d.count, 0);
      expect(otras.count).toBe(totalInput - displayedSum);
    }
  });

  it("no cumulative exceeds 100", () => {
    result.data.forEach(d => {
      expect(d.cumulative_pct).toBeLessThanOrEqual(100);
    });
  });

  it("coreCumulativePct >= 80", () => {
    expect(result.coreCumulativePct).toBeGreaterThanOrEqual(80);
  });

  it("data is in descending order by count", () => {
    for (let i = 0; i < result.data.length - 1; i++) {
      // "Otras causas" may be at the end with a smaller count than the last individual
      if (!result.data[i + 1].aggregated) {
        expect(result.data[i].count).toBeGreaterThanOrEqual(result.data[i + 1].count);
      }
    }
  });

  it("no negative percentages", () => {
    result.data.forEach(d => {
      expect(d.percentage).toBeGreaterThanOrEqual(0);
    });
  });
});
