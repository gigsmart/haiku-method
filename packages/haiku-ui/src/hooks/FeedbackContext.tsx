/**
 * FeedbackContext — a single `useFeedback(intent, stage)` instance shared
 * by every consumer inside the review route subtree.
 *
 * Motivation: `useFeedback` owns its own items + busyIds + creating
 * state. When multiple consumers each call the hook independently (the
 * sidebar, the stage detail pane, the mobile sheet, the annotation
 * handler), they each get a private copy. A create from one consumer
 * refetches in its own hook but the others keep their stale lists
 * until something else forces a reload. Lifting the hook into a
 * context eliminates the duplication — there's one source of truth for
 * the current stage's feedback.
 *
 * Consumers use `useFeedbackContext()` instead of `useFeedback(...)`;
 * the provider is mounted once at the review route root and keyed on
 * (intent, stage) so switching stages remounts with fresh state.
 */

import { createContext, useContext } from "react"
import { useFeedback } from "./useFeedback"

type FeedbackState = ReturnType<typeof useFeedback>

const FeedbackContext = createContext<FeedbackState | null>(null)

export function FeedbackProvider({
	intent,
	stage,
	children,
}: {
	intent: string | null
	stage: string | null
	children: React.ReactNode
}): React.ReactElement {
	const value = useFeedback(intent, stage)
	return (
		<FeedbackContext.Provider value={value}>
			{children}
		</FeedbackContext.Provider>
	)
}

/**
 * Read the shared feedback state. Returns the same object shape as
 * `useFeedback`. Throws if called outside `<FeedbackProvider>`.
 */
export function useFeedbackContext(): FeedbackState {
	const ctx = useContext(FeedbackContext)
	if (!ctx) {
		throw new Error("useFeedbackContext must be used within <FeedbackProvider>")
	}
	return ctx
}
