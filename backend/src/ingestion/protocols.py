"""DataSourceAdapter protocol and related types for multi-source ingestion.

Defines the protocol interface that all data source adapters must implement,
along with the ValidationResult dataclass returned by the validate method.

Requirements: 12.4
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Protocol, runtime_checkable

import polars as pl


class ValidationStatus(Enum):
    """Result status for source validation."""

    VALID = "valid"
    INVALID = "invalid"
    WARNING = "warning"


@dataclass(frozen=True, slots=True)
class ValidationResult:
    """Result of validating a data source's accessibility and structure.

    Attributes:
        is_valid: Whether the source passed all validation checks.
        status: Overall validation status.
        errors: List of error messages for critical failures.
        warnings: List of warning messages for non-critical issues.
        record_count: Number of records detected (if readable).
        column_count: Number of columns detected (if readable).
        metadata: Additional metadata about the validation.
    """

    is_valid: bool
    status: ValidationStatus
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    record_count: int | None = None
    column_count: int | None = None
    metadata: dict[str, str | int | float | bool] = field(default_factory=dict)


@runtime_checkable
class DataSourceAdapter(Protocol):
    """Protocol interface for multi-source ingestion.

    All concrete adapters (Excel, CSV, Parquet, JSON, etc.) must implement
    this protocol to participate in the pipeline's auto-detection chain.

    Requirements: 12.4
    """

    def detect(self, source: str | Path) -> bool:
        """Determine if this adapter can handle the given source.

        Args:
            source: File path or URI of the data source.

        Returns:
            True if this adapter can read the source, False otherwise.
        """
        ...

    def read(self, source: str | Path) -> pl.DataFrame:
        """Read the source and return a Polars DataFrame.

        Args:
            source: File path or URI of the data source.

        Returns:
            A Polars DataFrame containing the source data.

        Raises:
            FileNotFoundError: If the source path does not exist.
            ValueError: If the source cannot be parsed.
        """
        ...

    def metadata(self, source: str | Path) -> dict:
        """Extract metadata: file hash, record count, schema info.

        Args:
            source: File path or URI of the data source.

        Returns:
            Dictionary with keys such as 'file_hash', 'record_count',
            'column_count', 'schema', 'file_size_bytes'.
        """
        ...

    def validate(self, source: str | Path) -> ValidationResult:
        """Validate source accessibility and basic structure.

        Checks that the file exists, is readable, has expected structure,
        and can be opened without errors.

        Args:
            source: File path or URI of the data source.

        Returns:
            A ValidationResult indicating whether the source is usable.
        """
        ...

    def close(self, source: str | Path) -> None:
        """Release any resources held for the source.

        Args:
            source: File path or URI of the data source.
        """
        ...
