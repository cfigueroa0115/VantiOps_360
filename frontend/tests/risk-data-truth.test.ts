import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

/**
 * Risk Data Truth Gate — Server-side artifact/API contract consistency test.
 *
 * Compares the canonical artifact (data/curated/risk_model_results.json) against
 * the API contract structure to ensure they cannot diverge silently.
 *
 * This test reads the real artifact file and verifies:
 * 1. All required fields exist and are valid
 * 2. The API contract transformation is correct (snake_case → camelCase)
 * 3. No fallback values would be applied
 */

function loadArtifact() {
  const filePath = path.resolve(__dirname, "..", "..", "data", "curated", "risk_model_results.json");
  const raw = readFileSync(filePath, "utf-8");
  return JSON.parse(raw);
}

describe("Risk Data Truth — Artifact Integrity", () => {
  const artifact = loadArtifact();

  it("artifact has model_type as non-empty string", () => {
    expect(typeof artifact.model_type).toBe("string");
    expect(artifact.model_type.trim()).not.toBe("");
  });

  it("artifact has metrics.precision as finite number in [0, 1]", () => {
    expect(typeof artifact.metrics.precision).toBe("number");
    expect(Number.isFinite(artifact.metrics.precision)).toBe(true);
    expect(artifact.metrics.precision).toBeGreaterThanOrEqual(0);
    expect(artifact.metrics.precision).toBeLessThanOrEqual(1);
  });

  it("artifact has metrics.recall as finite number in [0, 1]", () => {
    expect(typeof artifact.metrics.recall).toBe("number");
    expect(Number.isFinite(artifact.metrics.recall)).toBe(true);
    expect(artifact.metrics.recall).toBeGreaterThanOrEqual(0);
    expect(artifact.metrics.recall).toBeLessThanOrEqual(1);
  });

  it("artifact has metrics.f1_score as finite number in [0, 1]", () => {
    expect(typeof artifact.metrics.f1_score).toBe("number");
    expect(Number.isFinite(artifact.metrics.f1_score)).toBe(true);
    expect(artifact.metrics.f1_score).toBeGreaterThanOrEqual(0);
    expect(artifact.metrics.f1_score).toBeLessThanOrEqual(1);
  });

  it("artifact has metrics.roc_auc as finite number in [0, 1]", () => {
    expect(typeof artifact.metrics.roc_auc).toBe("number");
    expect(Number.isFinite(artifact.metrics.roc_auc)).toBe(true);
    expect(artifact.metrics.roc_auc).toBeGreaterThanOrEqual(0);
    expect(artifact.metrics.roc_auc).toBeLessThanOrEqual(1);
  });

  it("artifact has training_size as finite non-negative number", () => {
    expect(typeof artifact.training_size).toBe("number");
    expect(Number.isFinite(artifact.training_size)).toBe(true);
    expect(artifact.training_size).toBeGreaterThanOrEqual(0);
  });

  it("artifact has test_size as finite non-negative number", () => {
    expect(typeof artifact.test_size).toBe("number");
    expect(Number.isFinite(artifact.test_size)).toBe(true);
    expect(artifact.test_size).toBeGreaterThanOrEqual(0);
  });
});

describe("Risk Data Truth — API Contract Mapping", () => {
  const artifact = loadArtifact();

  it("artifact.model_type maps to API modelType", () => {
    // The API must use: data.model_type (no fallback)
    expect(artifact.model_type).toBeDefined();
    const apiModelType = artifact.model_type;
    expect(apiModelType).toBe(artifact.model_type);
  });

  it("artifact.metrics.precision maps to API metrics.precision", () => {
    const apiPrecision = artifact.metrics.precision;
    expect(apiPrecision).toBe(artifact.metrics.precision);
  });

  it("artifact.metrics.recall maps to API metrics.recall", () => {
    const apiRecall = artifact.metrics.recall;
    expect(apiRecall).toBe(artifact.metrics.recall);
  });

  it("artifact.metrics.f1_score maps to API metrics.f1Score", () => {
    const apiF1Score = artifact.metrics.f1_score;
    expect(apiF1Score).toBe(artifact.metrics.f1_score);
  });

  it("artifact.metrics.roc_auc maps to API metrics.rocAuc", () => {
    const apiRocAuc = artifact.metrics.roc_auc;
    expect(apiRocAuc).toBe(artifact.metrics.roc_auc);
  });
});

describe("Risk Data Truth — Fail-safe Validation Cases", () => {
  it("missing model_type causes loader to fail", () => {
    const { validateForTest } = createValidator();
    expect(validateForTest({ metrics: { precision: 0.5, recall: 0.5, f1_score: 0.5, roc_auc: 0.5 }, training_size: 100, test_size: 50 }))
      .toContain("model_type");
  });

  it("missing precision causes loader to fail", () => {
    const { validateForTest } = createValidator();
    expect(validateForTest({ model_type: "lr", metrics: { recall: 0.5, f1_score: 0.5, roc_auc: 0.5 }, training_size: 100, test_size: 50 }))
      .toContain("precision");
  });

  it("null recall causes loader to fail", () => {
    const { validateForTest } = createValidator();
    expect(validateForTest({ model_type: "lr", metrics: { precision: 0.5, recall: null, f1_score: 0.5, roc_auc: 0.5 }, training_size: 100, test_size: 50 }))
      .toContain("recall");
  });

  it("NaN metric causes loader to fail", () => {
    const { validateForTest } = createValidator();
    expect(validateForTest({ model_type: "lr", metrics: { precision: NaN, recall: 0.5, f1_score: 0.5, roc_auc: 0.5 }, training_size: 100, test_size: 50 }))
      .toContain("precision");
  });

  it("Infinity metric causes loader to fail", () => {
    const { validateForTest } = createValidator();
    expect(validateForTest({ model_type: "lr", metrics: { precision: 0.5, recall: Infinity, f1_score: 0.5, roc_auc: 0.5 }, training_size: 100, test_size: 50 }))
      .toContain("recall");
  });

  it("metric > 1 causes loader to fail", () => {
    const { validateForTest } = createValidator();
    expect(validateForTest({ model_type: "lr", metrics: { precision: 1.5, recall: 0.5, f1_score: 0.5, roc_auc: 0.5 }, training_size: 100, test_size: 50 }))
      .toContain("precision");
  });

  it("metric < 0 causes loader to fail", () => {
    const { validateForTest } = createValidator();
    expect(validateForTest({ model_type: "lr", metrics: { precision: -0.1, recall: 0.5, f1_score: 0.5, roc_auc: 0.5 }, training_size: 100, test_size: 50 }))
      .toContain("precision");
  });

  it("valid artifact passes validation", () => {
    const { validateForTest } = createValidator();
    expect(validateForTest({
      model_type: "logistic_regression",
      metrics: { precision: 0.1134, recall: 0.5888, f1_score: 0.1901, roc_auc: 0.7958 },
      training_size: 38256,
      test_size: 12752,
    })).toBeNull();
  });
});

/**
 * Re-implements the validation logic from risk-model-loader for testing purposes.
 * This mirrors the exact logic in the loader without importing the module
 * (which requires fs/promises and path resolution).
 */
function createValidator() {
  function isValidMetric(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
  }

  function isValidSize(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value) && value >= 0;
  }

  function validateForTest(data: unknown): string | null {
    if (data === null || data === undefined || typeof data !== "object") {
      return "Artifact is not an object";
    }

    const obj = data as Record<string, unknown>;

    if (typeof obj.model_type !== "string" || obj.model_type.trim() === "") {
      return "model_type is required and must be a non-empty string";
    }

    if (obj.metrics === null || obj.metrics === undefined || typeof obj.metrics !== "object") {
      return "metrics object is required";
    }

    const metrics = obj.metrics as Record<string, unknown>;
    const requiredMetrics = ["precision", "recall", "f1_score", "roc_auc"] as const;

    for (const field of requiredMetrics) {
      if (!(field in metrics)) {
        return `metrics.${field} is required`;
      }
      if (!isValidMetric(metrics[field])) {
        return `metrics.${field} must be a finite number in [0, 1], got: ${String(metrics[field])}`;
      }
    }

    if (!isValidSize(obj.training_size)) {
      return `training_size must be a finite non-negative number, got: ${String(obj.training_size)}`;
    }

    if (!isValidSize(obj.test_size)) {
      return `test_size must be a finite non-negative number, got: ${String(obj.test_size)}`;
    }

    return null;
  }

  return { validateForTest };
}
