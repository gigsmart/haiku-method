/**
 * DirectionPage — completion-criteria regression tests.
 *
 * Covers:
 *   - <fieldset role="radiogroup"> with native <input type="radio"> cards (select mode).
 *   - Keyboard navigation via ArrowRight / ArrowLeft updates aria-checked.
 *   - Submit posts { mode: "select", archetype, comments?, annotations? }
 *     through ApiClient.submitDirection.
 *   - Mode switch to "regenerate" replaces radios with checkboxes (keep set)
 *     and submits { mode: "regenerate", keep[], comments? }.
 *   - PreviewDialog focus-trap behaviour (FB-69 regression).
 */

import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react"
import type { DirectionSelectRequest, DirectionSessionPayload } from "haiku-api"
import type { ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { LiveRegionShell } from "../../../a11y"
import type { ApiClient } from "../../../api/client"
import { ApiClientProvider } from "../../../api/context"
import { DirectionPage } from "../DirectionPage"

function loadFixture(file: string): DirectionSessionPayload {
	const p = join(__dirname, "..", "..", "..", "..", "test-fixtures", file)
	return JSON.parse(readFileSync(p, "utf-8")) as DirectionSessionPayload
}

function makeMockClient(overrides: Partial<ApiClient> = {}): ApiClient {
	return {
		fetchSession: vi.fn(),
		fetchReviewCurrent: vi.fn(),
		submitDecision: vi.fn(),
		submitAnswer: vi.fn(),
		submitDirection: vi.fn(async () => ({ ok: true as const })),
		submitPicker: vi.fn(async () => ({ ok: true as const, id: "x" })),
		submitRevisit: vi.fn(),
		feedback: {
			list: vi.fn(async (intent: string, stage: string) => ({
				intent,
				stage,
				count: 0,
				items: [],
			})),
			create: vi.fn(),
			update: vi.fn(),
			delete: vi.fn(),
		},
		setSessionId: vi.fn(),
		getSessionId: () => null,
		openWebSocket: () => null,
		...overrides,
	}
}

function Harness({
	client,
	children,
}: {
	client: ApiClient
	children: ReactNode
}) {
	return (
		<ApiClientProvider client={client}>
			<LiveRegionShell />
			{children}
		</ApiClientProvider>
	)
}

describe("DirectionPage — radiogroup (select mode)", () => {
	afterEach(() => {
		cleanup()
		document.body.innerHTML = ""
	})

	it("wraps archetype cards in a <fieldset role='radiogroup'> with native radios", () => {
		const session = loadFixture("direction-session.json")
		const { container } = render(
			<Harness client={makeMockClient()}>
				<DirectionPage session={session} sessionId={session.session_id} />
			</Harness>,
		)

		const fieldset = container.querySelector(
			'fieldset[role="radiogroup"]',
		) as HTMLFieldSetElement | null
		expect(fieldset).toBeTruthy()

		const radios = fieldset?.querySelectorAll('input[type="radio"]')
		expect(radios?.length).toBe(3)
	})

	it("updates aria-checked when ArrowRight cycles selection", () => {
		const session = loadFixture("direction-session.json")
		const { container } = render(
			<Harness client={makeMockClient()}>
				<DirectionPage session={session} sessionId={session.session_id} />
			</Harness>,
		)

		const fieldset = container.querySelector(
			'fieldset[role="radiogroup"]',
		) as HTMLFieldSetElement
		expect(fieldset).toBeTruthy()

		const radios = Array.from(
			fieldset.querySelectorAll('input[type="radio"]'),
		) as HTMLInputElement[]

		expect(radios[0]?.getAttribute("aria-checked")).toBe("true")
		expect(radios[1]?.getAttribute("aria-checked")).toBe("false")

		fireEvent.keyDown(fieldset, { key: "ArrowRight" })
		expect(radios[1]?.getAttribute("aria-checked")).toBe("true")
		expect(radios[0]?.getAttribute("aria-checked")).toBe("false")

		fireEvent.keyDown(fieldset, { key: "ArrowLeft" })
		expect(radios[0]?.getAttribute("aria-checked")).toBe("true")
	})

	it("labels the fieldset via <legend id='direction-prompt-title'>", () => {
		const session = loadFixture("direction-session.json")
		const { container } = render(
			<Harness client={makeMockClient()}>
				<DirectionPage session={session} sessionId={session.session_id} />
			</Harness>,
		)

		const fieldset = container.querySelector(
			'fieldset[aria-labelledby="direction-prompt-title"]',
		)
		expect(fieldset).toBeTruthy()
		const legend = container.querySelector("#direction-prompt-title")
		expect(legend).toBeTruthy()
		expect(legend?.tagName).toBe("LEGEND")
	})
})

describe("DirectionPage — submit (select mode)", () => {
	beforeEach(() => {
		document.body.innerHTML = ""
	})
	afterEach(() => {
		cleanup()
		document.body.innerHTML = ""
	})

	it("posts { mode: 'select', archetype } via submitDirection", async () => {
		const session = loadFixture("direction-session.json")
		const submitDirection = vi.fn(async () => ({ ok: true as const }))
		const client = makeMockClient({ submitDirection })

		render(
			<Harness client={client}>
				<DirectionPage session={session} sessionId={session.session_id} />
			</Harness>,
		)

		const submit = screen.getByRole("button", {
			name: /choose this direction/i,
		})
		fireEvent.click(submit)

		await waitFor(() => {
			expect(submitDirection).toHaveBeenCalledTimes(1)
		})

		const calls = submitDirection.mock.calls as unknown as Array<
			[string, DirectionSelectRequest]
		>
		const call = calls[0]
		if (!call) throw new Error("no submit call")
		const [sessionIdArg, body] = call
		expect(sessionIdArg).toBe(session.session_id)
		expect(body.mode).toBe("select")
		if (body.mode !== "select") throw new Error("expected select mode")
		expect(body.archetype).toBe("Minimal")

		await waitFor(() => {
			const polite = document.getElementById("feedback-live-polite")
			expect(polite?.textContent).toBe("Direction selected")
		})
	})

	it("includes typed comment in the submitted body", async () => {
		const session = loadFixture("direction-session.json")
		const submitDirection = vi.fn(async () => ({ ok: true as const }))
		const client = makeMockClient({ submitDirection })

		render(
			<Harness client={client}>
				<DirectionPage session={session} sessionId={session.session_id} />
			</Harness>,
		)

		const textarea = screen.getByLabelText(
			/optional comment/i,
		) as HTMLTextAreaElement
		fireEvent.change(textarea, {
			target: { value: "Lean into the typography." },
		})

		fireEvent.click(
			screen.getByRole("button", { name: /choose this direction/i }),
		)

		await waitFor(() => {
			expect(submitDirection).toHaveBeenCalledTimes(1)
		})
		const calls = submitDirection.mock.calls as unknown as Array<
			[string, DirectionSelectRequest]
		>
		const body = calls[0]?.[1]
		if (!body) throw new Error("no submit call")
		if (body.mode !== "select") throw new Error("expected select mode")
		expect(body.comments).toBe("Lean into the typography.")
	})
})

describe("DirectionPage — regenerate mode", () => {
	beforeEach(() => {
		document.body.innerHTML = ""
	})
	afterEach(() => {
		cleanup()
		document.body.innerHTML = ""
	})

	function switchToRegenerate() {
		const radio = screen.getByRole("radio", {
			name: /show me different variants/i,
		})
		fireEvent.click(radio)
	}

	it("swaps the archetype radios for keep checkboxes when mode='regenerate'", () => {
		const session = loadFixture("direction-session.json")
		const { container } = render(
			<Harness client={makeMockClient()}>
				<DirectionPage session={session} sessionId={session.session_id} />
			</Harness>,
		)

		switchToRegenerate()

		expect(
			container.querySelectorAll('fieldset input[type="checkbox"]').length,
		).toBe(3)
		expect(
			container.querySelectorAll('fieldset[role="radiogroup"]').length,
		).toBe(0)
	})

	it("posts { mode: 'regenerate', keep[] } via submitDirection", async () => {
		const session = loadFixture("direction-session.json")
		const submitDirection = vi.fn(async () => ({ ok: true as const }))
		const client = makeMockClient({ submitDirection })

		render(
			<Harness client={client}>
				<DirectionPage session={session} sessionId={session.session_id} />
			</Harness>,
		)

		switchToRegenerate()

		const minimalKeep = document.getElementById(
			"direction-keep-minimal",
		) as HTMLInputElement | null
		if (!minimalKeep) throw new Error("keep checkbox for Minimal not found")
		fireEvent.click(minimalKeep)

		fireEvent.click(
			screen.getByRole("button", { name: /generate more — keep 1/i }),
		)

		await waitFor(() => {
			expect(submitDirection).toHaveBeenCalledTimes(1)
		})
		const calls = submitDirection.mock.calls as unknown as Array<
			[string, DirectionSelectRequest]
		>
		const body = calls[0]?.[1]
		if (!body) throw new Error("no submit call")
		expect(body.mode).toBe("regenerate")
		if (body.mode !== "regenerate") throw new Error("expected regenerate mode")
		expect(body.keep).toEqual(["Minimal"])
	})

	it("submit button reads 'fresh batch' when nothing is kept", () => {
		const session = loadFixture("direction-session.json")
		render(
			<Harness client={makeMockClient()}>
				<DirectionPage session={session} sessionId={session.session_id} />
			</Harness>,
		)

		switchToRegenerate()

		expect(
			screen.getByRole("button", { name: /generate a fresh batch/i }),
		).toBeTruthy()
	})
})

describe("DirectionPage — PreviewDialog focus trap (FB-69)", () => {
	afterEach(() => {
		cleanup()
		document.body.innerHTML = ""
	})

	function openPreviewFor(name: string): HTMLButtonElement {
		const trigger = screen.getByRole("button", {
			name: new RegExp(`view full size preview: ${name}`, "i"),
		}) as HTMLButtonElement
		trigger.focus()
		fireEvent.click(trigger)
		return trigger
	}

	it("places role='dialog' + aria-modal on the dialog surface (not the backdrop)", async () => {
		const session = loadFixture("direction-session.json")
		const { container } = render(
			<Harness client={makeMockClient()}>
				<DirectionPage session={session} sessionId={session.session_id} />
			</Harness>,
		)

		openPreviewFor("Minimal")

		const dialog = await waitFor(() => {
			const el = container.querySelector(
				'[role="dialog"][aria-modal="true"]',
			) as HTMLElement | null
			expect(el).toBeTruthy()
			return el as HTMLElement
		})

		expect(dialog.className).not.toContain("bg-black")
		const backdrop = container.querySelector(
			"[aria-hidden='true'].bg-black\\/60",
		) as HTMLElement | null
		expect(backdrop).toBeTruthy()
		expect(backdrop?.getAttribute("role")).toBeNull()
	})

	it("moves initial focus into the dialog when it opens", async () => {
		const session = loadFixture("direction-session.json")
		const { container } = render(
			<Harness client={makeMockClient()}>
				<DirectionPage session={session} sessionId={session.session_id} />
			</Harness>,
		)

		openPreviewFor("Minimal")

		const dialog = await waitFor(() => {
			const el = container.querySelector(
				'[role="dialog"][aria-modal="true"]',
			) as HTMLElement | null
			expect(el).toBeTruthy()
			return el as HTMLElement
		})

		await waitFor(() => {
			const active = document.activeElement as HTMLElement | null
			expect(active).not.toBeNull()
			expect(dialog.contains(active)).toBe(true)
		})
		expect(
			(document.activeElement as HTMLElement).getAttribute("aria-label"),
		).toBe("Dismiss preview")
	})

	it("traps Tab / Shift+Tab inside the dialog surface", async () => {
		const session = loadFixture("direction-session.json")
		const { container } = render(
			<Harness client={makeMockClient()}>
				<DirectionPage session={session} sessionId={session.session_id} />
			</Harness>,
		)

		openPreviewFor("Minimal")

		const dialog = await waitFor(() => {
			const el = container.querySelector(
				'[role="dialog"][aria-modal="true"]',
			) as HTMLElement | null
			expect(el).toBeTruthy()
			return el as HTMLElement
		})

		await waitFor(() => {
			expect(dialog.contains(document.activeElement)).toBe(true)
		})

		fireEvent.keyDown(dialog, { key: "Tab" })
		expect(dialog.contains(document.activeElement)).toBe(true)

		fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true })
		expect(dialog.contains(document.activeElement)).toBe(true)
	})

	it("restores focus to the invoking button when the dialog closes", async () => {
		const session = loadFixture("direction-session.json")
		const { container } = render(
			<Harness client={makeMockClient()}>
				<DirectionPage session={session} sessionId={session.session_id} />
			</Harness>,
		)

		const trigger = openPreviewFor("Minimal")

		const dialog = await waitFor(() => {
			const el = container.querySelector(
				'[role="dialog"][aria-modal="true"]',
			) as HTMLElement | null
			expect(el).toBeTruthy()
			return el as HTMLElement
		})

		await waitFor(() => {
			expect(dialog.contains(document.activeElement)).toBe(true)
		})

		const closeBtn = screen.getByRole("button", { name: /dismiss preview/i })
		fireEvent.click(closeBtn)

		await waitFor(() => {
			expect(
				container.querySelector('[role="dialog"][aria-modal="true"]'),
			).toBeNull()
		})
		await waitFor(() => {
			expect(document.activeElement).toBe(trigger)
		})
	})

	it("closes on Escape and restores focus to the invoker", async () => {
		const session = loadFixture("direction-session.json")
		const { container } = render(
			<Harness client={makeMockClient()}>
				<DirectionPage session={session} sessionId={session.session_id} />
			</Harness>,
		)

		const trigger = openPreviewFor("Bold")

		const dialog = await waitFor(() => {
			const el = container.querySelector(
				'[role="dialog"][aria-modal="true"]',
			) as HTMLElement | null
			expect(el).toBeTruthy()
			return el as HTMLElement
		})

		await waitFor(() => {
			expect(dialog.contains(document.activeElement)).toBe(true)
		})

		fireEvent.keyDown(document, { key: "Escape" })

		await waitFor(() => {
			expect(
				container.querySelector('[role="dialog"][aria-modal="true"]'),
			).toBeNull()
		})
		await waitFor(() => {
			expect(document.activeElement).toBe(trigger)
		})
	})
})

describe("DirectionPage — intake mode (no archetypes)", () => {
	afterEach(() => {
		cleanup()
		document.body.innerHTML = ""
	})

	function intakeSession(): DirectionSessionPayload {
		return {
			session_id: "intake-session",
			session_type: "design_direction",
			status: "pending",
			title: "Pick or upload",
			intent_slug: "demo-intent",
			archetypes: [],
			selection: null,
		}
	}

	it("renders the intake screen when archetypes is empty", () => {
		render(
			<Harness client={makeMockClient()}>
				<DirectionPage
					session={intakeSession()}
					sessionId="intake-session"
				/>
			</Harness>,
		)
		expect(screen.getByText(/i have designs to upload/i)).toBeTruthy()
		expect(
			screen.getByRole("button", { name: /generate variants for me instead/i }),
		).toBeTruthy()
	})

	it("posts { mode: 'generate' } when the user clicks generate", async () => {
		const submitDirection = vi.fn(async () => ({ ok: true as const }))
		const client = makeMockClient({ submitDirection })
		render(
			<Harness client={client}>
				<DirectionPage
					session={intakeSession()}
					sessionId="intake-session"
				/>
			</Harness>,
		)
		fireEvent.click(
			screen.getByRole("button", { name: /generate variants for me instead/i }),
		)
		await waitFor(() => {
			expect(submitDirection).toHaveBeenCalledTimes(1)
		})
		const calls = submitDirection.mock.calls as unknown as Array<
			[string, DirectionSelectRequest]
		>
		const body = calls[0]?.[1]
		if (!body) throw new Error("no submit call")
		expect(body.mode).toBe("generate")
	})

	it("posts { mode: 'upload', files } after a file is added", async () => {
		const submitDirection = vi.fn(async () => ({ ok: true as const }))
		const client = makeMockClient({ submitDirection })
		render(
			<Harness client={client}>
				<DirectionPage
					session={intakeSession()}
					sessionId="intake-session"
				/>
			</Harness>,
		)

		const fileInput = document.getElementById(
			"intake-file-input",
		) as HTMLInputElement | null
		if (!fileInput) throw new Error("file input not found")

		// jsdom's File / FileReader stubs accept Blob inputs and emit a
		// synthetic data URL. A trivial PNG header is fine — we only
		// assert the wire shape downstream.
		const file = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "hero.png", {
			type: "image/png",
		})
		Object.defineProperty(fileInput, "files", {
			value: [file],
			configurable: true,
		})
		fireEvent.change(fileInput)

		// Wait for the file's data URL to be read and rendered.
		await waitFor(() => {
			expect(screen.queryByText("hero.png")).toBeTruthy()
		})

		fireEvent.click(
			screen.getByRole("button", { name: /use these 1 design as the direction/i }),
		)

		await waitFor(() => {
			expect(submitDirection).toHaveBeenCalledTimes(1)
		})
		const calls = submitDirection.mock.calls as unknown as Array<
			[string, DirectionSelectRequest]
		>
		const body = calls[0]?.[1]
		if (!body) throw new Error("no submit call")
		if (body.mode !== "upload") throw new Error("expected upload mode")
		expect(body.files.length).toBe(1)
		expect(body.files[0]?.filename).toBe("hero.png")
		expect(body.files[0]?.data_url.startsWith("data:")).toBe(true)
	})
})
