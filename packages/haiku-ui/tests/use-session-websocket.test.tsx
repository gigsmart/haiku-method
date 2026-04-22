/**
 * Verifies useSessionWebSocket batches bursty `session-update` frames:
 * 100 frames in a tight loop collapse to exactly one onUpdate callback
 * per animation frame.
 */

import { act, render } from "@testing-library/react"
import { useEffect } from "react"
import { describe, expect, it, vi } from "vitest"
import type { ApiClient } from "../src/api/client"
import { ApiClientProvider } from "../src/api/context"
import { useSessionWebSocket } from "../src/hooks/useSessionWebSocket"

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

describe("useSessionWebSocket rAF coalescing", () => {
	it("collapses 100 bursty session-update frames to a single onUpdate call per frame", async () => {
		const ws = new FakeWebSocket()
		const client = makeClient(ws)

		let rafCallbacks: FrameRequestCallback[] = []
		const rafSpy = vi
			.spyOn(globalThis, "requestAnimationFrame")
			.mockImplementation((cb: FrameRequestCallback) => {
				rafCallbacks.push(cb)
				return rafCallbacks.length
			})
		const cafSpy = vi
			.spyOn(globalThis, "cancelAnimationFrame")
			.mockImplementation(() => undefined)

		const onUpdate = vi.fn()

		render(
			<ApiClientProvider client={client}>
				<Harness ws={ws} onUpdate={onUpdate} />
			</ApiClientProvider>,
		)

		// Dispatch 100 updates synchronously — all in one frame window.
		await act(async () => {
			for (let i = 0; i < 100; i++) {
				ws.dispatchSessionUpdate({ status: `tick-${i}` })
			}
		})

		// rAF should have been scheduled ONCE for the burst.
		expect(rafSpy).toHaveBeenCalledTimes(1)
		expect(onUpdate).not.toHaveBeenCalled()

		// Flush the scheduled rAF callback.
		await act(async () => {
			const cbs = rafCallbacks
			rafCallbacks = []
			for (const cb of cbs) cb(performance.now())
		})

		// Exactly one onUpdate call, carrying the LAST payload (tick-99).
		expect(onUpdate).toHaveBeenCalledTimes(1)
		const first = onUpdate.mock.calls[0][0] as { status: string }
		expect(first.status).toBe("tick-99")

		rafSpy.mockRestore()
		cafSpy.mockRestore()
	})
})
