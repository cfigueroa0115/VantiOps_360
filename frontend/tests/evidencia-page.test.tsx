import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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
        backendTests: { total: 1070, passed: 1070, status: "passed" },
        frontendTests: { total: 427, passed: 427, status: "passed" },
        coverage: 84.5,
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
        backendTests: null,
        frontendTests: null,
        coverage: null,
      }),
  });
}

describe("EvidenciaPage", () => {
  it("renders page title", () => {
    mockFetch.mockImplementation(() => mockHealthSuccess());
    render(<EvidenciaPage />);
    expect(screen.getByText("Evidencia Técnica")).toBeInTheDocument();
  });

  it("shows health success state when API returns ok", async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes("/api/health")) return mockHealthSuccess();
      return mockValidationUnavailable();
    });
    render(<EvidenciaPage />);
    await waitFor(() => {
      expect(screen.getByTestId("status-health-check")).toHaveTextContent("healthy");
    });
  });

  it("shows failure state when health API returns HTTP 500", async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes("/api/health")) return mockHealthFailure();
      return mockValidationUnavailable();
    });
    render(<EvidenciaPage />);
    await waitFor(() => {
      expect(screen.getByTestId("status-health-check")).toHaveTextContent("No disponible");
    });
  });

  it("shows failure state on network error", async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes("/api/health")) return mockHealthNetworkError();
      return mockValidationUnavailable();
    });
    render(<EvidenciaPage />);
    await waitFor(() => {
      expect(screen.getByTestId("status-health-check")).toHaveTextContent("No disponible");
    });
  });

  it("displays validation data when JSON returns success", async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes("/api/health")) return mockHealthSuccess();
      return mockValidationSuccess();
    });
    render(<EvidenciaPage />);
    await waitFor(() => {
      expect(screen.getByTestId("status-ci-commit")).toHaveTextContent("abc1234");
    });
  });

  it("shows unavailable when validation JSON has null fields", async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes("/api/health")) return mockHealthSuccess();
      return mockValidationUnavailable();
    });
    render(<EvidenciaPage />);
    await waitFor(() => {
      expect(screen.getByTestId("status-ci-commit")).toHaveTextContent("No disponible");
      expect(screen.getByTestId("status-frontend-tests")).toHaveTextContent("No disponible");
      expect(screen.getByTestId("status-backend-tests")).toHaveTextContent("No disponible");
      expect(screen.getByTestId("status-coverage")).toHaveTextContent("No disponible");
    });
  });

  it("shows commit value from validation JSON when present", async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes("/api/health")) return mockHealthSuccess();
      return mockValidationSuccess();
    });
    render(<EvidenciaPage />);
    await waitFor(() => {
      expect(screen.getByTestId("status-ci-commit")).toHaveTextContent("abc1234");
    });
  });

  it("does not contain any of the forbidden static phrases", () => {
    mockFetch.mockImplementation(() => mockHealthSuccess());
    render(<EvidenciaPage />);
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
