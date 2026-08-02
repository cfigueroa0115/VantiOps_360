# Data Treatment Policy

> This document fulfills Requirement 13.6 of the PQR Analytics Engine specification.

## 1. Data Sources

| Source | Format | Description |
|--------|--------|-------------|
| `Entrada_PQRs.xlsx` | Microsoft Excel (.xlsx) | Primary dataset containing ~51,008 PQR (Peticiones, Quejas y Reclamos) records from natural gas utility operations. Includes customer complaint details, management times, causes, channels, and resolution status. |
| Future sources | CSV, JSON, XML, Parquet, REST API, SAP | Planned multi-source ingestion per the DataSourceAdapter protocol. Each new source must pass through the same data treatment pipeline. |

## 2. Retention Policy

| Data Layer | Retention Period | Justification |
|------------|-----------------|---------------|
| **Raw** (`data/raw/`) | Indefinite | Immutable source of truth. Never modified or deleted. Not tracked in version control. |
| **Staging** (`data/staging/`) | 30 days rolling | Intermediate processing artefacts. Regenerable from raw layer. Auto-purged by pipeline. |
| **Validated** (`data/validated/`) | 90 days rolling | Records that passed quality gates. Retained for audit and reprocessing needs. |
| **Curated** (`data/curated/`) | Indefinite | Final analytical layer in Parquet format. Base for all statistical models and API consumption. |
| **Serving** (`data/serving/`) | Per-run refresh | Pre-aggregated metrics refreshed on each pipeline execution. Previous run overwritten. |

## 3. Access Controls

| Data Layer | Access Level | Allowed Consumers |
|------------|-------------|-------------------|
| **Raw** | Pipeline-only | Ingestion module (automated). No direct human access in production. |
| **Staging** | Pipeline-only | Profiling and validation modules (automated). |
| **Validated** | Pipeline + Audit | Quality report generator and audit processes. |
| **Curated** | API + Analytics | Statistical engine, risk model, RCA module, FastAPI endpoints. |
| **Serving** | Public API | Executive Dashboard frontend. All data pre-aggregated (min group size ≥ 5). |

**Principle:** The frontend never receives row-level data. All API responses represent aggregated metrics over groups of at least 5 records.

## 4. Anonymization Methods

### 4.1 PII Masking

Fields identified as potentially containing personal information (names, phone numbers, addresses, identification numbers) are detected by matching column names against a configurable list of PII field patterns.

**Masking strategy:**
- String values with 3+ characters: replace interior characters with asterisks, preserving first and last character (e.g., `"Carlos"` → `"C****s"`).
- String values with fewer than 3 characters: full SHA-256 hash replacement.
- Numeric identifiers: SHA-256 hash of the full value.

### 4.2 Aggregation Threshold

All metrics exposed through the API enforce a **minimum group size of 5 records**. Any aggregation that would represent fewer than 5 individual records is suppressed or merged into an "Other" category.

### 4.3 Failure Handling

If masking or anonymization of a PII field fails during processing, the affected record is:
1. Quarantined in a separate error table.
2. Logged with the field name and failure reason.
3. Excluded from any export or visualization output.

## 5. Applicable Regulations

### Ley 1581 de 2012 – Régimen General de Protección de Datos Personales (Colombia)

This system processes data subject to Colombian personal data protection law (Ley 1581 de 2012 and its regulatory decree 1377 de 2013). Key compliance measures:

| Principle | Implementation |
|-----------|----------------|
| **Finalidad** (Purpose limitation) | Data is processed exclusively for operational analytics and process improvement of PQR management. |
| **Libertad** (Consent) | Source data originates from formal PQR filings. No additional personal data is collected. |
| **Veracidad** (Accuracy) | Quality gates validate data accuracy; deviations are documented in quality reports. |
| **Transparencia** (Transparency) | This document and the quality reports disclose all processing activities. |
| **Acceso y circulación restringida** (Access restriction) | Layer-based access controls ensure data is available only to authorized pipeline stages. |
| **Seguridad** (Security) | Raw data excluded from version control; secrets loaded from environment variables only; PII masked before export. |
| **Confidencialidad** (Confidentiality) | Minimum group-size aggregation prevents re-identification; no individual records reach the frontend. |

### Additional Considerations

- **Ley 1712 de 2014** (Transparency and Access to Public Information): Aggregated, non-personal metrics may be disclosed per transparency obligations.
- **Circular Externa 005 de 2017** (SIC): Security incident procedures apply if a breach of personal data is detected.

---

*Last updated: 2024-12-20*
*Document owner: PQR Analytics Engine development team*
