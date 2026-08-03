import { describe, it, expect } from "vitest";

// Import the public interface
import { parseFiltersFromRequest, FilterValidationError } from "@/lib/server/query-filters";

function makeRequest(params: Record<string, string>): Request {
  const url = new URL("http://localhost/api/test");
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return new Request(url.toString());
}

describe("query-filters date validation", () => {
  it("accepts 2024-02-29 (leap year)", () => {
    expect(() => parseFiltersFromRequest(makeRequest({ date_start: "2024-02-29" }))).not.toThrow();
  });

  it("rejects 2025-02-29 (not leap year)", () => {
    expect(() => parseFiltersFromRequest(makeRequest({ date_start: "2025-02-29" }))).toThrow(FilterValidationError);
  });

  it("rejects 2026-02-30", () => {
    expect(() => parseFiltersFromRequest(makeRequest({ date_start: "2026-02-30" }))).toThrow(FilterValidationError);
  });

  it("rejects 2026-04-31", () => {
    expect(() => parseFiltersFromRequest(makeRequest({ date_start: "2026-04-31" }))).toThrow(FilterValidationError);
  });

  it("rejects month 13", () => {
    expect(() => parseFiltersFromRequest(makeRequest({ date_start: "2026-13-01" }))).toThrow(FilterValidationError);
  });

  it("rejects month 00", () => {
    expect(() => parseFiltersFromRequest(makeRequest({ date_start: "2026-00-10" }))).toThrow(FilterValidationError);
  });

  it("rejects day 00", () => {
    expect(() => parseFiltersFromRequest(makeRequest({ date_start: "2026-01-00" }))).toThrow(FilterValidationError);
  });

  it("rejects text", () => {
    expect(() => parseFiltersFromRequest(makeRequest({ date_start: "not-a-date" }))).toThrow(FilterValidationError);
  });

  it("rejects date_start > date_end", () => {
    expect(() => parseFiltersFromRequest(makeRequest({ date_start: "2025-06-01", date_end: "2025-01-01" }))).toThrow(FilterValidationError);
  });

  it("accepts valid range", () => {
    const filters = parseFiltersFromRequest(makeRequest({ date_start: "2024-01-01", date_end: "2024-12-31" }));
    expect(filters.dateStart).toBe("2024-01-01");
    expect(filters.dateEnd).toBe("2024-12-31");
  });
});
