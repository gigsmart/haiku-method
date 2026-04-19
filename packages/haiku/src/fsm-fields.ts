// fsm-fields.ts — canonical list of FSM-controlled fields per file type.
//
// Used by:
//   - state-tools.ts (haiku_unit_set guard, per-tool write protection)
//   - state-integrity.ts (tamper-detection checksum coverage)
//
// Keeping these as a single source of truth ensures the write guard and
// the tamper detector can't drift out of alignment — a gap on either side
// means an agent can mutate FSM state without being caught.

export const INTENT_FIELDS = [
	"status",
	"active_stage",
	"started_at",
	"completed_at",
]

export const STAGE_FIELDS = [
	"status",
	"phase",
	"started_at",
	"completed_at",
	"gate_entered_at",
	"gate_outcome",
]

export const UNIT_FIELDS = [
	"status",
	"started_at",
	"completed_at",
	"bolt",
	"hat",
	"hat_started_at",
	"scope_reject_attempts",
]
