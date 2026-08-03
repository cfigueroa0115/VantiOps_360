"""
Annulations module for VantiOps 360.

Implements the annulations state machine (Motor_Anulaciones) with 6 states,
valid transitions, role-based authorization, and audit logging.

Requirements: REQ-16.1, REQ-16.2, REQ-16.3, REQ-16.5, REQ-16.6
"""

from annulations.state_machine import (
    AnnulationState,
    TransitionResult,
    get_valid_transitions,
    transition,
    validate_transition,
)

__all__ = [
    "AnnulationState",
    "TransitionResult",
    "get_valid_transitions",
    "transition",
    "validate_transition",
]
