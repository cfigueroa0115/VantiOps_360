import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MultiSelect } from "@/components/filters/MultiSelect";

describe("MultiSelect defensive rendering", () => {
  const defaultProps = {
    options: ["Option A", "Option B", "Option C"],
    onChange: () => {},
    label: "Test Label",
    placeholder: "Select...",
  };

  it("renders without crashing when selected is undefined", () => {
    render(
      <MultiSelect {...defaultProps} selected={undefined as unknown as string[]} />,
    );
    expect(screen.getByText("Select...")).toBeInTheDocument();
  });

  it("renders without crashing when selected is null", () => {
    render(
      <MultiSelect {...defaultProps} selected={null as unknown as string[]} />,
    );
    expect(screen.getByText("Select...")).toBeInTheDocument();
  });

  it("renders without crashing when selected is a number", () => {
    render(
      <MultiSelect {...defaultProps} selected={123 as unknown as string[]} />,
    );
    expect(screen.getByText("Select...")).toBeInTheDocument();
  });

  it("renders without crashing when selected is an object", () => {
    render(
      <MultiSelect {...defaultProps} selected={{ value: "test" } as unknown as string[]} />,
    );
    expect(screen.getByText("Select...")).toBeInTheDocument();
  });

  it("renders without crashing when selected is a string", () => {
    render(
      <MultiSelect {...defaultProps} selected={"test" as unknown as string[]} />,
    );
    expect(screen.getByText("Select...")).toBeInTheDocument();
  });

  it("filters non-string items from selected array", () => {
    render(
      <MultiSelect
        {...defaultProps}
        selected={["Option A", 123, null, {}] as unknown as string[]}
      />,
    );
    // Should only count "Option A" as selected
    expect(screen.getByText("Option A")).toBeInTheDocument();
  });

  it("renders correctly with a valid selected array", () => {
    render(
      <MultiSelect {...defaultProps} selected={["Option A", "Option B"]} />,
    );
    expect(screen.getByText("2 seleccionados")).toBeInTheDocument();
  });

  it("renders single selected item correctly", () => {
    render(
      <MultiSelect {...defaultProps} selected={["Option A"]} />,
    );
    expect(screen.getByText("Option A")).toBeInTheDocument();
  });
});
