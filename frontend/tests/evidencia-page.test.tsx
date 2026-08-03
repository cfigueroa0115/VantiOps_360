import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import EvidenciaPage from "@/app/evidencia/page";

// Mock fetch globally
const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function mockHealthSuccess() {
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ status: "healthy", database: { connected: true, latencyMs: 12 } }),
  });
}

function mockHealthFailure() {
  return Promise.resolve({
    ok: false,
    status: 500,
    json: () => Promise.resolve({ error: "Internal error" }),
  });
}

function mockHealthNetworkError() {
  return Promise.reject(new Error("Network error"));
}

function mockValidationSuccess() {
  return Promise.resolve({
    ok: true,
    json: () =>
      Promise.resolve({
        commitHash: "abc1234",
        generatedAt: "2024-12-01T10:00:00Z",
        source: "github-actions",
        workflowStatus: "success",
        verificationStatus: "success",
        e2eStatus: "success",
        visualRegressionStatus: "success",
        backendTests: { total: 1070, passed: 1070, status: "passed" },
        frontendTests: { total: 465, passed: 465, status: "passed" },
        coverage: { statements: 84.74, branches: 79.63, functions: 77.36, lines: 86.32 },
      }),
  });
}

function mockValidationUnavailable() {
  return Promise.resolve({
    ok: true,
    json: () =>
      Promise.resolve({
        commitHash: null,
        generatedAt: null,
        source: "github-actions",
        workflowStatus: "unavailable",
        verificationStatus: "unavailable",
        backendTests: null,
        frontendTests: null,
        coverage: null,
      }),
  });
}

async function renderAndSettle(fetchImpl: (url: string) => Promise<unknown>) {
  mockFetch.mockImplementation(fetchImpl);
  await act(async () => {
    render(<EvidenciaPage />);
  });
  // Wait for all state updates to settle
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

describe("EvidenciaPage", () => {
  it("renders page title", async () => {
    await renderAndSettle(() => mockHealthSuccess());
    expect(screen.getByText("Evidencia Técnica")).toBeInTheDocument();
  });

  it("shows health success state when API returns ok", async () => {
    await renderAndSettle((url: string) => {
      if (url.includes("/api/health")) return mockHealthSuccess();
      return mockValidationUnavailable();
    });
    await waitFor(() => {
      expect(screen.getByTestId("status-health-check")).toHaveTextContent("healthy");
    });
  });

  it("shows failure state when health API returns HTTP 500", async () => {
    await renderAndSettle((url: string) => {
      if (url.includes("/api/health")) return mockHealthFailure();
      return mockValidationUnavailable();
    });
    await waitFor(() => {
      expect(screen.getByTestId("status-health-check")).toHaveTextContent("No disponible");
    });
  });

  it("shows failure state on network error", async () => {
    await renderAndSettle((url: string) => {
      if (url.includes("/api/health")) return mockHealthNetworkError();
      return mockValidationUnavailable();
    });
    await waitFor(() => {
      expect(screen.getByTestId("status-health-check")).toHaveTextContent("No disponible");
    });
  });

  it("displays validation data when JSON returns success", async () => {
    await renderAndSettle((url: string) => {
      if (url.includes("/api/health")) return mockHealthSuccess();
      return mockValidationSuccess();
    });
    await waitFor(() => {
      expect(screen.getByTestId("status-ci-commit")).toHaveTextContent("abc1234");
    });
  });

  it("shows unavailable when validation JSON has null fields", async () => {
    await renderAndSettle((url: string) => {
      if (url.includes("/api/health")) return mockHealthSuccess();
      return mockValidationUnavailable();
    });
    await waitFor(() => {
      expect(screen.getByTestId("status-ci-commit")).toHaveTextContent("No disponible");
      expect(screen.getByTestId("status-frontend-tests")).toHaveTextContent("No disponible");
      expect(screen.getByTestId("status-backend-tests")).toHaveTextContent("No disponible");
      expect(screen.getByTestId("status-coverage")).toHaveTextContent("No disponible");
    });
  });

  it("shows CI evidence note about GitHub Actions", async () => {
    await renderAndSettle((url: string) => {
      if (url.includes("/api/health")) return mockHealthSuccess();
      return mockValidationUnavailable();
    });
    expect(screen.getByTestId("evidence-source-note")).toHaveTextContent(
      /Evidencia de CI disponible en GitHub Actions/
    );
  });

  it("does not contain any of the forbidden static phrases", async () => {
    await renderAndSettle(() => mockHealthSuccess());
    const text = document.body.textContent || "";
    const forbidden = [
      "Producción activa",
      "1,497 tests",
      "1497 tests",
      "0 errores",
      "DB conectada",
      "CI/CD ≤ 15min",
      "Auto-rollback",
      "427 frontend",
      "1,070 backend",
      "1070 backend",
      "22 skipped",
    ];
    for (const phrase of forbidden) {
      expect(text).not.toContain(phrase);
    }
  });
});
