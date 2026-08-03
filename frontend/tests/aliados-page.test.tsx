import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import AliadosPage from "@/app/aliados/page";
import { ONBOARDING_STATES, TRACEABILITY_LOG } from "@/app/aliados/constants";

describe("AliadosPage", () => {
  it("renders the page header", () => {
    render(<AliadosPage />);
    expect(screen.getByText("Vantilisto Partners")).toBeInTheDocument();
  });

  it("includes Devuelto para corrección state", () => {
    render(<AliadosPage />);
    expect(screen.getAllByText(/Devuelto para corrección/i).length).toBeGreaterThan(0);
  });

  it("includes Rechazado state", () => {
    render(<AliadosPage />);
    expect(screen.getAllByText(/Rechazado/i).length).toBeGreaterThan(0);
  });

  it("includes Aprobado state in the flow", () => {
    render(<AliadosPage />);
    expect(screen.getAllByText(/Aprobado/i).length).toBeGreaterThan(0);
  });

  it("shows Revisión Legal before Revisión VP in flow sequence", () => {
    render(<AliadosPage />);
    const flowEl = screen.getByTestId("flow-sequence");
    const text = flowEl.textContent || "";
    const legalIdx = text.indexOf("Revisión Legal");
    const vpIdx = text.indexOf("Revisión VP");
    expect(legalIdx).toBeGreaterThan(-1);
    expect(vpIdx).toBeGreaterThan(-1);
    expect(legalIdx).toBeLessThan(vpIdx);
  });

  it("has all 8 onboarding states defined", () => {
    expect(ONBOARDING_STATES).toHaveLength(8);
    const keys = ONBOARDING_STATES.map((s) => s.key);
    expect(keys).toContain("BORRADOR");
    expect(keys).toContain("ENVIADO");
    expect(keys).toContain("REVISION_LEGAL");
    expect(keys).toContain("DEVUELTO_CORRECCION");
    expect(keys).toContain("REVISION_VP");
    expect(keys).toContain("APROBADO");
    expect(keys).toContain("RECHAZADO");
    expect(keys).toContain("OPERATIVO");
  });

  it("renders the traceability table", () => {
    render(<AliadosPage />);
    const table = screen.getByTestId("traceability-table");
    expect(table).toBeInTheDocument();
  });

  it("traceability table has exactly 3 entries", () => {
    expect(TRACEABILITY_LOG).toHaveLength(3);
  });

  it("traceability entries have all required fields", () => {
    for (const entry of TRACEABILITY_LOG) {
      expect(entry.fecha).toBeTruthy();
      expect(entry.actor).toBeTruthy();
      expect(entry.rol).toBeTruthy();
      expect(entry.decision).toBeTruthy();
      expect(entry.comentario).toBeTruthy();
      expect(entry.estadoAnterior).toBeTruthy();
      expect(entry.estadoNuevo).toBeTruthy();
    }
  });

  it("displays the disclaimer about simulated data", () => {
    render(<AliadosPage />);
    const el = screen.getByTestId("disclaimer");
    expect(el).toHaveTextContent(/no conectado a procesos productivos de vanti/i);
  });

  it("shows the conceptual flow banner", () => {
    render(<AliadosPage />);
    expect(
      screen.getAllByText(/flujo conceptual con datos simulados/i).length
    ).toBeGreaterThan(0);
  });
});
