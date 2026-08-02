"""Validation reference points for PQR dataset profiling.

Implements verification of key reference metrics from the dataset to confirm
that profiling results align with known dataset characteristics.

Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import polars as pl


@dataclass(frozen=True, slots=True)
class ReferenceCheck:
    """Result of a single reference point verification.

    Attributes:
        name: Short identifier for the check (e.g. "record_count").
        expected_description: Human-readable description of the expected value/range.
        actual_value: The computed actual value from the data.
        is_within_tolerance: Whether the actual value falls within acceptable bounds.
        deviation_message: Description of deviation; empty string if within tolerance.
    """

    name: str
    expected_description: str
    actual_value: Any
    is_within_tolerance: bool
    deviation_message: str


@dataclass(slots=True)
class ReferencePointReport:
    """Aggregated report of all reference point verifications.

    Attributes:
        checks: List of individual reference check results.
        all_passed: True only if every check is within tolerance.
        summary: Human-readable summary of the verification results.
    """

    checks: list[ReferenceCheck] = field(default_factory=list)
    all_passed: bool = True
    summary: str = ""


class ReferencePointValidator:
    """Validates a Polars DataFrame against known PQR dataset reference points.

    The validator runs all reference checks and produces a structured report
    indicating pass/fail status, actual values, expected ranges, and deviations.

    Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7
    """

    # --- Default reference values and tolerances ---
    EXPECTED_RECORD_COUNT = 51_008
    RECORD_COUNT_TOLERANCE_PCT = 1.0  # ±1%

    EXPECTED_COLUMN_COUNT = 29
    COLUMN_COUNT_TOLERANCE = 2  # ±2 columns

    MAX_DUPLICATION_RATE = 1.0  # < 1%

    EXPECTED_MAIN_CAUSE_SHARE = 50.0  # ≈50%
    MAIN_CAUSE_SHARE_TOLERANCE_PP = 5.0  # ±5 percentage points

    EXPECTED_MEAN_MGMT_TIME = 6.32  # days
    MEAN_MGMT_TIME_TOLERANCE = 0.5  # ±0.5 days
    EXPECTED_MEDIAN_MGMT_TIME = 7.0  # days
    MEDIAN_MGMT_TIME_TOLERANCE = 1.0  # ±1 day
    EXPECTED_P90_MGMT_TIME = 10.0  # days
    P90_MGMT_TIME_TOLERANCE = 1.0  # ±1 day

    CHANNEL_COMBINED_MIN_SHARE = 60.0  # >60%
    PHONE_CHANNEL_KEYWORDS = ("telefon", "phone", "telefonico", "telefónico")
    VERBAL_CHANNEL_KEYWORDS = ("verbal",)

    def validate_all(
        self,
        df: pl.DataFrame,
        id_col: str = "id_pqr",
        cause_col: str = "causa",
        time_col: str = "tiempo_gestion_dias",
        channel_col: str = "canal_atencion",
        closure_reason_col: str = "motivo_cierre",
        marking_col: str = "marcacion",
        company_col: str = "empresa",
        category_col: str = "causa",
    ) -> ReferencePointReport:
        """Run all reference point checks on the DataFrame.

        Args:
            df: Polars DataFrame to validate.
            id_col: Column name for PQR identifier (duplication check).
            cause_col: Column name for PQR cause.
            time_col: Column name for management time in days.
            channel_col: Column name for attention channel.
            closure_reason_col: Column name for closure reason (quality check).
            marking_col: Column name for marking field (quality check).
            company_col: Column name for company (quality check).
            category_col: Column name for category (quality check).

        Returns:
            ReferencePointReport with all check results.
        """
        report = ReferencePointReport()

        report.checks.append(self.verify_record_count(df))
        report.checks.append(self.verify_column_count(df))

        if id_col in df.columns:
            report.checks.append(self.verify_duplication_rate(df, id_col))

        if cause_col in df.columns:
            report.checks.append(self.verify_main_cause(df, cause_col))

        if time_col in df.columns:
            report.checks.extend(self.verify_management_time(df, time_col))

        if channel_col in df.columns:
            report.checks.append(self.verify_channel_distribution(df, channel_col))

        quality_checks = self.verify_quality_issues(
            df,
            closure_reason_col=closure_reason_col,
            marking_col=marking_col,
            company_col=company_col,
            category_col=category_col,
        )
        report.checks.extend(quality_checks)

        report.all_passed = all(c.is_within_tolerance for c in report.checks)

        passed_count = sum(1 for c in report.checks if c.is_within_tolerance)
        total_count = len(report.checks)
        failed_names = [c.name for c in report.checks if not c.is_within_tolerance]

        if report.all_passed:
            report.summary = (
                f"All {total_count} reference point checks passed."
            )
        else:
            report.summary = (
                f"{passed_count}/{total_count} checks passed. "
                f"Failed: {', '.join(failed_names)}"
            )

        return report

    def verify_record_count(self, df: pl.DataFrame) -> ReferenceCheck:
        """Verify total record count is approximately 51,008 (±1% tolerance).

        Tolerance range: 50,498 – 51,518.

        Requirements: 4.1
        """
        actual = df.height
        lower = int(self.EXPECTED_RECORD_COUNT * (1 - self.RECORD_COUNT_TOLERANCE_PCT / 100))
        upper = int(self.EXPECTED_RECORD_COUNT * (1 + self.RECORD_COUNT_TOLERANCE_PCT / 100))
        within = lower <= actual <= upper

        deviation = ""
        if not within:
            pct_diff = ((actual - self.EXPECTED_RECORD_COUNT) / self.EXPECTED_RECORD_COUNT) * 100
            deviation = (
                f"Record count {actual} is outside tolerance [{lower}, {upper}]. "
                f"Deviation: {pct_diff:+.2f}% from expected {self.EXPECTED_RECORD_COUNT}."
            )

        return ReferenceCheck(
            name="record_count",
            expected_description=f"≈{self.EXPECTED_RECORD_COUNT} (±{self.RECORD_COUNT_TOLERANCE_PCT}%, range [{lower}, {upper}])",
            actual_value=actual,
            is_within_tolerance=within,
            deviation_message=deviation,
        )

    def verify_column_count(self, df: pl.DataFrame) -> ReferenceCheck:
        """Verify total column count is approximately 29 (±2 columns).

        Tolerance range: 27 – 31.

        Requirements: 4.2
        """
        actual = len(df.columns)
        lower = self.EXPECTED_COLUMN_COUNT - self.COLUMN_COUNT_TOLERANCE
        upper = self.EXPECTED_COLUMN_COUNT + self.COLUMN_COUNT_TOLERANCE
        within = lower <= actual <= upper

        deviation = ""
        if not within:
            deviation = (
                f"Column count {actual} is outside tolerance [{lower}, {upper}]. "
                f"Detected columns: {df.columns}"
            )

        return ReferenceCheck(
            name="column_count",
            expected_description=f"≈{self.EXPECTED_COLUMN_COUNT} (±{self.COLUMN_COUNT_TOLERANCE}, range [{lower}, {upper}])",
            actual_value=actual,
            is_within_tolerance=within,
            deviation_message=deviation,
        )

    def verify_duplication_rate(self, df: pl.DataFrame, id_col: str) -> ReferenceCheck:
        """Verify duplication rate is below 1%.

        If duplicates exceed 1%, flags for investigation and reports the count.

        Requirements: 4.3
        """
        total = df.height
        if total == 0:
            return ReferenceCheck(
                name="duplication_rate",
                expected_description=f"<{self.MAX_DUPLICATION_RATE}%",
                actual_value=0.0,
                is_within_tolerance=True,
                deviation_message="",
            )

        non_null_ids = df[id_col].drop_nulls()
        distinct_count = non_null_ids.n_unique()
        duplicate_count = total - distinct_count
        rate = (duplicate_count / total) * 100.0
        rate_rounded = round(rate, 2)

        within = rate < self.MAX_DUPLICATION_RATE

        deviation = ""
        if not within:
            deviation = (
                f"Duplication rate {rate_rounded}% exceeds {self.MAX_DUPLICATION_RATE}% threshold. "
                f"Found {duplicate_count} duplicate records out of {total} total. "
                f"Flagged for investigation."
            )

        return ReferenceCheck(
            name="duplication_rate",
            expected_description=f"<{self.MAX_DUPLICATION_RATE}%",
            actual_value=rate_rounded,
            is_within_tolerance=within,
            deviation_message=deviation,
        )

    def verify_main_cause(self, df: pl.DataFrame, cause_col: str) -> ReferenceCheck:
        """Verify the most frequent cause accounts for ≈50% (±5pp, so 45–55%).

        Reports both the cause name and its exact calculated percentage.

        Requirements: 4.4
        """
        total = df.height
        if total == 0:
            return ReferenceCheck(
                name="main_cause_share",
                expected_description=f"≈{self.EXPECTED_MAIN_CAUSE_SHARE}% (±{self.MAIN_CAUSE_SHARE_TOLERANCE_PP}pp, range [45%, 55%])",
                actual_value={"cause": None, "share_pct": 0.0},
                is_within_tolerance=False,
                deviation_message="No records to analyze.",
            )

        # Find the most frequent cause (excluding nulls)
        non_null = df.filter(pl.col(cause_col).is_not_null())
        if non_null.height == 0:
            return ReferenceCheck(
                name="main_cause_share",
                expected_description=f"≈{self.EXPECTED_MAIN_CAUSE_SHARE}% (±{self.MAIN_CAUSE_SHARE_TOLERANCE_PP}pp, range [45%, 55%])",
                actual_value={"cause": None, "share_pct": 0.0},
                is_within_tolerance=False,
                deviation_message="All cause values are null.",
            )

        value_counts = non_null[cause_col].value_counts().sort("count", descending=True)
        top_cause = value_counts[cause_col][0]
        top_count = value_counts["count"][0]
        share_pct = round((top_count / total) * 100.0, 2)

        lower = self.EXPECTED_MAIN_CAUSE_SHARE - self.MAIN_CAUSE_SHARE_TOLERANCE_PP
        upper = self.EXPECTED_MAIN_CAUSE_SHARE + self.MAIN_CAUSE_SHARE_TOLERANCE_PP
        within = lower <= share_pct <= upper

        deviation = ""
        if not within:
            deviation = (
                f"Main cause '{top_cause}' has {share_pct}% share, "
                f"outside tolerance [{lower}%, {upper}%]. "
                f"Deviation: {share_pct - self.EXPECTED_MAIN_CAUSE_SHARE:+.2f}pp from expected."
            )

        return ReferenceCheck(
            name="main_cause_share",
            expected_description=f"≈{self.EXPECTED_MAIN_CAUSE_SHARE}% (±{self.MAIN_CAUSE_SHARE_TOLERANCE_PP}pp, range [{lower}%, {upper}%])",
            actual_value={"cause": top_cause, "share_pct": share_pct},
            is_within_tolerance=within,
            deviation_message=deviation,
        )

    def verify_management_time(
        self, df: pl.DataFrame, time_col: str
    ) -> list[ReferenceCheck]:
        """Verify management time statistics: mean ≈6.32d (±0.5), median ≈7d (±1), P90 ≈10d (±1).

        Returns a list of three ReferenceCheck instances (mean, median, P90).

        Requirements: 4.5
        """
        checks: list[ReferenceCheck] = []

        # Get non-null numeric time values
        time_series = df[time_col].drop_nulls().cast(pl.Float64, strict=False)

        if len(time_series) == 0:
            for metric, expected, tol in [
                ("mean", self.EXPECTED_MEAN_MGMT_TIME, self.MEAN_MGMT_TIME_TOLERANCE),
                ("median", self.EXPECTED_MEDIAN_MGMT_TIME, self.MEDIAN_MGMT_TIME_TOLERANCE),
                ("p90", self.EXPECTED_P90_MGMT_TIME, self.P90_MGMT_TIME_TOLERANCE),
            ]:
                checks.append(
                    ReferenceCheck(
                        name=f"management_time_{metric}",
                        expected_description=f"≈{expected}d (±{tol})",
                        actual_value=None,
                        is_within_tolerance=False,
                        deviation_message="No non-null management time values available.",
                    )
                )
            return checks

        # Calculate mean
        actual_mean = round(time_series.mean(), 2)  # type: ignore[arg-type]
        mean_lower = self.EXPECTED_MEAN_MGMT_TIME - self.MEAN_MGMT_TIME_TOLERANCE
        mean_upper = self.EXPECTED_MEAN_MGMT_TIME + self.MEAN_MGMT_TIME_TOLERANCE
        mean_within = mean_lower <= actual_mean <= mean_upper

        mean_deviation = ""
        if not mean_within:
            mean_deviation = (
                f"Mean management time {actual_mean}d is outside tolerance "
                f"[{mean_lower}, {mean_upper}]. "
                f"Deviation: {actual_mean - self.EXPECTED_MEAN_MGMT_TIME:+.2f}d from expected."
            )

        checks.append(
            ReferenceCheck(
                name="management_time_mean",
                expected_description=f"≈{self.EXPECTED_MEAN_MGMT_TIME}d (±{self.MEAN_MGMT_TIME_TOLERANCE}d, range [{mean_lower}, {mean_upper}])",
                actual_value=actual_mean,
                is_within_tolerance=mean_within,
                deviation_message=mean_deviation,
            )
        )

        # Calculate median
        actual_median = round(time_series.median(), 2)  # type: ignore[arg-type]
        median_lower = self.EXPECTED_MEDIAN_MGMT_TIME - self.MEDIAN_MGMT_TIME_TOLERANCE
        median_upper = self.EXPECTED_MEDIAN_MGMT_TIME + self.MEDIAN_MGMT_TIME_TOLERANCE
        median_within = median_lower <= actual_median <= median_upper

        median_deviation = ""
        if not median_within:
            median_deviation = (
                f"Median management time {actual_median}d is outside tolerance "
                f"[{median_lower}, {median_upper}]. "
                f"Deviation: {actual_median - self.EXPECTED_MEDIAN_MGMT_TIME:+.2f}d from expected."
            )

        checks.append(
            ReferenceCheck(
                name="management_time_median",
                expected_description=f"≈{self.EXPECTED_MEDIAN_MGMT_TIME}d (±{self.MEDIAN_MGMT_TIME_TOLERANCE}d, range [{median_lower}, {median_upper}])",
                actual_value=actual_median,
                is_within_tolerance=median_within,
                deviation_message=median_deviation,
            )
        )

        # Calculate P90
        p90_value = time_series.quantile(0.90, interpolation="linear")
        actual_p90 = round(float(p90_value), 2) if p90_value is not None else 0.0
        p90_lower = self.EXPECTED_P90_MGMT_TIME - self.P90_MGMT_TIME_TOLERANCE
        p90_upper = self.EXPECTED_P90_MGMT_TIME + self.P90_MGMT_TIME_TOLERANCE
        p90_within = p90_lower <= actual_p90 <= p90_upper

        p90_deviation = ""
        if not p90_within:
            p90_deviation = (
                f"P90 management time {actual_p90}d is outside tolerance "
                f"[{p90_lower}, {p90_upper}]. "
                f"Deviation: {actual_p90 - self.EXPECTED_P90_MGMT_TIME:+.2f}d from expected."
            )

        checks.append(
            ReferenceCheck(
                name="management_time_p90",
                expected_description=f"≈{self.EXPECTED_P90_MGMT_TIME}d (±{self.P90_MGMT_TIME_TOLERANCE}d, range [{p90_lower}, {p90_upper}])",
                actual_value=actual_p90,
                is_within_tolerance=p90_within,
                deviation_message=p90_deviation,
            )
        )

        return checks

    def verify_channel_distribution(
        self, df: pl.DataFrame, channel_col: str
    ) -> ReferenceCheck:
        """Verify that phone + verbal channels together account for >60% of records.

        Requirements: 4.6
        """
        total = df.height
        if total == 0:
            return ReferenceCheck(
                name="channel_distribution",
                expected_description=f"Phone + Verbal > {self.CHANNEL_COMBINED_MIN_SHARE}%",
                actual_value={"phone_pct": 0.0, "verbal_pct": 0.0, "combined_pct": 0.0},
                is_within_tolerance=False,
                deviation_message="No records to analyze.",
            )

        channel_series = df[channel_col].drop_nulls()
        channel_lower = channel_series.str.to_lowercase()

        # Identify phone channel records using boolean Series operations
        phone_mask = pl.Series([False] * len(channel_lower))
        for keyword in self.PHONE_CHANNEL_KEYWORDS:
            phone_mask = phone_mask | channel_lower.str.contains(keyword)
        phone_count = int(phone_mask.sum())

        # Identify verbal channel records
        verbal_mask = pl.Series([False] * len(channel_lower))
        for keyword in self.VERBAL_CHANNEL_KEYWORDS:
            verbal_mask = verbal_mask | channel_lower.str.contains(keyword)
        verbal_count = int(verbal_mask.sum())

        phone_pct = round((phone_count / total) * 100.0, 2)
        verbal_pct = round((verbal_count / total) * 100.0, 2)
        combined_pct = round(phone_pct + verbal_pct, 2)

        within = combined_pct > self.CHANNEL_COMBINED_MIN_SHARE

        deviation = ""
        if not within:
            deviation = (
                f"Phone ({phone_pct}%) + Verbal ({verbal_pct}%) = {combined_pct}% "
                f"does not exceed {self.CHANNEL_COMBINED_MIN_SHARE}% threshold."
            )

        return ReferenceCheck(
            name="channel_distribution",
            expected_description=f"Phone + Verbal > {self.CHANNEL_COMBINED_MIN_SHARE}%",
            actual_value={"phone_pct": phone_pct, "verbal_pct": verbal_pct, "combined_pct": combined_pct},
            is_within_tolerance=within,
            deviation_message=deviation,
        )

    def verify_quality_issues(
        self,
        df: pl.DataFrame,
        closure_reason_col: str = "motivo_cierre",
        marking_col: str = "marcacion",
        company_col: str = "empresa",
        category_col: str = "causa",
    ) -> list[ReferenceCheck]:
        """Report percentage of records with quality issues per field.

        Quality issues defined per field:
        - closure_reason: null or blank values
        - marking: values not in homologated catalog (reported as invalid)
        - company: inconsistent naming or null values
        - category: semantically duplicated entries

        These are informational checks — they always pass (is_within_tolerance=True)
        but report the quality issue percentages for downstream use.

        Requirements: 4.7
        """
        checks: list[ReferenceCheck] = []
        total = df.height

        if total == 0:
            for field_name in ["closure_reason_null", "marking_invalid", "company_inconsistent", "category_duplicated"]:
                checks.append(
                    ReferenceCheck(
                        name=f"quality_{field_name}",
                        expected_description="Report quality issue percentage",
                        actual_value=0.0,
                        is_within_tolerance=True,
                        deviation_message="",
                    )
                )
            return checks

        # 1. Null closure reason
        if closure_reason_col in df.columns:
            null_or_blank = df.filter(
                pl.col(closure_reason_col).is_null()
                | (pl.col(closure_reason_col).cast(pl.Utf8, strict=False).str.strip_chars() == "")
            ).height
            null_reason_pct = round((null_or_blank / total) * 100.0, 2)
        else:
            null_reason_pct = 0.0

        checks.append(
            ReferenceCheck(
                name="quality_closure_reason_null",
                expected_description="Report % of records with null/blank closure reason",
                actual_value=null_reason_pct,
                is_within_tolerance=True,
                deviation_message=f"{null_reason_pct}% of records have null or blank closure reason."
                if null_reason_pct > 0
                else "",
            )
        )

        # 2. Invalid marking (values not in a homologated catalog)
        # Since we don't have a predefined catalog, we report null/blank as invalid
        if marking_col in df.columns:
            invalid_marking = df.filter(
                pl.col(marking_col).is_null()
                | (pl.col(marking_col).cast(pl.Utf8, strict=False).str.strip_chars() == "")
            ).height
            invalid_marking_pct = round((invalid_marking / total) * 100.0, 2)
        else:
            invalid_marking_pct = 0.0

        checks.append(
            ReferenceCheck(
                name="quality_marking_invalid",
                expected_description="Report % of records with invalid marking",
                actual_value=invalid_marking_pct,
                is_within_tolerance=True,
                deviation_message=f"{invalid_marking_pct}% of records have invalid or missing marking."
                if invalid_marking_pct > 0
                else "",
            )
        )

        # 3. Inconsistent company names (null or leading/trailing whitespace differences)
        if company_col in df.columns:
            col_series = df[company_col]
            null_companies = col_series.null_count()

            # Detect inconsistency: same trimmed value but different raw values
            non_null = col_series.drop_nulls().cast(pl.Utf8, strict=False)
            if len(non_null) > 0:
                trimmed = non_null.str.strip_chars()
                # Records whose raw value differs from trimmed (whitespace issues)
                whitespace_issues = (non_null != trimmed).sum()
                inconsistent_count = null_companies + whitespace_issues
            else:
                inconsistent_count = null_companies

            inconsistent_pct = round((inconsistent_count / total) * 100.0, 2)
        else:
            inconsistent_pct = 0.0

        checks.append(
            ReferenceCheck(
                name="quality_company_inconsistent",
                expected_description="Report % of records with inconsistent or null company names",
                actual_value=inconsistent_pct,
                is_within_tolerance=True,
                deviation_message=f"{inconsistent_pct}% of records have inconsistent or null company names."
                if inconsistent_pct > 0
                else "",
            )
        )

        # 4. Duplicated categories (semantically similar entries detected via simple check)
        # We report the ratio of non-unique category values to total distinct categories
        if category_col in df.columns:
            cat_series = df[category_col].drop_nulls().cast(pl.Utf8, strict=False)
            if len(cat_series) > 0:
                distinct_raw = cat_series.n_unique()
                # Normalize: lowercase + strip for basic dedup detection
                normalized = cat_series.str.to_lowercase().str.strip_chars()
                distinct_normalized = normalized.n_unique()
                duplicated_categories = distinct_raw - distinct_normalized
                # Percentage of records affected by duplicated categories
                if duplicated_categories > 0:
                    # Count records that belong to categories that are "duplicates" after normalization
                    raw_values = cat_series.unique().to_list()
                    norm_map: dict[str, list[str]] = {}
                    for val in raw_values:
                        norm_key = val.lower().strip()
                        norm_map.setdefault(norm_key, []).append(val)
                    # Groups with >1 raw variant
                    duplicate_groups = {k: v for k, v in norm_map.items() if len(v) > 1}
                    affected_values = set()
                    for variants in duplicate_groups.values():
                        affected_values.update(variants)
                    affected_records = df.filter(
                        pl.col(category_col).is_in(list(affected_values))
                    ).height
                    dup_cat_pct = round((affected_records / total) * 100.0, 2)
                else:
                    dup_cat_pct = 0.0
            else:
                dup_cat_pct = 0.0
        else:
            dup_cat_pct = 0.0

        checks.append(
            ReferenceCheck(
                name="quality_category_duplicated",
                expected_description="Report % of records with semantically duplicated categories",
                actual_value=dup_cat_pct,
                is_within_tolerance=True,
                deviation_message=f"{dup_cat_pct}% of records have semantically duplicated category entries."
                if dup_cat_pct > 0
                else "",
            )
        )

        return checks
