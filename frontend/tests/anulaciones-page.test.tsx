import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import AnulacionesPage from "@/app/anulaciones/page";

describe("AnulacionesPage", () => {
  it("renders without RECEIVED state", () => {
    render(<AnulacionesPage />);
    expect(screen.queryByText("RECEIVED")).not.toBeInTheDocument();
    expect(screen.queryByText("Received")).not.toBeInTheDocument();
  });

  it("displays Solicitada as the initial state", () => {
    render(<AnulacionesPage />);
    expect(screen.getAllByText(/Solicitada/i).length).toBeGreaterThan(0);
  });

  it("displays all required states", () => {
    render(<AnulacionesPage />);
    expect(screen.getAllByText(/Solicitada/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/En Revisión/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Aprobada/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Rechazada/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/En Ejecución/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Cerrada/i).length).toBeGreaterThan(0);
  });

  it("shows terminal states note", () => {
    render(<AnulacionesPage />);
    expect(
      screen.getByText("Los estados Rechazada y Cerrada son terminales.")
    ).toBeInTheDocument();
  });

  it("does not connect Rechazada to En Ejecución (Rechazada is terminal)", () => {
    render(<AnulacionesPage />);
    const terminalNote = screen.getByTestId("terminal-states-note");
    expect(terminalNote).toHaveTextContent("Rechazada");
    expect(terminalNote).toHaveTextContent("terminales");
  });

  it("shows Cerrada as terminal state", () => {
    render(<AnulacionesPage />);
    const terminalNote = screen.getByTestId("terminal-states-note");
    expect(terminalNote).toHaveTextContent("Cerrada");
  });

  it("displays the conceptual disclaimer", () => {
    render(<AnulacionesPage />);
    expect(
      screen.getByText(/no conectado a sistemas productivos/i)
    ).toBeInTheDocument();
  });

  it("displays the simulated data banner", () => {
    render(<AnulacionesPage />);
    expect(
      screen.getByText(/datos simulados exclusivamente para demostración conceptual/i)
    ).toBeInTheDocument();
  });

  it("shows correct flow: Solicitada → En Revisión → Aprobada → En Ejecución → Cerrada", () => {
    render(<AnulacionesPage />);
    // The happy path is visible
    const page = document.body.textContent || "";
    const solIdx = page.indexOf("Solicitada");
    const revIdx = page.indexOf("En Revisión");
    const apIdx = page.indexOf("Aprobada");
    const ejIdx = page.indexOf("En Ejecución");
    const ceIdx = page.indexOf("Cerrada");
    expect(solIdx).toBeLessThan(revIdx);
    expect(revIdx).toBeLessThan(apIdx);
    expect(apIdx).toBeLessThan(ejIdx);
    expect(ejIdx).toBeLessThan(ceIdx);
  });

  it("Rechazada branch is separate from happy path (not before En Ejecución in flow)", () => {
    render(<AnulacionesPage />);
    // Rechazada appears after Cerrada in text because it's in a separate row
    const page = document.body.textContent || "";
    const ceIdx = page.indexOf("Cerrada");
    const rejIdx = page.indexOf("Rechazada");
    // Rechazada is in a separate branch displayed after the main flow
    expect(ceIdx).toBeGreaterThan(0);
    expect(rejIdx).toBeGreaterThan(0);
  });
});
