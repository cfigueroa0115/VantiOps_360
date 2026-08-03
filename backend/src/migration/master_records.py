"""Master records migration module — 600-record PQR migration pipeline.

Implements the full migration pipeline:
  profile → clean → validate → load (UPSERT) → reconcile → report

Uses UPSERT (ON CONFLICT DO NOTHING) for strict idempotency (REQ-19.7):
  - Re-execution does NOT insert duplicates
  - Re-execution does NOT modify previously migrated records

Generates a post-migration report JSON with:
  total_records, success_count, failed_count, success_rate,
  duration_seconds, timestamp, quarantined_records list

Target: ≥ 95% success rate (570/600), ≤ 10 min in CI.

Requirements: 19.1, 19.2, 19.5, 19.6, 19.7
"""

from __future__ import annotations

import json
import logging
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Protocol

import polars as pl

from core.retry import retry_policy

logger = logging.getLogger(__name__)

# Default paths
DEFAULT_SOURCE_PATH = Path("data/curated/pqr_curated.parquet")
DEFAULT_REPORT_DIR = Path("data/reports")
DEFAULT_QUARANTINE_PATH = Path("staging/migration_quarantine.parquet")


class MigrationAbortError(Exception):
    """Raised when migration aborts due to exhausted retries on connection failures.

    Preserves existing data: no partial writes corrupt the database because
    UPSERT (ON CONFLICT DO NOTHING) is atomic per batch and previously
    committed batches remain intact.

    Requirements: 19.4
    """

    def __init__(self, reason: str, records_loaded: int = 0, records_remaining: int = 0):
        self.reason = reason
        self.records_loaded = records_loaded
        self.records_remaining = records_remaining
        super().__init__(
            f"Migration aborted: {reason}. "
            f"Loaded: {records_loaded}, Remaining: {records_remaining}. "
            f"Existing data preserved."
        )

# PQR valid domain values
VALID_ESTADOS = {"cerrado", "en_proceso", "abierto"}
VALID_TIPOS_PQR = {"peticion", "queja", "reclamo"}

# Minimum success rate threshold (REQ-19.6)
MIN_SUCCESS_RATE = 95.0


class DatabaseConnection(Protocol):
    """Protocol for database connection used in migration."""

    def execute_upsert(self, records: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """Execute UPSERT for a batch of records.

        Returns list of dicts with keys: source_record_id, status ('migrated' | 'failed'), error
        """
        ...

    def count_migrated(self) -> int:
        """Count total records in the target table."""
        ...


@dataclass
class QuarantinedRecord:
    """A record that failed validation during migration."""

    record_id: str
    failed_field: str
    rule_violated: str
    rejected_value: Any
    quarantine_timestamp: str = field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )


@dataclass
class MigrationReport:
    """Post-migration report per REQ-19.5."""

    batch_id: str
    total_records: int
    success_count: int
    failed_count: int
    quarantined_count: int
    success_rate: float
    duration_seconds: float
    started_at: str
    completed_at: str
    status: str
    quarantined_records: list[dict[str, Any]] = field(default_factory=list)
    reconciliation_status: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        """Convert report to serializable dict."""
        return {
            "batch_id": self.batch_id,
            "total_records": self.total_records,
            "success_count": self.success_count,
            "failed_count": self.failed_count,
            "quarantined_count": self.quarantined_count,
            "success_rate": self.success_rate,
            "duration_seconds": self.duration_seconds,
            "started_at": self.started_at,
            "completed_at": self.completed_at,
            "status": self.status,
            "quarantined_records": self.quarantined_records,
            "reconciliation_status": self.reconciliation_status,
        }

    @property
    def is_successful(self) -> bool:
        """Migration is successful if success_rate >= 95% (REQ-19.6)."""
        return self.success_rate >= MIN_SUCCESS_RATE


@dataclass
class MigrationConfig:
    """Configuration for the master migration pipeline."""

    source_path: Path = field(default_factory=lambda: DEFAULT_SOURCE_PATH)
    report_dir: Path = field(default_factory=lambda: DEFAULT_REPORT_DIR)
    quarantine_path: Path = field(default_factory=lambda: DEFAULT_QUARANTINE_PATH)
    batch_size: int = 50


class MasterMigrationPipeline:
    """Pipeline for migrating 600 master PQR records to Neon PostgreSQL.

    Stages:
        1. Profile — read source data, count records, basic checks
        2. Clean — normalize fields (lowercase states, trim whitespace)
        3. Validate — validate against PQR schema rules
        4. Load — UPSERT to Neon (ON CONFLICT DO NOTHING for idempotency)
        5. Reconcile — compare source count vs destination count
        6. Report — generate post-migration JSON report

    Requirements: 19.1, 19.2, 19.5, 19.6, 19.7
    """

    def __init__(
        self,
        db: DatabaseConnection,
        config: MigrationConfig | None = None,
    ) -> None:
        self._db = db
        self._config = config or MigrationConfig()
        self._batch_id = str(uuid.uuid4())
        self._quarantined: list[QuarantinedRecord] = []

    @property
    def batch_id(self) -> str:
        """Get the current migration batch ID."""
        return self._batch_id

    # ─── Stage 1: Profile ────────────────────────────────────────────

    def profile(self, source_path: Path | None = None) -> pl.DataFrame:
        """Read and profile source data from parquet file.

        Args:
            source_path: Optional override for source file path.

        Returns:
            DataFrame with source records.

        Raises:
            FileNotFoundError: If source file does not exist.
        """
        path = source_path or self._config.source_path
        if not path.exists():
            raise FileNotFoundError(f"Source file not found: {path}")

        df = pl.read_parquet(path)
        logger.info(
            "Profiled source: %d records, %d columns",
            df.height,
            df.width,
        )
        return df

    # ─── Stage 2: Clean ──────────────────────────────────────────────

    def clean(self, df: pl.DataFrame) -> pl.DataFrame:
        """Normalize and clean records.

        Operations:
            - Trim whitespace from string columns
            - Lowercase 'estado' and 'tipo_pqr' fields
            - Strip leading/trailing spaces from 'causa', 'canal_atencion', 'empresa'

        Args:
            df: Raw source DataFrame.

        Returns:
            Cleaned DataFrame.
        """
        # Identify string columns for trimming
        str_cols = [col for col, dtype in zip(df.columns, df.dtypes) if dtype == pl.Utf8]

        # Trim all string columns
        exprs = []
        for col in str_cols:
            exprs.append(pl.col(col).str.strip_chars().alias(col))

        if exprs:
            df = df.with_columns(exprs)

        # Lowercase estado and tipo_pqr if they exist
        lowercase_cols = []
        if "estado" in df.columns:
            lowercase_cols.append(pl.col("estado").str.to_lowercase().alias("estado"))
        if "tipo_pqr" in df.columns:
            lowercase_cols.append(pl.col("tipo_pqr").str.to_lowercase().alias("tipo_pqr"))

        if lowercase_cols:
            df = df.with_columns(lowercase_cols)

        logger.info("Cleaned %d records", df.height)
        return df

    # ─── Stage 3: Validate ───────────────────────────────────────────

    def validate(self, df: pl.DataFrame) -> tuple[pl.DataFrame, list[QuarantinedRecord]]:
        """Validate records against PQR schema rules (REQ-19.2).

        Checks:
            - id_pqr is not null
            - estado is in valid set
            - tipo_pqr is in valid set
            - causa is not null/empty
            - canal_atencion is not null/empty
            - empresa is not null/empty
            - tiempo_gestion_dias >= 0 (if present)

        Args:
            df: Cleaned DataFrame.

        Returns:
            Tuple of (valid_records_df, quarantined_records_list).
        """
        quarantined: list[QuarantinedRecord] = []
        valid_mask = pl.Series("valid", [True] * df.height)

        # Rule: id_pqr must not be null
        if "id_pqr" in df.columns:
            null_ids = df["id_pqr"].is_null()
            for idx in null_ids.arg_true().to_list():
                quarantined.append(QuarantinedRecord(
                    record_id=f"row_{idx}",
                    failed_field="id_pqr",
                    rule_violated="not_null",
                    rejected_value=None,
                ))
            valid_mask = valid_mask & ~null_ids

        # Rule: estado must be in valid set
        if "estado" in df.columns:
            invalid_estado = ~df["estado"].is_in(list(VALID_ESTADOS)) & df["estado"].is_not_null()
            for idx in invalid_estado.arg_true().to_list():
                quarantined.append(QuarantinedRecord(
                    record_id=str(df["id_pqr"][idx]) if "id_pqr" in df.columns else f"row_{idx}",
                    failed_field="estado",
                    rule_violated="isin:cerrado,en_proceso,abierto",
                    rejected_value=str(df["estado"][idx]),
                ))
            # Also check null estado
            null_estado = df["estado"].is_null()
            for idx in null_estado.arg_true().to_list():
                if not df["id_pqr"].is_null()[idx]:  # Only if not already quarantined for null id
                    quarantined.append(QuarantinedRecord(
                        record_id=str(df["id_pqr"][idx]) if "id_pqr" in df.columns else f"row_{idx}",
                        failed_field="estado",
                        rule_violated="not_null",
                        rejected_value=None,
                    ))
            valid_mask = valid_mask & ~invalid_estado & ~null_estado

        # Rule: tipo_pqr must be in valid set
        if "tipo_pqr" in df.columns:
            invalid_tipo = ~df["tipo_pqr"].is_in(list(VALID_TIPOS_PQR)) & df["tipo_pqr"].is_not_null()
            for idx in invalid_tipo.arg_true().to_list():
                quarantined.append(QuarantinedRecord(
                    record_id=str(df["id_pqr"][idx]) if "id_pqr" in df.columns else f"row_{idx}",
                    failed_field="tipo_pqr",
                    rule_violated="isin:peticion,queja,reclamo",
                    rejected_value=str(df["tipo_pqr"][idx]),
                ))
            null_tipo = df["tipo_pqr"].is_null()
            for idx in null_tipo.arg_true().to_list():
                if valid_mask[idx]:  # Only if not already invalid
                    quarantined.append(QuarantinedRecord(
                        record_id=str(df["id_pqr"][idx]) if "id_pqr" in df.columns else f"row_{idx}",
                        failed_field="tipo_pqr",
                        rule_violated="not_null",
                        rejected_value=None,
                    ))
            valid_mask = valid_mask & ~invalid_tipo & ~null_tipo

        # Rule: causa must not be null/empty
        if "causa" in df.columns:
            empty_causa = df["causa"].is_null() | (df["causa"].str.len_chars() == 0)
            for idx in empty_causa.arg_true().to_list():
                if valid_mask[idx]:
                    quarantined.append(QuarantinedRecord(
                        record_id=str(df["id_pqr"][idx]) if "id_pqr" in df.columns else f"row_{idx}",
                        failed_field="causa",
                        rule_violated="not_null_or_empty",
                        rejected_value=str(df["causa"][idx]) if df["causa"][idx] is not None else None,
                    ))
            valid_mask = valid_mask & ~empty_causa

        # Rule: canal_atencion must not be null/empty
        if "canal_atencion" in df.columns:
            empty_canal = df["canal_atencion"].is_null() | (df["canal_atencion"].str.len_chars() == 0)
            for idx in empty_canal.arg_true().to_list():
                if valid_mask[idx]:
                    quarantined.append(QuarantinedRecord(
                        record_id=str(df["id_pqr"][idx]) if "id_pqr" in df.columns else f"row_{idx}",
                        failed_field="canal_atencion",
                        rule_violated="not_null_or_empty",
                        rejected_value=str(df["canal_atencion"][idx]) if df["canal_atencion"][idx] is not None else None,
                    ))
            valid_mask = valid_mask & ~empty_canal

        # Rule: empresa must not be null/empty
        if "empresa" in df.columns:
            empty_empresa = df["empresa"].is_null() | (df["empresa"].str.len_chars() == 0)
            for idx in empty_empresa.arg_true().to_list():
                if valid_mask[idx]:
                    quarantined.append(QuarantinedRecord(
                        record_id=str(df["id_pqr"][idx]) if "id_pqr" in df.columns else f"row_{idx}",
                        failed_field="empresa",
                        rule_violated="not_null_or_empty",
                        rejected_value=str(df["empresa"][idx]) if df["empresa"][idx] is not None else None,
                    ))
            valid_mask = valid_mask & ~empty_empresa

        # Rule: tiempo_gestion_dias >= 0 (if present and not null)
        if "tiempo_gestion_dias" in df.columns:
            non_null_tiempo = df["tiempo_gestion_dias"].is_not_null()
            negative_tiempo = non_null_tiempo & (df["tiempo_gestion_dias"] < 0)
            for idx in negative_tiempo.arg_true().to_list():
                if valid_mask[idx]:
                    quarantined.append(QuarantinedRecord(
                        record_id=str(df["id_pqr"][idx]) if "id_pqr" in df.columns else f"row_{idx}",
                        failed_field="tiempo_gestion_dias",
                        rule_violated="ge:0",
                        rejected_value=float(df["tiempo_gestion_dias"][idx]),
                    ))
            valid_mask = valid_mask & ~negative_tiempo

        valid_df = df.filter(valid_mask)
        self._quarantined.extend(quarantined)

        logger.info(
            "Validation: %d valid, %d quarantined",
            valid_df.height,
            len(quarantined),
        )
        return valid_df, quarantined

    # ─── Stage 4: Load ───────────────────────────────────────────────

    @retry_policy(max_retries=3, base_delay=2.0, max_delay=30.0, jitter=0.5)
    def _load_batch(self, records: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """Load a batch of records with retry for transient DB errors.

        Uses UPSERT (ON CONFLICT DO NOTHING) for strict idempotency (REQ-19.7).

        Args:
            records: List of record dicts to upsert.

        Returns:
            List of result dicts with status per record.
        """
        return self._db.execute_upsert(records)

    def load(self, df: pl.DataFrame) -> tuple[int, int, list[dict[str, Any]]]:
        """Load validated records to Neon PostgreSQL via UPSERT.

        Processes records in batches for efficiency.
        Uses ON CONFLICT DO NOTHING for idempotency (REQ-19.7).

        If a connection failure persists after all retries are exhausted (REQ-19.4),
        the pipeline aborts immediately, preserving any data already committed
        by previous batches (UPSERT ensures no corruption).

        Args:
            df: Validated DataFrame to load.

        Returns:
            Tuple of (success_count, failed_count, failed_details).

        Raises:
            MigrationAbortError: If all retries exhausted on a connection failure.
        """
        success_count = 0
        failed_count = 0
        failed_details: list[dict[str, Any]] = []

        records = df.to_dicts()

        # Process in batches
        batch_size = self._config.batch_size
        for i in range(0, len(records), batch_size):
            batch = records[i: i + batch_size]
            try:
                results = self._load_batch(batch)
                for result in results:
                    if result.get("status") == "migrated":
                        success_count += 1
                    else:
                        failed_count += 1
                        failed_details.append(result)
            except (ConnectionError, TimeoutError, OSError) as e:
                # All retries exhausted — abort pipeline to preserve existing data (REQ-19.4)
                logger.error(
                    "Batch load failed after retries, aborting migration to preserve data: %s",
                    str(e),
                )
                remaining_records = len(records) - i
                raise MigrationAbortError(
                    reason=f"Connection failed after all retries: {str(e)}",
                    records_loaded=success_count,
                    records_remaining=remaining_records,
                ) from e

        logger.info("Load complete: %d migrated, %d failed", success_count, failed_count)
        return success_count, failed_count, failed_details

    # ─── Stage 5: Reconcile ──────────────────────────────────────────

    def reconcile(self, source_count: int, success_count: int) -> dict[str, Any]:
        """Reconcile source vs destination counts.

        Args:
            source_count: Total records in source.
            success_count: Records successfully loaded.

        Returns:
            Reconciliation result dict.
        """
        reconciliation = {
            "source_count": source_count,
            "loaded_count": success_count,
            "quarantined_count": len(self._quarantined),
            "match": source_count == (success_count + len(self._quarantined)),
        }
        logger.info("Reconciliation: %s", reconciliation)
        return reconciliation

    # ─── Stage 6: Report ─────────────────────────────────────────────

    def generate_report(
        self,
        total_records: int,
        success_count: int,
        failed_count: int,
        duration_seconds: float,
        started_at: str,
        completed_at: str,
    ) -> MigrationReport:
        """Generate post-migration report (REQ-19.5).

        Args:
            total_records: Total source records.
            success_count: Successfully migrated count.
            failed_count: Failed records count.
            duration_seconds: Total pipeline duration.
            started_at: ISO timestamp of start.
            completed_at: ISO timestamp of completion.

        Returns:
            MigrationReport instance.
        """
        success_rate = (success_count / total_records * 100) if total_records > 0 else 0.0
        status = "completed" if success_rate >= MIN_SUCCESS_RATE else "failed"

        quarantined_dicts = [
            {
                "record_id": q.record_id,
                "failed_field": q.failed_field,
                "rule_violated": q.rule_violated,
                "rejected_value": q.rejected_value,
                "quarantine_timestamp": q.quarantine_timestamp,
            }
            for q in self._quarantined
        ]

        report = MigrationReport(
            batch_id=self._batch_id,
            total_records=total_records,
            success_count=success_count,
            failed_count=failed_count,
            quarantined_count=len(self._quarantined),
            success_rate=round(success_rate, 2),
            duration_seconds=round(duration_seconds, 2),
            started_at=started_at,
            completed_at=completed_at,
            status=status,
            quarantined_records=quarantined_dicts,
        )
        return report

    def save_report(self, report: MigrationReport) -> Path:
        """Save report JSON to configured report directory.

        Saves to `data/reports/migration_report.json` as specified.

        Args:
            report: MigrationReport to save.

        Returns:
            Path to the saved report file.
        """
        self._config.report_dir.mkdir(parents=True, exist_ok=True)
        report_path = self._config.report_dir / "migration_report.json"
        report_path.write_text(
            json.dumps(report.to_dict(), indent=2, default=str),
            encoding="utf-8",
        )
        logger.info("Report saved: %s", report_path)
        return report_path

    def save_quarantine(self) -> Path | None:
        """Save quarantined records to parquet file.

        Returns:
            Path to quarantine file, or None if no quarantined records.
        """
        if not self._quarantined:
            return None

        quarantine_data = [
            {
                "record_id": q.record_id,
                "failed_field": q.failed_field,
                "rule_violated": q.rule_violated,
                "rejected_value": str(q.rejected_value) if q.rejected_value is not None else None,
                "quarantine_timestamp": q.quarantine_timestamp,
            }
            for q in self._quarantined
        ]

        quarantine_df = pl.DataFrame(quarantine_data)
        self._config.quarantine_path.parent.mkdir(parents=True, exist_ok=True)
        quarantine_df.write_parquet(self._config.quarantine_path)
        logger.info("Quarantine saved: %d records to %s", len(self._quarantined), self._config.quarantine_path)
        return self._config.quarantine_path

    # ─── Full Pipeline ───────────────────────────────────────────────

    def run(self, source_path: Path | None = None) -> MigrationReport:
        """Execute the full migration pipeline end-to-end.

        Stages: profile → clean → validate → load → reconcile → report

        If the database connection fails after all retries are exhausted,
        the pipeline aborts gracefully: existing data is preserved (no corruption),
        quarantined records are saved, and an abort report is generated (REQ-19.4).

        Args:
            source_path: Optional override for source file path.

        Returns:
            MigrationReport with results.

        Raises:
            FileNotFoundError: If source file does not exist.
        """
        started_at = datetime.now(timezone.utc).isoformat()
        start_time = time.time()

        logger.info("Starting master migration pipeline (batch: %s)", self._batch_id)

        # Stage 1: Profile
        df = self.profile(source_path)
        total_records = df.height

        # Stage 2: Clean
        df = self.clean(df)

        # Stage 3: Validate
        valid_df, quarantined = self.validate(df)

        # Stage 4: Load (may abort on connection failure)
        try:
            success_count, failed_count, _ = self.load(valid_df)
        except MigrationAbortError as e:
            # Pipeline aborted — preserve existing data, save quarantine, generate abort report
            logger.error("Migration pipeline aborted: %s", str(e))
            end_time = time.time()
            completed_at = datetime.now(timezone.utc).isoformat()
            duration_seconds = end_time - start_time

            report = self.generate_report(
                total_records=total_records,
                success_count=e.records_loaded,
                failed_count=(total_records - e.records_loaded),
                duration_seconds=duration_seconds,
                started_at=started_at,
                completed_at=completed_at,
            )
            report.status = "aborted"

            # Save artifacts even on abort
            self.save_report(report)
            self.save_quarantine()

            logger.warning(
                "Migration aborted: %d/%d loaded before failure. Existing data preserved.",
                e.records_loaded,
                total_records,
            )
            return report

        # Stage 5: Reconcile
        reconciliation = self.reconcile(total_records, success_count)

        # Stage 6: Report
        end_time = time.time()
        completed_at = datetime.now(timezone.utc).isoformat()
        duration_seconds = end_time - start_time

        report = self.generate_report(
            total_records=total_records,
            success_count=success_count,
            failed_count=failed_count + len(quarantined),
            duration_seconds=duration_seconds,
            started_at=started_at,
            completed_at=completed_at,
        )
        report.reconciliation_status = reconciliation

        # Save artifacts
        self.save_report(report)
        self.save_quarantine()

        logger.info(
            "Migration complete: %d/%d (%.1f%%) — %s",
            success_count,
            total_records,
            report.success_rate,
            report.status,
        )

        return report
