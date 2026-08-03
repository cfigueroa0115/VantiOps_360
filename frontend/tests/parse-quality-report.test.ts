import { describe, it, expect } from "vitest";
import { parseQualityReport } from "@/lib/quality/parse-quality-report";

describe("parseQualityReport", () => {
  const validDimensions = {
    completeness: 95.2,
    validity: 88.1,
    consistency: 91.0,
    uniqueness: 99.5,
    timeliness: 72.3,
    domainConformity: 84.6,
  };

  it("1. Valid numeric overallScore + dimensions → ok: true", () => {
    const input: unknown = { overallScore: 85.5, dimensions: validDimensions };
    const result = parseQualityReport(input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.overallScore).toBe(85.5);
      expect(result.data.dimensions.completeness).toBe(95.2);
    }
  });

  it("2. overallScore as string '85.5' → ok: true with 85.5", () => {
    const input: unknown = { overallScore: "85.5", dimensions: validDimensions };
    const result = parseQualityReport(input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.overallScore).toBe(85.5);
    }
  });

  it("3. Dimension as string '92.3' → ok: true", () => {
    const input: unknown = {
      overallScore: 80,
      dimensions: { ...validDimensions, completeness: "92.3" },
    };
    const result = parseQualityReport(input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.dimensions.completeness).toBe(92.3);
    }
  });

  it("4. Dimension null → ok: false", () => {
    const input: unknown = {
      overallScore: 80,
      dimensions: { ...validDimensions, validity: null },
    };
    const result = parseQualityReport(input);
    expect(result.ok).toBe(false);
  });

  it("5. Dimension undefined → ok: false", () => {
    const input: unknown = {
      overallScore: 80,
      dimensions: { ...validDimensions, consistency: undefined },
    };
    const result = parseQualityReport(input);
    expect(result.ok).toBe(false);
  });

  it("6. Dimension 'abc' (invalid) → ok: false", () => {
    const input: unknown = {
      overallScore: 80,
      dimensions: { ...validDimensions, uniqueness: "abc" },
    };
    const result = parseQualityReport(input);
    expect(result.ok).toBe(false);
  });

  it("7. Dimensions object missing → ok: false", () => {
    const input: unknown = { overallScore: 80 };
    const result = parseQualityReport(input);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("dimensions");
    }
  });

  it("8. Real zero (0) is valid → ok: true with 0", () => {
    const input: unknown = {
      overallScore: 0,
      dimensions: {
        completeness: 0,
        validity: 0,
        consistency: 0,
        uniqueness: 0,
        timeliness: 0,
        domainConformity: 0,
      },
    };
    const result = parseQualityReport(input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.overallScore).toBe(0);
      expect(result.data.dimensions.completeness).toBe(0);
    }
  });

  it("9. NaN → ok: false", () => {
    const input: unknown = { overallScore: NaN, dimensions: validDimensions };
    const result = parseQualityReport(input);
    expect(result.ok).toBe(false);
  });

  it("10. Infinity → ok: false", () => {
    const input: unknown = { overallScore: Infinity, dimensions: validDimensions };
    const result = parseQualityReport(input);
    expect(result.ok).toBe(false);
  });
});
