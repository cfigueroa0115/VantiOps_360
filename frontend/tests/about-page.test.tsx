import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import AboutPage from "@/app/about/page";

describe("AboutPage", () => {
  it("renders the page title", () => {
    render(<AboutPage />);
    expect(screen.getByText("Acerca de VantiOps 360")).toBeInTheDocument();
  });

  it("shows 51.008 registros for the assessment base", () => {
    render(<AboutPage />);
    expect(
      screen.getByText(/51\.008 registros de la base suministrada para el assessment/i)
    ).toBeInTheDocument();
  });

  it("does not reference 600 registros", () => {
    render(<AboutPage />);
    const page = document.body.textContent || "";
    expect(page).not.toContain("600 registros");
    expect(page).not.toContain("600+");
  });

  it("differentiates base analítica from escenario de migración", () => {
    render(<AboutPage />);
    // Fase 1 is about real assessment data
    expect(screen.getAllByText(/Fase 1/).length).toBeGreaterThan(0);
    // Fase 2 and 3 are conceptual/synthetic
    expect(screen.getAllByText(/Fase.* 2/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Fase.* 3/).length).toBeGreaterThan(0);
  });

  it("shows disclaimer about independent project", () => {
    render(<AboutPage />);
    expect(
      screen.getByText(/prototipo independiente/i)
    ).toBeInTheDocument();
  });

  it("states not official Vanti product", () => {
    render(<AboutPage />);
    expect(
      screen.getByText(/No es un producto oficial de Vanti/i)
    ).toBeInTheDocument();
  });

  it("states not connected to production", () => {
    render(<AboutPage />);
    expect(
      screen.getByText(/No conectado con sistemas productivos/i)
    ).toBeInTheDocument();
  });

  it("mentions Fase 1 uses supplied base for assessment", () => {
    render(<AboutPage />);
    expect(
      screen.getByText(/base suministrada exclusivamente para el assessment/i)
    ).toBeInTheDocument();
  });

  it("mentions Fases 2 and 3 use synthetic or conceptual data", () => {
    render(<AboutPage />);
    expect(
      screen.getByText(/datos sintéticos o diseños conceptuales/i)
    ).toBeInTheDocument();
  });
});
