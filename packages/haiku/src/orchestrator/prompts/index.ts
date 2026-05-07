// orchestrator/prompts/index.ts — Registry of per-action prompt
// builders.
//
// Each per-action file under this directory exports a
// `PromptBuilder` as its default export. The registry collects them
// into `actionPromptBuilders` (Map<actionName, PromptBuilder>) so
// buildRunInstructions can dispatch by name with a single lookup.
//
// v4: 18 v3-only prompts deleted (continue_unit/_units, start_units,
// feedback_dispatch/_triage/_revisit, integrate_fix_chains,
// revise_unit_specs, revisited, pre_review[_waiting], spec_review,
// awaiting_external_review, external_*, coverage_review_required,
// output_liveness_review_required, composite_run_stage,
// manual_change_assessment). The new cursor actions (start_unit_hat,
// start_feedback_hat, dispatch_review, dispatch_approval,
// dispatch_quality_gates, merge_stage, merge_intent, etc.) get their
// own prompt files in M5.

import advance_phase from "./advance_phase.js"
import advance_stage from "./advance_stage.js"
import blocked from "./blocked.js"
import changes_requested from "./changes_requested.js"
import clarify_required from "./clarify_required.js"
import close_feedback from "./close_feedback.js"
import commit_wip from "./commit_wip.js"
import complete from "./complete.js"
import dag_cycle_detected from "./dag_cycle_detected.js"
import design_direction_complete from "./design_direction_complete.js"
import design_direction_required from "./design_direction_required.js"
import design_direction_uploaded from "./design_direction_uploaded.js"
import discovery_missing from "./discovery_missing.js"
import discovery_required from "./discovery_required.js"
import dispatch_approval from "./dispatch_approval.js"
import dispatch_quality_gates from "./dispatch_quality_gates.js"
import dispatch_review from "./dispatch_review.js"
import drift_detected from "./drift_detected.js"
import elaborate from "./elaborate.js"
import elaboration_insufficient from "./elaboration_insufficient.js"
import error from "./error.js"
import escalate from "./escalate.js"
import fix_quality_gates from "./fix_quality_gates.js"
import gate_blocked from "./gate_blocked.js"
// gate_review prompt builder removed — under v4, the gate_review
// action never reaches the agent. haiku_run_next prepares the session,
// blocks on haiku_await_gate inline, and returns the post-decision
// next action (advance_phase / advance_stage / external_review_requested
// / changes_requested / etc.). The old prompt that told the agent to
// "post URL + call haiku_await_gate" is dead.
import intent_approved from "./intent_approved.js"
import intent_complete from "./intent_complete.js"
import intent_completion_fix from "./intent_completion_fix.js"
import intent_completion_review from "./intent_completion_review.js"
import intent_review from "./intent_review.js"
import merge_intent from "./merge_intent.js"
import merge_stage from "./merge_stage.js"
import outputs_missing from "./outputs_missing.js"
import review from "./review.js"
import review_fix from "./review_fix.js"
import safe_intent_repair from "./safe_intent_repair.js"
import select_studio from "./select_studio.js"
import start_feedback_hat from "./start_feedback_hat.js"
import start_stage from "./start_stage.js"
import start_unit from "./start_unit.js"
import start_unit_hat from "./start_unit_hat.js"
import type { PromptBuilder } from "./types.js"
import unit_inputs_missing from "./unit_inputs_missing.js"
import unit_naming_invalid from "./unit_naming_invalid.js"
import unresolved_dependencies from "./unresolved_dependencies.js"
import user_gate from "./user_gate.js"

export const actionPromptBuilders: ReadonlyMap<string, PromptBuilder> = new Map<
	string,
	PromptBuilder
>([
	["advance_phase", advance_phase],
	["advance_stage", advance_stage],
	["blocked", blocked],
	["changes_requested", changes_requested],
	["clarify_required", clarify_required],
	["close_feedback", close_feedback],
	["commit_wip", commit_wip],
	["complete", complete],
	["dag_cycle_detected", dag_cycle_detected],
	["design_direction_complete", design_direction_complete],
	["design_direction_required", design_direction_required],
	["design_direction_uploaded", design_direction_uploaded],
	["discovery_missing", discovery_missing],
	["discovery_required", discovery_required],
	["elaborate", elaborate],
	["elaboration_insufficient", elaboration_insufficient],
	["error", error],
	["escalate", escalate],
	["fix_quality_gates", fix_quality_gates],
	["gate_blocked", gate_blocked],
	["intent_approved", intent_approved],
	["intent_complete", intent_complete],
	["intent_completion_fix", intent_completion_fix],
	["intent_completion_review", intent_completion_review],
	["intent_review", intent_review],
	["outputs_missing", outputs_missing],
	["review", review],
	["review_fix", review_fix],
	["safe_intent_repair", safe_intent_repair],
	["select_studio", select_studio],
	["start_stage", start_stage],
	// start_unit serves the v4 start_unit_hat dispatch by name —
	// the dispatch tool aliases the action key when calling
	// buildRunInstructions.
	["start_unit", start_unit],
	["start_unit_hat", start_unit_hat],
	["start_feedback_hat", start_feedback_hat],
	["dispatch_review", dispatch_review],
	["dispatch_approval", dispatch_approval],
	["dispatch_quality_gates", dispatch_quality_gates],
	["user_gate", user_gate],
	["merge_intent", merge_intent],
	["merge_stage", merge_stage],
	["drift_detected", drift_detected],
	["unit_inputs_missing", unit_inputs_missing],
	["unit_naming_invalid", unit_naming_invalid],
	["unresolved_dependencies", unresolved_dependencies],
])
