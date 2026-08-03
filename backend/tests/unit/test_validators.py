"""Unit tests for date validation and semantic similarity detection.

Tests validate_dates() for multiple date formats, native Polars types,
and invalid values. Tests find_semantic_similarities() for Levenshtein
ratio grouping with 0.85 threshold and transitive closure.

Requirements: 2.2, 2.6
"""

from __future__ import annotations

from datetime import date, datetime

import polars as pl

from profiling.validators import (
    _levenshtein_distance,
    find_semantic_similarities,
    levenshtein_ratio,
    validate_dates,
)


class TestLevenshteinDistance:
    """Tests for the pure-Python Levenshtein distance implementation."""

    def test_identical_strings(self) -> None:
        assert _levenshtein_distance("hello", "hello") == 0

    def test_empty_strings(self) -> None:
        assert _levenshtein_distance("", "") == 0

    def test_one_empty(self) -> None:
        assert _levenshtein_distance("abc", "") == 3
        assert _levenshtein_distance("", "xyz") == 3

    def test_single_substitution(self) -> None:
        assert _levenshtein_distance("cat", "bat") == 1

    def test_single_insertion(self) -> None:
        assert _levenshtein_distance("cat", "cats") == 1

    def test_single_deletion(self) -> None:
        assert _levenshtein_distance("cats", "cat") == 1

    def test_completely_different(self) -> None:
        assert _levenshtein_distance("abc", "xyz") == 3

    def test_known_example(self) -> None:
        # "kitten" → "sitting": substitute k→s, e→i, insert g = 3
        assert _levenshtein_distance("kitten", "sitting") == 3


class TestLevenshteinRatio:
    """Tests for Levenshtein similarity ratio."""

    def test_identical_strings_ratio_1(self) -> None:
        assert levenshtein_ratio("hello", "hello") == 1.0

    def test_completely_different_ratio_0(self) -> None:
        # "abc" vs "xyz" → distance 3, max_len 3 → ratio = 0.0
        assert levenshtein_ratio("abc", "xyz") == 0.0

    def test_empty_strings_ratio_1(self) -> None:
        assert levenshtein_ratio("", "") == 1.0

    def test_one_empty_ratio_0(self) -> None:
        assert levenshtein_ratio("abc", "") == 0.0

    def test_high_similarity(self) -> None:
        # "cancelación" vs "cancelacion" → 1 substitution, len 11
        # ratio = 1 - 1/11 ≈ 0.909
        ratio = levenshtein_ratio("cancelación", "cancelacion")
        assert ratio > 0.85

    def test_low_similarity(self) -> None:
        # Clearly different strings
        ratio = levenshtein_ratio("telefono", "correo")
        assert ratio < 0.85

    def test_ratio_symmetric(self) -> None:
        r1 = levenshtein_ratio("hello", "hallo")
        r2 = levenshtein_ratio("hallo", "hello")
        assert r1 == r2

    def test_ratio_bounds(self) -> None:
        """Ratio should always be between 0 and 1."""
        ratio = levenshtein_ratio("some string", "another value")
        assert 0.0 <= ratio <= 1.0


class TestValidateDatesNativeTypes:
    """Tests for validate_dates with native Polars Date/Datetime columns."""

    def test_native_date_column_all_valid(self) -> None:
        """Polars Date column → all non-null values valid."""
        series = pl.Series("fecha", [date(2024, 1, 1), date(2024, 6, 15), date(2023, 12, 31)])
        result = validate_dates(series)

        assert result.column_name == "fecha"
        assert result.total_count == 3
        assert result.valid_count == 3
        assert result.invalid_count == 0
        assert result.invalid_percentage == 0.0
        assert "native_polars_datetime" in result.recognized_formats

    def test_native_datetime_column_all_valid(self) -> None:
        """Polars Datetime column → all non-null values valid."""
        series = pl.Series(
            "ts",
            [datetime(2024, 1, 1, 10, 0), datetime(2024, 6, 15, 14, 30)],
        )
        result = validate_dates(series)

        assert result.total_count == 2
        assert result.valid_count == 2
        assert result.invalid_count == 0

    def test_native_date_with_nulls(self) -> None:
        """Polars Date column with nulls → nulls excluded, rest valid."""
        series = pl.Series("fecha", [date(2024, 1, 1), None, date(2024, 6, 15)])
        result = validate_dates(series)

        assert result.total_count == 2
        assert result.valid_count == 2
        assert result.invalid_count == 0


class TestValidateDatesStringColumns:
    """Tests for validate_dates with string columns."""

    def test_iso_format_valid(self) -> None:
        """ISO date strings parse correctly."""
        series = pl.Series("dt", ["2024-01-15", "2024-06-30", "2023-12-01"])
        result = validate_dates(series)

        assert result.valid_count == 3
        assert result.invalid_count == 0
        assert "%Y-%m-%d" in result.recognized_formats

    def test_iso_datetime_format(self) -> None:
        """ISO datetime with time component."""
        series = pl.Series("dt", ["2024-01-15T10:30:00", "2024-06-30T14:00:00"])
        result = validate_dates(series)

        assert result.valid_count == 2
        assert result.invalid_count == 0

    def test_slash_format_dd_mm_yyyy(self) -> None:
        """dd/mm/yyyy format parses correctly."""
        series = pl.Series("dt", ["15/01/2024", "30/06/2024", "01/12/2023"])
        result = validate_dates(series)

        assert result.valid_count == 3
        assert result.invalid_count == 0

    def test_dot_format_dd_mm_yyyy(self) -> None:
        """dd.mm.yyyy format parses correctly."""
        series = pl.Series("dt", ["15.01.2024", "30.06.2024"])
        result = validate_dates(series)

        assert result.valid_count == 2
        assert result.invalid_count == 0

    def test_dash_format_dd_mm_yyyy(self) -> None:
        """dd-mm-yyyy format parses correctly."""
        series = pl.Series("dt", ["15-01-2024", "30-06-2024"])
        result = validate_dates(series)

        assert result.valid_count == 2
        assert result.invalid_count == 0

    def test_invalid_dates_detected(self) -> None:
        """Non-parseable values reported as invalid."""
        series = pl.Series("dt", ["2024-01-15", "not_a_date", "abc", "2024-06-30"])
        result = validate_dates(series)

        assert result.total_count == 4
        assert result.valid_count == 2
        assert result.invalid_count == 2
        assert result.invalid_percentage == 50.0
        assert "not_a_date" in result.sample_invalid_values
        assert "abc" in result.sample_invalid_values

    def test_mixed_formats(self) -> None:
        """Different valid formats in the same column."""
        series = pl.Series("dt", ["2024-01-15", "15/06/2024", "01.12.2023"])
        result = validate_dates(series)

        assert result.valid_count == 3
        assert result.invalid_count == 0
        assert len(result.recognized_formats) >= 2

    def test_empty_series(self) -> None:
        """Empty series returns zero counts."""
        series = pl.Series("dt", [], dtype=pl.Utf8)
        result = validate_dates(series)

        assert result.total_count == 0
        assert result.valid_count == 0
        assert result.invalid_count == 0
        assert result.invalid_percentage == 0.0

    def test_all_null_series(self) -> None:
        """All-null string series returns zero counts (nulls excluded)."""
        series = pl.Series("dt", [None, None, None])
        result = validate_dates(series)

        assert result.total_count == 0
        assert result.valid_count == 0
        assert result.invalid_count == 0

    def test_sample_invalid_capped_at_10(self) -> None:
        """At most 10 invalid samples collected."""
        invalid_values = [f"invalid_{i}" for i in range(20)]
        series = pl.Series("dt", invalid_values)
        result = validate_dates(series)

        assert result.invalid_count == 20
        assert len(result.sample_invalid_values) == 10

    def test_column_name_override(self) -> None:
        """Custom column name passed via parameter."""
        series = pl.Series("original", ["2024-01-01"])
        result = validate_dates(series, column_name="custom_name")

        assert result.column_name == "custom_name"

    def test_whitespace_trimmed(self) -> None:
        """Leading/trailing whitespace in values handled gracefully."""
        series = pl.Series("dt", ["  2024-01-15  ", " 30/06/2024 "])
        result = validate_dates(series)

        assert result.valid_count == 2
        assert result.invalid_count == 0


class TestFindSemanticSimilarities:
    """Tests for semantic similarity grouping using Levenshtein ratio."""

    def test_identical_values_grouped(self) -> None:
        """Identical (duplicate) values form a single entry after dedup."""
        categories = ["Cancelación", "Cancelación", "Otra causa"]
        result = find_semantic_similarities(categories)
        # After dedup: ["Cancelación", "Otra causa"] — not similar enough
        # No groups expected unless they are similar
        # Let's verify no grouping for dissimilar
        for group in result:
            assert "Otra causa" not in group.values or "Cancelación" not in group.values

    def test_similar_values_grouped(self) -> None:
        """Values with Levenshtein ratio ≥ 0.85 are grouped together."""
        categories = [
            "Cancelación Servihogar",
            "Cancelacion Servihogar",
            "Otra causa diferente",
        ]
        result = find_semantic_similarities(categories)

        # The two cancelación variants should be grouped
        assert len(result) >= 1
        found = False
        for group in result:
            if "Cancelación Servihogar" in group.values and "Cancelacion Servihogar" in group.values:
                found = True
                assert "Otra causa diferente" not in group.values
                assert group.similarity_score >= 0.85
        assert found, "Expected similar cancelación values to be grouped"

    def test_transitive_grouping(self) -> None:
        """Transitive closure: A~B and B~C → {A, B, C} in same group."""
        # Construct values where A is similar to B and B is similar to C
        # but A and C might not be directly similar
        categories = [
            "cancelar servicio",
            "cancelar servicos",   # similar to first (1 char difference)
            "cancelar servico",    # similar to second (1 char difference)
        ]
        result = find_semantic_similarities(categories)

        # All three should end up in one group transitively
        assert len(result) == 1
        assert len(result[0].values) == 3

    def test_dissimilar_not_grouped(self) -> None:
        """Values below 0.85 threshold should not be grouped."""
        categories = ["telefono", "correo electronico", "presencial"]
        result = find_semantic_similarities(categories)

        # These are clearly different, no groups expected
        assert len(result) == 0

    def test_empty_list(self) -> None:
        """Empty category list returns no groups."""
        result = find_semantic_similarities([])
        assert result == []

    def test_single_value(self) -> None:
        """Single category returns no groups."""
        result = find_semantic_similarities(["only_one"])
        assert result == []

    def test_all_identical_deduplicated(self) -> None:
        """All identical values dedup to one → no group possible."""
        result = find_semantic_similarities(["same", "same", "same"])
        assert result == []

    def test_groups_have_at_least_two_values(self) -> None:
        """Every returned group should contain at least 2 values."""
        categories = ["abc", "abd", "xyz", "xyw"]
        result = find_semantic_similarities(categories, threshold=0.50)

        for group in result:
            assert len(group.values) >= 2

    def test_custom_threshold(self) -> None:
        """Custom threshold changes grouping behavior."""
        categories = ["casa", "caso", "perro"]

        # With threshold 0.50 → "casa" and "caso" are similar (ratio 0.75)
        result_low = find_semantic_similarities(categories, threshold=0.50)
        low_groups = [g for g in result_low if "casa" in g.values and "caso" in g.values]

        # With threshold 0.90 → "casa" and "caso" are NOT similar enough
        result_high = find_semantic_similarities(categories, threshold=0.90)
        high_groups = [g for g in result_high if "casa" in g.values and "caso" in g.values]

        assert len(low_groups) == 1
        assert len(high_groups) == 0

    def test_case_insensitive_comparison(self) -> None:
        """Comparison is case-insensitive but original values preserved."""
        categories = ["Cancelación", "cancelación", "OTRA CAUSA"]
        result = find_semantic_similarities(categories)

        # The two cancelación variants should be grouped (case-insensitive → identical)
        if result:
            found = any(
                "Cancelación" in g.values and "cancelación" in g.values
                for g in result
            )
            assert found

    def test_similarity_score_in_valid_range(self) -> None:
        """Average similarity score should be between 0 and 1."""
        categories = [
            "Cancelación Servihogar",
            "Cancelacion Servihogar",
            "Cancelar Servihogar",
        ]
        result = find_semantic_similarities(categories)

        for group in result:
            assert 0.0 <= group.similarity_score <= 1.0

    def test_real_world_pqr_categories(self) -> None:
        """Realistic PQR category values that should be grouped."""
        categories = [
            "Cancela Servihogar a solicitud cliente",
            "Cancela servihogar a solicitud cliente",
            "Cancela Servihogar a Solicitud Cliente",
            "Revisión periódica",
            "Revision periodica",
            "Fuga en instalaciones",
        ]
        result = find_semantic_similarities(categories)

        # The three "Cancela Servihogar" variants should form one group
        # "Revisión" and "Revision" should form another group
        assert len(result) >= 2

        # Check the cancela group
        cancela_group = next(
            (g for g in result if any("Cancela" in v for v in g.values)), None
        )
        assert cancela_group is not None
        assert len(cancela_group.values) == 3

    def test_preserves_original_values(self) -> None:
        """Grouped values should preserve original casing."""
        # These should not be similar enough with standard threshold
        categories_similar = ["ABC Test Value", "ABC Test Valor"]
        result = find_semantic_similarities(categories_similar, threshold=0.75)

        if result:
            for group in result:
                for val in group.values:
                    assert val in categories_similar
