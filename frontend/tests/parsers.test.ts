import { describe, it, expect } from "vitest";
import { parseParetoData, parseCancellationData, parseP90Data } from "@/lib/charts/parsers";

describe("parseParetoData", () => {
  it("parses valid data", () => {
    const result = parseParetoData([{ causa: "X", count: 10, percentage: 50, cumulative_pct: 50 }]);
    expect(result[0].count).toBe(10);
    expect(typeof result[0].percentage).toBe("number");
  });

  it("returns empty for non-array", () => {
    expect(parseParetoData(null)).toEqual([]);
    expect(parseParetoData(undefined)).toEqual([]);
    expect(parseParetoData("text")).toEqual([]);
  });

  it("handles string numbers", () => {
    const result = parseParetoData([{ causa: "Y", count: "42", percentage: "85.5", cumulative_pct: "85.5" }]);
    expect(result[0].count).toBe(42);
    expect(result[0].percentage).toBe(85.5);
  });

  it("handles null values (becomes 0)", () => {
    const result = parseParetoData([{ causa: "Z", count: null, percentage: null, cumulative_pct: null }]);
    expect(result[0].count).toBe(0);
  });
});

describe("parseCancellationData", () => {
  it("parses valid donut data", () => {
    const result = parseCancellationData([{ category: "Main", count: 100, percentage: 49.96 }]);
    expect(result[0].percentage).toBe(49.96);
  });

  it("handles invalid input", () => {
    expect(parseCancellationData(null)).toEqual([]);
    expect(parseCancellationData({})).toEqual([]);
  });
});

describe("parseP90Data", () => {
  it("parses P90 data with string numbers", () => {
    const result = parseP90Data([{ causa: "X", p90: "12.5", count: 30 }]);
    expect(result[0].p90).toBe(12.5);
    expect(typeof result[0].p90).toBe("number");
  });
});
