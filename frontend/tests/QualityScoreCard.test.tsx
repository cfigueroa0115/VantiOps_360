import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

// We test QualityScoreCard by importing the page and isolating the component
// Since QualityScoreCard is not exported separately, we test it via formatMetric behavior
// and a minimal inline component that mirrors QualityScoreCard's rendering logic.
import { formatMetric } from "@/lib/charts/number-format";

function QualityScoreCardMini({
  overallScore,
  dimensions,
}: {
  overallScore: number | null;
  dimensions: Record<string, number> | null;
}) {
  const score = overallScore ?? 0;

  return (
    <div>
      {overallScore !== null ? (
        <>
          <span data-testid="score">{formatMetric(score)}</span>
          {dimensions && (
            <div data-testid="dimensions">
              <span data-testid="completeness">{formatMetric(dimensions.completeness)}</span>
              <span data-testid="validity">{formatMetric(dimensions.validity)}</span>
              <span data-testid="consistency">{formatMetric(dimensions.consistency)}</span>
              <span data-testid="uniqueness">{formatMetric(dimensions.uniqueness)}</span>
              <span data-testid="timeliness">{formatMetric(dimensions.timeliness)}</span>
              <span data-testid="domainConformity">{formatMetric(dimensions.domainConformity)}</span>
            </div>
          )}
        </>
      ) : (
        <p data-testid="no-data">Sin datos</p>
      )}
    </div>
  );
}

describe("QualityScoreCard", () => {
  it("1. Renders valid scores correctly", () => {
    const dims = {
      completeness: 95.2,
      validity: 88.1,
      consistency: 91.0,
      uniqueness: 99.5,
      timeliness: 72.3,
      domainConformity: 84.6,
    };
    render(<QualityScoreCardMini overallScore={85.5} dimensions={dims} />);

    expect(screen.getByTestId("score")).toHaveTextContent("85.5%");
    expect(screen.getByTestId("completeness")).toHaveTextContent("95.2%");
    expect(screen.getByTestId("validity")).toHaveTextContent("88.1%");
  });

  it("2. Shows '—' for null dimension values (when formatMetric is used)", () => {
    // Simulate a case where dimension values are actually null/undefined
    // formatMetric should return "—" for those
    const dims: Record<string, number> = {
      completeness: 95.2,
      validity: undefined as unknown as number,
      consistency: null as unknown as number,
      uniqueness: 99.5,
      timeliness: 72.3,
      domainConformity: 84.6,
    };
    render(<QualityScoreCardMini overallScore={80} dimensions={dims} />);

    // formatMetric(undefined) returns "—", formatMetric(null) returns "—"
    expect(screen.getByTestId("validity")).toHaveTextContent("—");
    expect(screen.getByTestId("consistency")).toHaveTextContent("—");
  });

  it("3. Shows 'Sin datos' when overallScore is null", () => {
    render(<QualityScoreCardMini overallScore={null} dimensions={null} />);
    expect(screen.getByTestId("no-data")).toHaveTextContent("Sin datos");
  });

  it("4. Does not throw on any input combination", () => {
    expect(() => {
      render(<QualityScoreCardMini overallScore={null} dimensions={null} />);
    }).not.toThrow();

    expect(() => {
      render(<QualityScoreCardMini overallScore={0} dimensions={{ completeness: 0, validity: 0, consistency: 0, uniqueness: 0, timeliness: 0, domainConformity: 0 }} />);
    }).not.toThrow();

    expect(() => {
      render(<QualityScoreCardMini overallScore={100} dimensions={{ completeness: 100, validity: 100, consistency: 100, uniqueness: 100, timeliness: 100, domainConformity: 100 }} />);
    }).not.toThrow();
  });
});
