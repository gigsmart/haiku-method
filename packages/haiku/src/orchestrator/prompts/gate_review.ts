// orchestrator/prompts/gate_review.ts — Stage gate is open and the
// review session has been prepared. The orchestrator returns the
// review URL in `action.review_url`; the agent's job is to surface
// the URL to the user (when needed) and then call haiku_await_gate
// to block on the decision.
//
// Two paths:
//   - `browser_attached: false` (first gate of the session, or the
//     SPA tab was closed) — agent posts the URL to chat so the user
//     can open it on whichever device they want.
//   - `browser_attached: true` (the user is already watching the SPA
//     from a prior gate this session) — agent skips the post; the
//     SPA's live-state stream automatically refreshed into the new
//     gate view when prepare fired.
//
// Either way the agent calls haiku_await_gate next.

import { definePromptBuilder } from "./define.js"

export default definePromptBuilder(({ slug, action }) => {
	const stage = action.stage as string
	const nextStage = action.next_stage as string | null
	const reviewUrl = (action.review_url as string) || ""
	const sessionId = (action.session_id as string) || ""
	const browserAttached = action.browser_attached === true

	if (browserAttached) {
		return `## Gate: Awaiting Approval

Stage "${stage}" is complete and ready for human review${nextStage ? ` before advancing to "${nextStage}"` : ""}.

### Browser Already Attached

The user is already watching the SPA on this intent (\`browser_attached: true\` — the live-session broadcaster fired a \`gate_prepared\` event into their open tab). **Do NOT re-post the review URL.** It hasn't changed: \`${reviewUrl}\`.

### Instructions

1. **Call \`haiku_await_gate { intent: "${slug}" }\`** — blocks until the user submits the review. Pass \`auto_open: false\` so the MCP host doesn't pop a duplicate browser tab; the user is already on the page.${sessionId ? `\n2. *Session ID: \`${sessionId}\`.*` : ""}

When the user decides, the await tool returns the next orchestrator action (advance_stage, changes_requested, external_review_requested, etc.) along with the instructions to follow next.`
	}

	return `## Gate: Awaiting Approval

Stage "${stage}" is complete and ready for human review${nextStage ? ` before advancing to "${nextStage}"` : ""}.

### Review URL

\`${reviewUrl}\`

### Instructions

1. **Tell the user the URL** — post the review URL above in chat so the user can open it on whichever device they want (the MCP host's browser may not be reachable: remote sessions, headless hosts, SSH-only, mobile clients, etc.).
2. **Call \`haiku_await_gate { intent: "${slug}" }\`** — this blocks until the user submits the review (Approve / Request Changes / External Review). The tool will also try to launch the URL in the default browser; pass \`auto_open: false\` if you only want the user to use their own device.${sessionId ? `\n3. *Session ID for this review: \`${sessionId}\` — included for diagnostics; haiku_await_gate finds it automatically.*` : ""}

When the user decides, the await tool returns the next orchestrator action (advance_stage, changes_requested, external_review_requested, etc.) along with the instructions to follow next.`
})
