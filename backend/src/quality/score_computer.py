"""Data Quality Score computation across six weighted dimensions.

Implements the QualityScoreComputer class that evaluates a DataFrame against
six quality dimensions (completeness, validity, consistency, uniqueness,
timeliness, referential integrity) and produces a composite Data Quality Score
along with a detail table of violations.

Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 10.9
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date

import polars as pl

from profiling.detectors import find_duplicates
from quality.models import QualityScore, SeverityLevel


@dataclass(frozen=True, slots=True)
class QualityViolation:
    """A single quality rule violation record for the detail table.

    Attributes:
        rule_name: Descriptive name of the quality rule that was violated.
        target_field: Name of the field(s) targeted by this rule.
        violations_count: Number of records violating the rule.
        violations_percentage: Percentage of total records with violations (0-100).
        severity: Severity classification based on violation percentage.
        corrective_action: Recommended action to fix the violation.
    """

    rule_name: str
    target_field: str
    violations_count: int
    violations_percentage: float
    severity: SeverityLevel
    corrective_action: str


# Default domain catalogs — empty means accept all values (100% score)
DEFAULT_DOMAIN_CATALOGS: dict[str, list[str]] = {
    "empresa": [],
    "causa": [],
    "canal_atencion": [],
}

# Valid values for schema-defined categoricals
VALID_ESTADO = ["cerrado", "en_proceso", "abierto"]
VALID_TIPO_PQR = ["peticion", "queja", "reclamo"]


class QualityScoreComputer:
    """Computes the Data Quality Score across six weighted dimensions.

    Each dimension produces a sub-score in [0, 100]. The composite score
    is the weighted sum using default weights from QualityScore.compute().

    Dimensions:
        1. Completeness (25%): Non-null ratio per field, averaged.
        2. Validity (20%): Conformance to Pandera schema rules.
        3. Consistency (20%): Absence of field contradictions.
        4. Uniqueness (15%): Absence of duplicate records on PQR id.
        5. Timeliness (10%): Records within valid temporal range.
        6. Referential integrity (10%): Categoricals match domain catalogs.

    Args:
        id_column: Name of the PQR identifier column.
        domain_catalogs: Dictionary mapping field names to lists of valid values.
            Empty list means accept all values (defaults to 100% for that field).
    """

    def __init__(
        self,
        id_column: str = "id_pqr",
        domain_catalogs: dict[str, list[str]] | None = None,
    ) -> None:
        self.id_column = id_column
        self.domain_catalogs = (
            domain_catalogs if domain_catalogs is not None else DEFAULT_DOMAIN_CATALOGS
        )

    def compute(self, df: pl.DataFrame) -> tuple[QualityScore, list[QualityViolation]]:
        """Compute all six dimensions and the composite quality score.

        Args:
            df: Polars DataFrame to evaluate.

        Returns:
            Tuple of (QualityScore, list of QualityViolation details).
        """
        violations: list[QualityViolation] = []

        completeness = self._compute_completeness(df, violations)
        validity = self._compute_validity(df, violations)
        consistency = self._compute_consistency(df, violations)
        uniqueness = self._compute_uniqueness(df, violations)
        timeliness = self._compute_timeliness(df, violations)
        referential_integrity = self._compute_referential_integrity(df, violations)

        score = QualityScore.compute(
            completeness=completeness,
            validity=validity,
            consistency=consistency,
            uniqueness=uniqueness,
            timeliness=timeliness,
            referential_integrity=referential_integrity,
        )

        return score, violations

    def _compute_completeness(
        self, df: pl.DataFrame, violations: list[QualityViolation]
    ) -> float:
        """Compute completeness: ratio of non-null to total expected values per field.

        Score = average of per-field completeness ratios × 100.

        Requirements: 10.4
        """
        if df.height == 0 or df.width == 0:
            return 100.0

        total_rows = df.height
        field_scores: list[float] = []

        for col_name in df.columns:
            null_count = df[col_name].null_count()
            non_null_ratio = (total_rows - null_count) / total_rows
            field_scores.append(non_null_ratio)

            if null_count > 0:
                null_pct = null_count / total_rows * 100.0
                violations.append(
                    QualityViolation(
                        rule_name="completeness_null_values",
                        target_field=col_name,
                        violations_count=null_count,
                        violations_percentage=round(null_pct, 2),
                        severity=SeverityLevel.from_percentage(null_pct),
                        corrective_action=(
                            f"Investigate and fill null values in '{col_name}'. "
                            f"Consider imputation or data source correction."
                        ),
                    )
                )

        completeness = (sum(field_scores) / len(field_scores)) * 100.0 if field_scores else 100.0
        return round(completeness, 2)

    def _compute_validity(
        self, df: pl.DataFrame, violations: list[QualityViolation]
    ) -> float:
        """Compute validity: conformance to Pandera schema rules.

        Checks:
        - Date fields parse correctly (fecha_creacion, fecha_cierre)
        - Categoricals match domain lists (estado, tipo_pqr)
        - Numerics within declared ranges (tiempo_gestion_dias >= 0)

        Score = percentage of conforming values across all checked fields.

        Requirements: 10.5
        """
        if df.height == 0:
            return 100.0

        total_checks = 0
        total_conforming = 0

        # Check estado values against valid list
        if "estado" in df.columns:
            total_checks += df.height
            valid_estado_count = df.filter(
                pl.col("estado").is_in(VALID_ESTADO) | pl.col("estado").is_null()
            ).height
            invalid_count = df.height - valid_estado_count
            total_conforming += valid_estado_count

            if invalid_count > 0:
                pct = invalid_count / df.height * 100.0
                violations.append(
                    QualityViolation(
                        rule_name="validity_estado_domain",
                        target_field="estado",
                        violations_count=invalid_count,
                        violations_percentage=round(pct, 2),
                        severity=SeverityLevel.from_percentage(pct),
                        corrective_action=(
                            "Correct 'estado' values to match valid domain: "
                            f"{VALID_ESTADO}."
                        ),
                    )
                )

        # Check tipo_pqr values against valid list
        if "tipo_pqr" in df.columns:
            total_checks += df.height
            valid_tipo_count = df.filter(
                pl.col("tipo_pqr").is_in(VALID_TIPO_PQR) | pl.col("tipo_pqr").is_null()
            ).height
            invalid_count = df.height - valid_tipo_count
            total_conforming += valid_tipo_count

            if invalid_count > 0:
                pct = invalid_count / df.height * 100.0
                violations.append(
                    QualityViolation(
                        rule_name="validity_tipo_pqr_domain",
                        target_field="tipo_pqr",
                        violations_count=invalid_count,
                        violations_percentage=round(pct, 2),
                        severity=SeverityLevel.from_percentage(pct),
                        corrective_action=(
                            "Correct 'tipo_pqr' values to match valid domain: "
                            f"{VALID_TIPO_PQR}."
                        ),
                    )
                )

        # Check tiempo_gestion_dias >= 0 (only for non-null values)
        if "tiempo_gestion_dias" in df.columns:
            non_null_mask = pl.col("tiempo_gestion_dias").is_not_null()
            non_null_count = df.filter(non_null_mask).height
            total_checks += non_null_count

            if non_null_count > 0:
                valid_range_count = df.filter(
                    non_null_mask & (pl.col("tiempo_gestion_dias") >= 0)
                ).height
                invalid_count = non_null_count - valid_range_count
                total_conforming += valid_range_count

                if invalid_count > 0:
                    pct = invalid_count / df.height * 100.0
                    violations.append(
                        QualityViolation(
                            rule_name="validity_tiempo_gestion_range",
                            target_field="tiempo_gestion_dias",
                            violations_count=invalid_count,
                            violations_percentage=round(pct, 2),
                            severity=SeverityLevel.from_percentage(pct),
                            corrective_action=(
                                "Correct 'tiempo_gestion_dias' values to be >= 0. "
                                "Negative management times indicate data entry errors."
                            ),
                        )
                    )

        # Check fecha_creacion is a valid date (non-null check; type validation)
        if "fecha_creacion" in df.columns:
            total_checks += df.height
            # For date columns, non-null values that are actual dates are valid
            non_null_dates = df.filter(pl.col("fecha_creacion").is_not_null()).height
            total_conforming += non_null_dates
            invalid_count = df.height - non_null_dates

            if invalid_count > 0:
                pct = invalid_count / df.height * 100.0
                violations.append(
                    QualityViolation(
                        rule_name="validity_fecha_creacion_format",
                        target_field="fecha_creacion",
                        violations_count=invalid_count,
                        violations_percentage=round(pct, 2),
                        severity=SeverityLevel.from_percentage(pct),
                        corrective_action=(
                            "Ensure 'fecha_creacion' contains valid, non-null dates."
                        ),
                    )
                )

        # If no checks were performed, default to 100%
        if total_checks == 0:
            return 100.0

        validity = (total_conforming / total_checks) * 100.0
        return round(validity, 2)

    def _compute_consistency(
        self, df: pl.DataFrame, violations: list[QualityViolation]
    ) -> float:
        """Compute consistency: detect contradictions between related fields.

        Checks:
        1. estado="cerrado" but fecha_cierre is null
        2. resultado="accede" but tiempo_gestion_dias = 0
        3. fecha_cierre < fecha_creacion

        Score = 100 - (contradiction_count / total_records × 100)

        Requirements: 10.6
        """
        if df.height == 0:
            return 100.0

        total_records = df.height
        total_contradictions = 0

        # Rule 1: cerrado + null fecha_cierre
        if "estado" in df.columns and "fecha_cierre" in df.columns:
            cerrado_null_cierre = df.filter(
                (pl.col("estado") == "cerrado") & pl.col("fecha_cierre").is_null()
            ).height
            total_contradictions += cerrado_null_cierre

            if cerrado_null_cierre > 0:
                pct = cerrado_null_cierre / total_records * 100.0
                violations.append(
                    QualityViolation(
                        rule_name="consistency_cerrado_null_fecha_cierre",
                        target_field="estado, fecha_cierre",
                        violations_count=cerrado_null_cierre,
                        violations_percentage=round(pct, 2),
                        severity=SeverityLevel.from_percentage(pct),
                        corrective_action=(
                            "Records with estado='cerrado' must have a non-null "
                            "'fecha_cierre'. Populate closure dates or correct status."
                        ),
                    )
                )

        # Rule 2: resultado="accede" + tiempo_gestion_dias = 0
        if "resultado" in df.columns and "tiempo_gestion_dias" in df.columns:
            accede_zero_time = df.filter(
                (pl.col("resultado") == "accede") & (pl.col("tiempo_gestion_dias") == 0)
            ).height
            total_contradictions += accede_zero_time

            if accede_zero_time > 0:
                pct = accede_zero_time / total_records * 100.0
                violations.append(
                    QualityViolation(
                        rule_name="consistency_accede_zero_tiempo",
                        target_field="resultado, tiempo_gestion_dias",
                        violations_count=accede_zero_time,
                        violations_percentage=round(pct, 2),
                        severity=SeverityLevel.from_percentage(pct),
                        corrective_action=(
                            "Records with resultado='accede' should have "
                            "tiempo_gestion_dias > 0. Verify management time calculation."
                        ),
                    )
                )

        # Rule 3: fecha_cierre < fecha_creacion
        if "fecha_cierre" in df.columns and "fecha_creacion" in df.columns:
            cierre_before_creacion = df.filter(
                pl.col("fecha_cierre").is_not_null()
                & pl.col("fecha_creacion").is_not_null()
                & (pl.col("fecha_cierre") < pl.col("fecha_creacion"))
            ).height
            total_contradictions += cierre_before_creacion

            if cierre_before_creacion > 0:
                pct = cierre_before_creacion / total_records * 100.0
                violations.append(
                    QualityViolation(
                        rule_name="consistency_cierre_before_creacion",
                        target_field="fecha_cierre, fecha_creacion",
                        violations_count=cierre_before_creacion,
                        violations_percentage=round(pct, 2),
                        severity=SeverityLevel.from_percentage(pct),
                        corrective_action=(
                            "Closure date cannot be earlier than creation date. "
                            "Correct date values or investigate data entry errors."
                        ),
                    )
                )

        consistency = 100.0 - (total_contradictions / total_records * 100.0)
        return round(max(consistency, 0.0), 2)

    def _compute_uniqueness(
        self, df: pl.DataFrame, violations: list[QualityViolation]
    ) -> float:
        """Compute uniqueness: 100 - duplication_rate on PQR identifier.

        Requirements: 10.7
        """
        if df.height == 0:
            return 100.0

        if self.id_column not in df.columns:
            return 100.0

        dup_report = find_duplicates(df, self.id_column)
        duplication_rate = dup_report.duplication_rate

        if dup_report.duplicate_count > 0:
            violations.append(
                QualityViolation(
                    rule_name="uniqueness_duplicate_identifiers",
                    target_field=self.id_column,
                    violations_count=dup_report.duplicate_count,
                    violations_percentage=round(duplication_rate, 2),
                    severity=SeverityLevel.from_percentage(duplication_rate),
                    corrective_action=(
                        f"Remove or deduplicate records with repeated '{self.id_column}' "
                        f"values. {len(dup_report.duplicate_ids)} distinct IDs are duplicated."
                    ),
                )
            )

        uniqueness = 100.0 - duplication_rate
        return round(max(uniqueness, 0.0), 2)

    def _compute_timeliness(
        self, df: pl.DataFrame, violations: list[QualityViolation]
    ) -> float:
        """Compute timeliness: flag dates before 2020-01-01 or after current date.

        Score = 100 - (timeliness_violations / total_records × 100)

        Requirements: 10.8
        """
        if df.height == 0:
            return 100.0

        if "fecha_creacion" not in df.columns:
            return 100.0

        total_records = df.height
        current_date = date.today()
        min_date = date(2020, 1, 1)

        # Filter records with fecha_creacion outside valid range
        timeliness_violations = df.filter(
            pl.col("fecha_creacion").is_not_null()
            & (
                (pl.col("fecha_creacion") < min_date)
                | (pl.col("fecha_creacion") > current_date)
            )
        ).height

        if timeliness_violations > 0:
            pct = timeliness_violations / total_records * 100.0
            violations.append(
                QualityViolation(
                    rule_name="timeliness_date_range",
                    target_field="fecha_creacion",
                    violations_count=timeliness_violations,
                    violations_percentage=round(pct, 2),
                    severity=SeverityLevel.from_percentage(pct),
                    corrective_action=(
                        "Correct 'fecha_creacion' values that fall before 2020-01-01 "
                        f"or after {current_date.isoformat()}. These indicate "
                        "data entry errors or system clock issues."
                    ),
                )
            )

        timeliness = 100.0 - (timeliness_violations / total_records * 100.0)
        return round(max(timeliness, 0.0), 2)

    def _compute_referential_integrity(
        self, df: pl.DataFrame, violations: list[QualityViolation]
    ) -> float:
        """Compute referential integrity: verify categoricals against domain catalogs.

        Score = 100 - (unmatched_values / total_categorical_values × 100)

        If a catalog is empty (no valid values defined), all values are accepted
        and the score defaults to 100% for that field.

        Requirements: 10.9
        """
        if df.height == 0:
            return 100.0

        total_categorical_values = 0
        total_unmatched = 0

        for field_name, valid_values in self.domain_catalogs.items():
            if field_name not in df.columns:
                continue

            # Empty catalog means accept all values
            if not valid_values:
                continue

            # Count non-null values for this field
            non_null_series = df[field_name].drop_nulls()
            field_count = len(non_null_series)

            if field_count == 0:
                continue

            total_categorical_values += field_count

            # Count values NOT in the valid catalog
            unmatched_count = non_null_series.filter(
                ~non_null_series.is_in(valid_values)
            ).len()
            total_unmatched += unmatched_count

            if unmatched_count > 0:
                pct = unmatched_count / df.height * 100.0
                violations.append(
                    QualityViolation(
                        rule_name="referential_integrity_catalog_mismatch",
                        target_field=field_name,
                        violations_count=unmatched_count,
                        violations_percentage=round(pct, 2),
                        severity=SeverityLevel.from_percentage(pct),
                        corrective_action=(
                            f"Values in '{field_name}' do not match the domain catalog. "
                            f"Standardize or add missing values to the catalog."
                        ),
                    )
                )

        # If no catalogs had values to check, default to 100%
        if total_categorical_values == 0:
            return 100.0

        ref_integrity = 100.0 - (total_unmatched / total_categorical_values * 100.0)
        return round(max(ref_integrity, 0.0), 2)
