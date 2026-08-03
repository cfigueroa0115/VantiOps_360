# SAP Scripting — Diseño Conceptual de Automatización

> ⚠️ **CONCEPTUAL_DESIGN — Diseño conceptual de integración SAP; no conectado a sistema SAP productivo.**
>
> Este documento describe el diseño técnico conceptual para la automatización de procesos SAP
> mediante scripting. NO representa código ejecutable ni conexiones activas. Las credenciales SAP
> provienen exclusivamente de variables de entorno. No se inventan códigos de transacción SAP específicos.

---

## Tabla de Contenidos

1. [Resumen Ejecutivo](#1-resumen-ejecutivo)
2. [Casos de Automatización](#2-casos-de-automatización)
3. [Matriz de Seguridad](#3-matriz-de-seguridad)
4. [Pseudocódigo por Flujo](#4-pseudocódigo-por-flujo)
5. [Política de Reintentos](#5-política-de-reintentos)
6. [Contratos de Integración](#6-contratos-de-integración)
7. [Trazabilidad de Requisitos](#7-trazabilidad-de-requisitos)

---

## 1. Resumen Ejecutivo

### Objetivo

Eliminar la carga manual de información en SAP mediante 6 flujos automatizados que cubren
el ciclo operativo completo de Vanti: liquidación de ventas, pagos a proveedores, notas de
ajuste, consultas, extracción de reportes y conciliación bancaria.

### Principios de Diseño

- **Sin conexión productiva**: Este diseño NO requiere conexión real a SAP (REQ-23.5).
- **Credenciales seguras**: Todas las credenciales provienen de variables de entorno (REQ-23.4).
- **Idempotencia**: Cada operación tiene un identificador único que permite re-ejecución segura.
- **Segregación de funciones**: Quien ejecuta ≠ quien aprueba (REQ-23.3).
- **Auditoría completa**: Cada ejecución registrada en `audit_events` (REQ-14).
- **Reintentos centralizados**: Referencia a Política_Reintentos (REQ-37).

### Clasificación de Datos

| Elemento | Clasificación |
|----------|---------------|
| Documento completo | CONCEPTUAL_DESIGN |
| Schemas de entrada/salida | CONCEPTUAL_DESIGN |
| Pseudocódigo | CONCEPTUAL_DESIGN |
| Matriz de controles | CONCEPTUAL_DESIGN |

---

## 2. Casos de Automatización

### Resumen de Casos

| # | Caso | Entrada | Salida | Frecuencia | Volumen Estimado | Aprobación Requerida |
|---|------|---------|--------|------------|------------------|---------------------|
| 1 | Liquidación de ventas | CSV ventas diarias | Asiento contable confirmado | Diario | ~200 líneas/día | LEGAL_APPROVER |
| 2 | Pagos a proveedores | Listado proveedores aprobados | Confirmación de pago | Semanal | ~50 pagos/semana | VP_APPROVER |
| 3 | Notas de ajuste | Diferencias detectadas | Nota contable registrada | A demanda | ~10-30/mes | BUSINESS_OWNER |
| 4 | Consultas | Criterios de búsqueda | Resultados estructurados | A demanda | Variable | Ninguna |
| 5 | Extracción de reportes | Parámetros de reporte | PDF/Excel generado | Mensual | ~15 reportes/mes | OPERATIONS_LEAD |
| 6 | Conciliación bancaria | Saldos sistema vs banco | Diferencias identificadas | Mensual | ~500 movimientos | LEGAL_APPROVER |

---

### 2.1 Caso 1: Liquidación de Ventas

| Atributo | Detalle |
|----------|---------|
| **Entrada** | CSV con columnas: fecha, monto, concepto, centro_costo, cuenta_contable |
| **Salida** | JSON con: asiento_id, estado, timestamp, líneas_procesadas, líneas_error |
| **Frecuencia** | Diaria (lunes a viernes, 06:00 AM COT) |
| **Volumen** | ~200 líneas por ejecución |
| **Precondición** | Aprobación LEGAL_APPROVER vigente (< 72h), archivo CSV validado |
| **Validación** | Schema CSV, montos > 0, cuentas existentes en catálogo |
| **Segregación** | Ejecuta: SYSTEM_ADMIN / script automatizado; Aprueba: LEGAL_APPROVER |
| **Logging** | audit_events: inicio, cada línea, resultado final, errores |
| **Reintentos** | Política_Reintentos REQ-37 (max 3, backoff 2s, jitter ±500ms) |
| **Idempotencia** | operation_id = SHA-256(fecha + archivo + timestamp_ejecución) |
| **Excepciones** | Monto fuera de rango → cuarentena; cuenta inexistente → rechazo línea |
| **Aprobación humana** | LEGAL_APPROVER debe aprobar antes de ejecución |
| **Rollback** | Reversa de asientos parciales si error irrecuperable (ver pseudocódigo) |
| **Evidencia** | JSON con resultado almacenado en audit_events + log de ejecución |

---

### 2.2 Caso 2: Pagos a Proveedores

| Atributo | Detalle |
|----------|---------|
| **Entrada** | JSON array con: proveedor_id, monto, moneda, cuenta_destino, referencia |
| **Salida** | JSON con: pago_id, estado_batch, confirmaciones[], errores[] |
| **Frecuencia** | Semanal (viernes, 14:00 COT) |
| **Volumen** | ~50 pagos por ejecución |
| **Precondición** | Aprobación VP_APPROVER vigente (< 72h), fondos verificados |
| **Validación** | Proveedor activo, monto ≤ límite aprobado, cuenta destino válida |
| **Segregación** | Ejecuta: SYSTEM_ADMIN / script; Aprueba: VP_APPROVER |
| **Logging** | audit_events: inicio batch, cada pago, resultado, totales |
| **Reintentos** | Política_Reintentos REQ-37 por pago individual |
| **Idempotencia** | operation_id = SHA-256(proveedor_id + monto + fecha_pago) |
| **Excepciones** | Fondos insuficientes → abortar batch; proveedor inactivo → skip + log |
| **Aprobación humana** | VP_APPROVER debe aprobar batch completo |
| **Rollback** | No aplica reversa automática (pagos son irreversibles); se genera solicitud de devolución |
| **Evidencia** | Reporte de pagos con confirmaciones almacenado en audit_events |

---

### 2.3 Caso 3: Notas de Ajuste

| Atributo | Detalle |
|----------|---------|
| **Entrada** | JSON con: tipo_ajuste, cuenta_origen, cuenta_destino, monto, justificación |
| **Salida** | JSON con: nota_id, estado, timestamp, referencia_contable |
| **Frecuencia** | A demanda (cuando se detectan diferencias) |
| **Volumen** | ~10-30 notas por mes |
| **Precondición** | Diferencia detectada y documentada, aprobación BUSINESS_OWNER |
| **Validación** | Justificación ≥ 10 caracteres, monto ≠ 0, cuentas válidas |
| **Segregación** | Ejecuta: ANALYST / script; Aprueba: BUSINESS_OWNER |
| **Logging** | audit_events: solicitud, aprobación, ejecución, resultado |
| **Reintentos** | Política_Reintentos REQ-37 para errores de conexión |
| **Idempotencia** | operation_id = SHA-256(cuenta_origen + cuenta_destino + monto + fecha) |
| **Excepciones** | Cuenta bloqueada → rechazo; período cerrado → rechazo con código |
| **Aprobación humana** | BUSINESS_OWNER autoriza cada nota |
| **Rollback** | Contra-asiento automático en caso de error post-registro |
| **Evidencia** | Nota registrada con referencia cruzada en audit_events |

---

### 2.4 Caso 4: Consultas

| Atributo | Detalle |
|----------|---------|
| **Entrada** | JSON con: tipo_consulta, filtros (fecha_inicio, fecha_fin, cuenta, centro_costo) |
| **Salida** | JSON con: resultados[], total_registros, timestamp_consulta |
| **Frecuencia** | A demanda |
| **Volumen** | Variable (limitado a 1,000 registros por consulta) |
| **Precondición** | Usuario autenticado con rol que permita lectura |
| **Validación** | Filtros con formato válido, rango de fechas ≤ 365 días |
| **Segregación** | Ejecuta: cualquier rol con permiso de lectura; Aprueba: N/A |
| **Logging** | audit_events: consulta realizada, usuario, filtros aplicados |
| **Reintentos** | Política_Reintentos REQ-37 para timeout de conexión |
| **Idempotencia** | Operación de solo lectura — inherentemente idempotente |
| **Excepciones** | Timeout → reintentar; sin resultados → respuesta vacía válida |
| **Aprobación humana** | No requerida (operación de solo lectura) |
| **Rollback** | N/A (operación de solo lectura) |
| **Evidencia** | Log de consulta en audit_events (sin datos sensibles) |

---

### 2.5 Caso 5: Extracción de Reportes

| Atributo | Detalle |
|----------|---------|
| **Entrada** | JSON con: reporte_id, parámetros (período, formato, filtros) |
| **Salida** | Archivo PDF o Excel + JSON metadata (tamaño, páginas, timestamp) |
| **Frecuencia** | Mensual (primer día hábil del mes, 07:00 COT) |
| **Volumen** | ~15 reportes por ejecución mensual |
| **Precondición** | Aprobación OPERATIONS_LEAD, período contable cerrado |
| **Validación** | Período válido, formato soportado (PDF/XLSX), reporte_id existente |
| **Segregación** | Ejecuta: ANALYST / script; Aprueba: OPERATIONS_LEAD |
| **Logging** | audit_events: solicitud, generación, descarga, errores |
| **Reintentos** | Política_Reintentos REQ-37 para generación fallida |
| **Idempotencia** | operation_id = SHA-256(reporte_id + período + formato) |
| **Excepciones** | Reporte no disponible → error con código; timeout → reintentar |
| **Aprobación humana** | OPERATIONS_LEAD autoriza la extracción mensual |
| **Rollback** | N/A (operación de solo lectura, genera archivo) |
| **Evidencia** | Metadata del reporte + hash del archivo en audit_events |

---

### 2.6 Caso 6: Conciliación Bancaria

| Atributo | Detalle |
|----------|---------|
| **Entrada** | JSON con: extracto_bancario (CSV/JSON), saldos_sistema (desde SAP) |
| **Salida** | JSON con: diferencias[], partidas_conciliadas, saldo_no_conciliado, resumen |
| **Frecuencia** | Mensual (dentro de los primeros 5 días hábiles) |
| **Volumen** | ~500 movimientos por conciliación |
| **Precondición** | Período cerrado, extracto bancario disponible, aprobación LEGAL_APPROVER |
| **Validación** | Formato extracto válido, fechas dentro del período, moneda consistente |
| **Segregación** | Ejecuta: ANALYST / script; Aprueba: LEGAL_APPROVER |
| **Logging** | audit_events: inicio, cada partida conciliada, diferencias, resultado final |
| **Reintentos** | Política_Reintentos REQ-37 para lectura de saldos |
| **Idempotencia** | operation_id = SHA-256(período + banco_id + fecha_ejecución) |
| **Excepciones** | Diferencia > umbral configurable → alerta OPERATIONS_LEAD; extracto incompleto → abortar |
| **Aprobación humana** | LEGAL_APPROVER aprueba inicio de conciliación |
| **Rollback** | N/A (operación de comparación, no modifica datos) |
| **Evidencia** | Reporte de conciliación almacenado + diferencias en audit_events |

---

## 3. Matriz de Seguridad

### 3.1 Matriz de Roles por Operación SAP

| Operación | SYSTEM_ADMIN | OPERATIONS_LEAD | ANALYST | LEGAL_APPROVER | VP_APPROVER | BUSINESS_OWNER | AUDITOR |
|-----------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Liquidación — Ejecutar | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Liquidación — Aprobar | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| Liquidación — Consultar log | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ |
| Pagos — Ejecutar | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Pagos — Aprobar | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| Pagos — Consultar log | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ✅ |
| Notas ajuste — Ejecutar | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Notas ajuste — Aprobar | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| Notas ajuste — Consultar log | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ |
| Consultas — Ejecutar | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Reportes — Ejecutar | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Reportes — Aprobar | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Reportes — Consultar log | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| Conciliación — Ejecutar | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Conciliación — Aprobar | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| Conciliación — Consultar log | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ |

### 3.2 Controles de Seguridad Transversales

| Control | Descripción | Aplicación |
|---------|-------------|------------|
| **Credenciales** | Variables de entorno exclusivamente (`SAP_USER`, `SAP_PASS`, `SAP_HOST`, `SAP_CLIENT`) | Todos los flujos |
| **Segregación** | Ejecutor ≠ Aprobador en toda operación de escritura | Liquidación, Pagos, Notas, Reportes, Conciliación |
| **Auditoría** | Registro síncrono en `audit_events` antes de respuesta | Todos los flujos |
| **Aprobación temporal** | Validez máxima 72 horas (REQ-15.4) | Liquidación, Pagos, Notas, Reportes, Conciliación |
| **Sanitización** | Sin credenciales ni PII en logs (REQ-37.3) | Todos los flujos |
| **Cifrado en tránsito** | HTTPS/TLS 1.3 obligatorio (REQ-38.1) | Todos los flujos |
| **Idempotencia** | operation_id único por transacción | Todos los flujos de escritura |
| **Rate limiting** | Máximo 10 operaciones SAP concurrentes | Todos los flujos |

### 3.3 Variables de Entorno Requeridas

```env
# CONCEPTUAL_DESIGN — Variables que se configurarían en producción
SAP_HOST=           # Hostname del servidor SAP
SAP_CLIENT=         # Mandante SAP (ej: 100)
SAP_USER=           # Usuario de servicio SAP
SAP_PASS=           # Contraseña (rotación cada 90 días)
SAP_SYSTEM_NUMBER=  # Número de sistema
SAP_LANGUAGE=ES     # Idioma de la sesión
SAP_TIMEOUT_MS=30000  # Timeout de conexión
SAP_MAX_CONCURRENT=10 # Máximo operaciones concurrentes
```

---

## 4. Pseudocódigo por Flujo

> ⚠️ **CONCEPTUAL_DESIGN — No ejecutar contra SAP real. Pseudocódigo de referencia.**

### 4.1 Liquidación de Ventas

```python
# CONCEPTUAL_DESIGN — No ejecutar contra SAP real
from dataclasses import dataclass
from typing import List, Optional
import hashlib
import uuid

@dataclass
class LiquidationEntry:
    fecha: str
    monto: float
    concepto: str
    centro_costo: str
    cuenta_contable: str

@dataclass
class LiquidationResult:
    operation_id: str
    asiento_id: Optional[str]
    estado: str  # "completado" | "parcial" | "fallido"
    lineas_procesadas: int
    lineas_error: int
    errores: List[dict]
    timestamp: str

def liquidar_ventas(csv_path: str, aprobacion_id: str) -> LiquidationResult:
    """
    Liquidación de ventas conceptual.
    
    Precondiciones:
    - Aprobación LEGAL_APPROVER vigente (< 72h)
    - CSV validado contra schema
    - Credenciales SAP en variables de entorno
    """
    # 1. Generar operation_id idempotente
    operation_id = hashlib.sha256(
        f"{csv_path}:{aprobacion_id}:{fecha_actual()}".encode()
    ).hexdigest()
    
    # 2. Verificar idempotencia — si ya se ejecutó, retornar resultado previo
    resultado_previo = buscar_operacion(operation_id)
    if resultado_previo:
        return resultado_previo
    
    # 3. Validar aprobación vigente
    aprobacion = verificar_aprobacion(aprobacion_id, rol="LEGAL_APPROVER")
    if not aprobacion.vigente or aprobacion.edad_horas > 72:
        raise AprobacionExpiradaError("Aprobación no vigente o expirada")
    
    # 4. Validar CSV contra schema esperado
    entradas = parsear_csv(csv_path)
    validar_schema(entradas, SCHEMA_LIQUIDACION)
    
    # 5. Registrar inicio en audit_events
    audit_log(accion="SAP_LIQUIDACION_INICIO", recurso=csv_path,
              usuario=get_current_user(), operation_id=operation_id)
    
    # 6. Conectar via SAP GUI Scripting (credenciales de env vars)
    conexion = conectar_sap()  # Lee SAP_HOST, SAP_USER, SAP_PASS de env
    
    # 7. Procesar cada línea con retry policy
    procesadas, errores = 0, []
    asientos_creados = []
    
    for entrada in entradas:
        try:
            resultado = retry_policy(  # REQ-37: max 3, backoff 2s, jitter ±500ms
                lambda: crear_asiento_contable(conexion, entrada)
            )
            asientos_creados.append(resultado.asiento_id)
            procesadas += 1
        except ErrorNoTransitorio as e:
            errores.append({"linea": entrada, "error": str(e)})
        except ReintentosAgotadosError as e:
            # Rollback parcial de asientos ya creados
            for asiento_id in asientos_creados:
                reversar_asiento(conexion, asiento_id)
            audit_log(accion="SAP_LIQUIDACION_ROLLBACK",
                      detalle=f"Rollback {len(asientos_creados)} asientos")
            raise
    
    # 8. Registrar resultado final en audit_events
    resultado = LiquidationResult(
        operation_id=operation_id,
        asiento_id=asientos_creados[-1] if asientos_creados else None,
        estado="completado" if not errores else "parcial",
        lineas_procesadas=procesadas,
        lineas_error=len(errores),
        errores=errores,
        timestamp=timestamp_utc()
    )
    
    audit_log(accion="SAP_LIQUIDACION_FIN", resultado=resultado.estado,
              detalle=f"{procesadas} OK, {len(errores)} errores")
    
    return resultado

    raise NotImplementedError("CONCEPTUAL_DESIGN - SAP no conectado")
```

### 4.2 Pagos a Proveedores

```python
# CONCEPTUAL_DESIGN — No ejecutar contra SAP real
@dataclass
class PagoProveedor:
    proveedor_id: str
    monto: float
    moneda: str
    cuenta_destino: str
    referencia: str

@dataclass
class PagosResult:
    operation_id: str
    estado_batch: str  # "completado" | "parcial" | "fallido"
    confirmaciones: List[dict]
    errores: List[dict]
    total_pagado: float
    timestamp: str

def ejecutar_pagos(pagos: List[PagoProveedor], aprobacion_id: str) -> PagosResult:
    """
    Pagos a proveedores conceptual.
    
    Precondiciones:
    - Aprobación VP_APPROVER vigente (< 72h)
    - Fondos verificados para el total del batch
    - Proveedores activos en maestro
    """
    # 1. Generar operation_id idempotente
    contenido = "|".join(f"{p.proveedor_id}:{p.monto}" for p in pagos)
    operation_id = hashlib.sha256(
        f"{contenido}:{fecha_actual()}".encode()
    ).hexdigest()
    
    # 2. Verificar idempotencia
    resultado_previo = buscar_operacion(operation_id)
    if resultado_previo:
        return resultado_previo
    
    # 3. Validar aprobación VP_APPROVER vigente
    aprobacion = verificar_aprobacion(aprobacion_id, rol="VP_APPROVER")
    if not aprobacion.vigente or aprobacion.edad_horas > 72:
        raise AprobacionExpiradaError("Aprobación VP no vigente")
    
    # 4. Verificar fondos suficientes
    total_batch = sum(p.monto for p in pagos)
    verificar_fondos(total_batch)
    
    # 5. Registrar inicio en audit_events
    audit_log(accion="SAP_PAGOS_INICIO", recurso=f"batch_{len(pagos)}_pagos",
              usuario=get_current_user(), operation_id=operation_id)
    
    # 6. Conectar a SAP
    conexion = conectar_sap()
    
    # 7. Ejecutar cada pago con retry policy
    confirmaciones, errores = [], []
    
    for pago in pagos:
        try:
            # Validar proveedor activo
            if not proveedor_activo(conexion, pago.proveedor_id):
                errores.append({"pago": pago, "error": "Proveedor inactivo"})
                continue
            
            confirmacion = retry_policy(  # REQ-37
                lambda: ejecutar_pago_sap(conexion, pago)
            )
            confirmaciones.append(confirmacion)
        except ErrorNoTransitorio as e:
            errores.append({"pago": pago, "error": str(e)})
        except FondosInsuficientesError:
            # Abortar batch completo si no hay fondos
            audit_log(accion="SAP_PAGOS_ABORT", detalle="Fondos insuficientes")
            raise
    
    # 8. Resultado final
    resultado = PagosResult(
        operation_id=operation_id,
        estado_batch="completado" if not errores else "parcial",
        confirmaciones=confirmaciones,
        errores=errores,
        total_pagado=sum(c["monto"] for c in confirmaciones),
        timestamp=timestamp_utc()
    )
    
    audit_log(accion="SAP_PAGOS_FIN", resultado=resultado.estado_batch,
              detalle=f"{len(confirmaciones)} pagos, ${resultado.total_pagado}")
    
    return resultado

    raise NotImplementedError("CONCEPTUAL_DESIGN - SAP no conectado")
```

### 4.3 Notas de Ajuste

```python
# CONCEPTUAL_DESIGN — No ejecutar contra SAP real
@dataclass
class NotaAjuste:
    tipo_ajuste: str  # "credito" | "debito"
    cuenta_origen: str
    cuenta_destino: str
    monto: float
    justificacion: str  # mínimo 10 caracteres

@dataclass
class NotaAjusteResult:
    operation_id: str
    nota_id: Optional[str]
    estado: str
    referencia_contable: str
    timestamp: str

def registrar_nota_ajuste(nota: NotaAjuste, aprobacion_id: str) -> NotaAjusteResult:
    """
    Notas de ajuste conceptual.
    
    Precondiciones:
    - Justificación ≥ 10 caracteres
    - Aprobación BUSINESS_OWNER vigente (< 72h)
    - Cuentas válidas y no bloqueadas
    """
    # 1. Validar justificación
    if len(nota.justificacion) < 10:
        raise ValidacionError("Justificación debe tener al menos 10 caracteres")
    
    # 2. Generar operation_id idempotente
    operation_id = hashlib.sha256(
        f"{nota.cuenta_origen}:{nota.cuenta_destino}:{nota.monto}:{fecha_actual()}".encode()
    ).hexdigest()
    
    # 3. Verificar idempotencia
    resultado_previo = buscar_operacion(operation_id)
    if resultado_previo:
        return resultado_previo
    
    # 4. Validar aprobación BUSINESS_OWNER
    aprobacion = verificar_aprobacion(aprobacion_id, rol="BUSINESS_OWNER")
    if not aprobacion.vigente or aprobacion.edad_horas > 72:
        raise AprobacionExpiradaError("Aprobación BUSINESS_OWNER no vigente")
    
    # 5. Validar cuentas
    conexion = conectar_sap()
    validar_cuenta(conexion, nota.cuenta_origen)
    validar_cuenta(conexion, nota.cuenta_destino)
    
    # 6. Registrar en audit_events
    audit_log(accion="SAP_NOTA_AJUSTE_INICIO", recurso=nota.tipo_ajuste,
              operation_id=operation_id)
    
    # 7. Crear nota contable con retry
    try:
        nota_id = retry_policy(  # REQ-37
            lambda: crear_nota_contable(conexion, nota)
        )
    except ReintentosAgotadosError:
        audit_log(accion="SAP_NOTA_AJUSTE_ERROR", detalle="Reintentos agotados")
        raise
    except CuentaBloqueadaError as e:
        audit_log(accion="SAP_NOTA_AJUSTE_RECHAZO", detalle=str(e))
        raise
    
    # 8. Si falla post-registro, generar contra-asiento
    # (rollback por contra-asiento si se detecta error posterior)
    
    resultado = NotaAjusteResult(
        operation_id=operation_id,
        nota_id=nota_id,
        estado="completado",
        referencia_contable=f"NA-{nota_id}",
        timestamp=timestamp_utc()
    )
    
    audit_log(accion="SAP_NOTA_AJUSTE_FIN", resultado="completado", nota_id=nota_id)
    
    return resultado

    raise NotImplementedError("CONCEPTUAL_DESIGN - SAP no conectado")
```

### 4.4 Consultas

```python
# CONCEPTUAL_DESIGN — No ejecutar contra SAP real
@dataclass
class ConsultaCriterios:
    tipo_consulta: str  # "saldos" | "movimientos" | "maestro_proveedores" | "documentos"
    fecha_inicio: Optional[str]
    fecha_fin: Optional[str]
    cuenta: Optional[str]
    centro_costo: Optional[str]
    limite: int = 1000

@dataclass
class ConsultaResult:
    operation_id: str
    resultados: List[dict]
    total_registros: int
    timestamp_consulta: str

def consultar_sap(criterios: ConsultaCriterios) -> ConsultaResult:
    """
    Consulta SAP conceptual (solo lectura).
    
    Precondiciones:
    - Usuario autenticado con rol de lectura
    - Rango de fechas ≤ 365 días
    """
    # 1. Validar filtros
    if criterios.fecha_inicio and criterios.fecha_fin:
        dias = diferencia_dias(criterios.fecha_inicio, criterios.fecha_fin)
        if dias > 365:
            raise ValidacionError("Rango de fechas no puede exceder 365 días")
    
    # 2. Operation_id (para auditoría, no para idempotencia en lectura)
    operation_id = str(uuid.uuid4())
    
    # 3. Registrar consulta en audit_events
    audit_log(accion="SAP_CONSULTA", recurso=criterios.tipo_consulta,
              usuario=get_current_user(), operation_id=operation_id)
    
    # 4. Conectar y ejecutar consulta con retry
    conexion = conectar_sap()
    
    try:
        resultados = retry_policy(  # REQ-37 para timeout
            lambda: ejecutar_consulta(conexion, criterios)
        )
    except ReintentosAgotadosError:
        audit_log(accion="SAP_CONSULTA_TIMEOUT", detalle="Reintentos agotados")
        raise
    
    # 5. Limitar resultados
    resultados_limitados = resultados[:criterios.limite]
    
    return ConsultaResult(
        operation_id=operation_id,
        resultados=resultados_limitados,
        total_registros=len(resultados_limitados),
        timestamp_consulta=timestamp_utc()
    )

    raise NotImplementedError("CONCEPTUAL_DESIGN - SAP no conectado")
```

### 4.5 Extracción de Reportes

```python
# CONCEPTUAL_DESIGN — No ejecutar contra SAP real
@dataclass
class ReporteConfig:
    reporte_id: str
    periodo: str  # "YYYY-MM"
    formato: str  # "PDF" | "XLSX"
    filtros: Optional[dict] = None

@dataclass
class ReporteResult:
    operation_id: str
    archivo_path: str
    formato: str
    tamano_bytes: int
    paginas: Optional[int]
    hash_archivo: str
    timestamp: str

def extraer_reporte(config: ReporteConfig, aprobacion_id: str) -> ReporteResult:
    """
    Extracción de reportes SAP conceptual.
    
    Precondiciones:
    - Aprobación OPERATIONS_LEAD vigente (< 72h)
    - Período contable cerrado
    - reporte_id existente en catálogo
    """
    # 1. Generar operation_id idempotente
    operation_id = hashlib.sha256(
        f"{config.reporte_id}:{config.periodo}:{config.formato}".encode()
    ).hexdigest()
    
    # 2. Verificar idempotencia
    resultado_previo = buscar_operacion(operation_id)
    if resultado_previo:
        return resultado_previo
    
    # 3. Validar aprobación OPERATIONS_LEAD
    aprobacion = verificar_aprobacion(aprobacion_id, rol="OPERATIONS_LEAD")
    if not aprobacion.vigente or aprobacion.edad_horas > 72:
        raise AprobacionExpiradaError("Aprobación OPERATIONS_LEAD no vigente")
    
    # 4. Validar reporte existe en catálogo
    if not reporte_existe(config.reporte_id):
        raise ReporteNoEncontradoError(f"Reporte {config.reporte_id} no encontrado")
    
    # 5. Registrar solicitud
    audit_log(accion="SAP_REPORTE_INICIO", recurso=config.reporte_id,
              operation_id=operation_id)
    
    # 6. Conectar y generar reporte con retry
    conexion = conectar_sap()
    
    try:
        archivo = retry_policy(  # REQ-37
            lambda: generar_reporte(conexion, config)
        )
    except ReintentosAgotadosError:
        audit_log(accion="SAP_REPORTE_ERROR", detalle="Generación fallida")
        raise
    
    # 7. Calcular hash del archivo generado
    hash_archivo = hashlib.sha256(archivo.contenido).hexdigest()
    
    resultado = ReporteResult(
        operation_id=operation_id,
        archivo_path=archivo.path,
        formato=config.formato,
        tamano_bytes=archivo.tamano,
        paginas=archivo.paginas if config.formato == "PDF" else None,
        hash_archivo=hash_archivo,
        timestamp=timestamp_utc()
    )
    
    audit_log(accion="SAP_REPORTE_FIN", resultado="completado",
              detalle=f"{config.formato}, {archivo.tamano} bytes")
    
    return resultado

    raise NotImplementedError("CONCEPTUAL_DESIGN - SAP no conectado")
```

### 4.6 Conciliación Bancaria

```python
# CONCEPTUAL_DESIGN — No ejecutar contra SAP real
@dataclass
class MovimientoBancario:
    fecha: str
    referencia: str
    monto: float
    tipo: str  # "credito" | "debito"
    descripcion: str

@dataclass
class ConciliacionResult:
    operation_id: str
    partidas_conciliadas: int
    diferencias: List[dict]
    saldo_no_conciliado: float
    resumen: dict
    timestamp: str

def conciliar_bancario(
    extracto_path: str,
    periodo: str,
    aprobacion_id: str
) -> ConciliacionResult:
    """
    Conciliación bancaria conceptual.
    
    Precondiciones:
    - Aprobación LEGAL_APPROVER vigente (< 72h)
    - Período contable cerrado
    - Extracto bancario disponible y con formato válido
    """
    # 1. Generar operation_id idempotente
    operation_id = hashlib.sha256(
        f"{extracto_path}:{periodo}:{fecha_actual()}".encode()
    ).hexdigest()
    
    # 2. Verificar idempotencia
    resultado_previo = buscar_operacion(operation_id)
    if resultado_previo:
        return resultado_previo
    
    # 3. Validar aprobación LEGAL_APPROVER
    aprobacion = verificar_aprobacion(aprobacion_id, rol="LEGAL_APPROVER")
    if not aprobacion.vigente or aprobacion.edad_horas > 72:
        raise AprobacionExpiradaError("Aprobación LEGAL_APPROVER no vigente")
    
    # 4. Parsear extracto bancario
    movimientos_banco = parsear_extracto(extracto_path)
    if not movimientos_banco:
        raise ExtractoVacioError("Extracto bancario vacío o inválido")
    
    # 5. Registrar inicio
    audit_log(accion="SAP_CONCILIACION_INICIO", recurso=periodo,
              operation_id=operation_id,
              detalle=f"{len(movimientos_banco)} movimientos bancarios")
    
    # 6. Obtener saldos del sistema SAP con retry
    conexion = conectar_sap()
    
    try:
        movimientos_sap = retry_policy(  # REQ-37
            lambda: obtener_movimientos_sap(conexion, periodo)
        )
    except ReintentosAgotadosError:
        audit_log(accion="SAP_CONCILIACION_ERROR",
                  detalle="No se pudo leer saldos SAP")
        raise
    
    # 7. Ejecutar conciliación (matching por referencia + monto)
    conciliadas, diferencias = [], []
    
    for mov_banco in movimientos_banco:
        match = buscar_match(mov_banco, movimientos_sap)
        if match:
            conciliadas.append({"banco": mov_banco, "sap": match})
        else:
            diferencias.append({
                "tipo": "sin_match_sap",
                "movimiento": mov_banco,
                "monto": mov_banco.monto
            })
    
    # Movimientos SAP sin match bancario
    refs_conciliadas = {c["sap"].referencia for c in conciliadas}
    for mov_sap in movimientos_sap:
        if mov_sap.referencia not in refs_conciliadas:
            diferencias.append({
                "tipo": "sin_match_banco",
                "movimiento": mov_sap,
                "monto": mov_sap.monto
            })
    
    # 8. Calcular saldo no conciliado
    saldo_no_conciliado = sum(d["monto"] for d in diferencias)
    
    # 9. Alerta si diferencia supera umbral
    UMBRAL_ALERTA = float(os.getenv("SAP_CONCILIACION_UMBRAL", "1000000"))
    if abs(saldo_no_conciliado) > UMBRAL_ALERTA:
        audit_log(accion="SAP_CONCILIACION_ALERTA",
                  detalle=f"Diferencia ${saldo_no_conciliado} > umbral ${UMBRAL_ALERTA}")
    
    resultado = ConciliacionResult(
        operation_id=operation_id,
        partidas_conciliadas=len(conciliadas),
        diferencias=diferencias,
        saldo_no_conciliado=saldo_no_conciliado,
        resumen={
            "total_movimientos_banco": len(movimientos_banco),
            "total_movimientos_sap": len(movimientos_sap),
            "conciliadas": len(conciliadas),
            "sin_match": len(diferencias),
            "porcentaje_conciliacion": len(conciliadas) / max(len(movimientos_banco), 1) * 100
        },
        timestamp=timestamp_utc()
    )
    
    audit_log(accion="SAP_CONCILIACION_FIN", resultado="completado",
              detalle=f"{len(conciliadas)} conciliadas, {len(diferencias)} diferencias")
    
    return resultado

    raise NotImplementedError("CONCEPTUAL_DESIGN - SAP no conectado")
```

---

## 5. Política de Reintentos

> Referencia: Requirement 37 — Política centralizada de reintentos.

### Configuración Aplicada a SAP

| Parámetro | Valor | Justificación |
|-----------|-------|---------------|
| Máximo reintentos | 3 | Estándar corporativo REQ-37.1 |
| Backoff inicial | 2 segundos | Base exponencial REQ-37.1 |
| Tiempo máximo espera | 30 segundos | Límite superior REQ-37.1 |
| Jitter | ±500ms | Evitar thundering herd REQ-37.1 |
| Errores reintentables | Timeout, conexión rechazada, error 5xx | REQ-37.2 |
| Errores NO reintentables | Validación (4xx), autorización (401/403), negocio | REQ-37.2 |
| Post-agotamiento | Dead-letter queue + audit_log con correlation_id | REQ-37.3 |

### Pseudocódigo de Retry Policy

```python
# CONCEPTUAL_DESIGN — Implementación de referencia
import random
import time

def retry_policy(operation, max_retries=3, base_delay=2.0, max_delay=30.0, jitter=0.5):
    """
    Política de reintentos centralizada para operaciones SAP.
    Referencia: REQ-37.
    """
    for attempt in range(max_retries + 1):
        try:
            return operation()
        except ErrorTransitorio as e:
            if attempt == max_retries:
                # Agotar reintentos: log + dead-letter
                correlation_id = str(uuid.uuid4())
                audit_log(
                    accion="SAP_REINTENTOS_AGOTADOS",
                    correlation_id=correlation_id,
                    detalle=sanitizar_log(str(e))  # Sin credenciales ni PII
                )
                enviar_dead_letter(operation, correlation_id)
                raise ReintentosAgotadosError(correlation_id=correlation_id)
            
            # Calcular delay con backoff exponencial + jitter
            delay = min(base_delay * (2 ** attempt), max_delay)
            delay += random.uniform(-jitter, jitter)
            time.sleep(max(0, delay))
        except ErrorNoTransitorio:
            # NUNCA reintentar errores no transitorios (REQ-37.2)
            raise
```

---

## 6. Contratos de Integración

### 6.1 Schema de Entrada — Liquidación de Ventas (CSV)

```csv
# CONCEPTUAL_DESIGN — Schema esperado del CSV de liquidación
fecha,monto,concepto,centro_costo,cuenta_contable
2024-01-15,1500000.00,Venta gas residencial zona norte,CC-001,4135050001
```

| Campo | Tipo | Validación | Obligatorio |
|-------|------|------------|:-----------:|
| fecha | date (YYYY-MM-DD) | No futuro, no > 30 días anterior | ✅ |
| monto | decimal(15,2) | > 0, ≤ 9,999,999,999.99 | ✅ |
| concepto | string(200) | No vacío, sin caracteres especiales peligrosos | ✅ |
| centro_costo | string(20) | Formato CC-NNN, existente en catálogo | ✅ |
| cuenta_contable | string(15) | Numérica, existente en plan de cuentas | ✅ |

### 6.2 Schema de Entrada — Pagos (JSON)

```json
{
  "$schema": "CONCEPTUAL_DESIGN",
  "type": "array",
  "items": {
    "type": "object",
    "required": ["proveedor_id", "monto", "moneda", "cuenta_destino", "referencia"],
    "properties": {
      "proveedor_id": { "type": "string", "pattern": "^PROV-[0-9]{6}$" },
      "monto": { "type": "number", "minimum": 0.01, "maximum": 9999999999.99 },
      "moneda": { "type": "string", "enum": ["COP", "USD"] },
      "cuenta_destino": { "type": "string", "minLength": 10, "maxLength": 20 },
      "referencia": { "type": "string", "minLength": 1, "maxLength": 50 }
    }
  }
}
```

### 6.3 Schema de Entrada — Conciliación (Extracto Bancario)

```json
{
  "$schema": "CONCEPTUAL_DESIGN",
  "type": "object",
  "required": ["banco_id", "periodo", "movimientos"],
  "properties": {
    "banco_id": { "type": "string" },
    "periodo": { "type": "string", "pattern": "^[0-9]{4}-[0-9]{2}$" },
    "movimientos": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["fecha", "referencia", "monto", "tipo"],
        "properties": {
          "fecha": { "type": "string", "format": "date" },
          "referencia": { "type": "string" },
          "monto": { "type": "number" },
          "tipo": { "type": "string", "enum": ["credito", "debito"] },
          "descripcion": { "type": "string" }
        }
      }
    }
  }
}
```

### 6.4 Schema de Salida — Resultado Genérico

```json
{
  "$schema": "CONCEPTUAL_DESIGN",
  "type": "object",
  "required": ["operation_id", "estado", "timestamp"],
  "properties": {
    "operation_id": { "type": "string", "description": "SHA-256 idempotente" },
    "estado": { "type": "string", "enum": ["completado", "parcial", "fallido"] },
    "timestamp": { "type": "string", "format": "date-time" },
    "detalle": { "type": "object", "description": "Específico por caso" },
    "errores": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "codigo": { "type": "string" },
          "mensaje": { "type": "string" },
          "linea": { "type": "integer" }
        }
      }
    }
  }
}
```

---

## 7. Trazabilidad de Requisitos

| Requisito | Criterio | Sección del Documento | Estado |
|-----------|----------|----------------------|--------|
| REQ-23.1 | 6 casos de automatización documentados | Sección 2 (Casos de Automatización) | ✅ Cubierto |
| REQ-23.2 | Entrada/salida/frecuencia/controles por caso | Secciones 2.1–2.6 (tablas de atributos) | ✅ Cubierto |
| REQ-23.3 | Matriz de controles + pseudocódigo seguro | Sección 3 (Matriz) + Sección 4 (Pseudocódigo) | ✅ Cubierto |
| REQ-23.4 | No almacenar credenciales en código | Sección 3.3 (Variables de Entorno) | ✅ Cubierto |
| REQ-23.5 | No requiere conexión real a SAP | Disclaimer en header + `NotImplementedError` | ✅ Cubierto |
| REQ-23.6 | Marcado claramente como CONCEPTUAL_DESIGN | Header, clasificación, código | ✅ Cubierto |

### Referencias Cruzadas

| Requisito Relacionado | Cómo se Aplica en SAP |
|-----------------------|----------------------|
| REQ-13 (RBAC) | Matriz de seguridad 3.1 define roles por operación |
| REQ-14 (Auditoría) | Cada flujo registra en audit_events de forma síncrona |
| REQ-15 (Aprobaciones) | Aprobación requerida con vigencia < 72h por cada operación de escritura |
| REQ-37 (Reintentos) | Política centralizada aplicada a errores transitorios SAP |
| REQ-38 (Seguridad) | HTTPS/TLS 1.3, sanitización de logs, sin PII expuesta |

---

> **Fin del documento**
>
> ⚠️ **CONCEPTUAL_DESIGN — Este documento NO constituye una implementación productiva.**
> No se han inventado códigos de transacción SAP específicos. Las credenciales provienen
> exclusivamente de variables de entorno. No existe conexión real a sistema SAP productivo.
