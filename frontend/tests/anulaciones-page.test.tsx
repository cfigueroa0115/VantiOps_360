import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import AnulacionesPage from "@/app/anulaciones/page";

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch);
  mockFetch.mockResolvedValue({
    ok: true,
    json: async () => ({ authenticated: false }),
  });
});

afterEach(() => { vi.restoreAllMocks(); });

describe("AnulacionesPage", () => {
  it("displays SIMULATED_DATA banner", async () => {
    render(<AnulacionesPage />);
    await waitFor(() => {
      expect(screen.getByText(/SIMULATED_DATA/)).toBeInTheDocument();
    });
  });

  it("shows Modo Demo Assessment section", async () => {
    render(<AnulacionesPage />);
    await waitFor(() => {
      expect(screen.getByText(/Modo Demo Assessment/i)).toBeInTheDocument();
    });
  });

  it("shows all four persona buttons", async () => {
    render(<AnulacionesPage />);
    await waitFor(() => {
      expect(screen.getByText("Partner Demo Autorizado")).toBeInTheDocument();
      expect(screen.getByText("Analista Demo")).toBeInTheDocument();
      expect(screen.getByText("Coordinador Demo")).toBeInTheDocument();
      expect(screen.getByText("Usuario Solo Lectura")).toBeInTheDocument();
    });
  });

  it("shows session required message when unauthenticated", async () => {
    render(<AnulacionesPage />);
    await waitFor(() => {
      expect(screen.getByText(/Sesión requerida/i)).toBeInTheDocument();
    });
  });

  it("shows state machine flow diagram", async () => {
    render(<AnulacionesPage />);
    await waitFor(() => {
      expect(screen.getByText("Flujo de Estados")).toBeInTheDocument();
      expect(screen.getAllByText(/Solicitada/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/Aprobada/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/Cerrada/i).length).toBeGreaterThan(0);
    });
  });

  it("renders flow in correct order", async () => {
    render(<AnulacionesPage />);
    await waitFor(() => {
      const page = document.body.textContent || "";
      const solIdx = page.indexOf("Solicitada");
      const revIdx = page.indexOf("En Revisión");
      const apIdx = page.indexOf("Aprobada");
      expect(solIdx).toBeLessThan(revIdx);
      expect(revIdx).toBeLessThan(apIdx);
    });
  });

  it("shows disclaimer about not being production", async () => {
    render(<AnulacionesPage />);
    await waitFor(() => {
      expect(screen.getByText(/No conectado a sistemas productivos/i)).toBeInTheDocument();
    });
  });
});
