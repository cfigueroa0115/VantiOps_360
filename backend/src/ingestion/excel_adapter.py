"""Excel Ingestion Adapter for XLSX/XLS files using Polars.

Implements the DataSourceAdapter protocol for reading Excel workbooks,
standardizing column names to snake_case, and verifying data integrity.

Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7
"""

from __future__ import annotations

import hashlib
import logging
import re
import time
from dataclasses import dataclass, field
from pathlib import Path

import polars as pl

from ingestion.protocols import ValidationResult, ValidationStatus

logger = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class IntegrityReport:
    """Report from verify_integrity check.

    Attributes:
        is_valid: Whether all sheets passed integrity checks.
        details: Per-sheet integrity comparison details.
    """

    is_valid: bool
    details: dict[str, dict[str, int]] = field(default_factory=dict)


class ExcelIngestionAdapter:
    """Concrete adapter for XLSX/XLS files using Polars.

    Reads all sheets from an Excel workbook, standardizes column names
    to snake_case, and verifies zero record/column loss during ingestion.

    Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7
    """

    # Supported extensions
    _SUPPORTED_EXTENSIONS = {".xlsx", ".xls"}

    def detect(self, source: str | Path) -> bool:
        """Determine if this adapter can handle the given source.

        Returns True if the file has .xlsx or .xls extension.

        Args:
            source: File path of the data source.

        Returns:
            True if file has a supported Excel extension.
        """
        path = Path(source)
        return path.suffix.lower() in self._SUPPORTED_EXTENSIONS

    def read(self, source: str | Path) -> dict[str, pl.DataFrame]:
        """Read all sheets from an Excel workbook and standardize column names.

        Loads each sheet independently, standardizes column names to snake_case,
        skips empty sheets with a warning, and verifies data integrity.

        Args:
            source: File path to the Excel workbook.

        Returns:
            Dictionary mapping sheet names to their standardized DataFrames.

        Raises:
            FileNotFoundError: If the source file does not exist.
            PermissionError: If the source file is not readable.
            ValueError: If the file cannot be parsed as Excel.

        Requirements: 1.1, 1.4, 1.5, 1.6, 1.7
        """
        path = Path(source)
        start_time = time.time()

        # Req 1.4: Raise descriptive error if file is missing or unreadable
        if not path.exists():
            elapsed = time.time() - start_time
            raise FileNotFoundError(
                f"Excel file not found: '{path}'. "
                f"The file does not exist at the specified path. "
                f"(checked in {elapsed:.2f}s)"
            )

        if not path.is_file():
            raise ValueError(
                f"Path is not a file: '{path}'. Expected an Excel workbook file."
            )

        try:
            # Test readability
            with open(path, "rb") as f:
                f.read(1)
        except PermissionError:
            raise PermissionError(
                f"Excel file is not readable: '{path}'. "
                f"Permission denied when attempting to read the file."
            )
        except OSError as e:
            raise ValueError(
                f"Cannot read Excel file: '{path}'. Error: {e}"
            )

        # Req 1.1: Read the Excel file and detect all sheet names
        try:
            # Use openpyxl to get sheet names (Polars uses openpyxl internally)
            import openpyxl

            workbook = openpyxl.load_workbook(path, read_only=True, data_only=True)
            sheet_names = workbook.sheetnames
            workbook.close()
        except Exception as e:
            raise ValueError(
                f"Failed to read Excel workbook: '{path}'. "
                f"The file may be corrupted or not a valid Excel format. Error: {e}"
            )

        results: dict[str, pl.DataFrame] = {}
        source_counts: dict[str, dict[str, int]] = {}
        output_counts: dict[str, dict[str, int]] = {}

        # Req 1.7: Process each sheet independently
        for sheet_name in sheet_names:
            try:
                df = pl.read_excel(path, sheet_name=sheet_name, engine="openpyxl")
            except Exception as e:
                logger.warning(
                    f"Failed to read sheet '{sheet_name}' from '{path}': {e}. Skipping."
                )
                continue

            # Req 1.5: Skip empty sheets with warning
            if df.height == 0:
                logger.warning(
                    f"Sheet '{sheet_name}' in '{path}' contains zero records. "
                    f"Skipping empty sheet."
                )
                continue

            # Record source counts for integrity verification
            source_counts[sheet_name] = {
                "records": df.height,
                "columns": df.width,
            }

            # Req 1.2: Standardize column names to snake_case
            df = self.standardize_columns(df)

            # Record output counts
            output_counts[sheet_name] = {
                "records": df.height,
                "columns": df.width,
            }

            results[sheet_name] = df

        # Req 1.3: Verify integrity (zero record/column loss)
        integrity = self.verify_integrity(source_counts, output_counts)
        if not integrity.is_valid:
            failed_sheets = [
                name for name, detail in integrity.details.items()
                if detail.get("record_diff", 0) != 0 or detail.get("column_diff", 0) != 0
            ]
            logger.error(
                f"Integrity check failed for sheets: {failed_sheets}. "
                f"Record or column count mismatch detected."
            )

        elapsed = time.time() - start_time
        logger.info(
            f"Successfully read {len(results)} sheet(s) from '{path}' in {elapsed:.2f}s."
        )

        return results

    def standardize_columns(self, df: pl.DataFrame) -> pl.DataFrame:
        """Standardize all column names to snake_case format.

        Conversion rules:
        1. Strip leading/trailing whitespace
        2. Convert to lowercase
        3. Replace spaces and special characters with underscores
        4. Remove leading/trailing underscores
        5. Collapse consecutive underscores
        6. Ensure non-empty result (fallback to 'column_N')

        Args:
            df: Input DataFrame with original column names.

        Returns:
            DataFrame with standardized snake_case column names.

        Requirements: 1.2
        """
        new_columns: list[str] = []

        for idx, col_name in enumerate(df.columns):
            standardized = self._to_snake_case(col_name, idx)
            new_columns.append(standardized)

        return df.rename(dict(zip(df.columns, new_columns)))

    def _to_snake_case(self, name: str, index: int = 0) -> str:
        """Convert a single column name to snake_case.

        Args:
            name: Original column name.
            index: Column index (used for fallback naming).

        Returns:
            Standardized snake_case column name.
        """
        # Step 1: Strip leading/trailing whitespace
        result = name.strip()

        # Step 2: Convert to lowercase
        result = result.lower()

        # Step 3: Replace spaces and special characters with underscores
        # Keep only lowercase letters, digits, and underscores
        result = re.sub(r"[^a-z0-9]+", "_", result)

        # Step 4: Remove leading/trailing underscores
        result = result.strip("_")

        # Step 5: Collapse consecutive underscores
        result = re.sub(r"_+", "_", result)

        # Step 6: Ensure non-empty result
        if not result:
            result = f"column_{index}"

        return result

    def verify_integrity(
        self,
        source_counts: dict[str, dict[str, int]],
        output_counts: dict[str, dict[str, int]],
    ) -> IntegrityReport:
        """Verify zero record/column loss during ingestion.

        Compares source record/column counts with output counts for each sheet.

        Args:
            source_counts: Dict mapping sheet name to source record/column counts.
            output_counts: Dict mapping sheet name to output record/column counts.

        Returns:
            IntegrityReport indicating whether all sheets passed integrity checks.

        Requirements: 1.3
        """
        is_valid = True
        details: dict[str, dict[str, int]] = {}

        for sheet_name, source in source_counts.items():
            output = output_counts.get(sheet_name, {"records": 0, "columns": 0})

            record_diff = output["records"] - source["records"]
            column_diff = output["columns"] - source["columns"]

            details[sheet_name] = {
                "source_records": source["records"],
                "output_records": output["records"],
                "record_diff": record_diff,
                "source_columns": source["columns"],
                "output_columns": output["columns"],
                "column_diff": column_diff,
            }

            if record_diff != 0 or column_diff != 0:
                is_valid = False

        return IntegrityReport(is_valid=is_valid, details=details)

    def metadata(self, source: str | Path) -> dict:
        """Extract metadata: file hash, record count, schema info.

        Computes SHA-256 hash of the file, total record count across sheets,
        column count, and schema information per sheet.

        Args:
            source: File path of the Excel workbook.

        Returns:
            Dictionary with metadata keys: file_hash, record_count,
            column_count, schema, file_size_bytes, sheet_names.
        """
        path = Path(source)

        if not path.exists():
            raise FileNotFoundError(
                f"Cannot extract metadata: file not found at '{path}'."
            )

        # Compute SHA-256 hash
        sha256_hash = hashlib.sha256()
        with open(path, "rb") as f:
            for chunk in iter(lambda: f.read(8192), b""):
                sha256_hash.update(chunk)

        file_hash = sha256_hash.hexdigest()
        file_size = path.stat().st_size

        # Read sheets for schema info
        sheets = self.read(source)

        total_records = sum(df.height for df in sheets.values())
        schema_info: dict[str, dict[str, str]] = {}
        column_count = 0

        for sheet_name, df in sheets.items():
            schema_info[sheet_name] = {
                col: str(dtype) for col, dtype in zip(df.columns, df.dtypes)
            }
            column_count = max(column_count, df.width)

        return {
            "file_hash": file_hash,
            "record_count": total_records,
            "column_count": column_count,
            "schema": schema_info,
            "file_size_bytes": file_size,
            "sheet_names": list(sheets.keys()),
        }

    def validate(self, source: str | Path) -> ValidationResult:
        """Validate source accessibility and basic structure.

        Checks:
        - File exists and is readable
        - File has .xlsx or .xls extension
        - Contains at least one non-empty sheet

        Args:
            source: File path of the Excel workbook.

        Returns:
            ValidationResult indicating whether the source is usable.
        """
        path = Path(source)
        errors: list[str] = []
        warnings: list[str] = []

        # Check existence
        if not path.exists():
            return ValidationResult(
                is_valid=False,
                status=ValidationStatus.INVALID,
                errors=[f"File not found: '{path}'"],
            )

        # Check extension
        if path.suffix.lower() not in self._SUPPORTED_EXTENSIONS:
            return ValidationResult(
                is_valid=False,
                status=ValidationStatus.INVALID,
                errors=[
                    f"Unsupported file extension: '{path.suffix}'. "
                    f"Expected .xlsx or .xls."
                ],
            )

        # Check readability
        try:
            with open(path, "rb") as f:
                f.read(1)
        except PermissionError:
            return ValidationResult(
                is_valid=False,
                status=ValidationStatus.INVALID,
                errors=[f"File is not readable (permission denied): '{path}'"],
            )
        except OSError as e:
            return ValidationResult(
                is_valid=False,
                status=ValidationStatus.INVALID,
                errors=[f"File cannot be read: '{path}'. Error: {e}"],
            )

        # Check it contains at least one non-empty sheet
        try:
            sheets = self.read(source)
        except Exception as e:
            return ValidationResult(
                is_valid=False,
                status=ValidationStatus.INVALID,
                errors=[f"Failed to parse Excel file: '{path}'. Error: {e}"],
            )

        if not sheets:
            return ValidationResult(
                is_valid=False,
                status=ValidationStatus.INVALID,
                errors=[f"Excel file contains no non-empty sheets: '{path}'"],
                warnings=warnings,
            )

        total_records = sum(df.height for df in sheets.values())
        total_columns = max((df.width for df in sheets.values()), default=0)

        return ValidationResult(
            is_valid=True,
            status=ValidationStatus.VALID,
            errors=errors,
            warnings=warnings,
            record_count=total_records,
            column_count=total_columns,
            metadata={
                "sheet_count": len(sheets),
                "sheet_names": ", ".join(sheets.keys()),
            },
        )

    def close(self, source: str | Path) -> None:
        """Release any resources held for the source.

        No-op for file-based adapter — nothing to release.

        Args:
            source: File path of the Excel workbook.
        """
        # No resources to release for file-based adapter
        pass
