# Requirements Document

## Introduction

The PQR Analytics Engine is the first module of VantiOps 360 — a Control Tower for Operations, Data, and Strategic Partners. This module implements Phase 01: Data Analysis and Process Structuring. It ingests PQR (Peticiones, Quejas y Reclamos) records from an Excel source file, performs comprehensive data profiling and quality assessment, builds statistical and risk models, conducts root cause analysis, and delivers an executive dashboard for operational decision-making. The system processes approximately 51,008 records across ~29 columns covering customer complaints and service requests for a natural gas utility.

## Glossary

- **PQR_Analytics_Engine**: The backend system responsible for data ingestion, profiling, validation, statistical analysis, risk modeling, root cause analysis, and data pipeline orchestration.
- **Executive_Dashboard**: The Next.js frontend application that displays KPIs, visualizations, filters, and analytical findings to operational decision-makers.
- **Data_Ingestion_Module**: The subsystem that reads source files, detects schemas, standardizes column names, and loads data into the processing pipeline.
- **Data_Profiler**: The subsystem that identifies data types, null values, duplicates, outliers, invalid dates, and semantically similar categories across all columns.
- **Quality_Report_Generator**: The subsystem that produces a structured data quality report with metrics, violations, and proposed actions.
- **Statistical_Engine**: The subsystem that calculates descriptive statistics, conditional probabilities, confidence intervals, and distribution analyses.
- **Risk_Model**: The explainable machine learning model (logistic regression or small decision tree) that estimates the probability of a PQR exceeding P90 management time.
- **Root_Cause_Analyzer**: The subsystem that applies structured methodologies (Pareto, SIPOC, 5 Whys, Ishikawa, Lean, FMEA, BPMN) to identify and document the principal cause of PQR volume.
- **Data_Quality_Score**: A composite metric based on completeness, validity, consistency, uniqueness, timeliness, and referential integrity dimensions.
- **DataSourceAdapter**: A protocol interface that standardizes ingestion from multiple file formats and sources.
- **Landing_Zone**: The initial storage layer where raw ingested data is placed before processing.
- **Curated_Layer**: The final validated and enriched data layer ready for analytical consumption.
- **P90**: The 90th percentile of the management time distribution, used as the threshold for delayed PQR resolution.
- **PQR**: Peticiones, Quejas y Reclamos — formal customer requests, complaints, and claims submitted to the utility.
- **Management_Time**: The number of days elapsed from PQR creation to resolution or current date for open cases.
- **BPMN**: Business Process Model and Notation 2.0, the standard for process flow diagrams.
- **Pareto_Principle**: The analytical technique identifying the vital few causes that account for the majority of effects (typically 80/20 distribution).
- **Data_Quality_Gate**: A validation checkpoint in the pipeline that quarantines records failing quality rules before they proceed to downstream layers.

## Requirements

### Requirement 1: Excel File Ingestion

**User Story:** As a data analyst, I want to ingest PQR records from the Excel source file, so that I can perform data analysis and profiling on the complete dataset.

#### Acceptance Criteria

1. WHEN the file path `Entrada_PQRs.xlsx` is provided, THE Data_Ingestion_Module SHALL read the Excel file and detect all sheet names present in the workbook.
2. WHEN a sheet is loaded, THE Data_Ingestion_Module SHALL standardize all column names to snake_case format by converting spaces, special characters, and mixed-case names into lowercase underscore-separated identifiers, removing leading and trailing whitespace before conversion.
3. WHEN loading completes, THE Data_Ingestion_Module SHALL verify that the output record count equals the source record count and the output column count equals the source column count, confirming zero records and zero columns were lost or truncated during ingestion.
4. IF the source file is missing or unreadable, THEN THE Data_Ingestion_Module SHALL raise a descriptive error indicating the file path and the nature of the failure within 5 seconds of the read attempt.
5. IF a sheet contains zero records, THEN THE Data_Ingestion_Module SHALL log a warning including the sheet name and skip the empty sheet without halting ingestion of other sheets.
6. THE Data_Ingestion_Module SHALL use Polars or PyArrow as the primary engine for reading and parsing the Excel file.
7. IF the workbook contains multiple sheets with differing column structures, THEN THE Data_Ingestion_Module SHALL process each sheet independently without merging, preserving the original column structure of each sheet after snake_case standardization.

### Requirement 2: Data Type Detection and Schema Profiling

**User Story:** As a data analyst, I want automatic detection of data types for each column, so that I can understand the structure of the dataset without manual inspection.

#### Acceptance Criteria

1. WHEN a dataset is loaded, THE Data_Profiler SHALL identify the inferred data type for each column (categorical, numeric, datetime, boolean, text) by assigning the type that matches at least 80% of non-null values in the column, and SHALL distinguish categorical from text by classifying columns with fewer than 50 distinct values as categorical and columns with 50 or more distinct values as text.
2. WHEN a column is classified as datetime, THE Data_Profiler SHALL validate each value against recognized date formats and SHALL report the count and percentage of records with invalid or unparseable dates per column.
3. WHEN a column contains numeric values, THE Data_Profiler SHALL detect outliers using IQR-based methods (values below Q1 - 1.5×IQR or above Q3 + 1.5×IQR) and SHALL report the outlier count and outlier percentage for each numeric column.
4. THE Data_Profiler SHALL calculate the null count and null percentage for each column in the dataset.
5. THE Data_Profiler SHALL identify duplicate records based on the main PQR identifier column and report the duplication count and percentage of total records.
6. WHEN categorical columns are detected, THE Data_Profiler SHALL identify semantically similar categories using string similarity metrics (Levenshtein distance or TF-IDF cosine similarity with a threshold of 0.85 or higher) and SHALL output grouped sets of category values that exceed the similarity threshold.
7. IF a column contains fewer than 80% of non-null values parseable as any single data type, THEN THE Data_Profiler SHALL classify the column as mixed-type and SHALL report the percentage breakdown of detected types within that column.

### Requirement 3: Data Quality Report Generation

**User Story:** As a data analyst, I want a structured quality report exported as an aggregated artifact, so that I can share profiling results with stakeholders without exposing raw data.

#### Acceptance Criteria

1. WHEN profiling is complete, THE Quality_Report_Generator SHALL produce a structured report containing for each column: column name, data type, null count, null percentage, unique count, outlier count, invalid date count, and semantic similarity groups.
2. THE Quality_Report_Generator SHALL export aggregated metrics in both JSON and Parquet formats, where each file contains a metadata header with generation timestamp, source record count, and schema version, structured for consumption by the Executive_Dashboard API.
3. THE Quality_Report_Generator SHALL calculate and include the following dataset-level metrics: total record count, total column count, overall completeness percentage (ratio of non-null values to total cells), overall validity percentage (ratio of values conforming to expected type/format to total values), and duplication rate (ratio of duplicate records to total records).
4. THE Quality_Report_Generator SHALL export only column-level aggregations and dataset-level summary statistics, ensuring that no individual PQR record values, row-level data, or combinations of fields that could identify a single record are present in the output.
5. IF a column exceeds 20% null values, THEN THE Quality_Report_Generator SHALL flag the column as requiring attention in the report with severity level "high".
6. IF profiling completes with one or more columns failing type detection or validation, THEN THE Quality_Report_Generator SHALL generate the report for all successfully profiled columns and include an errors section listing each failed column with the reason for failure.
7. IF a column has between 5% and 20% null values, THEN THE Quality_Report_Generator SHALL flag the column with severity level "medium" in the report.
8. IF report generation fails due to insufficient profiling data (zero columns successfully profiled), THEN THE Quality_Report_Generator SHALL return an error indication specifying the failure reason without producing a partial report file.

### Requirement 4: Validation Reference Points

**User Story:** As a data analyst, I want the system to calculate and verify key reference metrics from the data, so that I can confirm the profiling results align with known dataset characteristics.

#### Acceptance Criteria

1. WHEN profiling is complete, THE Data_Profiler SHALL calculate the total record count and confirm it is approximately 51,008 (within ±1% tolerance). IF the calculated value falls outside this tolerance, THE Data_Profiler SHALL report the actual value and document the deviation without modifying data to force alignment.
2. WHEN profiling is complete, THE Data_Profiler SHALL calculate the total column count and confirm it is approximately 29 (within ±2 columns tolerance). IF the calculated value differs, THE Data_Profiler SHALL report the actual column count and list all detected column names.
3. WHEN duplicate analysis is performed on the main PQR identifier, THE Data_Profiler SHALL report the duplication rate and verify it is negligible (below 1%). IF duplicates exceed 1%, THE Data_Profiler SHALL log the duplicate identifiers count and flag for investigation.
4. WHEN cause frequency is calculated, THE Data_Profiler SHALL identify the most frequent cause and verify it accounts for approximately 50% of all records (within ±5 percentage points). THE Data_Profiler SHALL report both the cause name and its exact calculated percentage.
5. WHEN management time statistics are calculated, THE Statistical_Engine SHALL compute mean, median, and P90, and verify: mean approximately 6.32 days (±0.5), median approximately 7 days (±1), P90 approximately 10 days (±1). IF any metric falls outside tolerance, THE Statistical_Engine SHALL report the calculated value and the applied calculation rule.
6. WHEN attention channel distribution is analyzed, THE Data_Profiler SHALL verify that phone and verbal channels together account for the majority of records (above 60%) and report the exact percentage for each channel.
7. WHEN quality issues are analyzed, THE Data_Profiler SHALL define "quality issue" per field as: closure reason with null or blank values, marking with values not in the homologated catalog, companies with inconsistent naming or null values, and categories with semantically duplicated entries. THE Data_Profiler SHALL report the percentage of records with quality issues in each field.

### Requirement 5: Executive Dashboard KPIs

**User Story:** As an operations manager, I want to view key performance indicators on an executive dashboard, so that I can monitor PQR operational status at a glance.

#### Acceptance Criteria

1. THE Executive_Dashboard SHALL display the following KPI cards: Total PQR count, Closed PQR count, In-Process PQR count, Percentage Closed, Average Management Time, Median Management Time, P90 Management Time, P95 Management Time, Maximum Management Time, Distinct Causes Count, Main Cause Share Percentage, Quality Issues Percentage, and Data Quality Score. Time-based KPIs SHALL be displayed in days with one decimal place, and percentage-based KPIs SHALL be displayed with one decimal place followed by the "%" symbol.
2. WHEN the Executive_Dashboard page is loaded, THE Executive_Dashboard SHALL fetch KPI data from the backend API and render all KPI values within 3 seconds measured from the moment the page navigation is initiated.
3. WHEN a filter is applied, THE Executive_Dashboard SHALL recalculate and refresh all KPI values to reflect only the filtered subset within 2 seconds measured from the moment the user confirms the filter selection.
4. THE Executive_Dashboard SHALL consume only pre-aggregated and anonymized indicator data from the backend API endpoints.
5. THE Executive_Dashboard SHALL display the Data Quality Score as a composite percentage derived from the six quality dimensions: completeness, validity, consistency, uniqueness, timeliness, and referential integrity.
6. IF the backend API request for KPI data fails or times out after 10 seconds, THEN THE Executive_Dashboard SHALL display an error indication on the affected KPI cards and provide a manual retry option, while preserving any previously loaded values.
7. WHILE KPI data is being fetched from the backend API, THE Executive_Dashboard SHALL display a loading indicator on each KPI card until the data is rendered or an error state is shown.

### Requirement 6: Executive Dashboard Visualizations

**User Story:** As an operations manager, I want interactive charts and visualizations, so that I can explore PQR distribution patterns and identify operational bottlenecks.

#### Acceptance Criteria

1. THE Executive_Dashboard SHALL display a Pareto chart showing causes sorted by frequency in descending order with a cumulative percentage line on a secondary y-axis.
2. THE Executive_Dashboard SHALL display a Top 10 causes horizontal bar chart ranked by record count in descending order.
3. THE Executive_Dashboard SHALL display a cancellation share donut chart showing the proportion of the main cancellation cause versus all other causes combined.
4. THE Executive_Dashboard SHALL display distribution bar charts by company, channel, and result type, each showing record count per category sorted by frequency in descending order.
5. THE Executive_Dashboard SHALL display a temporal trend line chart showing PQR volume over time with a toggle control allowing the user to switch between monthly and weekly granularity, defaulting to monthly.
6. THE Executive_Dashboard SHALL display a management time by cause box plot for the top 10 causes showing median, Q1, Q3, and whiskers at 1.5×IQR.
7. THE Executive_Dashboard SHALL display a boxplot of overall management time distribution showing median, Q1, Q3, whiskers at 1.5×IQR, and outlier points.
8. THE Executive_Dashboard SHALL display a P90 management time by cause bar chart for the top 10 causes ranked by P90 value in descending order.
9. THE Executive_Dashboard SHALL display a heatmap showing the relationship between cause (rows) and attention channel (columns), with cell color intensity representing record count.
10. THE Executive_Dashboard SHALL display an open cases by age distribution histogram with age buckets of 7-day intervals (0–7, 8–14, 15–21, 22–28, 29–60, 61+ days).
11. THE Executive_Dashboard SHALL display a quality by field stacked bar chart showing completeness percentage (non-null ratio) per column, with segments for complete versus missing values.
12. THE Executive_Dashboard SHALL display an anomaly matrix highlighting cells where the observed record count deviates by more than 2 standard deviations from the expected count for each cause-channel combination.
13. THE Executive_Dashboard SHALL display an executive findings summary table containing up to 10 rows, each with: finding description, affected metric, severity (critical/high/medium/low), and recommended action.
14. WHEN a user hovers over a chart element, THE Executive_Dashboard SHALL display a tooltip within 200 milliseconds showing the exact value, percentage of total, and category label.
15. IF a chart has no data to display after filters are applied, THEN THE Executive_Dashboard SHALL render an empty state placeholder with a message indicating no records match the current filter criteria.
16. THE Executive_Dashboard SHALL provide a text alternative (aria-label or descriptive caption) for each chart summarizing the chart type, data represented, and key finding.

### Requirement 7: Executive Dashboard Filters

**User Story:** As an operations manager, I want to filter the dashboard by multiple dimensions, so that I can focus my analysis on specific segments of PQR data.

#### Acceptance Criteria

1. THE Executive_Dashboard SHALL provide the following filter controls: period (date range picker), company (multi-select dropdown), cause (multi-select dropdown), channel (multi-select dropdown), status (multi-select dropdown), result (multi-select dropdown), responsible unit (multi-select dropdown), and management time range (numeric range slider with minimum 0 days and maximum equal to the dataset's maximum management time).
2. WHEN multiple filters are selected simultaneously, THE Executive_Dashboard SHALL apply all filters using AND logic to the displayed data and update all KPIs and visualizations within 2 seconds.
3. WHEN a filter is cleared for a single dimension, THE Executive_Dashboard SHALL restore the full unfiltered view for that dimension within 1 second.
4. THE Executive_Dashboard SHALL persist active filter selections during the user session (until the browser tab is closed or the user explicitly logs out) so they survive page navigation within the dashboard.
5. WHEN no records match the applied filters, THE Executive_Dashboard SHALL display an empty state message indicating zero matching results and listing the currently active filter criteria.
6. THE Executive_Dashboard SHALL visually indicate which filters are currently active by displaying a count of active filters and providing a "Clear All Filters" control that resets all dimensions to their unfiltered state within 1 second.
7. WHEN the dashboard loads, THE Executive_Dashboard SHALL populate each filter's selectable options from the actual values present in the dataset via backend API query parameters.
8. WHEN a filter is applied or cleared, THE Executive_Dashboard SHALL update the displayed record count to reflect the number of records matching the current filter combination.

### Requirement 8: Statistical Analysis and Conditional Probabilities

**User Story:** As a data analyst, I want to calculate conditional probabilities and statistical metrics, so that I can identify patterns and risk factors in PQR management.

#### Acceptance Criteria

1. THE Statistical_Engine SHALL calculate the following conditional probabilities: P(Management_Time > P90 | cause), P(result = no_accede | channel), P(status = in_process | cause), P(Management_Time > P90 | company), P(quality_incomplete | responsible_unit).
2. IF a conditioning group contains fewer than 30 records, THEN THE Statistical_Engine SHALL flag that group's conditional probability as having low confidence and include the sample size alongside the estimate.
3. THE Statistical_Engine SHALL calculate descriptive statistics for Management_Time: mean, median, mode, variance, standard deviation, Q1, Q2, Q3, P90, P95, and IQR, reporting each value rounded to 2 decimal places.
4. THE Statistical_Engine SHALL detect outliers in Management_Time using the IQR method with a 1.5×IQR threshold (values below Q1 − 1.5×IQR or above Q3 + 1.5×IQR) and report count and percentage of outlier records.
5. THE Statistical_Engine SHALL apply Pareto analysis to identify the minimum set of causes accounting for 80% of total PQR volume and rank them in descending order of frequency.
6. THE Statistical_Engine SHALL calculate 95% confidence intervals for proportion estimates (closed rate, main cause share, quality issue rate) using the Wilson score interval method.
7. THE Statistical_Engine SHALL label all findings using the terms "association" or "correlation" in output labels and descriptions, and SHALL NOT use the terms "causes", "leads to", or "results in" when describing statistical relationships.
8. WHEN comparing proportions between groups, THE Statistical_Engine SHALL apply a chi-square test when comparing more than two groups or a two-proportion z-test when comparing exactly two groups, report p-values rounded to 4 decimal places, and flag results with p-value below 0.05 as statistically significant.
9. IF a conditioning variable contains missing values for a record, THEN THE Statistical_Engine SHALL exclude that record from the conditional probability calculation for that variable and report the count of excluded records.

### Requirement 9: Explainable Risk Model

**User Story:** As an operations manager, I want an explainable model that estimates the probability of a PQR exceeding P90 management time, so that I can proactively identify and prioritize high-risk cases.

#### Acceptance Criteria

1. THE Risk_Model SHALL use logistic regression or a small decision tree (max depth 4) as the prediction algorithm.
2. THE Risk_Model SHALL split the dataset into training (70-80%) and testing (20-30%) sets using stratified sampling on the target variable with a fixed random seed for reproducibility.
3. THE Risk_Model SHALL use only features available at the time of PQR creation (excluding fields populated at or after closure such as closure date, result, management time, and closure reason).
4. THE Risk_Model SHALL report the following evaluation metrics on the test set: precision, recall, F1-score, ROC-AUC, and confusion matrix.
5. THE Risk_Model SHALL produce a variable importance ranking showing the contribution of each feature to the prediction, using coefficients for logistic regression or feature_importances_ for decision trees.
6. THE Risk_Model SHALL be clearly labeled in all outputs and documentation as an "analytical demonstration — not a production-grade model".
7. IF a feature exhibits data leakage (information from the future relative to PQR creation), THEN THE Risk_Model SHALL exclude that feature from training and log the exclusion reason with the feature name.
8. THE Risk_Model SHALL use scikit-learn as the implementation library.
9. IF the target variable has class imbalance exceeding 80/20 ratio, THEN THE Risk_Model SHALL apply class weighting (class_weight="balanced") or oversampling to mitigate bias toward the majority class.
10. THE Risk_Model SHALL achieve a minimum ROC-AUC of 0.60 on the test set; if the threshold is not met, THE Risk_Model SHALL document the limitation and suggest potential feature engineering improvements.

### Requirement 10: Data Quality Score Computation

**User Story:** As a data steward, I want a composite Data Quality Score based on multiple dimensions, so that I can track and improve data quality over time.

#### Acceptance Criteria

1. THE Data_Quality_Score SHALL be computed as a weighted composite of six dimensions with the following default weights: completeness (25%), validity (20%), consistency (20%), uniqueness (15%), timeliness (10%), and referential integrity (10%), where each dimension produces a sub-score between 0% and 100% and the composite is the weighted sum of all dimension sub-scores.
2. WHEN the score is computed, THE Quality_Report_Generator SHALL produce a detail table showing: quality rule name, target field, violations count, violations percentage, severity level (critical: >20% violations, high: >10–20%, medium: >5–10%, low: ≤5%), and a corrective action description referencing the violated rule and affected field.
3. THE Data_Quality_Score SHALL express the overall score as a percentage between 0% and 100%, where 100% indicates no detected quality issues and 0% indicates all evaluated values failed quality checks.
4. WHEN completeness is evaluated, THE Quality_Report_Generator SHALL measure the ratio of non-null values to total expected values for each field and produce a per-field completeness sub-score and an overall completeness dimension score averaged across all evaluated fields.
5. WHEN validity is evaluated, THE Quality_Report_Generator SHALL verify that values conform to the format rules defined in the Pandera schema contracts (date fields parse to valid dates, categorical fields match their declared domain lists, numeric fields fall within their declared min/max ranges).
6. WHEN consistency is evaluated, THE Quality_Report_Generator SHALL check for contradictions between related fields: records with status "closed" but null closure date, records with result "accede" but management time of zero days, and records with closure date earlier than creation date.
7. WHEN uniqueness is evaluated, THE Quality_Report_Generator SHALL verify the absence of unintended duplicate records on the main PQR identifier and report the duplication count and percentage as the uniqueness violation rate.
8. WHEN timeliness is evaluated, THE Quality_Report_Generator SHALL flag records with creation dates that fall before 2020-01-01 or after the current processing date as timeliness violations.
9. WHEN referential integrity is evaluated, THE Quality_Report_Generator SHALL verify that categorical values reference valid entries in the domain catalogs maintained in the schema catalog (known companies, known causes, known channels) and report unmatched values as referential integrity violations.

### Requirement 11: Root Cause Analysis

**User Story:** As a process improvement specialist, I want a structured root cause analysis of the main PQR cause, so that I can design targeted interventions to reduce complaint volume.

#### Acceptance Criteria

1. THE Root_Cause_Analyzer SHALL identify "Cancela Servihogar a solicitud cliente" as the main cause by confirming it holds the highest absolute volume and accounts for at least 45% of total PQR records based on Pareto ranking.
2. THE Root_Cause_Analyzer SHALL justify the selection by producing a structured summary containing: absolute volume (record count), percentage share of total PQR, temporal trend (monthly volume over the analysis period), associated attention channels with their proportions, management time statistics (mean, median, P90), result distribution (percentage per result category), relationship to other cancellation-related causes (list and combined share), and operational impact expressed as estimated manual hours consumed per month.
3. THE Root_Cause_Analyzer SHALL apply the following methodologies, each producing a distinct named output section: Pareto analysis (chart and ranked cause table), SIPOC diagram (Suppliers, Inputs, Process steps, Outputs, Customers), 5 Whys analysis (minimum 5 levels of causal depth), Ishikawa diagram (covering at minimum the categories: People, Process, Technology, Information, Environment), demand analysis (volume segmentation by type and channel), Lean waste identification (mapped to the 8 Lean wastes), and simplified FMEA (with Severity 1-5, Occurrence 1-5, and Detection 1-5 ratings per failure mode, producing a Risk Priority Number).
4. THE Root_Cause_Analyzer SHALL produce an AS-IS process flow diagram in Mermaid-compatible BPMN 2.0 notation representing the current cancellation handling process, containing at minimum: start event, end event, decision gateways, and the identified risk points (incomplete data, inconsistent classification, low traceability, high manual contact, multiple forwards, no visible status).
5. THE Root_Cause_Analyzer SHALL produce a TO-BE process flow diagram in Mermaid-compatible BPMN 2.0 notation representing the proposed improved process, including at minimum the following activities: structured intake form, client and contract identification, product validation, eligibility verification, reason identification, retention offer, client confirmation, routing to responsible unit, execution, client notification, satisfaction survey, and feedback analytics.
6. THE Root_Cause_Analyzer SHALL define process controls including: mandatory fields (list per process step), homologated catalogs (enumerated valid values), input validations (format and range rules), idempotency checks (duplicate request detection criteria), timers (maximum allowed duration per step in business days), alerts (trigger conditions and recipients), escalation rules (conditions and target roles), traceability requirements (minimum logged attributes per transaction), and segregation of duties (roles that must not overlap).
7. THE Root_Cause_Analyzer SHALL assess the automation opportunity for the main cause and quantify the potential reduction as: percentage of current manual interventions eliminable, estimated reduction in average management time (in days), and projected monthly volume of cases eligible for straight-through processing without human intervention.

### Requirement 12: Data Pipeline Architecture

**User Story:** As a data engineer, I want a conceptual pipeline architecture that defines the flow from source ingestion to dashboard consumption, so that the system can scale to multiple data sources and formats.

#### Acceptance Criteria

1. THE PQR_Analytics_Engine SHALL define a conceptual pipeline architecture in Mermaid diagram format with the following stages: Sources, Ingestion, Landing Zone, Schema Detection, Technical Validation, Data Quality Gate, Normalization, Enrichment, Curated Layer, Analytical Model, APIs/Dashboard/Alerts, and Observability.
2. THE PQR_Analytics_Engine SHALL define five data layers: Raw, Staging, Validated, Curated, and Serving, each with documented purpose, data format, retention policy, and access controls.
3. THE PQR_Analytics_Engine SHALL support multi-source ingestion from the following formats: XLSX, XLS, CSV, TSV, JSON, XML, Parquet, REST API responses, compressed files (.zip, .gz), email attachments, and SAP exports.
4. THE PQR_Analytics_Engine SHALL define a DataSourceAdapter protocol interface with methods: detect(source) -> bool, read(source) -> DataFrame, metadata(source) -> dict, validate(source) -> ValidationResult, and close(source) -> None.
5. THE PQR_Analytics_Engine SHALL store processed data in columnar Parquet format in the Curated Layer with snappy compression.
6. THE PQR_Analytics_Engine SHALL maintain a schema catalog with versioning, metadata (column names, types, descriptions), file hash (SHA-256), and lineage information (source file, transformation steps, timestamp) for each ingested dataset.
7. THE PQR_Analytics_Engine SHALL implement idempotent processing by computing and comparing the SHA-256 hash of each source file before processing, skipping re-processing when the hash matches a previously processed file.
8. THE PQR_Analytics_Engine SHALL implement a quarantine mechanism to isolate records failing validation into a separate quarantine table with the original record values, the failed rule identifier, and the failure timestamp, without blocking the processing of valid records.
9. THE PQR_Analytics_Engine SHALL implement retry logic with exponential backoff (base 2 seconds, maximum 3 retries, maximum wait 30 seconds) for transient failures during source access. IF all retries are exhausted, THE PQR_Analytics_Engine SHALL log the failure with source identifier and error details and mark the ingestion batch as failed.
10. THE PQR_Analytics_Engine SHALL maintain control tables tracking: ingestion timestamp, source file hash, record counts (ingested, validated, quarantined, rejected), and processing duration in seconds.

### Requirement 13: Data Protection and Privacy

**User Story:** As a security-conscious developer, I want data protection measures enforced throughout the system, so that sensitive PQR information is never exposed in the repository or frontend.

#### Acceptance Criteria

1. THE PQR_Analytics_Engine SHALL keep the original source file (`Entrada_PQRs.xlsx`) in the `data/raw/` folder, and that folder path SHALL be listed in `.gitignore` so that no file within it is tracked by version control.
2. THE Executive_Dashboard SHALL consume only aggregated and anonymized indicators where each displayed metric represents a group of at least 5 records; no individual PQR record data shall be transmitted to the frontend.
3. THE PQR_Analytics_Engine SHALL generate a sanitized demo dataset containing at least 1,000 synthetic records that preserve the original dataset's category frequency distributions and numeric field means within ±10% relative error, without containing any real customer information.
4. THE PQR_Analytics_Engine SHALL store no secrets, credentials, API keys, or connection strings in the source code repository; all such values SHALL be loaded exclusively from environment variables or a local `.env` file that is listed in `.gitignore`.
5. WHEN a field is identified as potentially containing personal information (names, phone numbers, addresses, identification numbers), THE PQR_Analytics_Engine SHALL detect such fields by matching column names against a configurable list of PII field patterns and SHALL mask string values by replacing characters with asterisks while preserving the first and last characters (for fields with 3 or more characters), or hash the full value using SHA-256, before any data export or visualization.
6. THE PQR_Analytics_Engine SHALL include a `DATA_TREATMENT.md` document describing: data sources, retention policy, access controls, anonymization methods, and applicable regulations.
7. IF a new data source is added that contains personally identifiable information, THEN THE PQR_Analytics_Engine SHALL apply the same PII detection and masking rules defined in the configurable PII field patterns list before any record is processed, exported, or visualized.
8. IF masking or anonymization of a PII field fails during processing, THEN THE PQR_Analytics_Engine SHALL quarantine the affected record, log an error indicating the field name and failure reason, and exclude the record from any export or visualization output.

### Requirement 14: Technology Stack Compliance

**User Story:** As a developer, I want the system to use specified technologies consistently, so that the implementation remains maintainable and aligned with the project architecture.

#### Acceptance Criteria

1. THE PQR_Analytics_Engine SHALL use Polars as the DataFrame library for all data manipulation and transformation operations, with no alternative DataFrame library (such as pandas) used except where a required operation has no Polars-compatible implementation.
2. THE PQR_Analytics_Engine SHALL use DuckDB as the analytical query engine for cross-table aggregation and statistical computations that operate on persisted or multi-dataset queries.
3. THE PQR_Analytics_Engine SHALL use PyArrow for columnar data interchange between processing stages and for all Parquet file read/write operations.
4. THE PQR_Analytics_Engine SHALL use Pandera for schema validation and data contract enforcement on all data entering or exiting a pipeline stage.
5. THE PQR_Analytics_Engine SHALL use scipy for statistical tests and distribution analysis.
6. THE PQR_Analytics_Engine SHALL use scikit-learn for the explainable risk model implementation.
7. THE PQR_Analytics_Engine SHALL use Plotly for generating interactive chart specifications consumed by the dashboard.
8. THE Executive_Dashboard SHALL be implemented using Next.js as the frontend framework with TypeScript, Tailwind CSS, and shadcn/ui for the component layer.
9. WHEN generating process diagrams (BPMN AS-IS, TO-BE, pipeline architecture), THE PQR_Analytics_Engine SHALL produce Mermaid-compatible diagram definitions.
10. IF a task requires a library not listed in the approved technology stack, THEN THE PQR_Analytics_Engine SHALL document the dependency, its purpose, and the justification in the project dependency manifest.
11. THE PQR_Analytics_Engine SHALL declare all Python dependencies with pinned versions in a dependency specification file (requirements.txt or pyproject.toml) and all frontend dependencies with pinned versions in package.json.
12. THE PQR_Analytics_Engine SHALL verify technology stack compliance by ensuring that no import of an unapproved alternative library (e.g., pandas for DataFrame operations) exists in production source code, validated through automated linting or dependency audit.
