import { renderHook, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { useSession } from "../src/hooks/useSession"
import { makeFakeTransport, makeReviewSession } from "./fixtures"

describe("useSession", () => {
	it("loads the session via transport.fetchSession", async () => {
		const session = makeReviewSession()
		const { transport, calls } = makeFakeTransport(session)

		const { result } = renderHook(() => useSession(transport))

		expect(result.current.loading).toBe(true)
		await waitFor(() => expect(result.current.loading).toBe(false))

		expect(calls.fetchCount).toBe(1)
		expect(result.current.session).toEqual(session)
		expect(result.current.error).toBeNull()
	})

	it("surfaces fetch errors", async () => {
		const session = makeReviewSession()
		const { transport } = makeFakeTransport(session)
		transport.fetchSession = vi.fn().mockRejectedValue(new Error("boom"))

		const { result } = renderHook(() => useSession(transport))
		await waitFor(() => expect(result.current.loading).toBe(false))

		expect(result.current.session).toBeNull()
		expect(result.current.error).toBe("boom")
	})

	it("leaves isConnected null when transport has no heartbeat", async () => {
		const session = makeReviewSession()
		const { transport } = makeFakeTransport(session)

		const { result } = renderHook(() => useSession(transport))
		await waitFor(() => expect(result.current.loading).toBe(false))

		expect(result.current.isConnected).toBeNull()
	})

	it("flips isConnected based on heartbeat result", async () => {
		const session = makeReviewSession()
		const heartbeat = vi.fn().mockResolvedValue(true)
		const { transport } = makeFakeTransport(session, { heartbeat })

		const { result } = renderHook(() => useSession(transport))
		await waitFor(() => expect(result.current.isConnected).toBe(true))
		expect(heartbeat).toHaveBeenCalled()
	})
})
