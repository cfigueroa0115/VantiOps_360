"""PII detection and masking module.

Detects columns containing personally identifiable information (PII)
based on configurable name patterns, and masks values to protect privacy.

Requirements: 13.5, 13.7, 13.8
"""

from __future__ import annotations

import hashlib
import logging
import re
from dataclasses import dataclass, field

import polars as pl

logger = logging.getLogger(__name__)

# Default PII column name patterns (regex, case-insensitive)
DEFAULT_PII_PATTERNS: list[str] = [
    r".*nombre.*",
    r".*telefono.*",
    r".*celular.*",
    r".*direccion.*",
    r".*cedula.*",
    r".*nit.*",
    r".*email.*",
    r".*correo.*",
]


@dataclass
class QuarantinedRecord:
    """A record that failed PII masking."""

    row_index: int
    field_name: str
    reason: str


@dataclass
class MaskingResult:
    """Result of masking a DataFrame."""

    masked_df: pl.DataFrame
    failed_records: list[QuarantinedRecord] = field(default_factory=list)


class PIIMasker:
    """Detects and masks PII fields in Polars DataFrames.

    PII detection is based on configurable column name regex patterns.
    Masking rules:
    - Strings with length >= 3: preserve first and last characters,
      replace middle characters with asterisks.
    - Strings with length < 3 (but non-empty): SHA-256 hash (first 8 chars).
    - Empty/null values: left unchanged.

    Records where masking fails are quarantined, logged, and excluded from output.
    """

    def __init__(self, pii_patterns: list[str] | None = None) -> None:
        """Initialize with configurable PII field patterns.

        Args:
            pii_patterns: List of regex patterns to match PII column names.
                          Defaults to DEFAULT_PII_PATTERNS if not provided.
        """
        patterns = pii_patterns if pii_patterns is not None else DEFAULT_PII_PATTERNS
        self._compiled_patterns = [
            re.compile(pattern, re.IGNORECASE) for pattern in patterns
        ]

    @property
    def patterns(self) -> list[re.Pattern]:
        """Return compiled PII patterns."""
        return self._compiled_patterns

    def detect_pii_columns(self, df: pl.DataFrame) -> list[str]:
        """Detect columns whose names match PII patterns.

        Args:
            df: Input DataFrame to scan.

        Returns:
            List of column names that match at least one PII pattern.
        """
        pii_columns: list[str] = []
        for col_name in df.columns:
            for pattern in self._compiled_patterns:
                if pattern.fullmatch(col_name):
                    pii_columns.append(col_name)
                    break
        return pii_columns

    @staticmethod
    def mask_value(value: str | None) -> str | None:
        """Mask a single string value according to PII masking rules.

        Args:
            value: The string value to mask.

        Returns:
            Masked string, or None if input is None.

        Rules:
            - None/null: returns None
            - Empty string: returns empty string
            - Length >= 3: first char + asterisks + last char
            - Length < 3 (1 or 2 chars): SHA-256 hash prefix (first 8 chars)
        """
        if value is None:
            return None

        if len(value) == 0:
            return ""

        if len(value) >= 3:
            middle_length = len(value) - 2
            return value[0] + ("*" * middle_length) + value[-1]
        else:
            # Length 1 or 2: hash with SHA-256
            hash_digest = hashlib.sha256(value.encode("utf-8")).hexdigest()
            return hash_digest[:8]

    def mask_dataframe(self, df: pl.DataFrame) -> MaskingResult:
        """Apply PII masking to all detected PII columns in a DataFrame.

        Detects PII columns, applies masking to each value. Records where
        masking fails are quarantined and excluded from the output.

        Args:
            df: Input DataFrame to mask.

        Returns:
            MaskingResult with masked DataFrame and list of failed records.
        """
        pii_columns = self.detect_pii_columns(df)

        if not pii_columns:
            return MaskingResult(masked_df=df, failed_records=[])

        failed_records: list[QuarantinedRecord] = []
        failed_row_indices: set[int] = set()

        # Process each PII column
        masked_series_map: dict[str, pl.Series] = {}
        for col_name in pii_columns:
            series = df[col_name]
            masked_values: list[str | None] = []

            for row_idx in range(len(series)):
                raw_value = series[row_idx]

                # Handle null values - pass through
                if raw_value is None:
                    masked_values.append(None)
                    continue

                # Convert to string if not already
                str_value = str(raw_value)

                try:
                    masked = self.mask_value(str_value)
                    masked_values.append(masked)
                except Exception as e:
                    # Masking failed - quarantine this record
                    reason = f"Masking failed for field '{col_name}': {e}"
                    logger.error(
                        f"PII masking failure at row {row_idx}, "
                        f"field '{col_name}': {e}"
                    )
                    failed_records.append(
                        QuarantinedRecord(
                            row_index=row_idx,
                            field_name=col_name,
                            reason=reason,
                        )
                    )
                    failed_row_indices.add(row_idx)
                    masked_values.append(None)  # Placeholder

            masked_series_map[col_name] = pl.Series(col_name, masked_values)

        # Build the masked DataFrame
        result_df = df.clone()
        for col_name, masked_series in masked_series_map.items():
            result_df = result_df.with_columns(masked_series.alias(col_name))

        # Exclude quarantined rows from output
        if failed_row_indices:
            keep_mask = [
                i not in failed_row_indices for i in range(len(result_df))
            ]
            result_df = result_df.filter(pl.Series("_keep", keep_mask))

        return MaskingResult(masked_df=result_df, failed_records=failed_records)
