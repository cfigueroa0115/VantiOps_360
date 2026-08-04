"""Unit tests for rca.main_cause module.

Tests main cause identification, Pareto chart data generation,
and structured summary building.

Requirements: 11.1, 11.2
"""

from datetime import date

import polars as pl
import pytest

from rca.main_cause import (
    MAIN_CAUSE_THRESHOLD,
    MainCauseResult,
    MainCauseSummary,
    ParetoChartData,
    build_main_cause_summary,
    identify_main_cause,
    pareto_chart_data,
)

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def sample_pqr_df() -> pl.DataFrame:
    """Create a sample PQR DataFrame for testing.

    Simulates the expected main cause 'Cancela Servihogar a solicitud cliente'
    at ~50% share, plus other causes.
    """
    main_cause = "Cancela Servihogar a solicitud cliente"
    records = (
        [main_cause] * 500  # 50%
        + ["Cancelacion por no pago"] * 150  # 15% (also cancel-related)
        + ["Reclamo por facturacion"] * 100  # 10%
        + ["Peticion de informacion"] * 80  # 8%
        + ["Queja por servicio"] * 70  # 7%
        + ["Otro motivo"] * 50  # 5%
        + ["Reclamo tecnico"] * 50  # 5%
    )
    n = len(records)

    return pl.DataFrame(
        {
            "causa": records,
            "fecha_creacion": [date(2023, (i % 12) + 1, 15) for i in range(n)],
            "canal_atencion": (
                ["telefono"] * (n // 2)
                + ["presencial"] * (n // 4)
                + ["web"] * (n - n // 2 - n // 4)
            ),
            "tiempo_gestion_dias": [float(i % 15) + 1.0 for i in range(n)],
            "resultado": (
                ["accede"] * (n // 3) + ["no_accede"] * (n // 3) + ["desiste"] * (n - 2 * (n // 3))
            ),
        }
    )


@pytest.fixture
def below_threshold_df() -> pl.DataFrame:
    """DataFrame where no cause reaches 45% share."""
    return pl.DataFrame(
        {
            "causa": (["Causa A"] * 40 + ["Causa B"] * 35 + ["Causa C"] * 25),
        }
    )


# ---------------------------------------------------------------------------
# identify_main_cause Tests
# ---------------------------------------------------------------------------


class TestIdentifyMainCause:
    """Tests for identify_main_cause()."""

    def test_confirms_main_cause_above_threshold(self, sample_pqr_df: pl.DataFrame):
        """When top cause ≥45% share, it is confirmed as the main cause."""
        result = identify_main_cause(sample_pqr_df)

        assert isinstance(result, MainCauseResult)
        assert result.cause_name == "Cancela Servihogar a solicitud cliente"
        assert result.record_count == 500
        assert result.percentage_share == pytest.approx(0.50, abs=0.01)
        assert result.is_confirmed is True
        assert "confirmed" in result.validation_message.lower()

    def test_does_not_confirm_below_threshold(self, below_threshold_df: pl.DataFrame):
        """When top cause <45% share, it is NOT confirmed."""
        result = identify_main_cause(below_threshold_df)

        assert result.is_confirmed is False
        assert result.percentage_share < MAIN_CAUSE_THRESHOLD
        assert "not confirmed" in result.validation_message.lower()

    def test_empty_dataframe(self):
        """Empty DataFrame returns no cause found."""
        df = pl.DataFrame({"causa": []}).cast({"causa": pl.Utf8})
        result = identify_main_cause(df)

        assert result.cause_name == ""
        assert result.record_count == 0
        assert result.percentage_share == 0.0
        assert result.is_confirmed is False

    def test_null_values_excluded(self):
        """Null values in cause column are excluded from analysis."""
        df = pl.DataFrame({"causa": ["Main"] * 60 + ["Other"] * 20 + [None] * 20})
        result = identify_main_cause(df)

        # Total is 80 (nulls excluded), Main is 60/80 = 75%
        assert result.record_count == 60
        assert result.percentage_share == pytest.approx(0.75, abs=0.01)
        assert result.is_confirmed is True

    def test_exactly_at_threshold(self):
        """Cause at exactly 45% share is confirmed."""
        # 45 out of 100 = 45% — Main must be the top cause
        df = pl.DataFrame({"causa": ["Main"] * 45 + ["Other1"] * 30 + ["Other2"] * 25})
        result = identify_main_cause(df)

        assert result.cause_name == "Main"
        assert result.percentage_share == pytest.approx(0.45)
        assert result.is_confirmed is True

    def test_custom_cause_column(self):
        """Works with a custom cause column name."""
        df = pl.DataFrame({"motivo": ["Cause A"] * 80 + ["Cause B"] * 20})
        result = identify_main_cause(df, cause_col="motivo")

        assert result.cause_name == "Cause A"
        assert result.is_confirmed is True

    def test_single_cause_100_percent(self):
        """Single cause at 100% is confirmed."""
        df = pl.DataFrame({"causa": ["Only Cause"] * 100})
        result = identify_main_cause(df)

        assert result.cause_name == "Only Cause"
        assert result.percentage_share == 1.0
        assert result.is_confirmed is True

    def test_validation_message_includes_numbers(self, sample_pqr_df: pl.DataFrame):
        """Validation message includes count and percentage information."""
        result = identify_main_cause(sample_pqr_df)

        assert "500" in result.validation_message
        assert "1,000" in result.validation_message
        assert "45%" in result.validation_message


# ---------------------------------------------------------------------------
# pareto_chart_data Tests
# ---------------------------------------------------------------------------


class TestParetoChartData:
    """Tests for pareto_chart_data()."""

    def test_ranked_descending(self, sample_pqr_df: pl.DataFrame):
        """Causes are ranked by frequency in descending order."""
        result = pareto_chart_data(sample_pqr_df, "causa")

        assert isinstance(result, ParetoChartData)
        # Counts should be non-increasing
        for i in range(len(result.counts) - 1):
            assert result.counts[i] >= result.counts[i + 1]

    def test_cumulative_percentages_reach_100(self, sample_pqr_df: pl.DataFrame):
        """Cumulative percentages reach 100% for the complete dataset."""
        result = pareto_chart_data(sample_pqr_df, "causa")

        assert result.cumulative_percentages[-1] == pytest.approx(1.0, abs=1e-5)

    def test_cumulative_percentages_are_increasing(self, sample_pqr_df: pl.DataFrame):
        """Cumulative percentages are strictly increasing."""
        result = pareto_chart_data(sample_pqr_df, "causa")

        for i in range(len(result.cumulative_percentages) - 1):
            assert result.cumulative_percentages[i] < result.cumulative_percentages[i + 1]

    def test_total_count_matches_sum(self, sample_pqr_df: pl.DataFrame):
        """Total count equals sum of all individual counts."""
        result = pareto_chart_data(sample_pqr_df, "causa")

        assert sum(result.counts) == result.total_count

    def test_percentages_sum_to_100(self, sample_pqr_df: pl.DataFrame):
        """Individual percentages sum to approximately 1.0."""
        result = pareto_chart_data(sample_pqr_df, "causa")

        assert sum(result.percentages) == pytest.approx(1.0, abs=1e-4)

    def test_all_lists_same_length(self, sample_pqr_df: pl.DataFrame):
        """All output lists have the same length."""
        result = pareto_chart_data(sample_pqr_df, "causa")

        n = len(result.causes)
        assert len(result.counts) == n
        assert len(result.percentages) == n
        assert len(result.cumulative_percentages) == n

    def test_empty_dataframe(self):
        """Empty DataFrame returns empty chart data."""
        df = pl.DataFrame({"col": []}).cast({"col": pl.Utf8})
        result = pareto_chart_data(df, "col")

        assert result.causes == []
        assert result.counts == []
        assert result.percentages == []
        assert result.cumulative_percentages == []
        assert result.total_count == 0

    def test_null_values_excluded(self):
        """Null values are excluded from Pareto chart data."""
        df = pl.DataFrame({"x": ["A"] * 60 + ["B"] * 20 + [None] * 20})
        result = pareto_chart_data(df, "x")

        assert result.total_count == 80
        assert "A" in result.causes
        assert "B" in result.causes

    def test_first_cause_is_most_frequent(self, sample_pqr_df: pl.DataFrame):
        """First cause in the list is the most frequent."""
        result = pareto_chart_data(sample_pqr_df, "causa")

        assert result.causes[0] == "Cancela Servihogar a solicitud cliente"
        assert result.counts[0] == 500


# ---------------------------------------------------------------------------
# build_main_cause_summary Tests
# ---------------------------------------------------------------------------


class TestBuildMainCauseSummary:
    """Tests for build_main_cause_summary()."""

    def test_basic_summary_structure(self, sample_pqr_df: pl.DataFrame):
        """Summary contains all expected fields populated."""
        result = build_main_cause_summary(sample_pqr_df, "Cancela Servihogar a solicitud cliente")

        assert isinstance(result, MainCauseSummary)
        assert result.cause_name == "Cancela Servihogar a solicitud cliente"
        assert result.absolute_volume == 500
        assert result.percentage_share == pytest.approx(0.50, abs=0.01)

    def test_temporal_trend_has_monthly_keys(self, sample_pqr_df: pl.DataFrame):
        """Temporal trend keys are in YYYY-MM format."""
        result = build_main_cause_summary(sample_pqr_df, "Cancela Servihogar a solicitud cliente")

        assert len(result.temporal_trend) > 0
        for key in result.temporal_trend:
            assert len(key) == 7  # YYYY-MM
            assert key[4] == "-"

    def test_temporal_trend_volumes_sum_to_total(self, sample_pqr_df: pl.DataFrame):
        """Monthly volumes sum to the absolute volume."""
        result = build_main_cause_summary(sample_pqr_df, "Cancela Servihogar a solicitud cliente")

        assert sum(result.temporal_trend.values()) == result.absolute_volume

    def test_channels_proportions_sum_to_1(self, sample_pqr_df: pl.DataFrame):
        """Channel proportions sum to approximately 1.0."""
        result = build_main_cause_summary(sample_pqr_df, "Cancela Servihogar a solicitud cliente")

        assert len(result.channels) > 0
        assert sum(result.channels.values()) == pytest.approx(1.0, abs=0.01)

    def test_time_stats_has_required_keys(self, sample_pqr_df: pl.DataFrame):
        """Time stats contain mean, median, and p90."""
        result = build_main_cause_summary(sample_pqr_df, "Cancela Servihogar a solicitud cliente")

        assert "mean" in result.time_stats
        assert "median" in result.time_stats
        assert "p90" in result.time_stats
        assert all(v >= 0 for v in result.time_stats.values())

    def test_result_distribution_percentages(self, sample_pqr_df: pl.DataFrame):
        """Result distribution percentages are between 0 and 100."""
        result = build_main_cause_summary(sample_pqr_df, "Cancela Servihogar a solicitud cliente")

        assert len(result.result_distribution) > 0
        for pct in result.result_distribution.values():
            assert 0 <= pct <= 100

    def test_result_distribution_sums_to_100(self, sample_pqr_df: pl.DataFrame):
        """Result distribution percentages sum to approximately 100%."""
        result = build_main_cause_summary(sample_pqr_df, "Cancela Servihogar a solicitud cliente")

        assert sum(result.result_distribution.values()) == pytest.approx(100.0, abs=1.0)

    def test_related_causes_contain_cancel(self, sample_pqr_df: pl.DataFrame):
        """Related causes all contain 'cancel' in their name."""
        result = build_main_cause_summary(sample_pqr_df, "Cancela Servihogar a solicitud cliente")

        for related in result.related_causes:
            assert "cancel" in related["cause"].lower()

    def test_related_causes_exclude_main_cause(self, sample_pqr_df: pl.DataFrame):
        """Related causes list does not include the main cause itself."""
        main_cause = "Cancela Servihogar a solicitud cliente"
        result = build_main_cause_summary(sample_pqr_df, main_cause)

        for related in result.related_causes:
            assert related["cause"] != main_cause

    def test_combined_cancellation_share_includes_main(self, sample_pqr_df: pl.DataFrame):
        """Combined cancellation share includes the main cause."""
        result = build_main_cause_summary(sample_pqr_df, "Cancela Servihogar a solicitud cliente")

        # Main cause = 50%, "Cancelacion por no pago" = 15% → combined ≥ 65%
        assert result.combined_cancellation_share >= 0.65

    def test_operational_impact_positive(self, sample_pqr_df: pl.DataFrame):
        """Operational impact hours per month is positive."""
        result = build_main_cause_summary(sample_pqr_df, "Cancela Servihogar a solicitud cliente")

        assert result.operational_impact_hours_per_month > 0

    def test_operational_impact_formula(self, sample_pqr_df: pl.DataFrame):
        """Operational impact follows the 15 min/PQR formula."""
        result = build_main_cause_summary(sample_pqr_df, "Cancela Servihogar a solicitud cliente")

        # 500 records over 12 months → ~41.67/month × 15 min / 60 = ~10.42 hours
        num_months = len(result.temporal_trend)
        expected_monthly_avg = result.absolute_volume / num_months
        expected_hours = expected_monthly_avg * 15 / 60
        assert result.operational_impact_hours_per_month == pytest.approx(expected_hours, abs=0.1)

    def test_cause_not_in_dataframe(self, sample_pqr_df: pl.DataFrame):
        """Summary for a cause not present returns zero volume."""
        result = build_main_cause_summary(sample_pqr_df, "Nonexistent Cause")

        assert result.absolute_volume == 0
        assert result.percentage_share == 0.0
        assert result.temporal_trend == {}
        assert result.channels == {}

    def test_missing_optional_columns(self):
        """Works when optional columns (canal_atencion, resultado) are missing."""
        df = pl.DataFrame(
            {
                "causa": ["Main"] * 50 + ["Other"] * 50,
                "fecha_creacion": [date(2023, 6, 15)] * 100,
            }
        )
        result = build_main_cause_summary(df, "Main")

        assert result.absolute_volume == 50
        assert result.channels == {}
        assert result.result_distribution == {}
        assert result.time_stats == {"mean": 0.0, "median": 0.0, "p90": 0.0}
