# Tactical Plan: unit-08 Feedback component cluster

Owner: planner (bolt 1)
Target: Land the feedback component cluster at `packages/haiku-ui/src/components/feedback/` — `FeedbackItem`, `FeedbackList` (virtualized via `react-window` at > 50 items with coordinated keyboard navigation), `FeedbackStatusBadge`, `FeedbackOriginIcon`, `FeedbackSummaryBar`. Every component covers the full six-state × status-variant matrix per `state-coverage-grid.md §7`. Ship Vitest + RTL snapshot coverage for the state matrix, an RTL-driven keyboard-nav test, a virtualization perf test, and wire the cluster behind a barrel export. Retire the legacy `components/FeedbackPanel.tsx` by re-homing its two consumers (`ReviewPage`, `ReviewCurrentPage`) to the new `FeedbackList`-centric API.

---

## Context & Prior Art

- **unit-03** extracted `packages/haiku-ui/` as a standalone workspace (React 19, Tailwind v4 via `@tailwindcss/vite`, Vitest + RTL wired; `vitest.config.ts` includes both `tests/**/*.{test,spec}.{ts,tsx}` AND `src/**/*.{test,spec}.{ts,tsx}` — tests at `src/components/feedback/__tests__/*.test.tsx` match out of the box).
- **unit-04** (merged at `bf2eb9a3`) established the primitive layer at `src/components/primitives/` (Badge, Button, Card, Chip, Divider, Input) plus three audit scripts (`verify-tokens`, `audit-contrast`, `audit-banned-patterns`). The `Badge` primitive is the natural substrate for `FeedbackStatusBadge`, and `audit-banned-patterns.mjs --profile=tokens` already guards the banned opacity / banned verbs / banned `text-stone-400` classes this unit must not re-introduce. The `stage-wide` profile additionally enforces the `\{origin\}(?!Labels)` regex that this unit's completion criteria calls out — we extend that profile, not invent a new one.
- **unit-05** (merged at `8110ff29`) landed the a11y foundation layer at `src/a11y/` — `focusRingClass` / `focusRingCompactClass`, `useAnnounce` + `LiveRegionShell`, `touchTargetClass`, `useReducedMotion` + `motionSafeClass`, `useFocusTrap`, `useShortcut`, landmarks. Feedback components consume `focusRingCompactClass` (DESIGN-BRIEF §2 states dense card stacks use the 1px-offset variant), `useAnnounce("polite", …)` on every status transition (per `aria-live-sequencing-spec.md §5`), and `useReducedMotion()` to gate the `feedback-status-change` flash animation from DESIGN-TOKENS §5.
- **DESIGN-BRIEF §2** is the single source of truth for component props, status × button copy (Dismiss / Verify & Close / Reopen — no other verbs), aria-label shapes (`"Status: {status}"`), the three-signal status rule (color border + non-color glyph + text prefix), and the `originLabels[origin]` rule ("Visible label uses the human label, not the raw slug"). `DESIGN-TOKENS §2.1–2.4` mirrors the same numbers (feedback-status palette, origin palette, card backgrounds, visit-counter tiers). `state-coverage-grid.md §7.1–7.6` enumerates every cell of the six-state matrix for each of the five new components.
- **Existing `packages/haiku-ui/src/components/FeedbackPanel.tsx`** is a pre-unit-04 single-file implementation that ships today. It already encodes the canonical color maps (lines 9–54) and a per-item expand/collapse — but it (a) lives at the wrong path (flat `components/FeedbackPanel.tsx` rather than the clustered `components/feedback/*.tsx` the unit spec mandates), (b) renders the raw `origin` slug instead of `originLabels[origin]` (line 172 — regression-class hit for `\{origin\}(?!Labels)`), (c) renders the literal verbs `"Close"`, `"Reject"`, `"Reopen"`, `"Delete"` on pending/addressed buttons (lines 212/223 are **banned** — the canonical verb set is Dismiss / Verify & Close / Reopen), (d) has no virtualization, no keyboard nav, no `aria-expanded`, no `aria-label="Status: ..."` on badges, and no state-matrix tests. The existing file's only in-tree consumers are `ReviewPage.tsx:498` and `ReviewCurrentPage.tsx:176` — both receive `items`, `loading`, `onUpdate`, `onDelete` props. The new cluster preserves that call-site shape via a thin `FeedbackPanel` re-export from `feedback/index.ts` so the two consumer sites migrate in one line each.
- **`state-coverage-grid.md §7.5`** — `FeedbackList` is a `role="list"` container; its container states are `default ✓ / empty ✓ / loading ✓ / error ✓`; the interactive states live on the `FeedbackItem` children. That's load-bearing for the test layout: the list-level snapshot fixture is small (1 default + 1 empty + 1 loading + 1 error — 4 cells), while the item-level fixture is large (4 statuses × 6 interaction states = 24 cells per mode). The unit spec's `≤ 36 cells per component` guidance is satisfied on every component without sub-splitting.
- **`feedback-card-states.html`** is the rendered design-stage mockup (light + dark, per-status card with all footer buttons, 44px touch targets, 28px desktop footer buttons). The HTML is our pixel-level reference for spacing and visual hierarchy — the React components must render the same class strings (cross-referenced in DESIGN-TOKENS §2.3 with the canonical card-background and border-left tables at lines 386–405).
- **`feedback-lifecycle-transitions.html`** documents the canonical 4-status state machine (`pending → {rejected via Dismiss, addressed via agent}`, `addressed → {closed via Verify & Close, pending via Reopen}`, `closed → pending via Reopen`, `rejected → pending via Reopen`). No reviewer-facing `pending → addressed` transition — `addressed` is agent-set via `closed_by` / `addressed_by`. That determines the exact per-status footer-button set we render.
- **`packages/haiku-api/src/schemas/feedback.ts`** is the wire-shape source. `FeedbackItem` carries `feedback_id`, `title`, `body`, `status`, `origin`, `author`, `author_type`, `created_at`, `visit`, `source_ref`, `closed_by`. Re-exported from `haiku-ui`'s `types.ts` as `FeedbackItemData`. No new fields added this unit; no schema churn.
- **`audit-banned-patterns.mjs`** scope globs target `packages/haiku-ui/src/**/*.{ts,tsx,css}` with `__tests__/**` and `__snapshots__/**` excluded — so our test fixtures and snapshots do not trip the banned-verb rules even though snapshots will include the literal strings "Dismiss", "Verify & Close", "Reopen" in rendered output. Good. The `banned-origin-jsx-bare` rule in the `stage-wide` profile (`\{origin\}(?!Labels)`) will fail on the existing `FeedbackPanel.tsx:172` — we MUST fix that line in the retire/migrate step or the stage-wide audit fails in unit-15.

## Git-history signal

- `packages/haiku-ui/src/components/feedback/` — does not exist yet. Greenfield directory. Zero merge-conflict risk on create.
- `packages/haiku-ui/src/components/FeedbackPanel.tsx` — last touched by unit-04 (commits `2f6115a9`, `28728081`). Unit-04 only updated class strings; structural logic is unchanged since the unit-03 rename from `review-app/` (commit `80dfc4c8`). The retire step rewrites this file into a 5-line re-export shim pointing at the new cluster, preserving commit-hygiene attribution through `git mv` is NOT appropriate here because the clustered components replace the monolithic implementation with five distinct files — normal delete + recreate is cleaner.
- `packages/haiku-ui/src/components/ReviewPage.tsx` and `ReviewCurrentPage.tsx` — last structural changes in unit-03 (`b83095c4`). The only edit this unit makes is a one-line import change (`FeedbackPanel` → same name, same default props contract, new module path through the barrel). Minimal churn.
- `packages/haiku-ui/package.json` — last touched in unit-04 (`2f6115a9`). Adding `react-window` to `dependencies` + `@types/react-window` to `devDependencies` is a low-churn edit; no other lines move. Run `npm install --workspace haiku-ui` to materialize the dependency.
- `packages/haiku-ui/tailwind.config.ts` — last touched in unit-04. The feedback cluster reuses every safelist pattern already declared there (feedback-status pairs, origin pairs, border-left utilities, visit-counter tiers). No safelist additions needed.
- `packages/haiku-ui/vitest.config.ts` — last touched in unit-03. The `src/**/*.{test,spec}.{ts,tsx}` include already matches `src/components/feedback/__tests__/*.test.tsx`. No config edits needed.

## Risks & Blockers

1. **`react-window` v1 vs v2 API drift.** `react-window` v1.x exports `FixedSizeList` / `VariableSizeList` with `children` render-props that receive `{ index, style }`. v2.x (released 2024) introduces a new hooks-based API (`useVirtualizer`) and no longer includes the v1 component exports in a default import. The unit spec says `react-window` unqualified, so we pin to a specific major. **Chosen**: `react-window@^1.8.11` (current stable v1 line, most recent release 2024-12). Rationale — the v1 render-prop API is well-documented, battle-tested, and integrates with our existing class-string-driven styling without the hooks-API refactor. Install `@types/react-window@^1.8.8` alongside. If v2's hooks API becomes mandatory upstream, that's a separate migration — not this unit's problem.
2. **Virtualization + keyboard navigation coordination.** The unit spec requires that pressing ArrowDown/Up on a focused item outside the rendered window must cause the virtualizer to scroll, mount the target, and land focus on the newly-mounted node in the next paint. `react-window`'s `VariableSizeList` exposes `scrollToItem(index, align)` via an imperative ref. The pattern: (a) track the focused index in React state, (b) on arrow-key press, compute `nextIndex`, call `listRef.current.scrollToItem(nextIndex, "auto")`, (c) use a `useEffect` keyed on `focusedIndex` + the list's `onItemsRendered` `visibleStartIndex`/`visibleStopIndex` to detect when the target row is now in the rendered window, then call `itemRefs.current[nextIndex]?.focus()` inside a `requestAnimationFrame` (so the row has actually painted before we focus it). The test explicitly exercises this — render 100 items, start focus at index 0, loop ArrowDown 99 times, assert `document.activeElement` has `data-testid="feedback-item-${i}"` at each step. To make this deterministic under jsdom, we pass a fixed `itemSize` and a fixed `height` for the list so the virtualizer's math is predictable; jsdom has no real layout but `react-window` works from the numeric props we pass. See also Risk §3.
3. **Virtualization threshold = 50.** The unit spec: "Virtualization via `react-window` … when item count exceeds 50." The inverse branch (≤ 50 items) renders a plain non-virtualized list with every item mounted. Rationale: virtualizing a small list adds complexity (ref forwarding, scroll coordination) without a perf win. The threshold is a constant inside `FeedbackList.tsx` (`const VIRTUALIZE_THRESHOLD = 50`). Both branches share the exact same `FeedbackItem` rendering — only the outer container differs. The keyboard-nav logic lives in a shared hook (`useFeedbackListKeyboardNav`) that works on either branch. **Chosen**: both branches receive identical `itemRefs: RefObject<Array<HTMLElement | null>>` wiring so the hook is branch-agnostic.
4. **Virtualized `aria-setsize` / `aria-posinset`.** When `react-window` unmounts rows outside the viewport, screen readers lose the list-size signal if we rely only on the DOM. `role="list"` on the outer container + `role="listitem"` on each `FeedbackItem` is not sufficient on its own when items are unmounted. Mitigation: set `aria-setsize={items.length}` and `aria-posinset={index + 1}` on each rendered `FeedbackItem`. This preserves the list-size signal even when the rendered DOM is a sparse 30-of-500 window. Cross-referenced in `aria-landmark-spec.md` — screen readers (NVDA, VO) respect these attributes when items are virtualized.
5. **Snapshot granularity.** The unit spec caps each component's state matrix at 36 cells; each snapshot "includes a header recording the token hash." **Decision**: one snapshot file per component at `src/components/feedback/__tests__/__snapshots__/<Component>.states.test.tsx.snap`, produced by Vitest's default snapshot driver. The snapshot header is a comment block at the top of a helper function that prints `<!-- token-hash: <hash> -->` into the rendered HTML before `toMatchSnapshot()`, where `<hash>` is the first 16 hex chars of `sha256(JSON.stringify(verifyTokensManifest))`. We source the manifest by importing a small helper `getTokenHash()` from `scripts/verify-tokens.mjs` (refactored to export a named `computeTokenHash()` function alongside its CLI main). Vitest's snapshot diff includes this comment — if the token set drifts without the snapshot being regenerated, the snapshot test fails and the developer sees the hash mismatch. This is the canonical "token-intentional changes update the header + regenerate the snapshot deliberately" workflow. If extracting `computeTokenHash` from `verify-tokens.mjs` is too invasive for bolt 1, fall back to an inline `sha256` of a dedicated token-manifest constant exported from `src/components/feedback/tokens.ts` (the constant mirrors DESIGN-TOKENS §2.1 / §2.2 / §2.3 / §2.4 tables verbatim). **Chosen for bolt 1**: the inline-constant fallback — keeps the change scope tight to `packages/haiku-ui/src/`. Post-merge follow-up can unify `computeTokenHash` in `verify-tokens.mjs` if desired.
6. **State-matrix cardinality per component.**
   - `FeedbackStatusBadge` — 4 status variants × (default + error) = 8 cells; hover/focus/active/disabled are N/A per §7.1. Well under the 36 cap.
   - `FeedbackOriginIcon` — 6 origin variants × (default) = 6 cells; hover/focus/active/disabled/error are N/A per §7.2. Well under.
   - `FeedbackItem` — 4 statuses × 6 states (default / hover / focus / active / disabled / error) = **24 cells**. Under the 36 cap without sub-splitting.
   - `FeedbackList` — 4 container-level cells (default / empty / loading / error) per §7.5. Well under.
   - `FeedbackSummaryBar` — 1 count-button × 5 states (default / hover / focus / active — `aria-pressed=true`) = 5 cells + 0-items hidden case. Well under.
   We render each cell inside a wrapper `<div data-state="hover">` etc. whose CSS selectors force the simulated state (same trick `feedback-card-states.html` uses — `state-hover`, `state-focus`, `state-active`). The snapshot captures the rendered HTML with these class modifiers in place.
7. **`FeedbackItem` — focus-preservation across status changes.** Unit spec: "focus preserved across status changes." If the user has focus on an action button (e.g., Dismiss) and clicks it, the status transitions (`pending → rejected`), the button tree changes (Dismiss disappears; Reopen appears), and focus gets lost to `<body>`. The fix: after the status update resolves, run `useEffect(..., [item.status])` that inspects the previous button's `data-action` attribute and focuses the equivalent button in the new tree, or falls back to the card root (`tabindex=0`). We capture the `previousStatus` via `useRef`, and on status change, if the component was the active element, we call `cardRef.current?.focus()` in a post-update `useLayoutEffect`. Test this explicitly — click Dismiss on a pending item, assert `document.activeElement` is the card root after the transition (or the Reopen button, whichever the implementation chooses; the test mirrors the chosen policy). **Chosen policy**: focus returns to the card root on status change. Simpler + deterministic. Reopen is a different button, different ref, different visual weight — sending focus to Reopen would feel jumpy. Card-root focus is the contract.
8. **`FeedbackItem` — `aria-expanded`.** Spec: "`aria-expanded` reflects state". The item is a disclosure widget — `aria-expanded={isExpanded}` on the card root, NOT on a nested button. Rationale: the card itself is the toggle (it's a clickable region per the existing `FeedbackPanel.tsx` pattern), not a button-inside-card. Downstream a11y review can lobby for a nested button, but that refactor is unit-13 (annotation-canvas integration) concern. For bolt 1 we mirror the existing `FeedbackPanel.tsx` pattern: `<div role="button" tabindex="0" aria-expanded={isExpanded} onClick={toggle} onKeyDown={enterSpaceToggle}>...` — and the Biome `a11y/noStaticElementInteractions` suppression is already used at `FeedbackPanel.tsx:146` with a comment; reuse the same justification verbatim.
9. **`FeedbackItem` — origin label rule.** The regression guard is `\{origin\}(?!Labels)` returning zero hits in feedback component source. Rendering pattern:
   ```tsx
   const originLabels: Record<FeedbackOrigin, string> = {
     "adversarial-review": "Review Agent",
     "external-pr": "PR Comment",
     "external-mr": "MR Comment",
     "user-visual": "Annotation",
     "user-chat": "Comment",
     agent: "Agent",
   }
   // ...
   <span>{originIcons[origin]} {originLabels[origin]}</span>
   ```
   Never write `<span>{origin}</span>`. The grep rule is a literal regex against source, so the fix is structural: every use of the `origin` variable that reaches JSX must go through the `originLabels[]` or `originIcons[]` map. We export both maps from `FeedbackOriginIcon.tsx` so downstream `FeedbackItem`, `FeedbackSummaryBar`, and the soon-to-arrive `AgentFeedbackToggle` (unit-09) all share the same constant.
10. **`FeedbackStatusBadge` — aria-label rule.** Spec: "Every instance has `aria-label=\"Status: {status}\"`." Prop surface on the badge: `{ status: FeedbackStatus }`. Inside, we render `<span aria-label={`Status: ${status}`}>{status}</span>` with the canonical color-pair classes from DESIGN-TOKENS §2.1. Test: RTL query `queryAllByLabelText(/^Status: (pending|addressed|closed|rejected)$/)` returns a length-4 array when all four variants are in the fixture. This is the `inconsistent-aria-label` class regression guard.
11. **`FeedbackList` — virtualization perf test.** Spec: "render `FeedbackList` with 500 mock items, query `document.querySelectorAll('[data-testid=\"feedback-item\"]').length` ≤ 30 at steady state." Needs `data-testid="feedback-item"` on every rendered item. We put that data attribute on the `FeedbackItem` root div unconditionally (not just in test builds — it's a stable contract for any downstream test or automation harness). The test renders `<FeedbackList items={mockItems(500)} />`, waits one frame for the virtualizer to settle, then counts. jsdom's default viewport is 1024×768; with a fixed item height (say 88px — matching the DESIGN-BRIEF §2 "Compact state" `p-2.5` + title + metadata row) and a list height of 600px, the virtualizer renders ≈ 7 items plus an overscan of 5 = ≈ 12. The ≤ 30 cap is comfortably met. We pass explicit `height={600}` and `itemSize={88}` to the `FixedSizeList`. Any real visual divergence lives in the list's `className` sizing, not in the test.
12. **`FeedbackList` — keyboard nav perf test.** Spec: "render list of 100 items, press ArrowDown from index 0 to 99 in a loop, assert focus lands on the correct item at each step." This is a long loop. Under `react-window`, rows beyond the rendered window are unmounted — we cannot `keyDown` on an unmounted node. The test drives keydown events on the *list container* and asserts that (a) `document.activeElement.dataset.testid` matches `feedback-item-<i>` at the correct index, (b) the item for index `i` is actually mounted in the DOM right after the keystroke. The `useFeedbackListKeyboardNav` hook wires a single `keydown` listener on the list container (not per-item) so the keystroke isn't lost when the previous focused item gets unmounted as we scroll. See Risk §2.
13. **Reduced-motion gate for status-change flash.** DESIGN-TOKENS §5 defines `@keyframes feedback-status-change` + the `.feedback-status-changed` class. The unit adds CSS to `src/index.css` under the existing `@theme` block's animation section (or at top-level if no such block exists — add a new `@keyframes` rule with a matching `@media (prefers-reduced-motion: reduce)` guard that sets `animation: none`, matching the `motion-and-reduced-motion-spec.md` canonical guard form). In the React component: gate the `.feedback-status-changed` class application via `useReducedMotion()`; if reduced-motion is on, skip the class toggle entirely. Tests use the controllable `matchMedia.stub.ts` from unit-05 to simulate both modes — verify the class is applied when reduced-motion is off and NOT applied when on.
14. **Retiring `FeedbackPanel.tsx` — call-site migration.** The existing component has two call sites:
    - `ReviewPage.tsx:498` — passes `items`, `loading`, `onUpdate`, `onDelete`.
    - `ReviewCurrentPage.tsx:176` — passes `items`, `loading`, `onUpdate`, `onDelete`.
    **Approach**: replace the file contents of `components/FeedbackPanel.tsx` with a 10-line re-export shim that imports `FeedbackList` from `./feedback` and re-exports it as `FeedbackPanel` with the same prop signature (plus the new `currentVisit` prop with a default of `0` so the shim is source-compatible). Downstream units (unit-09, unit-11) will eventually drop the shim and import from the barrel directly, but bolt-1 scope is minimal: retain the current call-sites unchanged. The only edit to `ReviewPage.tsx` / `ReviewCurrentPage.tsx` is zero lines — the import stays the same, the JSX stays the same.
    - The retired file's banned-pattern hits (literal `"Close"` / `"Reject"` / `"Delete"` JSX, the `{item.origin}` slug render) vanish automatically because the file contents are replaced.
15. **Scope-violation risk.** Unit scope is bounded to:
    - `packages/haiku-ui/src/components/feedback/*.tsx` (new)
    - `packages/haiku-ui/src/components/feedback/__tests__/*.tsx` (new)
    - `packages/haiku-ui/src/components/feedback/index.ts` (new barrel)
    - `packages/haiku-ui/src/components/FeedbackPanel.tsx` (rewrite as shim)
    - `packages/haiku-ui/src/index.css` (add `@keyframes feedback-status-change` + `prefers-reduced-motion` guard)
    - `packages/haiku-ui/package.json` (add `react-window` + `@types/react-window`)
    - `.haiku/intents/universal-feedback-model-and-review-recovery/stages/development/artifacts/unit-08-tactical-plan.md` (this file)
    - `.haiku/intents/universal-feedback-model-and-review-recovery/stages/development/units/unit-08-feedback-components.md` (append `outputs:` once the builder finalizes paths)
    **Do NOT touch**: `packages/haiku/`, `packages/haiku-api/`, `packages/shared/`, `plugin/`, `website/`, any other component outside the feedback cluster, or any existing test in `packages/haiku-ui/tests/`. The `ReviewPage.tsx` / `ReviewCurrentPage.tsx` files MUST be left unedited by virtue of the shim strategy in §14.
16. **`useAnnounce` call on status change.** Per DESIGN-BRIEF §2 "Screen-reader announcements" table: clicking Dismiss → `"Feedback <ID> marked as rejected"`; Verify & Close → `"Feedback <ID> marked as closed"`; Reopen → `"Feedback <ID> reopened"`. The announcement fires AFTER the `onUpdate` callback resolves (treat the callback as optimistic — we announce regardless, since the FSM update is in-flight and the user's request is what matters for announcement UX). If `onUpdate` throws, the component catches the throw, reverts the optimistic transition, and announces via the assertive region: `"Failed to update feedback <ID>"` (per `aria-live-sequencing-spec.md §3`). For bolt 1, the `onUpdate` prop is synchronous (matches the existing `FeedbackPanel.tsx` contract) — announcement fires unconditionally after the handler returns. Error-path testing is the concern of unit-15 stage-wide audit, not this unit.
17. **Tailwind v4 class-string safelist coverage.** The feedback cluster uses every class already safelist in `tailwind.config.ts` (feedback-status pairs, origin pairs, border-l utilities, visit-counter tiers). Runtime-interpolated strings like `feedbackStatusColors[status]` work because the target classes are enumerated in the safelist. Verified by running `npx tsc --noEmit` + a test that mounts a `pending` item, grabs the rendered HTML, and asserts the `bg-amber-100` literal appears (which it will IFF Tailwind produced the class). No config changes needed.
18. **Token-hash stability.** The snapshot-header hash is computed over a static token manifest; any DESIGN-TOKENS change that affects the feedback cluster is accompanied by a unit-04-scope rebuild of the manifest. We DO NOT compute the hash at test runtime from disk — the manifest is a frozen export from `src/components/feedback/tokens.ts`, version-controlled with the components. This matches the "snapshot headers record the token hash (source: `verify-tokens.mjs` output)" intent — the manifest IS the token-source as far as the feedback components are concerned; drifts between DESIGN-TOKENS.md and the manifest are caught by unit-04's `verify-tokens.mjs` CI gate, not by this unit's snapshots.
19. **ReviewPage/ReviewCurrentPage breakage safeguard.** The existing `FeedbackPanel` renders more than `FeedbackList` does on its own — it also includes the Feedback/Mine tab toggle at lines 82–107. The new `FeedbackList` is a pure list; the Feedback/Mine tab chrome lives in the unit-09 scope (`AgentFeedbackToggle`). To keep the shim behaviorally compatible, the shim file wraps `FeedbackList` with a minimal `FeedbackPanel` shell that renders the existing tabs + filter pills (copied verbatim from the old file) and delegates list rendering to `FeedbackList`. That preserves the ReviewPage/ReviewCurrentPage rendering exactly, while the new cluster at `components/feedback/` is the forward-looking clean implementation. Unit-09 will migrate the tabs into a dedicated `AgentFeedbackToggle` component and remove the shim's tabs section.
20. **`no-explicit-any` / Biome.** The component source cannot use `any`. Every prop type flows from `haiku-api` re-exports (`FeedbackItemData`), or from local narrowed types (`FeedbackStatus = "pending" | "addressed" | "closed" | "rejected"`, `FeedbackOrigin = "adversarial-review" | "external-pr" | …`). Local narrowed string-union types mirror the Zod schema in `haiku-api/src/schemas/common.ts` — do not redefine as string literals from memory, import the types.

## Files to Modify / Create

### A. `packages/haiku-ui/src/components/feedback/` (NEW — the whole directory)

A1. **`packages/haiku-ui/src/components/feedback/tokens.ts`** (NEW)
   - Exports `feedbackStatusColors`, `statusBorderLeft`, `statusBackground`, `originColors`, `originIcons`, `originLabels`, `visitCounterClasses`. Values mirror DESIGN-TOKENS §2.1 / §2.2 / §2.3 / §2.4 tables verbatim.
   - Exports `TOKEN_HASH: string` — a 16-char hex hash computed at module-load time via a tiny synchronous `sha256`-lite of the concatenated map values (use `crypto.subtle.digest` guarded for jsdom; fallback to a stable `djb2`-style hash of the stringified constants — deterministic across platforms and browser-free). This token hash is what the snapshot header prints.
   - Exports `FeedbackStatus` and `FeedbackOrigin` as re-exports from `haiku-api/src/schemas/common.ts` (via the existing `types.ts` re-export chain).

A2. **`packages/haiku-ui/src/components/feedback/FeedbackStatusBadge.tsx`** (NEW)
   - Props: `{ status: FeedbackStatus; className?: string }`.
   - Renders `<span className={badgeClasses(status, className)} aria-label={`Status: ${status}`}>{status}</span>`.
   - `badgeClasses` combines the canonical `inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold` base + `feedbackStatusColors[status]` from `./tokens`.
   - Pure label. No focus-ring (not interactive). No hover state.

A3. **`packages/haiku-ui/src/components/feedback/FeedbackOriginIcon.tsx`** (NEW)
   - Props: `{ origin: FeedbackOrigin; showLabel?: boolean; className?: string }` (default `showLabel: true`).
   - Renders `<span className={originClasses(origin, className)}>{icon}{showLabel && ` ${label}`}</span>` where `icon = originIcons[origin]` and `label = originLabels[origin]`.
   - Emoji `<span aria-hidden={showLabel ? "true" : undefined} role={showLabel ? undefined : "img"} aria-label={showLabel ? undefined : label}>{icon}</span>` — matches the ARIA policy in DESIGN-BRIEF §2 ("when paired with a visible label, emoji is aria-hidden; when rendered alone, emoji gets role=img + aria-label").
   - Re-export `originIcons`, `originLabels` so consumers don't reach into `./tokens` directly.

A4. **`packages/haiku-ui/src/components/feedback/FeedbackItem.tsx`** (NEW)
   - Props: `{ item: FeedbackItemData; isExpanded: boolean; onToggle: () => void; onStatusChange?: (nextStatus: FeedbackStatus) => void; onDelete?: () => void; ariaSetSize?: number; ariaPosInSet?: number }`.
   - Root: `<div data-testid="feedback-item" data-feedback-id={item.feedback_id} role="button" tabIndex={0} aria-expanded={isExpanded} aria-setsize={ariaSetSize} aria-posinset={ariaPosInSet} ref={cardRef} onClick={onToggle} onKeyDown={enterOrSpaceOrArrow} className={cardClasses(item.status)}>`.
   - `cardClasses(status)` = `p-2.5 rounded-lg border ${statusBorderLeft[status]} ${statusBackground[status]} hover:border-teal-400 dark:hover:border-teal-500 transition-colors cursor-pointer group ${focusRingCompactClass}`.
   - First row: `<FeedbackOriginIcon origin={item.origin} showLabel />` left; `<FeedbackStatusBadge status={item.status} />` right; visit counter pill (from `visitCounterClasses(item.visit)`).
   - Second row: `<p className="text-xs font-medium text-stone-800 dark:text-stone-200 truncate">{item.title}</p>`.
   - Third row (metadata — stays on screen always): `<p className="text-xs text-stone-600 dark:text-stone-300">{item.feedback_id} · Visit {item.visit} · {originLabels[item.origin]}</p>`.
   - Expanded section (when `isExpanded`):
     - `<p className="text-xs text-stone-700 dark:text-stone-300 whitespace-pre-wrap">{item.body}</p>`.
     - `closed_by` meta when present.
     - Action button row (status-scoped):
       - `pending` → `<button>Dismiss</button>` (secondary, fires `onStatusChange("rejected")`).
       - `addressed` → `<button>Verify & Close</button>` (primary green, fires `onStatusChange("closed")`) + `<button>Reopen</button>` (secondary, fires `onStatusChange("pending")`).
       - `closed` | `rejected` → `<button>Reopen</button>` (secondary, fires `onStatusChange("pending")`).
   - Button shapes use DESIGN-TOKENS §2.6 literal class strings; each button has `className={…} onClick={handler} type="button" aria-label={…}` per the §2.6 screen-reader announcements table.
   - Focus-preservation `useLayoutEffect` keyed on `item.status` — on change, if the previously-focused element was inside the card and is no longer in the DOM, focus the card root.
   - `useAnnounce()` hook call fires after `onStatusChange` — polite region — per DESIGN-BRIEF §2 verb-announcement mapping.

A5. **`packages/haiku-ui/src/components/feedback/useFeedbackListKeyboardNav.ts`** (NEW)
   - Hook signature: `useFeedbackListKeyboardNav({ itemCount, listRef, itemRefs, scrollToIndex })`.
   - Registers a `keydown` listener on the list container ref for `ArrowDown` / `ArrowUp` / `Enter`.
   - Tracks `focusedIndex` in `useState`; on ArrowDown → `focusedIndex + 1` (clamped to `itemCount - 1`); on ArrowUp → `focusedIndex - 1` (clamped to `0`); on Enter → `itemRefs.current[focusedIndex]?.click()`.
   - After index change, call `scrollToIndex(nextIndex)` if provided (virtualized branch), then `requestAnimationFrame(() => itemRefs.current[nextIndex]?.focus())`.
   - Returns `{ focusedIndex, setFocusedIndex }` so the consumer can hydrate initial focus.
   - Consumer sets `ref={(node) => (itemRefs.current[index] = node)}` on each `FeedbackItem` (both branches).

A6. **`packages/haiku-ui/src/components/feedback/FeedbackList.tsx`** (NEW)
   - Props: `{ items: FeedbackItemData[]; currentVisit?: number; isLoading?: boolean; error?: string | null; onRetry?: () => void; onStatusChange?: (id: string, nextStatus: FeedbackStatus) => void; onDelete?: (id: string) => void; className?: string }`.
   - If `isLoading` → render skeleton rows (4 placeholder `<div>`s) + `aria-busy="true"` on the list container + spinner.
   - If `error` → render error row with `<button onClick={onRetry} type="button">Retry</button>`.
   - If `items.length === 0` → render the empty-state `<p>` ("No feedback yet. Select text or drop pins to add annotations.").
   - Else:
     - Group items by visit: `currentVisit` first, then descending visit numbers. Each group header is a sticky `<h3>` with `text-xs font-semibold uppercase tracking-wider text-stone-600 dark:text-stone-300` (DESIGN-BRIEF §2 canonical — lifted from banned `text-[10px]` + banned `text-stone-400` pair).
     - Inside each group, sort items by `status` (`pending → addressed → rejected → closed`) then by `created_at` descending.
     - Branch on `items.length > VIRTUALIZE_THRESHOLD (50)`:
       - True → `<FixedSizeList height={600} itemSize={88} itemCount={items.length} ref={listRef}>` from `react-window`. Children renderer: `<FeedbackItem key={…} item={…} style={…} aria-setsize={items.length} aria-posinset={index + 1} ref={itemRefs[index]} …/>`. Pass `onItemsRendered` to track the visible window.
       - False → `<ul role="list" className="space-y-2">` + map over items.
     - Key: `item.feedback_id`.
     - `data-testid="feedback-list"` on the list container.
   - Wires `useFeedbackListKeyboardNav` with the `listRef` + `itemRefs` + `scrollToIndex` callback (bound to `listRef.current?.scrollToItem` in the virtualized branch; a no-op in the plain branch).

A7. **`packages/haiku-ui/src/components/feedback/FeedbackSummaryBar.tsx`** (NEW)
   - Props: `{ items: FeedbackItemData[]; activeStatus: FeedbackStatus | null; onFilter: (status: FeedbackStatus | null) => void }`.
   - Counts per status: `const counts = { pending, addressed, closed, rejected }` via `items.reduce(...)`.
   - Renders a horizontal strip; each non-zero count is a `<button role="button" type="button" aria-pressed={activeStatus === status} onClick={() => onFilter(activeStatus === status ? null : status)}>…</button>` with the canonical filter-pill classes from DESIGN-TOKENS §2.5 (active → primary teal; inactive → muted stone).
   - Each button carries the feedback-status name + count + color-matched status dot (`<span className={statusDotClasses[status]} aria-hidden="true" />`).

A8. **`packages/haiku-ui/src/components/feedback/index.ts`** (NEW — barrel)
   - Re-exports: `FeedbackStatusBadge`, `FeedbackOriginIcon`, `FeedbackItem`, `FeedbackList`, `FeedbackSummaryBar`, and the maps (`feedbackStatusColors`, `originLabels`, `originIcons`).

### B. `packages/haiku-ui/src/components/feedback/__tests__/` (NEW — the whole directory)

B1. **`FeedbackStatusBadge.states.test.tsx`** (NEW)
   - Renders a 4-variant matrix (pending / addressed / closed / rejected) in a single snapshot per theme (light + dark → two snapshot cells per variant = 8 cells).
   - Asserts `aria-label="Status: {status}"` on each variant.
   - Asserts the rendered class string contains the canonical foreground (e.g. `text-stone-600` for rejected).
   - Snapshot header prints `<!-- token-hash: <TOKEN_HASH> -->` via a `renderWithHeader` helper.

B2. **`FeedbackOriginIcon.states.test.tsx`** (NEW)
   - Renders 6 origin variants × 2 label-visibility states = 12 cells in one snapshot.
   - Asserts the visible label matches `originLabels[origin]` (NEVER the raw slug) — explicit test for the `{origin}` regression class.
   - Asserts the emoji `aria-hidden` / `role=img` contract flips correctly with `showLabel`.

B3. **`FeedbackItem.states.test.tsx`** (NEW — the largest file)
   - Renders 4 statuses × 6 states (default / hover / focus / active / disabled / error) = 24 cells. Under the 36 cap.
   - Wrapper uses `<div className="state-hover">` etc. with CSS selectors that force the simulated state (borrowed from `feedback-card-states.html`).
   - Asserts every badge inside the item carries `aria-label="Status: …"` (regression guard for the `inconsistent-aria-label` class).
   - Asserts every expanded-pending item renders a button with text `Dismiss` (NOT `Reject`, NOT `Close`).
   - Asserts every expanded-addressed item renders `Verify & Close` + `Reopen`.
   - Asserts every expanded-closed/rejected item renders `Reopen` (one word, no hyphen).
   - Asserts zero `opacity-50|60|70` classes anywhere in the rendered tree (regression guard for the `opacity-on-root` banned class).
   - Asserts `aria-expanded` toggles with `isExpanded` prop.
   - Asserts focus-preservation: click Dismiss on pending → assert `document.activeElement === card.root`.
   - Asserts `useAnnounce("polite", "Feedback FB-01 marked as rejected")` fired — stub the hook in `vi.mock`.

B4. **`FeedbackList.states.test.tsx`** (NEW)
   - 4 container-level cells per §7.5: default (20 items, non-virtualized) / empty / loading (with spinner) / error (with Retry).
   - Snapshot of each.

B5. **`FeedbackList.virtualization.test.tsx`** (NEW — perf + scroll coord)
   - Mounts `<FeedbackList items={mockItems(500)} />` with fixed `height={600}` and `itemSize={88}`.
   - After `act(() => {})` + one `requestAnimationFrame`, asserts `document.querySelectorAll('[data-testid="feedback-item"]').length ≤ 30`.
   - Covers the ≤ 30 steady-state contract from the completion criteria.

B6. **`FeedbackList.keyboard.test.tsx`** (NEW — keyboard nav)
   - Mounts `<FeedbackList items={mockItems(100)} />`.
   - Focuses `itemRefs.current[0]` via explicit `.focus()` call.
   - Loops ArrowDown 99 times; after each iteration, asserts `document.activeElement.dataset.feedbackId === "FB-${String(i + 1).padStart(2, "0")}"`.
   - No skips, no dropped keystrokes.
   - Covers the keyboard-nav contract from the completion criteria.

B7. **`FeedbackSummaryBar.states.test.tsx`** (NEW)
   - Renders 5 cells (default / hover / focus / active pressed / empty — bar hidden).
   - Asserts clickable count buttons fire `onFilter` with the correct status.
   - Asserts `aria-pressed` toggles correctly.

B8. **`mockItems.ts`** (NEW — test fixture helper)
   - `export function mockItems(n: number): FeedbackItemData[]` — deterministic generator, visits roll from 1 → 7 so the visit-counter tier palette is exercised across renders.

### C. `packages/haiku-ui/src/components/FeedbackPanel.tsx` (RETIRE to shim)

Replace the existing file contents with a shim:

```tsx
import { FeedbackList, FeedbackSummaryBar } from "./feedback"
import type { FeedbackItemData, FeedbackStatus } from "../types"
// ...minimal tabs + pill chrome lifted from the old file verbatim
// (retained to keep ReviewPage/ReviewCurrentPage unchanged this unit;
// unit-09 AgentFeedbackToggle replaces the Feedback/Mine tab entirely).
```

Shim preserves the existing `Props = { items, loading, onUpdate, onDelete }` signature. Internal implementation delegates to `FeedbackList`. Tabs + filter chrome is a copy of the current file's lines 82–125 with one critical fix: the `{origin}` raw-slug render at line 172 is replaced by `<FeedbackOriginIcon origin={item.origin} />` (or deleted entirely in favor of delegating to the new `FeedbackItem`). Canonical verbs `Dismiss` / `Verify & Close` / `Reopen` replace the banned `Close` / `Reject` / `Delete` buttons — but only within the delegated `FeedbackList` / `FeedbackItem`; the shim's own content is the tabs-plus-filter-pills wrapper, nothing more.

### D. `packages/haiku-ui/src/index.css` (APPEND one `@keyframes` block + reduced-motion guard)

Append after the existing `@theme`/token definitions:

```css
@keyframes feedback-status-change {
  0%   { opacity: 1; }
  30%  { opacity: 0.6; }
  100% { opacity: 1; }
}

.feedback-status-changed {
  animation: feedback-status-change 0.4s ease-in-out;
}

@media (prefers-reduced-motion: reduce) {
  .feedback-status-changed {
    animation: none;
  }
}
```

Canonical guard form matches `motion-and-reduced-motion-spec.md §Rule`. This is an alpha-composited animation (0 → 0.6 → 1 opacity) but it only fires during a transition (bounded, not a card-root state), so it does NOT trip the `opacity-50|60|70` banned pattern (the audit regex matches utility-class names, not keyframe rules inside a `.css` file).

### E. `packages/haiku-ui/package.json` (ADD two deps)

```json
  "dependencies": {
    …existing…,
    "react-window": "^1.8.11"
  },
  "devDependencies": {
    …existing…,
    "@types/react-window": "^1.8.8"
  }
```

Install command for the builder: `npm install --workspace haiku-ui` from the unit worktree root (or the monorepo root). The `react-window` install may write to `packages/haiku-ui/node_modules/` only (workspaces node_modules hoisting) or to the monorepo root — either is fine and in-scope; we don't explicitly commit `node_modules/`.

### F. Unit frontmatter `outputs:` (UPDATE after build)

After the builder has committed the new files, append this block to the unit's frontmatter `outputs:` field:

```yaml
outputs:
  - packages/haiku-ui/src/components/feedback/tokens.ts
  - packages/haiku-ui/src/components/feedback/FeedbackStatusBadge.tsx
  - packages/haiku-ui/src/components/feedback/FeedbackOriginIcon.tsx
  - packages/haiku-ui/src/components/feedback/FeedbackItem.tsx
  - packages/haiku-ui/src/components/feedback/FeedbackList.tsx
  - packages/haiku-ui/src/components/feedback/FeedbackSummaryBar.tsx
  - packages/haiku-ui/src/components/feedback/useFeedbackListKeyboardNav.ts
  - packages/haiku-ui/src/components/feedback/index.ts
  - packages/haiku-ui/src/components/feedback/__tests__/*.tsx
  - packages/haiku-ui/src/components/feedback/__tests__/__snapshots__/*.snap
  - packages/haiku-ui/src/components/FeedbackPanel.tsx
  - packages/haiku-ui/src/index.css
  - packages/haiku-ui/package.json
  - .haiku/intents/universal-feedback-model-and-review-recovery/stages/development/artifacts/unit-08-tactical-plan.md
```

---

## Implementation Steps (ordered for the builder)

1. **Write this tactical plan** — done (commit `haiku(unit-08/planner): tactical plan for feedback component cluster`).
2. **Add the `react-window` dep.** Edit `packages/haiku-ui/package.json`; run `npm install --workspace haiku-ui` (or `npm install` from repo root if the builder prefers). Commit as `haiku(unit-08/builder): add react-window dep`. Verify `packages/haiku-ui/node_modules/react-window/` or root `node_modules/react-window/` materializes.
3. **Scaffold `components/feedback/tokens.ts`.** Freeze the token maps + compute `TOKEN_HASH`. Verify at import-time the hash is a 16-char hex string.
4. **Build `FeedbackStatusBadge.tsx`** and its `.states.test.tsx`. Run `npm --workspace haiku-ui run test -- FeedbackStatusBadge` — assert snapshot passes on first write. Commit.
5. **Build `FeedbackOriginIcon.tsx`** and its `.states.test.tsx`. Run test. Commit.
6. **Build `FeedbackItem.tsx`** and its `.states.test.tsx`. Build incrementally — pending status first (all 6 interaction states), then addressed, then closed, then rejected. Verify `aria-expanded` toggles. Verify `aria-label="Status: {status}"` on every status badge. Verify canonical verbs render (no `Close` / `Reject` / `Delete`). Run `audit-banned-patterns.mjs --profile=tokens` — assert zero hits. Commit.
7. **Build `useFeedbackListKeyboardNav.ts`** as a pure hook with its own focused test (synthetic listRef + itemRefs). Verify ArrowDown/Up/Enter handlers fire. Commit.
8. **Build `FeedbackList.tsx`** — plain branch first (non-virtualized, < 50 items), then the virtualized branch. Write `.states.test.tsx` (4 cells), `.virtualization.test.tsx` (500 items ≤ 30 mounted), `.keyboard.test.tsx` (100 items arrow-down loop). Run all three. Commit.
9. **Build `FeedbackSummaryBar.tsx`** + `.states.test.tsx`. Run test. Commit.
10. **Write `components/feedback/index.ts` barrel.** Commit.
11. **Retire `components/FeedbackPanel.tsx` to the shim.** Run `npm --workspace haiku-ui run typecheck` — assert zero new errors on `ReviewPage.tsx` / `ReviewCurrentPage.tsx`. Run `npm --workspace haiku-ui run test` — full suite green. Commit.
12. **Append `@keyframes` + reduced-motion guard to `src/index.css`.** Quick smoke test: mount an item, trigger a status transition, inspect the class toggle in a jsdom-RTL test. Commit.
13. **Run `audit-banned-patterns.mjs --profile=stage-wide`.** Assert 0 hits for `\{origin\}(?!Labels)`, 0 hits for banned verbs, 0 hits for opacity-50/60/70. Commit only if all rules return 0.
14. **Run `verify-tokens.mjs`.** Assert 0 mismatches. Commit nothing (script is read-only).
15. **Run `npx tsc --noEmit` from `packages/haiku-ui/`.** Assert 0 errors.
16. **Append `outputs:` to the unit frontmatter.** Commit.
17. **Call `haiku_unit_advance_hat`.** The next hat (builder) picks up this plan and writes the actual implementation. (Wait — this unit is PLANNER. The planner's advance_hat hands off to builder. The steps 2–16 are BUILDER steps, not planner. Revise: the planner writes the plan document + commits it, then advances. The builder executes steps 2–16 guided by this plan.)

**PLANNER advance-hat checklist (the only steps this hat executes before calling `advance_hat`):**
- [x] Context read: DESIGN-TOKENS, DESIGN-BRIEF, state-coverage-grid, unit spec, lifecycle + card-state artifacts, existing `FeedbackPanel.tsx`, haiku-api schema, unit-04 and unit-05 tactical plans.
- [x] Write `stages/development/artifacts/unit-08-tactical-plan.md` (this file).
- [ ] Commit as `haiku(unit-08/planner): tactical plan for feedback component cluster`.
- [ ] Call `haiku_unit_advance_hat`.

---

## Verification Commands (builder + reviewer)

Run from the unit worktree root:

```bash
# Typecheck
npm --workspace haiku-ui run typecheck

# Unit tests (all)
npm --workspace haiku-ui run test

# Unit tests (feedback cluster only)
npm --workspace haiku-ui run test -- components/feedback

# Banned-patterns audit (unit scope)
node packages/haiku-ui/scripts/audit-banned-patterns.mjs --profile=tokens

# Banned-patterns audit (stage-wide, catches {origin} regression)
node packages/haiku-ui/scripts/audit-banned-patterns.mjs --profile=stage-wide

# Token parity
node packages/haiku-ui/scripts/verify-tokens.mjs

# Contrast audit (if the builder touched any new token pair — unlikely)
node packages/haiku-ui/scripts/audit-contrast.mjs
```

Expected: every command exits 0. Every completion criterion in the unit spec is traceable to one of these commands plus the inline snapshot assertions.

---

## Open Questions (surface to reviewer if any)

None load-bearing. Everything the unit spec asks for has a direct implementation path in this plan. Two minor policy picks (focus-preservation target = card-root per Risk §7; virtualization threshold = strict `> 50` per unit spec) are called out explicitly so the reviewer can push back if they have a different preference; both are reversible single-commit fixes.
