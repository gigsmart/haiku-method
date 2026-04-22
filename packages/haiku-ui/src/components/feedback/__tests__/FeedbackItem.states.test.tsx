/**
 * State-matrix snapshot + behavior tests for FeedbackItem
 * (state-coverage-grid.md §7.3–§7.4 + DESIGN-BRIEF §2 buttons/aria table).
 *
 * Cardinality: 4 status variants × 6 interaction states = 24 cells. Under
 * the 36-cell cap. The simulated-state wrappers use `data-state` class
 * modifiers (`state-hover`, `state-focus`, `state-active`, `state-disabled`,
 * `state-error`) lifted from the `feedback-card-states.html` design
 * artifact so the snapshot captures the state markup in a form that
 * reproduces how the artifact paints each cell.
 *
 * Covers completion criteria:
 *   - aria-label="Status: {status}" present on every badge instance
 *   - canonical verbs only (Dismiss / Verify & Close / Reopen) — banned
 *     verbs (Close / Reject / Address / "Re-open") never render. "Delete"
 *     is NOT banned: it is the terminal destructive action and renders
 *     only on closed/rejected items when `onDelete` is supplied (per
 *     FeedbackItem docstring + DESIGN-TOKENS §2.6).
 *   - zero opacity-50|60|70 classes anywhere in the rendered tree
 *   - aria-expanded toggles with the isExpanded prop
 *   - focus preservation after a status transition → card root
 *   - useAnnounce("polite", ...) fires after a status transition
 */

import { act, cleanup, fireEvent, render } from "@testing-library/react"
import { useState } from "react"
import { afterEach, describe, expect, it } from "vitest"
import { LiveRegionShell, POLITE_REGION_ID } from "../../../a11y"
import { FeedbackItem } from "../FeedbackItem"
import { type FeedbackStatus, TOKEN_HASH } from "../tokens"
import { mockItems } from "./mockItems"

afterEach(() => {
	cleanup()
})

const STATUSES: FeedbackStatus[] = [
	"pending",
	"addressed",
	"closed",
	"rejected",
]

const INTERACTION_STATES = [
	"default",
	"hover",
	"focus",
	"active",
	"disabled",
	"error",
] as const

function StateWrapper({
	state,
	children,
}: {
	state: (typeof INTERACTION_STATES)[number]
	children: React.ReactNode
}): React.ReactElement {
	return (
		<div
			data-cell-state={state}
			className={`state-${state}${state === "disabled" ? " pointer-events-none" : ""}${state === "error" ? " ring-1 ring-red-500" : ""}`}
			aria-disabled={state === "disabled" || undefined}
		>
			{children}
		</div>
	)
}

function Matrix(): React.ReactElement {
	const items = mockItems(4)
	// Map each item to a target status — we reuse mockItems ordering pending
	// → addressed → closed → rejected which already matches STATUSES.
	return (
		<div data-token-hash={TOKEN_HASH}>
			{STATUSES.map((status, statusIdx) => (
				<div key={status} data-status-row={status}>
					{INTERACTION_STATES.map((interaction) => (
						<StateWrapper key={`${status}-${interaction}`} state={interaction}>
							<FeedbackItem
								item={{ ...items[statusIdx], status }}
								isExpanded={interaction === "active"}
								onToggle={() => undefined}
								onStatusChange={() => undefined}
								onDelete={() => undefined}
							/>
						</StateWrapper>
					))}
				</div>
			))}
		</div>
	)
}

describe("FeedbackItem — state matrix", () => {
	it("renders every (status × interaction) cell (snapshot with token-hash header)", () => {
		const { container } = render(<Matrix />)
		expect(container.firstChild).toMatchSnapshot()
	})

	it('every status badge in the matrix carries aria-label="Status: {status}"', () => {
		const { queryAllByLabelText } = render(<Matrix />)
		// Each status appears once per interaction state (6 per status).
		// 4 statuses × 6 interactions = 24 badge instances total.
		const total =
			queryAllByLabelText(/^Status: pending$/).length +
			queryAllByLabelText(/^Status: addressed$/).length +
			queryAllByLabelText(/^Status: closed$/).length +
			queryAllByLabelText(/^Status: rejected$/).length
		expect(total).toBe(24)
		// Verify the per-status bucket is exactly 6.
		for (const status of STATUSES) {
			expect(queryAllByLabelText(`Status: ${status}`).length).toBe(6)
		}
	})

	it("zero opacity-50|60|70 utility classes anywhere in the rendered tree", () => {
		const { container } = render(<Matrix />)
		const html = container.innerHTML
		expect(html).not.toMatch(/\bopacity-(50|60|70)\b/)
	})
})

// ── Canonical verb assertions ──
//
// Banned verbs (never render anywhere): Close / Reject / Address / "Re-open"
// (hyphenated). Audit-enforced via `audit-config.json` rules
// `banned-button-verb-content` and `banned-button-verb-aria`.
//
// "Delete" is NOT banned. Per the FeedbackItem docstring and DESIGN-TOKENS
// §2.6, it is the terminal destructive action surfaced only on
// closed/rejected items when the optional `onDelete` handler is supplied.
// Positive render coverage is asserted below alongside the banned-verb
// negatives.

describe("FeedbackItem — canonical verbs", () => {
	it("pending + expanded renders a Dismiss button; no Close / Reject / Delete button", () => {
		const items = mockItems(1)
		const { getByText, queryByText } = render(
			<FeedbackItem
				item={{ ...items[0], status: "pending" }}
				isExpanded
				onToggle={() => undefined}
				onStatusChange={() => undefined}
				onDelete={() => undefined}
			/>,
		)
		expect(getByText("Dismiss").tagName).toBe("BUTTON")
		expect(queryByText("Close")).toBeNull()
		expect(queryByText("Reject")).toBeNull()
		// Delete is NOT banned, but it is scoped to closed/rejected only —
		// it must never render on a pending item even when onDelete is wired.
		expect(queryByText("Delete")).toBeNull()
	})

	it("addressed + expanded renders Verify & Close + Reopen; no bare Close or Reject; no Delete button", () => {
		const items = mockItems(2)
		const { getByText, queryByText } = render(
			<FeedbackItem
				item={{ ...items[1], status: "addressed" }}
				isExpanded
				onToggle={() => undefined}
				onStatusChange={() => undefined}
				onDelete={() => undefined}
			/>,
		)
		expect(getByText("Verify & Close").tagName).toBe("BUTTON")
		expect(getByText("Reopen").tagName).toBe("BUTTON")
		expect(queryByText("Reject")).toBeNull()
		// Delete is scoped to closed/rejected — never on addressed.
		expect(queryByText("Delete")).toBeNull()
	})

	it("closed + expanded renders Reopen (one word, no hyphen) + Delete when onDelete is supplied", () => {
		const items = mockItems(3)
		const { getByText, queryByText } = render(
			<FeedbackItem
				item={{ ...items[2], status: "closed" }}
				isExpanded
				onToggle={() => undefined}
				onStatusChange={() => undefined}
				onDelete={() => undefined}
			/>,
		)
		expect(getByText("Reopen").tagName).toBe("BUTTON")
		expect(queryByText("Re-open")).toBeNull()
		// Delete is the terminal destructive action on closed items —
		// it MUST render when onDelete is supplied.
		expect(getByText("Delete").tagName).toBe("BUTTON")
	})

	it("rejected + expanded renders Reopen + Delete when onDelete is supplied", () => {
		const items = mockItems(4)
		const { getByText } = render(
			<FeedbackItem
				item={{ ...items[3], status: "rejected" }}
				isExpanded
				onToggle={() => undefined}
				onStatusChange={() => undefined}
				onDelete={() => undefined}
			/>,
		)
		expect(getByText("Reopen").tagName).toBe("BUTTON")
		// Delete is the terminal destructive action on rejected items —
		// it MUST render when onDelete is supplied.
		expect(getByText("Delete").tagName).toBe("BUTTON")
	})

	it("closed + expanded does NOT render Delete when onDelete is omitted", () => {
		const items = mockItems(3)
		const { queryByText } = render(
			<FeedbackItem
				item={{ ...items[2], status: "closed" }}
				isExpanded
				onToggle={() => undefined}
				onStatusChange={() => undefined}
			/>,
		)
		// Delete is optional — it renders only when the parent wires
		// onDelete. Without the handler, no Delete button appears.
		expect(queryByText("Delete")).toBeNull()
	})

	it("Delete button on closed/rejected carries data-action=\"delete\" + aria-label=\"Delete feedback {id}\"", () => {
		// Lock in the contract shape downstream audit tooling relies on.
		// data-action is the hook stable selector for E2E + keyboard-nav
		// tests; aria-label follows the DESIGN-BRIEF §2 screen-reader table
		// pattern ("{verb} feedback {id}"). Together they make the "Delete
		// is NOT banned; it's the terminal destructive action" contract
		// (FeedbackItem.tsx:1-22 docstring + DESIGN-TOKENS §2.6) mechanically
		// verifiable — guarding against future drift that caused FB-51.
		const items = mockItems(3)
		const { container } = render(
			<FeedbackItem
				item={{
					...items[2],
					status: "closed",
					feedback_id: "FB-42",
				}}
				isExpanded
				onToggle={() => undefined}
				onStatusChange={() => undefined}
				onDelete={() => undefined}
			/>,
		)
		const del = container.querySelector<HTMLButtonElement>(
			"button[data-action='delete']",
		)
		expect(del).not.toBeNull()
		expect(del?.textContent?.trim()).toBe("Delete")
		expect(del?.getAttribute("aria-label")).toBe("Delete feedback FB-42")
	})
})

// ── aria-expanded + focus preservation + live-region announcement ───────────

function ControllableFeedbackItem({
	initialStatus,
}: {
	initialStatus: FeedbackStatus
}): React.ReactElement {
	const [status, setStatus] = useState<FeedbackStatus>(initialStatus)
	const [isExpanded, setIsExpanded] = useState(true)
	const items = mockItems(1)
	const item = { ...items[0], status, feedback_id: "FB-01" }
	return (
		<>
			<LiveRegionShell />
			<FeedbackItem
				item={item}
				isExpanded={isExpanded}
				onToggle={() => setIsExpanded((v) => !v)}
				onStatusChange={(_id, next) => setStatus(next)}
			/>
		</>
	)
}

describe("FeedbackItem — aria-expanded", () => {
	it("aria-expanded reflects the isExpanded prop", () => {
		const items = mockItems(1)
		const { container, rerender } = render(
			<FeedbackItem
				item={{ ...items[0], status: "pending" }}
				isExpanded={false}
				onToggle={() => undefined}
			/>,
		)
		const card = container.querySelector<HTMLDivElement>(
			"[data-testid='feedback-item']",
		)
		expect(card?.getAttribute("aria-expanded")).toBe("false")
		rerender(
			<FeedbackItem
				item={{ ...items[0], status: "pending" }}
				isExpanded
				onToggle={() => undefined}
			/>,
		)
		expect(card?.getAttribute("aria-expanded")).toBe("true")
	})
})

describe("FeedbackItem — focus preservation on status change", () => {
	it("after Dismiss, focus returns to the card root (not lost to <body>)", async () => {
		const { container } = render(
			<ControllableFeedbackItem initialStatus="pending" />,
		)
		const dismiss = container.querySelector<HTMLButtonElement>(
			"[data-action='dismiss']",
		)
		if (!dismiss) throw new Error("dismiss button missing")
		// Simulate keyboard focus on the dismiss button, then click it.
		dismiss.focus()
		expect(document.activeElement).toBe(dismiss)
		await act(async () => {
			fireEvent.click(dismiss)
		})
		const card = container.querySelector<HTMLDivElement>(
			"[data-testid='feedback-item']",
		)
		expect(card?.getAttribute("data-status")).toBe("rejected")
		expect(document.activeElement).toBe(card)
	})
})

describe("FeedbackItem — screen-reader announcement on status change", () => {
	it("fires a polite announcement after Dismiss (pending → rejected)", async () => {
		const { container } = render(
			<ControllableFeedbackItem initialStatus="pending" />,
		)
		const polite = document.getElementById(POLITE_REGION_ID)
		expect(polite).not.toBeNull()
		const dismiss = container.querySelector<HTMLButtonElement>(
			"[data-action='dismiss']",
		)
		if (!dismiss) throw new Error("dismiss button missing")
		await act(async () => {
			fireEvent.click(dismiss)
		})
		expect(polite?.textContent).toBe("Feedback FB-01 marked as rejected")
	})

	it("fires a polite announcement after Verify & Close (addressed → closed)", async () => {
		const { container } = render(
			<ControllableFeedbackItem initialStatus="addressed" />,
		)
		const polite = document.getElementById(POLITE_REGION_ID)
		const verify = container.querySelector<HTMLButtonElement>(
			"[data-action='verify-close']",
		)
		if (!verify) throw new Error("verify-close button missing")
		await act(async () => {
			fireEvent.click(verify)
		})
		expect(polite?.textContent).toBe("Feedback FB-01 marked as closed")
	})

	it("fires a polite announcement after Reopen (rejected → pending)", async () => {
		const { container } = render(
			<ControllableFeedbackItem initialStatus="rejected" />,
		)
		const polite = document.getElementById(POLITE_REGION_ID)
		const reopen = container.querySelector<HTMLButtonElement>(
			"[data-action='reopen']",
		)
		if (!reopen) throw new Error("reopen button missing")
		await act(async () => {
			fireEvent.click(reopen)
		})
		expect(polite?.textContent).toBe("Feedback FB-01 reopened")
	})
})
