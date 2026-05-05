// state/schemas/index.ts — Barrel for the per-shape schema files.
//
// One file per schema (unit, intent, stage-state, feedback) plus
// shared MCP outputSchema fragments. The barrel re-exports every
// public symbol so callers can `import { UNIT_FRONTMATTER_SCHEMA }
// from "./state/schemas"` without caring which file owns it.
//
// Why per-schema files instead of one combined file: each schema is
// the single source of truth for one frontmatter shape. Putting them
// together obscured ownership and made the file a magnet for
// schema-adjacent helpers (validators, error-translators) that
// belong with their schema, not in a generic blob.
//
// ── Schema-runtime boundary ───────────────────────────────────────
//
// **TypeBox + AJV** is the rule for the MCP tool surface (this
// directory + every state-tool inputSchema). Each schema is a
// TypeBox builder expression that yields BOTH a JSONSchema-shaped
// object the MCP runtime + AJV consume AND a TypeScript type via
// `Static<typeof Schema>`. Single source of truth — the runtime
// check and the TS type can never drift.
//
// **Zod** is the rule for the SPA wire contract (`packages/haiku-api/`).
// Different consumer (the React SPA), different needs (TS type
// inference is the win there too, but the SPA never needs the
// JSONSchema shape).
//
// If you are adding a new schema, ask: is it for an MCP tool input
// /output, a feedback / unit / intent frontmatter, or any state
// shape the agent touches? → TypeBox here. Is it for the SPA's
// wire payload (session.ts in haiku-api)? → Zod there. Don't
// introduce a third runtime.

export type {
	HaikuFeedbackInput,
	HaikuFeedbackUpdateInput,
} from "./feedback.js"
export {
	CREATE_TIME_FB_FIELDS,
	FB_ID_PATTERN,
	FEEDBACK_STATUSES,
	FSM_DRIVEN_FB_FIELDS,
	HAIKU_FEEDBACK_INPUT_SCHEMA,
	HAIKU_FEEDBACK_UPDATE_INPUT_SCHEMA,
	validateHaikuFeedbackInputSchema,
	validateHaikuFeedbackUpdateInputSchema,
} from "./feedback.js"
export type {
	HaikuAwaitDesignDirectionInput,
	HaikuAwaitGateInput,
	HaikuAwaitVisualAnswerInput,
} from "./inputs/await-tools.js"
export {
	HAIKU_AWAIT_DESIGN_DIRECTION_INPUT_SCHEMA,
	HAIKU_AWAIT_GATE_INPUT_SCHEMA,
	HAIKU_AWAIT_VISUAL_ANSWER_INPUT_SCHEMA,
	validateHaikuAwaitDesignDirectionInputSchema,
	validateHaikuAwaitGateInputSchema,
	validateHaikuAwaitVisualAnswerInputSchema,
} from "./inputs/await-tools.js"
export type {
	HaikuFeedbackAdvanceHatInput,
	HaikuFeedbackDeleteInput,
	HaikuFeedbackListInput,
	HaikuFeedbackMoveInput,
	HaikuFeedbackReadInput,
	HaikuFeedbackRejectHatInput,
	HaikuFeedbackRejectInput,
	HaikuFeedbackWriteInput,
} from "./inputs/feedback-variants.js"
export {
	HAIKU_FEEDBACK_ADVANCE_HAT_INPUT_SCHEMA,
	HAIKU_FEEDBACK_DELETE_INPUT_SCHEMA,
	HAIKU_FEEDBACK_LIST_INPUT_SCHEMA,
	HAIKU_FEEDBACK_MOVE_INPUT_SCHEMA,
	HAIKU_FEEDBACK_READ_INPUT_SCHEMA,
	HAIKU_FEEDBACK_REJECT_HAT_INPUT_SCHEMA,
	HAIKU_FEEDBACK_REJECT_INPUT_SCHEMA,
	HAIKU_FEEDBACK_WRITE_INPUT_SCHEMA,
	validateHaikuFeedbackAdvanceHatInputSchema,
	validateHaikuFeedbackDeleteInputSchema,
	validateHaikuFeedbackListInputSchema,
	validateHaikuFeedbackMoveInputSchema,
	validateHaikuFeedbackReadInputSchema,
	validateHaikuFeedbackRejectHatInputSchema,
	validateHaikuFeedbackRejectInputSchema,
	validateHaikuFeedbackWriteInputSchema,
} from "./inputs/feedback-variants.js"
export type {
	HaikuIntentGetInput,
	HaikuIntentListInput,
	HaikuIntentSetInput,
} from "./inputs/intents.js"
export {
	HAIKU_INTENT_GET_INPUT_SCHEMA,
	HAIKU_INTENT_LIST_INPUT_SCHEMA,
	HAIKU_INTENT_SET_INPUT_SCHEMA,
	validateHaikuIntentGetInputSchema,
	validateHaikuIntentListInputSchema,
	validateHaikuIntentSetInputSchema,
} from "./inputs/intents.js"
export type {
	HaikuBacklogInput,
	HaikuCapacityInput,
	HaikuDecisionRecordInput,
	HaikuEmptyInput,
	HaikuKnowledgeListInput,
	HaikuKnowledgeReadInput,
	HaikuReconciliationAcknowledgeInput,
	HaikuReflectInput,
	HaikuReleaseNotesInput,
	HaikuRepairInput,
	HaikuReviewInput,
	HaikuReviewOpenInput,
	HaikuSeedInput,
	HaikuSettingsGetInput,
	HaikuSettingsSetInput,
	HaikuStudioGetInput,
	HaikuStudioStageGetInput,
} from "./inputs/long-tail.js"
export {
	HAIKU_BACKLOG_INPUT_SCHEMA,
	HAIKU_CAPACITY_INPUT_SCHEMA,
	HAIKU_DECISION_RECORD_INPUT_SCHEMA,
	HAIKU_EMPTY_INPUT_SCHEMA,
	HAIKU_KNOWLEDGE_LIST_INPUT_SCHEMA,
	HAIKU_KNOWLEDGE_READ_INPUT_SCHEMA,
	HAIKU_RECONCILIATION_ACKNOWLEDGE_INPUT_SCHEMA,
	HAIKU_REFLECT_INPUT_SCHEMA,
	HAIKU_RELEASE_NOTES_INPUT_SCHEMA,
	HAIKU_REPAIR_INPUT_SCHEMA,
	HAIKU_REVIEW_INPUT_SCHEMA,
	HAIKU_REVIEW_OPEN_INPUT_SCHEMA,
	HAIKU_SEED_INPUT_SCHEMA,
	HAIKU_SETTINGS_GET_INPUT_SCHEMA,
	HAIKU_SETTINGS_SET_INPUT_SCHEMA,
	HAIKU_STUDIO_GET_INPUT_SCHEMA,
	HAIKU_STUDIO_STAGE_GET_INPUT_SCHEMA,
	validateHaikuBacklogInputSchema,
	validateHaikuCapacityInputSchema,
	validateHaikuDecisionRecordInputSchema,
	validateHaikuEmptyInputSchema,
	validateHaikuKnowledgeListInputSchema,
	validateHaikuKnowledgeReadInputSchema,
	validateHaikuReconciliationAcknowledgeInputSchema,
	validateHaikuReflectInputSchema,
	validateHaikuReleaseNotesInputSchema,
	validateHaikuRepairInputSchema,
	validateHaikuReviewInputSchema,
	validateHaikuReviewOpenInputSchema,
	validateHaikuSeedInputSchema,
	validateHaikuSettingsGetInputSchema,
	validateHaikuSettingsSetInputSchema,
	validateHaikuStudioGetInputSchema,
	validateHaikuStudioStageGetInputSchema,
} from "./inputs/long-tail.js"
export type {
	HaikuStageGetInput,
	HaikuStageSetInput,
} from "./inputs/stages.js"
export {
	HAIKU_STAGE_GET_INPUT_SCHEMA,
	HAIKU_STAGE_SET_INPUT_SCHEMA,
	validateHaikuStageGetInputSchema,
	validateHaikuStageSetInputSchema,
} from "./inputs/stages.js"
export type {
	HaikuUnitAdvanceHatInput,
	HaikuUnitDeleteInput,
	HaikuUnitIncrementBoltInput,
	HaikuUnitListInput,
	HaikuUnitReadInput,
	HaikuUnitRejectHatInput,
	HaikuUnitSetInput,
	HaikuUnitStartInput,
	HaikuUnitWriteInput,
} from "./inputs/units.js"
export {
	HAIKU_UNIT_ADVANCE_HAT_INPUT_SCHEMA,
	HAIKU_UNIT_DELETE_INPUT_SCHEMA,
	HAIKU_UNIT_INCREMENT_BOLT_INPUT_SCHEMA,
	HAIKU_UNIT_LIST_INPUT_SCHEMA,
	HAIKU_UNIT_READ_INPUT_SCHEMA,
	HAIKU_UNIT_REJECT_HAT_INPUT_SCHEMA,
	HAIKU_UNIT_SET_INPUT_SCHEMA,
	HAIKU_UNIT_START_INPUT_SCHEMA,
	HAIKU_UNIT_WRITE_INPUT_SCHEMA,
	validateHaikuUnitAdvanceHatInputSchema,
	validateHaikuUnitDeleteInputSchema,
	validateHaikuUnitIncrementBoltInputSchema,
	validateHaikuUnitListInputSchema,
	validateHaikuUnitReadInputSchema,
	validateHaikuUnitRejectHatInputSchema,
	validateHaikuUnitSetInputSchema,
	validateHaikuUnitStartInputSchema,
	validateHaikuUnitWriteInputSchema,
} from "./inputs/units.js"
export type { IntentFrontmatter } from "./intent.js"
export {
	AGENT_AUTHORABLE_INTENT_FIELDS,
	FSM_DRIVEN_INTENT_FIELDS,
	INTENT_FRONTMATTER_SCHEMA,
	INTENT_IMMUTABLE_FIELDS,
	validateIntentFrontmatterSchema,
} from "./intent.js"
export type { ErrorOutput, OkOutput } from "./output-envelope.js"
export { ERROR_OUTPUT_SCHEMA, OK_OUTPUT_SCHEMA } from "./output-envelope.js"
export type { StageState } from "./stage-state.js"
export { STAGE_STATE_FIELDS, STAGE_STATE_SCHEMA } from "./stage-state.js"
export type { UnitFrontmatter } from "./unit.js"
export {
	AGENT_AUTHORABLE_UNIT_FIELDS,
	FSM_DRIVEN_UNIT_FIELDS,
	UNIT_FRONTMATTER_SCHEMA,
	validateUnitFrontmatterSchema,
} from "./unit.js"
