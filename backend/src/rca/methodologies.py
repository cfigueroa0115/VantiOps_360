"""RCA methodologies for root cause analysis of PQR cancellations.

Implements structured analytical outputs for the "Cancela Servihogar a solicitud
cliente" process:
- SIPOC diagram (Suppliers, Inputs, Process steps, Outputs, Customers)
- 5 Whys analysis (minimum 5 levels of causal depth)
- Ishikawa diagram (People, Process, Technology, Information, Environment)
- Lean waste identification (mapped to 8 Lean wastes)
- FMEA (Severity 1-5, Occurrence 1-5, Detection 1-5, Risk Priority Number)

Requirements: 11.3
"""

from __future__ import annotations

from dataclasses import dataclass

# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------


@dataclass
class SIPOCDiagram:
    """SIPOC process analysis diagram.

    Attributes:
        suppliers: Entities that provide inputs to the process.
        inputs: Resources, information, or materials entering the process.
        process_steps: Sequential steps in the process.
        outputs: Deliverables produced by the process.
        customers: Recipients of the process outputs.
    """

    suppliers: list[str]
    inputs: list[str]
    process_steps: list[str]
    outputs: list[str]
    customers: list[str]


@dataclass
class WhyLevel:
    """A single level in the 5 Whys causal chain.

    Attributes:
        level: The depth level (1-based, minimum 5 levels required).
        question: The "Why?" question asked at this level.
        answer: The causal explanation answering the question.
        evidence: Supporting evidence or data point for the answer.
    """

    level: int
    question: str
    answer: str
    evidence: str


@dataclass
class IshikawaDiagram:
    """Ishikawa (fishbone/cause-and-effect) diagram.

    Attributes:
        effect: The problem or effect being analyzed.
        categories: Mapping of category names to lists of contributing causes.
    """

    effect: str
    categories: dict[str, list[str]]


@dataclass
class LeanWaste:
    """A single Lean waste type identified in the process.

    Attributes:
        waste_type: Name of the Lean waste (one of 8 types).
        description: Brief description of how this waste manifests.
        examples: Concrete examples observed in the cancellation process.
        impact: Estimated operational impact of this waste.
    """

    waste_type: str
    description: str
    examples: list[str]
    impact: str


@dataclass
class FailureMode:
    """A single failure mode entry for FMEA analysis.

    Attributes:
        mode: Description of the failure mode.
        effect: Impact/effect of the failure on the process.
        severity: Severity rating (1-5, where 5 is most severe).
        occurrence: Likelihood of occurrence (1-5, where 5 is most frequent).
        detection: Difficulty of detection (1-5, where 5 is hardest to detect).
        rpn: Risk Priority Number (severity × occurrence × detection).
        recommended_action: Suggested corrective action.
    """

    mode: str
    effect: str
    severity: int  # 1-5
    occurrence: int  # 1-5
    detection: int  # 1-5
    rpn: int  # S × O × D
    recommended_action: str

    def __post_init__(self) -> None:
        """Validate ratings and compute RPN."""
        for attr_name in ("severity", "occurrence", "detection"):
            value = getattr(self, attr_name)
            if not (1 <= value <= 5):
                raise ValueError(f"{attr_name} must be between 1 and 5, got {value}")
        self.rpn = self.severity * self.occurrence * self.detection


@dataclass
class FMEAResult:
    """Aggregated FMEA analysis result.

    Attributes:
        failure_modes: All identified failure modes with ratings.
        total_rpn: Sum of all RPNs across failure modes.
        average_rpn: Mean RPN value.
        highest_risk: The failure mode with the highest RPN.
    """

    failure_modes: list[FailureMode]
    total_rpn: int
    average_rpn: float
    highest_risk: FailureMode


# ---------------------------------------------------------------------------
# SIPOC Analysis
# ---------------------------------------------------------------------------


def sipoc(main_cause: str = "Cancela Servihogar a solicitud cliente") -> SIPOCDiagram:
    """Generate SIPOC diagram for the Servihogar cancellation process.

    Maps out the full process from suppliers through to customers,
    providing a high-level view of the cancellation handling flow.

    Parameters
    ----------
    main_cause : str
        The main cause being analyzed (used for context labeling).

    Returns
    -------
    SIPOCDiagram
        Complete SIPOC diagram with all five categories populated.
    """
    return SIPOCDiagram(
        suppliers=[
            "Cliente (solicitante de cancelación)",
            "Agente de call center",
            "Sistema CRM",
            "Base de datos de contratos",
            "Proveedor Servihogar",
        ],
        inputs=[
            "Solicitud verbal/escrita del cliente",
            "Datos del contrato vigente",
            "Información del producto Servihogar",
            "Historial de servicios del cliente",
            "Política de cancelación vigente",
        ],
        process_steps=[
            "Recibir solicitud de cancelación del cliente",
            "Validar identidad del cliente",
            "Verificar elegibilidad de cancelación",
            "Consultar condiciones contractuales",
            "Registrar motivo de cancelación",
            "Ejecutar cancelación en sistema",
            "Generar orden de cancelación",
            "Notificar al cliente la confirmación",
        ],
        outputs=[
            "Orden de cancelación generada",
            "Registro CRM actualizado",
            "Notificación de confirmación al cliente",
            "Reporte de cancelación para finanzas",
            "Registro de motivo para analytics",
        ],
        customers=[
            "Cliente (confirmación de cancelación)",
            "Equipo de operaciones (gestión de procesos)",
            "Departamento de finanzas (facturación)",
            "Área de retención (indicadores)",
            "Gerencia (reportes ejecutivos)",
        ],
    )


# ---------------------------------------------------------------------------
# 5 Whys Analysis
# ---------------------------------------------------------------------------


def five_whys(
    main_cause: str = "Cancela Servihogar a solicitud cliente",
) -> list[WhyLevel]:
    """Apply 5 Whys methodology to the Servihogar cancellation root cause.

    Traces causal depth from the observed high-volume symptom to underlying
    systemic issues. Minimum 5 levels of depth as required by specification.

    Parameters
    ----------
    main_cause : str
        The main cause being analyzed.

    Returns
    -------
    list[WhyLevel]
        Ordered list of 5+ why levels, each with question, answer, and evidence.
    """
    return [
        WhyLevel(
            level=1,
            question="¿Por qué hay un alto volumen de cancelaciones de Servihogar?",
            answer=(
                "Porque los clientes perciben bajo valor en el producto "
                "Servihogar respecto al costo mensual."
            ),
            evidence=(
                "La causa 'Cancela Servihogar a solicitud cliente' representa "
                "≥45% del total de PQRs, indicando insatisfacción masiva con "
                "la propuesta de valor."
            ),
        ),
        WhyLevel(
            level=2,
            question=("¿Por qué los clientes perciben bajo valor en Servihogar?"),
            answer=(
                "Porque no existe un paso de retención ni comunicación "
                "proactiva de beneficios antes de procesar la cancelación."
            ),
            evidence=(
                "El proceso actual no incluye oferta de retención ni "
                "validación de motivo; el agente procesa la solicitud "
                "directamente sin intentar recuperar al cliente."
            ),
        ),
        WhyLevel(
            level=3,
            question=("¿Por qué no existe un paso de retención en el proceso?"),
            answer=(
                "Porque el proceso de cancelación fue diseñado para "
                "cumplimiento operativo sin métricas de retención ni "
                "herramientas de oferta al agente."
            ),
            evidence=(
                "El flujo BPMN AS-IS no contiene gateway de retención. "
                "Los agentes carecen de scripts de retención o catálogo "
                "de ofertas disponibles en el sistema."
            ),
        ),
        WhyLevel(
            level=4,
            question=("¿Por qué el proceso carece de herramientas de retención?"),
            answer=(
                "Porque el sistema CRM legado no soporta lógica de "
                "decisión contextual ni integración con catálogos de "
                "ofertas en tiempo real."
            ),
            evidence=(
                "El CRM actual es un registro transaccional sin motor de "
                "reglas. No existe integración API con el módulo de "
                "beneficios/descuentos del producto."
            ),
        ),
        WhyLevel(
            level=5,
            question=("¿Por qué el CRM no fue modernizado para soportar retención?"),
            answer=(
                "Porque históricamente la cancelación se trató como un "
                "proceso de bajo impacto y no se priorizó inversión en "
                "capacidades analíticas ni de retención."
            ),
            evidence=(
                "No existe business case previo para retención de Servihogar. "
                "El volumen actual (~50% de PQRs) demuestra que el impacto "
                "financiero y operativo justifica la inversión en "
                "automatización y retención."
            ),
        ),
        WhyLevel(
            level=6,
            question=(
                "¿Por qué no se midió previamente el impacto financiero " "de las cancelaciones?"
            ),
            answer=(
                "Porque no existían herramientas de analytics ni "
                "trazabilidad estructurada del proceso de cancelación que "
                "permitieran cuantificar el costo operativo y la pérdida "
                "de ingreso recurrente."
            ),
            evidence=(
                "Este análisis PQR es el primer ejercicio de data analytics "
                "sobre el proceso. La clasificación de causas carecía de "
                "catálogo homologado, dificultando el seguimiento histórico."
            ),
        ),
    ]


# ---------------------------------------------------------------------------
# Ishikawa (Fishbone) Diagram
# ---------------------------------------------------------------------------


def ishikawa(
    main_cause: str = "Cancela Servihogar a solicitud cliente",
) -> IshikawaDiagram:
    """Generate Ishikawa diagram for the Servihogar cancellation process.

    Organizes contributing causes into 5 categories: People, Process,
    Technology, Information, and Environment.

    Parameters
    ----------
    main_cause : str
        The effect being analyzed (high cancellation volume).

    Returns
    -------
    IshikawaDiagram
        Fishbone diagram with categorized causes.
    """
    return IshikawaDiagram(
        effect=f"Alto volumen de cancelaciones: {main_cause}",
        categories={
            "People (Personas)": [
                "Capacitación insuficiente de agentes en retención",
                "Alta rotación de personal en call center",
                "Carga de trabajo excesiva por agente",
                "Falta de incentivos para retención",
                "Ausencia de especialistas en producto Servihogar",
            ],
            "Process (Proceso)": [
                "No existe paso de retención en el flujo",
                "Registro manual de datos de cancelación",
                "Ausencia de validación de motivo real",
                "No hay escalamiento a unidad de retención",
                "Múltiples re-envíos entre áreas",
                "Falta de control de tiempos por etapa",
            ],
            "Technology (Tecnología)": [
                "CRM legado sin capacidad de decisión contextual",
                "No hay portal de autoservicio para cancelaciones",
                "Falta de integración con catálogo de ofertas",
                "Sin alertas automáticas de casos en riesgo",
                "Ausencia de workflow automatizado",
            ],
            "Information (Información)": [
                "Datos incompletos en registros de cancelación",
                "Sin analytics de causas de cancelación",
                "Catálogo de causas no homologado",
                "Falta de visibilidad del estado del trámite",
                "Sin histórico de intentos de retención",
            ],
            "Environment (Entorno)": [
                "Competencia de mercado con mejores ofertas",
                "Presión de precios en productos complementarios",
                "Cambios regulatorios facilitan cancelación",
                "Expectativas crecientes del cliente digital",
                "Contexto económico reduce gasto discrecional",
            ],
        },
    )


# ---------------------------------------------------------------------------
# Lean Waste Identification
# ---------------------------------------------------------------------------


def lean_wastes(
    main_cause: str = "Cancela Servihogar a solicitud cliente",
) -> list[LeanWaste]:
    """Identify the 8 Lean wastes in the Servihogar cancellation process.

    Maps each of the 8 classical Lean wastes (TIMWOODS) to specific
    manifestations observed in the cancellation handling flow.

    Parameters
    ----------
    main_cause : str
        The process context for waste identification.

    Returns
    -------
    list[LeanWaste]
        All 8 Lean wastes with descriptions, examples, and impacts.
    """
    return [
        LeanWaste(
            waste_type="Transporte",
            description=("Movimiento innecesario de información entre sistemas y áreas."),
            examples=[
                "Reenvío de solicitud entre agente de call center y back office",
                "Transferencia manual de datos entre CRM y sistema de facturación",
                "Escalamiento innecesario a supervisor para cancelaciones simples",
            ],
            impact=(
                "Incrementa tiempo de gestión promedio en ~2 días por "
                "reenvíos múltiples entre áreas."
            ),
        ),
        LeanWaste(
            waste_type="Inventario",
            description=("Acumulación de solicitudes pendientes sin procesar."),
            examples=[
                "Cola de cancelaciones pendientes de validación",
                "Backlog de notificaciones no enviadas al cliente",
                "Registros incompletos esperando datos faltantes",
            ],
            impact=(
                "Genera cases abiertos por más tiempo del necesario, "
                "inflando la métrica de tiempo de gestión y P90."
            ),
        ),
        LeanWaste(
            waste_type="Movimiento",
            description=("Esfuerzo adicional del agente para completar el proceso."),
            examples=[
                "Navegación entre múltiples pantallas del CRM",
                "Búsqueda manual de datos del contrato en otro sistema",
                "Consulta verbal a supervisor para casos no estándar",
            ],
            impact=(
                "Reduce capacidad del agente: ~15 minutos por PQR en "
                "tareas que no agregan valor directo."
            ),
        ),
        LeanWaste(
            waste_type="Espera",
            description=("Tiempo muerto donde la solicitud no avanza."),
            examples=[
                "Espera de aprobación de supervisor para ejecutar cancelación",
                "Cliente en espera mientras agente consulta sistema",
                "Solicitud en cola hasta que área responsable la recoge",
            ],
            impact=(
                "Contribuye directamente al P90 elevado; ~30% del tiempo "
                "total de gestión es espera sin acción."
            ),
        ),
        LeanWaste(
            waste_type="Sobreproducción",
            description=("Generación de outputs que no son requeridos o consumidos."),
            examples=[
                "Reportes duplicados generados para distintas áreas",
                "Notificaciones redundantes al cliente por múltiples canales",
                "Registro de cancelación en sistema y en hoja paralela",
            ],
            impact=(
                "Duplica esfuerzo operativo sin mejorar la experiencia "
                "del cliente ni la trazabilidad."
            ),
        ),
        LeanWaste(
            waste_type="Sobreprocesamiento",
            description=("Pasos del proceso que exceden lo necesario para el resultado."),
            examples=[
                "Validación manual de identidad cuando ya se autenticó por IVR",
                "Doble verificación de elegibilidad por agente y supervisor",
                "Documentación excesiva para cancelaciones de bajo monto",
            ],
            impact=(
                "Añade ~5 minutos por transacción sin reducir riesgo "
                "operativo ni mejorar calidad del servicio."
            ),
        ),
        LeanWaste(
            waste_type="Defectos",
            description=("Errores que requieren retrabajo o generan insatisfacción."),
            examples=[
                "Registro con campos incompletos que requiere re-contacto",
                "Clasificación incorrecta de causa/motivo de cancelación",
                "Cancelación ejecutada sin confirmar identidad del titular",
                "Notificación enviada con datos erróneos",
            ],
            impact=(
                "~20% de registros presentan issues de calidad de datos "
                "(campos nulos, categorías inconsistentes), generando "
                "retrabajo y baja confiabilidad analítica."
            ),
        ),
        LeanWaste(
            waste_type="Talento subutilizado",
            description=("Capacidades del personal no aprovechadas en el proceso."),
            examples=[
                "Agentes con habilidades de retención sin script ni empowerment",
                "Analistas de datos sin acceso a información estructurada",
                "Supervisores dedicados a aprobaciones rutinarias",
            ],
            impact=(
                "Oportunidad perdida de retención estimada en 10-15% de "
                "cancelaciones que podrían revertirse con intervención "
                "oportuna del agente capacitado."
            ),
        ),
    ]


# ---------------------------------------------------------------------------
# FMEA (Failure Mode and Effects Analysis)
# ---------------------------------------------------------------------------


def fmea(
    failure_modes: list[FailureMode] | None = None,
) -> FMEAResult:
    """Perform simplified FMEA on the Servihogar cancellation process.

    If no failure modes are provided, uses default domain-specific failure
    modes identified for the cancellation process. Each mode is rated on
    Severity (1-5), Occurrence (1-5), and Detection (1-5), producing
    a Risk Priority Number (RPN = S × O × D).

    Parameters
    ----------
    failure_modes : list[FailureMode] | None
        Custom failure modes to analyze. If None, uses predefined set
        for the Servihogar cancellation process.

    Returns
    -------
    FMEAResult
        Aggregated FMEA result with total RPN, average RPN, and
        highest-risk failure mode identified.
    """
    if failure_modes is None:
        failure_modes = _default_failure_modes()

    if not failure_modes:
        raise ValueError("At least one failure mode is required for FMEA.")

    total_rpn = sum(fm.rpn for fm in failure_modes)
    average_rpn = total_rpn / len(failure_modes)
    highest_risk = max(failure_modes, key=lambda fm: fm.rpn)

    return FMEAResult(
        failure_modes=failure_modes,
        total_rpn=total_rpn,
        average_rpn=round(average_rpn, 2),
        highest_risk=highest_risk,
    )


def _default_failure_modes() -> list[FailureMode]:
    """Define default failure modes for the Servihogar cancellation process.

    Returns
    -------
    list[FailureMode]
        Domain-specific failure modes with severity, occurrence, and
        detection ratings based on process knowledge.
    """
    return [
        FailureMode(
            mode="Registro incompleto de datos de cancelación",
            effect=(
                "Imposibilidad de análisis de causas; retrabajo para "
                "completar información faltante."
            ),
            severity=4,
            occurrence=5,
            detection=3,
            rpn=0,  # Will be computed by __post_init__
            recommended_action=(
                "Implementar formulario estructurado con campos "
                "obligatorios y validación en tiempo real."
            ),
        ),
        FailureMode(
            mode="Clasificación incorrecta del motivo de cancelación",
            effect=(
                "Sesgo en analytics de causas; acciones correctivas "
                "dirigidas a causas equivocadas."
            ),
            severity=4,
            occurrence=4,
            detection=4,
            rpn=0,
            recommended_action=(
                "Implementar catálogo homologado de causas con "
                "selección guiada y validación por reglas."
            ),
        ),
        FailureMode(
            mode="Ausencia de intento de retención",
            effect=(
                "Pérdida de clientes que habrían permanecido con "
                "oferta adecuada; reducción de ingresos recurrentes."
            ),
            severity=5,
            occurrence=5,
            detection=2,
            rpn=0,
            recommended_action=(
                "Diseñar gateway de retención obligatorio con "
                "script y catálogo de ofertas por perfil de cliente."
            ),
        ),
        FailureMode(
            mode="Tiempo de espera excesivo por aprobación",
            effect=(
                "Incumplimiento de SLA de atención; insatisfacción " "del cliente y escalamiento."
            ),
            severity=3,
            occurrence=4,
            detection=3,
            rpn=0,
            recommended_action=(
                "Automatizar aprobación para cancelaciones estándar; "
                "definir reglas de auto-aprobación por monto/tipo."
            ),
        ),
        FailureMode(
            mode="Cancelación ejecutada sin validar identidad del titular",
            effect=(
                "Riesgo de fraude; cancelación no autorizada que genera "
                "reclamaciones adicionales."
            ),
            severity=5,
            occurrence=2,
            detection=3,
            rpn=0,
            recommended_action=(
                "Implementar validación de identidad obligatoria "
                "(OTP, preguntas de seguridad) previo a ejecución."
            ),
        ),
        FailureMode(
            mode="Notificación no enviada o enviada con datos erróneos",
            effect=(
                "Cliente desconoce el estado de su solicitud; genera "
                "llamadas de seguimiento y PQRs adicionales."
            ),
            severity=3,
            occurrence=3,
            detection=4,
            rpn=0,
            recommended_action=(
                "Automatizar notificaciones con plantillas validadas "
                "y confirmación de entrega por canal preferido."
            ),
        ),
        FailureMode(
            mode="Re-envíos múltiples entre áreas sin resolución",
            effect=(
                "Tiempo de gestión inflado; cliente sin respuesta "
                "durante días; pérdida de trazabilidad."
            ),
            severity=4,
            occurrence=3,
            detection=3,
            rpn=0,
            recommended_action=(
                "Definir ownership claro por tipo de cancelación; "
                "implementar timer y escalamiento automático."
            ),
        ),
        FailureMode(
            mode="Falta de visibilidad del estado para el cliente",
            effect=(
                "Cliente genera múltiples contactos preguntando por "
                "su trámite; saturación del call center."
            ),
            severity=3,
            occurrence=4,
            detection=5,
            rpn=0,
            recommended_action=(
                "Implementar portal de autoservicio con tracking "
                "en tiempo real del estado de la solicitud."
            ),
        ),
    ]
