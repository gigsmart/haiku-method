import { render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { ReviewApp } from "../src/components/ReviewApp"
import {
	makeDirectionSession,
	makeFakeTransport,
	makeQuestionSession,
	makeReviewSession,
} from "./fixtures"

describe("ReviewApp routing", () => {
	it("renders the review page for review sessions", async () => {
		const { transport } = makeFakeTransport(makeReviewSession())
		render(<ReviewApp transport={transport} />)

		// Review page exposes the decision sidebar with an Approve action.
		await waitFor(() =>
			expect(
				screen.getByRole("button", { name: /approve/i }),
			).toBeInTheDocument(),
		)
		// ...and the preamble content from the fixture.
		expect(screen.getAllByText(/Preamble copy/i).length).toBeGreaterThan(0)
	})

	it("renders the question page for question sessions", async () => {
		const { transport } = makeFakeTransport(makeQuestionSession())
		render(<ReviewApp transport={transport} />)

		await waitFor(() =>
			expect(screen.getByText(/Submit Answers/i)).toBeInTheDocument(),
		)
		expect(screen.getAllByText(/Pick one/i).length).toBeGreaterThan(0)
	})

	it("renders the design picker for design_direction sessions", async () => {
		const { transport } = makeFakeTransport(makeDirectionSession())
		render(<ReviewApp transport={transport} />)

		await waitFor(() => expect(screen.getByText(/Modern/i)).toBeInTheDocument())
	})

	it("shows the loading state before the session resolves", () => {
		const session = makeReviewSession()
		const { transport } = makeFakeTransport(session)
		// Make fetchSession hang forever so we stay in loading
		transport.fetchSession = () => new Promise(() => {})

		render(<ReviewApp transport={transport} />)
		expect(screen.getByText(/Loading session/i)).toBeInTheDocument()
	})

	it("shows the error state when fetchSession rejects", async () => {
		const session = makeReviewSession()
		const { transport } = makeFakeTransport(session)
		transport.fetchSession = vi.fn().mockRejectedValue(new Error("nope"))

		render(<ReviewApp transport={transport} />)

		await waitFor(() =>
			expect(screen.getByText(/Session not found/i)).toBeInTheDocument(),
		)
		expect(screen.getByText(/nope/)).toBeInTheDocument()
	})
})
