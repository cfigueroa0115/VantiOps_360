import { describe, it, expect } from "vitest";
import {
  parseParetoData,
  parseTopCauseData,
  parseCancellationData,
  parseDistributionData,
  parseTemporalData,
  parseP90Data,
  parseHistogramData,
} from "@/lib/charts/parsers";
import { formatMetric } from "@/lib/charts/number-format";
import { parseQualityReport } from "@/lib/quality/parse-quality-report";

describe("Dashboard runtime safety", () => {
  describe("Parsers don't throw on empty/null/undefined", () => {
    const inputs: unknown[] = [null, undefined, [], "", 0, {}, false];

    it("parseParetoData handles all edge inputs without throwing", () => {
      for (const input of inputs) {
        expect(() => parseParetoData(input)).not.toThrow();
      }
    });

    it("parseTopCauseData handles all edge inputs without throwing", () => {
      for (const input of inputs) {
        expect(() => parseTopCauseData(input)).not.toThrow();
      }
    });

    it("parseCancellationData handles all edge inputs without throwing", () => {
      for (const input of inputs) {
        expect(() => parseCancellationData(input)).not.toThrow();
      }
    });

    it("parseDistributionData handles all edge inputs without throwing", () => {
      for (const input of inputs) {
        expect(() => parseDistributionData(input)).not.toThrow();
      }
    });

    it("parseTemporalData handles all edge inputs without throwing", () => {
      for (const input of inputs) {
        expect(() => parseTemporalData(input)).not.toThrow();
      }
    });

    it("parseP90Data handles all edge inputs without throwing", () => {
      for (const input of inputs) {
        expect(() => parseP90Data(input)).not.toThrow();
      }
    });

    it("parseHistogramData handles all edge inputs without throwing", () => {
      for (const input of inputs) {
        expect(() => parseHistogramData(input)).not.toThrow();
      }
    });
  });

  describe("formatMetric returns '—' for null/undefined/NaN/Infinity/empty", () => {
    it("returns '—' for null", () => {
      expect(formatMetric(null)).toBe("—");
    });

    it("returns '—' for undefined", () => {
      expect(formatMetric(undefined)).toBe("—");
    });

    it("returns '—' for NaN", () => {
      expect(formatMetric(NaN)).toBe("—");
    });

    it("returns '—' for Infinity", () => {
      expect(formatMetric(Infinity)).toBe("—");
    });

    it("returns '—' for empty string", () => {
      expect(formatMetric("")).toBe("—");
    });

    it("returns '—' for whitespace-only string", () => {
      expect(formatMetric("   ")).toBe("—");
    });
  });

  describe("formatMetric returns '0.0%' for real zero", () => {
    it("returns '0.0%' for numeric zero", () => {
      expect(formatMetric(0)).toBe("0.0%");
    });

    it("returns '0.0%' for string '0'", () => {
      expect(formatMetric("0")).toBe("0.0%");
    });
  });

  describe("parseQualityReport returns ok:false for invalid structures", () => {
    it("returns ok:false for null", () => {
      const result = parseQualityReport(null);
      expect(result.ok).toBe(false);
    });

    it("returns ok:false for undefined", () => {
      const result = parseQualityReport(undefined);
      expect(result.ok).toBe(false);
    });

    it("returns ok:false for a string", () => {
      const input: unknown = "not an object";
      const result = parseQualityReport(input);
      expect(result.ok).toBe(false);
    });

    it("returns ok:false for missing overallScore", () => {
      const input: unknown = { dimensions: {} };
      const result = parseQualityReport(input);
      expect(result.ok).toBe(false);
    });

    it("returns ok:false for overallScore > 100", () => {
      const input: unknown = {
        overallScore: 101,
        dimensions: {
          completeness: 50,
          validity: 50,
          consistency: 50,
          uniqueness: 50,
          timeliness: 50,
          domainConformity: 50,
        },
      };
      const result = parseQualityReport(input);
      expect(result.ok).toBe(false);
    });
  });
});
