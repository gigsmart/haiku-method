import { beforeEach, describe, expect, it, vi } from "vitest"
import { createHttpTransport } from "../src/transports/http"

describe("createHttpTransport", () => {
	beforeEach(() => {
		vi.restoreAllMocks()
	})

	it("fetches the session from the correct URL", async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(
				JSON.stringify({
					session_id: "abc",
					session_type: "review",
					status: "pending",
				}),
				{
					status: 200,
					headers: { "Content-Type": "application/json" },
				},
			),
		)
		vi.stubGlobal("fetch", fetchMock)

		const t = createHttpTransport({
			sessionId: "abc",
			baseUrl: "https://example.test",
		})
		const session = await t.fetchSession()

		expect(fetchMock).toHaveBeenCalledWith(
			"https://example.test/api/session/abc",
			expect.objectContaining({}),
		)
		expect(session.session_id).toBe("abc")
	})

	it("throws a helpful error on 404", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValue(new Response("", { status: 404 }))
		vi.stubGlobal("fetch", fetchMock)

		const t = createHttpTransport({ sessionId: "missing" })
		await expect(t.fetchSession()).rejects.toThrow(/Session not found/)
	})

	it("submits a decision via POST /review/:id/decide", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValue(new Response("{}", { status: 200 }))
		vi.stubGlobal("fetch", fetchMock)

		const t = createHttpTransport({ sessionId: "abc" })
		await t.submitDecision("approved", "lgtm")

		const [url, init] = fetchMock.mock.calls[0]
		expect(url).toBe("/review/abc/decide")
		expect(init.method).toBe("POST")
		expect(JSON.parse(init.body)).toEqual({
			decision: "approved",
			feedback: "lgtm",
		})
	})

	it("submits answers via POST /question/:id/answer", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValue(new Response("{}", { status: 200 }))
		vi.stubGlobal("fetch", fetchMock)

		const t = createHttpTransport({ sessionId: "q1" })
		await t.submitAnswers(
			[{ question: "A?", selectedOptions: ["yes"] }],
			"feedback",
		)

		const [url, init] = fetchMock.mock.calls[0]
		expect(url).toBe("/question/q1/answer")
		const body = JSON.parse(init.body)
		expect(body.answers).toHaveLength(1)
		expect(body.feedback).toBe("feedback")
	})

	it("submits a direction via POST /direction/:id/select", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValue(new Response("{}", { status: 200 }))
		vi.stubGlobal("fetch", fetchMock)

		const t = createHttpTransport({ sessionId: "d1" })
		await t.submitDirection("Modern", { density: 0.7 })

		const [url, init] = fetchMock.mock.calls[0]
		expect(url).toBe("/direction/d1/select")
		expect(JSON.parse(init.body)).toEqual({
			archetype: "Modern",
			parameters: { density: 0.7 },
		})
	})

	it("only attaches heartbeat when enabled", async () => {
		const withHeartbeat = createHttpTransport({
			sessionId: "hb",
			heartbeat: true,
		})
		const without = createHttpTransport({ sessionId: "hb" })

		expect(withHeartbeat.heartbeat).toBeTypeOf("function")
		expect(without.heartbeat).toBeUndefined()
	})

	it("heartbeat reports ok from a successful HEAD probe", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValue(new Response("", { status: 200 }))
		vi.stubGlobal("fetch", fetchMock)

		const t = createHttpTransport({ sessionId: "hb", heartbeat: true })
		await expect(t.heartbeat?.()).resolves.toBe(true)
		expect(fetchMock.mock.calls[0][0]).toBe("/api/session/hb/heartbeat")
	})
})
