# Requirements Document

## Introduction

VantiOps 360 es una plataforma empresarial de analítica operacional para Vanti (empresa de gas de Colombia) que gestiona el análisis de PQR (Peticiones, Quejas y Reclamos). Este documento define los requisitos funcionales, no funcionales y restricciones para la implementación completa del Master Prompt de 24 bloques, distribuidos en 4 fases de ejecución (A, B, C, D). La plataforma ya cuenta con un frontend funcional (Next.js/React) y un backend operativo (Python/FastAPI) que NO deben modificarse en su funcionalidad existente.

### Clasificación de Nivel de Datos

Cada requisito indica su nivel de implementación:

- **REAL_DATA**: Dato proveniente del endpoint real de API o base de datos Neon PostgreSQL.
- **DERIVED_DATA**: Dato calculado a partir de datos reales mediante transformación verificable.
- **SIMULATED_DATA**: Dato generado sintéticamente para pruebas, demos o desarrollo.
- **CONCEPTUAL_DESIGN**: Diseño técnico documentado que representa una solución futura no conectada a sistemas productivos.

Reglas de integridad:
- No presentar datos simulados como reales.
- No presentar arquitectura conceptual como implementada.
- No presentar integraciones futuras como productivas.
- Evidencia debe contener únicamente métricas verificables.
- Los supuestos deben ser visibles y configurables.

### Lista Maestra de Roles (RBAC)

Todos los requisitos de permisos, aprobaciones, reportes, auditoría y acceso utilizan exclusivamente esta lista:

| Rol | Descripción | Permisos Base |
|-----|-------------|---------------|
| SYSTEM_ADMIN | Administrador del sistema técnico | Acceso total a configuración, gestión de usuarios, todos los módulos |
| OPERATIONS_LEAD | Líder de operaciones / Supervisor | Lectura + análisis + reportes + gestión de capacidad + alertas |
| ANALYST | Analista de operaciones PQR | Lectura + análisis + reportes |
| LEGAL_APPROVER | Aprobador legal corporativo | Lectura + aprobación de operaciones legales |
| VP_APPROVER | Aprobador VP corporativo | Lectura + aprobación de operaciones de VP |
| BUSINESS_OWNER | Empleado de negocio (antes "Negocio") | Lectura + reportes + aprobaciones operativas |
| AUDITOR | Auditor interno/externo | Lectura + consulta de logs de auditoría |
| PARTNER_ADMIN | Administrador de socio/partner | Gestión de usuarios de su organización + lectura |
| PARTNER_OPERATOR | Operador de socio/partner | Lectura + operaciones delegadas |
| CONTRACTOR_OPERATOR | Contratista (antes "Contratista") | Lectura + análisis |
| INTERN_READONLY | Pasante (antes "Pasante") | Lectura + ingesta de datos |

Nota: "Desarrollador" no es un rol funcional del sistema; es un actor técnico de mantenimiento que no pertenece al RBAC de negocio.

## Glossary

- **Sistema_VantiOps**: Plataforma VantiOps 360 completa (frontend + backend + base de datos)
- **Pipeline_ETL**: Proceso de extracción, transformación y carga de datos PQR
- **Motor_Pareto**: Módulo de análisis de causa raíz basado en principio de Pareto
- **Módulo_RCA**: Módulo de Root Cause Analysis (Análisis de Causa Raíz)
- **Motor_Riesgo**: Módulo de modelo predictivo de riesgo operacional
- **Módulo_Calidad**: Módulo de evaluación de calidad de datos con 6 dimensiones
- **Módulo_Estadísticas**: Módulo de estadística descriptiva e inferencial
- **Motor_Anulaciones**: Máquina de estados para gestión de anulaciones
- **Sistema_RBAC**: Sistema de Control de Acceso Basado en Roles (ver Lista Maestra de Roles)
- **Sistema_Auditoría**: Módulo de logging y trazabilidad de acciones
- **Módulo_Migración**: Módulo de migración de 600 registros maestros
- **Pipeline_SAP**: Diseño conceptual de integración con SAP mediante scripting automatizado
- **Motor_PowerAutomate**: Diseño conceptual de flujos automatizados vía Microsoft Power Automate
- **Módulo_R**: Diseño analítico conceptual de scripts de análisis estadístico en R
- **Sistema_CI_CD**: Pipeline de integración y despliegue continuo (GitHub Actions)
- **Entorno_Preview**: Ambiente de pre-producción en Vercel Preview
- **Entorno_Producción**: Ambiente productivo en Vercel + Neon PostgreSQL
- **Dato_Real**: Dato proveniente del endpoint real de API o base de datos Neon
- **Dato_Derivado**: Dato calculado a partir de datos reales mediante transformación
- **Dato_Simulado**: Dato generado sintéticamente para pruebas o demo
- **Dato_Conceptual**: Dato que representa un concepto futuro no implementado aún
- **Registro_Maestro**: Registro PQR completo con todos los campos del diccionario de datos
- **Matriz_Trazabilidad**: Tabla que vincula requisito → implementación → prueba → evidencia
- **Baseline**: Estado verificado del sistema antes de cualquier modificación
- **Regresión**: Fallo en funcionalidad previamente operativa causado por un cambio nuevo
- **highConcentrationThreshold**: Umbral configurable (default 40%) para indicar alta concentración de una causa en el análisis Pareto
- **Política_Reintentos**: Política centralizada de reintentos definida en Requirement 37

## Requirements

### Requirement 1: [Constraint] Protección de Funcionalidad Existente

**User Story:** Como propietario del producto, quiero que la funcionalidad existente permanezca intacta, para que los usuarios actuales no pierdan acceso ni experimenten regresiones.

#### Acceptance Criteria

1. THE Sistema_VantiOps SHALL preservar sin modificación el layout, sidebar, logo, nombre "VantiOps 360", navegación, colores, footer, autoría, filtros, imágenes BPMN y dashboard existente, verificado mediante comparación visual de capturas de pantalla con una tolerancia máxima de diferencia de píxeles del 0.1% por página y mediante la ejecución exitosa de todos los tests E2E existentes sobre las rutas protegidas
2. WHEN se inicie una Pull Request o push a la rama principal, THE Sistema_CI_CD SHALL ejecutar en secuencia: lint, typecheck, tests unitarios, build y tests Playwright, considerando el Baseline aprobado únicamente cuando los 5 pasos completen sin errores (exit code 0) en un tiempo máximo de 15 minutos
3. WHEN se inicie una Pull Request o push a la rama principal, THE Sistema_CI_CD SHALL almacenar capturas de pantalla de todas las rutas protegidas del Baseline como artefactos en el directorio frontend/artifacts/screenshots/ antes de aplicar los cambios del PR
4. IF alguno de los 5 pasos del pipeline de CI (lint, typecheck, tests unitarios, build, Playwright) falla durante la ejecución activa del pipeline, THEN THE Sistema_CI_CD SHALL detener la ejecución del pipeline, reportar el paso fallido en el resumen del job y marcar el PR como bloqueado hasta que una ejecución posterior pase todos los pasos exitosamente
5. THE Sistema_VantiOps SHALL realizar cambios incrementales con commits atómicos donde cada commit corresponde a un solo propósito y modifica archivos pertenecientes a un único módulo del proyecto (frontend, backend, configuración CI, o documentación), con preferencia de hasta 500 líneas de código humano modificado, excluyendo del conteo: package-lock.json, archivos generados, reportes, cobertura, snapshots, binarios, imágenes y artifacts; las excepciones deben documentarse en el mensaje o descripción del PR y ningún límite de líneas debe obligar a dividir artificialmente una unidad funcional coherente

### Requirement 2: [Constraint] Gestión de Ramas y Despliegue

**User Story:** Como líder técnico, quiero que todo desarrollo se realice en ramas separadas, para que main permanezca estable y producción no se vea afectada.

#### Acceptance Criteria

1. THE Sistema_VantiOps SHALL crear una nueva rama para cada fase de ejecución, sin trabajar directamente sobre main
2. IF se intenta hacer merge a main sin CI verde, Preview validado y pruebas de regresión aprobadas, THEN THE Sistema_CI_CD SHALL rechazar el merge; las tres condiciones son obligatorias y el merge se rechaza si cualquiera de ellas falla
3. WHEN se complete cada fase, THE Sistema_VantiOps SHALL entregar un reporte con: estado de cada requisito, pruebas ejecutadas con resultado, evidencia generada, archivos modificados y riesgos identificados

### Requirement 3: [Constraint] Integridad de Datos

**User Story:** Como oficial de seguridad, quiero que el sistema proteja datos sensibles, para cumplir con regulaciones de protección de datos colombianas.

#### Acceptance Criteria

1. THE Sistema_VantiOps SHALL NO ejecutar migraciones destructivas (DROP TABLE, TRUNCATE, DELETE sin WHERE) sobre la base de datos Neon PostgreSQL
2. THE Sistema_VantiOps SHALL NO subir secretos ni datos personales al repositorio; las credenciales provienen exclusivamente de variables de entorno (no se permiten otras fuentes como AWS Secrets Manager o HashiCorp Vault como alternativa)
3. THE Sistema_VantiOps SHALL NO usar datos hardcodeados cuando exista un endpoint real disponible
4. THE Sistema_VantiOps SHALL NO inventar métricas, tecnologías, pruebas, cobertura ni despliegues; toda evidencia debe ser verificable y reproducible

### Requirement 4: [Constraint] Criterio de Finalización

**User Story:** Como gerente de proyecto, quiero criterios claros de finalización, para saber exactamente cuándo una fase está completa.

#### Acceptance Criteria

1. THE Sistema_VantiOps SHALL declarar una fase como terminada SOLO cuando todos los criterios de aceptación de los requisitos de esa fase sean PASS o PASS CON LIMITACIÓN EXPLÍCITA documentada
2. THE Sistema_VantiOps SHALL NO solicitar autorización entre bloques; la ejecución continúa según la especificación
3. WHEN se complete cada fase, THE Sistema_VantiOps SHALL entregar: estado de cada criterio, pruebas ejecutadas, evidencia generada, archivos modificados y riesgos identificados con plan de mitigación

---

### Requirement 5: [Functional] Pareto como Fuente Única de Verdad (Bloque A-1)

**User Story:** Como analista de operaciones, quiero que el análisis Pareto sea la fuente única de verdad para la identificación de causas principales, para que todas las decisiones se basen en datos consistentes.

**Nivel de datos:** REAL_DATA + DERIVED_DATA

#### Acceptance Criteria

1. THE Motor_Pareto SHALL ser el único componente que calcula y expone datos de identificación de causa principal de PQR; el módulo RCA y el Dashboard deberán utilizar el mismo endpoint y contrato de Pareto como única fuente de verdad
2. WHEN el frontend (Dashboard) requiera datos de Pareto, THE Sistema_VantiOps SHALL consumir exclusivamente el endpoint GET /api/charts/pareto sin almacenar copias locales del resultado entre solicitudes
3. THE Módulo_RCA SHALL obtener datos de Pareto únicamente desde el endpoint GET /api/charts/pareto, sin definir ni utilizar variables locales que contengan datos de Pareto precalculados; no debe existir una fuente local alternativa (como PARETO_DATA)
4. WHEN los datos del endpoint GET /api/charts/pareto cambien, THE Motor_Pareto SHALL reflejar los cambios en las respuestas subsiguientes en un tiempo máximo de 2 segundos desde la actualización de la fuente de datos, sin utilizar caché local estática
5. WHEN el Motor_Pareto identifica que la causa con mayor frecuencia supera el valor configurable highConcentrationThreshold (default 40%) del total de registros PQR, THE Motor_Pareto SHALL marcarla como causa de alta concentración y retornar el campo high_concentration con valor verdadero y el campo concentration_pct con el porcentaje observado; esto indica prioridad analítica pero NO confirma causalidad por sí solo
6. THE Motor_Pareto SHALL diferenciar tres niveles: (a) concentración estadística (high_concentration=true), (b) hipótesis causal (requiere triangulación con evidencia del proceso, 5 porqués, Ishikawa o FMEA), y (c) causa raíz validada (requiere validación de expertos del negocio); el endpoint retornará el campo analysis_level con uno de estos tres valores
7. IF el endpoint GET /api/charts/pareto no está disponible o retorna un error, THEN THE Sistema_VantiOps SHALL mostrar un estado controlado de indisponibilidad al usuario (sin cifras de respaldo inventadas) y aplicar la Política_Reintentos definida en Requirement 37
8. THE Sistema_CI_CD SHALL incluir una prueba automatizada que verifique la consistencia entre el módulo RCA y el Dashboard: ambos deben mostrar la misma causa principal, el mismo porcentaje y respetar los mismos filtros aplicados

### Requirement 6: [Functional] Clasificación de Datos — Real vs Simulado (Bloque A-2)

**User Story:** Como auditor, quiero distinguir claramente entre datos reales y simulados, para garantizar la integridad de los reportes regulatorios.

**Nivel de datos:** REAL_DATA (clasificación)

#### Acceptance Criteria

1. THE Sistema_VantiOps SHALL clasificar cada campo de datos en una de cuatro categorías: REAL_DATA, DERIVED_DATA, SIMULATED_DATA o CONCEPTUAL_DESIGN
2. THE Sistema_VantiOps SHALL documentar la clasificación de datos en el diccionario de datos con columna de origen, método de obtención y fecha de última verificación
3. WHEN se presente un dato en el dashboard, THE Sistema_VantiOps SHALL indicar visualmente si proviene de fuente real o simulada mediante un indicador iconográfico o tooltip consistente
4. THE Pipeline_ETL SHALL priorizar siempre REAL_DATA sobre SIMULATED_DATA cuando ambas fuentes estén disponibles para un mismo campo
5. IF un endpoint real está disponible para un campo, THEN THE Sistema_VantiOps SHALL consumir el endpoint real y NO usar datos hardcodeados ni simulados para ese campo

### Requirement 7: [Functional] Modelo de Riesgo Operacional (Bloque A-3)

**User Story:** Como gerente de riesgo, quiero un modelo predictivo que identifique PQR con alta probabilidad de escalamiento, para tomar acciones preventivas.

**Nivel de datos:** DERIVED_DATA

#### Acceptance Criteria

1. THE Motor_Riesgo SHALL implementar un modelo de regresión logística para clasificar PQR según probabilidad de escalamiento
2. THE Motor_Riesgo SHALL reportar métricas de evaluación: precision, recall, F1-score y ROC-AUC calculadas sobre un conjunto de validación documentado
3. THE Motor_Riesgo SHALL calcular la importancia relativa de cada feature y exponerla vía GET /api/risk/model con estructura JSON documentada
4. THE Motor_Riesgo SHALL incluir un disclaimer visible indicando que es una demostración analítica y NO un modelo de producción para toma de decisiones automatizada
5. WHEN se ejecute el pipeline de riesgo, THE Motor_Riesgo SHALL guardar los resultados en data/curated/risk_model_results.json con timestamp de ejecución y versión del modelo

### Requirement 8: [Functional] Diccionario de Datos (Bloque A-4)

**User Story:** Como ingeniero de datos, quiero un diccionario de datos completo y versionado, para que todo el equipo entienda la semántica de cada campo.

**Nivel de datos:** REAL_DATA (documentación)

#### Acceptance Criteria

1. THE Sistema_VantiOps SHALL mantener un diccionario de datos como entregable inicial obligatorio que documente cada campo con: nombre, tipo, descripción, origen (REAL_DATA/DERIVED_DATA/SIMULATED_DATA/CONCEPTUAL_DESIGN), regla de validación y ejemplo
2. THE Pipeline_ETL SHALL validar los registros ingestados contra las reglas del diccionario de datos antes de la etapa de enriquecimiento
3. WHEN se agregue un campo nuevo al modelo de datos, THE Sistema_VantiOps SHALL actualizar el diccionario de datos en el mismo PR que implementa el campo, antes de hacer merge
4. THE Sistema_VantiOps SHALL exponer el diccionario de datos como artefacto versionado en el repositorio (docs/data-dictionary.md)
5. THE Sistema_VantiOps SHALL seguir la secuencia: (1) inventariar campos actuales, (2) crear diccionario inicial, (3) marcar campos fuente/derivados/futuros, (4) implementar cambios, (5) actualizar diccionario en el mismo PR; sin dependencia circular entre este requisito y el pipeline ETL

### Requirement 9: [Functional] Estadísticas Descriptivas e Inferenciales (Bloque A-5)

**User Story:** Como científico de datos, quiero módulos estadísticos validados, para generar insights confiables sobre los patrones de PQR.

**Nivel de datos:** DERIVED_DATA

#### Acceptance Criteria

1. THE Módulo_Estadísticas SHALL calcular estadísticos descriptivos (media, mediana, P90, P95, máximo, desviación estándar) para el campo tiempo_gestion_dias
2. THE Módulo_Estadísticas SHALL realizar pruebas de inferencia estadística (test de normalidad Shapiro-Wilk, intervalos de confianza al 95%) sobre las distribuciones de tiempo de gestión
3. WHEN el conteo de un grupo sea menor a 5 registros, THE Módulo_Estadísticas SHALL excluir ese grupo de los reportes para protección de privacidad (MIN_GROUP_SIZE = 5)
4. THE Módulo_Estadísticas SHALL exponer los resultados vía los endpoints GET /api/kpis y GET /api/charts/{chart_type} con estructura JSON documentada; los endpoints se consideran conformes únicamente cuando su estructura JSON está documentada en el contrato de API
5. THE Módulo_Estadísticas SHALL recalcular los estadísticos cada vez que se ejecute el pipeline ETL con datos nuevos, registrando timestamp de último cálculo

### Requirement 10: [Functional] ETL y Pipeline de Datos (Bloque A-6)

**User Story:** Como ingeniero de datos, quiero un pipeline ETL robusto e idempotente, para procesar archivos Excel de PQR de forma confiable y repetible.

**Nivel de datos:** REAL_DATA → DERIVED_DATA

#### Acceptance Criteria

1. THE Pipeline_ETL SHALL computar el hash SHA-256 del archivo fuente antes de iniciar el procesamiento y verificar su existencia en la tabla de control (serving/control_table.json); IF el hash ya existe con estado "completed", THEN THE Pipeline_ETL SHALL omitir el reprocesamiento y retornar un resultado indicando que el archivo ya fue procesado, sin modificar los datos curados existentes
2. THE Pipeline_ETL SHALL ejecutar las etapas ingest → profile → validate → enrich → serve en ese orden secuencial; IF una etapa falla después de agotar los reintentos (ver Requirement 37 — Política_Reintentos), THEN THE Pipeline_ETL SHALL detener la ejecución, registrar el batch con estado "failed" en la tabla de control y retornar un resultado con la lista de errores encontrados
3. WHEN un registro falle validación, THE Pipeline_ETL SHALL enviar el registro a cuarentena (staging/quarantine.parquet) con los campos: rule_id (identificador de la regla violada), reason (descripción de la falla) y quarantine_timestamp (marca temporal ISO-8601 UTC)
4. THE Pipeline_ETL SHALL aplicar la Política_Reintentos definida en Requirement 37 para errores transitorios de I/O; los errores de validación de datos NO se reintentan sino que se envían a cuarentena
5. THE Pipeline_ETL SHALL escribir datos curados en formato Parquet con compresión snappy en data/curated/ usando como nombre de archivo {nombre_fuente_sin_extensión}_curated.parquet
6. WHEN el pipeline complete exitosamente, THE Pipeline_ETL SHALL actualizar la tabla de control (serving/control_table.json) agregando una entrada con: batch_id (UUID v4), source_file_hash, records_ingested, records_validated, records_quarantined, processing_duration_seconds y status "completed"
7. IF el pipeline falla en cualquier etapa, THEN THE Pipeline_ETL SHALL detener inmediatamente la ejecución sin escribir datos curados parciales de la ejecución actual, registrar en la tabla de control una entrada con status "failed", el batch_id, source_file_hash, processing_duration_seconds y la lista de errores, preservando los datos curados previos sin modificación

---

### Requirement 11: [Functional] Diagrama Entidad-Relación (Bloque B-1)

**User Story:** Como arquitecto de datos, quiero un ERD documentado y actualizado, para que el equipo comprenda las relaciones entre entidades del dominio PQR.

**Nivel de datos:** REAL_DATA (documentación de esquema)

#### Acceptance Criteria

1. THE Sistema_VantiOps SHALL documentar un ERD que incluya las entidades: PQR, Causa, Canal, Empresa, Unidad_Responsable, Estado, Resultado y sus relaciones con cardinalidad explícita
2. THE Sistema_VantiOps SHALL versionar el ERD como artefacto del repositorio en formato Mermaid (docs/erd.md) reproducible desde texto
3. WHEN se agregue una nueva entidad al modelo, THE Sistema_VantiOps SHALL actualizar el ERD en el mismo PR antes de implementar la migración correspondiente

### Requirement 12: [Functional] Migraciones de Base de Datos (Bloque B-2)

**User Story:** Como DBA, quiero migraciones controladas y reversibles, para que los cambios en el esquema sean seguros y trazables.

**Nivel de datos:** REAL_DATA (esquema)

#### Acceptance Criteria

1. THE Sistema_VantiOps SHALL ejecutar migraciones de esquema de forma versionada y reversible (up/down) con archivos numerados secuencialmente
2. THE Sistema_VantiOps SHALL NO ejecutar migraciones destructivas (DROP TABLE, TRUNCATE) en datos de producción
3. WHEN una migración falle, THEN THE Sistema_VantiOps SHALL revertir automáticamente al estado anterior (rollback) y registrar el error con timestamp y detalle
4. THE Sistema_VantiOps SHALL validar la migración en Entorno_Preview antes de aplicarla en Entorno_Producción; la validación en Preview es un prerequisito obligatorio para cualquier ejecución en producción

### Requirement 13: [Functional] Control de Acceso Basado en Roles — RBAC (Bloque B-3)

**User Story:** Como oficial de seguridad, quiero un sistema RBAC granular, para que cada usuario acceda solo a las funcionalidades autorizadas para su rol.

**Nivel de datos:** REAL_DATA (usuarios y permisos)

#### Acceptance Criteria

1. THE Sistema_RBAC SHALL implementar los roles definidos en la Lista Maestra de Roles (ver Introducción) con sus permisos asociados: SYSTEM_ADMIN (acceso total), OPERATIONS_LEAD (lectura + análisis + reportes + gestión), ANALYST (lectura + análisis + reportes), LEGAL_APPROVER (lectura + aprobación legal), VP_APPROVER (lectura + aprobación VP), BUSINESS_OWNER (lectura + reportes + aprobaciones operativas), AUDITOR (lectura + logs de auditoría), PARTNER_ADMIN (gestión de su organización), PARTNER_OPERATOR (lectura + operaciones delegadas), CONTRACTOR_OPERATOR (lectura + análisis), INTERN_READONLY (lectura + ingesta)
2. THE Sistema_RBAC SHALL asignar exactamente un rol activo por usuario y restringir el acceso a endpoints y páginas exclusivamente a las funcionalidades definidas en la matriz de permisos de su rol asignado
3. IF un usuario sin rol autorizado o sin rol asignado intenta acceder a un recurso protegido, THEN THE Sistema_RBAC SHALL denegar la solicitud con código HTTP 403, retornar un mensaje indicando permisos insuficientes y presentar una página de acceso denegado en el frontend
4. THE Sistema_RBAC SHALL validar permisos en el frontend redirigiendo al usuario a una página de acceso denegado cuando intente navegar a una ruta no autorizada, y en el backend rechazando la petición en un tiempo no mayor a 500 milisegundos desde la recepción de la solicitud
5. THE Sistema_RBAC SHALL registrar cada intento de acceso denegado en el Sistema_Auditoría incluyendo: timestamp ISO-8601, identificador del usuario, recurso solicitado, rol actual del usuario y dirección IP de origen
6. IF un usuario autenticado no tiene ningún rol asignado en el sistema, THEN THE Sistema_RBAC SHALL denegar el acceso a todos los recursos protegidos y presentar un mensaje indicando que debe contactar al administrador (SYSTEM_ADMIN) para obtener un rol

### Requirement 14: [Functional] Auditoría y Trazabilidad (Bloque B-4)

**User Story:** Como auditor interno, quiero un log completo de acciones del sistema, para cumplir con requisitos regulatorios y de compliance.

**Nivel de datos:** REAL_DATA (logs)

#### Acceptance Criteria

1. THE Sistema_Auditoría SHALL registrar cada acción relevante con: timestamp ISO-8601 UTC, usuario (identificador), acción (verbo), recurso (path/entidad), resultado (éxito/fallo) y dirección IP de origen
2. THE Sistema_Auditoría SHALL almacenar los logs de auditoría de forma inmutable (append-only) sin permitir modificación ni eliminación de registros existentes; tanto la modificación como la eliminación están prohibidas
3. WHEN se acceda a datos sensibles o se modifique un registro, THE Sistema_Auditoría SHALL generar un registro de auditoría de forma síncrona antes de retornar la respuesta al cliente
4. THE Sistema_Auditoría SHALL retener logs de auditoría de forma inmutable por un mínimo de 12 meses accesibles para consulta; los logs no pueden ser eliminados ni modificados durante el período de retención
5. THE Sistema_Auditoría SHALL permitir consultas filtradas por: rango de fecha, identificador de usuario, tipo de acción y recurso afectado, con paginación

### Requirement 15: [Functional] Aprobaciones Legales y VP (Bloque B-5)

**User Story:** Como gerente legal, quiero que las operaciones críticas requieran aprobación explícita, para cumplir con la gobernanza corporativa de Vanti.

**Nivel de datos:** REAL_DATA (workflow)

#### Acceptance Criteria

1. WHEN una operación requiera aprobación legal (LEGAL_APPROVER) o de VP (VP_APPROVER), THE Sistema_VantiOps SHALL bloquear la ejecución hasta recibir aprobación electrónica del aprobador con rol correspondiente; una vez recibida la aprobación, la ejecución se desbloquea automáticamente sin intervención adicional
2. THE Sistema_VantiOps SHALL mantener un registro de aprobaciones con: aprobador (identificador y rol), fecha ISO-8601, operación aprobada, justificación (mínimo 10 caracteres) y estado
3. THE Sistema_VantiOps SHALL definir las operaciones que requieren aprobación: migraciones a producción, cambios de roles RBAC, eliminación de datos y cambios en configuración de seguridad
4. IF una operación aprobada no se ejecuta dentro de 72 horas, THEN THE Sistema_VantiOps SHALL marcar la aprobación como inválida, bloquear activamente la ejecución de la operación asociada y requerir una nueva solicitud de aprobación

### Requirement 16: [Functional] Máquina de Estados de Anulaciones (Bloque B-6)

**User Story:** Como analista de calidad, quiero un flujo de anulaciones formal con estados definidos, para que cada anulación siga el proceso establecido por regulación.

**Nivel de datos:** REAL_DATA (estados)

#### Acceptance Criteria

1. THE Motor_Anulaciones SHALL implementar la máquina de estados con los estados: Solicitada, En_Revisión, Aprobada, Ejecutada, Cerrada y Rechazada, donde Cerrada y Rechazada son estados terminales sin transiciones de salida
2. THE Motor_Anulaciones SHALL permitir únicamente las siguientes transiciones válidas: Solicitada → En_Revisión, En_Revisión → Aprobada, En_Revisión → Rechazada, Aprobada → Ejecutada, Ejecutada → Cerrada; cualquier otra transición se considera inválida
3. WHEN una anulación cambie de estado, THE Motor_Anulaciones SHALL registrar la transición en el Sistema_Auditoría con: usuario (identificador y rol), timestamp ISO-8601 UTC y justificación obligatoria de al menos 10 caracteres
4. THE Motor_Anulaciones SHALL exponer el estado actual y el historial de transiciones (incluyendo estado_origen, estado_destino, usuario, timestamp y justificación de cada transición) vía API REST con paginación
5. IF se intenta una transición inválida, THEN THE Motor_Anulaciones SHALL rechazar la operación con código HTTP 422 y un mensaje de error que indique el estado actual, el estado destino solicitado y las transiciones permitidas desde el estado actual
6. IF una solicitud de transición no incluye justificación o la justificación contiene menos de 10 caracteres, THEN THE Motor_Anulaciones SHALL rechazar la operación con código HTTP 400 indicando que la justificación es obligatoria y el largo mínimo requerido

### Requirement 17: [Functional] Email Autorizado (Bloque B-7)

**User Story:** Como administrador de seguridad, quiero que solo emails corporativos autorizados accedan al sistema, para prevenir accesos no autorizados.

**Nivel de datos:** REAL_DATA (directorio)

#### Acceptance Criteria

1. THE Sistema_RBAC SHALL validar que el email del usuario pertenezca al dominio corporativo autorizado (@vanti.com.co o dominios explícitamente permitidos en configuración)
2. WHEN un email no autorizado intente autenticarse, THEN THE Sistema_RBAC SHALL denegar el acceso con código HTTP 403 y registrar el intento en Sistema_Auditoría con: email (validado que coincide con el email del intento), timestamp (no negativo), IP y motivo de rechazo (de una lista predefinida de razones)
3. THE Sistema_RBAC SHALL mantener una lista blanca de emails externos autorizados con fecha de expiración configurable por entrada
4. THE Sistema_VantiOps SHALL gestionar hasta 2,000 direcciones de email autorizadas simultáneamente sin degradación de rendimiento en la validación

### Requirement 18: [Functional] Pruebas de Acceso Denegado (Bloque B-8)

**User Story:** Como ingeniero de QA, quiero pruebas automatizadas de acceso denegado, para verificar que el RBAC funciona correctamente en cada despliegue.

**Nivel de datos:** SIMULATED_DATA (test)

#### Acceptance Criteria

1. THE Sistema_CI_CD SHALL incluir pruebas automatizadas que verifiquen respuesta HTTP 403 para usuarios sin permisos en cada endpoint protegido, cubriendo al menos los roles INTERN_READONLY, CONTRACTOR_OPERATOR y AUDITOR contra endpoints administrativos
2. THE Sistema_CI_CD SHALL incluir pruebas automatizadas que verifiquen acceso exitoso HTTP 200 para usuarios con permisos correctos según la matriz de permisos de la Lista Maestra de Roles, con cobertura de al menos un endpoint y un rol por suite de pruebas (cobertura no-cero obligatoria)
3. WHEN se agregue un nuevo endpoint protegido, THE Sistema_CI_CD SHALL bloquear inmediatamente el merge si no se incluye al menos una prueba de acceso denegado y una de acceso permitido para dicho endpoint en el mismo PR
4. THE Sistema_CI_CD SHALL ejecutar las pruebas de acceso denegado en cada PR automáticamente como parte del pipeline de CI

---

### Requirement 19: [Functional] Migración de 600 Registros Maestros (Bloque C-1)

**User Story:** Como líder de datos, quiero migrar los 600 registros maestros PQR existentes al nuevo modelo, para consolidar la información histórica en la plataforma.

**Nivel de datos:** REAL_DATA (PQR)

#### Acceptance Criteria

1. THE Módulo_Migración SHALL migrar los 600 registros maestros PQR existentes al esquema normalizado de Neon PostgreSQL, completando el proceso end-to-end (perfilamiento + limpieza + validación + carga + reconciliación + reporte) en un máximo de 10 minutos para la totalidad del lote en el entorno de CI/Preview
2. THE Módulo_Migración SHALL validar cada registro contra las reglas del diccionario de datos y el esquema Pandera (tipos, dominios permitidos, campos obligatorios) antes de inserción
3. WHEN un registro falle validación durante migración, THE Módulo_Migración SHALL enviar el registro a cuarentena en el archivo staging/migration_quarantine.parquet incluyendo: identificador del registro, nombre del campo que falló, regla violada y valor rechazado
4. IF la conexión a Neon PostgreSQL falla durante la migración, THEN THE Módulo_Migración SHALL aplicar la Política_Reintentos definida en Requirement 37 y registrar el error con timestamp y detalle de la falla si todos los reintentos se agotan
5. THE Módulo_Migración SHALL generar un reporte post-migración con: total migrados, total en cuarentena, total rechazados, tasa de éxito (porcentaje de registros migrados sobre el total) y duración del proceso en segundos
6. THE Módulo_Migración SHALL considerar la migración como exitosa únicamente cuando la tasa de éxito sea igual o superior al 95% (570 de 600 registros migrados sin error)
7. THE Módulo_Migración SHALL ser ejecutable de forma idempotente utilizando el identificador único del registro maestro para detectar duplicados, de modo que una re-ejecución NO inserte registros ya existentes ni modifique registros previamente migrados con éxito, incluso cuando los datos fuente hayan cambiado desde la última migración (idempotencia estricta)

### Requirement 20: [Functional] Capacidad de Analistas al 20% (Bloque C-2)

**User Story:** Como director de operaciones, quiero que el sistema opere con analistas al 20% de capacidad asignada, para optimizar la distribución de recursos humanos.

**Nivel de datos:** DERIVED_DATA (métricas de capacidad)

#### Acceptance Criteria

1. THE Sistema_VantiOps SHALL implementar un modelo de capacidad configurable con los siguientes supuestos de modelación (NO datos oficiales de Vanti): jornada mensual base = 160 horas, dedicación PQR = 20% (32 horas/mes), capacidad neta = horas disponibles × factor de productividad configurable; el sistema SHALL enforcer esta fórmula matemática para el cálculo de capacidad neta
2. THE Sistema_VantiOps SHALL calcular la utilización como: demanda estimada / capacidad disponible, considerando: volumen de PQR, minutos promedio por transacción, porcentaje automatizado, porcentaje de excepciones, reprocesos, tiempo de supervisión y tiempo no productivo
3. THE Sistema_VantiOps SHALL generar alertas según umbrales configurables: ≤85% capacidad controlada (verde), >85% y ≤100% en riesgo (amarillo), >100% sobrecarga (naranja), >120% escalamiento crítico (rojo) con notificación al rol OPERATIONS_LEAD
4. THE Sistema_VantiOps SHALL medir y reportar: tiempo promedio de atención por analista (rol ANALYST), tiempo automatizado, ratio de automatización y tendencia mensual; el sistema SHALL enforcer restricciones de validación sobre los valores de métricas reportados (valores no negativos, ratios entre 0-100%)

### Requirement 21: [Functional] Modelo Operativo — Pasantes, Contratistas, Negocio (Bloque C-3)

**User Story:** Como gerente de RRHH, quiero un modelo operativo que defina roles para 12 pasantes, 20 contratistas y 10 empleados de negocio, para escalar la operación de forma controlada.

**Nivel de datos:** REAL_DATA (usuarios)

#### Acceptance Criteria

1. THE Sistema_RBAC SHALL soportar la asignación simultánea de al menos 42 usuarios activos (12 INTERN_READONLY + 20 CONTRACTOR_OPERATOR + 10 BUSINESS_OWNER) sin degradación de rendimiento
2. THE Sistema_RBAC SHALL asignar permisos diferenciados según la Lista Maestra de Roles: INTERN_READONLY (lectura + ingesta), CONTRACTOR_OPERATOR (lectura + análisis), BUSINESS_OWNER (lectura + reportes + aprobaciones operativas)
3. THE Sistema_VantiOps SHALL medir la productividad por tipo de rol y generar métricas comparativas accesibles para OPERATIONS_LEAD y SYSTEM_ADMIN
4. WHEN un usuario con rol INTERN_READONLY o CONTRACTOR_OPERATOR alcance su fecha de expiración configurada, THE Sistema_RBAC SHALL desactivar automáticamente su acceso y registrar la desactivación en el Sistema_Auditoría; los usuarios con rol BUSINESS_OWNER no tienen fecha de expiración automática

### Requirement 22: [Functional] Gestión de 2,000 Emails (Bloque C-4)

**User Story:** Como administrador del sistema, quiero gestionar hasta 2,000 cuentas de email, para dar cobertura a toda la operación de Vanti.

**Nivel de datos:** REAL_DATA (emails)

#### Acceptance Criteria

1. THE Sistema_VantiOps SHALL gestionar un directorio de hasta 2,000 direcciones de email con estado (activo/inactivo/suspendido) y fecha de última actualización
2. THE Sistema_VantiOps SHALL soportar operaciones bulk (activación/desactivación masiva) sobre el directorio de emails; la confirmación del rol SYSTEM_ADMIN es una precondición obligatoria que se verifica inmediatamente al iniciar la operación bulk
3. WHEN se requiera enviar notificaciones masivas, THE Sistema_VantiOps SHALL procesarlas en lotes de máximo 100 emails por minuto para evitar throttling del proveedor
4. THE Sistema_VantiOps SHALL mantener un log de comunicaciones enviadas por email vinculado al Sistema_Auditoría con: destinatario, asunto, timestamp y estado de entrega

### Requirement 23: [Functional] SAP Scripting — Diseño Conceptual (Bloque C-5)

**User Story:** Como ingeniero de integración, quiero un diseño técnico conceptual de automatización SAP, para planificar la eliminación de carga manual de información.

**Nivel de datos:** CONCEPTUAL_DESIGN

#### Acceptance Criteria

1. THE Pipeline_SAP SHALL documentar un diseño técnico conceptual que cubra los siguientes casos de automatización: liquidación de ventas, pagos, notas de ajuste, consultas, extracción de reportes y conciliación
2. THE Pipeline_SAP SHALL definir para cada caso de automatización: entrada esperada, salida esperada, frecuencia estimada, volumen estimado, precondición, validación, segregación de funciones, logging, reintentos (referencia a Requirement 37), idempotencia, excepciones, aprobación humana requerida, rollback y evidencia
3. THE Pipeline_SAP SHALL entregar una matriz de controles y pseudocódigo seguro para cada flujo, sin inventar códigos de transacciones SAP específicos
4. THE Pipeline_SAP SHALL NO almacenar credenciales SAP en el código fuente; el diseño debe especificar que las credenciales provienen exclusivamente de variables de entorno
5. THE Pipeline_SAP SHALL NO requerir conexión real a SAP; este requisito se satisface con el diseño documentado, la matriz de controles y los contratos de integración definidos
6. THE Sistema_VantiOps SHALL marcar claramente en la documentación: "Diseño conceptual de integración SAP; no conectado a sistema SAP productivo"

### Requirement 24: [Functional] Power Automate — Diseño Conceptual (Bloque C-6)

**User Story:** Como analista de procesos, quiero un diseño conceptual de flujos Power Automate, para planificar la automatización de notificaciones y procesos rutinarios de gestión PQR.

**Nivel de datos:** CONCEPTUAL_DESIGN

#### Acceptance Criteria

1. THE Motor_PowerAutomate SHALL documentar un diseño conceptual demostrable que cubra los flujos: ingesta de correos, validación de remitente, gestión de adjuntos, creación de ticket PQR, aprobaciones Legal/VP, recordatorios de cierre, escalamiento por SLA y notificaciones de estado
2. THE Motor_PowerAutomate SHALL definir para cada flujo: diagrama del flujo, contratos de entrada y salida, payload de webhook o API de ejemplo, tratamiento de errores, seguridad, reintentos (referencia a Requirement 37), auditoría y variables de entorno requeridas
3. THE Motor_PowerAutomate SHALL entregar un mock o simulación demostrable del endpoint /api/webhooks/power-automate que acepte callbacks con autenticación Bearer token y registre las invocaciones
4. THE Motor_PowerAutomate SHALL NO requerir conexión productiva con Microsoft 365; este requisito se satisface con diseño documentado, contratos definidos y mock funcional
5. THE Sistema_VantiOps SHALL marcar claramente en la documentación: "Diseño conceptual; no conectado a Microsoft 365 productivo"

### Requirement 25: [Functional] Análisis en R — Diseño Analítico Conceptual (Bloque C-7)

**User Story:** Como científico de datos, quiero un diseño analítico conceptual de scripts R, para planificar análisis estadísticos avanzados no disponibles en el stack Python actual.

**Nivel de datos:** CONCEPTUAL_DESIGN

#### Acceptance Criteria

1. THE Módulo_R SHALL documentar un diseño analítico conceptual que cubra los casos de uso: forecast de demanda PQR, dimensionamiento de equipo, control estadístico de procesos, detección de anomalías, análisis de backlog y productividad por analista
2. THE Módulo_R SHALL definir para cada caso de uso: estructura esperada de entrada (schema), estructura de salida (schema), pseudocódigo o script de referencia, controles de calidad, reproducibilidad, manejo de errores y versionamiento
3. THE Módulo_R SHALL especificar Parquet como formato de entrada y JSON como formato de salida propuestos para intercambio, sin exigir integración productiva con un runtime R en el pipeline actual
4. THE Módulo_R SHALL NO requerir un runtime R productivo instalado; este requisito se satisface con el diseño documentado, scripts de referencia y contratos de datos definidos
5. THE Sistema_VantiOps SHALL marcar claramente en la documentación: "Diseño analítico conceptual; no requiere runtime R productivo"
6. WHEN un script R conceptual se documente, THE Módulo_R SHALL incluir las dependencias R requeridas (paquetes CRAN) y la versión mínima de R necesaria para reproducibilidad futura

### Requirement 26: [Functional] Incorporación de Nuevos Ingenieros (Bloque C-8)

**User Story:** Como líder técnico, quiero un proceso de onboarding documentado, para que nuevos ingenieros sean productivos en máximo 5 días.

**Nivel de datos:** REAL_DATA (documentación)

#### Acceptance Criteria

1. THE Sistema_VantiOps SHALL mantener documentación de onboarding que cubra: arquitectura implementada, arquitectura conceptual, setup local, convenciones de código, flujo de trabajo y pruebas
2. THE Sistema_VantiOps SHALL incluir un script de setup automatizado que configure el entorno de desarrollo en menos de 30 minutos incluyendo: dependencias, base de datos local, variables de entorno de ejemplo y verificación de salud
3. WHEN un nuevo ingeniero se incorpore, THE Sistema_RBAC SHALL asignarle acceso a Entorno_Preview pero NO a Entorno_Producción hasta aprobación explícita del SYSTEM_ADMIN
4. THE Sistema_VantiOps SHALL mantener un README.md actualizado que incluya: descripción del proyecto, alcance, arquitectura implementada, arquitectura conceptual, requisitos de sistema, instalación, variables de entorno (sin secretos), ejecución local, base de datos, migraciones, comandos de lint, typecheck, tests, coverage, Playwright, build, despliegue, rutas principales, contratos API, datos reales y simulados, limitaciones conocidas, seguridad, rollback, autoría y licencia o uso del prototipo

### Requirement 27: [Functional] Gestión del Cambio (Bloque C-9)

**User Story:** Como gerente de cambio, quiero un proceso formal de gestión del cambio, para minimizar el impacto de las transiciones tecnológicas en la operación.

**Nivel de datos:** REAL_DATA (proceso)

#### Acceptance Criteria

1. THE Sistema_VantiOps SHALL documentar cada cambio significativo con: descripción, impacto esperado, plan de rollback, responsable y fecha de ejecución planificada
2. WHEN se planifique un cambio que afecte más de 3 archivos o más de 2 módulos, THE Sistema_VantiOps SHALL requerir una revisión de impacto previa aprobada por OPERATIONS_LEAD o SYSTEM_ADMIN
3. THE Sistema_VantiOps SHALL mantener un registro de cambios (changelog) vinculado a los tickets de trabajo con formato convencional (Conventional Commits)
4. IF un cambio genera regresión detectada por CI o reporte de usuario, THEN THE Sistema_VantiOps SHALL ejecutar el rollback documentado dentro de 1 hora desde la detección

### Requirement 28: [Functional] Transición de Contratistas (Bloque C-10)

**User Story:** Como gerente de operaciones, quiero un plan de transición estructurado, para que la salida de contratistas no afecte la continuidad operativa.

**Nivel de datos:** REAL_DATA (proceso)

#### Acceptance Criteria

1. THE Sistema_VantiOps SHALL documentar las responsabilidades de cada contratista (CONTRACTOR_OPERATOR) con mapeo a funcionalidades del sistema que gestiona
2. WHEN un contratista notifique su salida, THE Sistema_VantiOps SHALL iniciar un período de transferencia de conocimiento de mínimo 10 días hábiles con checklist verificable
3. THE Sistema_RBAC SHALL revocar accesos del contratista saliente automáticamente en su fecha de expiración configurada y registrar la revocación en Sistema_Auditoría
4. THE Sistema_VantiOps SHALL verificar que toda funcionalidad del contratista saliente tenga al menos un responsable alterno asignado antes de completar la desactivación; no se permite la desactivación sin cobertura alternativa completa, sin excepciones

---

### Requirement 29: [Functional] Corrección de Evidencia (Bloque D-1)

**User Story:** Como auditor de calidad, quiero que toda evidencia de pruebas sea verificable y reproducible, para cumplir con estándares de auditoría ISO.

**Nivel de datos:** REAL_DATA (evidencia)

#### Acceptance Criteria

1. THE Sistema_CI_CD SHALL generar evidencia de pruebas con: timestamp ISO-8601, commit hash, resultado (pass/fail), duración en segundos, screenshots y logs sanitizados
2. WHEN una evidencia presente inconsistencias o sea cuestionada, THE Sistema_VantiOps SHALL regenerar la evidencia ejecutando nuevamente las pruebas sobre el mismo commit para verificar reproducibilidad
3. THE Sistema_VantiOps SHALL almacenar la evidencia en frontend/artifacts/ con estructura organizada por fecha y commit
4. THE Sistema_CI_CD SHALL vincular cada evidencia a su criterio de aceptación correspondiente en la Matriz_Trazabilidad de forma automatizada

### Requirement 30: [Functional] Arquitectura Real vs Objetivo (Bloque D-2)

**User Story:** Como arquitecto de soluciones, quiero documentar la brecha entre la arquitectura actual y la objetivo, para planificar la evolución técnica de la plataforma.

**Nivel de datos:** REAL_DATA + CONCEPTUAL_DESIGN (documentación)

#### Acceptance Criteria

1. THE Sistema_VantiOps SHALL documentar la arquitectura actual (as-is) con diagrama de componentes, flujos de datos y dependencias tecnológicas en formato Mermaid
2. THE Sistema_VantiOps SHALL documentar la arquitectura objetivo (to-be) con las mejoras planificadas y justificación técnica, marcando claramente que es CONCEPTUAL_DESIGN
3. THE Sistema_VantiOps SHALL identificar y documentar las brechas (gaps) entre arquitectura actual y objetivo con: prioridad (alta/media/baja), esfuerzo estimado en días (debe ser un número positivo mayor a cero) y dependencias
4. THE Sistema_VantiOps SHALL versionar los diagramas de arquitectura en el repositorio en formato Mermaid (docs/architecture-current.md y docs/architecture-target.md)

### Requirement 31: [Functional] Suite de Pruebas Completa (Bloque D-3)

**User Story:** Como ingeniero de QA, quiero una suite de pruebas completa (unit, integration, e2e), para garantizar la calidad del software en cada despliegue.

**Nivel de datos:** SIMULATED_DATA (tests)

#### Acceptance Criteria

1. THE Sistema_CI_CD SHALL ejecutar pruebas unitarias (pytest para backend, vitest para frontend) con cobertura mínima del 80% en módulos críticos (pipeline, quality, risk, rca, statistics)
2. THE Sistema_CI_CD SHALL ejecutar pruebas de integración que validen la comunicación frontend ↔ backend ↔ base de datos con datos de prueba controlados
3. THE Sistema_CI_CD SHALL ejecutar pruebas end-to-end (Playwright) que validen los flujos principales del usuario: login, dashboard, filtros, Pareto, RCA y reportes
4. WHEN una prueba falle en CI, THE Sistema_CI_CD SHALL bloquear el merge y reportar el nombre del test fallido, el archivo y el mensaje de error en el resumen del PR; los fallos de infraestructura de CI (timeouts, errores de runner) NO bloquean el merge si ningún test real falló
5. THE Sistema_CI_CD SHALL generar reportes de cobertura accesibles como artefacto del job de CI

### Requirement 32: [Functional] CI/CD Pipeline (Bloque D-4)

**User Story:** Como DevOps engineer, quiero un pipeline CI/CD automatizado, para que cada cambio sea validado y desplegado de forma consistente.

**Nivel de datos:** REAL_DATA (configuración)

#### Acceptance Criteria

1. WHEN se abre o actualiza un PR contra main, THE Sistema_CI_CD SHALL ejecutar en secuencia: lint (ruff + eslint), typecheck (pyright + tsc), tests (pytest + vitest), build (next build) y e2e (Playwright), reportando el resultado de cada paso como check independiente en el PR dentro de un tiempo máximo total de 15 minutos; todos los pasos deben completar exitosamente para considerar el pipeline como aprobado
2. IF cualquier check del pipeline falla durante la ejecución del PR, THEN THE Sistema_CI_CD SHALL detener la ejecución de los pasos subsiguientes, marcar el PR como fallido y notificar al autor indicando el paso que falló
3. WHEN se hace push a una rama de feature, THE Sistema_CI_CD SHALL desplegar automáticamente a Entorno_Preview y publicar la URL del entorno desplegado como comentario en el PR asociado en un plazo máximo de 5 minutos tras completar el pipeline
4. WHEN todos los checks del pipeline pasan y el PR recibe al menos una aprobación, THE Sistema_CI_CD SHALL permitir el merge a main
5. WHEN se completa un merge a main con todos los checks en estado exitoso, THE Sistema_CI_CD SHALL desplegar automáticamente a Entorno_Producción en un plazo máximo de 10 minutos
6. IF el despliegue a Entorno_Producción falla (health check no responde con estado exitoso dentro de 2 minutos post-despliegue), THEN THE Sistema_CI_CD SHALL ejecutar rollback automático a la versión inmediatamente anterior en un plazo máximo de 3 minutos y notificar al equipo indicando la versión revertida y la causa del fallo
7. IF el rollback automático falla, THEN THE Sistema_CI_CD SHALL notificar al equipo con prioridad crítica indicando que se requiere intervención manual inmediata

### Requirement 33: [Functional] Entorno Preview (Bloque D-5)

**User Story:** Como product owner, quiero un entorno de preview funcional, para validar cambios antes de que lleguen a producción.

**Nivel de datos:** REAL_DATA (entorno)

#### Acceptance Criteria

1. THE Entorno_Preview SHALL ser desplegado automáticamente en Vercel Preview con cada PR abierto contra main
2. THE Entorno_Preview SHALL conectarse a una instancia de base de datos separada de Entorno_Producción para evitar contaminación de datos
3. THE Entorno_Preview SHALL ser accesible mediante URL única generada por Vercel para cada PR, publicada como comentario en el PR; la URL se genera y publica únicamente cuando el entorno de Preview se despliega exitosamente
4. WHEN el PR se cierre o se haga merge, THE Entorno_Preview SHALL ser eliminado automáticamente para liberar recursos dentro de 24 horas

### Requirement 34: [Functional] Producción (Bloque D-6)

**User Story:** Como director de TI, quiero un entorno de producción estable y monitoreado, para garantizar disponibilidad del servicio a los usuarios finales.

**Nivel de datos:** REAL_DATA (entorno)

#### Acceptance Criteria

1. THE Entorno_Producción SHALL estar desplegado en Vercel (frontend) + Neon PostgreSQL (base de datos) con configuración de alta disponibilidad
2. THE Entorno_Producción SHALL implementar health checks en GET /api/health que validen: conectividad a la base de datos, estado del servicio y versión desplegada
3. WHEN el Entorno_Producción presente errores 5xx en más del 1% de las solicitudes durante una ventana de 5 minutos, THE Sistema_VantiOps SHALL generar una alerta al equipo de operaciones (OPERATIONS_LEAD) vía canal configurado
4. THE Entorno_Producción SHALL mantener un SLA de disponibilidad del 99.5% medido mensualmente (máximo 3.6 horas de downtime por mes)
5. THE Sistema_VantiOps SHALL NO desplegar a Entorno_Producción sin CI verde, Preview validado y pruebas de regresión aprobadas

### Requirement 35: [Functional] Matriz de Compliance Final (Bloque D-7)

**User Story:** Como auditor externo, quiero una matriz de compliance completa, para verificar que todos los requisitos regulatorios están cubiertos con evidencia.

**Nivel de datos:** DERIVED_DATA

#### Acceptance Criteria

1. THE Matriz_Trazabilidad SHALL vincular cada requisito con: implementación (archivo/módulo), prueba (test file), evidencia (screenshot/log) y estado (PASS/FAIL/LIMITACIÓN)
2. THE Matriz_Trazabilidad SHALL incluir todos los requisitos de este documento con sus criterios de aceptación
3. WHEN un criterio tenga estado LIMITACIÓN, THE Matriz_Trazabilidad SHALL documentar la limitación explícita con: descripción de la limitación, plan de remediación y fecha estimada de resolución
4. THE Sistema_VantiOps SHALL generar la Matriz_Trazabilidad de forma automatizada a partir de los resultados de CI/CD y artefactos de prueba
5. THE Matriz_Trazabilidad SHALL ser revisada y aprobada por el BUSINESS_OWNER antes de declarar la fase como completa; la fase NO puede declararse completa sin esta aprobación

---

### Requirement 36: [Non-Functional] Rendimiento

**User Story:** Como usuario final, quiero que la plataforma responda rápidamente, para no interrumpir mi flujo de trabajo.

#### Acceptance Criteria

1. THE Sistema_VantiOps SHALL responder a consultas de API en menos de 500ms para el percentil 95 medido en Entorno_Producción bajo carga normal (hasta 42 usuarios concurrentes)
2. THE Sistema_VantiOps SHALL cargar el dashboard principal en menos de 3 segundos en primera visita (LCP < 3s) medido con Lighthouse en conexión 4G simulada
3. THE Pipeline_ETL SHALL procesar un lote técnico preparado de 600 registros en menos de 60 segundos en el entorno de CI (runner GitHub Actions estándar), excluyendo carga de archivos, intervención manual y tiempos externos; medido como promedio de 3 ejecuciones consecutivas; este requisito de rendimiento aplica exclusivamente a lotes de 600 registros

### Requirement 37: [Non-Functional] Resiliencia, Reintentos e Idempotencia

**User Story:** Como ingeniero de plataforma, quiero una política centralizada de reintentos, para que todos los módulos manejen errores transitorios de forma consistente y predecible.

#### Acceptance Criteria

1. THE Sistema_VantiOps SHALL implementar una política centralizada de reintentos con la siguiente configuración estándar: máximo 3 reintentos, backoff exponencial con base inicial de 2 segundos, tiempo máximo de espera de 30 segundos, jitter aleatorio de ±500ms para evitar thundering herd
2. THE Política_Reintentos SHALL aplicarse exclusivamente a errores transitorios (timeout, conexión rechazada, error 5xx, error de red); los errores de validación (4xx), autorización (401/403) y errores de negocio NO se reintentan bajo ninguna circunstancia, con cero reintentos enforced globalmente para errores no transitorios
3. IF se agotan los reintentos sin éxito, THEN THE Sistema_VantiOps SHALL propagar la excepción de la última falla, registrar el evento con correlation_id en el Sistema_Auditoría con logging sanitizado (sin credenciales ni PII) y enviar el item a dead-letter queue o cuarentena según el contexto del módulo; el logging de auditoría y dead-letter queue aplican exclusivamente a operaciones fallidas tras agotar reintentos, no a operaciones exitosas
4. THE Sistema_VantiOps SHALL garantizar idempotencia en todas las operaciones de escritura críticas (migración, ETL, transiciones de estado) mediante identificadores únicos de operación que permitan re-ejecución segura
5. THE Política_Reintentos SHALL ser referenciada por: Pipeline_ETL (Requirement 10), Módulo_Migración (Requirement 19), Motor_Pareto (Requirement 5), Pipeline_SAP (Requirement 23) y Motor_PowerAutomate (Requirement 24) sin redefinir parámetros localmente

### Requirement 38: [Non-Functional] Seguridad

**User Story:** Como CISO, quiero que la plataforma cumpla estándares de seguridad empresarial, para proteger los datos de la organización.

#### Acceptance Criteria

1. THE Sistema_VantiOps SHALL transmitir todos los datos mediante HTTPS/TLS 1.3 tanto en Entorno_Preview como en Entorno_Producción
2. THE Sistema_VantiOps SHALL NO exponer valores individuales de registros PQR en APIs públicas; solo datos agregados con MIN_GROUP_SIZE >= 5 para protección de privacidad; grupos con cero registros también se bloquean
3. THE Sistema_VantiOps SHALL sanitizar todas las entradas de usuario contra inyección SQL y XSS utilizando las protecciones nativas de los frameworks (Pydantic para backend, React para frontend)
4. THE Sistema_VantiOps SHALL rotar secretos y tokens de acceso cada 90 días como máximo, con alerta 15 días antes de la expiración al SYSTEM_ADMIN

### Requirement 39: [Non-Functional] Disponibilidad

**User Story:** Como director de TI, quiero alta disponibilidad del sistema, para garantizar continuidad operativa.

#### Acceptance Criteria

1. THE Entorno_Producción SHALL mantener disponibilidad del 99.5% mensual (máximo 3.6 horas de downtime por mes) medido por health checks automáticos
2. THE Sistema_VantiOps SHALL implementar health checks automáticos cada 60 segundos en GET /api/health con verificación de conectividad a base de datos
3. IF el sistema detecta degradación (latencia P95 > 2s o tasa de error > 1% durante 3 minutos), THEN THE Sistema_VantiOps SHALL activar modo degradado sirviendo datos en caché cuando sea posible y notificar al OPERATIONS_LEAD

### Requirement 40: [Non-Functional] Mantenibilidad

**User Story:** Como líder técnico, quiero un código mantenible y documentado, para facilitar la evolución del sistema a largo plazo.

#### Acceptance Criteria

1. THE Sistema_VantiOps SHALL mantener cobertura de pruebas mínima del 80% en módulos críticos (pipeline, quality, risk, rca, statistics) medida por coverage report en CI
2. THE Sistema_VantiOps SHALL cumplir con linting (ruff para Python, eslint para TypeScript) sin errores en CI como gate obligatorio para merge
3. THE Sistema_VantiOps SHALL documentar toda API con OpenAPI/Swagger generado automáticamente desde los modelos Pydantic, accesible en /docs
4. THE Sistema_VantiOps SHALL mantener un máximo de 10 dependencias directas sin actualización de seguridad pendiente; las vulnerabilidades críticas (CVSS ≥ 9.0) deben resolverse en 72 horas

### Requirement 41: [Non-Functional] Escalabilidad

**User Story:** Como arquitecto, quiero que el sistema escale para soportar el crecimiento de la operación de Vanti.

#### Acceptance Criteria

1. THE Sistema_VantiOps SHALL soportar al menos 42 usuarios concurrentes sin degradación de rendimiento (latencia P95 < 500ms para APIs)
2. THE Pipeline_ETL SHALL escalar para procesar lotes de hasta 10,000 registros PQR sin timeout (completando en menos de 10 minutos)
3. THE Sistema_VantiOps SHALL soportar almacenamiento de hasta 100,000 registros históricos en Neon PostgreSQL sin degradación en queries de dashboard (respuesta < 2s)

---

## Clasificación de Datos

| Campo | Tipo | Origen | Descripción |
|-------|------|--------|-------------|
| id_pqr | string | REAL_DATA | Identificador único del registro PQR |
| causa | string | REAL_DATA | Causa clasificada del PQR |
| empresa | string | REAL_DATA | Empresa asociada al PQR |
| canal_atencion | string | REAL_DATA | Canal por el cual ingresó el PQR |
| estado | string | REAL_DATA | Estado actual del PQR (cerrado, en_proceso) |
| resultado | string | REAL_DATA | Resultado de la gestión del PQR |
| motivo_cierre | string | REAL_DATA | Motivo por el cual se cerró el PQR |
| marcacion | string | REAL_DATA | Marcación del PQR |
| unidad_responsable | string | REAL_DATA | Unidad organizacional responsable |
| fecha_creacion | date | REAL_DATA | Fecha de creación del PQR |
| tiempo_gestion_dias | float | DERIVED_DATA | Tiempo de gestión calculado en días |
| percentage_closed | float | DERIVED_DATA | Porcentaje de PQR cerrados (calculado) |
| main_cause_share_pct | float | DERIVED_DATA | Participación de la causa principal (%) |
| quality_issues_pct | float | DERIVED_DATA | Porcentaje de problemas de calidad |
| data_quality_score | float | DERIVED_DATA | Score compuesto de calidad (0-100) |
| cumulative_pct (Pareto) | float | DERIVED_DATA | Porcentaje acumulado de Pareto |
| z_score (anomalías) | float | DERIVED_DATA | Z-score para detección de anomalías |
| risk_probability | float | DERIVED_DATA | Probabilidad de escalamiento (modelo) |
| feature_importance | float | DERIVED_DATA | Importancia de features del modelo |
| precision/recall/f1/roc_auc | float | DERIVED_DATA | Métricas del modelo de riesgo |
| high_concentration | boolean | DERIVED_DATA | Indicador de alta concentración Pareto |
| concentration_pct | float | DERIVED_DATA | Porcentaje de concentración de causa principal |
| analysis_level | string | DERIVED_DATA | Nivel de análisis (statistical_concentration, causal_hypothesis, validated_root_cause) |
| synthetic_pqr_records | dict | SIMULATED_DATA | Registros PQR generados sintéticamente para testing |
| pii_masked_fields | string | SIMULATED_DATA | Campos con PII enmascarados para desarrollo |
| target_architecture_diagram | string | CONCEPTUAL_DESIGN | Diagrama de arquitectura objetivo (futuro) |
| sap_integration_schema | string | CONCEPTUAL_DESIGN | Esquema de integración SAP (diseño conceptual) |
| power_automate_flows | string | CONCEPTUAL_DESIGN | Flujos PA diseñados (no conectados a M365) |
| r_analysis_outputs | string | CONCEPTUAL_DESIGN | Salidas de análisis R (diseño conceptual) |

---

## Archivos y Funcionalidades Protegidas (NO MODIFICAR)

### Frontend — No Modificar

| Archivo/Componente | Razón de Protección |
|---|---|
| frontend/app/layout.tsx | Layout principal, sidebar, navegación, logo, footer |
| frontend/components/layout/* | Sidebar, Header, Footer, BrandLogo |
| frontend/components/brand/* | Logo VantiOps 360, colores corporativos |
| frontend/components/filters/* | Filtros globales funcionales |
| frontend/public/bpmn/* | Imágenes BPMN de procesos |
| frontend/public/brand/* | Assets de marca corporativa |
| frontend/styles/globals.css | Estilos globales, colores, tipografía |
| frontend/app/page.tsx | Dashboard principal existente |
| frontend/components/charts/* | Componentes de gráficos funcionales |
| frontend/components/kpi/* | Tarjetas KPI existentes |

### Backend — No Modificar (excepto extensiones explícitas)

| Archivo/Módulo | Razón de Protección |
|---|---|
| backend/src/api/routes.py | Endpoints existentes funcionales |
| backend/src/api/models.py | Modelos Pydantic en uso |
| backend/src/api/filters.py | Lógica de filtros operativa |
| backend/src/pipeline/orchestrator.py | Pipeline ETL funcional |
| backend/src/rca/main_cause.py | Análisis RCA validado |
| backend/src/quality/* | Módulo de calidad operativo |
| backend/src/statistics/* | Módulo de estadísticas validado |
| backend/src/risk/model.py | Modelo de riesgo funcional |
| backend/src/profiling/* | Perfilado de datos operativo |

### Configuración — No Modificar

| Archivo | Razón de Protección |
|---|---|
| .github/workflows/ci.yml | Pipeline CI existente (solo extender) |
| frontend/tailwind.config.ts | Configuración de estilos |
| frontend/next.config.mjs | Configuración Next.js |
| backend/pyproject.toml | Dependencias Python (solo agregar) |

---

## Matriz de Trazabilidad — Estructura

| ID Req | Bloque | Fase | Implementación | Prueba | Evidencia | Estado |
|---|---|---|---|---|---|---|
| REQ-05 | A-1 | A | backend/src/rca/main_cause.py, backend/src/api/routes.py | backend/tests/unit/test_main_cause.py | artifacts/screenshots/pareto-*.png | PENDIENTE |
| REQ-06 | A-2 | A | docs/data-dictionary.md | backend/tests/unit/test_data_classification.py | data-classification-report.json | PENDIENTE |
| REQ-07 | A-3 | A | backend/src/risk/model.py | backend/tests/unit/test_risk_model.py | artifacts/risk-model-metrics.json | PENDIENTE |
| REQ-08 | A-4 | A | docs/data-dictionary.md | backend/tests/unit/test_validators.py | data-dictionary-validation.log | PENDIENTE |
| REQ-09 | A-5 | A | backend/src/statistics/* | backend/tests/unit/test_descriptive_stats.py, test_inference.py | artifacts/stats-report.json | PENDIENTE |
| REQ-10 | A-6 | A | backend/src/pipeline/orchestrator.py | backend/tests/unit/test_pipeline.py | control_table.json | PENDIENTE |
| REQ-11 | B-1 | B | docs/erd.md | N/A (documento) | erd-diagram.png | PENDIENTE |
| REQ-12 | B-2 | B | backend/migrations/* | backend/tests/integration/test_migrations.py | migration-log.json | PENDIENTE |
| REQ-13 | B-3 | B | backend/src/auth/rbac.py | backend/tests/unit/test_rbac.py | rbac-matrix.json | PENDIENTE |
| REQ-14 | B-4 | B | backend/audit_db.py | backend/tests/unit/test_audit.py | audit-log-sample.json | PENDIENTE |
| REQ-15 | B-5 | B | backend/src/governance/approvals.py | backend/tests/unit/test_approvals.py | approval-workflow-evidence.json | PENDIENTE |
| REQ-16 | B-6 | B | frontend/app/anulaciones/*, backend/src/annulations/* | backend/tests/unit/test_state_machine.py | state-transitions-log.json | PENDIENTE |
| REQ-17 | B-7 | B | backend/src/auth/email_validator.py | backend/tests/unit/test_email_auth.py | email-validation-report.json | PENDIENTE |
| REQ-18 | B-8 | B | backend/tests/integration/test_access_denied.py | tests/e2e/access-denied.spec.ts | access-denied-screenshots/ | PENDIENTE |
| REQ-19 | C-1 | C | backend/src/migration/master_records.py | backend/tests/integration/test_migration_600.py | migration-report.json | PENDIENTE |
| REQ-20 | C-2 | C | backend/src/operations/capacity.py | backend/tests/unit/test_capacity.py | capacity-metrics.json | PENDIENTE |
| REQ-21 | C-3 | C | backend/src/auth/rbac.py | backend/tests/unit/test_roles_42_users.py | roles-assignment-report.json | PENDIENTE |
| REQ-22 | C-4 | C | backend/src/communications/email_mgr.py | backend/tests/unit/test_email_mgr.py | email-directory-stats.json | PENDIENTE |
| REQ-23 | C-5 | C | docs/sap-integration-design.md | N/A (diseño conceptual) | sap-design-review.json | PENDIENTE |
| REQ-24 | C-6 | C | docs/power-automate-design.md, backend/src/integrations/pa_mock.py | backend/tests/unit/test_pa_mock.py | pa-webhook-log.json | PENDIENTE |
| REQ-25 | C-7 | C | docs/r-analysis-design.md | N/A (diseño conceptual) | r-design-review.json | PENDIENTE |
| REQ-26 | C-8 | C | docs/onboarding.md, scripts/setup.sh, README.md | N/A (documento + script) | onboarding-validation.log | PENDIENTE |
| REQ-27 | C-9 | C | docs/change-management.md | N/A (proceso) | change-log.json | PENDIENTE |
| REQ-28 | C-10 | C | docs/transition-plan.md | N/A (proceso) | transition-checklist.json | PENDIENTE |
| REQ-29 | D-1 | D | .github/workflows/ci.yml | frontend/tests/e2e/* | artifacts/evidence-report.json | PENDIENTE |
| REQ-30 | D-2 | D | docs/architecture-current.md, docs/architecture-target.md | N/A (documento) | architecture-gap-analysis.json | PENDIENTE |
| REQ-31 | D-3 | D | backend/tests/*, frontend/tests/* | Todas las suites | coverage-report.html | PENDIENTE |
| REQ-32 | D-4 | D | .github/workflows/ci.yml | CI pipeline self-test | ci-execution-evidence.json | PENDIENTE |
| REQ-33 | D-5 | D | frontend/vercel.json | frontend/tests/e2e/preview.spec.ts | preview-url-screenshot.png | PENDIENTE |
| REQ-34 | D-6 | D | frontend/vercel.json, backend API deployment | frontend/tests/e2e/production.spec.ts | production-health-check.json | PENDIENTE |
| REQ-35 | D-7 | D | docs/compliance-matrix.md | CI automated matrix generation | compliance-matrix-final.json | PENDIENTE |

---

## Resumen de Bloques por Fase

### Fase A — Fundamentos de Datos (6 bloques)

| Bloque | Nombre | Requisito | Nivel de Datos |
|---|---|---|---|
| A-1 | Pareto Single Source of Truth | Requirement 5 | REAL_DATA + DERIVED_DATA |
| A-2 | Real vs Simulado | Requirement 6 | REAL_DATA (clasificación) |
| A-3 | Riesgo Operacional | Requirement 7 | DERIVED_DATA |
| A-4 | Diccionario de Datos | Requirement 8 | REAL_DATA (documentación) |
| A-5 | Estadísticas | Requirement 9 | DERIVED_DATA |
| A-6 | ETL y Pipeline | Requirement 10 | REAL_DATA → DERIVED_DATA |

### Fase B — Seguridad, Gobernanza y Procesos (8 bloques)

| Bloque | Nombre | Requisito | Nivel de Datos |
|---|---|---|---|
| B-1 | ERD | Requirement 11 | REAL_DATA (esquema) |
| B-2 | Migraciones | Requirement 12 | REAL_DATA (esquema) |
| B-3 | RBAC | Requirement 13 | REAL_DATA (usuarios) |
| B-4 | Auditoría | Requirement 14 | REAL_DATA (logs) |
| B-5 | Aprobaciones Legal/VP | Requirement 15 | REAL_DATA (workflow) |
| B-6 | Máquina de Estados Anulaciones | Requirement 16 | REAL_DATA (estados) |
| B-7 | Email Autorizado | Requirement 17 | REAL_DATA (directorio) |
| B-8 | Pruebas Acceso Denegado | Requirement 18 | SIMULATED_DATA (test) |

### Fase C — Operación y Escalamiento (10 bloques)

| Bloque | Nombre | Requisito | Nivel de Datos |
|---|---|---|---|
| C-1 | Migración 600 Registros | Requirement 19 | REAL_DATA (PQR) |
| C-2 | Capacidad Analistas 20% | Requirement 20 | DERIVED_DATA (métricas) |
| C-3 | Modelo Operativo 42 usuarios | Requirement 21 | REAL_DATA (usuarios) |
| C-4 | Gestión 2,000 Emails | Requirement 22 | REAL_DATA (emails) |
| C-5 | SAP Scripting (Diseño Conceptual) | Requirement 23 | CONCEPTUAL_DESIGN |
| C-6 | Power Automate (Diseño Conceptual) | Requirement 24 | CONCEPTUAL_DESIGN |
| C-7 | Análisis R (Diseño Conceptual) | Requirement 25 | CONCEPTUAL_DESIGN |
| C-8 | Nuevos Ingenieros | Requirement 26 | REAL_DATA (documentación) |
| C-9 | Gestión del Cambio | Requirement 27 | REAL_DATA (proceso) |
| C-10 | Transición Contratistas | Requirement 28 | REAL_DATA (proceso) |

### Fase D — Calidad, Despliegue y Compliance (7 bloques)

| Bloque | Nombre | Requisito | Nivel de Datos |
|---|---|---|---|
| D-1 | Corrección de Evidencia | Requirement 29 | REAL_DATA (evidencia) |
| D-2 | Arquitectura Real vs Objetivo | Requirement 30 | REAL_DATA + CONCEPTUAL_DESIGN |
| D-3 | Suite de Pruebas Completa | Requirement 31 | SIMULATED_DATA (tests) |
| D-4 | CI/CD | Requirement 32 | REAL_DATA (configuración) |
| D-5 | Preview | Requirement 33 | REAL_DATA (entorno) |
| D-6 | Producción | Requirement 34 | REAL_DATA (entorno) |
| D-7 | Matriz de Compliance Final | Requirement 35 | DERIVED_DATA |
