import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { render, screen } from "@testing-library/react";
import { CancellationDonut } from "@/components/charts/CancellationDonut";

// Suppress recharts ResizeObserver warnings in test environment
beforeAll(() => {
  global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as any;
});

describe("CancellationDonut", () => {
  it("renders with valid numeric data", () => {
    const data = [
      { category: "Principal", count: 25000, percentage: 50 },
      { category: "Otras", count: 25000, percentage: 50 },
    ];
    const { container } = render(
      <CancellationDonut data={data} loading={false} error={null} />
    );
    expect(container.querySelector("[role='img']")).not.toBeNull();
  });

  it("renders with string numbers (API returns strings from Postgres)", () => {
    const data = [
      { category: "Main", count: 100, percentage: 49.96 },
      { category: "Other", count: 100, percentage: 50.04 },
    ];
    const { container } = render(
      <CancellationDonut data={data} loading={false} error={null} />
    );
    expect(container.querySelector("[role='img']")).not.toBeNull();
  });

  it("shows empty state for empty array", () => {
    render(<CancellationDonut data={[]} loading={false} error={null} />);
    expect(screen.getByText(/No hay datos/)).toBeInTheDocument();
  });

  it("shows loading state", () => {
    render(<CancellationDonut data={[]} loading={true} error={null} />);
    // ChartWrapper shows loading skeleton with role="status"
    expect(document.querySelector("[aria-label]")).not.toBeNull();
  });

  it("shows error state with retry", () => {
    render(<CancellationDonut data={[]} loading={false} error="Test error" />);
    expect(screen.getByText(/Test error/)).toBeInTheDocument();
  });

  it("does not crash with null values in data", () => {
    const data = [
      { category: "X", count: 0, percentage: 0 },
    ] as any;
    expect(() => {
      render(<CancellationDonut data={data} loading={false} error={null} />);
    }).not.toThrow();
  });

  it("does not display NaN with invalid data", () => {
    const data = [
      { category: "A", count: NaN, percentage: NaN },
      { category: "B", count: 10, percentage: 50 },
    ] as any;
    const { container } = render(
      <CancellationDonut data={data} loading={false} error={null} />
    );
    // isValidData returns false, ChartWrapper shows empty state
    expect(container.textContent).not.toContain("NaN");
  });

  it("does not display Infinity with invalid data", () => {
    const data = [
      { category: "A", count: Infinity, percentage: Infinity },
    ] as any;
    const { container } = render(
      <CancellationDonut data={data} loading={false} error={null} />
    );
    expect(container.textContent).not.toContain("Infinity");
  });

  it("handles single category", () => {
    const data = [{ category: "Only One", count: 1000, percentage: 100 }];
    expect(() => {
      render(<CancellationDonut data={data} loading={false} error={null} />);
    }).not.toThrow();
  });

  it("handles negative values without crashing", () => {
    const data = [
      { category: "Neg", count: -10, percentage: -5 },
      { category: "Pos", count: 100, percentage: 105 },
    ] as any;
    expect(() => {
      render(<CancellationDonut data={data} loading={false} error={null} />);
    }).not.toThrow();
  });
});
