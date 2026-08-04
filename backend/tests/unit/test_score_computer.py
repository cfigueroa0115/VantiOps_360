"""Unit tests for QualityScoreComputer: six quality dimensions and composite score.

Tests cover:
- Completeness: non-null ratio per field averaged
- Validity: conformance to schema rules (categoricals, ranges)
- Consistency: contradiction detection (3 rules)
- Uniqueness: duplicate rate on identifier
- Timeliness: date range validation
- Referential integrity: catalog matching
- Composite score computation
- QualityViolation detail table generation

Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 10.9
"""

from datetime import date, timedelta

import polars as pl
import pytest

from quality.models import QualityScore, SeverityLevel
from quality.score_computer import (
    QualityScoreComputer,
    QualityViolation,
)

# ============================================================================
# Helpers
# ============================================================================


def _make_clean_df(n: int = 10) -> pl.DataFrame:
    """Create a clean DataFrame with no quality issues."""
    return pl.DataFrame(
        {
            "id_pqr": list(range(1, n + 1)),
            "fecha_creacion": [date(2023, 1, i + 1) for i in range(n)],
            "fecha_cierre": [date(2023, 1, i + 2) for i in range(n)],
            "estado": ["cerrado"] * n,
            "tipo_pqr": ["peticion"] * (n // 2) + ["queja"] * (n - n // 2),
            "tiempo_gestion_dias": [float(i + 1) for i in range(n)],
            "resultado": ["accede"] * (n // 2) + ["no_accede"] * (n - n // 2),
            "empresa": ["empresa_a"] * n,
            "causa": ["causa_1"] * n,
            "canal_atencion": ["telefono"] * n,
        }
    )


# ============================================================================
# Completeness tests
# ============================================================================


class TestCompleteness:
    """Tests for the completeness dimension."""

    def test_all_complete_returns_100(self):
        """A DataFrame with no nulls should have 100% completeness."""
        df = _make_clean_df()
        computer = QualityScoreComputer()
        score, violations = computer.compute(df)

        assert score.completeness == 100.0

    def test_nulls_reduce_completeness(self):
        """Null values reduce the completeness score."""
        df = pl.DataFrame(
            {
                "id_pqr": [1, 2, 3, 4],
                "fecha_creacion": [date(2023, 1, 1), None, date(2023, 1, 3), None],
                "estado": ["cerrado", "abierto", "en_proceso", "abierto"],
                "tipo_pqr": ["peticion", "queja", "reclamo", "peticion"],
            }
        )
        computer = QualityScoreComputer()
        score, violations = computer.compute(df)

        # fecha_creacion has 2/4 nulls → 50% complete for that field
        # Other 3 fields are 100% complete
        # Average: (100 + 50 + 100 + 100) / 4 = 87.5
        assert score.completeness == 87.5

    def test_all_null_column(self):
        """A column that is entirely null scores 0% for that field."""
        df = pl.DataFrame(
            {
                "id_pqr": [1, 2],
                "all_null": [None, None],
            }
        )
        computer = QualityScoreComputer()
        score, violations = computer.compute(df)

        # id_pqr: 100%, all_null: 0% → average = 50%
        assert score.completeness == 50.0

    def test_empty_dataframe_returns_100(self):
        """An empty DataFrame defaults to 100% completeness."""
        df = pl.DataFrame({"id_pqr": pl.Series([], dtype=pl.Int64)})
        computer = QualityScoreComputer()
        score, violations = computer.compute(df)

        assert score.completeness == 100.0

    def test_completeness_violations_generated(self):
        """Null values generate violation records."""
        df = pl.DataFrame(
            {
                "id_pqr": [1, 2, 3],
                "campo_a": [None, "ok", "ok"],
            }
        )
        computer = QualityScoreComputer()
        _, violations = computer.compute(df)

        completeness_violations = [
            v for v in violations if v.rule_name == "completeness_null_values"
        ]
        # campo_a has 1 null
        campo_a_v = [v for v in completeness_violations if v.target_field == "campo_a"]
        assert len(campo_a_v) == 1
        assert campo_a_v[0].violations_count == 1


# ============================================================================
# Validity tests
# ============================================================================


class TestValidity:
    """Tests for the validity dimension."""

    def test_valid_data_returns_100(self):
        """Data conforming to all schema rules scores 100%."""
        df = _make_clean_df()
        computer = QualityScoreComputer()
        score, violations = computer.compute(df)

        assert score.validity == 100.0

    def test_invalid_estado_reduces_validity(self):
        """Invalid estado values reduce validity score."""
        df = pl.DataFrame(
            {
                "id_pqr": [1, 2, 3, 4],
                "estado": ["cerrado", "abierto", "INVALID", "bad_value"],
                "tipo_pqr": ["peticion", "queja", "reclamo", "peticion"],
            }
        )
        computer = QualityScoreComputer()
        score, violations = computer.compute(df)

        # estado: 2/4 valid, tipo_pqr: 4/4 valid → (2+4)/(4+4) = 6/8 = 75%
        assert score.validity == 75.0

    def test_invalid_tipo_pqr(self):
        """Invalid tipo_pqr values reduce validity score."""
        df = pl.DataFrame(
            {
                "id_pqr": [1, 2],
                "tipo_pqr": ["peticion", "invalid_type"],
                "estado": ["cerrado", "abierto"],
            }
        )
        computer = QualityScoreComputer()
        score, violations = computer.compute(df)

        # estado: 2/2 valid, tipo_pqr: 1/2 valid → 3/4 = 75%
        assert score.validity == 75.0

    def test_negative_tiempo_gestion(self):
        """Negative tiempo_gestion_dias values are invalid."""
        df = pl.DataFrame(
            {
                "id_pqr": [1, 2, 3],
                "tiempo_gestion_dias": [5.0, -1.0, 10.0],
            }
        )
        computer = QualityScoreComputer()
        score, violations = computer.compute(df)

        # 3 non-null values checked, 2 valid (>=0), 1 invalid
        # validity = 2/3 * 100 = 66.67
        assert score.validity == pytest.approx(66.67, abs=0.01)

    def test_null_tiempo_gestion_not_checked(self):
        """Null tiempo_gestion_dias values are not counted in validity check."""
        df = pl.DataFrame(
            {
                "id_pqr": [1, 2, 3],
                "tiempo_gestion_dias": [5.0, None, 10.0],
            }
        )
        computer = QualityScoreComputer()
        score, violations = computer.compute(df)

        # Only 2 non-null values checked, both >= 0 → 100% validity
        assert score.validity == 100.0


# ============================================================================
# Consistency tests
# ============================================================================


class TestConsistency:
    """Tests for the consistency dimension."""

    def test_no_contradictions_returns_100(self):
        """Data with no contradictions scores 100%."""
        df = _make_clean_df()
        computer = QualityScoreComputer()
        score, violations = computer.compute(df)

        assert score.consistency == 100.0

    def test_cerrado_null_fecha_cierre(self):
        """estado='cerrado' with null fecha_cierre is a contradiction."""
        df = pl.DataFrame(
            {
                "id_pqr": [1, 2, 3, 4],
                "estado": ["cerrado", "cerrado", "abierto", "en_proceso"],
                "fecha_cierre": [date(2023, 2, 1), None, None, None],
                "fecha_creacion": [date(2023, 1, 1)] * 4,
                "resultado": ["accede", "no_accede", "no_accede", "no_accede"],
                "tiempo_gestion_dias": [5.0, 3.0, 2.0, 1.0],
            }
        )
        computer = QualityScoreComputer()
        score, violations = computer.compute(df)

        # 1 contradiction out of 4 records → 100 - 25 = 75%
        assert score.consistency == 75.0

    def test_accede_zero_tiempo(self):
        """resultado='accede' with tiempo_gestion_dias=0 is a contradiction."""
        df = pl.DataFrame(
            {
                "id_pqr": [1, 2, 3, 4, 5],
                "estado": ["cerrado"] * 5,
                "fecha_cierre": [date(2023, 2, 1)] * 5,
                "fecha_creacion": [date(2023, 1, 1)] * 5,
                "resultado": ["accede", "accede", "no_accede", "no_accede", "accede"],
                "tiempo_gestion_dias": [0.0, 5.0, 0.0, 3.0, 0.0],
            }
        )
        computer = QualityScoreComputer()
        score, violations = computer.compute(df)

        # 2 contradictions (records 1 and 5): accede + 0 days
        # 100 - (2/5 * 100) = 60%
        assert score.consistency == 60.0

    def test_fecha_cierre_before_creacion(self):
        """fecha_cierre < fecha_creacion is a contradiction."""
        df = pl.DataFrame(
            {
                "id_pqr": [1, 2, 3],
                "fecha_creacion": [date(2023, 6, 1), date(2023, 1, 1), date(2023, 3, 1)],
                "fecha_cierre": [date(2023, 1, 1), date(2023, 2, 1), date(2023, 4, 1)],
                "estado": ["cerrado", "cerrado", "cerrado"],
                "resultado": ["no_accede", "no_accede", "no_accede"],
                "tiempo_gestion_dias": [5.0, 5.0, 5.0],
            }
        )
        computer = QualityScoreComputer()
        score, violations = computer.compute(df)

        # Record 1: cierre (2023-01-01) < creacion (2023-06-01) → contradiction
        # 1 contradiction out of 3 → 100 - 33.33 = 66.67
        assert score.consistency == pytest.approx(66.67, abs=0.01)

    def test_multiple_contradictions_accumulate(self):
        """Multiple contradiction types accumulate."""
        df = pl.DataFrame(
            {
                "id_pqr": [1, 2],
                "estado": ["cerrado", "cerrado"],
                "fecha_cierre": [None, date(2022, 12, 1)],
                "fecha_creacion": [date(2023, 1, 1), date(2023, 1, 1)],
                "resultado": ["accede", "no_accede"],
                "tiempo_gestion_dias": [0.0, 5.0],
            }
        )
        computer = QualityScoreComputer()
        score, violations = computer.compute(df)

        # Record 1: cerrado + null fecha_cierre + accede + 0 days = 2 contradictions
        # Record 2: fecha_cierre (2022-12-01) < fecha_creacion (2023-01-01) = 1 contradiction
        # Total: 3 contradictions / 2 records → can exceed 100% but capped at 0 minimum
        # consistency = max(0, 100 - (3/2 * 100)) = max(0, -50) = 0
        assert score.consistency == 0.0


# ============================================================================
# Uniqueness tests
# ============================================================================


class TestUniqueness:
    """Tests for the uniqueness dimension."""

    def test_all_unique_returns_100(self):
        """All unique identifiers score 100%."""
        df = _make_clean_df()
        computer = QualityScoreComputer()
        score, violations = computer.compute(df)

        assert score.uniqueness == 100.0

    def test_duplicates_reduce_uniqueness(self):
        """Duplicate identifiers reduce uniqueness score."""
        df = pl.DataFrame(
            {
                "id_pqr": [1, 2, 3, 3, 4, 4],
                "estado": ["abierto"] * 6,
                "tipo_pqr": ["peticion"] * 6,
            }
        )
        computer = QualityScoreComputer()
        score, violations = computer.compute(df)

        # 6 records, 4 distinct → 2 duplicates → rate = 2/6*100 = 33.33
        # uniqueness = 100 - 33.33 = 66.67
        assert score.uniqueness == pytest.approx(66.67, abs=0.01)

    def test_missing_id_column_returns_100(self):
        """If id column is not present, uniqueness defaults to 100%."""
        df = pl.DataFrame({"other_col": [1, 2, 3]})
        computer = QualityScoreComputer(id_column="id_pqr")
        score, violations = computer.compute(df)

        assert score.uniqueness == 100.0


# ============================================================================
# Timeliness tests
# ============================================================================


class TestTimeliness:
    """Tests for the timeliness dimension."""

    def test_valid_dates_return_100(self):
        """Dates within valid range score 100%."""
        df = _make_clean_df()
        computer = QualityScoreComputer()
        score, violations = computer.compute(df)

        assert score.timeliness == 100.0

    def test_dates_before_2020_reduce_score(self):
        """Dates before 2020-01-01 are timeliness violations."""
        df = pl.DataFrame(
            {
                "id_pqr": [1, 2, 3, 4],
                "fecha_creacion": [
                    date(2019, 12, 31),  # violation
                    date(2020, 1, 1),  # valid (boundary)
                    date(2023, 6, 15),  # valid
                    date(2018, 5, 1),  # violation
                ],
            }
        )
        computer = QualityScoreComputer()
        score, violations = computer.compute(df)

        # 2 violations out of 4 → 100 - 50 = 50%
        assert score.timeliness == 50.0

    def test_future_dates_reduce_score(self):
        """Dates after current date are timeliness violations."""
        future = date.today() + timedelta(days=30)
        df = pl.DataFrame(
            {
                "id_pqr": [1, 2, 3],
                "fecha_creacion": [
                    date(2023, 1, 1),  # valid
                    future,  # violation
                    date(2022, 6, 1),  # valid
                ],
            }
        )
        computer = QualityScoreComputer()
        score, violations = computer.compute(df)

        # 1 violation out of 3 → 100 - 33.33 = 66.67
        assert score.timeliness == pytest.approx(66.67, abs=0.01)

    def test_missing_fecha_creacion_returns_100(self):
        """If fecha_creacion column missing, timeliness defaults to 100%."""
        df = pl.DataFrame({"id_pqr": [1, 2, 3]})
        computer = QualityScoreComputer()
        score, violations = computer.compute(df)

        assert score.timeliness == 100.0


# ============================================================================
# Referential Integrity tests
# ============================================================================


class TestReferentialIntegrity:
    """Tests for the referential integrity dimension."""

    def test_empty_catalogs_return_100(self):
        """Empty catalogs (default) accept all values → 100%."""
        df = _make_clean_df()
        computer = QualityScoreComputer()
        score, violations = computer.compute(df)

        assert score.referential_integrity == 100.0

    def test_all_values_in_catalog(self):
        """Values matching the catalog score 100%."""
        df = pl.DataFrame(
            {
                "id_pqr": [1, 2, 3],
                "empresa": ["vanti", "vanti_gas", "vanti"],
                "causa": ["causa_a", "causa_b", "causa_a"],
                "canal_atencion": ["telefono", "web", "telefono"],
            }
        )
        catalogs = {
            "empresa": ["vanti", "vanti_gas"],
            "causa": ["causa_a", "causa_b"],
            "canal_atencion": ["telefono", "web"],
        }
        computer = QualityScoreComputer(domain_catalogs=catalogs)
        score, violations = computer.compute(df)

        assert score.referential_integrity == 100.0

    def test_unmatched_values_reduce_score(self):
        """Values not in catalog reduce referential integrity."""
        df = pl.DataFrame(
            {
                "id_pqr": [1, 2, 3, 4],
                "empresa": ["vanti", "unknown_co", "vanti", "other_co"],
            }
        )
        catalogs = {"empresa": ["vanti"]}
        computer = QualityScoreComputer(domain_catalogs=catalogs)
        score, violations = computer.compute(df)

        # 4 total values, 2 unmatched → 100 - (2/4*100) = 50%
        assert score.referential_integrity == 50.0

    def test_null_values_excluded_from_check(self):
        """Null values in catalog fields are not counted."""
        df = pl.DataFrame(
            {
                "id_pqr": [1, 2, 3],
                "empresa": ["vanti", None, "invalid"],
            }
        )
        catalogs = {"empresa": ["vanti"]}
        computer = QualityScoreComputer(domain_catalogs=catalogs)
        score, violations = computer.compute(df)

        # 2 non-null values, 1 unmatched → 100 - (1/2*100) = 50%
        assert score.referential_integrity == 50.0

    def test_multiple_catalogs(self):
        """Multiple catalogs combine their unmatched counts."""
        df = pl.DataFrame(
            {
                "id_pqr": [1, 2],
                "empresa": ["vanti", "unknown"],
                "canal_atencion": ["telefono", "fax"],
            }
        )
        catalogs = {
            "empresa": ["vanti"],
            "canal_atencion": ["telefono", "web"],
        }
        computer = QualityScoreComputer(domain_catalogs=catalogs)
        score, violations = computer.compute(df)

        # empresa: 2 non-null, 1 unmatched
        # canal_atencion: 2 non-null, 1 unmatched
        # Total: 4 categorical values, 2 unmatched → 100 - 50 = 50%
        assert score.referential_integrity == 50.0


# ============================================================================
# Composite Score tests
# ============================================================================


class TestCompositeScore:
    """Tests for the composite score computation."""

    def test_perfect_score(self):
        """Clean data with default catalogs produces score of 100."""
        df = _make_clean_df()
        computer = QualityScoreComputer()
        score, violations = computer.compute(df)

        assert score.composite_score == 100.0

    def test_composite_is_weighted_sum(self):
        """Composite score equals the weighted sum of dimensions."""
        df = _make_clean_df()
        computer = QualityScoreComputer()
        score, _ = computer.compute(df)

        expected = (
            score.completeness * 0.25
            + score.validity * 0.20
            + score.consistency * 0.20
            + score.uniqueness * 0.15
            + score.timeliness * 0.10
            + score.referential_integrity * 0.10
        )
        assert score.composite_score == pytest.approx(expected, abs=0.01)

    def test_composite_in_range_0_100(self):
        """Composite score is always within [0, 100]."""
        # Worst case: many issues
        df = pl.DataFrame(
            {
                "id_pqr": [1, 1, 1],  # all duplicates
                "fecha_creacion": [date(2019, 1, 1), date(2019, 1, 1), None],  # violations
                "estado": ["cerrado", "cerrado", "cerrado"],
                "fecha_cierre": [None, None, None],  # contradictions
                "tipo_pqr": ["INVALID", "INVALID", "INVALID"],  # validity issues
                "resultado": ["accede", "accede", "accede"],
                "tiempo_gestion_dias": [0.0, 0.0, 0.0],
            }
        )
        computer = QualityScoreComputer()
        score, _ = computer.compute(df)

        assert 0.0 <= score.composite_score <= 100.0

    def test_uses_quality_score_compute(self):
        """The result is a QualityScore instance from QualityScore.compute()."""
        df = _make_clean_df()
        computer = QualityScoreComputer()
        score, _ = computer.compute(df)

        assert isinstance(score, QualityScore)


# ============================================================================
# Violation detail table tests
# ============================================================================


class TestViolationDetails:
    """Tests for the QualityViolation detail table."""

    def test_clean_data_no_violations(self):
        """Clean data produces no violations (with default empty catalogs)."""
        df = _make_clean_df()
        computer = QualityScoreComputer()
        _, violations = computer.compute(df)

        assert len(violations) == 0

    def test_violation_has_all_fields(self):
        """Each violation contains all required fields."""
        df = pl.DataFrame(
            {
                "id_pqr": [1, 2],
                "campo_con_nulls": [None, "valor"],
            }
        )
        computer = QualityScoreComputer()
        _, violations = computer.compute(df)

        assert len(violations) > 0
        v = violations[0]
        assert isinstance(v, QualityViolation)
        assert v.rule_name != ""
        assert v.target_field != ""
        assert v.violations_count > 0
        assert 0.0 <= v.violations_percentage <= 100.0
        assert isinstance(v.severity, SeverityLevel)
        assert v.corrective_action != ""

    def test_severity_levels_assigned_correctly(self):
        """Severity levels follow threshold rules: >20% critical, >10% high, >5% medium, ≤5% low."""
        # 1 violation out of 4 records = 25% → CRITICAL
        df = pl.DataFrame(
            {
                "id_pqr": [1, 2, 3, 4],
                "estado": ["cerrado", "cerrado", "cerrado", "cerrado"],
                "fecha_cierre": [None, date(2023, 2, 1), date(2023, 2, 1), date(2023, 2, 1)],
                "fecha_creacion": [date(2023, 1, 1)] * 4,
                "resultado": ["no_accede"] * 4,
                "tiempo_gestion_dias": [5.0] * 4,
            }
        )
        computer = QualityScoreComputer()
        _, violations = computer.compute(df)

        consistency_v = [
            v for v in violations if v.rule_name == "consistency_cerrado_null_fecha_cierre"
        ]
        assert len(consistency_v) == 1
        # 1/4 = 25% → CRITICAL
        assert consistency_v[0].severity == SeverityLevel.CRITICAL

    def test_multiple_rule_types_in_violations(self):
        """Violations from multiple dimensions are collected together."""
        df = pl.DataFrame(
            {
                "id_pqr": [1, 1, 2],  # duplicates
                "fecha_creacion": [date(2019, 1, 1), date(2023, 1, 1), None],  # timeliness + nulls
                "estado": ["cerrado", "abierto", "en_proceso"],
                "fecha_cierre": [None, None, None],  # consistency issue with cerrado
                "tipo_pqr": ["peticion", "queja", "reclamo"],
                "resultado": ["no_accede"] * 3,
                "tiempo_gestion_dias": [5.0, 3.0, 1.0],
            }
        )
        computer = QualityScoreComputer()
        _, violations = computer.compute(df)

        rule_names = {v.rule_name for v in violations}
        # Should have violations from multiple dimensions
        assert len(rule_names) > 1
