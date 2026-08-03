import { describe, it, expect } from "vitest";
import { buildExecutivePareto } from "@/lib/charts/pareto";

describe("buildExecutivePareto", () => {
  const sampleData = [
    { causa: "A", count: 500, percentage: 50, cumulative_pct: 50 },
    { causa: "B", count: 200, percentage: 20, cumulative_pct: 70 },
    { causa: "C", count: 120, percentage: 12, cumulative_pct: 82 },
    { causa: "D", count: 80, percentage: 8, cumulative_pct: 90 },
    { causa: "E", count: 50, percentage: 5, cumulative_pct: 95 },
    { causa: "F", count: 30, percentage: 3, cumulative_pct: 98 },
    { causa: "G", count: 20, percentage: 2, cumulative_pct: 100 },
  ];

  it("preserves total count", () => {
    const result = buildExecutivePareto(sampleData);
    const totalResult = result.data.reduce((sum, d) => sum + d.count, 0);
    const totalInput = sampleData.reduce((sum, d) => sum + d.count, 0);
    expect(totalResult).toBe(totalInput);
  });

  it("reaches 80% with core causes", () => {
    const result = buildExecutivePareto(sampleData);
    expect(result.coreCauseCount).toBeGreaterThan(0);
    expect(result.coreCumulativePct).toBeGreaterThanOrEqual(80);
  });

  it("separates core and context", () => {
    const result = buildExecutivePareto(sampleData);
    expect(result.contextCauseCount).toBeGreaterThanOrEqual(0);
    expect(result.displayedIndividualCount).toBe(result.coreCauseCount + result.contextCauseCount);
  });

  it("last cumulative is 100", () => {
    const result = buildExecutivePareto(sampleData);
    const lastItem = result.data[result.data.length - 1];
    expect(lastItem.cumulative_pct).toBe(100);
  });

  it("max 11 items including Otras", () => {
    const manyItems = Array.from({ length: 50 }, (_, i) => ({
      causa: `Cause ${i}`, count: 50 - i, percentage: (50 - i) / 12.75 * 100, cumulative_pct: 0,
    }));
    const result = buildExecutivePareto(manyItems);
    expect(result.data.length).toBeLessThanOrEqual(11);
  });

  it("handles empty input", () => {
    const result = buildExecutivePareto([]);
    expect(result.data).toEqual([]);
    expect(result.coreCauseCount).toBe(0);
  });

  it("handles single cause", () => {
    const result = buildExecutivePareto([{ causa: "Only", count: 100, percentage: 100, cumulative_pct: 100 }]);
    expect(result.data.length).toBe(1);
    expect(result.coreCauseCount).toBe(1);
  });
});
