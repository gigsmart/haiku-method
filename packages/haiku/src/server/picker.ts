// server/picker.ts — SPA-driven single-select picker.
//
// Replaces MCP elicitation for studio / mode / stage selection and
// destructive-action confirms. The flow:
//
//   1. Caller (e.g. haiku_select_studio) calls `runPicker({ kind,
//      title, prompt, options })`.
//   2. We createPickerSession, start the HTTP server, build the URL,
//      and (best-effort) launch the browser.
//   3. The SPA renders the picker page, the user clicks an option,
//      the SPA POSTs `/picker/:id/select { id }`. The route flips
//      session.status → "answered" and stamps `selection`.
//   4. `runPicker` blocks on `waitForSession` until either:
//      - status === "answered" → returns the chosen `id`
//      - timeout (default 30 min) → returns null (caller decides
//        how to surface "no selection yet")
//
// Mirrors the awaitGateReviewSession pattern from
// haiku_await_gate.ts: drain on entry, wait for an update, drain
// again. No elicitation fallback — by design.

import { startHttpServer } from "../http.js"
import {
	createPickerSession,
	getSession,
	type PickerKind,
	type PickerOption,
	waitForSession,
} from "../sessions.js"
import { isRemoteReviewEnabled, openTunnel } from "../tunnel.js"
import { launchBrowserBestEffort } from "./tool-call.js"

export interface RunPickerArgs {
	intentSlug: string
	kind: PickerKind
	title: string
	prompt: string
	options: PickerOption[]
	autoOpen?: boolean
	timeoutMs?: number
	signal?: AbortSignal
}

export interface RunPickerResult {
	sessionId: string
	url: string
	selection: { id: string } | null
	timedOut: boolean
}

const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000 // 30 minutes

export async function runPicker(args: RunPickerArgs): Promise<RunPickerResult> {
	if (args.options.length === 0) {
		throw new Error("runPicker called with empty options array")
	}
	const session = createPickerSession({
		intent_slug: args.intentSlug,
		kind: args.kind,
		title: args.title,
		prompt: args.prompt,
		options: args.options,
	})

	const port = await startHttpServer()
	let url: string
	if (isRemoteReviewEnabled()) {
		const tunnelUrl = await openTunnel(port)
		// Reuse the JWT-signed remote URL builder; the SPA route
		// sniffs `typ` from the token and renders the right page.
		const { buildReviewUrl } = await import("../tunnel.js")
		url = buildReviewUrl(session.session_id, tunnelUrl, "picker")
	} else {
		url = `http://127.0.0.1:${port}/picker/${session.session_id}`
	}

	if (args.autoOpen !== false) {
		launchBrowserBestEffort(url, `${args.kind} picker`)
	}

	const timeoutMs = args.timeoutMs ?? DEFAULT_TIMEOUT_MS

	// Drain on entry (rare but legal: user picked before the tool
	// re-entered).
	const onEntry = getSession(session.session_id)
	if (
		onEntry &&
		onEntry.session_type === "picker" &&
		onEntry.status === "answered" &&
		onEntry.selection
	) {
		return {
			sessionId: session.session_id,
			url,
			selection: onEntry.selection,
			timedOut: false,
		}
	}

	while (true) {
		let timedOut = false
		try {
			await waitForSession(session.session_id, timeoutMs, args.signal)
		} catch (err) {
			if (args.signal?.aborted) throw err
			timedOut = true
		}

		const cur = getSession(session.session_id)
		if (
			cur &&
			cur.session_type === "picker" &&
			cur.status === "answered" &&
			cur.selection
		) {
			return {
				sessionId: session.session_id,
				url,
				selection: cur.selection,
				timedOut: false,
			}
		}

		if (timedOut) {
			return {
				sessionId: session.session_id,
				url,
				selection: null,
				timedOut: true,
			}
		}
	}
}
