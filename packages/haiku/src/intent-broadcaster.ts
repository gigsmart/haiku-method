// intent-broadcaster.ts — Per-intent pub/sub for live state events.
//
// The SPA used to be a one-shot review form: open URL, click Approve,
// done. Under the live-session model it's a dashboard that watches the
// intent for the duration of the agent session — units running, hats
// changing, gates opening and closing, feedback arriving. Those state
// transitions need to flow to the browser as they happen.
//
// Single EventEmitter, listener channel keyed by `intent:<slug>`.
// Subscribers (one per WS connection in http/ws.ts) attach when the
// SPA connects and forward each event as an `intent-event` WS frame.
// Senders (the workflow tick handler, state-tools mutations, the
// session record) call `broadcastIntent(slug, event)` after a state
// change has committed to disk.
//
// Events are best-effort: a missed broadcast is recoverable via the
// SPA's existing `/api/session/:id` poll fallback. The broadcaster is
// not the source of truth — intent.md FM + per-unit FM + branch-merge
// state are (v4: state.json is dead). The SPA reduces events on top
// of an initial snapshot fetched from the API and resyncs on WS
// reconnect.

import { EventEmitter } from "node:events"

/** A single state transition the agent or workflow engine has just
 *  committed for the named intent. The SPA reduces these onto its
 *  in-memory snapshot to keep the dashboard live. */
export type IntentEvent =
	| {
			/** A workflow tick committed and produced an orchestrator
			 *  action. The SPA refreshes its `current_state` on this. */
			type: "tick_committed"
			action: string
			phase?: string
			stage?: string
			iteration?: number
	  }
	| {
			/** A unit's status, hat, or bolt counter changed. */
			type: "unit_changed"
			unit_name: string
			status: string
			stage?: string
			hat?: string
	  }
	| {
			/** A feedback file was created, updated, or closed. */
			type: "feedback_changed"
			feedback_id: string
			status: string
			stage?: string
	  }
	| {
			/** A gate-review session was prepared (or re-prepared) for
			 *  this intent. The SPA can use this to switch into gate-
			 *  review mode without polling. */
			type: "gate_prepared"
			session_id: string
			stage: string
			gate_context: string
			review_url: string
			browser_attached: boolean
	  }
	| {
			/** The await_active flag on the named session flipped. The
			 *  SPA gates the Approve button on this. */
			type: "await_state_changed"
			session_id: string
			await_active: boolean
	  }
	| {
			/** The pending_decision slot for the named session was set
			 *  or cleared. */
			type: "pending_decision_changed"
			session_id: string
			queued: boolean
	  }

const events = new EventEmitter()
// One listener per SPA tab. 200 is well above the realistic concurrent
// SPA count and matches the `sessions.ts` EventEmitter cap.
events.setMaxListeners(200)

/** Attach a listener for state events on the named intent. Returns an
 *  unsubscribe function. The listener is called synchronously from the
 *  emitter loop, so it should be fast — typically just a WS frame
 *  send. */
export function subscribeIntent(
	slug: string,
	listener: (event: IntentEvent) => void,
): () => void {
	const channel = `intent:${slug}`
	events.on(channel, listener)
	return () => {
		events.off(channel, listener)
	}
}

/** Fan out a state event to every subscriber for the named intent. No-
 *  op when no subscribers are attached (the common case during agent
 *  startup before any SPA connects). */
export function broadcastIntent(slug: string, event: IntentEvent): void {
	events.emit(`intent:${slug}`, event)
}

/** Test helper — drop all listeners. Useful for resetting between
 *  fixture-based tests. Production code never calls this. */
export function _resetIntentBroadcaster(): void {
	events.removeAllListeners()
}
