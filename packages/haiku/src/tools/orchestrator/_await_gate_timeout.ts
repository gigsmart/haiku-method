// tools/orchestrator/_await_gate_timeout.ts — Pure helpers for the
// haiku_await_gate timeout-as-continuation behavior. Lives in its own
// leaf file so tests can import without dragging the full
// orchestrator dependency graph (haiku_await_gate.ts → orchestrator.js
// → server/tool-call.ts → tools/orchestrator/index.ts → back to
// haiku_await_gate.ts is an ESM circular import — the default export
// of haiku_await_gate.ts is undefined at the moment the registry tries
// to read it, which crashes anything that imports a named symbol from
// haiku_await_gate.ts).

/**
 * Classify whether an error from `_awaitGateReviewSession` is a wait
 * timeout (a "still waiting" continuation cue, not a fault) or a real
 * fault. Tests lock the regex set here — a regression that adds a new
 * timeout phrasing without registering it would silently flip the
 * timeout response back to `isError: true` and resurrect the noisy
 * retry loop the user complained about.
 */
export function isAwaitWaitTimeoutError(errorMsg: string): boolean {
	return (
		errorMsg.includes("Review timeout") ||
		errorMsg.includes("Session timeout") ||
		errorMsg.includes("timeout") ||
		errorMsg.includes("Timeout")
	)
}

/**
 * Build the gate-review timeout response. Continuation (isError: false)
 * by design — see haiku_await_gate.ts call site for the full
 * rationale.
 */
export function buildAwaitTimeoutResponse(slug: string): {
	content: Array<{ type: "text"; text: string }>
	isError: false
} {
	return {
		content: [
			{
				type: "text" as const,
				text: `Still waiting on the gate review for "${slug}". The wait window expired without a decision — this is normal for long review windows. Call haiku_await_gate { intent: "${slug}" } again to keep waiting (the session and review URL are unchanged); or haiku_run_next { intent: "${slug}" } if you suspect the session was lost.`,
			},
		],
		isError: false,
	}
}
