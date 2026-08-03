import { describe, it, expect } from "vitest";
import { parsePersistedFilterState } from "@/lib/filters/parse-persisted-filters";

describe("parsePersistedFilterState", () => {
  it("accepts valid V1 format", () => {
    const input: unknown = {
      version: 1,
      filters: { companies: ["VANTI S.A. ESP"] },
    };
    const result = parsePersistedFilterState(input);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.filters.companies).toEqual(["VANTI S.A. ESP"]);
    }
  });

  it("accepts legacy format (no version)", () => {
    const input: unknown = { companies: ["VANTI"], causes: ["test"] };
    const result = parsePersistedFilterState(input);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.filters.companies).toEqual(["VANTI"]);
    }
  });

  it("rejects invalid JSON root: null", () => {
    const result = parsePersistedFilterState(null);
    expect(result.valid).toBe(false);
  });

  it("rejects invalid JSON root: undefined", () => {
    const result = parsePersistedFilterState(undefined);
    expect(result.valid).toBe(false);
  });

  it("rejects array root", () => {
    const input: unknown = ["VANTI"];
    const result = parsePersistedFilterState(input);
    expect(result.valid).toBe(false);
  });

  it("rejects string root", () => {
    const input: unknown = "VANTI";
    const result = parsePersistedFilterState(input);
    expect(result.valid).toBe(false);
  });

  it("rejects companies as object", () => {
    const input: unknown = { companies: { value: "VANTI" } };
    const result = parsePersistedFilterState(input);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.filters.companies).toBeUndefined();
    }
  });

  it("rejects companies as number", () => {
    const input: unknown = { companies: 123 };
    const result = parsePersistedFilterState(input);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.filters.companies).toBeUndefined();
    }
  });

  it("rejects companies as string", () => {
    const input: unknown = { companies: "VANTI" };
    const result = parsePersistedFilterState(input);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.filters.companies).toBeUndefined();
    }
  });

  it("filters empty strings from arrays", () => {
    const input: unknown = { companies: ["VANTI", "", "TEST"] };
    const result = parsePersistedFilterState(input);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.filters.companies).toEqual(["VANTI", "TEST"]);
    }
  });

  it("filters non-string items from arrays", () => {
    const input: unknown = { companies: ["VANTI", 123, null, {}, "TEST"] };
    const result = parsePersistedFilterState(input);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.filters.companies).toEqual(["VANTI", "TEST"]);
    }
  });

  it("rejects dateRange as string", () => {
    const input: unknown = { dateRange: "2026" };
    const result = parsePersistedFilterState(input);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.filters.dateRange).toBeUndefined();
    }
  });

  it("rejects dateRange as array", () => {
    const input: unknown = { dateRange: ["2026-01-01", "2026-12-31"] };
    const result = parsePersistedFilterState(input);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.filters.dateRange).toBeUndefined();
    }
  });

  it("accepts valid dateRange", () => {
    const input: unknown = { dateRange: { start: "2026-01-01", end: "2026-12-31" } };
    const result = parsePersistedFilterState(input);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.filters.dateRange).toEqual({ start: "2026-01-01", end: "2026-12-31" });
    }
  });

  it("rejects managementTimeRange with min > max", () => {
    const input: unknown = { managementTimeRange: { min: 100, max: 10 } };
    const result = parsePersistedFilterState(input);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.filters.managementTimeRange).toBeUndefined();
    }
  });

  it("rejects managementTimeRange with negative min", () => {
    const input: unknown = { managementTimeRange: { min: -5, max: 10 } };
    const result = parsePersistedFilterState(input);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.filters.managementTimeRange).toBeUndefined();
    }
  });

  it("accepts valid managementTimeRange", () => {
    const input: unknown = { managementTimeRange: { min: 0, max: 184 } };
    const result = parsePersistedFilterState(input);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.filters.managementTimeRange).toEqual({ min: 0, max: 184 });
    }
  });

  it("accepts empty object as valid (no filters active)", () => {
    const input: unknown = {};
    const result = parsePersistedFilterState(input);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.filters).toEqual({});
    }
  });

  it("strips unknown properties from old format", () => {
    const input: unknown = { company: "VANTI", status: "cerrado", companies: ["VANTI"] };
    const result = parsePersistedFilterState(input);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.filters.companies).toEqual(["VANTI"]);
      expect((result.filters as Record<string, unknown>)["company"]).toBeUndefined();
    }
  });

  it("handles all properties invalid gracefully", () => {
    const input: unknown = {
      companies: 123,
      causes: {},
      channels: "telefónico",
      statuses: null,
      results: [1, 2, 3],
      responsibleUnits: [null, {}],
      dateRange: "2026",
      managementTimeRange: [],
    };
    const result = parsePersistedFilterState(input);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.filters).toEqual({});
    }
  });

  it("rejects unknown version", () => {
    const input: unknown = { version: 99, filters: {} };
    const result = parsePersistedFilterState(input);
    expect(result.valid).toBe(false);
  });
});
