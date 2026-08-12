# VantiOps 360

Plataforma de analítica operacional para la gestión de PQR (Peticiones, Quejas y Reclamos) de **Vanti**, empresa de gas de Colombia.

---

## Descripción

VantiOps 360 integra un frontend de visualización (Next.js) con un motor analítico en Python para:

- **Análisis Pareto** como fuente única de verdad para identificación de causas principales
- **Pipeline ETL** idempotente para procesamiento de archivos Excel de PQR
- **Modelo de riesgo** operacional (regresión logística) para detección de escalamientos
- **Estadísticas** descriptivas e inferenciales sobre tiempos de gestión
- **RBAC** con 11 roles definidos en Lista Maestra corporativa
- **Auditoría** inmutable con trazabilidad completa
- **Máquina de estados** para gestión de anulaciones

## Alcance

| Fase | Enfoque | Estado |
|------|---------|--------|
| A | Datos y análisis (Pareto, ETL, Risk, Stats) | Implementado |
| B | Seguridad y gobernanza (RBAC, Audit, Annulations) | Implementado |
| C | Operaciones (Migration, Capacity, Conceptual Designs) | Completado |
| D | Calidad y despliegue (CI/CD, Evidence, Compliance) | Completado |

---

## Arquitectura

### Implementada (REAL_DATA)

```
┌─────────────────────────────────────────────────────────────┐
│                     Vercel (Producción)                       │
│  ┌────────────────────┐   ┌─────────────────────────────┐   │
│  │  Next.js 14 + React│   │  Route Handlers + RBAC MW   │   │
│  │  TypeScript + Radix│──▶│  /api/charts, /api/kpis,    │   │
│  │  Tailwind + Recharts│   │  /api/annulations, /api/audit│   │
│  └────────────────────┘   └──────────────┬──────────────┘   │
└──────────────────────────────────────────┼──────────────────┘
                                           │
                                   ┌───────▼────────┐
                                   │ Neon PostgreSQL │
                                   │ (serverless)   │
                                   └───────▲────────┘
                                           │
┌──────────────────────────────────────────┼──────────────────┐
│                Backend Python (Local/CI)                      │
│  ETL Pipeline │ Risk Model │ Statistics │ Migration          │
└──────────────────────────────────────────────────────────────┘
```

### Conceptual (CONCEPTUAL_DESIGN)

- **SAP Integration**: Scripting automatizado (6 casos) — solo diseño documentado
- **Power Automate**: 8 flujos automatizados — solo diseño + mock webhook
- **R Analysis**: 6 módulos estadísticos avanzados — solo diseño documentado

---

## Stack Tecnológico

| Capa | Tecnología | Versión |
|------|------------|---------|
| Frontend | Next.js + React + TypeScript | 14.2.35 / 18.3.1 / 5.7.3 |
| UI | Tailwind CSS + Radix UI + Recharts | 3.4.17 / latest / 2.15.0 |
| Base de Datos | Neon PostgreSQL (serverless) | — |
| DB Driver | @neondatabase/serverless | ^1.1.0 |
| Auth (JWT) | jose | 5.9.6 |
| Backend | Python + FastAPI + Polars + DuckDB | 3.11+ / 0.115.6 / 1.14.0 / 1.1.3 |
| ML/Stats | scikit-learn + SciPy + Pandera | 1.6.0 / 1.14.1 / 0.21.1 |
| Tests (FE) | Vitest + Playwright | ^4.1.10 / ^1.62.1 |
| Tests (BE) | pytest + Hypothesis | 8.3.4 / 6.119.3 |
| CI/CD | GitHub Actions + Vercel | — |
| Linting | ESLint + Ruff | 8.57.1 / 0.8.4 |

---

## Requisitos del Sistema

- **Node.js** >= 20.x
- **npm** >= 10.x
- **Python** >= 3.11
- **Git** >= 2.40

---

## Instalación

### Setup Automatizado (Recomendado)

```powershell
# Desde la raíz del proyecto (Windows PowerShell)
.\scripts\setup.ps1
```

El script configura todo el entorno en < 30 minutos.

### Setup Manual

```bash
# 1. Clonar
git clone <repo-url>
cd "VantiOps 360"

# 2. Frontend
cd frontend
npm ci

# 3. Backend
cd ../backend
python -m venv .venv
.venv\Scripts\activate        # Windows
# source .venv/bin/activate   # Linux/Mac
pip install -e ".[dev]"

# 4. Entorno
cd ..
cp .env.example .env.local
# Editar .env.local con credenciales (solicitar a SYSTEM_ADMIN)
```

---

## Variables de Entorno

| Variable | Descripción | Requerida | Default |
|----------|-------------|-----------|---------|
| `DATABASE_URL` | Conexión PostgreSQL Neon | Sí | — |
| `PARETO_HIGH_CONCENTRATION_THRESHOLD` | Umbral de alta concentración Pareto | No | `0.40` |

> ⚠️ **NUNCA** commitear secretos. Credenciales solo via variables de entorno.

---

## Ejecución Local

```bash
# Frontend (desarrollo)
cd frontend
npm run dev
# Abrir http://localhost:3000

# Backend (API local — no sirve en producción)
cd backend
.venv\Scripts\activate
uvicorn src.api.main:app --reload --port 8000
```

---

## Base de Datos

- **Motor**: Neon PostgreSQL (serverless)
- **Tabla principal**: `pqr_records` (PROTEGIDA — no modificar)
- **Tablas nuevas**: RBAC, audit, annulations, migrations, partners, documents
- **Migraciones**: `database/migrations/` (001–014, con UP/DOWN)
  - 014: Partial unique index para max 1 email activo por partner
- **Seeder**: `backend/seed_neon.py`

### Migraciones

Las migraciones son idempotentes (`CREATE IF NOT EXISTS`) y reversibles:

```
database/migrations/
├── 001_create_roles.sql
├── 002_create_users.sql
├── ...
├── 013_create_operational_businesses.sql
└── 014_enforce_single_active_email.sql
```

> ❌ Operaciones destructivas prohibidas: `DROP TABLE`, `TRUNCATE`, `DELETE` sin `WHERE`

---

## Comandos

### Frontend

| Comando | Descripción |
|---------|-------------|
| `npm run dev` | Desarrollo con hot-reload |
| `npm run build` | Build de producción |
| `npm run start` | Servidor de producción local |
| `npm run lint` | Linting (ESLint) |
| `npm run typecheck` | Type checking (TypeScript) |
| `npm run test` | Tests unitarios (Vitest) |
| `npm run test:watch` | Tests en modo watch |
| `npm run test:coverage` | Tests con coverage |
| `npm run test:e2e` | Tests E2E (Playwright) |

### Backend

| Comando | Descripción |
|---------|-------------|
| `ruff check src/` | Linting (Ruff) |
| `pytest tests/` | Tests (pytest + Hypothesis) |
| `pytest --cov=src` | Tests con coverage |
| `python run_pipeline.py` | Ejecutar pipeline ETL |
| `python seed_neon.py` | Seed base de datos |

---

## Rutas Principales

### Páginas (Frontend)

| Ruta | Descripción |
|------|-------------|
| `/` | Dashboard principal (KPIs + gráficos) |
| `/rca` | Análisis de Causa Raíz |
| `/riesgo` | Modelo de Riesgo Operacional |
| `/anulaciones` | Gestión de Anulaciones |
| `/calidad` | Score de Calidad de Datos |
| `/operaciones` | Capacidad Operacional |
| `/migracion` | Migración de Registros |
| `/aliados` | Gestión de Partners |
| `/arquitectura` | Documentación de Arquitectura |
| `/evidencia` | Evidencia de Calidad |
| `/about` | Información del Proyecto |
| `/access-denied` | Acceso Denegado (RBAC) |

### API Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/charts/{chartType}` | 9 tipos de gráficos con filtros |
| GET | `/api/kpis` | KPIs agregados |
| GET | `/api/rca` | Causa principal |
| GET | `/api/filters` | Valores para filtros |
| GET | `/api/health` | Health check |
| GET | `/api/quality` | Score de calidad |
| GET | `/api/risk/model` | Modelo de riesgo (JSON) |
| GET/POST | `/api/annulations` | Gestión de anulaciones |
| POST | `/api/annulations/{id}/transition` | Transición de estado |
| GET | `/api/audit` | Logs de auditoría |
| POST | `/api/auth/validate` | Validación de email |
| GET/POST | `/api/approvals` | Aprobaciones |
| GET | `/api/capacity` | Modelo de capacidad |

---

## Datos Reales vs Simulados

| Categoría | Significado | Ejemplo |
|-----------|-------------|---------|
| `REAL_DATA` | Dato del endpoint/DB real | Registros PQR de Neon |
| `DERIVED_DATA` | Calculado de datos reales | Estadísticas, risk score |
| `SIMULATED_DATA` | Generado para test/demo | Datos de Hypothesis |
| `CONCEPTUAL_DESIGN` | Diseño futuro, no implementado | SAP, Power Automate, R |

**Reglas**:
- No presentar datos simulados como reales
- No presentar diseños conceptuales como implementados
- Toda evidencia debe ser verificable y reproducible

---

## Limitaciones Conocidas

1. **Pool de conexiones**: Máximo 2 conexiones simultáneas a Neon (suficiente para 42 usuarios con queries rápidas)
2. **Backend Python**: Motor analítico local/CI solamente — NO sirve APIs al frontend en producción
3. **SAP/Power Automate/R**: Solo diseños conceptuales documentados, no integración productiva
4. **Autenticación**: JWT local, sin federación Azure AD/Okta (futura iteración)
5. **Mobile**: Solo responsive web, no app nativa
6. **PII**: Datos de clientes reales requieren enmascaramiento previo

---

## Seguridad

- **RBAC**: 11 roles con permisos granulares (ver Lista Maestra)
- **JWT Fail-Closed**: Identidad derivada exclusivamente de JWT firmado server-side; headers del cliente ignorados en producción
- **Partner Email**: Un solo email activo por aliado (partial unique index), validación exacta para anulaciones
- **Onboarding**: Legal→VP secuencial obligatorio para PARTNER_ONBOARDING
- **Audit**: Logs inmutables (append-only), retención 12 meses
- **Secretos**: Solo via variables de entorno, nunca en código
- **Email**: Validación de dominio corporativo (@vanti.com.co)
- **DB**: No operaciones destructivas en producción
- **CI**: PR bloqueado sin CI verde + Preview validado

Para más detalles, ver `SECURITY.md`.

---

## Despliegue

### Preview (Pre-producción)

- Cada PR crea un deploy automático en Vercel Preview
- URL: `https://vantiops-360-<branch>.vercel.app`
- Validar SIEMPRE en Preview antes de merge a main

### Producción

- Dominio: `https://vantiops-360.vercel.app`
- Deploy automático al merge a `main`
- Requiere: CI verde + Preview validado + regresión aprobada

### Rollback

- Vercel permite rollback instantáneo a cualquier deploy anterior
- En caso de regresión: revertir el commit y re-deploy

---

## CI/CD Pipeline

```
Push/PR → Lint → Typecheck → Unit Tests → Coverage → Build → Playwright E2E
                                                                    ↓
                                                         Production Smoke Test
```

Archivo: `.github/workflows/ci.yml`

Condiciones para merge:
1. ✅ CI verde (todos los pasos pasan)
2. ✅ Preview validado en Vercel
3. ✅ Regresión visual aprobada (maxDiffPixelRatio=0.02, tolerancia 2%)

---

## Contribuir

### Flujo de trabajo

1. Crear rama: `git checkout -b phase-x/feature-name`
2. Desarrollar con commits atómicos (Conventional Commits)
3. Verificar localmente: lint + typecheck + tests + build
4. Push + crear PR
5. CI valida automáticamente
6. Review por al menos 1 persona
7. Merge solo con CI verde + Preview OK

### Conventional Commits

```
feat(frontend): add annulations state visualization
fix(backend): correct retry delay jitter calculation
docs: update onboarding guide
test(backend): add property test for ETL idempotency
```

### Reglas

- ❌ No commits directos a `main`
- ❌ No force push
- ❌ No skip hooks (--no-verify)
- ❌ No operaciones destructivas en DB
- ❌ No modificar componentes protegidos
- ✅ Tests obligatorios en cada PR
- ✅ ≤ 500 líneas humanas por commit
- ✅ Preview validado antes de merge

---

## Documentación

| Recurso | Ubicación |
|---------|-----------|
| Onboarding completo | `docs/onboarding.md` |
| Diccionario de Datos | `docs/data-dictionary.md` |
| ERD (Mermaid) | `docs/erd.md` |
| Política de Normalización | `docs/DATA_NORMALIZATION_POLICY.md` |
| Seguridad | `SECURITY.md` |
| Tratamiento de Datos | `DATA_TREATMENT.md` |
| Migraciones | `database/migrations/README.md` |

---

## Autoría y Licencia

- **Proyecto**: VantiOps 360
- **Autor**: Carlos Alberto Figueroa Martínez
- **Tipo**: Prototipo independiente desarrollado como respuesta a una prueba técnica
- **Licencia**: Uso académico / evaluación técnica

---

*Documentación generada y mantenida como parte del proceso de desarrollo. Verificar versión contra el último commit en `main`.*
