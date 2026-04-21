# Tactical Plan: unit-13 Annotation Canvas UX

Owner: planner (bolt 1)

Target: Land a new, greenfield `AnnotationCanvas.tsx` at `packages/haiku-ui/src/pages/review/AnnotationCanvas.tsx` implementing the non-modal pin-drop + popover UX described in the unit spec, plus the regression guards for the `tabindex="-1"` pin-markers class of bug and the draft-data-loss class of bug. The unit also adds the `anchor` field to `haiku-api`'s `FeedbackCreateRequest` schema (the unit spec claims unit-01 added it; it did not — see Risk R1) and ships verification test coverage for every acceptance criterion in the unit spec.

The existing `packages/haiku-ui/src/components/AnnotationCanvas.tsx` is a legacy raster-image pin/pen tool consumed by `ReviewPage.tsx` (the 1400-LOC legacy leaf). It is NOT the file this unit edits. We keep it intact (deprecated-by-convention) and implement the new canvas at `pages/review/AnnotationCanvas.tsx` alongside the other stage-scoped review surface (`ArtifactsPane.tsx`, `FeedbackSidebar.tsx`, `FooterBar.tsx`, `ReviewPage.tsx`). The new component is greenfield — no churn-guard is required against the legacy file.

---

## Context & Prior Art

### Canonical inputs (all read before planning)

- **Unit spec** — `stages/development/units/unit-13-annotation-canvas.md`. Declares non-modal popover semantics (`role="group"` + `aria-labelledby` + `aria-label="Annotation draft"` — NOT `role="dialog"`), the single-delegated-listener requirement, pin markers as `<button tabindex="0">`, draft persistence with a 500 ms debounce and 64 KB cap, XSS hardening via audit-banned-patterns, and the perf budget (200 pins, 100 ms first paint, 16 ms/keypress).
- **DESIGN-TOKENS.md** — §1.7 bans `opacity-50/60/70` and `disabled:opacity-*`; §1.7.1 requires 44×44 touch targets (pin-hit pattern); §2 feedback-status tokens (none directly used — annotation draft submits as pending); pin focus-ring uses `focus-visible:outline-teal-500` outline offset 3px (from `annotation-popover-states.html` lines 82).
- **DESIGN-BRIEF.md** (unit-13 stakeholder) — section "Annotation creation" codifies the popover shell (`w-72` / 288 px, teal-300 border, rounded-xl, shadow-2xl) and the verb set (Cancel / Create for the draft popover).
- **`stages/design/artifacts/annotation-popover-states.html`** — authoritative visual states. Pin CSS (lines 56–84 of the artifact) defines the `.pin` element with explicit `::before` hit-area expansion to 44×44, focus ring `outline 2px solid rgb(20 184 166) outline-offset: 3px` on `:focus-visible`. Ghost-pin pattern (lines 86–100) for the placeholder marker at the click site. Popover markup uses `role="dialog"` in the static HTML — the **unit spec overrides this to `role="group"`** because the real app must not focus-trap / block interaction with the artifact behind (the static HTML treats the popover as a full-page demo). Plan follows the unit spec.
- **`stages/design/artifacts/annotation-gesture-spec.html`** — gesture matrix. For raster-image artifacts the creation gesture is "click anywhere on the image wrapper" captured as `{ x, y } ∈ [0,1]`. The page also enumerates keyboard activation (`C` in the legacy spec, elevated to `N` in the unit spec per a renamed shortcut-map entry — see R3 below). Reduced-motion guards are already in the HTML (lines 42–46 drop `animate-pop-in` to `animation: none`).
- **`packages/haiku-api/src/schemas/feedback.ts`** — `FeedbackCreateRequestSchema`. Today: `title`, `body`, `origin`, `source_ref`. **Missing: `anchor` block** (see R1). The unit spec's line 66 explicitly requires the draft-form validation to include `anchor: { pageId, x, y, viewportWidth, viewportHeight }`. The planner resolves this by extending the schema in this unit (the claim that unit-01 added it is incorrect — `git log` shows unit-01's commit `f22bda30` shipped the schema without the anchor block, and `DATA-CONTRACTS.md` only describes the intent).
- **`packages/haiku-ui/src/a11y/keyboard.ts`** — `useShortcut` hook with scope-based conflict detection via `KeyboardShortcutConflict`. The hook enforces the single shared `document.keydown` listener (`handleDocumentKeydown`) and ref-counts. Key `"c"` is already registered for "Create annotation at focused artifact / line" at registry line 139-146 (scope `"global"`). **The unit spec calls the key `N`** — a standalone per-scope binding at `annotation-canvas` scope; no conflict with the `"global"` scope's `c`. The registry entry documents the canonical shortcut; the unit spec's `N` is the scope-internal binding for "new annotation" (the spec's own words). We bind `N` at scope `annotation-canvas` for the new-pin shortcut and leave the global `c` binding alone.
- **`packages/haiku-ui/src/a11y/live-regions.tsx`** — `useAnnounce(): (severity, message) => void` — two `role="status"` / `role="alert"` regions mounted at the shell. Used for the oversize-draft warning and quota-exceeded announcement.
- **`packages/haiku-ui/src/a11y/reduced-motion.ts`** — `useReducedMotion()` reactive hook. Popover entrance animation (`animate-pop-in`) drops to `animation: none` under reduced motion (the static HTML already has this guard; we mirror it in the component CSS class).
- **`packages/haiku-ui/audit-config.json`** — the `tokens` profile already bans `opacity-50/60/70`, `text-[9/10]px`, `text-gray-*`, `text-stone-400` (light-only), `disabled:opacity-*`, `focus:ring-1`. **The `stage-wide` profile extends `tokens`.** This unit adds **two new rules**: (a) `banned-pin-tabindex-negative` catching `tabindex=["']-1["']` in `pages/review/AnnotationCanvas.tsx` (regression guard per unit spec line 64), and (b) XSS sinks in the annotation path (`dangerouslySetInnerHTML`, `innerHTML\s*=`, `\beval\(`, `new Function\(`, `document\.write\(`) scoped to `packages/haiku-ui/src/pages/review/**/*.{ts,tsx}`. Both rules are added to the `stage-wide` profile (unit spec explicitly cites the stage-wide profile for the XSS grep at line 87, and the tabindex rule is scoped to a single component so adding it to the superset is the cheapest path). The existing `banned-origin-jsx-bare` and `banned-agent-feedback-toggle-copy` rules in `stage-wide` stay put.
- **`packages/haiku-ui/tests/audit-banned-patterns.test.ts`** — existing vitest harness for the audit script. Works by spawning `audit-banned-patterns.mjs` per profile via `execFileSync` and asserting exit 0 + `0 banned hits`. Two new tests will be appended: one for the new profile hits count, one for the `tabindex="-1"` + XSS rules returning 0 hits after the component lands.
- **Existing `packages/haiku-ui/src/components/AnnotationCanvas.tsx`** — legacy raster/pen component. READ-ONLY for this unit. Kept in place — removing it would bleed into `ReviewPage.tsx` (the 1400-LOC monolith that is NOT touched by this unit per the scope language of unit-07's tactical plan §14). The new `pages/review/AnnotationCanvas.tsx` is additive; callers switch over in a later unit.

### a11y primitives (consumed read-only — do NOT modify)

- `packages/haiku-ui/src/a11y/focus.ts` — `focusRingClass` tokens (used on Cancel/Create buttons inside the popover).
- `packages/haiku-ui/src/a11y/keyboard.ts` — `useShortcut(key, handler, { scope, guard, allowInInput })`.
- `packages/haiku-ui/src/a11y/live-regions.tsx` — `useAnnounce()` returning the stable `(severity, message) => void` setter.
- `packages/haiku-ui/src/a11y/reduced-motion.ts` — `useReducedMotion()`.
- `packages/haiku-ui/src/a11y/touch-target.ts` — not required (pin hit-area expansion is CSS-level; no `touch-target` utility class needed because pins use the `.pin-hit::before` pattern from the artifact).

### Package-level stack

- React 19, `@testing-library/react` 16, `@testing-library/user-event` 14.5.2, `vitest` 2.0 (fake timers via `vi.useFakeTimers()`), `jsdom` 25. Zod already a first-party dep.
- **Playwright is banned on this repo** (see commit `28e66e4c`). The unit spec's "Playwright perf test at `packages/haiku-ui/tests/annotation-perf.spec.ts`" is translated to a **vitest perf test at the same path** that renders the component inside `jsdom`, measures first-paint proxy (`performance.now()` bracketing the initial `render()` call plus one `act()` flush) and keystroke-to-paint (`performance.now()` bracketing one `fireEvent.keyDown(..., { key: "ArrowRight" })` + `act()` flush), with the 100 ms / 16 ms budgets applied to the jsdom timings. This is a pragmatic substitute — the unit spec's Playwright budget is about detecting regressions, not real-browser paint timing; the jsdom timings regress in lockstep because the same React render path executes. See R4.

### Naming conventions

- New component file: `packages/haiku-ui/src/pages/review/AnnotationCanvas.tsx`. Sibling to `ArtifactsPane.tsx`, `FeedbackSidebar.tsx`, `FooterBar.tsx`, `ReviewPage.tsx`. Matches the unit spec line 62 path exactly.
- Test files:
  - `packages/haiku-ui/src/pages/review/__tests__/AnnotationCanvas.test.tsx` — RTL coverage for popover semantics, keyboard nav, draft persistence, XSS rendering, focus return.
  - `packages/haiku-ui/tests/annotation-perf.spec.ts` — perf budget test (vitest, not Playwright).
  - Append two assertions to `packages/haiku-ui/tests/audit-banned-patterns.test.ts` for the new rules.
- localStorage key format: `haiku-ui:annotation-draft:{sessionId}` — literal prefix `haiku-ui:annotation-draft:` + the `sessionId` string.

---

## Implementation Plan

### Files to CREATE

| Path | Purpose |
|---|---|
| `packages/haiku-ui/src/pages/review/AnnotationCanvas.tsx` | New non-modal pin-drop + popover component. Single delegated pointer + keydown listener. Pin markers as `<button tabindex="0">`. Draft debounce + localStorage persistence + schema re-validation + oversize drop-oldest + quota-exceeded announcement. |
| `packages/haiku-ui/src/pages/review/__tests__/AnnotationCanvas.test.tsx` | RTL tests for popover role/label, keyboard nav (N/Arrow/Escape/Enter), draft debounce (fake timers), oversize drop, reload survival, schema discard of invalid JSON, quota announce, focus return, listener count ≤ 3. |
| `packages/haiku-ui/tests/annotation-perf.spec.ts` | vitest perf test: mount 200 fixture pins, assert first-render `performance.now()` delta ≤ 100 ms, 200-iteration ArrowRight loop with per-iter delta ≤ 16 ms. |

### Files to MODIFY

| Path | Change |
|---|---|
| `packages/haiku-api/src/schemas/feedback.ts` | Add `FeedbackAnchorSchema` + attach `anchor: FeedbackAnchorSchema.optional()` to `FeedbackCreateRequestSchema`. Fields: `pageId: z.string().min(1).max(200)`, `x: z.number().min(0).max(1)`, `y: z.number().min(0).max(1)`, `viewportWidth: z.number().int().positive().max(10000)`, `viewportHeight: z.number().int().positive().max(10000)`. Export `FeedbackAnchor` type alias. |
| `packages/haiku-api/src/index.ts` | Re-export `FeedbackAnchorSchema` / `FeedbackAnchor` alongside the existing feedback exports. |
| `packages/haiku-api/src/openapi.ts` | None (the OpenAPI emitter walks the exported Zod schemas automatically — verify by running `npm --prefix packages/haiku-api run build` or the emit script if present; if the emitter needs a manual entry, add the type to the schema registry there — see R2 for the verification step). |
| `packages/haiku-ui/audit-config.json` | Append two rules to the `stage-wide` profile (NOT to `tokens`): `banned-pin-tabindex-negative` (pattern `tabindex=["']-1["']`, scope `packages/haiku-ui/src/pages/review/AnnotationCanvas.tsx`) and `banned-xss-sinks-annotation-path` (pattern `(dangerouslySetInnerHTML\|innerHTML\\s*=\|\\beval\\(\|new Function\\(\|document\\.write\\()`, scope `packages/haiku-ui/src/pages/review/**/*.{ts,tsx}`). Keep excludes for `__tests__` / `__snapshots__` / `*.{test,spec}.{ts,tsx}`. |
| `packages/haiku-ui/tests/audit-banned-patterns.test.ts` | Add one assertion inside the existing `stage-wide` test block: `expect(stdout).toMatch(/banned-pin-tabindex-negative.*OK/)` and `expect(stdout).toMatch(/banned-xss-sinks-annotation-path.*OK/)`. No new `describe` — extend the existing block. |

### Files READ-ONLY (verify only — do not modify)

- `packages/haiku-ui/src/components/AnnotationCanvas.tsx` — legacy, not touched. Kept because `ReviewPage.tsx` still consumes it.
- `packages/haiku-ui/src/a11y/**` — all primitives consumed read-only.
- `packages/haiku-ui/src/pages/review/ReviewPage.tsx` / `ArtifactsPane.tsx` — not wired to the new canvas in this unit (unit-15 stage-wide audit can do the switchover if desired; unit-13 scope stops at the component).
- `.haiku/intents/universal-feedback-model-and-review-recovery/stages/design/artifacts/annotation-popover-states.html` / `annotation-gesture-spec.html` — visual source of truth.

### Detailed step-by-step (one bolt)

#### Step 1 — Extend the `haiku-api` feedback schema with `anchor` (small, blocking for §2)

1. Edit `packages/haiku-api/src/schemas/feedback.ts`. Add:
   ```ts
   export const FeedbackAnchorSchema = z
     .object({
       pageId: z.string().min(1).max(200),
       x: z.number().min(0).max(1),
       y: z.number().min(0).max(1),
       viewportWidth: z.number().int().positive().max(10000),
       viewportHeight: z.number().int().positive().max(10000),
     })
     .describe("Pin anchor metadata for visual annotations")
   export type FeedbackAnchor = z.infer<typeof FeedbackAnchorSchema>
   ```
2. Attach to `FeedbackCreateRequestSchema`:
   ```ts
   export const FeedbackCreateRequestSchema = z
     .object({
       title: z.string().min(1).max(120),
       body: z.string().min(1),
       origin: FeedbackOriginSchema.optional().default("user-visual"),
       source_ref: z.string().nullable().optional(),
       anchor: FeedbackAnchorSchema.optional(),
     })
     .describe("POST /api/feedback/:intent/:stage request body")
   ```
3. Edit `packages/haiku-api/src/index.ts` to add `FeedbackAnchorSchema` and `FeedbackAnchor` to the re-export block.
4. Run `npm --prefix packages/haiku-api run build` (10-minute timeout) to confirm the package compiles and the OpenAPI emission doesn't choke on the new optional field. If the emitter needs a manual registration, add `FeedbackAnchorSchema` alongside the other schemas in `openapi.ts` (the existing pattern will be visible once the file is opened).
5. **Do NOT modify the MCP runtime side** (`packages/haiku/src/http.ts` `FeedbackCreateSchema`) in this unit. The anchor field is OPTIONAL on the wire, so the server-side accepts-or-drops-silently is a sufficient contract for the UI work. A follow-up unit wires the server side; this is explicitly out of the unit-13 scope (which names only UI files and the `haiku-api` schema).

#### Step 2 — Scaffold `AnnotationCanvas.tsx` (pin state + popover semantics)

1. Create `packages/haiku-ui/src/pages/review/AnnotationCanvas.tsx`. Exports a default `AnnotationCanvas` component and a named `AnnotationPin` type (compatible shape with the legacy component's exported type for callers who want to share — but the legacy type lives in `components/AnnotationCanvas.tsx` and is NOT the same module, so the new one exports a fresh `AnnotationDraftPin` alias to avoid name-collision confusion):
   ```ts
   export interface AnnotationDraftPin {
     id: string
     x: number           // 0..1 — fraction of viewport width
     y: number           // 0..1 — fraction of viewport height
     pageId: string      // artifact page identifier
     viewportWidth: number
     viewportHeight: number
     title: string
     body: string
     // Outbox state: "draft" before first submit, "pending" once POSTed.
     state: "draft" | "pending"
   }
   ```
2. Component props:
   ```ts
   interface AnnotationCanvasProps {
     sessionId: string
     pageId: string
     onSubmit: (draft: FeedbackCreateRequest) => Promise<void>
     // Child render-prop renders the underlying artifact; the canvas overlays on top.
     children: React.ReactNode
   }
   ```
3. State (all via `useState` + `useRef` — no context, no Redux):
   - `pins: AnnotationDraftPin[]` — the current pin collection (primary state).
   - `activePin: string | null` — the pin whose popover is open.
   - `focusedPin: string | null` — the pin currently holding keyboard focus (separate from `activePin` because focus travels via ArrowKeys without opening the popover).
   - `draftBody: string` — the body textarea value inside the popover.
   - `draftTitle: string` — the title input value inside the popover.
4. Container root: `<div ref={rootRef} className="relative" role="application" aria-label="Annotation canvas">`. The `role="application"` is deliberate and matches the gesture-spec (the canvas owns its own keyboard semantics; screen readers announce individual pin buttons as they receive focus).

#### Step 3 — Single delegated pointer listener + single delegated keydown listener

1. Attach **one** `onPointerDown` handler to `rootRef.current` via a `useEffect` that adds/removes a single listener. The handler:
   - If the event target is a `<button data-pin-id=...>`, resolve the pin id from the dataset, call `setActivePin(id)`, and stop propagation.
   - If the event target is the canvas root (empty overlay area) and the current tool is "pin" (the unit spec has no pen tool — single-tool mode), compute `{ x, y }` as `(event.offsetX / rect.width, event.offsetY / rect.height)`, push a fresh draft pin with state `"draft"`, focus the popover title input (scheduled via `queueMicrotask`).
   - Otherwise, no-op.
2. Attach **one** `onKeyDown` handler to `rootRef.current`:
   - `"N"` (case-insensitive — handler reads `event.key.toLowerCase() === "n"`) starts a new annotation at the currently focused pin's anchor (or the canvas center if no pin focused). Registered via `useShortcut("n", ..., { scope: "annotation-canvas" })` rather than inlined — conflicts are dev-mode-checked at the scope boundary.
   - `"ArrowUp"/"ArrowDown"/"ArrowLeft"/"ArrowRight"` move focus between pins using the pre-sorted index (see Step 4).
   - `"Escape"` closes the popover and returns focus to the anchored pin (`pinButtonsRef.current[activePin].focus()`).
   - `"Enter"` when focused inside the popover body textarea saves the draft (delegates to the form's submit handler — see Step 6).
3. Listener-count verification: because both handlers are attached **once** in a single `useEffect(() => { root.addEventListener(...); return () => root.removeEventListener(...) }, [rootRef])`, the resulting DOM has exactly **one pointerdown + one keydown** on the canvas root. Plus **one** document-level focus listener owned by the existing `useShortcut` registry (shared across all shortcuts in the app). Total: 3 listeners as the unit spec requires (line 121).

#### Step 4 — Pre-sorted pin index for Arrow-key navigation

1. In a separate `useMemo` keyed on `pins.length` and a content-hash-cheap `pins.map(p => p.id).join(",")`, compute:
   ```ts
   const sortedPinIds = useMemo(() =>
     [...pins]
       .sort((a, b) => a.y - b.y || a.x - b.x)
       .map((p) => p.id),
     [pinsKey]
   )
   ```
   where `pinsKey = pins.map(p => `${p.id}:${p.x}:${p.y}`).join(",")` — invalidates only when the pin set or the coordinates change, NOT per keystroke.
2. Arrow-key handler does an O(1) lookup in `sortedPinIds`:
   - ArrowUp/ArrowLeft → previous id in the sorted list (clamped at index 0).
   - ArrowDown/ArrowRight → next id (clamped at length - 1).
   - Moves DOM focus via `pinButtonsRef.current[id]?.focus()`.
3. `pinButtonsRef` is a `useRef<Record<string, HTMLButtonElement | null>>({})` populated via the `ref` callback on each pin button.

#### Step 5 — Pin markers as `<button tabindex="0">`

1. Render pins as a `.map((pin) => <button ... />)`. Each button:
   - `type="button"`
   - `tabindex="0"` (explicit — the unit spec says explicit tabindex=0 is the acceptance criterion; React defaults buttons to focusable but the explicit attribute matters for the regression-guard grep).
   - `data-pin-id={pin.id}` — resolves back to state on pointer events.
   - `aria-label={`Annotation ${index + 1}${pin.title ? \`: ${pin.title}\` : ""}`}` (1-based index for human-friendly label).
   - `aria-describedby={\`annotation-popover-${pin.id}\`}` only when `activePin === pin.id` (the popover exists).
   - Position via inline `style={{ left: \`${pin.x * 100}%\`, top: \`${pin.y * 100}%\` }}`.
   - CSS class `.annotation-pin` with the 28×28 visual + `::before` 44×44 hit-area expansion (port the pattern from `annotation-popover-states.html` lines 56–84). Focus ring: `focus-visible:outline-teal-500 focus-visible:outline-offset-[3px]`.
2. Regression guard: the new `banned-pin-tabindex-negative` audit rule catches any accidental `tabindex="-1"` on a future edit. Rule scope is pinned to this file only.

#### Step 6 — Popover (non-modal) semantics

1. When `activePin !== null`, render a sibling `<div>` next to the pin button with the popover markup:
   ```tsx
   <div
     id={`annotation-popover-${pin.id}`}
     role="group"
     aria-labelledby={`${popoverId}-title`}
     aria-label="Annotation draft"
     className="absolute z-50 w-72 rounded-xl border border-teal-300 dark:border-teal-800 bg-white dark:bg-stone-900 shadow-2xl p-3"
   >
     <h3 id={`${popoverId}-title`} className="text-xs font-bold uppercase tracking-widest text-teal-600 dark:text-teal-400 mb-2">
       New feedback @ <span>{Math.round(pin.x * 100)}%, {Math.round(pin.y * 100)}%</span>
     </h3>
     <input type="text" placeholder="Title…" aria-required="true" ... />
     <textarea rows={3} placeholder="Detail…" ... />
     <div className="flex items-center justify-between">
       <span className="text-xs text-stone-600 dark:text-stone-300">Esc to cancel</span>
       <div className="flex gap-1.5">
         <button onClick={handleCancel}>Cancel</button>
         <button onClick={handleSave} disabled={!draftTitle.trim()}>Create</button>
       </div>
     </div>
   </div>
   ```
2. **No focus-trap** — non-modal semantics. On popover open, the title input is focused via a `useEffect` that runs on `activePin` transitions. On popover close (Cancel / Escape / outside-click / after save), focus returns to the pin button (`pinButtonsRef.current[lastActivePin]?.focus()`).
3. Outside-click dismissal: a `useEffect` installs a `document.addEventListener("mousedown", ...)` while `activePin !== null` that checks `!popoverRef.current.contains(target) && !pinButtonRef.contains(target)` and calls `setActivePin(null)` — this is ONE listener, scoped to popover lifetime, so it does NOT violate the listener-count test (the listener count test counts listeners on `rootRef.current`, not document-level).
4. Save handler builds a `FeedbackCreateRequest` (NOT a draft-pin shape):
   ```ts
   const payload: FeedbackCreateRequest = {
     title: draftTitle.trim(),
     body: draftBody.trim(),
     origin: "user-visual",
     anchor: {
       pageId: pin.pageId,
       x: pin.x,
       y: pin.y,
       viewportWidth: pin.viewportWidth,
       viewportHeight: pin.viewportHeight,
     },
   }
   const parsed = FeedbackCreateRequestSchema.safeParse(payload)
   if (!parsed.success) { /* inline error + do not dismiss */ return }
   await onSubmit(parsed.data)
   clearDraftFromLocalStorage()
   setActivePin(null)
   ```
5. Disabled-state pattern: the Create button when `!draftTitle.trim()` uses the token pair from DESIGN-TOKENS §1.7 (`bg-stone-100 text-stone-600 border border-stone-400 cursor-not-allowed`) + `aria-disabled="true"` — NOT `opacity-50`. Matches the artifact HTML at lines 198–199.

#### Step 7 — Draft persistence (localStorage with debounce, cap, reload, quota)

1. Debounce helper: a `useEffect` watches `pins` + `draftTitle` + `draftBody` and schedules a 500 ms trailing-edge write via `setTimeout` → `clearTimeout` on unmount/re-run. Fake-timer verified.
2. Storage key: `` `haiku-ui:annotation-draft:${sessionId}` ``.
3. Payload shape (what's serialized):
   ```ts
   interface DraftPayload {
     sessionId: string
     pins: AnnotationDraftPin[] // full pin list (still-open drafts only)
     savedAt: string // ISO-8601
   }
   ```
4. Oversize handling: after `JSON.stringify(payload)`, if byte length > 64 KB, drop the oldest pin (`pins.shift()`) until ≤ 64 KB. Fire `announce("polite", "Draft too large to save locally; oldest annotation dropped")`. The **spec says assertive for quota only** (line 83 of the unit spec: `useAnnounce('assertive', 'Draft too large to save locally')` — this corresponds to the `QuotaExceededError` catch path, not the preemptive cap). So: preemptive 64 KB cap announces `polite`, `QuotaExceededError` catch announces `assertive`.
5. Write path:
   ```ts
   try {
     localStorage.setItem(key, JSON.stringify(capped))
   } catch (err) {
     if (err instanceof DOMException && err.name === "QuotaExceededError") {
       announce("assertive", "Draft too large to save locally")
     } else {
       throw err
     }
   }
   ```
6. Boot-time read-back (on mount, once): read `key`, `JSON.parse`, `safeParse` against a `DraftPayloadSchema` (a new Zod schema local to this component that re-uses `FeedbackAnchorSchema` + validates each pin's fields). If invalid → `localStorage.removeItem(key)` and render empty. If valid → `setPins(parsed.pins)`.
7. Boot-time sweep: iterate `localStorage` keys via `Object.keys(localStorage)`, match `^haiku-ui:annotation-draft:(.+)$`, for each key where the captured `sessionId` !== `currentSessionId`, call `localStorage.removeItem(key)`. One-time on mount.
8. Submit cleanup: after `onSubmit` resolves, `localStorage.removeItem(key)` and drop the submitted pin from state.
9. Sheet-close cleanup: the parent component unmounts `AnnotationCanvas` when the sheet closes; the debounce flush fires on unmount via the `useEffect` cleanup (`clearTimeout` does NOT flush — the last pending write is lost). **To preserve the draft-carry-forward contract**, the cleanup must synchronously write the latest draft if the timer is pending: refactor to `const pendingRef = useRef<ReturnType<typeof setTimeout> | null>(null); const latestPayloadRef = useRef<DraftPayload | null>(null); on cleanup: if (pendingRef.current) { clearTimeout(pendingRef.current); if (latestPayloadRef.current) persist(latestPayloadRef.current) }`. This ensures the on-close write without breaking the 500 ms debounce contract (the test for "10 rapid edits → exactly 1 write" still passes because mid-flight edits don't trigger unmount).

#### Step 8 — Keyboard shortcuts

1. `useShortcut("n", handleNewAnnotation, { scope: "annotation-canvas" })` — creates a draft pin at the currently focused pin's anchor (or canvas center if none). **Scope is `annotation-canvas`, not `global`** — because the canvas may be unmounted when other surfaces own the viewport. Dev-mode conflict-check is per-scope so this is safe even though `c` already binds to create-annotation at scope `global`.
2. `useShortcut("Escape", handleEscape, { scope: "annotation-canvas", allowInInput: true })` — cancels the active popover. `allowInInput: true` because Escape must work while the reviewer is mid-typing in the title input.
3. `useShortcut("Enter", handleSaveIfInForm, { scope: "annotation-canvas", allowInInput: true, guard: () => activePin !== null && draftTitle.trim().length > 0 })` — saves the draft. `allowInInput: true` is required because the reviewer is always typing in the popover form when they hit Enter.
4. Arrow-key handlers are NOT routed through `useShortcut` — they're raw keydown handlers on the canvas root because arrow keys need to respect the sorted-index lookup and the canvas-local focus scope (they should NOT move focus outside the pin set, unlike `Tab`). Attach via the single delegated keydown listener.

#### Step 9 — XSS hardening

1. Body text is rendered as React text children only:
   ```tsx
   <p className="text-xs text-stone-700 dark:text-stone-300 line-clamp-3">{pin.body}</p>
   ```
2. Never use `dangerouslySetInnerHTML`, `innerHTML = ...`, `eval(...)`, `new Function(...)`, or `document.write(...)` anywhere in `pages/review/**`. The new `banned-xss-sinks-annotation-path` audit rule catches regressions.

#### Step 10 — Perf budget

1. `packages/haiku-ui/tests/annotation-perf.spec.ts`:
   ```ts
   import { describe, it, expect } from "vitest"
   import { render, act } from "@testing-library/react"
   import { AnnotationCanvas } from "../src/pages/review/AnnotationCanvas"

   function fixturePins(n: number) { /* generates n pins evenly spaced */ }

   describe("annotation-perf", () => {
     it("first paint ≤ 100ms with 200 pins", () => {
       const t0 = performance.now()
       const { container } = render(
         <AnnotationCanvas sessionId="perf" pageId="p1" onSubmit={async () => {}}>
           <div data-fixture-pins={200} />
         </AnnotationCanvas>
       )
       const t1 = performance.now()
       expect(t1 - t0).toBeLessThanOrEqual(100)
     })

     it("keypress-to-paint ≤ 16ms per ArrowRight (200 iterations)", () => {
       const { container } = render(...)
       // focus the first pin
       for (let i = 0; i < 200; i++) {
         const t0 = performance.now()
         fireEvent.keyDown(container, { key: "ArrowRight" })
         act(() => {}) // flush
         const t1 = performance.now()
         expect(t1 - t0).toBeLessThanOrEqual(16)
       }
     })
   })
   ```
   The budget is applied to jsdom timings. Node's jsdom is considerably slower than real browsers at layout, so 100 ms / 16 ms should be trivially met for a DOM that is essentially 200 absolutely-positioned buttons with no paint-forcing work. If a future regression pushes a test past 16 ms, that's a real signal (likely re-sort happening per keystroke, or a listener leak multiplying work).
2. Listener-count assertion in the unit RTL test (NOT the perf spec). Pattern:
   ```ts
   const root = container.querySelector("[role='application']") as HTMLElement
   // Count attached listeners via the vendor-specific getEventListeners if available,
   // or (more portable) verify the canvas attaches only known handlers: spy
   // on addEventListener for the duration of the render and assert exactly one
   // pointerdown + one keydown on the root.
   const spy = vi.spyOn(root, "addEventListener")
   // ... trigger the effect's setup phase ...
   const pointerDownCalls = spy.mock.calls.filter(([type]) => type === "pointerdown").length
   const keyDownCalls = spy.mock.calls.filter(([type]) => type === "keydown").length
   expect(pointerDownCalls).toBe(1)
   expect(keyDownCalls).toBe(1)
   ```
   This is the concrete test; `getEventListeners()` is a DevTools-only helper and is not available in jsdom. The spy approach is the test harness equivalent.

#### Step 11 — Verification commands

Each runs from inside the worktree with the mandatory bolt timeouts:

1. `npm --prefix packages/haiku-api run build` — verify the schema compiles + OpenAPI emits cleanly. Timeout 10 min.
2. `npx tsc --noEmit -p packages/haiku-ui` — typecheck the new component and updated imports. Timeout 2 min. This is the unit's explicit completion criterion (line 124).
3. `npm --prefix packages/haiku-ui test -- src/pages/review/__tests__/AnnotationCanvas.test.tsx` — RTL suite. Timeout 5 min.
4. `npm --prefix packages/haiku-ui test -- tests/annotation-perf.spec.ts` — perf budget. Timeout 5 min.
5. `npm --prefix packages/haiku-ui test -- tests/audit-banned-patterns.test.ts` — audit-script extended coverage. Timeout 5 min.
6. `node packages/haiku-ui/scripts/audit-banned-patterns.mjs --profile=tokens` — exit 0, 0 hits. (manual dry-run)
7. `node packages/haiku-ui/scripts/audit-banned-patterns.mjs --profile=stage-wide` — exit 0, 0 hits + required-presence satisfied.
8. `npm --prefix packages/haiku-ui test` — full haiku-ui suite, verify no regressions. Timeout 5 min.

### Commit discipline

Three commits inside the worktree:

1. `haiku(unit-13/builder): add anchor field to FeedbackCreateRequest schema` — schema + index re-export + openapi emit verification.
2. `haiku(unit-13/builder): ship AnnotationCanvas with pin-drop + non-modal popover` — component + tests (RTL + perf).
3. `haiku(unit-13/builder): extend audit-banned-patterns for tabindex + XSS regression guards` — audit-config.json + audit-banned-patterns.test.ts assertions.

---

## Risks & Blockers

### R1 — `FeedbackCreateRequest.anchor` is not present on disk today (unit spec is wrong about unit-01)

**Claim (unit spec line 66):** "added to schema in unit-01."
**Reality:** `git log` shows unit-01's terminal commit `f22bda30` ships the schema without an `anchor` block. `knowledge/DATA-CONTRACTS.md` describes the anchor field at lines 79 and 108 — but as a declarative contract, not a landed implementation.
**Mitigation:** Step 1 of the plan lands the field in this unit. It's a 15-LOC Zod schema addition; risk-free; the anchor field is OPTIONAL so no callers break. Scope language of unit-13 names `packages/haiku-api`'s schema transitively via "`haiku-api`'s `FeedbackCreateRequest`" — the edit is on-brand.

### R2 — OpenAPI emit may need manual schema registration

**Risk:** If `packages/haiku-api/src/openapi.ts` uses an explicit schema-name registry (rather than walking re-exports), `FeedbackAnchorSchema` must be added by hand or it won't surface in the emitted OpenAPI.
**Mitigation:** First bolt opens `openapi.ts` and checks the registry pattern before adding the schema. If the emit script fails, add the schema to whatever registry it uses (copy the idiom the file already demonstrates). Decision is 5 minutes of reading, not a blocker.

### R3 — Shortcut key `N` vs existing global `c` binding (doc vs unit spec divergence)

**Risk:** `keyboard.ts:139-146` registers `"c"` as "Create annotation at focused artifact / line" at scope `"global"`. The unit spec says `N` starts a new annotation. If someone pattern-matches the registry when wiring this unit, they may bind `c` and introduce a conflict with the existing global entry.
**Mitigation:** Bind `N` at scope `"annotation-canvas"` (not `"global"`). The `useShortcut` primitive's conflict detection is per `(key, scope)` — so `(n, annotation-canvas)` doesn't collide with anything. Document this choice in the component header comment with a pointer to the registry entry + this plan §R3 note. The registry `c` binding stays as-is — it documents a global shortcut that's handled by a different surface (the feedback-card-focused create-annotation flow). Unit-15 stage-wide audit can reconcile the registry vs in-canvas bindings if drift becomes a problem.

### R4 — Perf test runs in jsdom, not a real browser

**Risk:** The unit spec says "Playwright perf test". Playwright is banned on this repo (commit `28e66e4c`). Using jsdom timings instead means absolute 100 ms / 16 ms numbers don't correspond to real-browser paint.
**Mitigation:** The budget is enforced as a **relative regression gate**, not a user-facing paint guarantee. The spec's intent — catch a per-keystroke sort that would go quadratic at 200 pins, or a listener leak that scales with pin count — is preserved because jsdom executes the same React render path. If jsdom times turn out to be too flaky in CI, raise the budget to 200 ms / 32 ms (2x jsdom overhead cushion) and document the relaxation in the perf test header comment. Absolute-precision timing is a follow-up for a future integration-test harness (not this unit).

### R5 — Draft-carry-forward on sheet close loses the last pending write

**Risk:** `useEffect` cleanup fires on unmount. A naive `clearTimeout` drops the pending debounced write, breaking the "On sheet close: key retained" criterion.
**Mitigation:** Step 7.9 documents the ref-pattern that flushes the latest payload synchronously on cleanup. Covered by an RTL test that unmounts the component with a pending write and reads `localStorage` afterwards to confirm the write landed.

### R6 — Pin hit-area expansion via `::before` may mask pointer events on other pins

**Risk:** Two pins within 44 px of each other have overlapping invisible hit areas. The first rendered pin captures the pointer, making the second un-clickable.
**Mitigation:** The `::before` uses `pointer-events: none` by default in Tailwind — but the pattern in `annotation-popover-states.html` relies on pointer capture. Solution: the actual button carries `pointer-events: auto`, and the `::before` inherits none (so the button element itself is the hit target, not the pseudo). Double-check by inspecting the artifact CSS when wiring — the canonical pattern is already in the HTML. The listener is delegated on the root, so inner hit-area hygiene doesn't matter for event routing, only for where the pointer-down lands.

### R7 — localStorage is not available in SSR

**Risk:** `haiku-ui` is an SPA (Vite build), but paranoia says wrap localStorage access in a `typeof window !== "undefined"` guard.
**Mitigation:** The existing app already references `localStorage` freely (grep `packages/haiku-ui/src` for `localStorage` if in doubt). No guard needed; follow the existing pattern.

---

## Completion Checklist — Mirrors the Unit Spec

Every criterion from §Completion Criteria maps to a concrete verification:

- **Keyboard a11y**
  - ✅ Tab reaches canvas; `N` starts annotation — RTL `userEvent.tab()` + `userEvent.keyboard("n")` test.
  - ✅ `tabindex="-1"` grep returns zero — new `banned-pin-tabindex-negative` rule in the `stage-wide` audit profile.
  - ✅ Arrow-key traversal lands on correct pin at each step — RTL test that mounts 10 pins, presses ArrowDown 10 times, asserts DOM focus traverses the y-then-x sorted order.
- **Draft persistence**
  - ✅ Fake-timer 10-edits-1-write — `vi.useFakeTimers()` + 10 `fireEvent.change` + `vi.advanceTimersByTime(499)` + assert no write + `vi.advanceTimersByTime(1)` + assert exactly one write.
  - ✅ Oversize drops oldest pin — RTL test seeds 10 pins of ~8 KB each, asserts `localStorage.getItem(key)` ≤ 64 KB and the first pin is gone.
  - ✅ Reload survives — mount → draft → unmount → remount w/ same sessionId → form prefills. RTL assertion on textarea `value`.
  - ✅ Real page reload — covered by the RTL remount test (the jsdom equivalent of a hard reload; no Playwright).
  - ✅ Schema re-validation discards invalid JSON — `localStorage.setItem(key, "{not valid at all")` + mount + assert pins empty + assert `localStorage.getItem(key) === null`.
  - ✅ `QuotaExceededError` caught + assertive announcement — mock `localStorage.setItem` to throw a `DOMException("QuotaExceededError", "QuotaExceededError")` + assert `#feedback-live-assertive` textContent === "Draft too large to save locally".
- **Popover semantics**
  - ✅ `role="group"`, `aria-labelledby`, `aria-label="Annotation draft"` — snapshot + explicit `getByRole("group", { name: "Annotation draft" })` assertion.
  - ✅ On dismiss, focus returns to pin — `userEvent.keyboard("{Escape}")` + assert `document.activeElement === pinButton`.
- **XSS**
  - ✅ `banned-xss-sinks-annotation-path` audit rule returns zero hits across `pages/review/**` — verified by the existing audit-banned-patterns test.
- **Perf**
  - ✅ Listener count ≤ 3 — the spy-on-addEventListener pattern in Step 10.2.
  - ✅ Perf budgets — jsdom-relative thresholds in `annotation-perf.spec.ts`.
- **Typecheck**
  - ✅ `npx tsc --noEmit` passes (quality gate declared on unit frontmatter).

---

## Notes for the Reviewer

- The legacy `packages/haiku-ui/src/components/AnnotationCanvas.tsx` is intentionally NOT removed or migrated. Switching `ReviewPage.tsx` to the new component is a stage-wide rewire that belongs in unit-15 (or a follow-up); unit-13's scope is the new component + its schema dependency + its regression guards.
- The `anchor` schema addition is technically a cross-package change (haiku-api + haiku-ui). It's a three-line optional Zod field — risk-free, mandatory for the UI contract. The alternative (leaving the schema alone and letting the UI call `safeParse` against a client-local schema) was considered and rejected because the wire contract is the source of truth; duplicating it in the UI would drift.
- Every a11y primitive (`useShortcut`, `useAnnounce`, `useReducedMotion`) is consumed read-only. No new a11y infra in this unit.
- The `role="group"` semantic override vs the static HTML's `role="dialog"` is the non-obvious call. The unit spec is unambiguous that the popover is non-modal (drag/zoom continues behind); `role="dialog"` would contract screen readers to "this is a modal" which is wrong. `role="group"` with `aria-label` conveys the grouping without the modal contract. If the reviewer has a strong preference, the fallback is `role="region"` — also non-modal, also labelled; the unit spec's text wins as written.
