import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import AnulacionesPage from "@/app/anulaciones/page";

// Mock fetch globally for this test
const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch);
  // Default: session status returns unauthenticated
  mockFetch.mockResolvedValue({
    ok: true,
    json: async () => ({ authenticated: false }),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("AnulacionesPage", () => {
  it("renders without RECEIVED state", async () => {
    render(<AnulacionesPage />);
    await waitFor(() => {
      expect(screen.queryByText("RECEIVED")).not.toBeInTheDocument();
    });
  });

  it("displays Solicitada in the state machine", async () => {
    render(<AnulacionesPage />);
    await waitFor(() => {
      expect(screen.getAllByText(/Solicitada/i).length).toBeGreaterThan(0);
    });
  });

  it("displays all required states in the machine visualization", async () => {
    render(<AnulacionesPage />);
    await waitFor(() => {
      expect(screen.getAllByText(/Solicitada/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/En Revisión/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/Aprobada/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/Rechazada/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/En Ejecución/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/Cerrada/i).length).toBeGreaterThan(0);
    });
  });

  it("shows SIMULATED_DATA banner", async () => {
    render(<AnulacionesPage />);
    await waitFor(() => {
      expect(screen.getByText(/Datos simulados exclusivamente para demostración del assessment/i)).toBeInTheDocument();
    });
  });

  it("shows demo session panel", async () => {
    render(<AnulacionesPage />);
    await waitFor(() => {
      expect(screen.getByText(/Modo Demo Assessment/i)).toBeInTheDocument();
    });
  });

  it("shows session required message when not authenticated", async () => {
    render(<AnulacionesPage />);
    await waitFor(() => {
      expect(screen.getByText(/Sesión requerida/i)).toBeInTheDocument();
    });
  });

  it("shows disclaimer about no production connection", async () => {
    render(<AnulacionesPage />);
    await waitFor(() => {
      expect(screen.getByText(/No conectado a sistemas productivos/i)).toBeInTheDocument();
    });
  });

  it("shows correct flow order in state machine visualization", async () => {
    render(<AnulacionesPage />);
    await waitFor(() => {
      const page = document.body.textContent || "";
      const solIdx = page.indexOf("Solicitada");
      const revIdx = page.indexOf("En Revisión");
      const apIdx = page.indexOf("Aprobada");
      const ejIdx = page.indexOf("En Ejecución");
      const ceIdx = page.indexOf("Cerrada");
      expect(solIdx).toBeGreaterThan(-1);
      expect(solIdx).toBeLessThan(revIdx);
      expect(revIdx).toBeLessThan(apIdx);
      expect(apIdx).toBeLessThan(ejIdx);
      expect(ejIdx).toBeLessThan(ceIdx);
    });
  });
});
