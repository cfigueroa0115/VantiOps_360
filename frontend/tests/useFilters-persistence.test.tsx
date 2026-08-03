import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useFilters, FILTER_SESSION_KEY } from "@/hooks/useFilters";

describe("useFilters persistence", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("loads empty filters when sessionStorage is empty", () => {
    const { result } = renderHook(() => useFilters());
    expect(result.current.filters).toEqual({});
    expect(result.current.activeCount).toBe(0);
  });

  it("loads and persists filters with V1 format", () => {
    const stored = JSON.stringify({
      version: 1,
      filters: { companies: ["VANTI S.A. ESP"], causes: ["Facturación"] },
    });
    sessionStorage.setItem(FILTER_SESSION_KEY, stored);

    const { result } = renderHook(() => useFilters());
    expect(result.current.filters.companies).toEqual(["VANTI S.A. ESP"]);
    expect(result.current.filters.causes).toEqual(["Facturación"]);
    expect(result.current.activeCount).toBe(2);
  });

  it("saves filters back in V1 format", () => {
    const { result } = renderHook(() => useFilters());

    act(() => {
      result.current.setFilter("companies", ["VANTI"]);
    });

    const raw = sessionStorage.getItem(FILTER_SESSION_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.version).toBe(1);
    expect(parsed.filters.companies).toEqual(["VANTI"]);
  });

  it("removes corrupted data and starts fresh", () => {
    sessionStorage.setItem(FILTER_SESSION_KEY, "{invalid-json");

    const { result } = renderHook(() => useFilters());
    expect(result.current.filters).toEqual({});
    // Corrupted data should be removed
    expect(sessionStorage.getItem(FILTER_SESSION_KEY)).not.toBe("{invalid-json");
  });

  it("migrates legacy format (no version field)", () => {
    const legacy = JSON.stringify({ companies: ["VANTI"], statuses: ["Cerrado"] });
    sessionStorage.setItem(FILTER_SESSION_KEY, legacy);

    const { result } = renderHook(() => useFilters());
    expect(result.current.filters.companies).toEqual(["VANTI"]);
    expect(result.current.filters.statuses).toEqual(["Cerrado"]);
  });

  it("discards invalid field types from corrupted storage", () => {
    const corrupted = JSON.stringify({
      version: 1,
      filters: { companies: 123, causes: "invalid", channels: ["Valid"] },
    });
    sessionStorage.setItem(FILTER_SESSION_KEY, corrupted);

    const { result } = renderHook(() => useFilters());
    expect(result.current.filters.companies).toBeUndefined();
    expect(result.current.filters.causes).toBeUndefined();
    expect(result.current.filters.channels).toEqual(["Valid"]);
  });

  it("clearAll resets state and persists empty", () => {
    const stored = JSON.stringify({
      version: 1,
      filters: { companies: ["VANTI"] },
    });
    sessionStorage.setItem(FILTER_SESSION_KEY, stored);

    const { result } = renderHook(() => useFilters());
    expect(result.current.filters.companies).toEqual(["VANTI"]);

    act(() => {
      result.current.clearAll();
    });

    expect(result.current.filters).toEqual({});
    const raw = sessionStorage.getItem(FILTER_SESSION_KEY);
    const parsed = JSON.parse(raw!);
    expect(parsed.filters).toEqual({});
  });

  it("clearFilter removes a single key", () => {
    const stored = JSON.stringify({
      version: 1,
      filters: { companies: ["VANTI"], causes: ["Test"] },
    });
    sessionStorage.setItem(FILTER_SESSION_KEY, stored);

    const { result } = renderHook(() => useFilters());

    act(() => {
      result.current.clearFilter("companies");
    });

    expect(result.current.filters.companies).toBeUndefined();
    expect(result.current.filters.causes).toEqual(["Test"]);
  });
});
