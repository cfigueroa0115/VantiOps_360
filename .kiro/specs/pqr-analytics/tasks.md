# Implementation Plan: PQR Analytics Engine

## Overview

This plan implements a multi-stage data analytics pipeline for PQR (Peticiones, Quejas y Reclamos) records. The backend is Python-based (Polars, DuckDB, FastAPI, scikit-learn) and the frontend is a Next.js executive dashboard with TypeScript and Tailwind CSS. Tasks are ordered to build foundational layers first, then progressively add analysis, modeling, API, and visualization capabilities.

## Tasks

- [x] 1. Set up project structure, dependencies, and core interfaces
  - [x] 1.1 Create Python backend project structure and dependency manifest
    - Create directory structure: `backend/src/{ingestion,profiling,quality,statistics,risk,rca,pipeline,api}`, `backend/tests/{property,unit,integration}`, `data/{raw,staging,validated,curated,serving}`
    - Create `pyproject.toml` with pinned versions: polars, duckdb, pyarrow, pandera, scipy, scikit-learn, plotly, fastapi, uvicorn, hypothesis, pytest
    - Create `.gitignore` entry for `data/raw/` folder
    - Create `DATA_TREATMENT.md` with data sources, retention policy, access controls, anonymization methods, and applicable regulations
    - _Requirements: 12.2, 13.1, 13.4, 13.6, 14.11_

  - [x] 1.2 Create Next.js frontend project structure and dependencies
    - Initialize Next.js app with TypeScript and Tailwind CSS in `frontend/` directory
    - Install shadcn/ui components, add pinned dependency versions in `package.json`
    - Create directory structure matching design: `app/`, `components/{kpi,charts,filters,layout,shared}`, `hooks/`, `lib/`, `styles/`
    - _Requirements: 14.8, 14.11_

  - [x] 1.3 Define core Python interfaces, protocols, and data models
    - Implement `DataSourceAdapter` protocol with methods: `detect`, `read`, `metadata`, `validate`, `close`
    - Define all dataclass models: `ColumnQualityMetric`, `DatasetMetrics`, `QualityScore`, `QualityReport`, `IngestionBatch`, `SchemaCatalogEntry`
    - Define Pandera schema contract `PQRSchema` for the curated layer
    - Define enums: `SeverityLevel`, result types
    - _Requirements: 12.4, 12.6, 14.4_

  - [x] 1.4 Define TypeScript interfaces and API client
    - Create `lib/types.ts` with interfaces: `KPIData`, `FilterParams`, `ChartDataResponse`, `FilterOptions`, `Finding`, `Severity`
    - Create `lib/api-client.ts` with typed fetch functions, retry logic, and error handling
    - Create `lib/utils.ts` with formatting helpers (days with 1 decimal, percentages with 1 decimal)
    - _Requirements: 5.1, 5.6, 14.8_

- [x] 2. Implement data ingestion module
  - [x] 2.1 Implement ExcelIngestionAdapter
    - Implement `read()` to load all sheets from XLSX using Polars
    - Implement `standardize_columns()` for snake_case conversion: strip whitespace, lowercase, replace spaces/special chars with underscores, remove leading/trailing/consecutive underscores
    - Implement `verify_integrity()` to confirm zero record/column loss
    - Handle error cases: missing file (descriptive error within 5s), empty sheets (log warning, skip)
    - Handle multiple sheets with differing structures independently
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7_

  - [ ]* 2.2 Write property test for snake_case standardization
    - **Property 1: snake_case Standardization**
    - **Validates: Requirements 1.2**

  - [ ]* 2.3 Write property test for record and column count preservation
    - **Property 2: Record and Column Count Preservation**
    - **Validates: Requirements 1.3**

  - [ ]* 2.4 Write unit tests for ingestion error handling
    - Test missing file raises descriptive error within 5s
    - Test empty sheet logs warning and skips
    - Test multiple sheets with different structures processed independently
    - _Requirements: 1.4, 1.5, 1.7_

- [x] 3. Implement data profiler
  - [x] 3.1 Implement type inference and schema detection
    - Implement `infer_types()` with 80% threshold for type classification
    - Classify columns: categorical (<50 distinct values), text (≥50 distinct), numeric, datetime, boolean, mixed
    - Report percentage breakdown for mixed-type columns
    - _Requirements: 2.1, 2.7_

  - [x] 3.2 Implement outlier detection, null stats, and duplicate detection
    - Implement `detect_outliers_iqr()` with Q1-1.5×IQR to Q3+1.5×IQR bounds
    - Implement `calculate_null_stats()` returning null count and percentage per column
    - Implement `find_duplicates()` by PQR identifier column
    - _Requirements: 2.3, 2.4, 2.5_

  - [x] 3.3 Implement date validation and semantic similarity detection
    - Implement `validate_dates()` against recognized date formats, report invalid count/percentage
    - Implement `find_semantic_similarities()` using Levenshtein ratio with 0.85 threshold
    - _Requirements: 2.2, 2.6_

  - [ ]* 3.4 Write property tests for data profiler
    - **Property 3: Data Type Inference Threshold**
    - **Property 4: IQR Outlier Detection Correctness**
    - **Property 5: Null Statistics Accuracy**
    - **Property 6: Duplicate Detection Correctness**
    - **Property 7: Semantic Similarity Grouping Threshold**
    - **Validates: Requirements 2.1, 2.3, 2.4, 2.5, 2.6, 2.7**

- [x] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement quality report generator
  - [x] 5.1 Implement quality report generation and export
    - Implement `generate_report()` producing column-level metrics: name, type, null count/pct, unique count, outlier count, invalid date count, similarity groups
    - Implement `export_json()` and `export_parquet()` with metadata header (timestamp, record count, schema version)
    - Calculate dataset-level metrics: total records, total columns, completeness %, validity %, duplication rate
    - Ensure no row-level data in exports (aggregated metrics only, min group size ≥5)
    - Handle partial failures: generate report for successful columns, include errors section
    - Return error when zero columns profiled successfully
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.6, 3.8_

  - [x] 5.2 Implement severity classification and flagging
    - Implement `flag_severity()`: >20% null → high, 5-20% → medium, <5% → low
    - Implement quality rule violation severity: >20% → critical, >10-20% → high, >5-10% → medium, ≤5% → low
    - _Requirements: 3.5, 3.7_

  - [ ]* 5.3 Write property tests for quality report
    - **Property 8: Quality Report Serialization Round-Trip**
    - **Property 9: Severity Classification Thresholds**
    - **Property 10: Privacy Invariant — No Row-Level Data in Exports**
    - **Validates: Requirements 3.2, 3.4, 3.5, 3.7**

- [x] 6. Implement Data Quality Score computation
  - [x] 6.1 Implement six quality dimensions and composite score
    - Implement completeness: ratio of non-null to total expected values per field (25% weight)
    - Implement validity: conformance to Pandera schema rules (20% weight)
    - Implement consistency: detect contradictions (cerrado + null fecha_cierre, accede + 0 days, fecha_cierre < fecha_creacion) (20% weight)
    - Implement uniqueness: duplicate rate on PQR identifier (15% weight)
    - Implement timeliness: flag dates before 2020-01-01 or after current date (10% weight)
    - Implement referential integrity: verify categorical values against domain catalogs (10% weight)
    - Compute weighted composite score in [0, 100]
    - Produce detail table: rule name, target field, violations count/pct, severity, corrective action
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 10.9_

  - [ ]* 6.2 Write property tests for Data Quality Score
    - **Property 12: Data Quality Score Computation**
    - **Property 20: Consistency Contradiction Detection**
    - **Property 21: Timeliness Date Range Validation**
    - **Property 22: Referential Integrity Catalog Check**
    - **Validates: Requirements 10.1, 10.3, 10.6, 10.8, 10.9**

- [x] 7. Implement statistical engine
  - [x] 7.1 Implement descriptive statistics and conditional probabilities
    - Implement `descriptive_stats()`: mean, median, mode, variance, std, Q1, Q2, Q3, P90, P95, IQR rounded to 2 decimal places
    - Implement `conditional_probability()` with null exclusion for conditioning variable
    - Flag groups with n<30 as low confidence with sample size
    - Calculate: P(time > P90 | cause), P(no_accede | channel), P(in_process | cause), P(time > P90 | company), P(quality_incomplete | unit)
    - Implement outlier detection for Management_Time using IQR method
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.9_

  - [x] 7.2 Implement Pareto analysis, confidence intervals, and statistical tests
    - Implement `pareto_analysis()`: minimum set of categories ≥80% volume, descending frequency
    - Implement `wilson_confidence_interval()` for proportion estimates at 95% confidence
    - Implement `chi_square_test()` for >2 groups comparison
    - Implement `two_proportion_z_test()` for exactly 2 groups
    - Ensure all finding labels use "association"/"correlation", never "causes"/"leads to"/"results in"
    - _Requirements: 8.5, 8.6, 8.7, 8.8_

  - [ ]* 7.3 Write property tests for statistical engine
    - **Property 14: Conditional Probability with Null Exclusion**
    - **Property 15: Pareto Minimum Set ≥ 80%**
    - **Property 16: Wilson Confidence Interval Correctness**
    - **Property 17: Statistical Finding Labeling**
    - **Validates: Requirements 8.1, 8.2, 8.5, 8.6, 8.7, 8.9**

- [x] 8. Implement explainable risk model
  - [x] 8.1 Implement risk model training and evaluation
    - Implement `prepare_features()`: select only creation-time features, exclude leakage fields (closure date, result, management time, closure reason)
    - Implement `train()`: logistic regression or decision tree (max_depth=4) with stratified split (75/25), fixed random seed=42
    - Implement `check_class_imbalance()`: if minority < 20%, apply class_weight="balanced"
    - Implement `evaluate()`: precision, recall, F1, ROC-AUC, confusion matrix on test set
    - Implement `feature_importance()`: coefficients or feature_importances_ ranked
    - Label all outputs as "analytical demonstration — not a production-grade model"
    - Document limitation if ROC-AUC < 0.60
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 9.9, 9.10_

  - [ ]* 8.2 Write property tests for risk model
    - **Property 18: Stratified Split Reproducibility**
    - **Property 19: Class Imbalance Detection and Handling**
    - **Validates: Requirements 9.2, 9.9**

- [x] 9. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 10. Implement root cause analyzer
  - [x] 10.1 Implement main cause identification and Pareto analysis
    - Implement `identify_main_cause()`: confirm highest volume cause ≥45% share via Pareto ranking
    - Implement `pareto_chart_data()`: ranked cause table with cumulative percentages
    - Produce structured summary: volume, percentage, temporal trend, channels, time stats, result distribution, related causes, operational impact
    - _Requirements: 11.1, 11.2_

  - [x] 10.2 Implement RCA methodologies (SIPOC, 5 Whys, Ishikawa, Lean, FMEA)
    - Implement `sipoc()`: Suppliers, Inputs, Process steps, Outputs, Customers
    - Implement `five_whys()`: minimum 5 levels of causal depth
    - Implement `ishikawa()`: People, Process, Technology, Information, Environment categories
    - Implement Lean waste identification mapped to 8 Lean wastes
    - Implement `fmea()`: Severity(1-5), Occurrence(1-5), Detection(1-5), compute RPN
    - _Requirements: 11.3_

  - [x] 10.3 Implement BPMN diagrams and automation assessment
    - Implement `generate_bpmn_as_is()`: Mermaid BPMN 2.0 with start/end events, decision gateways, risk points
    - Implement `generate_bpmn_to_be()`: Mermaid BPMN 2.0 with full improved process activities
    - Define process controls: mandatory fields, catalogs, validations, idempotency, timers, alerts, escalation, traceability, segregation of duties
    - Implement `automation_opportunity()`: % eliminable manual interventions, time reduction, STP volume
    - _Requirements: 11.4, 11.5, 11.6, 11.7_

  - [ ]* 10.4 Write property test for FMEA RPN computation
    - **Property 23: FMEA Risk Priority Number Computation**
    - **Validates: Requirements 11.3**

- [x] 11. Implement pipeline orchestrator and data protection
  - [x] 11.1 Implement pipeline orchestration with idempotency and retry
    - Implement `run()`: full pipeline execution ingest → profile → validate → enrich → serve
    - Implement `compute_file_hash()`: SHA-256 for idempotent processing
    - Implement `is_already_processed()`: check control table for existing hash
    - Implement `retry_with_backoff()`: base 2s, max 3 retries, max 30s wait
    - Implement `quarantine_record()`: isolate failed records with rule ID and timestamp
    - Implement `update_control_table()`: track timestamp, hash, counts, duration
    - Store curated data in Parquet with snappy compression
    - _Requirements: 12.5, 12.7, 12.8, 12.9, 12.10_

  - [x] 11.2 Implement PII detection and masking
    - Implement configurable PII field pattern matching (names, phones, addresses, IDs)
    - Implement masking: preserve first/last characters, replace middle with asterisks (length ≥3), SHA-256 hash for length <3
    - Quarantine records where masking fails, log error, exclude from output
    - _Requirements: 13.5, 13.7, 13.8_

  - [x] 11.3 Implement synthetic demo dataset generator
    - Generate ≥1,000 synthetic records preserving category frequency distributions within ±10% relative error
    - Preserve numeric field means within ±10% relative error
    - Ensure no real customer information in output
    - _Requirements: 13.3_

  - [ ]* 11.4 Write property tests for PII masking and synthetic data
    - **Property 24: PII Masking Transformation**
    - **Property 25: Synthetic Data Distribution Fidelity**
    - **Validates: Requirements 13.3, 13.5, 13.7**

- [x] 12. Implement FastAPI REST endpoints
  - [x] 12.1 Implement API routes and response models
    - Create Pydantic response models: `KPIResponse`, `FilterOptionsResponse`, `ChartDataResponse`, `QualityReportResponse`, `RiskModelResponse`, `RCAResponse`
    - Implement `GET /api/kpis` with filter params returning pre-aggregated KPI values
    - Implement `GET /api/charts/{chart_type}` returning chart data per visualization type
    - Implement `GET /api/filters/options` returning available filter values from dataset
    - Implement `GET /api/quality/report` returning aggregated quality metrics
    - Implement `GET /api/risk/model` returning model metrics, feature importance, predictions summary
    - Implement `GET /api/rca/findings` returning root cause analysis findings and diagrams
    - Ensure all responses contain only aggregated data (min group size ≥5)
    - Use DuckDB for aggregation queries on curated Parquet files
    - _Requirements: 5.4, 12.1, 13.2, 14.2_

  - [ ]* 12.2 Write unit tests for API endpoints
    - Test each endpoint returns correct response model structure
    - Test filter parameter application
    - Test privacy invariant (no row-level data in responses)
    - _Requirements: 5.4, 13.2_

- [ ] 13. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 14. Implement frontend KPI components
  - [ ] 14.1 Implement KPI cards and grid layout
    - Create `KPICard.tsx`: display individual KPI with value, label, and formatting (days with 1 decimal + " días", percentages with 1 decimal + "%")
    - Create `KPIGrid.tsx`: responsive grid layout for all 13 KPI cards
    - Create `KPILoadingSkeleton.tsx`: loading state with skeleton animations
    - Implement error state with retry button on failed API calls
    - Create `useKPIs.ts` hook for data fetching with caching
    - _Requirements: 5.1, 5.2, 5.6, 5.7_

  - [ ]* 14.2 Write property test for KPI value formatting
    - **Property 11: KPI Value Formatting**
    - **Validates: Requirements 5.1**

  - [ ]* 14.3 Write unit tests for KPI components
    - Test loading, error, and populated states render correctly
    - Test KPI value formatting (days, percentages)
    - Test retry button functionality
    - _Requirements: 5.1, 5.6, 5.7_

- [ ] 15. Implement frontend filter system
  - [ ] 15.1 Implement filter panel and controls
    - Create `FilterPanel.tsx`: collapsible sidebar with all filter controls
    - Create `DateRangePicker.tsx`: period filter with date range selection
    - Create `MultiSelect.tsx`: reusable multi-select dropdown for company, cause, channel, status, result, responsible unit
    - Create `RangeSlider.tsx`: numeric range slider for management time (0 to dataset max)
    - Create `ActiveFilters.tsx`: active filter pills display with "Clear All" button
    - Create `useFilters.ts` hook: filter state management with AND logic, session persistence
    - Create `useFilterOptions.ts` hook: fetch available filter values from backend API
    - Display active filter count and record count matching current filters
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8_

  - [ ]* 15.2 Write property test for filter AND logic
    - **Property 13: Filter AND Logic**
    - **Validates: Requirements 7.2**

  - [ ]* 15.3 Write unit tests for filter components
    - Test multi-select selection/deselection
    - Test date range picker validation
    - Test active filter display and clear functionality
    - Test session persistence of filter state
    - _Requirements: 7.1, 7.3, 7.4, 7.6_

- [ ] 16. Implement frontend chart components
  - [ ] 16.1 Implement primary chart components
    - Create `ParetoChart.tsx`: causes by frequency with cumulative line on secondary y-axis
    - Create `TopCausesBar.tsx`: top 10 horizontal bar ranked by count descending
    - Create `CancellationDonut.tsx`: main cancellation cause vs all others
    - Create `DistributionBar.tsx`: bar charts by company, channel, result sorted by frequency
    - Create `TemporalTrend.tsx`: line chart with monthly/weekly toggle, default monthly
    - Create `ChartWrapper.tsx`: loading/error/empty state wrapper for all charts
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.15_

  - [ ] 16.2 Implement secondary chart components
    - Create `ManagementTimeBox.tsx`: box plot for top 10 causes (median, Q1, Q3, 1.5×IQR whiskers)
    - Create `OverallBoxPlot.tsx`: overall management time distribution with outlier points
    - Create `P90ByCauseBar.tsx`: P90 by cause bar chart, top 10 descending
    - Create `CauseChannelHeatmap.tsx`: cause × channel heatmap with color intensity by count
    - Create `OpenCasesHistogram.tsx`: age distribution histogram (7-day buckets: 0-7, 8-14, 15-21, 22-28, 29-60, 61+)
    - Create `QualityByFieldBar.tsx`: stacked completeness bar per column
    - Create `AnomalyMatrix.tsx`: deviation heatmap (>2σ highlighting)
    - Create `FindingsTable.tsx`: executive findings table (≤10 rows with description, metric, severity, action)
    - _Requirements: 6.6, 6.7, 6.8, 6.9, 6.10, 6.11, 6.12, 6.13_

  - [ ] 16.3 Implement chart interactions and accessibility
    - Add tooltips on hover showing exact value, percentage of total, category label (within 200ms)
    - Add empty state placeholders when filter results in no data
    - Add `aria-label` or descriptive captions for each chart summarizing type, data, and key finding
    - Create `useChartData.ts` hook for chart data fetching with filter params
    - _Requirements: 6.14, 6.15, 6.16_

  - [ ]* 16.4 Write unit tests for chart components
    - Test chart rendering with sample data
    - Test empty state display
    - Test tooltip content
    - Test accessibility labels
    - _Requirements: 6.14, 6.15, 6.16_

- [ ] 17. Implement layout, navigation, and data quality dashboard section
  - [ ] 17.1 Implement layout components and page assembly
    - Create `Sidebar.tsx`: navigation between dashboard sections
    - Create `Header.tsx`: page header with title and active filters summary
    - Create `ErrorBoundary.tsx`: catch chart render failures, show fallback
    - Create root `layout.tsx` and main `page.tsx` assembling KPIs, charts, and filters
    - Wire `useKPIs`, `useChartData`, and `useFilters` hooks into page components
    - Implement Data Quality Score display as composite percentage from 6 dimensions
    - _Requirements: 5.2, 5.3, 5.5, 14.8_

  - [ ]* 17.2 Write unit tests for layout and error boundary
    - Test ErrorBoundary catches chart failures and shows fallback
    - Test page renders with loading, error, and populated states
    - _Requirements: 5.6, 5.7_

- [ ] 18. Implement validation reference points
  - [ ] 18.1 Implement reference point verification logic
    - Verify total record count ≈51,008 (±1% tolerance)
    - Verify total column count ≈29 (±2 columns tolerance)
    - Verify duplication rate <1%, flag if exceeded
    - Verify main cause ≈50% share (±5 pp), report cause name and exact percentage
    - Verify management time: mean ≈6.32d (±0.5), median ≈7d (±1), P90 ≈10d (±1)
    - Verify phone+verbal channels >60% combined share
    - Define and report quality issues per field (null closure reason, invalid marking, inconsistent company names, duplicated categories)
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_

  - [ ]* 18.2 Write unit tests for validation reference points
    - Test tolerance checks with known values
    - Test deviation reporting when values fall outside tolerance
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [ ] 19. Integration wiring and end-to-end validation
  - [ ] 19.1 Wire full pipeline and integrate frontend with backend API
    - Connect pipeline orchestrator to run full flow: Excel → Raw → Staging → Validated → Curated → Serving
    - Verify DuckDB queries on curated Parquet produce correct aggregated API responses
    - Connect frontend API client to backend endpoints
    - Verify filter application flows: frontend → API → DuckDB → filtered response → dashboard update
    - Ensure performance targets: page load <3s, filter refresh <2s
    - _Requirements: 5.2, 5.3, 7.2, 12.1, 12.2_

  - [ ]* 19.2 Write integration tests
    - Test full pipeline execution from Excel to curated layer
    - Test API endpoints with real aggregated data
    - Test filter pipeline end-to-end
    - _Requirements: 5.2, 7.2, 12.1_

- [ ] 20. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document (25 properties total)
- Unit tests validate specific examples, edge cases, and error handling paths
- The backend uses Python with Polars, DuckDB, FastAPI, Pandera, scipy, and scikit-learn
- The frontend uses Next.js with TypeScript, Tailwind CSS, and shadcn/ui
- All API responses must contain only aggregated data (min group size ≥5) to protect privacy
- The risk model is labeled as an "analytical demonstration" and is not production-grade

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["1.3", "1.4"] },
    { "id": 2, "tasks": ["2.1"] },
    { "id": 3, "tasks": ["2.2", "2.3", "2.4", "3.1"] },
    { "id": 4, "tasks": ["3.2", "3.3"] },
    { "id": 5, "tasks": ["3.4", "5.1"] },
    { "id": 6, "tasks": ["5.2", "5.3", "6.1"] },
    { "id": 7, "tasks": ["6.2", "7.1"] },
    { "id": 8, "tasks": ["7.2", "8.1"] },
    { "id": 9, "tasks": ["7.3", "8.2", "10.1"] },
    { "id": 10, "tasks": ["10.2", "10.3"] },
    { "id": 11, "tasks": ["10.4", "11.1"] },
    { "id": 12, "tasks": ["11.2", "11.3"] },
    { "id": 13, "tasks": ["11.4", "12.1"] },
    { "id": 14, "tasks": ["12.2", "14.1", "15.1"] },
    { "id": 15, "tasks": ["14.2", "14.3", "15.2", "15.3", "16.1"] },
    { "id": 16, "tasks": ["16.2", "16.3"] },
    { "id": 17, "tasks": ["16.4", "17.1"] },
    { "id": 18, "tasks": ["17.2", "18.1"] },
    { "id": 19, "tasks": ["18.2", "19.1"] },
    { "id": 20, "tasks": ["19.2"] }
  ]
}
```
