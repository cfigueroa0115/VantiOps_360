"""Unit tests for the synthetic data generator.

Verifies that generated datasets preserve category frequency distributions
and numeric means within ±10% relative error, and contain no real customer data.

Requirements: 13.3
"""

from __future__ import annotations

import numpy as np
import polars as pl

from pipeline.synthetic_data import (
    _DEFAULT_DISTRIBUTIONS,
    _DEFAULT_NUMERIC_PARAMS,
    SyntheticDataGenerator,
)


class TestSyntheticDataGeneratorDefaults:
    """Tests using hardcoded default distributions."""

    def setup_method(self) -> None:
        self.gen = SyntheticDataGenerator(seed=42)

    def test_generates_minimum_1000_records(self) -> None:
        df = self.gen.generate(n=1000)
        assert df.shape[0] == 1000

    def test_generates_custom_count(self) -> None:
        df = self.gen.generate(n=2000)
        assert df.shape[0] == 2000

    def test_output_columns_match_curated_schema(self) -> None:
        df = self.gen.generate(n=100)
        expected_cols = {
            "id_pqr",
            "fecha_creacion",
            "fecha_cierre",
            "estado",
            "causa",
            "canal_atencion",
            "empresa",
            "resultado",
            "unidad_responsable",
            "marcacion",
            "motivo_cierre",
            "tiempo_gestion_dias",
            "tipo_pqr",
        }
        assert set(df.columns) == expected_cols

    def test_unique_ids(self) -> None:
        df = self.gen.generate(n=1000)
        assert df["id_pqr"].n_unique() == 1000

    def test_category_frequency_within_10_percent_relative_error(self) -> None:
        """Core fidelity test: category frequencies must match source ±10%."""
        df = self.gen.generate(n=10000)  # Large n for stable frequencies

        for col, expected_dist in _DEFAULT_DISTRIBUTIONS.items():
            total = df[col].drop_nulls().len()
            for category, expected_prop in expected_dist.items():
                actual_count = df.filter(pl.col(col) == category).shape[0]
                actual_prop = actual_count / total

                # Relative error: |actual - expected| / expected <= 0.10
                if expected_prop > 0:
                    relative_error = abs(actual_prop - expected_prop) / expected_prop
                    assert relative_error <= 0.10, (
                        f"Column '{col}', category '{category}': "
                        f"expected {expected_prop:.4f}, got {actual_prop:.4f}, "
                        f"relative error {relative_error:.4f} > 0.10"
                    )

    def test_numeric_mean_within_10_percent_relative_error(self) -> None:
        """Core fidelity test: numeric means must match source ±10%."""
        df = self.gen.generate(n=5000)

        for col, params in _DEFAULT_NUMERIC_PARAMS.items():
            expected_mean = params["mean"]
            actual_mean = df[col].mean()

            relative_error = abs(actual_mean - expected_mean) / expected_mean
            assert relative_error <= 0.10, (
                f"Column '{col}': expected mean {expected_mean:.4f}, "
                f"got {actual_mean:.4f}, relative error {relative_error:.4f} > 0.10"
            )

    def test_numeric_values_non_negative(self) -> None:
        df = self.gen.generate(n=1000)
        assert df["tiempo_gestion_dias"].min() >= 0.0

    def test_no_real_customer_names(self) -> None:
        """Output should not contain any real customer information."""
        df = self.gen.generate(n=1000)
        # IDs are synthetic (starting from 900000)
        assert df["id_pqr"].min() >= 900_000

    def test_reproducibility_with_same_seed(self) -> None:
        gen1 = SyntheticDataGenerator(seed=123)
        gen2 = SyntheticDataGenerator(seed=123)
        df1 = gen1.generate(n=100)
        df2 = gen2.generate(n=100)
        assert df1.equals(df2)

    def test_different_seed_different_output(self) -> None:
        gen1 = SyntheticDataGenerator(seed=1)
        gen2 = SyntheticDataGenerator(seed=2)
        df1 = gen1.generate(n=100)
        df2 = gen2.generate(n=100)
        # They should differ in at least some values
        assert not df1["causa"].equals(df2["causa"])

    def test_fecha_creacion_in_valid_range(self) -> None:
        from datetime import date

        df = self.gen.generate(n=1000)
        min_date = df["fecha_creacion"].min()
        max_date = df["fecha_creacion"].max()
        assert min_date >= date(2021, 1, 1)
        assert max_date <= date(2024, 12, 31)

    def test_fecha_cierre_none_for_non_closed(self) -> None:
        df = self.gen.generate(n=1000)
        non_closed = df.filter(pl.col("estado") != "cerrado")
        assert non_closed["fecha_cierre"].null_count() == non_closed.shape[0]

    def test_estado_values_in_domain(self) -> None:
        df = self.gen.generate(n=1000)
        valid_states = {"cerrado", "en_proceso", "abierto"}
        actual = set(df["estado"].unique().to_list())
        assert actual.issubset(valid_states)

    def test_tipo_pqr_values_in_domain(self) -> None:
        df = self.gen.generate(n=1000)
        valid_types = {"peticion", "queja", "reclamo"}
        actual = set(df["tipo_pqr"].unique().to_list())
        assert actual.issubset(valid_types)


class TestSyntheticDataGeneratorFromSource:
    """Tests using a learned source DataFrame."""

    def _make_source_df(self, n: int = 500) -> pl.DataFrame:
        """Create a small source DataFrame with known distributions."""
        rng = np.random.default_rng(99)
        return pl.DataFrame(
            {
                "causa": rng.choice(
                    ["Facturacion", "Cancelacion", "Revision"],
                    size=n,
                    p=[0.50, 0.30, 0.20],
                ).tolist(),
                "canal_atencion": rng.choice(
                    ["telefono", "web"],
                    size=n,
                    p=[0.60, 0.40],
                ).tolist(),
                "empresa": rng.choice(
                    ["Vanti", "Servi"],
                    size=n,
                    p=[0.80, 0.20],
                ).tolist(),
                "estado": rng.choice(
                    ["cerrado", "en_proceso", "abierto"],
                    size=n,
                    p=[0.70, 0.20, 0.10],
                ).tolist(),
                "tipo_pqr": rng.choice(
                    ["peticion", "queja", "reclamo"],
                    size=n,
                    p=[0.50, 0.30, 0.20],
                ).tolist(),
                "resultado": rng.choice(
                    ["accede", "no_accede"],
                    size=n,
                    p=[0.60, 0.40],
                ).tolist(),
                "tiempo_gestion_dias": np.clip(
                    rng.normal(loc=8.0, scale=3.0, size=n), 0, None
                ).tolist(),
            }
        )

    def test_learned_distributions_preserved(self) -> None:
        source = self._make_source_df(n=2000)
        gen = SyntheticDataGenerator(source_df=source, seed=42)
        df = gen.generate(n=5000)

        # Check causa distribution
        source_dist = (
            source.group_by("causa").len().sort("len", descending=True)
        )
        source_total = source_dist["len"].sum()

        for row in source_dist.iter_rows():
            cat_name, cat_count = row[0], row[1]
            expected_prop = cat_count / source_total
            actual_count = df.filter(pl.col("causa") == cat_name).shape[0]
            actual_prop = actual_count / df.shape[0]

            if expected_prop > 0:
                relative_error = abs(actual_prop - expected_prop) / expected_prop
                assert relative_error <= 0.10, (
                    f"causa '{cat_name}': expected {expected_prop:.4f}, "
                    f"got {actual_prop:.4f}, error {relative_error:.4f}"
                )

    def test_learned_numeric_mean_preserved(self) -> None:
        source = self._make_source_df(n=2000)
        gen = SyntheticDataGenerator(source_df=source, seed=42)
        df = gen.generate(n=5000)

        source_mean = source["tiempo_gestion_dias"].mean()
        synthetic_mean = df["tiempo_gestion_dias"].mean()

        relative_error = abs(synthetic_mean - source_mean) / source_mean
        assert relative_error <= 0.10, (
            f"tiempo_gestion_dias mean: source={source_mean:.4f}, "
            f"synthetic={synthetic_mean:.4f}, error={relative_error:.4f}"
        )
