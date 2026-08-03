import { describe, it, expect } from "vitest";
import { asFiniteNumber, formatPercent, formatDecimal, formatInteger } from "@/lib/charts/number-format";

describe("asFiniteNumber", () => {
  it("passes through finite numbers", () => { expect(asFiniteNumber(42)).toBe(42); });
  it("converts string numbers", () => { expect(asFiniteNumber("3.14")).toBe(3.14); });
  it("returns 0 for null", () => { expect(asFiniteNumber(null)).toBe(0); });
  it("returns 0 for undefined", () => { expect(asFiniteNumber(undefined)).toBe(0); });
  it("returns 0 for NaN", () => { expect(asFiniteNumber(NaN)).toBe(0); });
  it("returns 0 for Infinity", () => { expect(asFiniteNumber(Infinity)).toBe(0); });
  it("returns 0 for text", () => { expect(asFiniteNumber("abc")).toBe(0); });
  it("returns 0 for empty string", () => { expect(asFiniteNumber("")).toBe(0); });
});

describe("formatPercent", () => {
  it("formats number", () => { expect(formatPercent(50.123)).toBe("50.1%"); });
  it("formats string number", () => { expect(formatPercent("85.67")).toBe("85.7%"); });
  it("handles null safely", () => { expect(formatPercent(null)).toBe("0.0%"); });
});

describe("formatDecimal", () => {
  it("formats to 1 decimal by default", () => { expect(formatDecimal(6.32)).toBe("6.3"); });
  it("formats to 2 decimals", () => { expect(formatDecimal(6.321, 2)).toBe("6.32"); });
});

describe("formatInteger", () => {
  it("formats with thousands separator", () => {
    const result = formatInteger(51008);
    expect(result).toContain("51");
    expect(result.length).toBeGreaterThan(4); // has separator
  });
});
