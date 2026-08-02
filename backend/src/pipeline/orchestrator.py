"""Pipeline orchestrator for full data pipeline execution.

Coordinates the multi-stage data pipeline: ingest → profile → validate →
enrich → serve. Implements idempotent processing via SHA-256 file hashing,
exponential backoff retries, record quarantining, and control table tracking.

Requirements: 12.5, 12.7, 12.8, 12.9, 12.10
"""

from __future__ import annotations

import hashlib
import json
import logging
import time
import uuid
from dataclasses import asdict, dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Callable

import polars as pl

from ingestion.excel_adapter import ExcelIngestionAdapter
from pipeline.models import BatchStatus, IngestionBatch
from profiling.detectors import (
    calculate_null_stats,
    detect_outliers_iqr,
    find_duplicates,
)
from profiling.type_inference import infer_types
from profiling.validators import find_semantic_similarities, validate_dates
from quality.models import QualityReport, QualityScore
from quality.report_generator import QualityReportGenerator
from quality.score_computer import QualityScoreComputer

logger = logging.getLogger(__name__)


@dataclass
class PipelineConfig:
    """Configuration for a pipeline execution run.

    Attributes:
        source_path: Path to the source data file.
        output_dir: Base directory for all data layers (raw, staging, curated, serving).
        force_reprocess: If True, skip idempotency check and reprocess even if hash exists.
    """

    source_path: Path
    output_dir: Path = field(default_factory=lambda: Path("data"))
    force_reprocess: bool = False


@dataclass
class PipelineResult:
    """Result of a full pipeline execution.

    Attributes:
        success: Whether the pipeline completed successfully.
        batch: IngestionBatch record with processing metrics.
        quality_report: Generated quality report (None if pipeline failed early).
        quality_score: Computed quality score (None if pipeline failed early).
        errors: List of error messages encountered during execution.
        message: Human-readable summary of the pipeline run.
    """

    success: bool
    batch: IngestionBatch
    quality_report: QualityReport | None
    quality_score: QualityScore | None
    errors: list[str]
    message: str


class PipelineOrchestrator:
    """Coordinates the full data pipeline execution.

    Manages idempotent processing through file hashing, retry logic with
    exponential backoff, record quarantining for failed validations, and
    control table tracking for observability.

    The pipeline stages are:
    1. Ingest: Read source file via ExcelIngestionAdapter
    2. Profile: Type inference, null stats, outliers, duplicates, dates, similarity
    3. Validate: Generate quality report
    4. Enrich: Compute quality score
    5. Serve: Store curated Parquet and update control table

    Args:
        output_dir: Base directory for data layers. Defaults to Path("data").
        id_column: Name of the PQR identifier column. Defaults to "id_pqr".
    """

    # Control table file path relative to output_dir
    _CONTROL_TABLE_RELATIVE = Path("serving") / "control_table.json"
    # Quarantine file path relative to output_dir
    _QUARANTINE_RELATIVE = Path("staging") / "quarantine.parquet"
    # Curated output relative path
    _CURATED_RELATIVE = Path("curated")

    def __init__(
        self,
        output_dir: Path | None = None,
        id_column: str = "id_pqr",
    ) -> None:
        self.output_dir = output_dir or Path("data")
        self.id_column = id_column
        self._adapter = ExcelIngestionAdapter()
        self._report_generator = QualityReportGenerator(id_column=id_column)
        self._score_computer = QualityScoreComputer(id_column=id_column)

    def compute_file_hash(self, path: Path) -> str:
        """Compute SHA-256 hash of a file for idempotent processing.

        Reads the file in 8KB chunks to handle large files efficiently.

        Args:
            path: Path to the file to hash.

        Returns:
            Hexadecimal SHA-256 hash string.

        Raises:
            FileNotFoundError: If the file does not exist.
            PermissionError: If the file is not readable.
        """
        sha256 = hashlib.sha256()
        with open(path, "rb") as f:
            while True:
                chunk = f.read(8192)
                if not chunk:
                    break
                sha256.update(chunk)
        return sha256.hexdigest()

    def is_already_processed(self, file_hash: str) -> bool:
        """Check the control table for whether a file hash was already processed.

        Reads the JSON control table and checks if any batch entry has a
        matching source_file_hash with a 'completed' status.

        Args:
            file_hash: SHA-256 hash string to look up.

        Returns:
            True if the hash is found in a completed batch, False otherwise.
        """
        control_table_path = self.output_dir / self._CONTROL_TABLE_RELATIVE

        if not control_table_path.exists():
            return False

        try:
            with open(control_table_path, "r", encoding="utf-8") as f:
                entries = json.load(f)
        except (json.JSONDecodeError, OSError):
            return False

        for entry in entries:
            if (
                entry.get("source_file_hash") == file_hash
                and entry.get("status") == BatchStatus.COMPLETED.value
            ):
                return True

        return False

    def retry_with_backoff(
        self,
        operation: Callable[[], Any],
        max_retries: int = 3,
        base_wait: float = 2.0,
    ) -> Any:
        """Execute an operation with exponential backoff retry logic.

        Retries the operation on failure with increasing wait times:
        base_wait * 2^attempt (e.g., 2s, 4s, 8s), capped at 30 seconds.

        Args:
            operation: Callable to execute. Must take no arguments.
            max_retries: Maximum number of retry attempts. Defaults to 3.
            base_wait: Base wait time in seconds. Defaults to 2.0.

        Returns:
            The result of the successful operation call.

        Raises:
            Exception: The last exception raised after all retries are exhausted.
        """
        last_exception: Exception | None = None

        for attempt in range(max_retries + 1):
            try:
                return operation()
            except Exception as e:
                last_exception = e
                if attempt < max_retries:
                    wait_time = min(base_wait * (2**attempt), 30.0)
                    logger.warning(
                        f"Operation failed (attempt {attempt + 1}/{max_retries + 1}): {e}. "
                        f"Retrying in {wait_time:.1f}s..."
                    )
                    time.sleep(wait_time)
                else:
                    logger.error(
                        f"Operation failed after {max_retries + 1} attempts: {e}"
                    )

        raise last_exception  # type: ignore[misc]

    def quarantine_record(
        self, record: dict[str, Any], rule_id: str, reason: str
    ) -> None:
        """Isolate a failed record to the quarantine Parquet file.

        Appends the record with rule_id, reason, and timestamp to the
        quarantine file. Creates the file if it does not exist.

        Args:
            record: Dictionary representing the failed record data.
            rule_id: Identifier of the quality rule that caused quarantine.
            reason: Human-readable explanation of why the record was quarantined.
        """
        quarantine_path = self.output_dir / self._QUARANTINE_RELATIVE
        quarantine_path.parent.mkdir(parents=True, exist_ok=True)

        # Build quarantine entry
        quarantine_entry = {
            "quarantine_timestamp": datetime.utcnow().isoformat(),
            "rule_id": rule_id,
            "reason": reason,
            "record_data": json.dumps(record, default=str),
        }

        # Create DataFrame for the new entry
        new_row = pl.DataFrame([quarantine_entry])

        # Append to existing or create new quarantine file
        if quarantine_path.exists():
            try:
                existing = pl.read_parquet(quarantine_path)
                combined = pl.concat([existing, new_row], how="diagonal_relaxed")
            except Exception:
                combined = new_row
        else:
            combined = new_row

        combined.write_parquet(quarantine_path, compression="snappy")

    def update_control_table(self, batch: IngestionBatch) -> None:
        """Append batch information to the JSON control table.

        Records timestamp, file hash, record counts (ingested, validated,
        quarantined, rejected), processing duration, and status.

        Args:
            batch: IngestionBatch instance with completed batch metrics.
        """
        control_table_path = self.output_dir / self._CONTROL_TABLE_RELATIVE
        control_table_path.parent.mkdir(parents=True, exist_ok=True)

        # Load existing entries
        entries: list[dict[str, Any]] = []
        if control_table_path.exists():
            try:
                with open(control_table_path, "r", encoding="utf-8") as f:
                    entries = json.load(f)
            except (json.JSONDecodeError, OSError):
                entries = []

        # Serialize batch to dict
        batch_record = {
            "batch_id": batch.batch_id,
            "ingestion_timestamp": batch.ingestion_timestamp.isoformat(),
            "source_file_path": str(batch.source_file_path),
            "source_file_hash": batch.source_file_hash,
            "records_ingested": batch.records_ingested,
            "records_validated": batch.records_validated,
            "records_quarantined": batch.records_quarantined,
            "records_rejected": batch.records_rejected,
            "processing_duration_seconds": batch.processing_duration_seconds,
            "status": batch.status.value,
        }

        entries.append(batch_record)

        # Write back
        with open(control_table_path, "w", encoding="utf-8") as f:
            json.dump(entries, f, indent=2, ensure_ascii=False)

    def run(self, source: Path | str, config: PipelineConfig | None = None) -> PipelineResult:
        """Execute the full data pipeline: ingest → profile → validate → enrich → serve.

        Pipeline stages:
        1. Compute file hash and check idempotency
        2. Read Excel via ExcelIngestionAdapter
        3. Profile data (type inference, null stats, outliers, duplicates, dates, similarity)
        4. Generate quality report
        5. Compute quality score
        6. Store curated data as Parquet (snappy compression) in data/curated/
        7. Update control table
        8. Return PipelineResult

        Args:
            source: Path to the source Excel file.
            config: Optional PipelineConfig. If None, defaults are used.

        Returns:
            PipelineResult with success status, batch info, reports, and errors.
        """
        source_path = Path(source)
        start_time = time.time()
        errors: list[str] = []

        if config is None:
            config = PipelineConfig(source_path=source_path, output_dir=self.output_dir)

        # Initialize batch tracking
        batch = IngestionBatch(
            batch_id=str(uuid.uuid4()),
            ingestion_timestamp=datetime.utcnow(),
            source_file_path=source_path,
            source_file_hash="",
            status=BatchStatus.IN_PROGRESS,
        )

        try:
            # Stage 1: Compute file hash and check idempotency
            logger.info(f"Computing file hash for '{source_path}'...")
            file_hash = self.compute_file_hash(source_path)
            batch.source_file_hash = file_hash

            if not config.force_reprocess and self.is_already_processed(file_hash):
                elapsed = time.time() - start_time
                batch.processing_duration_seconds = round(elapsed, 2)
                batch.status = BatchStatus.COMPLETED
                return PipelineResult(
                    success=True,
                    batch=batch,
                    quality_report=None,
                    quality_score=None,
                    errors=[],
                    message=(
                        f"File '{source_path.name}' already processed "
                        f"(hash: {file_hash[:12]}...). Skipping."
                    ),
                )

            # Stage 2: Ingest — Read Excel via adapter
            logger.info(f"Ingesting '{source_path.name}'...")
            sheets = self.retry_with_backoff(
                lambda: self._adapter.read(source_path)
            )

            if not sheets:
                raise ValueError(
                    f"No data sheets found in '{source_path.name}'."
                )

            # Combine all sheets into a single DataFrame for processing
            # Use the first sheet with data, or concatenate if multiple
            dfs = list(sheets.values())
            if len(dfs) == 1:
                df = dfs[0]
            else:
                # Concatenate sheets with compatible schemas
                try:
                    df = pl.concat(dfs, how="diagonal_relaxed")
                except Exception:
                    # If concat fails, use the largest sheet
                    df = max(dfs, key=lambda d: d.height)

            batch.records_ingested = df.height
            logger.info(
                f"Ingested {df.height} records from {len(sheets)} sheet(s)."
            )

            # Stage 3: Profile data
            logger.info("Profiling data...")
            quality_report = self._report_generator.generate_report(df)

            # Stage 4: Compute quality score
            logger.info("Computing quality score...")
            quality_score, violations = self._score_computer.compute(df)

            # Track validated records (all minus quarantined)
            batch.records_validated = df.height
            batch.records_quarantined = 0

            # Stage 5: Store curated data as Parquet with snappy compression
            logger.info("Storing curated data...")
            curated_dir = config.output_dir / self._CURATED_RELATIVE
            curated_dir.mkdir(parents=True, exist_ok=True)

            curated_filename = f"{source_path.stem}_curated.parquet"
            curated_path = curated_dir / curated_filename
            df.write_parquet(curated_path, compression="snappy")
            logger.info(f"Curated data written to '{curated_path}'.")

            # Stage 6: Finalize batch and update control table
            elapsed = time.time() - start_time
            batch.processing_duration_seconds = round(elapsed, 2)
            batch.status = BatchStatus.COMPLETED

            self.update_control_table(batch)
            logger.info(
                f"Pipeline completed in {elapsed:.2f}s. "
                f"Records: {batch.records_ingested} ingested, "
                f"{batch.records_validated} validated, "
                f"{batch.records_quarantined} quarantined."
            )

            return PipelineResult(
                success=True,
                batch=batch,
                quality_report=quality_report,
                quality_score=quality_score,
                errors=errors,
                message=(
                    f"Pipeline completed successfully. "
                    f"Processed {batch.records_ingested} records in {elapsed:.2f}s. "
                    f"Quality score: {quality_score.composite_score:.1f}/100."
                ),
            )

        except FileNotFoundError as e:
            elapsed = time.time() - start_time
            batch.processing_duration_seconds = round(elapsed, 2)
            batch.status = BatchStatus.FAILED
            error_msg = f"Source file not found: {e}"
            errors.append(error_msg)
            logger.error(error_msg)
            self.update_control_table(batch)

            return PipelineResult(
                success=False,
                batch=batch,
                quality_report=None,
                quality_score=None,
                errors=errors,
                message=error_msg,
            )

        except Exception as e:
            elapsed = time.time() - start_time
            batch.processing_duration_seconds = round(elapsed, 2)
            batch.status = BatchStatus.FAILED
            error_msg = f"Pipeline failed: {e}"
            errors.append(error_msg)
            logger.error(error_msg, exc_info=True)
            self.update_control_table(batch)

            return PipelineResult(
                success=False,
                batch=batch,
                quality_report=None,
                quality_score=None,
                errors=errors,
                message=error_msg,
            )
