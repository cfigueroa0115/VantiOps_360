import { describe, it, expect, vi, beforeEach } from "vitest";
import type { LoadResult } from "@/lib/server/risk-model-loader";

const mockLoadRiskModelFile = vi.hoisted(() => vi.fn<() => Promise<LoadResult>>());

vi.mock("@/lib/server/risk-model-loader", () => ({
  loadRiskModelFile: mockLoadRiskModelFile,
}));

import { GET } from "@/app/api/risk/model/route";

const validModelData = {
  model_type: "logistic_regression",
  metrics: {
    precision: 0.1134,
    recall: 0.5888,
    f1_score: 0.1901,
    roc_auc: 0.7958,
  },
  feature_importance: [
    { feature: "causa_test", importance: 4.16 },
    { feature: "causa_test2", importance: 3.66 },
  ],
  p90_threshold: 10.0,
  training_size: 38256,
  test_size: 12752,
  class_balance: { "0": 0.9594, "1": 0.0406 },
  limitations: [],
  disclaimer: "Analytical demonstration — not a production-grade model",
  generated_at: "2024-01-15T10:30:00Z",
  model_version: "1.0.0",
};

describe("GET /api/risk/model", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 404 MODEL_NOT_TRAINED when file does not exist", async () => {
    mockLoadRiskModelFile.mockResolvedValue({
      ok: false,
      error: "NOT_FOUND",
      message: "File not found",
    });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("MODEL_NOT_TRAINED");
    expect(body.error.message).toContain("not available");
  });

  it("returns 500 when file contains invalid JSON", async () => {
    mockLoadRiskModelFile.mockResolvedValue({
      ok: false,
      error: "PARSE_ERROR",
      message: "Invalid JSON",
    });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error.code).toBe("INTERNAL_ERROR");
    expect(body.error.message).toContain("invalid JSON");
  });

  it("returns 500 when a metric is out of [0, 1] range", async () => {
    const invalidData = {
      ...validModelData,
      metrics: { ...validModelData.metrics, precision: 1.5 },
    };
    mockLoadRiskModelFile.mockResolvedValue({ ok: true, data: invalidData });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.message).toContain("precision");
    expect(body.error.message).toContain("[0, 1]");
  });

  it("returns 500 when a metric is negative", async () => {
    const invalidData = {
      ...validModelData,
      metrics: { ...validModelData.metrics, recall: -0.1 },
    };
    mockLoadRiskModelFile.mockResolvedValue({ ok: true, data: invalidData });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.message).toContain("recall");
  });

  it("returns 200 with properly transformed data when file is valid", async () => {
    mockLoadRiskModelFile.mockResolvedValue({ ok: true, data: validModelData });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.modelType).toBe("logistic_regression");
    expect(body.metrics.precision).toBe(0.1134);
    expect(body.metrics.recall).toBe(0.5888);
    expect(body.metrics.f1Score).toBe(0.1901);
    expect(body.metrics.rocAuc).toBe(0.7958);
    expect(body.featureImportance).toHaveLength(2);
    expect(body.p90Threshold).toBe(10.0);
    expect(body.trainingSize).toBe(38256);
    expect(body.testSize).toBe(12752);
    expect(body.classBalance).toEqual({ "0": 0.9594, "1": 0.0406 });
    expect(body.limitations).toEqual([]);
    expect(body.lastTrainedAt).toBe("2024-01-15T10:30:00Z");
    expect(body.modelVersion).toBe("1.0.0");
  });

  it("includes disclaimer with correct text", async () => {
    mockLoadRiskModelFile.mockResolvedValue({ ok: true, data: validModelData });

    const response = await GET();
    const body = await response.json();

    expect(body.disclaimer).toBe(
      "This is a statistical model for analytical demonstration only. Not for production decision-making without expert validation."
    );
  });

  it("includes data provenance as DERIVED_DATA", async () => {
    mockLoadRiskModelFile.mockResolvedValue({ ok: true, data: validModelData });

    const response = await GET();
    const body = await response.json();

    expect(body.dataProvenance).toBe("DERIVED_DATA");
  });

  it("handles file read errors (non-ENOENT) with 500", async () => {
    mockLoadRiskModelFile.mockResolvedValue({
      ok: false,
      error: "READ_ERROR",
      message: "Permission denied",
    });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error.code).toBe("INTERNAL_ERROR");
  });

  it("handles missing optional fields gracefully", async () => {
    const minimalData = {
      metrics: {
        precision: 0.5,
        recall: 0.5,
        f1_score: 0.5,
        roc_auc: 0.5,
      },
    };
    mockLoadRiskModelFile.mockResolvedValue({ ok: true, data: minimalData });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.modelType).toBe("logistic_regression");
    expect(body.featureImportance).toEqual([]);
    expect(body.trainingSize).toBe(0);
    expect(body.testSize).toBe(0);
    expect(body.limitations).toEqual([]);
    expect(body.lastTrainedAt).toBeNull();
    expect(body.modelVersion).toBe("1.0.0");
    expect(body.dataProvenance).toBe("DERIVED_DATA");
  });
});
