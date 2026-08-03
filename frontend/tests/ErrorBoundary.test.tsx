import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ErrorBoundary } from "@/components/layout/ErrorBoundary";

function ThrowingChild({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error("Test error");
  return <div>Content rendered</div>;
}

describe("ErrorBoundary", () => {
  // Suppress console.error for expected errors
  const originalError = console.error;
  beforeAll(() => { console.error = vi.fn(); });
  afterAll(() => { console.error = originalError; });

  it("renders children when no error", () => {
    render(
      <ErrorBoundary><div>Hello</div></ErrorBoundary>
    );
    expect(screen.getByText("Hello")).toBeInTheDocument();
  });

  it("shows friendly message on error", () => {
    render(
      <ErrorBoundary componentName="TestComponent">
        <ThrowingChild shouldThrow={true} />
      </ErrorBoundary>
    );
    expect(screen.getByText(/No fue posible representar este gráfico/)).toBeInTheDocument();
    expect(screen.getByText(/TestComponent/)).toBeInTheDocument();
  });

  it("does not show stack trace", () => {
    render(
      <ErrorBoundary>
        <ThrowingChild shouldThrow={true} />
      </ErrorBoundary>
    );
    expect(screen.queryByText(/Test error/)).not.toBeInTheDocument();
  });

  it("calls onReset when Reintentar is clicked", () => {
    const onReset = vi.fn();
    render(
      <ErrorBoundary onReset={onReset}>
        <ThrowingChild shouldThrow={true} />
      </ErrorBoundary>
    );
    fireEvent.click(screen.getByText("Reintentar"));
    expect(onReset).toHaveBeenCalledTimes(1);
  });
});
