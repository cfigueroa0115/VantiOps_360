"""Ingestion module: protocols and adapters for multi-source data ingestion."""

from ingestion.excel_adapter import ExcelIngestionAdapter, IntegrityReport
from ingestion.protocols import DataSourceAdapter, ValidationResult, ValidationStatus

__all__ = [
    "DataSourceAdapter",
    "ExcelIngestionAdapter",
    "IntegrityReport",
    "ValidationResult",
    "ValidationStatus",
]
