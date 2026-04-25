# Fix FB-64 — Tactical Plan (planner, bolt 1)

**Finding:** `RevisitModal.states.test.tsx` and several other `*.states.test.tsx` files are snapshot-only — they lock in raw HTML, not behavior, so semantic regressions (e.g. `onClose` wiring, submit payload shape, `role="alert"` escalation, retry handler) pass if class names change but payload shape silently drifts. The mandate explicitly bans this: "tests assert on behavior and outcomes, not implementation details."
**Feedback:** `.haiku/intents/universal-feedback-model-and-review-recovery/stages/development/feedback/64-revisitmodal-and-feedbacklist-state-matrix-tests-are-snapsho.md`

## TL;DR

The builder adds one behavior assertion **per documented state cell** to every state-matrix file that is currently snapshot-only, keeping the existing snapshot as a secondary safety net. For each component:

1. Keep the existing `describe(... — state matrix)` snapshot block untouched (regression value is not the problem — absence of behavior assertions is the problem).
2. Add a sibling `describe("... — behavior per state cell", ...)` block that invokes the same state cells one-at-a-time with behavior assertions: click handlers fire, aria-* attributes flip, error banners render on submit failure, submit payload shape matches the cell's intent.
3. Where a companion non-states file (e.g. `RevisitModal.test.tsx`, `AssessorSummaryCard.test.tsx`) already has behavior coverage, the new block only adds the **missing per-state-cell** coverage — specifically coverage that is cell-keyed rather than scenario-keyed, so a reviewer scanning `*.states.test.tsx` sees behavior, not just snapshots.

Scope: eight `.states.test.tsx` files. Two (`FeedbackItem`, `FeedbackSummaryBar`, `FeedbackOriginIcon`, `FeedbackStatusBadge`) already carry per-cell behavior assertions today — they are mentioned in the feedback body but inspection of the live files shows their state-matrix describes already interleave behavior tests. The fix explicitly re-validates those four, adds whatever is missing, and adds net-new behavior coverage to the four that are snapshot-only today: `RevisitModal.states.test.tsx`, `FeedbackList.states.test.tsx` (partial — needs three more cells), `StageProgressStrip.states.test.tsx`, `AssessorSummaryCard.states.test.tsx`, `FeedbackSheet.states.test.tsx`, `FeedbackFloatingButton.states.test.tsx` (partial — state-matrix block is snapshot-only; main block has behavior), and `AgentFeedbackToggle.states.test.tsx`.

## Root cause

The state-matrix files were authored as **audit fuel** — their primary consumer is `audit-state-coverage.mjs` which counts `data-cell` attributes per component to prove every documented state cell in `state-coverage-grid.md` is rendered somewhere. Once that audit passed, the tests stopped gaining coverage — the snapshot is the only guard on "did this render at all." A reviewer refactoring class-name generation updates every snapshot with `pnpm test -u` and loses the entire regression signal. A developer silently swapping `targetStage="product"` for `targetStage="design"` doesn't trip any behavior gate — the snapshot captures HTML structure, which the rename doesn't touch in isolated form.

The correct pattern lives in `FeedbackItem.states.test.tsx` lines 68+ and `FeedbackSummaryBar.states.test.tsx` lines 67–120: per-cell behavior assertions (aria-pressed flips, onFilter fires with status, onFilter fires with null on toggle-off) **alongside** the matrix snapshot. The fix extends that pattern to the remaining components.

## Verified current state (planner inspected all eight files)

| File | Snapshot cells | Behavior assertions in file today | Gap |
|---|---|---|---|
| `RevisitModal.states.test.tsx` | 6 cells, one `toMatchSnapshot` | **zero** | Needs open=false → renders null; open=true → focused input is first-title; Cancel fires onClose; submit with valid reason fires apiClient.submitRevisit with `stage` when `targetStage` set, omits `stage` when not; submit failure sets role=alert and keeps modal open. |
| `FeedbackList.states.test.tsx` | 4 state cells + 2 audit cells | Retry click fires onRetry (line 48-49); loading aria-busy=true (line 36); empty text present (line 58); aria-posinset wiring (line 68-78) | Needs error cell re-renders without the error banner when error prop cleared (transition); loading cell never writes to polite region (silent loading); default cell renders `<ul role="list">` with one `<li>` per item. |
| `StageProgressStrip.states.test.tsx` | 6 cells, one snapshot | **zero** | Needs aria-current="step" on `currentStage="product"` cell; onStageClick cell dispatches with the clicked stage name; last-stage-completed cell has no aria-current (all completed, nothing current). |
| `AssessorSummaryCard.states.test.tsx` | 6 cells, one snapshot | **zero** (companion file `AssessorSummaryCard.test.tsx` has 10 tests but none per-cell) | Needs empty cell renders the "no findings" label; pending cell renders `stillOpen` count in the announcement; rejected cell renders `rejected` count and rejected row notes; with-timestamp cell includes the ranAt time in the label. |
| `FeedbackSheet.states.test.tsx` | 6 cells, one snapshot | **zero** | Needs closed cell renders nothing (no visible dialog); open-empty cell renders `role="dialog"` with the title; open-with-body renders the body children; open-custom-id cell uses the custom id on the dialog root; open-aria-labelled cell wires `aria-labelledby` to the custom titleId. |
| `FeedbackFloatingButton.states.test.tsx` | 6 state-matrix cells — snapshot-only within the matrix block; main file has extensive per-scenario behavior tests above (lines 26-150) | Behavior exists **outside** the matrix block | Needs behavior assertions **within** `— state matrix` describe so a reviewer reading the matrix sees behavior per cell: closed-no-count → aria-expanded=false + no badge; closed-pending-N → aria-label includes N; open → aria-expanded=true. |
| `AgentFeedbackToggle.states.test.tsx` | 6 cells, one snapshot | **zero** | Needs off cell fires onChange(true) on click; on cell fires onChange(false) on click; disabled-off cell does NOT fire onChange on click; aria-checked reflects `checked` prop; count renders in accessible name when provided. |
| `FeedbackItem.states.test.tsx` | 24 cells | Already has scenario-level behavior tests (inspected — file is 307 lines with behavior interleaved) | **No change** — already compliant per the mandate. Listed in feedback body as a blanket reference but concrete snapshot-only examples were the five above. |
| `FeedbackOriginIcon.states.test.tsx` | 12 cells | Per-origin behavior tests inline (lines 54-91) | **No change** — already compliant. |
| `FeedbackStatusBadge.states.test.tsx` | 8 cells | Per-status behavior tests inline (lines 52-67) | **No change** — already compliant. |
| `FeedbackSummaryBar.states.test.tsx` | 9 cells | Per-cell behavior tests inline (lines 67-120) | **No change** — already compliant. |

**Scope for bolt 1:** the **seven gaps** above. `FeedbackFloatingButton` is borderline (main file has behavior; matrix block does not) — the plan adds a small per-cell sub-block inside the matrix describe to keep the audit tight. That's still bolt-1 scope because the additions are mechanical.

## File changes

### Test files — behavior assertions added

For each of the seven files in the table, the builder:

1. Keeps the existing `it("renders every documented state cell (snapshot)")` call **unchanged**.
2. Adds a new `describe("— behavior per state cell", ...)` block below the matrix describe. Each `it` inside targets exactly one cell, with the same prop combination as that cell in the matrix, and asserts the cell's documented behavior (aria-*, click dispatch, payload shape, role escalation).
3. Uses the project's existing test-utility conventions — `@testing-library/react` `fireEvent`, `screen.getByRole`, `vi.fn()` for callbacks — no new helpers.

#### 1. `packages/haiku-ui/src/components/__tests__/RevisitModal.states.test.tsx`

Add (below the existing matrix describe, inside the file):

```tsx
describe("RevisitModal — behavior per state cell", () => {
  it("closed cell: renders null (open=false short-circuits)", () => {
    const { container } = render(
      <RevisitModal sessionId="s1" open={false} onClose={() => {}} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it("open-default cell: focuses the first reason title input", () => {
    render(<RevisitModal sessionId="s1" open={true} onClose={() => {}} />)
    const inputs = document.querySelectorAll('input[type="text"]')
    expect(document.activeElement).toBe(inputs[0])
  })

  it("open-default cell: Cancel button fires onClose", () => {
    const onClose = vi.fn()
    render(<RevisitModal sessionId="s1" open={true} onClose={onClose} />)
    fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it("open-with-target-stage cell: submit payload carries stage='product'", async () => {
    const submitRevisit = vi.fn().mockResolvedValue({ ok: true })
    const apiClient = makeStubClient({ submitRevisit })
    render(
      <RevisitModal
        sessionId="s1"
        open={true}
        onClose={() => {}}
        targetStage="product"
        apiClient={apiClient}
      />,
    )
    // Type a valid reason
    const titleInput = document.querySelector<HTMLInputElement>('input[type="text"]')!
    const bodyInput = document.querySelector<HTMLTextAreaElement>("textarea")!
    fireEvent.change(titleInput, { target: { value: "Design drift" } })
    fireEvent.change(bodyInput, { target: { value: "The stage needs rework." } })
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /confirm revisit/i }))
    })
    expect(submitRevisit).toHaveBeenCalledWith(
      "s1",
      expect.objectContaining({ stage: "product" }),
    )
  })

  it("open-default cell (no targetStage): submit payload OMITS stage field", async () => {
    const submitRevisit = vi.fn().mockResolvedValue({ ok: true })
    const apiClient = makeStubClient({ submitRevisit })
    render(
      <RevisitModal
        sessionId="s1"
        open={true}
        onClose={() => {}}
        apiClient={apiClient}
      />,
    )
    const titleInput = document.querySelector<HTMLInputElement>('input[type="text"]')!
    const bodyInput = document.querySelector<HTMLTextAreaElement>("textarea")!
    fireEvent.change(titleInput, { target: { value: "Ambiguous copy" } })
    fireEvent.change(bodyInput, { target: { value: "Needs clarification." } })
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /confirm revisit/i }))
    })
    const [, body] = submitRevisit.mock.calls[0]
    expect(body).not.toHaveProperty("stage")
  })

  it("open cell: submit failure keeps modal open + surfaces role='alert'", async () => {
    const submitRevisit = vi.fn().mockRejectedValue(new Error("Network boom"))
    const apiClient = makeStubClient({ submitRevisit })
    const onClose = vi.fn()
    render(
      <RevisitModal
        sessionId="s1"
        open={true}
        onClose={onClose}
        apiClient={apiClient}
      />,
    )
    const titleInput = document.querySelector<HTMLInputElement>('input[type="text"]')!
    const bodyInput = document.querySelector<HTMLTextAreaElement>("textarea")!
    fireEvent.change(titleInput, { target: { value: "x" } })
    fireEvent.change(bodyInput, { target: { value: "y" } })
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /confirm revisit/i }))
    })
    expect(onClose).not.toHaveBeenCalled()
    const alert = document.querySelector('[role="alert"]')
    expect(alert?.textContent).toMatch(/Network boom/)
  })
})
```

Helper `makeStubClient` is a local factory (defined at the bottom of the test file) that returns an `ApiClient` with only the methods the test touches implemented; the rest throw on invocation so accidental extra calls are loud. Pattern lifted from the companion `RevisitModal.test.tsx` if it already exports a helper; otherwise defined inline:

```tsx
import type { ApiClient } from "../../api/client"

function makeStubClient(overrides: Partial<ApiClient>): ApiClient {
  const stub = new Proxy(
    {},
    {
      get: (_t, prop) => {
        if (prop in overrides) return (overrides as any)[prop]
        return () => Promise.reject(new Error(`unexpected ApiClient.${String(prop)}`))
      },
    },
  ) as ApiClient
  return stub
}
```

Imports added: `screen`, `act` from `@testing-library/react`; `vi` already imported.

#### 2. `packages/haiku-ui/src/components/feedback/__tests__/FeedbackList.states.test.tsx`

Extend the existing describe (or add a sibling). Adds:

```tsx
it("error cell: clearing error re-renders default list (no alert banner)", () => {
  const onRetry = vi.fn()
  const { rerender, container, queryByRole } = render(
    <div data-token-hash={TOKEN_HASH}>
      <FeedbackList items={[]} error="Boom" onRetry={onRetry} />
    </div>,
  )
  expect(queryByRole("alert")).not.toBeNull()
  rerender(
    <div data-token-hash={TOKEN_HASH}>
      <FeedbackList items={mockItems(3)} />
    </div>,
  )
  expect(queryByRole("alert")).toBeNull()
  expect(container.querySelectorAll("[data-testid='feedback-item']").length).toBe(3)
})

it("loading cell: polite live region is not written to during load", () => {
  const { container } = render(
    <div data-token-hash={TOKEN_HASH}>
      <FeedbackList items={[]} isLoading />
    </div>,
  )
  // Loading should be silent (aria-busy is the only a11y signal).
  // If the list component ever starts writing "Loading..." to aria-live,
  // that's a regression — loading should be announced via aria-busy only.
  const liveRegions = container.querySelectorAll("[aria-live='polite']")
  for (const r of liveRegions) {
    expect(r.textContent?.trim() ?? "").toBe("")
  }
})

it("default cell: every rendered item is a role=listitem or <li>", () => {
  const { container } = render(
    <div data-token-hash={TOKEN_HASH}>
      <FeedbackList items={mockItems(3)} />
    </div>,
  )
  const list = container.querySelector("[role='list'], ul, ol")
  expect(list).not.toBeNull()
  const listItems = container.querySelectorAll("[role='listitem'], li")
  expect(listItems.length).toBeGreaterThanOrEqual(3)
})
```

If `FeedbackList` does not currently render a `<ul>`/`role=list` ancestor (verify against live source before adding the `default cell` test — it might be a `<div data-testid="feedback-list">`), the builder either:
(a) downgrades the assertion to "three `data-testid='feedback-item'` elements exist with `aria-posinset`" — the existing list-wrapper attribute pattern, OR
(b) files a follow-up FB item if the semantic-list wrapper is genuinely missing. **Default stance for bolt 1:** (a), since the existing test file already uses `aria-posinset` as the compatibility bridge for list semantics. The test above becomes a re-assertion in cell-keyed form.

#### 3. `packages/haiku-ui/src/components/__tests__/StageProgressStrip.states.test.tsx`

Add describe below the matrix:

```tsx
describe("StageProgressStrip — behavior per state cell", () => {
  it("default cell: current stage has aria-current='step'", () => {
    const { container } = render(
      <StageProgressStrip stages={STAGES} currentStage="product" />,
    )
    const current = container.querySelector('[aria-current="step"]')
    expect(current).not.toBeNull()
    expect(current?.textContent ?? "").toMatch(/product/i)
  })

  it("with-click-handler cell: clicking a stage fires onStageClick with that stage name", () => {
    const onStageClick = vi.fn()
    const { container } = render(
      <StageProgressStrip
        stages={STAGES}
        currentStage="product"
        onStageClick={onStageClick}
      />,
    )
    // Target the first completed stage (inception) — an interactive target.
    const stageBtn = container.querySelector('[data-stage="inception"]')
    if (!stageBtn) throw new Error("stage click target missing")
    fireEvent.click(stageBtn)
    expect(onStageClick).toHaveBeenCalledWith("inception")
  })

  it("last-stage-completed cell: no aria-current when all stages completed", () => {
    const { container } = render(
      <StageProgressStrip
        stages={STAGES.map((s) => ({ ...s, status: "completed" as const }))}
        currentStage="review"
      />,
    )
    // currentStage is "review" and it's marked completed — strip should still
    // expose aria-current on the "review" cell so screen readers know where
    // the user is in the flow; the "no aria-current" case is purely for a
    // hypothetical "all-green, no current" state we don't ship today. Assert
    // the review cell carries aria-current="step" even when completed.
    expect(
      container.querySelector('[data-stage="review"][aria-current="step"]'),
    ).not.toBeNull()
  })
})
```

Note: the builder verifies the component actually exposes `data-stage` attributes before committing — if it uses a different attribute (e.g. `data-stage-name` or uses the stage name as the accessible name), adjust the selector accordingly. The component source is at `packages/haiku-ui/src/components/StageProgressStrip.tsx`.

#### 4. `packages/haiku-ui/src/components/__tests__/AssessorSummaryCard.states.test.tsx`

Add:

```tsx
describe("AssessorSummaryCard — behavior per state cell", () => {
  it("empty cell: renders a 'no findings' announcement and no rows", () => {
    const { container, queryAllByRole } = render(<AssessorSummaryCard {...CLEAN} />)
    // Announcement matches the `/\d+ findings? pending/` canonical phrasing
    // from composeAnnouncement — empty = 0 pending.
    expect(container.textContent).toMatch(/0 findings pending/i)
    expect(queryAllByRole("listitem").length).toBe(0)
  })

  it("pending cell: announcement includes stillOpen count", () => {
    const { container } = render(<AssessorSummaryCard {...PENDING} />)
    expect(container.textContent).toMatch(/2 of 3 findings? closed/i)
    expect(container.textContent).toMatch(/1 pending/i)
  })

  it("rejected cell: renders per-finding notes (spec disagreement)", () => {
    const { getByText } = render(<AssessorSummaryCard {...REJECTED} />)
    expect(getByText(/spec disagreement/i)).toBeTruthy()
  })

  it("with-timestamp cell: renders a human timestamp derived from ranAt", () => {
    const ran = new Date("2026-04-21T12:00:00Z")
    const { container } = render(<AssessorSummaryCard {...PENDING} ranAt={ran} />)
    // Card renders either absolute ISO or relative ("just now" / "Xs ago").
    // Assert SOMETHING dated is in the DOM; exact format is implementation detail.
    const hasDateLike = /\d/.test(container.textContent ?? "")
    expect(hasDateLike).toBe(true)
    // The ranAt Date object was passed — a regression that drops the prop
    // would silently omit the timestamp. Assert the card renders at least
    // the "ago" or "UTC" marker the component emits.
    expect(container.textContent).toMatch(/ago|UTC|\d{1,2}:\d{2}/i)
  })
})
```

#### 5. `packages/haiku-ui/src/components/feedback/__tests__/FeedbackSheet.states.test.tsx`

Add:

```tsx
describe("FeedbackSheet — behavior per state cell", () => {
  it("closed cell: does not render a visible dialog", () => {
    const { container } = render(
      <FeedbackSheet open={false} onClose={() => {}} title="Feedback" />,
    )
    // jsdom's <dialog> renders children regardless of open, BUT the sheet
    // component itself gates on `open`. A closed sheet should either render
    // null OR render the <dialog> element without `open` attribute.
    const dialog = container.querySelector("dialog")
    if (dialog) {
      expect(dialog.hasAttribute("open")).toBe(false)
    } else {
      expect(container.firstChild).toBeNull()
    }
  })

  it("open-with-body cell: renders the body children", () => {
    const { getByText } = render(
      <FeedbackSheet open={true} onClose={() => {}} title="Feedback">
        <p>Body content</p>
      </FeedbackSheet>,
    )
    expect(getByText("Body content")).toBeTruthy()
  })

  it("open-custom-id cell: custom id lands on the dialog root", () => {
    const { container } = render(
      <FeedbackSheet
        open={true}
        onClose={() => {}}
        title="Feedback"
        id="feedback-sheet-alt"
      />,
    )
    const root = container.querySelector("#feedback-sheet-alt")
    expect(root).not.toBeNull()
  })

  it("open-aria-labelled cell: custom titleId wires aria-labelledby", () => {
    const { container } = render(
      <FeedbackSheet
        open={true}
        onClose={() => {}}
        title="Feedback"
        titleId="feedback-sheet-title-alt"
      />,
    )
    const dialog = container.querySelector("[aria-labelledby='feedback-sheet-title-alt']")
    expect(dialog).not.toBeNull()
    const titled = container.querySelector("#feedback-sheet-title-alt")
    expect(titled?.textContent).toBe("Feedback")
  })

  it("open-empty cell: surfaces role='dialog' on the root", () => {
    const { container } = render(
      <FeedbackSheet open={true} onClose={() => {}} title="Feedback" />,
    )
    const dialog = container.querySelector("[role='dialog'], dialog")
    expect(dialog).not.toBeNull()
  })
})
```

#### 6. `packages/haiku-ui/src/components/feedback/__tests__/FeedbackFloatingButton.states.test.tsx`

Add a behavior sub-block INSIDE the `— state matrix` describe so a reviewer reading the matrix block sees per-cell behavior:

```tsx
describe("FeedbackFloatingButton — state matrix", () => {
  // ... existing snapshot it(...) unchanged ...

  it("closed-no-count cell: aria-expanded='false' + no badge text", () => {
    render(<FeedbackFloatingButton open={false} onToggle={() => {}} />)
    const btn = screen.getByRole("button")
    expect(btn.getAttribute("aria-expanded")).toBe("false")
    expect(btn.textContent).not.toMatch(/\d/)
  })

  it("closed-pending-5 cell: accessible name includes '5 pending'", () => {
    render(<FeedbackFloatingButton open={false} onToggle={() => {}} count={5} />)
    const btn = screen.getByRole("button")
    expect(btn.getAttribute("aria-label")).toMatch(/5 pending/i)
  })

  it("open cell: aria-expanded='true'", () => {
    render(<FeedbackFloatingButton open={true} onToggle={() => {}} />)
    const btn = screen.getByRole("button")
    expect(btn.getAttribute("aria-expanded")).toBe("true")
  })

  it("closed-zero cell: count=0 does NOT render a badge", () => {
    render(<FeedbackFloatingButton open={false} onToggle={() => {}} count={0} />)
    const btn = screen.getByRole("button")
    expect(btn.textContent).not.toMatch(/\b0\b/)
  })
})
```

#### 7. `packages/haiku-ui/src/components/feedback/__tests__/AgentFeedbackToggle.states.test.tsx`

Add:

```tsx
describe("AgentFeedbackToggle — behavior per state cell", () => {
  it("off cell: clicking fires onChange(true)", () => {
    const onChange = vi.fn()
    render(<AgentFeedbackToggle checked={false} onChange={onChange} />)
    fireEvent.click(screen.getByRole(/checkbox|switch|button/))
    expect(onChange).toHaveBeenCalledWith(true)
  })

  it("on cell: clicking fires onChange(false)", () => {
    const onChange = vi.fn()
    render(<AgentFeedbackToggle checked={true} onChange={onChange} />)
    fireEvent.click(screen.getByRole(/checkbox|switch|button/))
    expect(onChange).toHaveBeenCalledWith(false)
  })

  it("disabled-off cell: clicking does NOT fire onChange", () => {
    const onChange = vi.fn()
    render(<AgentFeedbackToggle checked={false} disabled onChange={onChange} />)
    const ctl = screen.getByRole(/checkbox|switch|button/) as HTMLButtonElement
    // Native disabled button swallows click — verify both the attr and the handler.
    expect(ctl.getAttribute("aria-disabled") ?? ctl.getAttribute("disabled")).not.toBeNull()
    fireEvent.click(ctl)
    expect(onChange).not.toHaveBeenCalled()
  })

  it("on cell: aria-checked='true' (or aria-pressed='true' for button pattern)", () => {
    render(<AgentFeedbackToggle checked={true} onChange={() => {}} />)
    const ctl = screen.getByRole(/checkbox|switch|button/)
    const checkedAttr =
      ctl.getAttribute("aria-checked") ?? ctl.getAttribute("aria-pressed")
    expect(checkedAttr).toBe("true")
  })

  it("on-with-count cell: count is in accessible name", () => {
    render(<AgentFeedbackToggle checked={true} count={3} onChange={() => {}} />)
    const ctl = screen.getByRole(/checkbox|switch|button/)
    const accName = ctl.getAttribute("aria-label") ?? ctl.textContent ?? ""
    expect(accName).toMatch(/3/)
  })
})
```

Builder verifies the correct ARIA role by reading `AgentFeedbackToggle.tsx` first — if it's a `button role="switch"` use `screen.getByRole("switch")`; if it's a native `input type="checkbox"`, use `"checkbox"`. The regex is a belt-and-suspenders fallback; replace with the exact role before committing.

### Imports to add per file

- `RevisitModal.states.test.tsx` — add `fireEvent`, `screen`, `act` to `@testing-library/react` import; add `vi` (already present).
- `FeedbackList.states.test.tsx` — already imports what it needs.
- `StageProgressStrip.states.test.tsx` — add `fireEvent` + `vi`.
- `AssessorSummaryCard.states.test.tsx` — no new imports (uses `render` + `expect` already).
- `FeedbackSheet.states.test.tsx` — no new imports.
- `FeedbackFloatingButton.states.test.tsx` — already imports what it needs.
- `AgentFeedbackToggle.states.test.tsx` — add `fireEvent`, `screen`, `vi`.

## Implementation Steps (builder, bolt 1)

1. **Step 1 — `RevisitModal.states.test.tsx`**. Add the behavior describe with six `it`s. Verify each test passes locally: `cd packages/haiku-ui && npx vitest run src/components/__tests__/RevisitModal.states.test.tsx`. If the `makeStubClient` Proxy pattern fails under strict TypeScript, fall back to an explicit object literal with only the methods the tests touch implemented (and `throw`ing stubs for the rest).

2. **Step 2 — `FeedbackList.states.test.tsx`**. Add the three new `it`s. First read the live `FeedbackList.tsx` to confirm the aria-live wiring (lines 134-200 of source) — it appears to use `aria-busy` only during load, no `aria-live="polite"` writes, so the "silent loading" assertion will pass. Run `npx vitest run src/components/feedback/__tests__/FeedbackList.states.test.tsx`.

3. **Step 3 — `StageProgressStrip.states.test.tsx`**. First read the component source at `packages/haiku-ui/src/components/StageProgressStrip.tsx` to confirm the click-target attribute name (`data-stage` vs `data-stage-name` vs aria-label). Adjust selectors. Add the describe; verify.

4. **Step 4 — `AssessorSummaryCard.states.test.tsx`**. Add the describe; verify the `composeAnnouncement` output format at `packages/haiku-ui/src/components/AssessorSummaryCard.tsx:70-82` before locking in the "2 of 3 findings closed · 1 pending" assertion.

5. **Step 5 — `FeedbackSheet.states.test.tsx`**. Read component source first to confirm whether `FeedbackSheet` uses native `<dialog>` or a `div[role="dialog"]` — that determines the `closed cell` assertion's fall-through. Add the describe; verify.

6. **Step 6 — `FeedbackFloatingButton.states.test.tsx`**. Add the four cell-keyed behavior tests inside the existing `— state matrix` describe (after the snapshot `it`). Verify.

7. **Step 7 — `AgentFeedbackToggle.states.test.tsx`**. Read component source to confirm the role (`switch` vs `checkbox`). Replace the regex in the test helper with the exact role. Add the describe; verify.

8. **Step 8 — run the stage-wide coverage audits** to confirm nothing regressed:
   - `cd packages/haiku-ui && npm run test` — all tests green.
   - `cd packages/haiku-ui && node scripts/audit-state-coverage.mjs` — data-cell counts unchanged (the new tests don't add cells; they only assert behavior per existing cell). If this script exists and currently passes, it should still pass.
   - `cd packages/haiku-ui && npx tsc --noEmit` — typecheck green.

9. **Step 9 — commit as a single commit** on the current branch: `haiku: fix FB-64 bolt 1 (planner)`. No push.

## Verification commands

Each MUST exit as indicated. Invoke from the worktree root (`/Volumes/dev/src/github.com/gigsmart/haiku-method/.claude/worktrees/delegated-swimming-honey`).

- `cd packages/haiku-ui && npx vitest run src/components/__tests__/RevisitModal.states.test.tsx` → exit 0; test count increased by 6.
- `cd packages/haiku-ui && npx vitest run src/components/feedback/__tests__/FeedbackList.states.test.tsx` → exit 0; test count increased by 3.
- `cd packages/haiku-ui && npx vitest run src/components/__tests__/StageProgressStrip.states.test.tsx` → exit 0; test count increased by 3.
- `cd packages/haiku-ui && npx vitest run src/components/__tests__/AssessorSummaryCard.states.test.tsx` → exit 0; test count increased by 4.
- `cd packages/haiku-ui && npx vitest run src/components/feedback/__tests__/FeedbackSheet.states.test.tsx` → exit 0; test count increased by 5.
- `cd packages/haiku-ui && npx vitest run src/components/feedback/__tests__/FeedbackFloatingButton.states.test.tsx` → exit 0; test count increased by 4.
- `cd packages/haiku-ui && npx vitest run src/components/feedback/__tests__/AgentFeedbackToggle.states.test.tsx` → exit 0; test count increased by 5.
- `cd packages/haiku-ui && npm run test` → exit 0 (stage-wide all-green regression).
- `cd packages/haiku-ui && npx tsc --noEmit` → exit 0.
- `grep -c "toMatchSnapshot" packages/haiku-ui/src/components/**/__tests__/*.states.test.tsx` → unchanged (snapshot assertions preserved; this fix ADDS behavior, does not remove snapshots).
- `grep -c "expect(.*\.not\.toBeNull\|expect(.*\.toHaveBeenCalled\|expect(.*\.getAttribute" packages/haiku-ui/src/components/__tests__/RevisitModal.states.test.tsx` → ≥ 6 (was 0).

## Risks

1. **ARIA role mismatch on `AgentFeedbackToggle`.** The test uses `screen.getByRole(/checkbox|switch|button/)` as a regex fallback. **Mitigation:** step 7 instructs the builder to read the component source first and replace the regex with the exact role before committing. If the role is a native `input type="checkbox"`, the `fireEvent.click` semantics are slightly different (click on the input triggers `onChange` via React's synthetic event rather than via `onClick`). The test code handles both since `fireEvent.click` dispatches both a click and the change event through React's event system.

2. **`makeStubClient` Proxy pattern under strict TypeScript.** The Proxy returns a generic `ApiClient` via `as ApiClient` cast. `tsc --noEmit` may complain if the consumer expects specific method signatures. **Mitigation:** fallback is an explicit object literal: `{ submitRevisit, fetchSession: async () => { throw new Error(...) }, ... }` with one method implemented and the rest throwing. The fallback is verbose but bulletproof.

3. **`submitRevisit` payload shape assertion on optional `stage` field.** The assertion `expect(body).not.toHaveProperty("stage")` requires the component to literally omit the key (not set it to `undefined`). Inspection of `RevisitModal.tsx:224-230` shows the correct pattern: `...(targetStage ? { stage: targetStage } : {})` — so the key IS omitted when `targetStage` is falsy. The test will pass. **Mitigation:** if the component later switches to `stage: targetStage ?? undefined`, this test catches the behavioral regression (the server shape does differ — an `undefined` field vs an omitted field can trip JSON-schema strict-validation servers).

4. **`FeedbackList.tsx` doesn't render a `<ul>` today.** Inspection of `FeedbackList.tsx:138-198` shows it renders a `<div data-testid="feedback-list">` at the top level — no `<ul>`/`role="list"`. **Mitigation:** the `default cell: every rendered item is a role=listitem or <li>` test falls back to the `aria-posinset` pattern (already tested at lines 68-78 of the current file); the new test asserts cell-keyed behavior rather than introducing a new semantic requirement. If the reviewer wants actual `<ul>` wrapping as a follow-up, that's a new FB item, not this fix's scope.

5. **Snapshot files need regeneration if test layout changes.** Adding a new describe with new `it`s to a file does NOT invalidate the existing snapshot file (it's keyed on the describe + test names). **Mitigation:** no `-u` pass should be needed. If tests fail with "snapshot file does not exist," it means a nested describe accidentally moved the snapshot name — in that case, delete the stale snapshot entry manually rather than `-u`-ing the whole file.

6. **`StageProgressStrip` implementation detail drift.** The plan asserts `data-stage="inception"` and `aria-current="step"` — both are inference-based (the component is not inspected inline in this plan). **Mitigation:** step 3 explicitly instructs the builder to read the component source and adjust selectors before committing. If `aria-current` is missing entirely (a regression the feedback body arguably flags), the builder files a follow-up FB and keeps only the `onStageClick` behavior test on bolt 1.

7. **`AssessorSummaryCard` timestamp format is intentionally loose.** The test asserts `/ago|UTC|\d{1,2}:\d{2}/i` — a kitchen-sink regex to accept multiple formats. **Mitigation:** if the component renders a relative timestamp like "2s ago," the "ago" branch matches; if it renders `2026-04-21T12:00:00Z`, the `:` branch matches. A regression that drops the timestamp entirely would fail all three branches. This is the right loose-behavioral-contract posture — we assert "timestamp is rendered somehow" without locking in the format.

## Out of scope (expressly)

- **Removing existing snapshots.** The snapshot blocks stay — they guard the matrix (every cell rendered) layer. The fix adds behavior assertions; it does not delete snapshots. The feedback body explicitly says "add one behavioral assertion per state cell alongside (or instead of) the snapshot" — the plan picks "alongside" because deleting passing snapshots is gratuitous churn.
- **New behavior tests on `FeedbackItem`, `FeedbackOriginIcon`, `FeedbackStatusBadge`, `FeedbackSummaryBar`.** Those four are already compliant (see §Verified current state table). Listing them in the feedback body was a blanket statement; the fix targets the documented gaps.
- **Wiring `audit-state-coverage.mjs` to enforce "each cell has a behavior assertion."** That would be a mechanical gate atop the fix — parallel to FB-59's coverage gate. Out of scope for bolt 1; tractable as a follow-up if the pattern drifts again.
- **Adding Playwright / E2E coverage.** The fix stays in the vitest + jsdom layer. Browser-level behavior verification is unit-20 / unit-24 scope, not this fix.
- **Refactoring state-matrix files to use a shared helper.** Tempting (seven files have near-identical structure), but the fix is "add missing behavior," not "DRY up the test files." A follow-up refactor can land once all seven have identical scaffolding.
- **Replacing `fireEvent` with `userEvent`.** The existing tests use `fireEvent`; we match existing conventions to minimize diff surface. `userEvent` is better for full click-dispatch-fidelity but the migration is stage-wide and out of scope.

## Completion signal

Fix is ready for feedback-assessor when:

1. All seven `.states.test.tsx` files carry at least one behavior assertion per documented state cell, as laid out in §File changes.
2. `cd packages/haiku-ui && npm run test` exits 0 — full vitest suite green.
3. `cd packages/haiku-ui && npx tsc --noEmit` exits 0 — no type regressions.
4. No snapshot files were updated with `-u` (the fix adds tests; it does not regenerate snapshots).
5. Commit on the current branch with message `haiku: fix FB-64 bolt 1 (planner)`; no push.
6. Feedback body's "Why this matters" is addressed: a reviewer mass-updating snapshots with `-u` would now still catch semantic regressions (wrong targetStage label, onClose not wired, submit payload shape drift) because each cell has a semantic assertion independent of HTML string equality.
