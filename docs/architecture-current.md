# Arquitectura Actual (As-Is) — VantiOps 360

**Proveniencia:** REAL_DATA  
**Última actualización:** 2025-01-15  
**Versión:** 1.0.0

## Resumen

VantiOps 360 es una plataforma de analítica operacional desplegada en Vercel con base de datos Neon PostgreSQL y un motor analítico Python local/CI. La arquitectura sigue un modelo serverless para el frontend con Route Handlers de Next.js y procesamiento batch local para ETL y análisis.

---

## Diagrama de Componentes

```mermaid
graph TB
    subgraph "Cliente (Browser)"
        USER[Usuario Final]
        BROWSER[Browser<br/>React 18 SPA]
    end

    subgraph "Vercel — Producción"
        direction TB
        subgraph "Next.js 14 Frontend"
            LAYOUT[Layout Principal<br/>Sidebar + Header + Footer]
            DASH[Dashboard<br/>KPIs + Charts]
            RCA_UI[Página RCA]
            RISK_UI[Página Riesgo]
            ANULACIONES_UI[Página Anulaciones]
            ACCESS_DENIED[Access Denied Page]
        end

        subgraph "Middleware Layer"
            MW_RBAC[RBAC Middleware<br/>middleware.ts]
        end

        subgraph "Route Handlers (API Layer)"
            API_CHARTS[GET /api/charts/:type<br/>9 tipos de gráficos]
            API_KPIS[GET /api/kpis<br/>Métricas agregadas]
            API_RCA[GET /api/rca<br/>Causa principal]
            API_FILTERS[GET /api/filters<br/>Valores únicos]
            API_QUALITY[GET /api/quality<br/>Score calidad]
            API_HEALTH[GET /api/health<br/>Status check]
            API_READINESS[GET /api/readiness<br/>Readiness]
            API_RISK_MODEL[GET /api/risk/model<br/>Modelo riesgo]
            API_ANNULATIONS[/api/annulations<br/>GET + POST]
            API_ANNUL_TRANS[/api/annulations/:id/transition<br/>POST]
            API_AUDIT[GET /api/audit<br/>Logs paginados]
            API_AUTH_VALIDATE[POST /api/auth/validate<br/>Email validation]
            API_APPROVALS[/api/approvals<br/>GET + POST]
            API_CAPACITY[GET /api/capacity<br/>Modelo capacidad]
            API_WEBHOOKS_PA[POST /api/webhooks/power-automate<br/>Mock]
        end
    end

    subgraph "Neon PostgreSQL (Cloud)"
        direction TB
        DB_PQR[(pqr_records<br/>Tabla principal PQR)]
        DB_ROLES[(roles<br/>11 roles RBAC)]
        DB_USERS[(app_users<br/>Usuarios)]
        DB_USER_ROLES[(user_roles<br/>Asignación)]
        DB_PERMISSIONS[(permissions<br/>Permisos)]
        DB_ROLE_PERMS[(role_permissions<br/>Matriz)]
        DB_CANCEL[(cancellation_requests<br/>Anulaciones)]
        DB_CANCEL_HIST[(cancellation_state_history<br/>Historial)]
        DB_AUDIT[(audit_events<br/>Append-only)]
        DB_PARTNERS[(partners<br/>Socios)]
        DB_PARTNER_EMAILS[(partner_authorized_emails)]
        DB_APPROVALS[(approval_steps<br/>Aprobaciones)]
        DB_MIG_BATCHES[(migration_batches)]
        DB_DOCUMENTS[(documents)]
        DB_OPS_BIZ[(operational_businesses)]
    end

    subgraph "Backend Python (Local/CI)"
        direction TB
        ETL[Pipeline ETL<br/>Polars + DuckDB + Pandera]
        RISK_MODEL[Modelo de Riesgo<br/>scikit-learn]
        QUALITY_MOD[Quality Score<br/>Pandera]
        STATS_MOD[Statistics<br/>SciPy + Polars]
        PROFILING[Profiling<br/>Type inference]
        RBAC_PY[RBAC Module<br/>rbac.py]
        EMAIL_VAL[Email Validator<br/>email_validator.py]
        AUDIT_PY[Audit Logger<br/>logger.py]
        APPROVALS_PY[Approvals Engine<br/>approvals.py]
        ANNUL_FSM[Annulations FSM<br/>state_machine.py]
        MIGRATION[Migration 600<br/>master_records.py]
        CAPACITY_PY[Capacity Model<br/>capacity.py]
        RETRY_CORE[Retry Policy<br/>retry.py]
    end

    subgraph "CI/CD — GitHub Actions"
        GHA_LINT[Lint<br/>ESLint + Ruff]
        GHA_TYPE[Typecheck<br/>TSC + Pyright]
        GHA_TEST[Tests<br/>Vitest + Pytest]
        GHA_BUILD[Build<br/>next build]
        GHA_E2E[E2E<br/>Playwright]
        VERCEL_PREVIEW[Vercel Preview]
        VERCEL_PROD[Vercel Production]
    end

    subgraph "Almacenamiento Local (Datos)"
        CTRL_TABLE[serving/control_table.json<br/>Tabla de control ETL]
        QUARANTINE[staging/quarantine.parquet<br/>Registros cuarentena]
        CURATED[data/curated/*.parquet<br/>Datos curados]
        RISK_JSON[data/curated/risk_model_results.json]
    end

    %% Conexiones Cliente
    USER --> BROWSER
    BROWSER -->|HTTPS| MW_RBAC

    %% Middleware → Frontend
    MW_RBAC --> LAYOUT
    LAYOUT --> DASH
    LAYOUT --> RCA_UI
    LAYOUT --> RISK_UI
    LAYOUT --> ANULACIONES_UI
    MW_RBAC -->|403| ACCESS_DENIED

    %% Frontend → APIs
    DASH -->|fetch| API_CHARTS
    DASH -->|fetch| API_KPIS
    RCA_UI -->|fetch| API_RCA
    RCA_UI -->|fetch| API_CHARTS
    RISK_UI -->|fetch| API_RISK_MODEL

    %% APIs → Database
    API_CHARTS -->|Pool + WS| DB_PQR
    API_KPIS -->|Pool + WS| DB_PQR
    API_RCA -->|Pool + WS| DB_PQR
    API_FILTERS -->|Pool + WS| DB_PQR
    API_QUALITY -->|Pool + WS| DB_PQR
    API_ANNULATIONS --> DB_CANCEL
    API_ANNUL_TRANS --> DB_CANCEL_HIST
    API_AUDIT --> DB_AUDIT
    API_AUTH_VALIDATE --> DB_USERS
    API_APPROVALS --> DB_APPROVALS
    API_RISK_MODEL -->|lee JSON| RISK_JSON

    %% Backend Python
    ETL -->|seed| DB_PQR
    ETL --> CURATED
    ETL --> CTRL_TABLE
    ETL --> QUARANTINE
    RISK_MODEL --> RISK_JSON
    MIGRATION -->|UPSERT| DB_PQR

    %% CI/CD
    GHA_LINT --> GHA_TYPE --> GHA_TEST --> GHA_BUILD --> GHA_E2E
    GHA_E2E --> VERCEL_PREVIEW
    VERCEL_PREVIEW --> VERCEL_PROD

    %% Estilos
    classDef protected fill:#e8f5e9,stroke:#4caf50,stroke-width:2px
    classDef api fill:#e3f2fd,stroke:#2196f3
    classDef database fill:#fce4ec,stroke:#e91e63
    classDef python fill:#fff3e0,stroke:#ff9800
    classDef ci fill:#f3e5f5,stroke:#9c27b0

    class LAYOUT,DASH,RCA_UI,RISK_UI,API_CHARTS,API_KPIS,API_RCA,API_FILTERS,API_QUALITY,API_HEALTH,API_READINESS protected
    class API_RISK_MODEL,API_ANNULATIONS,API_ANNUL_TRANS,API_AUDIT,API_AUTH_VALIDATE,API_APPROVALS,API_CAPACITY,API_WEBHOOKS_PA api
    class DB_PQR,DB_ROLES,DB_USERS,DB_USER_ROLES,DB_PERMISSIONS,DB_ROLE_PERMS,DB_CANCEL,DB_CANCEL_HIST,DB_AUDIT,DB_PARTNERS,DB_PARTNER_EMAILS,DB_APPROVALS,DB_MIG_BATCHES,DB_DOCUMENTS,DB_OPS_BIZ database
    class ETL,RISK_MODEL,QUALITY_MOD,STATS_MOD,PROFILING,RBAC_PY,EMAIL_VAL,AUDIT_PY,APPROVALS_PY,ANNUL_FSM,MIGRATION,CAPACITY_PY,RETRY_CORE python
    class GHA_LINT,GHA_TYPE,GHA_TEST,GHA_BUILD,GHA_E2E,VERCEL_PREVIEW,VERCEL_PROD ci
```

---

## Flujo de Datos

```mermaid
flowchart LR
    subgraph "Fuentes"
        EXCEL[Excel PQR Files]
        NEON_LIVE[(Neon PostgreSQL<br/>pqr_records)]
    end

    subgraph "Pipeline ETL (Python)"
        INGEST[1. Ingest<br/>openpyxl]
        PROFILE[2. Profile<br/>Type inference]
        VALIDATE[3. Validate<br/>Pandera schemas]
        ENRICH[4. Enrich<br/>Campos derivados]
        SERVE[5. Serve<br/>Parquet + Neon]
        QUARANTINE[Quarantine<br/>staging/quarantine.parquet]
    end

    subgraph "Almacenamiento"
        CURATED[data/curated/*.parquet]
        CTRL[serving/control_table.json]
        RISK_OUT[risk_model_results.json]
    end

    subgraph "API Layer (Next.js)"
        PARETO[/api/charts/pareto]
        KPIS[/api/kpis]
        RCA[/api/rca]
        RISK_API[/api/risk/model]
    end

    subgraph "Presentación"
        DASHBOARD[Dashboard]
        RCA_PAGE[RCA Page]
        RISK_PAGE[Riesgo Page]
    end

    EXCEL --> INGEST
    INGEST --> PROFILE --> VALIDATE
    VALIDATE -->|Pass| ENRICH --> SERVE
    VALIDATE -->|Fail| QUARANTINE
    SERVE --> CURATED
    SERVE --> CTRL
    SERVE --> NEON_LIVE

    NEON_LIVE --> PARETO
    NEON_LIVE --> KPIS
    NEON_LIVE --> RCA
    RISK_OUT --> RISK_API

    PARETO --> DASHBOARD
    PARETO --> RCA_PAGE
    KPIS --> DASHBOARD
    RCA --> RCA_PAGE
    RISK_API --> RISK_PAGE
```

---

## Stack Tecnológico Actual

| Capa | Tecnología | Versión | Estado |
|------|-----------|---------|--------|
| Frontend Framework | Next.js | 14.2.x | ✅ Operativo |
| UI Library | React | 18.3.x | ✅ Operativo |
| Language (Frontend) | TypeScript | 5.7.x | ✅ Operativo |
| Styling | Tailwind CSS | 3.x | ✅ Operativo |
| Charts | Recharts | 2.x | ✅ Operativo |
| UI Components | Radix UI | Latest | ✅ Operativo |
| Database | Neon PostgreSQL | Serverless | ✅ Operativo |
| DB Driver | @neondatabase/serverless | Pool + WS | ✅ Operativo |
| Hosting | Vercel | Serverless | ✅ Operativo |
| Backend Language | Python | 3.11+ | ✅ Local/CI |
| ETL Processing | Polars + DuckDB | Latest | ✅ Operativo |
| Data Validation | Pandera | Latest | ✅ Operativo |
| ML Model | scikit-learn | Latest | ✅ Local |
| Statistics | SciPy | Latest | ✅ Operativo |
| Testing (Frontend) | Vitest | Latest | ✅ Operativo |
| E2E Testing | Playwright | Latest | ✅ Operativo |
| Testing (Backend) | Pytest + Hypothesis | Latest | ✅ Operativo |
| CI/CD | GitHub Actions | v4 | ✅ Operativo |
| Linting (Python) | Ruff | Latest | ✅ Operativo |
| Type Check (Python) | Pyright | Latest | ✅ Operativo |

---

## Componentes Implementados

### Frontend (Next.js 14)

| Componente | Ubicación | Estado |
|-----------|-----------|--------|
| Layout Principal (Sidebar, Header, Footer) | `frontend/app/layout.tsx` | ✅ Protegido |
| Dashboard (KPIs + Charts) | `frontend/app/page.tsx` | ✅ Protegido |
| Filtros Globales | `frontend/components/filters/*` | ✅ Protegido |
| Gráficos Recharts | `frontend/components/charts/*` | ✅ Protegido |
| KPI Cards | `frontend/components/kpi/*` | ✅ Protegido |
| RBAC Middleware | `frontend/middleware.ts` | ✅ Implementado |
| Auth Guard (Client) | `frontend/lib/auth/guard.tsx` | ✅ Implementado |
| Access Denied Page | `frontend/app/access-denied/page.tsx` | ✅ Implementado |
| Retry Utility | `frontend/lib/server/retry.ts` | ✅ Implementado |

### Route Handlers (APIs)

| Endpoint | Estado | Proveniencia |
|---------|--------|-------------|
| GET /api/charts/:chartType | ✅ Protegido | REAL_DATA |
| GET /api/kpis | ✅ Protegido | REAL_DATA |
| GET /api/rca | ✅ Protegido | REAL_DATA |
| GET /api/filters | ✅ Protegido | REAL_DATA |
| GET /api/quality | ✅ Protegido | REAL_DATA |
| GET /api/health | ✅ Protegido | REAL_DATA |
| GET /api/readiness | ✅ Protegido | REAL_DATA |
| GET /api/risk/model | ✅ Implementado | DERIVED_DATA |
| /api/annulations (GET, POST) | ✅ Implementado | REAL_DATA |
| /api/annulations/:id/transition (POST) | ✅ Implementado | REAL_DATA |
| GET /api/audit | ✅ Implementado | REAL_DATA |
| POST /api/auth/validate | ✅ Implementado | REAL_DATA |
| /api/approvals (GET, POST) | ✅ Implementado | REAL_DATA |
| GET /api/capacity | ✅ Implementado | DERIVED_DATA |
| POST /api/webhooks/power-automate | ✅ Implementado (Mock) | CONCEPTUAL_DESIGN |

### Backend Python

| Módulo | Ubicación | Estado |
|--------|-----------|--------|
| Pipeline ETL | `backend/src/pipeline/` | ✅ Operativo |
| RCA | `backend/src/rca/` | ✅ Protegido |
| Quality | `backend/src/quality/` | ✅ Protegido |
| Statistics | `backend/src/statistics/` | ✅ Protegido |
| Risk Model | `backend/src/risk/` | ✅ Protegido |
| Profiling | `backend/src/profiling/` | ✅ Protegido |
| RBAC | `backend/src/auth/rbac.py` | ✅ Implementado |
| Email Validator | `backend/src/auth/email_validator.py` | ✅ Implementado |
| Audit Logger | `backend/src/audit/logger.py` | ✅ Implementado |
| Approvals Engine | `backend/src/governance/approvals.py` | ✅ Implementado |
| Annulations FSM | `backend/src/annulations/state_machine.py` | ✅ Implementado |
| Migration 600 Records | `backend/src/migration/master_records.py` | ✅ Implementado |
| Capacity Model | `backend/src/operations/capacity.py` | ✅ Implementado |
| Retry Policy | `backend/src/core/retry.py` | ✅ Implementado |

### Base de Datos (Neon PostgreSQL)

| Tabla | Propósito | Migración |
|-------|-----------|-----------|
| pqr_records | Registros PQR principales | Existente (protegida) |
| roles | 11 roles RBAC | 001_create_roles.sql |
| permissions | Permisos granulares | 002_create_permissions.sql |
| app_users | Usuarios del sistema | 003_create_app_users.sql |
| user_roles | Asignación usuario-rol | 004_create_user_roles.sql |
| role_permissions | Matriz rol-permiso | 005_create_role_permissions.sql |
| partners | Socios/Partners | 006_create_partners.sql |
| partner_authorized_emails | Emails autorizados | 006 (parte) |
| partner_applications | Aplicaciones de socios | 007_create_partner_applications.sql |
| approval_steps | Pasos de aprobación | 008_create_approval_steps.sql |
| cancellation_requests | Solicitudes anulación | 009_create_cancellation_requests.sql |
| cancellation_state_history | Historial de estados | 009 (parte) |
| audit_events | Log de auditoría (append-only) | 010_create_audit_events.sql |
| migration_batches | Lotes de migración | 011_create_migration_batches.sql |
| documents | Documentos | 012_create_documents.sql |
| operational_businesses | Negocios operativos | 013_create_operational_businesses.sql |

### CI/CD Pipeline

| Paso | Herramienta | Estado |
|------|-------------|--------|
| Lint (Frontend) | ESLint | ✅ Operativo |
| Lint (Backend) | Ruff | ✅ Operativo |
| Typecheck (Frontend) | TypeScript Compiler | ✅ Operativo |
| Typecheck (Backend) | Pyright | ✅ Operativo |
| Unit Tests (Frontend) | Vitest | ✅ Operativo |
| Unit Tests (Backend) | Pytest + Hypothesis | ✅ Operativo |
| Build | Next.js Build | ✅ Operativo |
| E2E Tests | Playwright | ✅ Operativo |
| Preview Deploy | Vercel Preview | ✅ Operativo |
| Production Deploy | Vercel Production | ✅ Operativo |

---

## Dependencias Externas

| Servicio | Propósito | Tipo de Conexión |
|----------|-----------|-----------------|
| Neon PostgreSQL | Base de datos principal | Pool + WebSocket (serverless) |
| Vercel | Hosting + Deploy | Git integration |
| GitHub Actions | CI/CD | Workflow triggers |
| npm Registry | Dependencias frontend | Package install |
| PyPI | Dependencias backend | pip install |

---

## Limitaciones Actuales

1. **Sin autenticación federada**: No hay integración con Azure AD/Okta. La autenticación se basa en JWT local + validación de email.
2. **Backend no desplegado**: El motor Python se ejecuta localmente o en CI, no como servicio web independiente.
3. **Sin integración SAP**: Solo existe diseño conceptual documentado.
4. **Sin Power Automate productivo**: Solo mock webhook implementado.
5. **Sin análisis R**: Solo diseño conceptual documentado.
6. **Pool limitado**: Máximo 2 conexiones simultáneas a Neon (suficiente para 42 usuarios con queries rápidas).
7. **Health check básico**: No incluye validación de conectividad DB ni modo degradado.
8. **Sin rollback automático**: El pipeline CI/CD no tiene rollback post-deploy automatizado.
9. **Evidencia estática**: No se genera evidencia dinámica con hash de commit y versiones reales.
