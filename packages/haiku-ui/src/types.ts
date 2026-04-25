/**
 * Wire-type re-export barrel.
 *
 * All HTTP/WebSocket payloads this SPA touches live in `haiku-api`. This file
 * re-exports them as the single import surface for components and hooks.
 * There are zero local type definitions here — the completion criterion
 * (grep for `^export (type|interface)` returns zero in this file) is
 * enforced by using `export { type X }` re-export syntax instead of
 * `export type { X }`.
 *
 * Parser-shaped types (ParsedUnit, ParsedIntent, Section, *Frontmatter) live
 * in `./parsed.ts`; they describe internal parsed-markdown shapes the backend
 * emits and the SPA reads, and are deliberately loose on the wire (see
 * `haiku-api` session schemas — `LooseRecord`).
 */

export type { CriterionItem, MockupInfo } from "@haiku/shared"
export type {
	DesignArchetypeData,
	DesignParameterData,
	FeedbackItem as FeedbackItemData,
	FeedbackListResponse,
	KnowledgeFile,
	OutputArtifact,
	PreviousReviewSnapshot,
	QuestionAnswer,
	QuestionDef,
	ReviewAnnotations,
	ReviewCurrentPayload as ReviewCurrentResponse,
	SessionPayload as SessionData,
	StageArtifact,
	StageStateInfo,
} from "haiku-api"
