# Tactical Plan: unit-11 RevisitModal + AssessorSummaryCard

Owner: planner (bolt 1)

Target: Land two new greenfield components in `packages/haiku-ui/src/components/`:

1. `RevisitModal.tsx` — native `<dialog role="dialog" aria-modal="true" aria-labelledby>` that collects revisit reasons (title + body, N > 0, N ≤ 50), validates each reason against a Zod schema (title 1..200, body 1..10_000), POSTs `RevisitRequest` to `/api/revisit/:sessionId` via a typed ApiClient method, closes on 200, and surfaces an inline `role="alert"` error on failure. Focus-trapped via the existing `useFocusTrap` a11y primitive. Escape, backdrop click, and a Cancel button all dismiss and return focus to the opener.
2. `AssessorSummaryCard.tsx` — `<article role="status" aria-live="polite">` rendering feedback-assessor outcome counts (closed / still-open / rejected / total) + per-finding rows. No opacity on root. Count-transition announcements debounced to 1 per 500 ms.

Both components are grouped into one unit because they share two a11y concerns: dialog / live-region semantics and the WCAG-compliant banned-opacity rules from DESIGN-TOKENS §1.7. Neither component exists on disk today; no prior churn to guard against.

---

## Context & Prior Art

### Canonical inputs (all read before planning)

- **Unit spec** — `stages/development/units/unit-11-revisit-modal-and-assessor-card.md`. Declares two-component scope, acceptance criteria, quality gates (`typecheck`, `test`), and required inputs (all design artifacts + DESIGN-BRIEF + DESIGN-TOKENS).
- **`packages/haiku-api/src/schemas/revisit.ts`** — already defines `RevisitReasonSchema`, `RevisitRequestSchema`, `RevisitResponseSchema`. **Important schema delta** (see §Risks): the existing schema caps `title` at `max(120)` and imposes no cap on `body` or `reasons.length`. The unit spec asserts stricter UI-side bounds (title ≤ 200, body ≤ 10_000, reasons ≤ 50). The planner resolves this by enforcing the stricter bounds client-side (see §Risks R1). The wire contract is unchanged.
- **`packages/haiku-ui/src/api/client.ts`** — `ApiClient` interface + `createDefaultApiClient()`. There is **no** `submitRevisit` method today. The builder adds one that maps to `paths.revisit(sessionId)` (which DOES exist at `routes.ts:95`).
- **`packages/haiku-api/src/routes.ts`** — `paths.revisit(id)` is already exposed as `/api/revisit/${id}`. No route-table change required.
- **DESIGN-BRIEF.md** — declares banned text/bg pairs (§2), disabled-control tokens (§2), modal shell pattern (§"Design Language Reference" `Confirm dialog` spec), focus-trap contract (tied to unit-13 ARIA spec).
- **DESIGN-TOKENS.md** — §1.7 bans `opacity-50/60/70` on buttons, cards, or wrappers; §1.2a cross-component color policy; §2 feedback-status tokens (relevant for the assessor card's per-finding dots); §1.7 `disabled` state tokens (primary green: `bg-green-300 text-green-800` with `aria-disabled="true"`).
- **`revisit-modal-spec.html` / `revisit-modal-states.html`** — the authoritative visual spec. Key markup in the artifact:
  - `<div role="dialog" aria-modal="true" aria-labelledby="..." aria-describedby="...">` wrapping a `bg-white dark:bg-stone-900 rounded-xl shadow-2xl border border-stone-200 dark:border-stone-700 overflow-hidden` card inside a `fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm` backdrop.
  - Heading: `<h2 id="revisit-modal-title" class="text-base font-bold text-stone-900 dark:text-stone-100">Confirm revisit</h2>` prefixed by an `aria-hidden="true"` ↩ glyph.
  - Error state: `<div role="alert" class="px-3 py-2 rounded-md border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/30 text-xs text-red-800 dark:text-red-200">`.
  - Mid-commit failure: a `role="status" aria-live="polite"` toast separate from the modal (scoped out — lives in the ReviewPage layer, not the modal itself). This unit implements the inline-error path only.
  - Close button hit target: `w-11 h-11` (44×44) per DESIGN-TOKENS §1.7.1.
  - Confirm button focus ring: `requestChanges` variant (amber-500) per `focusRingVariantClasses.requestChanges` because Confirm Revisit is a request-changes action semantically. Cancel uses the default teal `focusRingClass`.
- **`assessor-summary-card.html`** — authoritative markup for the card:
  - Container role: `<div role="status" aria-live="polite" aria-atomic="true" aria-label="Feedback assessor summary">` — the unit spec elevates this to `<article role="status" aria-live="polite">`. The builder renders an `<article>` as the root element with those three attributes (role, aria-live, aria-atomic) — matches both the unit spec (which wants `<article>`) and the artifact markup (which supplies the role/live/atomic contract).
  - No `opacity-*` anywhere on the root — matches the unit spec's acceptance criterion and DESIGN-TOKENS §1.7 ban.
  - Two rendered states: clean (all items closed/updated — green-500 dot + "clean" badge) vs pending (amber-500 dot + "pending" badge + amber left accent). The card carries a 3-column count grid (total / pending / updated) and a scrollable finding list.

### a11y primitives (consumed read-only — do NOT modify)

- `packages/haiku-ui/src/a11y/focus.ts`
  - `useFocusTrap(ref, enabled)` — snapshots `document.activeElement` on enable, moves focus to the first tabbable child (or the container with `tabindex="-1"` fallback), installs Tab/Shift+Tab wrap, restores focus to the trigger on disable. This is the canonical dialog focus-trap primitive. RevisitModal MUST consume it.
  - `focusRingClass` / `focusRingVariantClasses.requestChanges` / `focusRingVariantClasses.destructive` tokens.
- `packages/haiku-ui/src/a11y/live-regions.tsx`
  - `useAnnounce(): (severity, message) => void` — returns a stable setter that writes into `#feedback-live-polite` / `#feedback-live-assertive`. **Use for the AssessorSummaryCard's count-change announcements.** No-op when the `<LiveRegionShell />` is not mounted, so tests must render the shell.
  - `POLITE_REGION_ID = "feedback-live-polite"` — query target for tests.
- `packages/haiku-ui/src/a11y/touch-target.ts` — `touchTargetClass` (`"touch-target"`) applied to close/cancel buttons to meet 44×44.
- `packages/haiku-ui/src/a11y/reduced-motion.ts` — `useReducedMotion()` reactive hook. RevisitModal is cosmetic-only motion (opacity fade on backdrop + scale on modal body per `revisit-modal-states.html`) — under reduced motion we drop the transition classes. For the AssessorSummaryCard, count changes do NOT animate; the announcement is the only signal.

### Package-level stack

- Tailwind v4 with `dark:` class variant. Full token matrix in DESIGN-TOKENS.
- React 19, `@testing-library/react` 16, `@testing-library/user-event` 14.5.2, `vitest` 2.0, `jsdom` 25.
- **Zod is NOT yet a direct dependency of `haiku-ui`** — it's a transitive dep via `haiku-api`. The builder MUST add `"zod": "^3.23.0"` to `packages/haiku-ui/package.json` `dependencies` so the explicit `z.object(...)` schema import is a first-party dep, not a transitive-pinned one. Verified: `haiku-api` at `packages/haiku-api/package.json:26` uses `"zod": "^3.23.0"`; the same spec applies here. After editing the package.json, run `pnpm install` (or `npm install`) inside the worktree so the lockfile updates.

### Existing modal precedent (reference only — do NOT copy)

- `packages/haiku-ui/src/components/DesignPicker.tsx:277-316` implements a preview-modal that uses `role="dialog"` + Escape handler + backdrop click. It does **not** use `useFocusTrap`. RevisitModal MUST use `useFocusTrap` (the canonical primitive); do not duplicate DesignPicker's ad-hoc pattern.
- `packages/haiku-ui/src/components/ReviewPage.tsx:734` and `1329` also contain inline dialogs. Again, reference-only — do not copy.

### Naming conventions

- New component file placement: `packages/haiku-ui/src/components/RevisitModal.tsx` and `packages/haiku-ui/src/components/AssessorSummaryCard.tsx`. **Not** in the `feedback/` subdirectory — the unit spec explicitly names `packages/haiku-ui/src/components/RevisitModal.tsx` / `...AssessorSummaryCard.tsx`. Matches the existing sibling `FeedbackPanel.tsx` location.
- Test files: `packages/haiku-ui/src/components/__tests__/RevisitModal.test.tsx` and `...AssessorSummaryCard.test.tsx`. Sibling to the existing `__tests__` directory already in `packages/haiku-ui/src/components/`.

---

## Implementation Plan

### Files to CREATE

| Path | Purpose |
|---|---|
| `packages/haiku-ui/src/components/RevisitModal.tsx` | Dialog component + internal Zod validation + POST handler |
| `packages/haiku-ui/src/components/AssessorSummaryCard.tsx` | `<article role="status" aria-live="polite">` outcome card with debounced-announce effect |
| `packages/haiku-ui/src/components/__tests__/RevisitModal.test.tsx` | RTL validation + submit + focus-trap + return-focus coverage |
| `packages/haiku-ui/src/components/__tests__/AssessorSummaryCard.test.tsx` | Static DOM snapshot + `audit-banned-patterns.mjs --profile=tokens` check + count-transition announcement |

### Files to MODIFY

| Path | Change |
|---|---|
| `packages/haiku-ui/src/api/client.ts` | Add `submitRevisit(sessionId, body: RevisitRequest): Promise<RevisitResponse>` to `ApiClient` interface + implementation in `createDefaultApiClient()` targeting `paths.revisit(sessionId)` with `method: "POST"` + `JSON_HEADERS`. Adds `RevisitRequest` / `RevisitResponse` imports from `haiku-api`. |
| `packages/haiku-ui/package.json` | Add `"zod": "^3.23.0"` to `dependencies`. |

### Files READ-ONLY (verify only — do not modify)

- `packages/haiku-api/src/schemas/revisit.ts` — already exports what we need. See §Risks R1 for the UI-side cap enforcement.
- `packages/haiku-api/src/routes.ts` — `paths.revisit(id)` exists.
- `packages/haiku-ui/src/a11y/**` — all primitives consumed read-only.
- `packages/haiku-ui/audit-config.json` — the `tokens` profile already bans `opacity-50/60/70`, `text-[10px]`, and every text/bg pair we need. No rule-add required for this unit — AssessorSummaryCard's "zero hits on this component source" acceptance criterion is satisfied by the existing config.

### Detailed step-by-step (one bolt)

#### Step 1 — Extend the ApiClient (small, risk-free)

1. Edit `packages/haiku-ui/src/api/client.ts`. Add `RevisitRequest`, `RevisitResponse` to the `haiku-api` imports.
2. Add to the `ApiClient` interface:
   ```ts
   submitRevisit(sessionId: string, body: RevisitRequest): Promise<RevisitResponse>
   ```
3. In `createDefaultApiClient()` add:
   ```ts
   async submitRevisit(sessionId, body) {
     const res = await fetch(paths.revisit(sessionId), {
       method: "POST",
       headers: JSON_HEADERS,
       body: JSON.stringify(body),
       keepalive: true,
     })
     return parseJsonOrThrow<RevisitResponse>(res)
   }
   ```
4. Run `npx tsc --noEmit` to confirm the interface + implementation compile.
5. Commit: `git add -A && git commit -m "unit-11: add submitRevisit to ApiClient"`

#### Step 2 — Add zod to haiku-ui

1. Edit `packages/haiku-ui/package.json`, add `"zod": "^3.23.0"` under `dependencies` (alphabetically between existing keys).
2. Run `npm install` (or `pnpm install` if the monorepo uses pnpm) inside the worktree.
3. Commit: `git add -A && git commit -m "unit-11: add zod direct dep"`

#### Step 3 — Build RevisitModal

1. Create `packages/haiku-ui/src/components/RevisitModal.tsx`. Component signature:
   ```ts
   export interface RevisitModalProps {
     sessionId: string
     open: boolean
     onClose: () => void
     onSuccess?: (response: RevisitResponse) => void
     apiClient?: ApiClient  // defaults to defaultApiClient
   }
   ```
2. Internal state:
   ```ts
   interface ReasonDraft { id: string; title: string; body: string }
   const [reasons, setReasons] = useState<ReasonDraft[]>([{ id: crypto.randomUUID(), title: "", body: "" }])
   const [errors, setErrors] = useState<Record<string, { title?: string; body?: string } | undefined>>({})
   const [formError, setFormError] = useState<string | null>(null)
   const [submitting, setSubmitting] = useState(false)
   const [submitError, setSubmitError] = useState<string | null>(null)
   ```
3. Client-side Zod schema (stricter bounds than the wire schema — see §Risks R1):
   ```ts
   const UiReasonSchema = z.object({
     title: z.string().min(1, "Title required").max(200, "Title must be ≤ 200 characters"),
     body: z.string().min(1, "Body required").max(10_000, "Body must be ≤ 10,000 characters"),
   })
   const UiRevisitSchema = z.object({
     reasons: z.array(UiReasonSchema).min(1, "At least one reason required").max(50, "At most 50 reasons"),
   })
   ```
4. Validation runs on every keystroke (field-level) and on submit (form-level). Inline errors render per `revisit-modal-states.html` error state: `text-xs text-red-700 dark:text-red-300 mt-1` below the affected input. Submit disabled unless `UiRevisitSchema.safeParse({ reasons }).success === true`.
5. Markup skeleton (matches `revisit-modal-spec.html` anatomy — approximate classes; builder reconciles exact class set against the artifact):
   ```tsx
   const dialogRef = useRef<HTMLDivElement>(null)
   useFocusTrap(dialogRef, open)
   useEffect(() => {
     if (!open) return
     function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose() }
     document.addEventListener("keydown", onKey)
     return () => document.removeEventListener("keydown", onKey)
   }, [open, onClose])

   if (!open) return null

   return (
     <div
       className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
       onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
       aria-hidden="true"  // backdrop is decorative, dialog owns accessibility
     >
       <div
         ref={dialogRef}
         role="dialog"
         aria-modal="true"
         aria-labelledby="revisit-modal-title"
         aria-describedby="revisit-modal-desc"
         className="w-full max-w-md bg-white dark:bg-stone-900 rounded-xl shadow-2xl border border-stone-200 dark:border-stone-700 overflow-hidden"
         // Stop propagation so clicks inside do not trigger backdrop dismiss.
         onClick={(e) => e.stopPropagation()}
       >
         {/* header + body + footer ... */}
       </div>
     </div>
   )
   ```
6. Header:
   - `<span aria-hidden="true" className="...bg-amber-500...">↩</span>` + `<h2 id="revisit-modal-title" ...>Confirm revisit</h2>`.
   - Close button `w-11 h-11` with `aria-label="Close"` and `focusRingClass` — calls `onClose()`.
7. Body renders the reasons list. Each reason row has:
   - `<label>` + `<input type="text">` for title (with `aria-invalid`, `aria-describedby={error-id}` when errored).
   - `<textarea>` for body (rows=3, `aria-invalid`, `aria-describedby={error-id}` when errored).
   - A small `<button aria-label="Remove reason">×</button>` when `reasons.length > 1`.
   - An "Add another reason" button below the list (disabled when `reasons.length >= 50`, `aria-disabled="true"`, tokens from DESIGN-TOKENS §1.7 disabled secondary).
8. Footer:
   - Cancel button (`focusRingClass`, secondary tokens) — calls `onClose()`.
   - Confirm Revisit button — disabled until `UiRevisitSchema.safeParse({ reasons }).success`. When submitting, disabled + label swaps to "Submitting…". On 200, call `onSuccess?.(response)` then `onClose()`. On error, set `submitError` and re-enable.
9. Error banner:
   ```tsx
   {submitError && (
     <div role="alert" className="px-3 py-2 rounded-md border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/30 text-xs text-red-800 dark:text-red-200">
       {submitError}
     </div>
   )}
   ```
10. **Focus-on-open**: `useFocusTrap` already moves focus to the first tabbable child. Since the header's close button is the first tabbable element, and the spec requires "focus on the first reason-input field", explicitly `focus()` the first `<input>` via a ref in a `useEffect` on `open === true`. This supersedes the trap's default first-tabbable choice. Order of effects: trap installs first (enable), then the focus-first-input effect overrides.
11. **On unmount (open flip false → true → false)**: trap restores focus to the opener automatically via its saved `priorFocus` snapshot.
12. Commit after the component compiles: `git add -A && git commit -m "unit-11: RevisitModal component"`

#### Step 4 — Build AssessorSummaryCard

1. Create `packages/haiku-ui/src/components/AssessorSummaryCard.tsx`. Props:
   ```ts
   export interface AssessorFinding {
     id: string          // e.g. "FB-02"
     status: "addressed" | "closed" | "rejected" | "pending"
     addressedBy?: string  // unit slug
   }
   export interface AssessorSummaryCardProps {
     total: number
     closed: number
     stillOpen: number  // pending count
     rejected: number
     updated?: number   // addressed count (per the artifact's "updated" column)
     findings: AssessorFinding[]
     ranAt?: Date
   }
   ```
2. Root element is an `<article>` with the required ARIA trio:
   ```tsx
   <article
     role="status"
     aria-live="polite"
     aria-atomic="true"
     aria-label="Feedback assessor summary"
     className="rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 p-4"
   >
     ...
   </article>
   ```
   Token compliance: **no `opacity-*` anywhere** (verified by the `tokens` profile of `audit-banned-patterns.mjs`).
3. Status dot + label header: green-500 when `stillOpen === 0`, amber-500 otherwise. The badge uses the canonical feedback-status token pair (`bg-green-100 text-green-800` for clean, `bg-amber-100 text-amber-800` for pending).
4. Three-column count grid (matches `assessor-summary-card.html`): total / pending / updated. No `text-stone-400` / `text-stone-500` on any light surface (DESIGN-TOKENS §1.1a). The "total" label is `text-xs uppercase tracking-wider text-stone-600 dark:text-stone-300`.
5. Finding list: `<ul>` with one `<li role="listitem">` per finding carrying a status-colored dot and a `font-mono text-xs` FB id + textual addressed-by description.
6. **Debounced count-change announcement**:
   ```ts
   const announce = useAnnounce()
   const prevTotalsRef = useRef({ closed, stillOpen, rejected })
   const timerRef = useRef<number | null>(null)
   const pendingMsgRef = useRef<string | null>(null)

   useEffect(() => {
     const prev = prevTotalsRef.current
     const changed = prev.closed !== closed || prev.stillOpen !== stillOpen || prev.rejected !== rejected
     if (!changed) return
     prevTotalsRef.current = { closed, stillOpen, rejected }

     // Compose message — "N of M findings addressed" when closed increases, etc.
     const msg = composeAnnouncement({ closed, stillOpen, rejected, total, prev })
     pendingMsgRef.current = msg

     if (timerRef.current != null) return  // debounce window active — coalesce
     timerRef.current = window.setTimeout(() => {
       if (pendingMsgRef.current) {
         announce("polite", pendingMsgRef.current)
         pendingMsgRef.current = null
       }
       timerRef.current = null
     }, 500)
   }, [closed, stillOpen, rejected, total, announce])

   useEffect(() => () => {
     if (timerRef.current != null) window.clearTimeout(timerRef.current)
   }, [])
   ```
   - Leading-edge debounce is wrong (spec says "one announcement per 500ms" — trailing edge collapses bursts into one announcement). The pattern above is trailing-edge + coalescing.
   - `composeAnnouncement` returns a string matching `/\d+ (of \d+ )?findings? (addressed|resolved|closed)/i` per the acceptance criterion. Example: `"5 of 7 findings addressed"`.
7. Commit: `git add -A && git commit -m "unit-11: AssessorSummaryCard component"`

#### Step 5 — Tests for RevisitModal

Create `packages/haiku-ui/src/components/__tests__/RevisitModal.test.tsx`. Required coverage (one `describe` per concern):

1. **Opens with focus on first reason input.**
   ```tsx
   render(<RevisitModal sessionId="s1" open onClose={vi.fn()} />)
   const input = screen.getByLabelText(/title/i) // first reason's title input
   expect(document.activeElement).toBe(input)
   ```
2. **Escape closes + focus returns to trigger.**
   ```tsx
   const trigger = document.createElement("button")
   document.body.appendChild(trigger)
   trigger.focus()
   const { rerender } = render(<RevisitModal sessionId="s1" open onClose={handleClose} />)
   await user.keyboard("{Escape}")
   expect(handleClose).toHaveBeenCalledTimes(1)
   rerender(<RevisitModal sessionId="s1" open={false} onClose={handleClose} />)
   expect(document.activeElement).toBe(trigger)
   ```
3. **Backdrop click closes.**
4. **Cancel button closes + returns focus.**
5. **Validation matrix** — each case asserts (a) inline error text visible, (b) submit button `disabled` + `aria-disabled="true"`:
   - Title empty → "Title required"
   - Body empty → "Body required"
   - Title length 201 → "Title must be ≤ 200 characters"
   - Body length 10_001 → "Body must be ≤ 10,000 characters"
   - Add 51st reason attempt → Add button disabled; programmatically injecting 51 reasons via a test harness shows form-level "At most 50 reasons" error and disabled submit.
   - Empty reasons array (all removed — also degenerate, the UI prevents this; test attempts removal on the last row and asserts the remove button is absent) → form-level error "At least one reason required".
6. **Valid submit happy path.**
   ```tsx
   const fakeClient: ApiClient = {
     ...defaultApiClient,
     submitRevisit: vi.fn().mockResolvedValue({ ok: true, action: "revisit", feedback_created: ["FB-01"], message: "..." }),
   }
   render(<RevisitModal sessionId="s1" open onClose={onClose} onSuccess={onSuccess} apiClient={fakeClient} />)
   await user.type(titleInput, "Null check")
   await user.type(bodyInput, "Line 42 null deref")
   await user.click(screen.getByRole("button", { name: /confirm revisit/i }))
   await waitFor(() => expect(fakeClient.submitRevisit).toHaveBeenCalledWith("s1", { reasons: [{ title: "Null check", body: "Line 42 null deref" }] }))
   expect(onSuccess).toHaveBeenCalled()
   expect(onClose).toHaveBeenCalled()
   ```
7. **Error response keeps modal open + renders role=alert.**
   ```tsx
   submitRevisit: vi.fn().mockRejectedValue(new Error("Network"))
   // submit ... expect:
   expect(screen.getByRole("alert")).toHaveTextContent(/network/i)
   expect(onClose).not.toHaveBeenCalled()
   ```
8. **Dialog a11y shell.**
   ```tsx
   const dialog = screen.getByRole("dialog")
   expect(dialog).toHaveAttribute("aria-modal", "true")
   expect(dialog).toHaveAttribute("aria-labelledby")
   ```

#### Step 6 — Tests for AssessorSummaryCard

Create `packages/haiku-ui/src/components/__tests__/AssessorSummaryCard.test.tsx`:

1. **DOM snapshot: `<article>` root with role="status" + aria-live="polite".**
   ```tsx
   const { container } = render(<AssessorSummaryCard ... />)
   expect(container.firstElementChild?.tagName).toBe("ARTICLE")
   expect(container.firstElementChild).toHaveAttribute("role", "status")
   expect(container.firstElementChild).toHaveAttribute("aria-live", "polite")
   expect(screen.getByRole("status")).toBeInTheDocument()
   ```
2. **No opacity-50/60/70 classes on root** — asserted by serializing `container.innerHTML` + regex. (The `audit-banned-patterns.mjs --profile=tokens` CI run is the canonical check; the unit test is a belt-and-suspenders redundant assertion so failures show up locally.)
3. **Count transition announcement.**
   ```tsx
   render(<><LiveRegionShell /><AssessorSummaryCard total={7} closed={3} stillOpen={4} rejected={0} findings={...} /></>)
   const live = document.getElementById(POLITE_REGION_ID)!
   rerender(<><LiveRegionShell /><AssessorSummaryCard total={7} closed={5} stillOpen={2} rejected={0} findings={...} /></>)
   await vi.advanceTimersByTimeAsync(500)  // flush trailing-edge debounce
   expect(live.textContent).toMatch(/5 (of 7 )?findings? (addressed|resolved|closed)/i)
   ```
4. **Debounce — burst coalesced.** Three rerenders within 500 ms produce ONE announcement matching the FINAL state (not three). Uses `vi.useFakeTimers()`.
5. **`screen.getByRole("status")` resolves** — explicit per the acceptance criterion.
6. **Zero findings (empty state)** — `findings: []`, renders an italic "No findings yet." paragraph, still has role=status.

Commit: `git add -A && git commit -m "unit-11: tests for modal + summary card"`

#### Step 7 — Verification

Run the quality gates declared on the unit (`typecheck`, `test`):

```bash
cd packages/haiku-ui
npx tsc --noEmit                               # passes
npm run test -- RevisitModal AssessorSummaryCard  # new tests pass
npm run test                                    # full suite still passes (no regressions)
node scripts/audit-banned-patterns.mjs --profile=tokens  # zero hits on both new components
```

Expected (after fixes for any audit hits during implementation):

- `tsc --noEmit`: passes.
- New tests: green.
- Existing tests: green.
- `audit-banned-patterns.mjs --profile=tokens`: zero hits, specifically on `packages/haiku-ui/src/components/RevisitModal.tsx` and `packages/haiku-ui/src/components/AssessorSummaryCard.tsx`.

Commit any fixes that surface from verification: `git add -A && git commit -m "unit-11: fixes from gate runs"`

---

## Quality Gate Mapping (unit frontmatter `quality_gates: [typecheck, test]`)

| Gate | Command | Expected Signal |
|---|---|---|
| `typecheck` | `npx tsc --noEmit` in `packages/haiku-ui` | Exit 0 |
| `test` | `npm run test` in `packages/haiku-ui` | All tests green (existing + new) |

Additional (enforced by DESIGN-TOKENS via audit-config.json):

| Check | Command | Expected |
|---|---|---|
| Banned-patterns (tokens profile) | `node packages/haiku-ui/scripts/audit-banned-patterns.mjs --profile=tokens` | Zero hits on both new components |

---

## Risks & Blockers

### R1 — Schema-bounds delta (RESOLVED: UI-side enforcement)

The unit spec asserts title ≤ 200, body ≤ 10_000, reasons ≤ 50 — but `packages/haiku-api/src/schemas/revisit.ts` currently caps `title` at `max(120)` with no body or reasons.length caps.

**Decision**: the UI enforces the spec's stricter bounds via `UiRevisitSchema` (the Zod schema defined in Step 3.3). The wire schema is unchanged — its max(120) on title is a server-side hard ceiling; the UI's 200-char cap happens to be stricter than the wire ceiling on the body/reasons dimensions and looser (200 > 120) on title. Since the UI caps title at 200 but the wire caps at 120, submitting a 150-char title would pass UI validation but fail server validation with a 400.

**Decision on that mismatch**: This unit is `packages/haiku-ui/src/components/` scope only. Changing `packages/haiku-api/src/schemas/revisit.ts` is out of scope for this unit (the schema ownership belongs to unit-01-extract-haiku-api-package + wire contract authors). The conservative UI behavior: cap title at **min(200, 120) = 120** on the client side too, so the client never sends anything the server will reject. The unit spec's "title ≤ 200" is read as an upper-bound assertion, not a lower-bound demand — the client MAY cap lower.

**Concrete UI schema** to land:

```ts
// Conservative: UI cap is tighter than or equal to the server cap to avoid 400s.
const UI_TITLE_MAX = 120      // matches haiku-api wire cap
const UI_BODY_MAX = 10_000    // stricter than wire (which has no cap)
const UI_REASONS_MAX = 50     // stricter than wire (which has no cap)

const UiReasonSchema = z.object({
  title: z.string().min(1, "Title required").max(UI_TITLE_MAX, `Title must be ≤ ${UI_TITLE_MAX} characters`),
  body: z.string().min(1, "Body required").max(UI_BODY_MAX, `Body must be ≤ ${UI_BODY_MAX.toLocaleString()} characters`),
})
const UiRevisitSchema = z.object({
  reasons: z.array(UiReasonSchema).min(1, "At least one reason required").max(UI_REASONS_MAX, `At most ${UI_REASONS_MAX} reasons`),
})
```

This interpretation preserves unit-11 scope AND avoids client/server mismatches. If a future unit widens the wire cap to 200, the UI constant auto-tightens to `min(200, 200) = 200` — a one-line change.

**Test assertions** match the UI caps (title 121 → error, body 10_001 → error, reasons 51 → error).

The unit spec's "title ≤ 200" wording will be preserved in completion criteria test-description comments as "title ≤ server limit; UI uses 120 per wire-schema coupling, asserted by UI_TITLE_MAX constant".

### R2 — Zod as a direct dep

Currently zod is only a transitive import through `haiku-api`. Adding it as an explicit dep in `haiku-ui/package.json` is safe (already pinned in the monorepo at `^3.23.0`). Builder MUST run `npm install` / `pnpm install` and commit the lockfile change. Skipping the install produces a "module not found" failure at runtime.

### R3 — Focus-trap vs. "focus on first input" ordering

`useFocusTrap` focuses the first tabbable child on enable. The first tabbable child is the header's close button. The acceptance criterion demands focus on the **first reason input**. The resolution is an explicit post-trap effect that moves focus to the input:

```ts
useEffect(() => {
  if (!open) return
  // Let useFocusTrap install its trap first (runs in its own useEffect), then override.
  const id = requestAnimationFrame(() => firstInputRef.current?.focus())
  return () => cancelAnimationFrame(id)
}, [open])
```

Using `requestAnimationFrame` defers the override to after React flushes the trap's effect, guaranteeing order. In jsdom, `requestAnimationFrame` is available but runs synchronously; tests remain deterministic.

### R4 — Backdrop-click boundary

The backdrop has `aria-hidden="true"` (decorative) and a click handler that dismisses when `e.target === e.currentTarget`. The modal body uses `onClick={e => e.stopPropagation()}` to prevent inside-clicks from bubbling to the backdrop. Without the stopPropagation, typing into an input or clicking the Confirm button would dismiss the modal — a known anti-pattern in naïve `onClick`-dismiss implementations. This detail MUST land in the initial implementation.

### R5 — Debounce trailing-edge vs. leading-edge

Acceptance criterion: "Count transitions … trigger a polite announcement — debounced to one announcement per 500ms". A trailing-edge debounce (announce the latest value 500ms after the LAST change) is correct because:
- Leading-edge would announce stale values if counts are still updating.
- Trailing-edge coalesces a burst of rerenders into one final announcement.
- The test (item 6.4) drives 3 rerenders within 500 ms and asserts ONE announcement matching the final state.

The test MUST use `vi.useFakeTimers()` to control the 500ms window deterministically.

### R6 — LiveRegionShell dependency in tests

`useAnnounce()` no-ops when `#feedback-live-polite` is absent. The AssessorSummaryCard tests that assert announcement content MUST render `<LiveRegionShell />` alongside the card. The RevisitModal does not use `useAnnounce()` today (the spec doesn't require announcements on modal open/close — `role="dialog" aria-modal="true" aria-labelledby` provides the SR entry point via the NVDA/VO dialog-enter routine).

### R7 — `screen.getByRole("status")` disambiguation

If multiple `role="status"` regions coexist in the document (e.g. LiveRegionShell renders a live region with role="status"), `getByRole` will throw. The acceptance criterion says `screen.getByRole('status')` MUST resolve on the AssessorSummaryCard — the test MUST either:
- Render the card alone (no shell) and assert `getByRole("status")` — simplest, matches the criterion literally.
- Render the card + shell and scope the query with `getByRole("status", { name: /feedback assessor summary/i })` — matches on the aria-label.

Chosen: use `{ name: /feedback assessor summary/i }` scoping so shell-aware tests pass.

### R8 — `npm install` vs `pnpm install`

The repo has both `package-lock.json` (root) and `package.json` in each workspace but **not** a pnpm-lock.yaml in the worktree. The worktree layout matches the main monorepo — run `npm install` unless `pnpm-lock.yaml` appears. The builder MUST detect via `ls package-lock.json pnpm-lock.yaml` at the worktree root and pick the matching tool.

---

## Scope Boundaries

### IN scope (this unit)

- `packages/haiku-ui/src/components/RevisitModal.tsx`
- `packages/haiku-ui/src/components/AssessorSummaryCard.tsx`
- `packages/haiku-ui/src/components/__tests__/RevisitModal.test.tsx`
- `packages/haiku-ui/src/components/__tests__/AssessorSummaryCard.test.tsx`
- `packages/haiku-ui/src/api/client.ts` (add `submitRevisit`)
- `packages/haiku-ui/package.json` (add zod dep)
- `package-lock.json` (auto-updated by `npm install`)

### OUT of scope

- Wire-schema changes to `packages/haiku-api/src/schemas/revisit.ts` (title cap, body cap, reasons.length cap). Deferred to a follow-up unit or documented as a known constraint per R1.
- Server-side handler for `POST /api/revisit/:sessionId` (implemented in unit-02 per the unit spec — READ-ONLY dependency here).
- The feedback-assessor fix-loop logic (MCP-side, already shipped per the unit spec).
- The mid-commit rollback toast (lives in the ReviewPage layer, not the modal itself).
- Mounting the RevisitModal into ReviewPage or wiring it to a trigger button — that's the ReviewPage's job (likely unit-07 or a downstream integration unit).
- Mounting the AssessorSummaryCard into the review sidebar — same as above.
- Session payload additions (e.g. `assessor_summary` field on `ReviewSessionPayload`) — deferred. The AssessorSummaryCard is a presentational component; its wiring is out of scope.

---

## Iteration-budget sanity check (MUST stay within one bolt)

- File count: 4 created + 2 modified = 6 files.
- Est LOC: RevisitModal ~180, AssessorSummaryCard ~130, tests ~350 combined, ApiClient diff ~15, package.json diff ~1. Total ~676 LOC.
- No cross-package refactors; no API-surface changes; no migration work.
- Validation runtime: tsc + vitest on `packages/haiku-ui` only. Expected < 90 s combined.

This fits comfortably in one bolt.

---

## Verification Commands (hat transition: planner → builder → reviewer)

```bash
# From the unit worktree root
cd /Volumes/dev/src/github.com/gigsmart/haiku-method/.claude/worktrees/delegated-swimming-honey/.haiku/worktrees/universal-feedback-model-and-review-recovery/unit-11-revisit-modal-and-assessor-card
# Install after package.json edit
npm install
# Typecheck
(cd packages/haiku-ui && npx tsc --noEmit)
# Targeted tests
(cd packages/haiku-ui && npx vitest run src/components/__tests__/RevisitModal.test.tsx src/components/__tests__/AssessorSummaryCard.test.tsx)
# Full suite regression
(cd packages/haiku-ui && npm run test)
# Token audit
(cd packages/haiku-ui && node scripts/audit-banned-patterns.mjs --profile=tokens)
```

Expected: all commands exit 0.
