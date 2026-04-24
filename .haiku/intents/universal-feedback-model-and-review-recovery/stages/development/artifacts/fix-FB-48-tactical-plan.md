# Fix Plan: FB-48 — Primitive tests assert exact Tailwind class names instead of behavior

Owner: planner (fix-mode, bolt 1)
Target finding: `.haiku/intents/universal-feedback-model-and-review-recovery/stages/development/feedback/48-primitive-tests-assert-exact-tailwind-class-names-instead-of.md`

## Problem statement (reviewer's claim, verified)

Every test file in `packages/haiku-ui/src/components/primitives/__tests__/` asserts on exact Tailwind class strings as a proxy for behavior. Verified by reading each file:

| File | Lines with class-string assertions | What's being "tested" |
|---|---|---|
| `Button.test.tsx` | `24-27` (enabled loop), `43-48` (primary-disabled), `59-61` (secondary-disabled) | focus ring token, opacity ban, disabled token pair |
| `Badge.test.tsx` | `22-25` (tone loop), `32-35` (neutral), `40-47` (sizes) | pill shape, neutral text token, typography floor |
| `Card.test.tsx` | `13-18` (flat), `23-26` (raised), `29-38` (padding table), `55-56` (opacity ban) | elevation tokens, surface, padding |
| `Chip.test.tsx` | `13-16` (neutral), `20-22` (teal), `27-29` (muted), `49-51` (focus ring) | tone tokens, focus ring |
| `Divider.test.tsx` | `14-17` (horizontal), `22-25` (vertical), `30-32` (surface) | size + orientation, surface token |
| `Input.test.tsx` | `14-18` (valid), `22-24` (invalid), `33-38` (disabled), `48-52` (focus ring) | border tokens, aria-invalid, disabled pair, focus ring |

Input is not in the FB-48 file list but exhibits the same pattern and must be swept in the same pass (same primitive suite, same mandate, same anti-pattern).

### What's actually under contract vs what's coupled to implementation

The primitives have two separable contracts:

**Behavioral / public-API contract (what we MUST assert):**
- HTML element & role (e.g. `<button>`, `role="separator"`, span label).
- ARIA wiring: `aria-disabled`, `aria-invalid`, `aria-orientation`, `aria-label`, forwarded `aria-*` props.
- Variant × size × tone × elevation × padding × orientation — the primitive's **API surface**. Today these are not observable on the DOM at all; they're only inferable from the class string. Fix: expose them as `data-variant`, `data-size`, `data-tone`, `data-elevation`, `data-padding`, `data-orientation` attributes. This makes the API observable without coupling tests to token names.
- Props passthrough: `className` merges, arbitrary HTML attrs forwarded, `ref` forwarded.
- Disabled/invalid interaction: `disabled` on `<button>` and `<input>` blocks events; `aria-invalid` communicates state.
- Event wiring: `onRemove` fires on `Chip` remove button click.
- Visible presence: focus ring exists (via `:focus-visible` pseudo-class, checked via `getComputedStyle` only when possible in jsdom).

**Token-mapping contract (delegated to auxiliary audits, NOT duplicated in unit tests):**
- Which Tailwind token pair expresses each (variant, state) combination — already audited in:
  1. `packages/haiku-ui/scripts/audit-contrast.mjs` (deterministic WCAG 2.1 token-pair contrast).
  2. `packages/haiku-ui/scripts/audit-banned-patterns.mjs` + `tests/audit-banned-patterns.test.ts` (bans `opacity-{50,60,70}`, bans `text-stone-500` on `bg-stone-100`, bans `focus:ring-1`).
  3. `packages/haiku-ui/tests/a11y-pages.spec.tsx` (axe-core at page level; structural a11y including roles and aria).

Coupling primitive unit tests to specific token strings duplicates (2)/(3) and breaks the moment the design system swaps tokens — even when the outcome is preserved.

### Why the existing tests are "implementation detail"

- `Button.test.tsx:43-48` breaks if the team moves from `bg-green-300` to `bg-green-200`, even if both pass `audit-contrast.mjs`.
- `Card.test.tsx:29-38` breaks if padding scales are renamed (e.g. `p-3` → `p-4` for a new scale) even if the spacing contract is preserved.
- `Badge.test.tsx:40-47` asserts `text-[11px] font-bold` — if tokens move to `text-xs font-extrabold`, test fails; visual typography floor is preserved.
- `Divider.test.tsx:14-25` asserts `h-px`/`w-full` directly — a switch to `border-t` expressing the same 1px rule would fail the test.

The mandate line (primitives/**tests** header files reference `knowledge/` stage rules) says: **tests assert on behavior and outcomes, not implementation details**.

## Fix strategy (chosen approach)

The feedback body lists two suggested fixes. We adopt **Option 2** (public-API observability via `data-*` attributes) as the primary fix, and **Option 1** (delegation to the contrast audit) as the explicit responsibility-chain comment. Rationale:

- Option 2 is cheap: each primitive adds a single `data-variant` / `data-tone` / etc. attribute on the root element. One `useMemo`-equivalent is unnecessary — the prop is already in scope. Zero runtime cost.
- Option 2 makes the API observable to tests **and** to end-consumer code (e.g. Storybook visual testing, CSS-in-JS overrides, e2e selectors), so it pulls double duty.
- Option 1 alone (delegation to axe color-contrast) is not enough — axe color-contrast is disabled in `tests/a11y-pages.spec.tsx:149` because jsdom can't compute used colors on Tailwind-generated CSS. Any primitive-level axe color-contrast call would also be `incomplete`, not `pass`. The already-deterministic `audit-contrast.mjs` token audit fills that gap.
- Snapshot tests of the class string (the parenthetical in Option 2) would re-couple us to strings, so we skip them.

### New primitive API contract (source changes)

Add one `data-*` attribute per primitive, mirroring the TypeScript prop of the same name. These are **non-prefixed** (not `data-haiku-*`) because the primitives are the project's design-system primitives — there's no ambiguity with outer components.

| Primitive | Props today | `data-*` attributes to add |
|---|---|---|
| `Button` | `variant`, `size`, `disabled` | `data-variant={variant}`, `data-size={size}`. `disabled` is already observable via `disabled`/`aria-disabled`. |
| `Badge` | `tone`, `size` | `data-tone={tone}`, `data-size={size}`. |
| `Card` | `elevation`, `padding` | `data-elevation={elevation}`, `data-padding={padding}`. |
| `Chip` | `tone`, `onRemove` | `data-tone={tone}`. `onRemove` is observable by the presence of the inner `<button>`. |
| `Divider` | `orientation` | already has `aria-orientation={orientation}` — **no new attribute needed**. Tests should assert on `aria-orientation`. |
| `Input` | `invalid`, `disabled` | `data-invalid={invalid || undefined}`. `aria-invalid` already covers this, but `data-invalid` makes the API-side observable without assuming test authors read ARIA state. Keep `aria-invalid` too. |

All attributes use **conditional-undefined** (`disabled || undefined`) for booleans so they only serialize when truthy — React will omit the attribute otherwise, keeping the DOM clean and matching existing `aria-disabled` pattern at `Button.tsx:67`.

### Test rewrite shape — per file

All five listed files + `Input.test.tsx` get the same treatment:

1. **Keep** behavioral assertions: element tag, role, aria-*, disabled, focus/blur, event firing, ref forwarding, `className` passthrough, arbitrary-attr passthrough, children rendering.
2. **Replace** class-string assertions with `data-*` attribute equality checks where the test is proving API surface.
3. **Delete** redundant token-name assertions. The duplicate coverage lives in:
   - `scripts/audit-contrast.mjs` for color-pair WCAG.
   - `tests/audit-banned-patterns.test.ts` for the `opacity-*`, `focus:ring-1`, and `text-stone-500` on `bg-stone-100` bans.
   - `tests/a11y-pages.spec.tsx` for structural a11y.
4. **Add** at the top of each test file a short block-comment citing responsibility delegation:
   ```ts
   /**
    * Primitive tests assert behavioral + public-API contracts only:
    *   - DOM role / element
    *   - ARIA state (aria-disabled, aria-invalid, aria-orientation, aria-label)
    *   - data-* API attributes (data-variant, data-size, data-tone, data-elevation, data-padding)
    *   - Event wiring + ref + prop passthrough
    *
    * Token-pair contrast is audited by `scripts/audit-contrast.mjs`.
    * Banned token patterns (opacity-*, focus:ring-1, text-stone-500 on bg-stone-100)
    * are audited by `tests/audit-banned-patterns.test.ts`.
    * Structural a11y is audited by `tests/a11y-pages.spec.tsx`.
    * Re-asserting token strings here would couple the test to implementation detail
    * and duplicate those audits — FB-48.
    */
   ```
5. **Preserve** test count and test name clarity — rename `it(...)` strings to describe behavior, not the token (e.g. `"applies token-based disabled styles"` → `"exposes disabled state via disabled + aria-disabled"`).

### Concrete per-file rewrites

#### `Button.test.tsx`

Target shape (describe block `"Button primitive"`):

| # | Test name (new) | What it asserts |
|---|---|---|
| 1 | `"renders every variant × size combination with the documented API surface"` | Loop over variants × sizes. Per render: `btn` exists (tag=BUTTON), `btn.getAttribute("data-variant") === variant`, `btn.getAttribute("data-size") === size`, no `aria-disabled` attr. |
| 2 | `"exposes disabled state via disabled + aria-disabled + cursor semantics"` | Render `<Button disabled variant="primary">`. Assert: `btn.disabled === true`, `btn.getAttribute("aria-disabled") === "true"`, `btn.getAttribute("data-variant") === "primary"`. No class-string assertion. |
| 3 | `"disabled buttons do not fire onClick"` (NEW behavioral test) | `fireEvent.click(btn)` → `onClick` NOT called. Proves the `disabled` attribute semantics the tests were implicitly leaning on. |
| 4 | `"forwards ref to the underlying <button>"` | unchanged. |
| 5 | `"passes through arbitrary props + className"` | unchanged, but assert `className` merge on `className` string — this is the ONE place a class check is legitimate because the contract IS "your string is appended". Use `.className.split(/\s+/)` and check the extra token is present, rather than `.toContain("extra-class")` — also verifies `className` is tokenized correctly. |
| 6 | `"does not emit aria-disabled when enabled"` | unchanged. |

Remove: all `cls.toContain("bg-green-300")`, `text-green-800`, `cursor-not-allowed`, `focus-visible:ring-2`, `opacity-` regex assertions inside behavioral tests. The opacity-ban and focus-ring-token checks are already covered by `audit-banned-patterns.test.ts`.

Remove: the `"applies secondary-disabled token pair with border (non-text contrast 3:1)"` test entirely — that's 100% token-string coupling. The secondary-disabled contrast is verified by `audit-contrast.mjs`. Optionally replace with one test that `<Button variant="secondary" disabled>` still carries `data-variant="secondary"` + `disabled=true`.

#### `Badge.test.tsx`

| # | Test name (new) | What it asserts |
|---|---|---|
| 1 | `"renders a <span> with role-neutral inline label"` | Loop over tones. Per render: `span` exists, `span.getAttribute("data-tone") === tone`. No class-string checks. |
| 2 | `"accepts size prop and exposes data-size"` | md → `data-size="md"`. sm → `data-size="sm"`. Verify both renderable. |
| 3 | `"is a pure label — passes through className + arbitrary html attrs"` | unchanged, but also assert `data-tone` default (`neutral`). |

Remove: the `"neutral tone uses text-stone-600 (NOT banned text-stone-500 per FB-15)"` test — this is the canonical token-string-coupling anti-pattern. The FB-15 ban is already enforced by `audit-banned-patterns.test.ts` (via the regex profile). Keep a reference comment pointing at that audit.

Remove: the `"size=md at text-xs / size=sm at text-[11px] font-bold"` test. Typography floor is enforced by `audit-banned-patterns.test.ts` (§1.4 profile) — the behavioral contract is "sm is tighter than md", not the specific pixel value.

#### `Card.test.tsx`

| # | Test name (new) | What it asserts |
|---|---|---|
| 1 | `"renders a <div> carrying data-elevation and data-padding"` | Default render → `data-elevation="flat"`, `data-padding="md"`. Assert tag. |
| 2 | `"exposes elevation values (flat / raised) on data-elevation"` | Render each → `data-elevation === variant`. No class match. |
| 3 | `"exposes padding scale values (none/sm/md/lg) on data-padding"` | `it.each` table still drives parameter coverage, but asserts `data-padding` instead of class. |
| 4 | `"renders children + forwards className + arbitrary attrs"` | unchanged except drop token assertions. |

Remove: the `"never emits opacity-* state class"` test — again, `audit-banned-patterns.test.ts` covers this globally; duplicating it per primitive is churn. If we want belt-and-suspenders, move this single regex check into a centralized `primitives.banned-patterns.test.ts` that runs the regex across the rendered DOM of **all** primitives in one file — one assertion, full coverage. **Out of scope for this bolt** — note it for a follow-up unit.

#### `Chip.test.tsx`

| # | Test name (new) | What it asserts |
|---|---|---|
| 1 | `"renders a <span> with data-tone (default = neutral)"` | tag span, `data-tone="neutral"`. |
| 2 | `"exposes tone values on data-tone"` | render each of neutral/teal/muted, assert `data-tone === tone`. No class match. |
| 3 | `"remove button is present only when onRemove is provided and fires the callback"` | unchanged — this is purely behavioral. |
| 4 | `"remove button exposes aria-label + is focusable"` | assert `aria-label="Remove chip"`, assert tabindex is default (0 for a `<button>`). Drop the class-name focus-ring check; covered by `audit-banned-patterns.test.ts` (forbids `focus:ring-1`). |

#### `Divider.test.tsx`

| # | Test name (new) | What it asserts |
|---|---|---|
| 1 | `"carries role='separator' and aria-orientation='horizontal' by default"` | unchanged semantics; drop class-string check. |
| 2 | `"exposes orientation via aria-orientation"` | render horizontal and vertical; assert `aria-orientation` matches. |
| 3 | `"passes className + arbitrary attrs through"` | NEW — mirrors sibling primitives' passthrough coverage. |

Remove: the `"uses token-based stone background in both modes"` test — surface-token choice is implementation; structural a11y (role + orientation) is the behavioral contract.

#### `Input.test.tsx` (swept in the same commit for consistency)

| # | Test name (new) | What it asserts |
|---|---|---|
| 1 | `"renders an <input> with aria-invalid absent by default"` | tag INPUT, `aria-invalid` null, `data-invalid` null. |
| 2 | `"sets aria-invalid + data-invalid when invalid"` | render `<Input invalid />`. Assert both attrs = `"true"`. |
| 3 | `"exposes disabled state via disabled + aria-disabled"` | render `<Input disabled />`. Assert `disabled === true`, `aria-disabled === "true"`. |
| 4 | `"disabled input rejects user input"` (NEW behavioral) | `fireEvent.change` → value unchanged, or `input.disabled === true` blocks at event-dispatch level. This is the real behavioral check the prior test was trying to approximate. |
| 5 | `"forwards ref to the underlying <input>"` | unchanged. |

Remove: border-token assertions, `disabled:bg-stone-100` / `disabled:text-stone-600` / `disabled:border-stone-400`, and the focus-ring-token checks. All covered by the audit scripts.

## Files to modify

| Path | Change |
|---|---|
| `packages/haiku-ui/src/components/primitives/Button.tsx` | Add `data-variant={variant}`, `data-size={size}` on the rendered `<button>`. |
| `packages/haiku-ui/src/components/primitives/Badge.tsx` | Add `data-tone={tone}`, `data-size={size}` on the rendered `<span>`. |
| `packages/haiku-ui/src/components/primitives/Card.tsx` | Add `data-elevation={elevation}`, `data-padding={padding}` on the rendered `<div>`. |
| `packages/haiku-ui/src/components/primitives/Chip.tsx` | Add `data-tone={tone}` on the rendered `<span>`. |
| `packages/haiku-ui/src/components/primitives/Input.tsx` | Add `data-invalid={invalid || undefined}` on the rendered `<input>`. |
| `packages/haiku-ui/src/components/primitives/Divider.tsx` | **No change** — `aria-orientation` already exposes the orientation contract. |
| `packages/haiku-ui/src/components/primitives/__tests__/Button.test.tsx` | Rewrite per §"Concrete per-file rewrites". |
| `packages/haiku-ui/src/components/primitives/__tests__/Badge.test.tsx` | Rewrite per §"Concrete per-file rewrites". |
| `packages/haiku-ui/src/components/primitives/__tests__/Card.test.tsx` | Rewrite per §"Concrete per-file rewrites". |
| `packages/haiku-ui/src/components/primitives/__tests__/Chip.test.tsx` | Rewrite per §"Concrete per-file rewrites". |
| `packages/haiku-ui/src/components/primitives/__tests__/Divider.test.tsx` | Rewrite per §"Concrete per-file rewrites". |
| `packages/haiku-ui/src/components/primitives/__tests__/Input.test.tsx` | Rewrite per §"Concrete per-file rewrites". |

Twelve files touched — five primitive sources + six test files. No changes to `index.ts` (no new exports) or to `audit-*.mjs` (the audits already cover the delegated responsibilities).

### What this does NOT touch

- `packages/haiku-ui/src/components/primitives/index.ts` — no public API surface change beyond additive `data-*` attributes, which are HTML attribute passthrough, not typed props.
- `audit-contrast.mjs` / `audit-banned-patterns.mjs` — the delegated audits already exist; adding a reference comment pointing at them in test headers is documentation, not code.
- Other callers of the primitives across `src/pages/**` — the primitives' public TypeScript API is unchanged; `data-*` is purely additive in the DOM.

## Verification commands

Run from repo root (`/Volumes/dev/src/github.com/gigsmart/haiku-method/.claude/worktrees/delegated-swimming-honey`):

1. `cd packages/haiku-ui && npx vitest run src/components/primitives/__tests__ --reporter=verbose` — all six primitive test files green. Expect the rewritten suite to be smaller (fewer, more focused assertions) but equally failing on any regression of the behavioral contract.
2. `cd packages/haiku-ui && npx tsc --noEmit` — primitives compile. `data-*` attrs on JSX intrinsic elements are always typed as `string`, so no TS error.
3. `cd packages/haiku-ui && node scripts/audit-contrast.mjs --mode=tokens` — exit 0. Token audit still green (unchanged code).
4. `cd packages/haiku-ui && node scripts/audit-banned-patterns.mjs --profile=tokens` — exit 0. Banned-patterns audit still green (primitive sources unchanged in token content — only added data-* attrs).
5. `cd packages/haiku-ui && npx vitest run tests/audit-banned-patterns.test.ts` — exit 0, matching (4).
6. `cd packages/haiku-ui && npx vitest run tests/a11y-pages.spec.tsx` — exit 0. Structural a11y unchanged; added `data-*` attrs don't affect axe.
7. `cd packages/haiku-ui && npm run test` — full haiku-ui suite. Catches any downstream test that happened to query a primitive by class string (search-and-replace may be required — see R4).

All seven MUST pass. If any fail, the builder treats the fix as incomplete and iterates.

## Risk assessment

| Risk | Likelihood | Mitigation |
|---|---|---|
| **R1 — Downstream tests query primitives by Tailwind class** (e.g. `.querySelector(".bg-teal-600")`) | Medium | Before editing, `grep -rn "bg-teal-600\|text-green-800\|text-stone-600" packages/haiku-ui/src/pages packages/haiku-ui/tests` to find any coupled selectors and update them to `[data-tone="teal"]`, `[data-variant="primary"][disabled]`, etc. If such selectors exist they were always fragile; this fix makes them robust. |
| **R2 — Other primitive tests exist in sibling files not listed in FB-48** (Input) | High | Explicitly in scope — swept in this bolt. Same antipattern; fix once. |
| **R3 — Parallel fix chain edits one of the six test files** (FB-23, FB-54, FB-31, FB-40, FB-60, FB-65, FB-66) | Medium | Per the parallel-batch warning, re-read each file immediately before writing. The overlap set is most likely small: FB-23 touches `Tabs.tsx`, FB-31 touches `AgentFeedbackToggle`, FB-40 touches touch-target audit, FB-54 touches skip-link test, FB-60/65/66 touch `Feedback*` tests. None of those overlap the primitives test files directly, but cross-grep before writing. |
| **R4 — A `data-*` attribute collides with an existing HTML attribute** | Low | `data-variant`, `data-size`, `data-tone`, `data-elevation`, `data-padding`, `data-invalid` are all non-standard `data-*` names. Custom-elements proposals don't reserve these. Safe. |
| **R5 — React warns about `data-undefined` attribute values** | Low | React omits attributes whose value is `undefined`. That's why we use `invalid \|\| undefined` for booleans. For enum props with defaults (`variant="primary"`, `tone="neutral"`), the default value is always a string, so no `undefined` ever reaches the DOM. |
| **R6 — TypeScript complains that `data-*` props aren't typed on component Props** | Low | We're adding the attribute on the rendered element inside the component, not on the Props type. `HTMLAttributes<HTMLDivElement>` already allows `data-*` via the `[key: string]: unknown` index signature React adds. No type change needed. |
| **R7 — Divider has no prop that's not already on aria-orientation** | Intentional | Divider is explicitly called out as "no change." Tests assert on `aria-orientation`, which IS the behavioral contract. Adding `data-orientation` would duplicate. |
| **R8 — Removed tests (e.g. "neutral uses text-stone-600 NOT text-stone-500") represent real past regressions (FB-15)** | Medium | The **ban** is preserved — `audit-banned-patterns.test.ts` asserts the `text-stone-500 on bg-stone-100` pattern globally. Deleting the primitive-level reassertion doesn't weaken the ban; it centralizes it. Add a `// see: audit-banned-patterns.test.ts §FB-15` comment at the deletion site so the history trail isn't lost. |
| **R9 — Chip remove button's focus-ring assertion covered past regression**. FB-06 / FB-14 themes emphasize `focus-visible:ring-2`. | Medium | `audit-banned-patterns.test.ts` bans `focus:ring-1`; that's the regression-detection mechanism. Primitive test can drop the class check; the regression bar is still there at audit level. Document in the comment at top of `Chip.test.tsx`. |
| **R10 — Adding `data-variant` / `data-tone` attributes bloats the rendered HTML byte size** | Low | Typically +15 bytes per primitive instance. `unit-03` bundle-size budget is JS, not HTML; rendered HTML is either server-rendered (negligible overhead) or client-rendered from JS (`data-*` attr source is tiny). Not a budget concern. |

## Anti-patterns this fix explicitly avoids

- Coupling tests to Tailwind class strings (the FB-48 pattern itself).
- Snapshot testing the class string (superficially-better but still the same coupling).
- Inline `axe.run()` per primitive — redundant with `tests/a11y-pages.spec.tsx` and with `audit-contrast.mjs`.
- Hand-rolled contrast math inside the unit test — re-implementing `audit-contrast.mjs`.
- Using `computedStyle(...)` in jsdom to infer colors — jsdom doesn't resolve Tailwind class → color without a CSS pipeline, so any such assertion would fail or hang.
- Deleting tests without preserving the regression coverage elsewhere — every removed test either (a) re-asserts a now-centralized audit, or (b) is replaced by a behavioral equivalent.

## Out of scope for this bolt

- Centralizing all `opacity-*` and `focus:ring-1` checks into a single `primitives.banned-patterns.test.ts` that runs regex against the rendered DOM of every primitive variant (cleaner than per-primitive checks but churn beyond FB-48). Follow-up unit.
- Updating downstream page tests (e.g. `src/pages/review/__tests__/*.tsx`) that may also couple to class strings — not in the FB-48 file list and a bigger sweep. A new finding should be raised for those if they exhibit the same pattern.
- Deprecating `HTMLAttributes<HTMLSpanElement>` in favor of a narrower `PrimitiveProps` interface that explicitly lists allowed `data-*` attrs — API hardening, not a bug fix.
- Adding Storybook `args` wiring to use the new `data-*` attributes — no Storybook in this repo.
- Refactoring primitives to use a CSS-vars-per-variant layer (the "design-token layer" hypothetical in the feedback body). That's the exact scenario this fix makes cheap — but executing it is a design-stage initiative, not a test-quality fix.

## Handoff to builder

The builder receives:
1. This plan.
2. Five primitive source files at `packages/haiku-ui/src/components/primitives/{Button,Badge,Card,Chip,Input}.tsx`.
3. Six primitive test files at `packages/haiku-ui/src/components/primitives/__tests__/{Button,Badge,Card,Chip,Divider,Input}.test.tsx`.

Builder task: add the `data-*` attributes to the five primitives per §"Files to modify", rewrite the six test files per §"Concrete per-file rewrites", run the seven verification commands, and commit as `haiku: fix FB-48 bolt 1 (builder)`.
