"""
Property-based tests for Annulation state machine (Properties 2 and 3).

**Validates: Requirements 16.2, 16.3, 16.5, 16.6**

Uses Hypothesis to verify:

Property 2 — Annulation state machine transition validity:
- P2a: For any (state, target) pair NOT in VALID_TRANSITIONS, transition() returns error with code 422
- P2b: For any (state, target) pair IN VALID_TRANSITIONS with authorized role, transition() succeeds
- P2c: Terminal states (Cerrada, Rechazada) always return 422 regardless of target
- P2d: get_valid_transitions returns empty list for terminal states
- P2e: For any valid transition, the result's new_state matches the requested target_state

Property 3 — Annulation transition requires valid justification and produces audit:
- P3a: For any justification < 10 chars (after strip), transition() returns error code 400
- P3b: For any justification >= 10 chars with valid transition, an audit_entry is produced
- P3c: The audit_entry contains: cancellation_id, from_state, to_state, user_id, user_role,
       justification, timestamp
- P3d: The justification in audit_entry is stripped but otherwise unchanged
"""

from __future__ import annotations

from datetime import datetime

import hypothesis.strategies as st
from hypothesis import assume, given, settings

from annulations.state_machine import (
    MIN_JUSTIFICATION_LENGTH,
    TERMINAL_STATES,
    VALID_TRANSITIONS,
    AnnulationState,
    AuditEntry,
    get_valid_transitions,
    transition,
)
from auth.rbac import Role

# ===========================================================================
# Shared Strategies
# ===========================================================================

# All valid state strings
_all_states = st.sampled_from([s.value for s in AnnulationState])

# All valid role strings
_all_roles = st.sampled_from([r.value for r in Role])

# Terminal state strings
_terminal_states = st.sampled_from([s.value for s in TERMINAL_STATES])

# Non-terminal state strings
_non_terminal_states = st.sampled_from(
    [s.value for s in AnnulationState if s not in TERMINAL_STATES]
)

# Valid justification (>= 10 chars, stripped)
_valid_justifications_p2 = st.text(
    alphabet=st.characters(whitelist_categories=("L", "N", "P", "Z")),
    min_size=10,
    max_size=200,
).filter(lambda s: len(s.strip()) >= 10)

# All valid transition pairs as tuples of string values
_valid_transition_pairs = st.sampled_from(
    [(from_s.value, to_s.value) for (from_s, to_s) in VALID_TRANSITIONS.keys()]
)


def _get_authorized_role_for_transition(
    from_state: AnnulationState, to_state: AnnulationState
) -> str:
    """Return the first authorized role for a given valid transition."""
    key = (from_state, to_state)
    roles = VALID_TRANSITIONS[key]
    return next(iter(roles)).value


def _get_invalid_pairs() -> list[tuple[str, str]]:
    """Return all (state, target) pairs that are NOT valid transitions."""
    all_pairs = [(s1.value, s2.value) for s1 in AnnulationState for s2 in AnnulationState]
    valid_set = {(f.value, t.value) for (f, t) in VALID_TRANSITIONS.keys()}
    return [(f, t) for (f, t) in all_pairs if (f, t) not in valid_set]


# Pre-compute invalid pairs for the strategy
_INVALID_PAIRS = _get_invalid_pairs()
_invalid_transition_pairs = st.sampled_from(_INVALID_PAIRS)


# ===========================================================================
# Property 2: Annulation state machine transition validity
# **Validates: Requirements 16.2, 16.5**
# ===========================================================================


class TestP2aInvalidTransitionReturns422:
    """P2a: For any (state, target) pair NOT in VALID_TRANSITIONS, transition() returns error with code 422."""

    @given(
        pair=_invalid_transition_pairs,
        role=_all_roles,
        justification=_valid_justifications_p2,
    )
    @settings(max_examples=500)
    def test_invalid_pair_returns_422(self, pair: tuple[str, str], role: str, justification: str):
        """Any state/target pair not in VALID_TRANSITIONS must be rejected with HTTP 422."""
        current_state, target_state = pair

        result = transition(
            cancellation_id="test-uuid-001",
            target_state=target_state,
            user_id="user-001",
            user_role=role,
            justification=justification,
            current_state=current_state,
        )

        assert result.success is False, (
            f"Transition from '{current_state}' to '{target_state}' should fail " f"but succeeded"
        )
        assert result.error is not None
        # Invalid transitions must produce 422 (role authorization 403 only applies
        # to structurally valid transitions; invalid pairs hit 422 first)
        assert result.error.code == 422, (
            f"Expected error code 422 for invalid transition "
            f"'{current_state}' -> '{target_state}', got {result.error.code}"
        )


class TestP2bValidTransitionSucceeds:
    """P2b: For any (state, target) pair IN VALID_TRANSITIONS with authorized role, transition() succeeds."""

    @given(
        pair=_valid_transition_pairs,
        justification=_valid_justifications_p2,
    )
    @settings(max_examples=300)
    def test_valid_pair_with_authorized_role_succeeds(
        self, pair: tuple[str, str], justification: str
    ):
        """Any valid transition with an authorized role and valid justification must succeed."""
        current_state, target_state = pair
        from_state = AnnulationState(current_state)
        to_state = AnnulationState(target_state)

        # Get an authorized role for this transition
        authorized_role = _get_authorized_role_for_transition(from_state, to_state)

        result = transition(
            cancellation_id="test-uuid-002",
            target_state=target_state,
            user_id="user-002",
            user_role=authorized_role,
            justification=justification,
            current_state=current_state,
        )

        assert result.success is True, (
            f"Transition from '{current_state}' to '{target_state}' with role "
            f"'{authorized_role}' and justification '{justification[:20]}...' should succeed "
            f"but failed with error: {result.error}"
        )
        assert result.new_state == target_state

    @given(pair=_valid_transition_pairs)
    @settings(max_examples=100)
    def test_all_authorized_roles_can_perform_transition(self, pair: tuple[str, str]):
        """Every authorized role for a valid transition can perform it successfully."""
        current_state, target_state = pair
        from_state = AnnulationState(current_state)
        to_state = AnnulationState(target_state)

        key = (from_state, to_state)
        authorized_roles = VALID_TRANSITIONS[key]
        justification = "Valid justification for property test"

        for role in authorized_roles:
            result = transition(
                cancellation_id="test-uuid-003",
                target_state=target_state,
                user_id="user-003",
                user_role=role.value,
                justification=justification,
                current_state=current_state,
            )

            assert result.success is True, (
                f"Role '{role.value}' is authorized for '{current_state}' -> "
                f"'{target_state}' but transition failed: {result.error}"
            )


class TestP2cTerminalStatesAlwaysReturn422:
    """P2c: Terminal states (Cerrada, Rechazada) always return 422 regardless of target."""

    @given(
        from_state=_terminal_states,
        to_state=_all_states,
        role=_all_roles,
        justification=_valid_justifications_p2,
    )
    @settings(max_examples=300)
    def test_terminal_state_always_rejects(
        self, from_state: str, to_state: str, role: str, justification: str
    ):
        """Transition from a terminal state must always fail with 422."""
        result = transition(
            cancellation_id="test-uuid-004",
            target_state=to_state,
            user_id="user-004",
            user_role=role,
            justification=justification,
            current_state=from_state,
        )

        assert result.success is False, (
            f"Transition from terminal state '{from_state}' to '{to_state}' "
            f"should always fail but succeeded"
        )
        assert result.error is not None
        assert result.error.code == 422, (
            f"Terminal state rejection should return 422, got {result.error.code} "
            f"for '{from_state}' -> '{to_state}'"
        )

    @given(from_state=_terminal_states, role=_all_roles)
    @settings(max_examples=100)
    def test_terminal_state_valid_targets_empty(self, from_state: str, role: str):
        """Terminal states must report empty valid_targets in error response."""
        # Try transitioning to any non-self state
        targets = [s.value for s in AnnulationState if s.value != from_state]
        target = targets[0]

        result = transition(
            cancellation_id="test-uuid-005",
            target_state=target,
            user_id="user-005",
            user_role=role,
            justification="Valid justification for testing terminal state",
            current_state=from_state,
        )

        assert result.success is False
        assert result.error is not None
        assert result.error.code == 422
        assert result.error.valid_targets == [], (
            f"Terminal state '{from_state}' should have empty valid_targets, "
            f"got {result.error.valid_targets}"
        )


class TestP2dGetValidTransitionsEmptyForTerminal:
    """P2d: get_valid_transitions returns empty list for terminal states."""

    @given(from_state=_terminal_states, role=_all_roles)
    @settings(max_examples=200)
    def test_get_valid_transitions_empty_for_terminal(self, from_state: str, role: str):
        """get_valid_transitions must return [] for any terminal state, regardless of role."""
        result = get_valid_transitions(from_state, role)

        assert result == [], (
            f"get_valid_transitions('{from_state}', '{role}') should return [] "
            f"for terminal state but returned {result}"
        )

    @given(role=_all_roles)
    @settings(max_examples=50)
    def test_cerrada_has_no_transitions(self, role: str):
        """Cerrada specifically has no valid transitions for any role."""
        result = get_valid_transitions(AnnulationState.CERRADA.value, role)
        assert result == []

    @given(role=_all_roles)
    @settings(max_examples=50)
    def test_rechazada_has_no_transitions(self, role: str):
        """Rechazada specifically has no valid transitions for any role."""
        result = get_valid_transitions(AnnulationState.RECHAZADA.value, role)
        assert result == []


class TestP2eNewStateMatchesTarget:
    """P2e: For any valid transition, the result's new_state matches the requested target_state."""

    @given(
        pair=_valid_transition_pairs,
        justification=_valid_justifications_p2,
    )
    @settings(max_examples=300)
    def test_new_state_equals_target(self, pair: tuple[str, str], justification: str):
        """On successful transition, new_state must exactly match the requested target_state."""
        current_state, target_state = pair
        from_state = AnnulationState(current_state)
        to_state = AnnulationState(target_state)

        authorized_role = _get_authorized_role_for_transition(from_state, to_state)

        result = transition(
            cancellation_id="test-uuid-006",
            target_state=target_state,
            user_id="user-006",
            user_role=authorized_role,
            justification=justification,
            current_state=current_state,
        )

        assert (
            result.success is True
        ), f"Expected success for valid transition but got error: {result.error}"
        assert result.new_state == target_state, (
            f"new_state should be '{target_state}' but got '{result.new_state}' "
            f"for transition '{current_state}' -> '{target_state}'"
        )

    @given(
        pair=_valid_transition_pairs,
        justification=_valid_justifications_p2,
    )
    @settings(max_examples=200)
    def test_new_state_is_not_none_on_success(self, pair: tuple[str, str], justification: str):
        """On successful transition, new_state must never be None."""
        current_state, target_state = pair
        from_state = AnnulationState(current_state)
        to_state = AnnulationState(target_state)

        authorized_role = _get_authorized_role_for_transition(from_state, to_state)

        result = transition(
            cancellation_id="test-uuid-007",
            target_state=target_state,
            user_id="user-007",
            user_role=authorized_role,
            justification=justification,
            current_state=current_state,
        )

        assert result.success is True
        assert result.new_state is not None, "new_state must not be None on successful transition"


# ===========================================================================
# Property 3: Annulation transition requires valid justification and produces audit
# **Validates: Requirements 16.3, 16.6**
# ===========================================================================


# ---------------------------------------------------------------------------
# Strategies
# ---------------------------------------------------------------------------

# Generate short justifications: 0..9 printable chars (after strip they must be < 10)
short_justification_core = st.text(
    alphabet=st.characters(whitelist_categories=("L", "N", "P", "S")),
    min_size=0,
    max_size=MIN_JUSTIFICATION_LENGTH - 1,
)

# Short justifications optionally surrounded by whitespace
short_justifications = st.builds(
    lambda ws_left, core, ws_right: ws_left + core + ws_right,
    ws_left=st.text(alphabet=" \t\n", min_size=0, max_size=5),
    core=short_justification_core,
    ws_right=st.text(alphabet=" \t\n", min_size=0, max_size=5),
).filter(lambda s: len(s.strip()) < MIN_JUSTIFICATION_LENGTH)

# Generate valid justifications: >= 10 printable chars
valid_justification_core = st.text(
    alphabet=st.characters(whitelist_categories=("L", "N", "P", "S", "Z")),
    min_size=MIN_JUSTIFICATION_LENGTH,
    max_size=200,
).filter(lambda s: len(s.strip()) >= MIN_JUSTIFICATION_LENGTH)

# Valid justifications optionally padded with whitespace
valid_justifications = st.builds(
    lambda ws_left, core, ws_right: ws_left + core + ws_right,
    ws_left=st.text(alphabet=" \t\n", min_size=0, max_size=5),
    core=valid_justification_core,
    ws_right=st.text(alphabet=" \t\n", min_size=0, max_size=5),
).filter(lambda s: len(s.strip()) >= MIN_JUSTIFICATION_LENGTH)

# Valid transition tuples: (from_state, to_state, authorized_role)
_valid_transition_triples: list[tuple[str, str, str]] = []
for (from_st, to_st), roles in VALID_TRANSITIONS.items():
    for role in roles:
        _valid_transition_triples.append((from_st.value, to_st.value, role.value))

valid_transition_triples = st.sampled_from(_valid_transition_triples)

# UUIDs for IDs
uuids = st.uuids().map(str)

# Any valid from_state that has outgoing transitions
valid_from_states = st.sampled_from(
    list({from_st.value for (from_st, _) in VALID_TRANSITIONS.keys()})
)

# Any authorized role for a given transition
all_roles = st.sampled_from([r.value for r in Role])


# ---------------------------------------------------------------------------
# Property Tests
# ---------------------------------------------------------------------------


class TestP3aShortJustificationRejected:
    """P3a: For any justification < 10 chars (after strip), transition() returns error code 400."""

    @given(
        cancellation_id=uuids,
        transition_triple=valid_transition_triples,
        user_id=uuids,
        justification=short_justifications,
    )
    @settings(max_examples=300)
    def test_short_justification_returns_400(
        self,
        cancellation_id: str,
        transition_triple: tuple[str, str, str],
        user_id: str,
        justification: str,
    ):
        """Any justification with fewer than 10 chars (stripped) must be rejected with code 400."""
        from_state, to_state, role = transition_triple

        result = transition(
            cancellation_id=cancellation_id,
            target_state=to_state,
            user_id=user_id,
            user_role=role,
            justification=justification,
            current_state=from_state,
        )

        assert result.success is False, (
            f"Transition should fail for short justification '{justification}' "
            f"(stripped len={len(justification.strip())})"
        )
        assert result.error is not None
        assert (
            result.error.code == 400
        ), f"Expected error code 400 for short justification, got {result.error.code}"
        assert (
            result.audit_entry is None
        ), "No audit entry should be produced for a rejected transition"

    @given(
        cancellation_id=uuids,
        transition_triple=valid_transition_triples,
        user_id=uuids,
    )
    @settings(max_examples=100)
    def test_empty_justification_returns_400(
        self,
        cancellation_id: str,
        transition_triple: tuple[str, str, str],
        user_id: str,
    ):
        """An empty string justification must be rejected with code 400."""
        from_state, to_state, role = transition_triple

        result = transition(
            cancellation_id=cancellation_id,
            target_state=to_state,
            user_id=user_id,
            user_role=role,
            justification="",
            current_state=from_state,
        )

        assert result.success is False
        assert result.error is not None
        assert result.error.code == 400

    @given(
        cancellation_id=uuids,
        transition_triple=valid_transition_triples,
        user_id=uuids,
        ws=st.text(alphabet=" \t\n\r", min_size=1, max_size=20),
    )
    @settings(max_examples=100)
    def test_whitespace_only_justification_returns_400(
        self,
        cancellation_id: str,
        transition_triple: tuple[str, str, str],
        user_id: str,
        ws: str,
    ):
        """A whitespace-only justification must be rejected with code 400."""
        from_state, to_state, role = transition_triple

        result = transition(
            cancellation_id=cancellation_id,
            target_state=to_state,
            user_id=user_id,
            user_role=role,
            justification=ws,
            current_state=from_state,
        )

        assert result.success is False
        assert result.error is not None
        assert result.error.code == 400


class TestP3bValidJustificationProducesAudit:
    """P3b: For any justification >= 10 chars with valid transition, an audit_entry is produced."""

    @given(
        cancellation_id=uuids,
        transition_triple=valid_transition_triples,
        user_id=uuids,
        justification=valid_justifications,
    )
    @settings(max_examples=300)
    def test_valid_justification_produces_audit(
        self,
        cancellation_id: str,
        transition_triple: tuple[str, str, str],
        user_id: str,
        justification: str,
    ):
        """A valid justification with a valid transition must succeed and produce an audit entry."""
        from_state, to_state, role = transition_triple

        result = transition(
            cancellation_id=cancellation_id,
            target_state=to_state,
            user_id=user_id,
            user_role=role,
            justification=justification,
            current_state=from_state,
        )

        assert result.success is True, (
            f"Transition should succeed for valid justification "
            f"(stripped len={len(justification.strip())}), "
            f"from={from_state}, to={to_state}, role={role}. "
            f"Error: {result.error}"
        )
        assert result.audit_entry is not None, "A successful transition must produce an audit_entry"
        assert isinstance(result.audit_entry, AuditEntry)


class TestP3cAuditEntryContainsRequiredFields:
    """P3c: The audit_entry contains: cancellation_id, from_state, to_state, user_id,
    user_role, justification, timestamp."""

    @given(
        cancellation_id=uuids,
        transition_triple=valid_transition_triples,
        user_id=uuids,
        justification=valid_justifications,
    )
    @settings(max_examples=300)
    def test_audit_entry_has_all_required_fields(
        self,
        cancellation_id: str,
        transition_triple: tuple[str, str, str],
        user_id: str,
        justification: str,
    ):
        """Audit entry must contain all required fields with correct values."""
        from_state, to_state, role = transition_triple

        result = transition(
            cancellation_id=cancellation_id,
            target_state=to_state,
            user_id=user_id,
            user_role=role,
            justification=justification,
            current_state=from_state,
        )

        assert result.success is True
        entry = result.audit_entry
        assert entry is not None

        # cancellation_id
        assert (
            entry.cancellation_id == cancellation_id
        ), f"Expected cancellation_id='{cancellation_id}', got '{entry.cancellation_id}'"

        # from_state
        assert (
            entry.from_state == from_state
        ), f"Expected from_state='{from_state}', got '{entry.from_state}'"

        # to_state
        assert entry.to_state == to_state, f"Expected to_state='{to_state}', got '{entry.to_state}'"

        # user_id
        assert entry.user_id == user_id, f"Expected user_id='{user_id}', got '{entry.user_id}'"

        # user_role
        assert entry.user_role == role, f"Expected user_role='{role}', got '{entry.user_role}'"

        # justification (stripped)
        assert (
            entry.justification == justification.strip()
        ), f"Expected justification='{justification.strip()}', got '{entry.justification}'"

        # timestamp: must be a valid ISO 8601 datetime string
        assert (
            entry.timestamp is not None and len(entry.timestamp) > 0
        ), "Audit entry timestamp must not be empty"
        # Verify it parses as a valid datetime
        parsed_ts = datetime.fromisoformat(entry.timestamp)
        assert (
            parsed_ts is not None
        ), f"Audit entry timestamp '{entry.timestamp}' is not a valid ISO datetime"


class TestP3dJustificationStrippedButUnchanged:
    """P3d: The justification in audit_entry is stripped but otherwise unchanged."""

    @given(
        cancellation_id=uuids,
        transition_triple=valid_transition_triples,
        user_id=uuids,
        justification=valid_justifications,
    )
    @settings(max_examples=300)
    def test_justification_is_stripped_in_audit(
        self,
        cancellation_id: str,
        transition_triple: tuple[str, str, str],
        user_id: str,
        justification: str,
    ):
        """The justification stored in audit_entry must be the stripped version of the input."""
        from_state, to_state, role = transition_triple

        result = transition(
            cancellation_id=cancellation_id,
            target_state=to_state,
            user_id=user_id,
            user_role=role,
            justification=justification,
            current_state=from_state,
        )

        assert result.success is True
        entry = result.audit_entry
        assert entry is not None

        # The stored justification must equal the input stripped of leading/trailing whitespace
        expected = justification.strip()
        assert entry.justification == expected, (
            f"Justification should be stripped. "
            f"Input: '{justification}', Expected: '{expected}', Got: '{entry.justification}'"
        )

        # It must NOT be further modified (e.g., no lowercasing, no truncation)
        # The content between leading/trailing whitespace must be preserved exactly
        assert (
            expected in justification
        ), "The stripped justification must be a substring of the original"

    @given(
        cancellation_id=uuids,
        transition_triple=valid_transition_triples,
        user_id=uuids,
        inner_text=st.text(
            alphabet=st.characters(whitelist_categories=("L", "N", "P", "S")),
            min_size=MIN_JUSTIFICATION_LENGTH,
            max_size=50,
        ),
        pad_left=st.text(alphabet=" \t\n", min_size=1, max_size=10),
        pad_right=st.text(alphabet=" \t\n", min_size=1, max_size=10),
    )
    @settings(max_examples=200)
    def test_whitespace_padding_stripped_content_preserved(
        self,
        cancellation_id: str,
        transition_triple: tuple[str, str, str],
        user_id: str,
        inner_text: str,
        pad_left: str,
        pad_right: str,
    ):
        """Whitespace-padded justifications have padding stripped but inner content preserved."""
        assume(len(inner_text.strip()) >= MIN_JUSTIFICATION_LENGTH)
        from_state, to_state, role = transition_triple
        padded_justification = pad_left + inner_text + pad_right

        result = transition(
            cancellation_id=cancellation_id,
            target_state=to_state,
            user_id=user_id,
            user_role=role,
            justification=padded_justification,
            current_state=from_state,
        )

        assert result.success is True, f"Should succeed. Error: {result.error}"
        entry = result.audit_entry
        assert entry is not None

        # The stored justification equals the stripped input
        assert entry.justification == padded_justification.strip()
        # And the stripped version equals inner_text stripped
        assert entry.justification == inner_text.strip()
