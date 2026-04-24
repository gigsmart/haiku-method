import type { ReviewSessionPayload } from "haiku-api"
import type { ParsedIntent, ParsedUnit } from "../../../parsed"
import type { CriterionItem, MockupInfo } from "../../../types"

/**
 * ReviewSessionPayload in `haiku-api` is deliberately loose on parsed-markdown
 * shapes (intent/units/criteria/mockups) — they're emitted by the backend
 * parser, not part of the HTTP contract at unit-01 scope. This SPA narrows
 * them to the concrete parsed shapes it operates on.
 */
export type ReviewPageSessionData = Omit<
	ReviewSessionPayload,
	"intent" | "units" | "criteria" | "intent_mockups" | "unit_mockups"
> & {
	intent?: ParsedIntent
	units?: ParsedUnit[]
	criteria?: CriterionItem[]
	intent_mockups?: MockupInfo[]
	unit_mockups?: Record<string, MockupInfo[]>
}
