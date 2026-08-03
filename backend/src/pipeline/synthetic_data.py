"""Synthetic demo dataset generator for PQR records.

Generates synthetic PQR records that preserve the statistical distributions
of the original dataset (category frequencies within ±10% relative error,
numeric means within ±10% relative error) while containing zero real customer
information.

Requirements: 13.3
"""

from __future__ import annotations

from datetime import date, timedelta

import numpy as np
import polars as pl

# Default distributions derived from the real dataset profile.
# These are used when no source DataFrame is provided for learning.
_DEFAULT_DISTRIBUTIONS: dict[str, dict[str, float]] = {
    "causa": {
        "Cancela Servihogar a solicitud cliente": 0.50,
        "Facturacion": 0.12,
        "Revision instalaciones internas": 0.08,
        "Reconexion del servicio": 0.07,
        "Cobro no pactado": 0.06,
        "Atencion al usuario": 0.05,
        "Fuga en red": 0.04,
        "Suspension del servicio": 0.03,
        "Lectura del medidor": 0.03,
        "Otros": 0.02,
    },
    "canal_atencion": {
        "telefono": 0.40,
        "verbal": 0.25,
        "escrito": 0.15,
        "web": 0.10,
        "presencial": 0.07,
        "email": 0.03,
    },
    "empresa": {
        "Vanti S.A. ESP": 0.70,
        "Vanti Gas": 0.20,
        "Servihogar": 0.10,
    },
    "estado": {
        "cerrado": 0.75,
        "en_proceso": 0.20,
        "abierto": 0.05,
    },
    "tipo_pqr": {
        "peticion": 0.45,
        "queja": 0.35,
        "reclamo": 0.20,
    },
    "resultado": {
        "accede": 0.40,
        "no_accede": 0.25,
        "desistimiento": 0.15,
        "traslado": 0.10,
        "pendiente": 0.10,
    },
}

_DEFAULT_NUMERIC_PARAMS: dict[str, dict[str, float]] = {
    "tiempo_gestion_dias": {"mean": 6.32, "std": 4.5, "min": 0.0},
}

# PII faker pools — no real customer data
_FIRST_NAMES = [
    "Carlos", "Maria", "Juan", "Ana", "Pedro", "Laura", "Andres", "Diana",
    "Jorge", "Sandra", "Luis", "Patricia", "Diego", "Carmen", "Felipe",
    "Claudia", "Ricardo", "Marcela", "Alejandro", "Monica",
]

_LAST_NAMES = [
    "Garcia", "Rodriguez", "Martinez", "Lopez", "Gonzalez", "Hernandez",
    "Perez", "Sanchez", "Ramirez", "Torres", "Flores", "Rivera",
    "Gomez", "Diaz", "Reyes", "Morales", "Cruz", "Ortiz", "Gutierrez", "Chavez",
]


class SyntheticDataGenerator:
    """Generates synthetic PQR demo records preserving statistical distributions.

    The generator can learn distributions from a real DataFrame or fall back to
    hardcoded default distributions derived from the original dataset profile.

    Attributes:
        category_distributions: Mapping of column name -> {value: proportion}.
        numeric_params: Mapping of column name -> {mean, std, min}.
        seed: Random seed for reproducibility.
    """

    def __init__(
        self,
        source_df: pl.DataFrame | None = None,
        seed: int = 42,
    ) -> None:
        """Initialize the generator.

        Args:
            source_df: Optional real DataFrame to learn distributions from.
                       If None, uses hardcoded default distributions.
            seed: Random seed for numpy generator reproducibility.
        """
        self.seed = seed
        self._rng = np.random.default_rng(seed)

        if source_df is not None:
            self.category_distributions = self._learn_category_distributions(source_df)
            self.numeric_params = self._learn_numeric_params(source_df)
        else:
            self.category_distributions = _DEFAULT_DISTRIBUTIONS.copy()
            self.numeric_params = _DEFAULT_NUMERIC_PARAMS.copy()

    def _learn_category_distributions(
        self, df: pl.DataFrame
    ) -> dict[str, dict[str, float]]:
        """Learn category frequency distributions from a source DataFrame.

        Args:
            df: Source DataFrame with categorical columns.

        Returns:
            Dict mapping column name to {category_value: proportion}.
        """
        cat_cols = ["causa", "canal_atencion", "empresa", "estado", "tipo_pqr", "resultado"]
        distributions: dict[str, dict[str, float]] = {}

        for col in cat_cols:
            if col not in df.columns:
                # Fall back to default if column missing
                if col in _DEFAULT_DISTRIBUTIONS:
                    distributions[col] = _DEFAULT_DISTRIBUTIONS[col]
                continue

            value_counts = (
                df.select(col)
                .drop_nulls()
                .group_by(col)
                .len()
                .sort("len", descending=True)
            )

            total = value_counts["len"].sum()
            if total == 0:
                if col in _DEFAULT_DISTRIBUTIONS:
                    distributions[col] = _DEFAULT_DISTRIBUTIONS[col]
                continue

            dist: dict[str, float] = {}
            for row in value_counts.iter_rows():
                dist[row[0]] = row[1] / total

            distributions[col] = dist

        return distributions

    def _learn_numeric_params(
        self, df: pl.DataFrame
    ) -> dict[str, dict[str, float]]:
        """Learn numeric field parameters from source DataFrame.

        Args:
            df: Source DataFrame with numeric columns.

        Returns:
            Dict mapping column name to {mean, std, min}.
        """
        numeric_cols = ["tiempo_gestion_dias"]
        params: dict[str, dict[str, float]] = {}

        for col in numeric_cols:
            if col not in df.columns:
                if col in _DEFAULT_NUMERIC_PARAMS:
                    params[col] = _DEFAULT_NUMERIC_PARAMS[col]
                continue

            series = df[col].drop_nulls().cast(pl.Float64)
            if len(series) == 0:
                if col in _DEFAULT_NUMERIC_PARAMS:
                    params[col] = _DEFAULT_NUMERIC_PARAMS[col]
                continue

            params[col] = {
                "mean": float(series.mean()),  # type: ignore[arg-type]
                "std": float(series.std()),  # type: ignore[arg-type]
                "min": 0.0,  # Management time cannot be negative
            }

        return params

    def generate(self, n: int = 1000) -> pl.DataFrame:
        """Generate n synthetic PQR records.

        Produces synthetic records matching the curated schema with:
        - Category frequencies within ±10% relative error of source
        - Numeric means within ±10% relative error of source
        - Fake PII fields (names, phone numbers, synthetic IDs)

        Args:
            n: Number of records to generate (default 1000).

        Returns:
            Polars DataFrame with columns matching PQRSchema.
        """
        data: dict[str, list] = {}

        # Generate unique IDs
        data["id_pqr"] = list(range(900_000, 900_000 + n))

        # Generate categorical columns from learned distributions
        for col, dist in self.category_distributions.items():
            categories = list(dist.keys())
            probabilities = np.array(list(dist.values()), dtype=np.float64)
            # Normalize to ensure sum == 1.0 (handle floating point)
            probabilities = probabilities / probabilities.sum()
            data[col] = list(
                self._rng.choice(categories, size=n, p=probabilities)
            )

        # Generate numeric columns
        for col, params in self.numeric_params.items():
            mean = params["mean"]
            std = params["std"]
            min_val = params["min"]
            values = self._rng.normal(loc=mean, scale=std, size=n)
            # Clip to minimum and round to 2 decimal places
            values = np.clip(values, min_val, None)
            values = np.round(values, 2)
            data[col] = list(values)

        # Generate dates
        data["fecha_creacion"] = self._generate_dates(n, start_year=2021, end_year=2024)
        data["fecha_cierre"] = self._generate_closure_dates(
            data["fecha_creacion"], data["estado"]
        )

        # Generate PII-safe fake fields
        data["unidad_responsable"] = self._generate_fake_units(n)
        data["marcacion"] = self._generate_fake_markings(n)
        data["motivo_cierre"] = self._generate_fake_closure_reasons(n, data["estado"])

        # Build DataFrame
        df = pl.DataFrame(
            {
                "id_pqr": data["id_pqr"],
                "fecha_creacion": data["fecha_creacion"],
                "fecha_cierre": data["fecha_cierre"],
                "estado": data["estado"],
                "causa": data["causa"],
                "canal_atencion": data["canal_atencion"],
                "empresa": data["empresa"],
                "resultado": data["resultado"],
                "unidad_responsable": data["unidad_responsable"],
                "marcacion": data["marcacion"],
                "motivo_cierre": data["motivo_cierre"],
                "tiempo_gestion_dias": data["tiempo_gestion_dias"],
                "tipo_pqr": data["tipo_pqr"],
            }
        )

        return df

    def _generate_dates(
        self, n: int, start_year: int = 2021, end_year: int = 2024
    ) -> list[date]:
        """Generate random creation dates within the specified year range."""
        start = date(start_year, 1, 1)
        end = date(end_year, 12, 31)
        total_days = (end - start).days

        day_offsets = self._rng.integers(0, total_days, size=n)
        return [start + timedelta(days=int(d)) for d in day_offsets]

    def _generate_closure_dates(
        self, creation_dates: list[date], estados: list[str]
    ) -> list[date | None]:
        """Generate closure dates based on estado and management time."""
        closure_dates: list[date | None] = []
        for i, estado in enumerate(estados):
            if estado == "cerrado":
                # Add some days after creation
                days_offset = int(self._rng.integers(1, 30))
                closure_dates.append(creation_dates[i] + timedelta(days=days_offset))
            else:
                closure_dates.append(None)
        return closure_dates

    def _generate_fake_units(self, n: int) -> list[str | None]:
        """Generate fake responsible unit names."""
        units = [
            "Unidad Operativa Norte",
            "Unidad Operativa Sur",
            "Unidad Comercial",
            "Unidad Tecnica",
            "Unidad Administrativa",
            "Direccion de Servicio",
        ]
        # ~10% null
        result: list[str | None] = []
        for _ in range(n):
            if self._rng.random() < 0.10:
                result.append(None)
            else:
                result.append(str(self._rng.choice(units)))
        return result

    def _generate_fake_markings(self, n: int) -> list[str | None]:
        """Generate fake marking values."""
        markings = [
            "primera_vez",
            "reiterativa",
            "urgente",
            "seguimiento",
            "normal",
        ]
        # ~15% null
        result: list[str | None] = []
        for _ in range(n):
            if self._rng.random() < 0.15:
                result.append(None)
            else:
                result.append(str(self._rng.choice(markings)))
        return result

    def _generate_fake_closure_reasons(
        self, n: int, estados: list[str]
    ) -> list[str | None]:
        """Generate fake closure reason strings (None for open/in-process)."""
        reasons = [
            "Solicitud procesada exitosamente",
            "Cliente confirma resolucion",
            "Caso cerrado por desistimiento",
            "Resuelto en primera llamada",
            "Traslado a entidad competente",
        ]
        result: list[str | None] = []
        for i in range(n):
            if estados[i] != "cerrado":
                result.append(None)
            else:
                result.append(str(self._rng.choice(reasons)))
        return result
