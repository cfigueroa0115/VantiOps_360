"""
Unit tests for the annulations state machine.

Tests cover:
  - Valid transitions with authorized roles
  - Terminal states enforcement (Cerrada, Rechazada)
  - Justification validation (≥ 10 characters)
  - Role authorization per transition table
  - get_valid_transitions API
  - validate_transition API
  - Error codes (400, 403, 422)

Requirements: REQ-16.1, REQ-16.2, REQ-16.3, REQ-16.5, REQ-16.6
"""


from annulations.state_machine import (
    MIN_JUSTIFICATION_LENGTH,
    TERMINAL_STATES,
    VALID_TRANSITIONS,
    AnnulationState,
    get_valid_transitions,
    transition,
    validate_transition,
)

# ---------------------------------------------------------------------------
# Test AnnulationState enum
# ---------------------------------------------------------------------------


class TestAnnulationState:
    """Tests for the AnnulationState enum."""

    def test_has_six_states(self):
        assert len(AnnulationState) == 6

    def test_state_values(self):
        assert AnnulationState.SOLICITADA == "Solicitada"
        assert AnnulationState.EN_REVISION == "En_Revision"
        assert AnnulationState.APROBADA == "Aprobada"
        assert AnnulationState.RECHAZADA == "Rechazada"
        assert AnnulationState.EN_EJECUCION == "En_Ejecucion"
        assert AnnulationState.CERRADA == "Cerrada"


# ---------------------------------------------------------------------------
# Test terminal states (REQ-16.1)
# ---------------------------------------------------------------------------


class TestTerminalStates:
    """Tests for terminal states enforcement."""

    def test_cerrada_is_terminal(self):
        assert AnnulationState.CERRADA in TERMINAL_STATES

    def test_rechazada_is_terminal(self):
        assert AnnulationState.RECHAZADA in TERMINAL_STATES

    def test_only_two_terminal_states(self):
        assert len(TERMINAL_STATES) == 2

    def test_no_transitions_from_cerrada(self):
        targets = get_valid_transitions("Cerrada", "SYSTEM_ADMIN")
        assert targets == []

    def test_no_transitions_from_rechazada(self):
        targets = get_valid_transitions("Rechazada", "SYSTEM_ADMIN")
        assert targets == []

    def test_transition_from_cerrada_returns_422(self):
        result = transition(
            cancellation_id="uuid-test",
            target_state="Solicitada",
            user_id="user-1",
            user_role="SYSTEM_ADMIN",
            justification="This is a valid justification text",
            current_state="Cerrada",
        )
        assert not result.success
        assert result.error is not None
        assert result.error.code == 422
        assert "terminal" in result.error.message.lower()
        assert result.error.valid_targets == []

    def test_transition_from_rechazada_returns_422(self):
        result = transition(
            cancellation_id="uuid-test",
            target_state="En_Revision",
            user_id="user-1",
            user_role="SYSTEM_ADMIN",
            justification="This is a valid justification text",
            current_state="Rechazada",
        )
        assert not result.success
        assert result.error is not None
        assert result.error.code == 422
        assert "terminal" in result.error.message.lower()


# ---------------------------------------------------------------------------
# Test valid transitions (REQ-16.2)
# ---------------------------------------------------------------------------


class TestValidTransitions:
    """Tests for valid state transitions."""

    def test_solicitada_to_en_revision(self):
        result = transition(
            cancellation_id="uuid-1",
            target_state="En_Revision",
            user_id="user-1",
            user_role="OPERATIONS_LEAD",
            justification="Moving request to review phase",
            current_state="Solicitada",
        )
        assert result.success
        assert result.new_state == "En_Revision"
        assert result.audit_entry is not None

    def test_en_revision_to_aprobada(self):
        result = transition(
            cancellation_id="uuid-1",
            target_state="Aprobada",
            user_id="user-2",
            user_role="LEGAL_APPROVER",
            justification="Approved after legal review",
            current_state="En_Revision",
        )
        assert result.success
        assert result.new_state == "Aprobada"

    def test_en_revision_to_rechazada(self):
        result = transition(
            cancellation_id="uuid-1",
            target_state="Rechazada",
            user_id="user-2",
            user_role="VP_APPROVER",
            justification="Rejected due to insufficient documentation",
            current_state="En_Revision",
        )
        assert result.success
        assert result.new_state == "Rechazada"

    def test_aprobada_to_en_ejecucion(self):
        result = transition(
            cancellation_id="uuid-1",
            target_state="En_Ejecucion",
            user_id="user-3",
            user_role="OPERATIONS_LEAD",
            justification="Beginning execution of approved annulation",
            current_state="Aprobada",
        )
        assert result.success
        assert result.new_state == "En_Ejecucion"

    def test_en_ejecucion_to_cerrada(self):
        result = transition(
            cancellation_id="uuid-1",
            target_state="Cerrada",
            user_id="user-3",
            user_role="SYSTEM_ADMIN",
            justification="Annulation executed and closed successfully",
            current_state="En_Ejecucion",
        )
        assert result.success
        assert result.new_state == "Cerrada"

    def test_invalid_transition_solicitada_to_aprobada(self):
        result = transition(
            cancellation_id="uuid-1",
            target_state="Aprobada",
            user_id="user-1",
            user_role="SYSTEM_ADMIN",
            justification="Trying to skip review phase",
            current_state="Solicitada",
        )
        assert not result.success
        assert result.error is not None
        assert result.error.code == 422
        assert "En_Revision" in result.error.valid_targets

    def test_invalid_transition_solicitada_to_cerrada(self):
        result = transition(
            cancellation_id="uuid-1",
            target_state="Cerrada",
            user_id="user-1",
            user_role="SYSTEM_ADMIN",
            justification="Trying to close directly from Solicitada",
            current_state="Solicitada",
        )
        assert not result.success
        assert result.error.code == 422

    def test_invalid_transition_aprobada_to_en_revision(self):
        result = transition(
            cancellation_id="uuid-1",
            target_state="En_Revision",
            user_id="user-1",
            user_role="SYSTEM_ADMIN",
            justification="Trying to go back to review",
            current_state="Aprobada",
        )
        assert not result.success
        assert result.error.code == 422


# ---------------------------------------------------------------------------
# Test justification validation (REQ-16.6)
# ---------------------------------------------------------------------------


class TestJustificationValidation:
    """Tests for justification validation."""

    def test_empty_justification_rejected(self):
        result = transition(
            cancellation_id="uuid-1",
            target_state="En_Revision",
            user_id="user-1",
            user_role="OPERATIONS_LEAD",
            justification="",
            current_state="Solicitada",
        )
        assert not result.success
        assert result.error.code == 400
        assert "10" in result.error.message

    def test_short_justification_rejected(self):
        result = transition(
            cancellation_id="uuid-1",
            target_state="En_Revision",
            user_id="user-1",
            user_role="OPERATIONS_LEAD",
            justification="too short",
            current_state="Solicitada",
        )
        assert not result.success
        assert result.error.code == 400

    def test_justification_exactly_9_chars_rejected(self):
        result = transition(
            cancellation_id="uuid-1",
            target_state="En_Revision",
            user_id="user-1",
            user_role="OPERATIONS_LEAD",
            justification="123456789",  # 9 chars
            current_state="Solicitada",
        )
        assert not result.success
        assert result.error.code == 400

    def test_justification_exactly_10_chars_accepted(self):
        result = transition(
            cancellation_id="uuid-1",
            target_state="En_Revision",
            user_id="user-1",
            user_role="OPERATIONS_LEAD",
            justification="1234567890",  # 10 chars
            current_state="Solicitada",
        )
        assert result.success

    def test_justification_whitespace_only_rejected(self):
        result = transition(
            cancellation_id="uuid-1",
            target_state="En_Revision",
            user_id="user-1",
            user_role="OPERATIONS_LEAD",
            justification="          ",  # 10 spaces
            current_state="Solicitada",
        )
        assert not result.success
        assert result.error.code == 400

    def test_justification_with_leading_trailing_spaces_stripped(self):
        result = transition(
            cancellation_id="uuid-1",
            target_state="En_Revision",
            user_id="user-1",
            user_role="OPERATIONS_LEAD",
            justification="   short   ",  # only 5 actual chars
            current_state="Solicitada",
        )
        assert not result.success
        assert result.error.code == 400

    def test_long_justification_accepted(self):
        result = transition(
            cancellation_id="uuid-1",
            target_state="En_Revision",
            user_id="user-1",
            user_role="OPERATIONS_LEAD",
            justification="This is a detailed justification for moving to review",
            current_state="Solicitada",
        )
        assert result.success


# ---------------------------------------------------------------------------
# Test role authorization (REQ-16.5)
# ---------------------------------------------------------------------------


class TestRoleAuthorization:
    """Tests for role-based authorization per transition table."""

    def test_operations_lead_can_transition_solicitada(self):
        assert validate_transition("Solicitada", "En_Revision", "OPERATIONS_LEAD")

    def test_analyst_can_transition_solicitada(self):
        assert validate_transition("Solicitada", "En_Revision", "ANALYST")

    def test_system_admin_can_transition_solicitada(self):
        assert validate_transition("Solicitada", "En_Revision", "SYSTEM_ADMIN")

    def test_intern_readonly_cannot_transition_solicitada(self):
        assert not validate_transition("Solicitada", "En_Revision", "INTERN_READONLY")

    def test_legal_approver_can_approve(self):
        assert validate_transition("En_Revision", "Aprobada", "LEGAL_APPROVER")

    def test_vp_approver_can_approve(self):
        assert validate_transition("En_Revision", "Aprobada", "VP_APPROVER")

    def test_system_admin_can_approve(self):
        assert validate_transition("En_Revision", "Aprobada", "SYSTEM_ADMIN")

    def test_analyst_cannot_approve(self):
        assert not validate_transition("En_Revision", "Aprobada", "ANALYST")

    def test_legal_approver_can_reject(self):
        assert validate_transition("En_Revision", "Rechazada", "LEGAL_APPROVER")

    def test_vp_approver_can_reject(self):
        assert validate_transition("En_Revision", "Rechazada", "VP_APPROVER")

    def test_operations_lead_can_execute(self):
        assert validate_transition("Aprobada", "En_Ejecucion", "OPERATIONS_LEAD")

    def test_system_admin_can_execute(self):
        assert validate_transition("Aprobada", "En_Ejecucion", "SYSTEM_ADMIN")

    def test_analyst_cannot_execute(self):
        assert not validate_transition("Aprobada", "En_Ejecucion", "ANALYST")

    def test_operations_lead_can_close(self):
        assert validate_transition("En_Ejecucion", "Cerrada", "OPERATIONS_LEAD")

    def test_system_admin_can_close(self):
        assert validate_transition("En_Ejecucion", "Cerrada", "SYSTEM_ADMIN")

    def test_intern_readonly_cannot_close(self):
        assert not validate_transition("En_Ejecucion", "Cerrada", "INTERN_READONLY")

    def test_unauthorized_role_returns_403(self):
        result = transition(
            cancellation_id="uuid-1",
            target_state="En_Revision",
            user_id="user-1",
            user_role="INTERN_READONLY",
            justification="Valid justification for transition",
            current_state="Solicitada",
        )
        assert not result.success
        assert result.error.code == 403

    def test_invalid_role_returns_403(self):
        result = transition(
            cancellation_id="uuid-1",
            target_state="En_Revision",
            user_id="user-1",
            user_role="NONEXISTENT_ROLE",
            justification="Valid justification for transition",
            current_state="Solicitada",
        )
        assert not result.success
        assert result.error.code == 403


# ---------------------------------------------------------------------------
# Test get_valid_transitions
# ---------------------------------------------------------------------------


class TestGetValidTransitions:
    """Tests for the get_valid_transitions function."""

    def test_solicitada_operations_lead(self):
        targets = get_valid_transitions("Solicitada", "OPERATIONS_LEAD")
        assert targets == ["En_Revision"]

    def test_en_revision_legal_approver(self):
        targets = get_valid_transitions("En_Revision", "LEGAL_APPROVER")
        assert sorted(targets) == ["Aprobada", "Rechazada"]

    def test_en_revision_vp_approver(self):
        targets = get_valid_transitions("En_Revision", "VP_APPROVER")
        assert sorted(targets) == ["Aprobada", "Rechazada"]

    def test_aprobada_operations_lead(self):
        targets = get_valid_transitions("Aprobada", "OPERATIONS_LEAD")
        assert targets == ["En_Ejecucion"]

    def test_en_ejecucion_operations_lead(self):
        targets = get_valid_transitions("En_Ejecucion", "OPERATIONS_LEAD")
        assert targets == ["Cerrada"]

    def test_terminal_state_returns_empty(self):
        assert get_valid_transitions("Cerrada", "SYSTEM_ADMIN") == []
        assert get_valid_transitions("Rechazada", "SYSTEM_ADMIN") == []

    def test_unauthorized_role_returns_empty(self):
        assert get_valid_transitions("Solicitada", "INTERN_READONLY") == []

    def test_invalid_state_returns_empty(self):
        assert get_valid_transitions("InvalidState", "SYSTEM_ADMIN") == []

    def test_invalid_role_returns_empty(self):
        assert get_valid_transitions("Solicitada", "FAKE_ROLE") == []

    def test_system_admin_can_access_all_transitions(self):
        """SYSTEM_ADMIN should be able to perform any valid transition."""
        assert get_valid_transitions("Solicitada", "SYSTEM_ADMIN") == ["En_Revision"]
        assert sorted(get_valid_transitions("En_Revision", "SYSTEM_ADMIN")) == [
            "Aprobada", "Rechazada"
        ]
        assert get_valid_transitions("Aprobada", "SYSTEM_ADMIN") == ["En_Ejecucion"]
        assert get_valid_transitions("En_Ejecucion", "SYSTEM_ADMIN") == ["Cerrada"]


# ---------------------------------------------------------------------------
# Test audit entry generation (REQ-16.3)
# ---------------------------------------------------------------------------


class TestAuditEntry:
    """Tests for audit entry generation on successful transitions."""

    def test_audit_entry_generated_on_success(self):
        result = transition(
            cancellation_id="uuid-audit-test",
            target_state="En_Revision",
            user_id="user-audit",
            user_role="OPERATIONS_LEAD",
            justification="Moving to review for detailed analysis",
            current_state="Solicitada",
        )
        assert result.success
        assert result.audit_entry is not None
        assert result.audit_entry.cancellation_id == "uuid-audit-test"
        assert result.audit_entry.from_state == "Solicitada"
        assert result.audit_entry.to_state == "En_Revision"
        assert result.audit_entry.user_id == "user-audit"
        assert result.audit_entry.user_role == "OPERATIONS_LEAD"
        assert result.audit_entry.justification == "Moving to review for detailed analysis"

    def test_audit_entry_has_timestamp(self):
        result = transition(
            cancellation_id="uuid-1",
            target_state="En_Revision",
            user_id="user-1",
            user_role="ANALYST",
            justification="Valid justification for the transition",
            current_state="Solicitada",
        )
        assert result.audit_entry is not None
        assert result.audit_entry.timestamp is not None
        # Timestamp should be ISO-8601 format
        assert "T" in result.audit_entry.timestamp

    def test_no_audit_entry_on_failure(self):
        result = transition(
            cancellation_id="uuid-1",
            target_state="En_Revision",
            user_id="user-1",
            user_role="OPERATIONS_LEAD",
            justification="short",
            current_state="Solicitada",
        )
        assert not result.success
        assert result.audit_entry is None


# ---------------------------------------------------------------------------
# Test validate_transition function
# ---------------------------------------------------------------------------


class TestValidateTransition:
    """Tests for the validate_transition helper."""

    def test_valid_transition_returns_true(self):
        assert validate_transition("Solicitada", "En_Revision", "OPERATIONS_LEAD")

    def test_invalid_state_pair_returns_false(self):
        assert not validate_transition("Solicitada", "Cerrada", "SYSTEM_ADMIN")

    def test_invalid_current_state_returns_false(self):
        assert not validate_transition("Invalid", "En_Revision", "SYSTEM_ADMIN")

    def test_invalid_target_state_returns_false(self):
        assert not validate_transition("Solicitada", "Invalid", "SYSTEM_ADMIN")

    def test_invalid_role_returns_false(self):
        assert not validate_transition("Solicitada", "En_Revision", "FAKE_ROLE")

    def test_unauthorized_role_returns_false(self):
        assert not validate_transition("En_Revision", "Aprobada", "INTERN_READONLY")


# ---------------------------------------------------------------------------
# Test validation order priority
# ---------------------------------------------------------------------------


class TestValidationOrder:
    """Tests verifying validation priority: justification (400) > role (403) > transition (422)."""

    def test_bad_justification_checked_before_role(self):
        """Even with invalid role, bad justification returns 400 first."""
        result = transition(
            cancellation_id="uuid-1",
            target_state="En_Revision",
            user_id="user-1",
            user_role="INTERN_READONLY",
            justification="short",
            current_state="Solicitada",
        )
        assert result.error.code == 400

    def test_bad_justification_checked_before_invalid_transition(self):
        """Even with invalid transition, bad justification returns 400 first."""
        result = transition(
            cancellation_id="uuid-1",
            target_state="Cerrada",
            user_id="user-1",
            user_role="SYSTEM_ADMIN",
            justification="short",
            current_state="Solicitada",
        )
        assert result.error.code == 400

    def test_role_checked_before_invalid_transition_when_pair_is_valid(self):
        """For valid transition pairs, role check (403) comes before allowing."""
        result = transition(
            cancellation_id="uuid-1",
            target_state="En_Revision",
            user_id="user-1",
            user_role="INTERN_READONLY",
            justification="Valid justification text here",
            current_state="Solicitada",
        )
        assert result.error.code == 403


# ---------------------------------------------------------------------------
# Test edge cases
# ---------------------------------------------------------------------------


class TestEdgeCases:
    """Tests for edge cases."""

    def test_none_current_state_returns_422(self):
        result = transition(
            cancellation_id="uuid-1",
            target_state="En_Revision",
            user_id="user-1",
            user_role="OPERATIONS_LEAD",
            justification="Valid justification text here",
            current_state=None,
        )
        assert not result.success
        assert result.error.code == 422

    def test_transition_result_fields_on_failure(self):
        result = transition(
            cancellation_id="uuid-1",
            target_state="Cerrada",
            user_id="user-1",
            user_role="SYSTEM_ADMIN",
            justification="Valid justification text here",
            current_state="Solicitada",
        )
        assert not result.success
        assert result.new_state is None
        assert result.audit_entry is None

    def test_all_five_valid_transitions_defined(self):
        """Verify exactly 5 valid transitions are defined."""
        assert len(VALID_TRANSITIONS) == 5

    def test_min_justification_length_constant(self):
        assert MIN_JUSTIFICATION_LENGTH == 10
