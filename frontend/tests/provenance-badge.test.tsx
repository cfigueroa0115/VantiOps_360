import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

import {
  ProvenanceBadge,
  type DataProvenance,
} from "@/components/ui/provenance-badge";

// ---------------------------------------------------------------------------
// Tests — ProvenanceBadge (REQ-06.3)
// ---------------------------------------------------------------------------

describe("ProvenanceBadge", () => {
  const allCategories: DataProvenance[] = [
    "REAL_DATA",
    "DERIVED_DATA",
    "SIMULATED_DATA",
    "CONCEPTUAL_DESIGN",
  ];

  it("renders a badge with the correct label for REAL_DATA", () => {
    render(<ProvenanceBadge provenance="REAL_DATA" />);
    expect(screen.getByText("Real")).toBeInTheDocument();
  });

  it("renders a badge with the correct label for DERIVED_DATA", () => {
    render(<ProvenanceBadge provenance="DERIVED_DATA" />);
    expect(screen.getByText("Derivado")).toBeInTheDocument();
  });

  it("renders a badge with the correct label for SIMULATED_DATA", () => {
    render(<ProvenanceBadge provenance="SIMULATED_DATA" />);
    expect(screen.getByText("Simulado")).toBeInTheDocument();
  });

  it("renders a badge with the correct label for CONCEPTUAL_DESIGN", () => {
    render(<ProvenanceBadge provenance="CONCEPTUAL_DESIGN" />);
    expect(screen.getByText("Conceptual")).toBeInTheDocument();
  });

  it.each(allCategories)(
    "renders an accessible aria-label for %s",
    (provenance) => {
      render(<ProvenanceBadge provenance={provenance} />);
      const badge = screen.getByRole("status");
      expect(badge).toHaveAttribute("aria-label");
      expect(badge.getAttribute("aria-label")).toContain("Proveniencia:");
    }
  );

  it("applies green styling for REAL_DATA", () => {
    render(<ProvenanceBadge provenance="REAL_DATA" />);
    const badge = screen.getByRole("status");
    expect(badge.className).toContain("green");
  });

  it("applies blue styling for DERIVED_DATA", () => {
    render(<ProvenanceBadge provenance="DERIVED_DATA" />);
    const badge = screen.getByRole("status");
    expect(badge.className).toContain("blue");
  });

  it("applies amber styling for SIMULATED_DATA", () => {
    render(<ProvenanceBadge provenance="SIMULATED_DATA" />);
    const badge = screen.getByRole("status");
    expect(badge.className).toContain("amber");
  });

  it("applies purple styling for CONCEPTUAL_DESIGN", () => {
    render(<ProvenanceBadge provenance="CONCEPTUAL_DESIGN" />);
    const badge = screen.getByRole("status");
    expect(badge.className).toContain("purple");
  });

  it("defaults to 'sm' size", () => {
    render(<ProvenanceBadge provenance="REAL_DATA" />);
    const badge = screen.getByRole("status");
    expect(badge.className).toContain("text-xs");
  });

  it("supports 'md' size variant", () => {
    render(<ProvenanceBadge provenance="REAL_DATA" size="md" />);
    const badge = screen.getByRole("status");
    expect(badge.className).toContain("text-sm");
  });

  it("accepts additional className prop", () => {
    render(<ProvenanceBadge provenance="REAL_DATA" className="my-custom" />);
    const badge = screen.getByRole("status");
    expect(badge.className).toContain("my-custom");
  });

  it("contains an icon element", () => {
    const { container } = render(<ProvenanceBadge provenance="REAL_DATA" />);
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveAttribute("aria-hidden", "true");
  });

  it.each(allCategories)(
    "has role='status' for accessibility (%s)",
    (provenance) => {
      render(<ProvenanceBadge provenance={provenance} />);
      expect(screen.getByRole("status")).toBeInTheDocument();
    }
  );
});
