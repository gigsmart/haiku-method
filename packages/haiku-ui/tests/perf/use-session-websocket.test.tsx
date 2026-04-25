/**
 * Verifies useSessionWebSocket batches bursty `session-update` frames under
 * **real** `requestAnimationFrame` timing (jsdom's polyfill — not mocked).
 *
 * Tier: relative-regression gate (jsdom perf tier). This test proves the
 * hook's `rafRef !== null` coalescing branch actually fires and re-arms
 * across real frames — not just that a manual drain flushes once. A future
 * regression that e.g. calls `onUpdate` per-message synchronously will
 * inflate the coalescing count and fail this test.
 *
 * NOT a real-browser paint guarantee; real-browser perf budgets are a
 * follow-up (Vitest browser mode). See `tests/perf/README.md` for the tier
 * contract and the out-of-scope work.
 *
 * Ref: FB-62 —
 * `.haiku/intents/universal-feedback-model-and-review-recovery/stages/development/feedback/62-annotation-perf-and-use-session-websocket-tests-mock-timers.md`.
 */

import { act, render } from "@testing-library/react"
import { useEffect } from "react"
import { describe, expect, it, vi } from "vitest"
import type { ApiClient } from "../../src/api/client"
import { ApiClientProvider } from "../../src/api/context"
import { useSessionWebSocket } from "../../src/hooks/useSessionWebSocket"

class FakeWebSocket {
	static OPEN = 1
	readyState = 1
	onopen: ((ev: unknown) => void) | null = null
	onclose: ((ev: unknown) => void) | null = null
	onerror: ((ev: unknown) => void) | null = null
	onmessage: ((ev: { data: string }) => void) | null = null

	send = vi.fn()
	close = vi.fn()

	dispatchSessionUpdate(payload: Record<string, unknown>) {
		this.onmessage?.({
			data: JSON.stringify({
				type: "session-update",
				session_id: "s1",
				status: "pending",
				...payload,
			}),
		})
	}
}

function makeClient(ws: FakeWebSocket): ApiClient {
	return {
		fetchSession: vi.fn(),
		fetchReviewCurrent: vi.fn(),
		submitDecision: vi.fn(),
		submitAnswer: vi.fn(),
		submitDirection: vi.fn(),
		submitRevisit: vi.fn(),
		feedback: {
			list: vi.fn(),
			create: vi.fn(),
			update: vi.fn(),
			delete: vi.fn(),
		},
		setSessionId: vi.fn(),
		getSessionId: () => null,
		openWebSocket: () => ws as unknown as WebSocket,
	}
}

function Harness({
	ws: _ws,
	onUpdate,
}: {
	ws: FakeWebSocket
	onUpdate: (msg: unknown) => void
}) {
	useSessionWebSocket("s1", { onUpdate })
	// Ensure the effect has time to wire up handlers
	useEffect(() => {}, [])
	return null
}

/**
 * Await exactly one real `requestAnimationFrame` tick under jsdom. No spy,
 * no manual queue — the hook's scheduled callback fires on the polyfill's
 * own schedule.
 */
async function flushOneFrame(): Promise<void> {
	return new Promise<void>((resolve) => {
		requestAnimationFrame(() => resolve())
	})
}

describe("useSessionWebSocket rAF coalescing (real rAF)", () => {
	it("collapses bursty session-update frames to one onUpdate per real rAF frame and re-arms across frames", async () => {
		const ws = new FakeWebSocket()
		const client = makeClient(ws)
		const onUpdate = vi.fn()

		render(
			<ApiClientProvider client={client}>
				<Harness ws={ws} onUpdate={onUpdate} />
			</ApiClientProvider>,
		)

		// Burst 1 — dispatch 100 updates synchronously before any rAF can fire.
		await act(async () => {
			for (let i = 0; i < 100; i++) {
				ws.dispatchSessionUpdate({ status: `tick-${i}` })
			}
		})

		// Before the frame fires, no onUpdate has been invoked — the hook is
		// waiting for the scheduled rAF.
		expect(onUpdate).not.toHaveBeenCalled()

		// Advance one real rAF tick and let React settle.
		await act(async () => {
			await flushOneFrame()
		})

		// The burst of 100 synchronous dispatches collapsed to exactly ONE
		// onUpdate call carrying the LAST payload.
		expect(onUpdate).toHaveBeenCalledTimes(1)
		const first = onUpdate.mock.calls[0][0] as { status: string }
		expect(first.status).toBe("tick-99")

		// Burst 2 — dispatch another 50 updates. If the hook's rAF is NOT
		// re-armed after the first frame fires, either these will never fire
		// (stuck) or they will all fire synchronously (broken coalescing).
		// Real rAF proves the "reuse scheduled rAF, reset on frame fire" path.
		await act(async () => {
			for (let i = 100; i < 150; i++) {
				ws.dispatchSessionUpdate({ status: `tick-${i}` })
			}
		})

		// Still only the first burst's call — the second rAF has not fired yet.
		expect(onUpdate).toHaveBeenCalledTimes(1)

		// Advance one more real rAF tick.
		await act(async () => {
			await flushOneFrame()
		})

		// Now exactly TWO onUpdate calls — one per burst — and the second
		// carries the last payload of burst 2.
		expect(onUpdate).toHaveBeenCalledTimes(2)
		const second = onUpdate.mock.calls[1][0] as { status: string }
		expect(second.status).toBe("tick-149")
	})
})
