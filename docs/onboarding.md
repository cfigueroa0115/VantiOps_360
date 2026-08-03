# Guía de Onboarding — VantiOps 360

> Tiempo estimado para ser productivo: **≤ 5 días**  
> Tiempo de setup automatizado: **< 30 minutos**

---

## 1. Visión General del Proyecto

VantiOps 360 es una plataforma de analítica operacional para la gestión de PQR (Peticiones, Quejas y Reclamos) de Vanti, empresa de gas de Colombia. La plataforma combina un frontend de visualización con un motor analítico en Python para ETL, modelado de riesgo y estadísticas.

### Objetivos principales

- Análisis Pareto como fuente única de verdad para causas principales de PQR
- Pipeline ETL idempotente para procesamiento de archivos Excel
- Modelo de riesgo operacional (regresión logística)
- Máquina de estados para gestión de anulaciones
- RBAC con 11 roles definidos en la Lista Maestra
- Auditoría inmutable y trazabilidad completa

---

## 2. Arquitectura Implementada

### Stack Tecnológico

| Capa | Tecnología | Versión |
|------|------------|---------|
| Frontend | Next.js + React + TypeScript | 14.2.21 / 18.3.1 / 5.7.3 |
| UI | Tailwind CSS + Radix UI + Recharts | 3.4.17 / latest / 2.15.0 |
| Base de Datos | Neon PostgreSQL (serverless) | — |
| Driver DB | @neondatabase/serverless (Pool + WS) | ^1.1.0 |
| Backend (Local/CI) | Python + FastAPI + Polars + DuckDB | 3.11+ / 0.115.6 / 1.14.0 / 1.1.3 |
| ML/Stats | scikit-learn + SciPy + Pandera | 1.6.0 / 1.14.1 / 0.21.1 |
| Testing Frontend | Vitest + Playwright | ^4.1.10 / ^1.62.1 |
| Testing Backend | pytest + Hypothesis | 8.3.4 / 6.119.3 |
| CI/CD | GitHub Actions + Vercel | — |
| Linting | ESLint (frontend) + Ruff (backend) | 8.57.1 / 0.8.4 |

### Diagrama de Componentes

```
┌───────────────────────────────────────────────────────────┐
│                    Vercel (Producción)                      │
│  ┌──────────────────┐  ┌──────────────────────────────┐   │
│  │  Next.js 14 FE   │  │  Route Handlers (API)        │   │
│  │  React 18 + TS   │──│  /api/charts, /api/kpis...   │   │
│  │  Tailwind + Radix │  │  + RBAC Middleware           │   │
│  └──────────────────┘  └───────────┬──────────────────┘   │
└─────────────────────────────────────┼─────────────────────┘
                                      │ Pool + WebSocket
                              ┌───────▼───────┐
                              │ Neon PostgreSQL│
                              │ pqr_records +  │
                              │ auth + audit   │
                              └───────▲───────┘
                                      │ seed_neon.py
┌─────────────────────────────────────┼─────────────────────┐
│              Backend Python (Local / CI)                    │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐ │
│  │ ETL      │ │ Risk     │ │ Stats    │ │ Migration    │ │
│  │ Pipeline │ │ Model    │ │ Module   │ │ 600 records  │ │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────┘ │
└───────────────────────────────────────────────────────────┘
```

### Estructura del Repositorio

```
VantiOps 360/
├── frontend/               # Next.js 14 application
│   ├── app/                # App Router (pages + API routes)
│   │   ├── api/            # Route Handlers (REST endpoints)
│   │   ├── rca/            # Root Cause Analysis page
│   │   ├── riesgo/         # Risk model page
│   │   ├── anulaciones/    # Annulations state machine UI
│   │   └── ...             # Other pages
│   ├── components/         # React components (charts, kpi, layout, ui)
│   ├── lib/                # Shared utilities (server/, auth/)
│   ├── tests/              # Vitest unit tests
│   └── middleware.ts       # RBAC middleware
├── backend/                # Python analytics engine
│   ├── src/                # Source modules
│   │   ├── pipeline/       # ETL orchestrator
│   │   ├── auth/           # RBAC + email validation
│   │   ├── audit/          # Audit logger
│   │   ├── annulations/    # State machine
│   │   ├── risk/           # Risk model
│   │   ├── statistics/     # Descriptive + inference
│   │   ├── migration/      # 600-record migration
│   │   ├── core/           # Retry policy, shared utils
│   │   └── ...
│   ├── tests/              # Pytest + Hypothesis tests
│   ├── seed_neon.py        # Database seeder
│   └── pyproject.toml      # Python project config
├── database/
│   └── migrations/         # SQL migrations (001-013, UP/DOWN)
├── data/                   # Data artifacts
│   └── curated/            # Parquet + JSON outputs
├── docs/                   # Project documentation
├── .github/workflows/      # CI pipeline (GitHub Actions)
├── .env.example            # Environment template
├── vercel.json             # Vercel deployment config
└── README.md               # Project documentation
```

---

## 3. Setup del Entorno de Desarrollo

### Prerrequisitos

| Herramienta | Versión Mínima | Verificación |
|-------------|----------------|--------------|
| Node.js | 20.x | `node --version` |
| npm | 10.x | `npm --version` |
| Python | 3.11+ | `python --version` |
| Git | 2.40+ | `git --version` |

### Setup Automatizado (Recomendado)

Ejecuta el script de setup desde la raíz del proyecto:

```powershell
# Windows (PowerShell)
.\scripts\setup.ps1

# El script:
# 1. Verifica prerrequisitos (Node 20+, Python 3.11+, Git)
# 2. Instala dependencias del frontend (npm ci)
# 3. Instala dependencias del backend (pip install -e .[dev])
# 4. Copia .env.example → .env.local (si no existe)
# 5. Ejecuta verificación de salud (lint + typecheck + build)
```

### Setup Manual

```bash
# 1. Clonar repositorio
git clone <repo-url>
cd "VantiOps 360"

# 2. Frontend
cd frontend
npm ci
cd ..

# 3. Backend
cd backend
python -m venv .venv
.venv\Scripts\activate   # Windows
pip install -e ".[dev]"
cd ..

# 4. Variables de entorno
cp .env.example .env.local
# Editar .env.local con valores reales (pedir a SYSTEM_ADMIN)

# 5. Verificar
cd frontend
npm run lint
npm run typecheck
npm run build
```

### Variables de Entorno

| Variable | Descripción | Requerida |
|----------|-------------|-----------|
| `DATABASE_URL` | Conexión PostgreSQL Neon | Sí |
| `PARETO_HIGH_CONCENTRATION_THRESHOLD` | Umbral Pareto (default: 0.40) | No |

> ⚠️ **NUNCA** commitear archivos `.env` ni secretos al repositorio. Las credenciales se obtienen del SYSTEM_ADMIN.

---

## 4. Convenciones de Código

### Frontend (TypeScript)

- **Linter**: ESLint con config `next/core-web-vitals`
- **Formatter**: Prettier (config por defecto de Next.js)
- **Naming**: camelCase para variables/funciones, PascalCase para componentes/tipos
- **Imports**: Paths relativos dentro de módulo, `@/` alias para imports cruzados
- **Componentes**: Functional components con TypeScript interfaces para props
- **API Routes**: Route Handlers en `app/api/*/route.ts` (GET, POST, etc.)
- **Tests**: Co-located con `.test.ts` suffix o en `tests/` directory

### Backend (Python)

- **Linter**: Ruff (line-length: 100, target: py311)
- **Style**: PEP 8 con imports organizados (isort via Ruff)
- **Naming**: snake_case para variables/funciones, PascalCase para clases
- **Type Hints**: Obligatorios en funciones públicas
- **Tests**: Directorio `tests/` con prefijo `test_`, Hypothesis para property-based testing
- **Docstrings**: Google style para módulos públicos

### Commits (Conventional Commits)

```
<type>(<scope>): <descripción corta>

Tipos: feat, fix, docs, style, refactor, test, chore, ci
Scopes: frontend, backend, database, docs, ci

Ejemplos:
  feat(frontend): add annulations state visualization
  fix(backend): correct retry delay jitter calculation
  docs: update onboarding guide with new endpoints
  test(backend): add property test for ETL idempotency
```

### Reglas Importantes

1. **Commits atómicos**: Un commit = un propósito = un módulo (≤ 500 líneas humanas)
2. **No modificar componentes protegidos** (ver Sección 8 del design.md)
3. **No operaciones destructivas** en DB (DROP, TRUNCATE, DELETE sin WHERE)
4. **Tests obligatorios**: Todo PR debe pasar lint + typecheck + tests + build + Playwright
5. **Preview antes de producción**: Siempre validar en Vercel Preview antes de merge

---

## 5. Flujo de Trabajo con Git

### Branching Strategy

```
main (protegida)
├── phase-a/feature-name     # Fase A: Datos y análisis
├── phase-b/feature-name     # Fase B: Seguridad y gobernanza
├── phase-c/feature-name     # Fase C: Operaciones
└── phase-d/feature-name     # Fase D: Calidad y despliegue
```

### Flujo de un cambio

1. **Crear rama** desde `main`: `git checkout -b phase-x/mi-feature`
2. **Desarrollar** con commits atómicos (Conventional Commits)
3. **Verificar localmente**:
   ```bash
   cd frontend && npm run lint && npm run typecheck && npm run test && npm run build
   cd ../backend && ruff check src/ && pytest tests/
   ```
4. **Push** y crear Pull Request
5. **CI verifica**: lint → typecheck → tests → build → Playwright
6. **Review**: Al menos 1 reviewer aprueba
7. **Preview**: Vercel despliega preview automáticamente
8. **Merge**: Solo si CI verde + Preview OK + regresión aprobada

### Reglas de Merge

- ❌ **NO** merge directo a `main` sin CI verde
- ❌ **NO** force push a `main`
- ❌ **NO** skip hooks (--no-verify)
- ✅ Squash merge preferido para features complejas
- ✅ Rebase preferido para mantener historial limpio en ramas cortas

---

## 6. Testing

### Frontend (Vitest + Playwright)

```bash
cd frontend

# Unit tests
npm run test              # Ejecutar una vez
npm run test:watch        # Watch mode (desarrollo)
npm run test:coverage     # Con coverage

# E2E tests
npm run test:e2e          # Playwright (requiere build previo)
```

- **Unit tests**: `vitest` con `@testing-library/react` y `jsdom`
- **E2E tests**: Playwright con Chromium
- **Coverage mínimo**: Se reporta como artefacto en CI

### Backend (pytest + Hypothesis)

```bash
cd backend

# Activar venv
.venv\Scripts\activate    # Windows

# Ejecutar tests
pytest                    # Todos los tests
pytest tests/ -v          # Verbose
pytest --cov=src          # Con coverage
pytest -k "test_retry"   # Filtrar por nombre
```

- **Unit tests**: pytest estándar
- **Property-based tests**: Hypothesis para propiedades universales
- **Linting**: `ruff check src/` antes de tests

### Estrategia de Testing

| Tipo | Herramienta | Qué verifica |
|------|-------------|--------------|
| Unit (FE) | Vitest | Funciones, componentes, hooks |
| Unit (BE) | pytest | Módulos, funciones, clases |
| Property | Hypothesis | Propiedades universales (bounds, invariants) |
| E2E | Playwright | Flujos completos en navegador |
| Visual | Screenshots | Regresión visual (0.1% threshold) |

---

## 7. RBAC — Roles del Sistema

| Rol | Accesos principales |
|-----|---------------------|
| SYSTEM_ADMIN | Acceso total, gestión de usuarios |
| OPERATIONS_LEAD | Lectura + análisis + reportes + capacidad |
| ANALYST | Lectura + análisis + reportes |
| LEGAL_APPROVER | Lectura + aprobación legal |
| VP_APPROVER | Lectura + aprobación VP |
| BUSINESS_OWNER | Lectura + reportes + aprobaciones operativas |
| AUDITOR | Lectura + logs de auditoría |
| PARTNER_ADMIN | Gestión de su organización |
| PARTNER_OPERATOR | Lectura + operaciones delegadas |
| CONTRACTOR_OPERATOR | Lectura + análisis |
| INTERN_READONLY | Solo lectura + ingesta de datos |

> **Nuevo ingeniero**: Se asigna acceso a **Preview** únicamente. Acceso a **Producción** requiere aprobación explícita de SYSTEM_ADMIN.

---

## 8. Clasificación de Datos

Todo dato en el sistema tiene una proveniencia:

| Categoría | Significado |
|-----------|-------------|
| `REAL_DATA` | Dato del endpoint real o Neon PostgreSQL |
| `DERIVED_DATA` | Calculado a partir de datos reales |
| `SIMULATED_DATA` | Generado para tests/demos |
| `CONCEPTUAL_DESIGN` | Diseño futuro, no implementado |

**Reglas estrictas**:
- No presentar datos simulados como reales
- No presentar diseños conceptuales como implementados
- Toda evidencia debe ser verificable y reproducible

---

## 9. Recursos Adicionales

| Documento | Ubicación |
|-----------|-----------|
| Diccionario de Datos | `docs/data-dictionary.md` |
| ERD (Mermaid) | `docs/erd.md` |
| Política de Normalización | `docs/DATA_NORMALIZATION_POLICY.md` |
| Seguridad | `SECURITY.md` |
| Tratamiento de Datos | `DATA_TREATMENT.md` |
| Migraciones DB | `database/migrations/README.md` |
| CI Pipeline | `.github/workflows/ci.yml` |

---

## 10. Checklist del Primer Día

- [ ] Clonar repositorio y ejecutar `scripts/setup.ps1`
- [ ] Verificar que `npm run build` completa sin errores
- [ ] Revisar `.env.example` y obtener credenciales del SYSTEM_ADMIN
- [ ] Ejecutar `npm run dev` y acceder a `http://localhost:3000`
- [ ] Revisar la documentación de arquitectura en `docs/`
- [ ] Ejecutar tests: `npm run test` (frontend) y `pytest` (backend)
- [ ] Leer este documento completo
- [ ] Hacer un PR pequeño (fix typo, mejorar docs) para familiarizarse con el flujo
