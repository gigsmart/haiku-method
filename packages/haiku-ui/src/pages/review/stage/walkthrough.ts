/**
 * Walkthrough composition for StageReview.
 *
 * Picks the SET of relevant items the reviewer steps through, based
 * on which gate fired. Order is file-natural — what matters is
 * coverage of the relevant set, not a strict sequence (the seen-tracker
 * drives Next; Previous is plain previous-in-set for browsing).
 *
 * Mapping:
 *   - `elaborate_to_execute` (pre-execution gate) → units only. The
 *     reviewer is approving the unit decomposition before execute
 *     starts.
 *   - `stage_gate` (post-execute) → outputs only. The reviewer is
 *     approving the deliverables.
 *   - `intent_completion` (final cross-stage review) → outputs only.
 *     Same shape as stage_gate; the deliverables are what's being
 *     reviewed against the intent.
 *   - `intent_review` (first-stage elaborate gate) AND default → the
 *     existing units → knowledge → outputs union. `intent_review` is
 *     handled at the IntentReview surface (no walkthrough chrome
 *     there); the union is the safe fallback for ad-hoc reviews.
 */

export type WalkthroughItem =
	| { tab: "units"; name: string }
	| { tab: "knowledge"; name: string }
	| { tab: "outputs"; name: string }

export interface WalkthroughInputs {
	units: ReadonlyArray<{ slug: string }>
	knowledgeVMs: ReadonlyArray<{ name: string }>
	outputVMs: ReadonlyArray<{ name: string }>
}

export function composeWalkthroughItems(
	gateContext: string | undefined,
	{ units, knowledgeVMs, outputVMs }: WalkthroughInputs,
): WalkthroughItem[] {
	if (gateContext === "elaborate_to_execute") {
		return units.map((u) => ({ tab: "units" as const, name: u.slug }))
	}
	if (gateContext === "stage_gate" || gateContext === "intent_completion") {
		return outputVMs.map((a) => ({ tab: "outputs" as const, name: a.name }))
	}
	return [
		...units.map((u) => ({ tab: "units" as const, name: u.slug })),
		...knowledgeVMs.map((a) => ({ tab: "knowledge" as const, name: a.name })),
		...outputVMs.map((a) => ({ tab: "outputs" as const, name: a.name })),
	]
}
