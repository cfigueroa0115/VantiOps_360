import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

// ---------------------------------------------------------------------------
// Mock next/navigation
// ---------------------------------------------------------------------------

const mockGet = vi.fn();

vi.mock("next/navigation", () => ({
  useSearchParams: () => ({
    get: mockGet,
  }),
}));

// ---------------------------------------------------------------------------
// Import component after mocks
// ---------------------------------------------------------------------------

import AccessDeniedPage from "@/app/access-denied/page";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("AccessDeniedPage", () => {
  it("renders the 403 heading", () => {
    mockGet.mockReturnValue(null);
    render(<AccessDeniedPage />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("403");
  });

  it("renders the 'Acceso Denegado' subheading", () => {
    mockGet.mockReturnValue(null);
    render(<AccessDeniedPage />);

    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
      "Acceso Denegado"
    );
  });

  it("shows the attempted path from the 'from' query param", () => {
    mockGet.mockReturnValue("/admin");
    render(<AccessDeniedPage />);

    expect(screen.getByText("/admin")).toBeInTheDocument();
    expect(screen.getByLabelText("Ruta solicitada")).toBeInTheDocument();
  });

  it("does not show attempted path when 'from' param is absent", () => {
    mockGet.mockReturnValue(null);
    render(<AccessDeniedPage />);

    expect(screen.queryByLabelText("Ruta solicitada")).not.toBeInTheDocument();
  });

  it("displays a message to contact SYSTEM_ADMIN", () => {
    mockGet.mockReturnValue(null);
    render(<AccessDeniedPage />);

    expect(screen.getByText(/contacta al administrador del sistema/i)).toBeInTheDocument();
    expect(screen.getByText(/SYSTEM_ADMIN/)).toBeInTheDocument();
  });

  it("has a link back to the dashboard", () => {
    mockGet.mockReturnValue(null);
    render(<AccessDeniedPage />);

    const link = screen.getByRole("link", { name: /volver al dashboard/i });
    expect(link).toHaveAttribute("href", "/");
  });

  it("has role='alert' for accessibility", () => {
    mockGet.mockReturnValue(null);
    render(<AccessDeniedPage />);

    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("has aria-live='assertive' for screen readers", () => {
    mockGet.mockReturnValue(null);
    render(<AccessDeniedPage />);

    expect(screen.getByRole("alert")).toHaveAttribute("aria-live", "assertive");
  });
});
