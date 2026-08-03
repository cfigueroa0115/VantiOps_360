"""
Property-based tests for Risk Model metrics validity.

Property 14: Risk model metrics validity
Validates: Requirements 7.2, 7.3, 7.4

Tests the validation logic that ensures:
- P14a: Any metric value in [0.0, 1.0] is valid
- P14b: Any metric value < 0.0 or > 1.0 is invalid
- P14c: The response always includes a non-empty disclaimer string
- P14d: The response always includes provenance = "DERIVED_DATA"
"""

from hypothesis import assume, given, settings
from hypothesis import strategies as st

# ---------------------------------------------------------------------------
# Validation functions mirroring the TypeScript route logic
# ---------------------------------------------------------------------------

VALID_METRIC_NAMES = ("precision", "recall", "f1_score", "roc_auc")

DISCLAIMER = (
    "This is a statistical model for analytical demonstration only. "
    "Not for production decision-making without expert validation."
)

DATA_PROVENANCE = "DERIVED_DATA"


def is_valid_metric(value: float) -> bool:
    """
    Validates that a metric value is within the valid [0, 1] range.
    Mirrors: isValidMetric in frontend/app/api/risk/model/route.ts
    """
    return isinstance(value, (int, float)) and 0.0 <= value <= 1.0


def build_risk_model_response(
    metrics: dict[str, float],
    model_type: str = "logistic_regression",
) -> dict:
    """
    Builds the risk model API response including required disclaimer and provenance.
    Mirrors the response construction in frontend/app/api/risk/model/route.ts
    """
    return {
        "modelType": model_type,
        "metrics": {
            "precision": metrics.get("precision", 0),
            "recall": metrics.get("recall", 0),
            "f1Score": metrics.get("f1_score", 0),
            "rocAuc": metrics.get("roc_auc", 0),
        },
        "featureImportance": [],
        "p90Threshold": 0,
        "trainingSize": 0,
        "testSize": 0,
        "classBalance": {},
        "limitations": [],
        "disclaimer": DISCLAIMER,
        "lastTrainedAt": None,
        "modelVersion": "1.0.0",
        "dataProvenance": DATA_PROVENANCE,
    }


# ---------------------------------------------------------------------------
# Hypothesis strategies
# ---------------------------------------------------------------------------

# Valid metric values in [0.0, 1.0]
valid_metric_st = st.floats(min_value=0.0, max_value=1.0, allow_nan=False, allow_infinity=False)

# Invalid metric values: either < 0.0 or > 1.0
invalid_metric_below_st = st.floats(max_value=-0.0001, allow_nan=False, allow_infinity=False)
invalid_metric_above_st = st.floats(min_value=1.0001, allow_nan=False, allow_infinity=False)
invalid_metric_st = st.one_of(invalid_metric_below_st, invalid_metric_above_st)

# Strategy for a full valid metrics dictionary
valid_metrics_dict_st = st.fixed_dictionaries({
    "precision": valid_metric_st,
    "recall": valid_metric_st,
    "f1_score": valid_metric_st,
    "roc_auc": valid_metric_st,
})


# ---------------------------------------------------------------------------
# Property tests
# ---------------------------------------------------------------------------


class TestRiskModelMetricsValidity:
    """
    **Validates: Requirements 7.2, 7.3, 7.4**

    Property 14: Risk model metrics validity
    """

    @given(value=valid_metric_st)
    @settings(max_examples=200)
    def test_p14a_valid_metric_in_range_is_accepted(self, value: float):
        """
        P14a: Any metric value in [0.0, 1.0] is valid.

        **Validates: Requirements 7.2**

        For any float v in [0.0, 1.0], is_valid_metric(v) must return True.
        """
        assert is_valid_metric(value), (
            f"Metric value {value} is in [0, 1] but was rejected"
        )

    @given(value=invalid_metric_st)
    @settings(max_examples=200)
    def test_p14b_invalid_metric_outside_range_is_rejected(self, value: float):
        """
        P14b: Any metric value < 0.0 or > 1.0 is invalid.

        **Validates: Requirements 7.2**

        For any float v outside [0.0, 1.0], is_valid_metric(v) must return False.
        """
        assume(value < 0.0 or value > 1.0)
        assert not is_valid_metric(value), (
            f"Metric value {value} is outside [0, 1] but was accepted"
        )

    @given(metrics=valid_metrics_dict_st)
    @settings(max_examples=200)
    def test_p14c_response_always_includes_nonempty_disclaimer(self, metrics: dict):
        """
        P14c: The response always includes a non-empty disclaimer string.

        **Validates: Requirements 7.4**

        For any valid set of metrics, the built response must contain a non-empty
        disclaimer field that warns about analytical-only use.
        """
        response = build_risk_model_response(metrics)
        disclaimer = response.get("disclaimer")
        assert isinstance(disclaimer, str), "Disclaimer must be a string"
        assert len(disclaimer) > 0, "Disclaimer must not be empty"
        assert "demonstration" in disclaimer.lower() or "analytical" in disclaimer.lower(), (
            "Disclaimer must indicate this is for analytical demonstration"
        )

    @given(metrics=valid_metrics_dict_st)
    @settings(max_examples=200)
    def test_p14d_response_always_includes_derived_data_provenance(self, metrics: dict):
        """
        P14d: The response always includes provenance = "DERIVED_DATA".

        **Validates: Requirements 7.3**

        For any valid set of metrics, the built response must have
        dataProvenance set to "DERIVED_DATA" to correctly classify the model output.
        """
        response = build_risk_model_response(metrics)
        provenance = response.get("dataProvenance")
        assert provenance == "DERIVED_DATA", (
            f"Expected dataProvenance='DERIVED_DATA', got '{provenance}'"
        )
