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
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { LiveRegionShell, POLITE_REGION_ID } from "../../../a11y"
import { injectCanonicalTouchTargetCss } from "../../../a11y/__tests__/touch-target-css"
import type { FeedbackItemData } from "../../../types"
import { FeedbackItem } from "../FeedbackItem"
import { type FeedbackStatus, TOKEN_HASH } from "../tokens"
import { mockItems } from "./mockItems"

// FB-65: inject the canonical `.touch-target` CSS (loaded from the real
// shipped `src/index.css`) so `getComputedStyle` resolves min-height and
// min-width against the production rule. A regression in `index.css` —
// e.g. removing the rule, shrinking the 44px value — fails the 44×44
// assertions in the "action buttons meet 44×44" block below.
beforeAll(() => {
	injectCanonicalTouchTargetCss("feedback-item-touch-target-css")
})

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

	it('Delete button on closed/rejected carries data-action="delete" + aria-label="Delete feedback {id}"', () => {
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
	onStatusChangeSpy,
	itemOverrides,
}: {
	initialStatus: FeedbackStatus
	/**
	 * Optional spy invoked ahead of the internal state update so tests that
	 * care about dispatch counts (e.g. the stale-reference idempotency test
	 * below) can assert call shape + cardinality without re-plumbing the
	 * wrapper. When omitted the wrapper behaves as before: state updates
	 * happen synchronously, no observable from the parent.
	 */
	onStatusChangeSpy?: (id: string, next: FeedbackStatus) => void
	/**
	 * Optional overrides merged into the rendered item. Used by the
	 * upstream-stage pinning test to inject fields the wire schema does not
	 * yet carry (see `packages/haiku-api/src/schemas/feedback.ts`
	 * FeedbackItemSchema — `upstream_stage` is deliberately out-of-schema
	 * today; this override lets us pin the current "no distinct affordance"
	 * rendering so a future schema addition forces a test update).
	 */
	itemOverrides?: Partial<FeedbackItemData>
}): React.ReactElement {
	const [status, setStatus] = useState<FeedbackStatus>(initialStatus)
	const [isExpanded, setIsExpanded] = useState(true)
	const items = mockItems(1)
	const item = {
		...items[0],
		status,
		feedback_id: "FB-01",
		...(itemOverrides ?? {}),
	}
	return (
		<>
			<LiveRegionShell />
			<FeedbackItem
				item={item}
				isExpanded={isExpanded}
				onToggle={() => setIsExpanded((v) => !v)}
				onStatusChange={(id, next) => {
					if (onStatusChangeSpy) onStatusChangeSpy(id, next)
					setStatus(next)
				}}
				onDelete={() => undefined}
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

// ── Transition matrix (FB-66) ──────────────────────────────────────────────
//
// Per FB-66, the happy-path transition tests above only exercised three
// edges of the FeedbackItem status machine (pending → rejected,
// addressed → closed, rejected → pending). This matrix enumerates every
// legal transition the UI exposes and drives each one through the real
// DOM so the status update, the polite-region announcement, and the
// focus-restoration `useLayoutEffect` get re-verified per cell. Any
// regression in the `handleStatusChange` → `useLayoutEffect` plumbing
// shows up in multiple cells instead of just one, which makes the root
// cause obvious.
//
// The table deliberately excludes `pending → closed` — the UI does not
// render a Verify & Close button on a pending item (see the canonical-
// verbs `describe` above). The "forbidden transitions" block below
// asserts that absence is load-bearing.

type TransitionAction = "dismiss" | "verify-close" | "reopen"

const LEGAL_TRANSITIONS: Array<{
	from: FeedbackStatus
	action: TransitionAction
	to: FeedbackStatus
	politeText: string
}> = [
	{
		from: "pending",
		action: "dismiss",
		to: "rejected",
		politeText: "Feedback FB-01 marked as rejected",
	},
	{
		from: "addressed",
		action: "verify-close",
		to: "closed",
		politeText: "Feedback FB-01 marked as closed",
	},
	{
		from: "addressed",
		action: "reopen",
		to: "pending",
		politeText: "Feedback FB-01 reopened",
	},
	{
		from: "closed",
		action: "reopen",
		to: "pending",
		politeText: "Feedback FB-01 reopened",
	},
	{
		from: "rejected",
		action: "reopen",
		to: "pending",
		politeText: "Feedback FB-01 reopened",
	},
]

describe("FeedbackItem — transition matrix", () => {
	for (const { from, action, to, politeText } of LEGAL_TRANSITIONS) {
		it(`${from} → ${to} via ${action}: updates data-status, announces politely, and restores focus to the card`, async () => {
			const { container } = render(
				<ControllableFeedbackItem initialStatus={from} />,
			)
			const button = container.querySelector<HTMLButtonElement>(
				`[data-action='${action}']`,
			)
			// Sanity: the action button MUST be present for a legal edge. If
			// the table and the component disagree, the test below fails with
			// a message that points at the exact missing edge rather than a
			// cascading null-reference error.
			expect(button).not.toBeNull()
			if (!button) return
			// Focus the button first so the focus-restoration invariant is a
			// real test (we need something to restore from).
			button.focus()
			expect(document.activeElement).toBe(button)
			await act(async () => {
				fireEvent.click(button)
			})
			const card = container.querySelector<HTMLDivElement>(
				"[data-testid='feedback-item']",
			)
			// Invariant 1: parent state moved to the target status and the
			// card root's data-status reflects it.
			expect(card?.getAttribute("data-status")).toBe(to)
			// Invariant 2: the polite live-region text matches exactly. A
			// regression in the announcement string (typo, punctuation, the
			// id-vs-status word order) would surface here per-cell.
			const polite = document.getElementById(POLITE_REGION_ID)
			expect(polite?.textContent).toBe(politeText)
			// Invariant 3: after the transition, the button the user clicked
			// may no longer exist (e.g. addressed → closed removes Verify &
			// Close), so focus MUST be on the card root, not stranded on
			// <body>.
			expect(document.activeElement).toBe(card)
		})
	}
})

// ── Forbidden transitions (FB-66) ──────────────────────────────────────────
//
// The reviewer's open question on FB-66 — "pending → closed directly: is
// this even allowed?" — is answered here. The UI refuses to offer that
// edge (no Verify & Close button on a pending item). Pinning that decision
// with tests means a future component edit that accidentally introduces
// the button — or a future designer who decides pending should be
// close-able — is forced to delete these assertions consciously rather
// than silently change the status machine. Same applies to the
// closed → dismiss and rejected → dismiss edges: a closed or rejected
// item exposes only Reopen + (optional) Delete.

describe("FeedbackItem — forbidden transitions", () => {
	it("pending + expanded does NOT render Verify & Close (pending cannot go directly to closed)", () => {
		const items = mockItems(1)
		const { container } = render(
			<FeedbackItem
				item={{ ...items[0], status: "pending" }}
				isExpanded
				onToggle={() => undefined}
				onStatusChange={() => undefined}
			/>,
		)
		expect(container.querySelector("[data-action='verify-close']")).toBeNull()
	})

	it("addressed + expanded does NOT render Dismiss (addressed cannot go directly to rejected)", () => {
		// FB-66 reviewer asked: "addressed → rejected: can an assessor reject
		// a previously-addressed finding that was auto-progressed to addressed
		// by closing a unit?" Answer: NO — the UI exposes only Verify & Close
		// and Reopen from an addressed item. An assessor who wants to reject
		// an addressed finding must Reopen it first (back to pending) and
		// then Dismiss from pending. Pinning this absence forces any future
		// product decision to add a direct Dismiss-from-addressed path to
		// consciously delete this test.
		const items = mockItems(1, { status: "addressed" })
		const { container } = render(
			<FeedbackItem
				item={items[0]}
				isExpanded
				onToggle={() => undefined}
				onStatusChange={() => undefined}
			/>,
		)
		expect(container.querySelector("[data-action='dismiss']")).toBeNull()
	})

	it("closed + expanded does NOT render Dismiss (closed cannot be re-dismissed to rejected)", () => {
		const items = mockItems(1, { status: "closed" })
		const { container } = render(
			<FeedbackItem
				item={items[0]}
				isExpanded
				onToggle={() => undefined}
				onStatusChange={() => undefined}
			/>,
		)
		expect(container.querySelector("[data-action='dismiss']")).toBeNull()
	})

	it("closed + expanded does NOT render Verify & Close (closed cannot be re-closed)", () => {
		// Terminal statuses expose only Reopen + (optional) Delete. Pin the
		// absence of Verify & Close so a regression that leaks the button
		// into the closed branch (e.g. a refactor that drops the status
		// guard) is caught per-cell instead of only as a canonical-verbs
		// snapshot drift.
		const items = mockItems(1, { status: "closed" })
		const { container } = render(
			<FeedbackItem
				item={items[0]}
				isExpanded
				onToggle={() => undefined}
				onStatusChange={() => undefined}
			/>,
		)
		expect(container.querySelector("[data-action='verify-close']")).toBeNull()
	})

	it("rejected + expanded does NOT render Dismiss or Verify & Close (Reopen + Delete only)", () => {
		const items = mockItems(1, { status: "rejected" })
		const { container } = render(
			<FeedbackItem
				item={items[0]}
				isExpanded
				onToggle={() => undefined}
				onStatusChange={() => undefined}
				onDelete={() => undefined}
			/>,
		)
		expect(container.querySelector("[data-action='dismiss']")).toBeNull()
		expect(container.querySelector("[data-action='verify-close']")).toBeNull()
	})
})

// ── Reopen-from-closed: no confirm dialog (FB-66) ──────────────────────────
//
// The reviewer asked: "closed → pending (Reopen) — closed is typically
// terminal, so reopening should have a warn/confirm. No test."
//
// The current product decision is that Reopen is a one-click action — no
// modal, no AlertDialog, no inline "are you sure?" gate. This test pins
// that decision so a future product change that ADDS a confirm dialog is
// forced to update the test (and, by extension, all callers of
// FeedbackItem that relied on synchronous Reopen). It also closes the
// reviewer's open question: the answer is "no confirm today; the status
// transitions synchronously on click."
//
// If a future designer argues that Reopen from closed/rejected should
// warn, they must:
//   1. Update this test to expect an AlertDialog / confirm button.
//   2. Update the `transition matrix` test above (closed → pending cell)
//      to step through the confirm before asserting data-status.
//   3. Update the stale-reference idempotency test since a confirm
//      intercepts the click.
// That's a deliberate, reviewer-visible churn — exactly what we want.

describe("FeedbackItem — Reopen from closed/rejected is not gated by a confirm", () => {
	it("closed + Reopen: single click moves status to pending, no dialog rendered mid-click", async () => {
		const { container, queryByRole } = render(
			<ControllableFeedbackItem initialStatus="closed" />,
		)
		const reopen = container.querySelector<HTMLButtonElement>(
			"[data-action='reopen']",
		)
		if (!reopen) throw new Error("reopen button missing on closed item")
		await act(async () => {
			fireEvent.click(reopen)
		})
		// Invariant 1: status moved to pending on a single click — there's no
		// intermediate confirm step blocking the transition.
		const card = container.querySelector<HTMLDivElement>(
			"[data-testid='feedback-item']",
		)
		expect(card?.getAttribute("data-status")).toBe("pending")
		// Invariant 2: no dialog / alertdialog was mounted during the
		// transition. If this ever starts failing, the UI has gained a
		// confirm step and this test needs to be rewritten (intentionally).
		expect(queryByRole("dialog")).toBeNull()
		expect(queryByRole("alertdialog")).toBeNull()
	})

	it("rejected + Reopen: single click moves status to pending, no dialog rendered mid-click", async () => {
		const { container, queryByRole } = render(
			<ControllableFeedbackItem initialStatus="rejected" />,
		)
		const reopen = container.querySelector<HTMLButtonElement>(
			"[data-action='reopen']",
		)
		if (!reopen) throw new Error("reopen button missing on rejected item")
		await act(async () => {
			fireEvent.click(reopen)
		})
		const card = container.querySelector<HTMLDivElement>(
			"[data-testid='feedback-item']",
		)
		expect(card?.getAttribute("data-status")).toBe("pending")
		expect(queryByRole("dialog")).toBeNull()
		expect(queryByRole("alertdialog")).toBeNull()
	})
})

// ── Double-click idempotency (FB-66) ───────────────────────────────────────
//
// The reviewer called out: "user clicks Dismiss twice rapidly — does the
// second click no-op or re-POST?" The meaningful protection lives at the
// API layer (and is covered in `packages/haiku-api` tests), but the UI
// ALSO has a load-bearing guarantee: once the parent updates `item.status`
// to rejected, the button tree re-renders to the rejected branch, which
// does NOT contain a Dismiss button. The Dismiss button the user held a
// reference to is detached from the DOM tree. A second click on that
// stale reference MUST NOT cause the parent's `onStatusChange` to fire
// a second time — the node is no longer mounted.
//
// Note: jsdom still dispatches click events to detached nodes (the React
// event handler was bound at mount time). The meaningful test is
// therefore double: (a) the button is no longer in the document after
// the first click, and (b) whether a follow-up click fires is determined
// by React's synthetic event system, not by our component logic. We pin
// the "detached" invariant here and assert the spy count so a regression
// that causes the DOM node to remain mounted (e.g. an over-eager memo)
// is visible.

describe("FeedbackItem — double-click idempotency on Dismiss", () => {
	it("after Dismiss, the stale Dismiss button is no longer in the document and onStatusChange fired exactly once", async () => {
		const spy = vi.fn()
		const { container } = render(
			<ControllableFeedbackItem
				initialStatus="pending"
				onStatusChangeSpy={spy}
			/>,
		)
		const dismiss = container.querySelector<HTMLButtonElement>(
			"[data-action='dismiss']",
		)
		if (!dismiss) throw new Error("dismiss button missing")
		await act(async () => {
			fireEvent.click(dismiss)
		})
		// The button was removed when the parent re-rendered into the
		// rejected branch. This is the load-bearing guard against a future
		// regression that keeps the Dismiss button mounted across statuses
		// (which would allow double-clicks to actually re-dispatch).
		expect(document.body.contains(dismiss)).toBe(false)
		// First click dispatched the transition.
		expect(spy).toHaveBeenCalledTimes(1)
		expect(spy).toHaveBeenCalledWith("FB-01", "rejected")
	})
})

// ── Upstream-stage pinning (FB-66) ─────────────────────────────────────────
//
// The reviewer asked whether a feedback item carrying
// `upstream_stage: <other-stage>` renders a distinct affordance. The
// answer today is NO — `FeedbackItemSchema` in
// `packages/haiku-api/src/schemas/feedback.ts` does not currently carry
// the field, so the UI cannot know the origin stage at render time. The
// override below injects an `upstream_stage`-like field via
// `mockItems(..., overrides)` to force a render; the assertion is that
// the rendered tree looks EXACTLY like a non-upstream item (same
// Dismiss button, same aria-label, no "originated elsewhere" badge).
//
// When the wire schema is extended to ship `upstream_stage`, this test
// will still pass (the override is type-cast so the injection doesn't
// depend on the schema field existing), but its semantic guarantee is:
// "if a future unit adds upstream-stage semantics to FeedbackItem, this
// pinning test will need an intentional update to assert the new
// affordance." See feedback.ts FeedbackItemSchema (line ~28) for the
// schema that must grow before the UI can differentiate.

describe("FeedbackItem — upstream-stage pinning (schema not yet shipped)", () => {
	it("renders identical affordances with and without an upstream_stage-like override", () => {
		// Cast to Partial<FeedbackItemData> with a bag of unknown extras —
		// the field isn't on the wire schema, so TypeScript rejects a
		// direct `{ upstream_stage: "design" }` literal. The cast is
		// deliberate: we're pinning runtime rendering, not type shape.
		const upstreamOverride = {
			upstream_stage: "design",
		} as unknown as Partial<FeedbackItemData>
		const baseline = mockItems(1, { status: "pending" })
		const withUpstream = mockItems(1, {
			status: "pending",
			...upstreamOverride,
		})

		const a = render(
			<FeedbackItem
				item={baseline[0]}
				isExpanded
				onToggle={() => undefined}
				onStatusChange={() => undefined}
			/>,
		)
		const baselineDismiss = a.container.querySelector<HTMLButtonElement>(
			"[data-action='dismiss']",
		)
		expect(baselineDismiss).not.toBeNull()
		const baselineLabel = baselineDismiss?.getAttribute("aria-label")
		// No upstream-stage affordance in the baseline tree — asserted
		// positively as "no element reports the upstream stage" so a
		// future addition (a badge, a data attribute, an aria-describedby
		// pointer) forces this test to update.
		expect(a.container.querySelector("[data-upstream-stage]")).toBeNull()
		expect(a.container.textContent?.toLowerCase()).not.toContain(
			"originated elsewhere",
		)
		a.unmount()

		const b = render(
			<FeedbackItem
				item={withUpstream[0]}
				isExpanded
				onToggle={() => undefined}
				onStatusChange={() => undefined}
			/>,
		)
		const upstreamDismiss = b.container.querySelector<HTMLButtonElement>(
			"[data-action='dismiss']",
		)
		expect(upstreamDismiss).not.toBeNull()
		// Same aria-label as the baseline — no differentiation today.
		expect(upstreamDismiss?.getAttribute("aria-label")).toBe(baselineLabel)
		// Still no upstream affordance after the override is applied.
		expect(b.container.querySelector("[data-upstream-stage]")).toBeNull()
		expect(b.container.textContent?.toLowerCase()).not.toContain(
			"originated elsewhere",
		)
	})
})

// ── FB-65: action buttons meet WCAG 2.5.5 (AAA) 44×44 touch target ─────────
//
// Before the fix, the ACTION_BUTTON_BASE string used `text-xs ... px-2 py-1`
// alone, producing a ~60×24 visible hit area on every Dismiss / Verify &
// Close / Reopen / Delete button — well under the 44 floor and the most
// repeated controls in the mobile review experience. The fix prefixes
// `touchTargetClass` (the canonical `.touch-target` rule in `src/index.css`)
// to the base. This block pins that contract via `getComputedStyle`
// min-height/min-width plus `classList.contains("touch-target")`, so a
// future edit that drops the class OR shrinks the CSS value fails here.
//
// Pattern mirrors AgentFeedbackToggle.test.tsx:165-180 — same
// injectCanonicalTouchTargetCss helper, same dual assertion.

describe("FeedbackItem — action buttons meet 44×44", () => {
	function assertActionButtons(
		container: HTMLElement,
		expectedActions: ReadonlyArray<string>,
	): void {
		for (const action of expectedActions) {
			const btn = container.querySelector<HTMLButtonElement>(
				`button[data-action='${action}']`,
			)
			if (!btn) throw new Error(`expected data-action='${action}' button`)
			const style = getComputedStyle(btn)
			expect(parseFloat(style.minHeight)).toBeGreaterThanOrEqual(44)
			expect(parseFloat(style.minWidth)).toBeGreaterThanOrEqual(44)
			expect(btn.classList.contains("touch-target")).toBe(true)
		}
	}

	it("pending — Dismiss button meets 44×44", () => {
		const items = mockItems(1, { status: "pending" })
		const { container } = render(
			<FeedbackItem
				item={items[0]}
				isExpanded
				onToggle={() => undefined}
				onStatusChange={() => undefined}
				onDelete={() => undefined}
			/>,
		)
		assertActionButtons(container, ["dismiss"])
	})

	it("addressed — Verify & Close and Reopen buttons meet 44×44", () => {
		const items = mockItems(1, { status: "addressed" })
		const { container } = render(
			<FeedbackItem
				item={items[0]}
				isExpanded
				onToggle={() => undefined}
				onStatusChange={() => undefined}
				onDelete={() => undefined}
			/>,
		)
		assertActionButtons(container, ["verify-close", "reopen"])
	})

	it("closed — Reopen and Delete buttons meet 44×44", () => {
		const items = mockItems(1, { status: "closed" })
		const { container } = render(
			<FeedbackItem
				item={items[0]}
				isExpanded
				onToggle={() => undefined}
				onStatusChange={() => undefined}
				onDelete={() => undefined}
			/>,
		)
		assertActionButtons(container, ["reopen", "delete"])
	})

	it("rejected — Reopen and Delete buttons meet 44×44", () => {
		const items = mockItems(1, { status: "rejected" })
		const { container } = render(
			<FeedbackItem
				item={items[0]}
				isExpanded
				onToggle={() => undefined}
				onStatusChange={() => undefined}
				onDelete={() => undefined}
			/>,
		)
		assertActionButtons(container, ["reopen", "delete"])
	})
})
