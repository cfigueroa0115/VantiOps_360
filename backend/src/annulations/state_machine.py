"""
Annulations State Machine for VantiOps 360.

Implements the Motor_Anulaciones finite state machine (FSM) with 6 states,
role-based transition authorization, justification validation, and audit logging.

States:
  Solicitada, En_Revision, Aprobada, Rechazada, En_Ejecucion, Cerrada

Terminal states (no outgoing transitions):
  Cerrada, Rechazada

Requirements:
  - REQ-16.1: Implement state machine with 6 states; Cerrada and Rechazada are terminal.
  - REQ-16.2: Only valid transitions allowed; invalid → HTTP 422.
  - REQ-16.3: Every transition logs to audit with user, role, timestamp, justification ≥ 10 chars.
  - REQ-16.5: Invalid transitions rejected with HTTP 422, showing valid targets.
  - REQ-16.6: Justification < 10 chars → HTTP 400.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import StrEnum

from auth.rbac import Role


class AnnulationState(StrEnum):
    """The 6 states of the annulations state machine."""

    SOLICITADA = "Solicitada"
    EN_REVISION = "En_Revision"
    APROBADA = "Aprobada"
    RECHAZADA = "Rechazada"
    EN_EJECUCION = "En_Ejecucion"
    CERRADA = "Cerrada"


# ---------------------------------------------------------------------------
# Terminal states: no outgoing transitions allowed (REQ-16.1)
# ---------------------------------------------------------------------------

TERMINAL_STATES: frozenset[AnnulationState] = frozenset(
    [
        AnnulationState.CERRADA,
        AnnulationState.RECHAZADA,
    ]
)

# ---------------------------------------------------------------------------
# Valid transitions table (REQ-16.2)
# Maps (from_state, to_state) → set of authorized roles
# ---------------------------------------------------------------------------

VALID_TRANSITIONS: dict[tuple[AnnulationState, AnnulationState], frozenset[Role]] = {
    (AnnulationState.SOLICITADA, AnnulationState.EN_REVISION): frozenset(
        [
            Role.OPERATIONS_LEAD,
            Role.ANALYST,
            Role.SYSTEM_ADMIN,
        ]
    ),
    (AnnulationState.EN_REVISION, AnnulationState.APROBADA): frozenset(
        [
            Role.LEGAL_APPROVER,
            Role.VP_APPROVER,
            Role.SYSTEM_ADMIN,
        ]
    ),
    (AnnulationState.EN_REVISION, AnnulationState.RECHAZADA): frozenset(
        [
            Role.LEGAL_APPROVER,
            Role.VP_APPROVER,
            Role.SYSTEM_ADMIN,
        ]
    ),
    (AnnulationState.APROBADA, AnnulationState.EN_EJECUCION): frozenset(
        [
            Role.OPERATIONS_LEAD,
            Role.SYSTEM_ADMIN,
        ]
    ),
    (AnnulationState.EN_EJECUCION, AnnulationState.CERRADA): frozenset(
        [
            Role.OPERATIONS_LEAD,
            Role.SYSTEM_ADMIN,
        ]
    ),
}

# Minimum justification length (REQ-16.6)
MIN_JUSTIFICATION_LENGTH = 10


# ---------------------------------------------------------------------------
# Result types
# ---------------------------------------------------------------------------


@dataclass
class TransitionError:
    """Error details for a failed transition."""

    code: int  # HTTP-like status code (400, 403, 422)
    message: str
    current_state: str | None = None
    target_state: str | None = None
    valid_targets: list[str] = field(default_factory=list)


@dataclass
class AuditEntry:
    """Audit record generated for a successful transition."""

    cancellation_id: str
    from_state: str
    to_state: str
    user_id: str
    user_role: str
    justification: str
    timestamp: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


@dataclass
class TransitionResult:
    """Result of a transition attempt.

    Attributes:
        success: Whether the transition was executed successfully.
        error: Error details if the transition failed (None on success).
        audit_entry: Audit record generated on success (None on failure).
        new_state: The state after transition (None on failure).
    """

    success: bool
    error: TransitionError | None = None
    audit_entry: AuditEntry | None = None
    new_state: str | None = None


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def get_valid_transitions(current_state: str, user_role: str) -> list[str]:
    """Return the list of valid target states from current_state for the given role.

    Args:
        current_state: The current state of the annulation request.
        user_role: The role of the user attempting the transition.

    Returns:
        A sorted list of valid target state names the user can transition to.
        Returns an empty list if:
          - current_state is invalid or terminal
          - user_role is invalid
          - no transitions are authorized for this role from current_state

    Examples:
        >>> get_valid_transitions("Solicitada", "OPERATIONS_LEAD")
        ['En_Revision']
        >>> get_valid_transitions("En_Revision", "LEGAL_APPROVER")
        ['Aprobada', 'Rechazada']
        >>> get_valid_transitions("Cerrada", "SYSTEM_ADMIN")
        []
        >>> get_valid_transitions("Solicitada", "INTERN_READONLY")
        []
    """
    # Validate current_state
    try:
        state = AnnulationState(current_state)
    except ValueError:
        return []

    # Terminal states have no outgoing transitions
    if state in TERMINAL_STATES:
        return []

    # Validate user_role
    try:
        role = Role(user_role)
    except ValueError:
        return []

    # Find all valid targets for this state where the role is authorized
    targets: list[str] = []
    for (from_state, to_state), authorized_roles in VALID_TRANSITIONS.items():
        if from_state == state and role in authorized_roles:
            targets.append(to_state.value)

    return sorted(targets)


def validate_transition(current_state: str, target_state: str, user_role: str) -> bool:
    """Check if a transition is valid (state pair exists and role is authorized).

    This performs both structural validation (is the transition defined?) and
    role-based authorization (is the user's role allowed for this transition?).

    Args:
        current_state: The current state of the annulation request.
        target_state: The desired target state.
        user_role: The role of the user attempting the transition.

    Returns:
        True if the transition is structurally valid AND the role is authorized.
        False otherwise.

    Examples:
        >>> validate_transition("Solicitada", "En_Revision", "OPERATIONS_LEAD")
        True
        >>> validate_transition("Solicitada", "En_Revision", "INTERN_READONLY")
        False
        >>> validate_transition("Solicitada", "Cerrada", "SYSTEM_ADMIN")
        False
        >>> validate_transition("Cerrada", "Solicitada", "SYSTEM_ADMIN")
        False
    """
    # Validate states
    try:
        from_state = AnnulationState(current_state)
        to_state = AnnulationState(target_state)
    except ValueError:
        return False

    # Validate role
    try:
        role = Role(user_role)
    except ValueError:
        return False

    # Check transition exists and role is authorized
    key = (from_state, to_state)
    if key not in VALID_TRANSITIONS:
        return False

    return role in VALID_TRANSITIONS[key]


def _validate_justification(justification: str) -> TransitionError | None:
    """Validate justification meets minimum length requirement (REQ-16.6).

    Returns:
        None if valid, TransitionError if invalid.
    """
    if not justification or len(justification.strip()) < MIN_JUSTIFICATION_LENGTH:
        return TransitionError(
            code=400,
            message=(
                f"Justification is required and must be at least "
                f"{MIN_JUSTIFICATION_LENGTH} characters. "
                f"Received {len(justification.strip()) if justification else 0} characters."
            ),
        )
    return None


def _validate_role_authorization(
    from_state: AnnulationState,
    to_state: AnnulationState,
    user_role: str,
) -> TransitionError | None:
    """Validate role is authorized for this specific transition.

    Returns:
        None if authorized, TransitionError if not.
    """
    try:
        role = Role(user_role)
    except ValueError:
        return TransitionError(
            code=403,
            message=f"Invalid role: '{user_role}'. Access denied.",
            current_state=from_state.value,
            target_state=to_state.value,
        )

    key = (from_state, to_state)
    if key in VALID_TRANSITIONS and role not in VALID_TRANSITIONS[key]:
        authorized = sorted(r.value for r in VALID_TRANSITIONS[key])
        return TransitionError(
            code=403,
            message=(
                f"Role '{user_role}' is not authorized to transition from "
                f"'{from_state.value}' to '{to_state.value}'. "
                f"Authorized roles: {authorized}."
            ),
            current_state=from_state.value,
            target_state=to_state.value,
        )
    return None


def transition(
    cancellation_id: str,
    target_state: str,
    user_id: str,
    user_role: str,
    justification: str,
    current_state: str | None = None,
) -> TransitionResult:
    """Execute a state transition on an annulation request.

    Validates in order:
      1. Justification ≥ 10 characters (REQ-16.6) → 400 if invalid
      2. Role authorization (REQ-16.5) → 403 if unauthorized
      3. Transition validity (REQ-16.2) → 422 if invalid transition

    On success, generates an audit entry (REQ-16.3) and returns the new state.

    Note: This function validates and produces the audit entry but does NOT
    persist to the database. The caller (API layer) is responsible for:
      - Looking up the current_state from the database
      - Persisting the state change
      - Writing the audit entry to cancellation_state_history
      - Logging to the audit_events table via audit.logger

    Args:
        cancellation_id: UUID of the cancellation request.
        target_state: The desired target state.
        user_id: UUID or identifier of the user performing the transition.
        user_role: The role of the user (must be from Lista Maestra).
        justification: Text justification for the transition (≥ 10 chars).
        current_state: The current state of the request. If None, returns error.

    Returns:
        TransitionResult with success=True and audit_entry on success,
        or success=False with error details on failure.

    Examples:
        >>> result = transition("uuid-1", "En_Revision", "user-1", "OPERATIONS_LEAD",
        ...                     "Moving to review phase for analysis", "Solicitada")
        >>> result.success
        True
        >>> result.new_state
        'En_Revision'

        >>> result = transition("uuid-1", "En_Revision", "user-1", "OPERATIONS_LEAD",
        ...                     "short", "Solicitada")
        >>> result.success
        False
        >>> result.error.code
        400
    """
    # Step 0: Validate current_state is provided
    if current_state is None:
        return TransitionResult(
            success=False,
            error=TransitionError(
                code=422,
                message="Current state is required to perform a transition.",
            ),
        )

    # Step 1: Validate justification (REQ-16.6)
    justification_error = _validate_justification(justification)
    if justification_error:
        return TransitionResult(success=False, error=justification_error)

    # Step 2: Validate current_state and target_state are valid enum values
    try:
        from_state = AnnulationState(current_state)
    except ValueError:
        return TransitionResult(
            success=False,
            error=TransitionError(
                code=422,
                message=f"Invalid current state: '{current_state}'.",
                current_state=current_state,
                target_state=target_state,
            ),
        )

    try:
        to_state = AnnulationState(target_state)
    except ValueError:
        valid_targets = _get_all_valid_targets(from_state)
        return TransitionResult(
            success=False,
            error=TransitionError(
                code=422,
                message=f"Invalid target state: '{target_state}'.",
                current_state=from_state.value,
                target_state=target_state,
                valid_targets=valid_targets,
            ),
        )

    # Step 3: Check terminal state (REQ-16.1)
    if from_state in TERMINAL_STATES:
        return TransitionResult(
            success=False,
            error=TransitionError(
                code=422,
                message=(
                    f"State '{from_state.value}' is a terminal state. "
                    f"No transitions are allowed."
                ),
                current_state=from_state.value,
                target_state=to_state.value,
                valid_targets=[],
            ),
        )

    # Step 4: Check transition structural validity (REQ-16.2, REQ-16.5)
    key = (from_state, to_state)
    if key not in VALID_TRANSITIONS:
        valid_targets = _get_all_valid_targets(from_state)
        return TransitionResult(
            success=False,
            error=TransitionError(
                code=422,
                message=(
                    f"Transition from '{from_state.value}' to '{to_state.value}' "
                    f"is not valid. Valid transitions from '{from_state.value}': "
                    f"{valid_targets}."
                ),
                current_state=from_state.value,
                target_state=to_state.value,
                valid_targets=valid_targets,
            ),
        )

    # Step 5: Validate role authorization
    role_error = _validate_role_authorization(from_state, to_state, user_role)
    if role_error:
        return TransitionResult(success=False, error=role_error)

    # Step 6: Success — generate audit entry (REQ-16.3)
    audit_entry = AuditEntry(
        cancellation_id=cancellation_id,
        from_state=from_state.value,
        to_state=to_state.value,
        user_id=user_id,
        user_role=user_role,
        justification=justification.strip(),
    )

    return TransitionResult(
        success=True,
        audit_entry=audit_entry,
        new_state=to_state.value,
    )


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _get_all_valid_targets(from_state: AnnulationState) -> list[str]:
    """Get all valid target states from a given state (regardless of role)."""
    targets: list[str] = []
    for src, dst in VALID_TRANSITIONS:
        if src == from_state:
            targets.append(dst.value)
    return sorted(targets)
