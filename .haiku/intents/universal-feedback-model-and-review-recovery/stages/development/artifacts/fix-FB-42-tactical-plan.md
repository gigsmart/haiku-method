# Fix FB-42 — Tactical Plan (planner, bolt 1)

**Finding:** `index.css annotation-pin + inline-highlight + comment-entry ship raw hex + rgba magic numbers`.
**Feedback:** `.haiku/intents/universal-feedback-model-and-review-recovery/stages/development/feedback/42-index-css-annotation-pin-inline-highlight-comment-entry-ship.md`

## TL;DR

`packages/haiku-ui/src/index.css` is the only CSS file the `banned-raw-hex`
audit rule excludes wholesale (via `packages/haiku-ui/audit-config.json:160`).
That carve-out exists so `@theme { --color-feedback-* }` oklch literals don't
trip the hex regex, but it has quietly become a dumping ground for
component-level raw hex/rgba/rgb magic in `.annotation-pin`, `.inline-highlight`,
`.comment-entry`, `.margin-comment`, `dialog.feedback-sheet` (+ backdrop),
dark-mode override, and `@keyframes feedback-fab-pulse`. The fix promotes
every literal to a named CSS custom property in `@theme` / `:root` and
rewrites the component rules to reference those tokens, so a future accent
swap is one-line-per-token and the audit keeps the file clean.

## Root cause

Two structural problems converged:

1. **The exclusion is too wide.** `audit-config.json` `banned-raw-hex` lists
   `packages/haiku-ui/src/index.css` as a blanket exclude because the
   `@theme` block declares tokens. A per-line allow (like the `audit-allow`
   comment convention used in `.tsx`) would have forced every raw literal
   outside the `@theme` block to justify itself. The `audit-banned-patterns.mjs`
   allow-list regex (`/\/\/\s*audit-allow:|\{\/\*\s*audit-allow:/`, script
   line 186) only matches `// …` and `{/* … */}` comment forms, not plain
   CSS `/* … */`, so even a narrowed exclude couldn't use the same marker.
2. **Canvas-2D escape hatches leaked into CSS.** `AnnotationCanvas.tsx:130,478`
   legitimately uses raw `#e11d48` because the Canvas-2D API takes hex
   strings, annotated with `// audit-allow: canvas 2D context takes raw hex
   (rose-600)`. That excuse does not apply to DOM-rendered `.annotation-pin`
   markers in CSS — CSS has `var(--…)` and should use it. The same colour
   now lives in two places (canvas context + CSS pin) with zero shared
   source of truth, so any accent swap must patch both.

DESIGN-TOKENS §1.8 (`knowledge/DESIGN-TOKENS.md:223–225`) already admits the
debt: it lists `#e11d48`, `rgba(251, 191, 36, …)`, and `#3b82f6` under
"Semantic Colors (Named Roles)" with no canonical token assigned. This fix
closes that gap by creating the tokens and wiring the CSS to them.

## Fix approach

All work happens in two files:

- `packages/haiku-ui/src/index.css` — add named tokens to `@theme`/`:root`,
  rewrite component rules to reference them.
- `packages/haiku-ui/audit-config.json` — narrow the `banned-raw-hex`
  exclude so `src/index.css` is audited with a deliberately-tight per-rule
  exemption only for the `@theme` declaration block (the `oklch(…)` values
  don't match the `#[0-9a-fA-F]{6}` pattern anyway, so the only remaining
  hex after this fix is INSIDE `:root` / `@theme` token declarations that
  are DEFINING the canonical values — any future raw hex outside those
  blocks will now fail the audit).

### Token additions

Add to `@theme` (so Tailwind also emits `bg-*`/`text-*` utilities if a
future consumer wants them; these align with DESIGN-TOKENS §1.8 naming):

```css
@theme {
    /* …existing feedback + origin aliases… */

    /* Annotation pin (DESIGN-TOKENS §1.8 "Annotation red" — rose-600). */
    --color-annotation-pin-bg: oklch(63.52% 0.237 22.75);    /* #e11d48 (rose-600) */
    --color-annotation-pin-fg: oklch(100% 0 0);              /* #fff */
    --color-annotation-pin-selected-outline: oklch(62.3% 0.214 259.81); /* #3b82f6 (blue-500) */

    /* Inline highlight (DESIGN-TOKENS §1.8 "Inline highlight" — amber-400).
       Declared at 1.0 opacity; component rules derive faded states via
       color-mix(in oklch, var(--color-highlight), transparent NN%). */
    --color-highlight: oklch(82.82% 0.189 84.43);            /* #fbbf24 (amber-400) */

    /* Active comment border / hover tint (DESIGN-TOKENS §1.8 "Active comment
       border" — blue-500). */
    --color-comment-active: oklch(62.3% 0.214 259.81);       /* #3b82f6 */

    /* Pulse ring (teal-600) — FeedbackFloatingButton keyframe. */
    --color-pulse-ring: oklch(60.05% 0.118 184.7);           /* #0d9488 (teal-600) */

    /* Scrim used by <dialog>::backdrop. 50% black by design. */
    --color-scrim: oklch(0% 0 0 / 0.5);

    /* Drop shadow tint (pin box-shadow). 30% black. */
    --color-shadow-soft: oklch(0% 0 0 / 0.3);

    /* Dark-mode sheet surface — matches Tailwind stone-900. */
    --color-sheet-surface-dark: oklch(21.47% 0.006 56.04);   /* #1c1917 (stone-900) */
}
```

### Component rule rewrites (exact mapping)

| Current (line) | After |
|---|---|
| `.annotation-pin { background: #e11d48 }` (138) | `background: var(--color-annotation-pin-bg);` |
| `.annotation-pin { color: #fff }` (139) | `color: var(--color-annotation-pin-fg);` |
| `.annotation-pin { box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3) }` (146) | `box-shadow: 0 2px 6px var(--color-shadow-soft);` |
| `.annotation-pin { border: 2px solid #fff }` (150) | `border: 2px solid var(--color-annotation-pin-fg);` |
| `.annotation-pin.selected { outline: 2px solid #3b82f6 }` (165) | `outline: 2px solid var(--color-annotation-pin-selected-outline);` |
| `.inline-highlight { background-color: rgba(251, 191, 36, 0.3) }` (171) | `background-color: color-mix(in oklch, var(--color-highlight), transparent 70%);` |
| `.inline-highlight { border-bottom: 2px solid rgba(251, 191, 36, 0.7) }` (172) | `border-bottom: 2px solid color-mix(in oklch, var(--color-highlight), transparent 30%);` |
| `.inline-highlight:hover, .inline-highlight.active { background-color: rgba(251, 191, 36, 0.5) }` (179) | `background-color: color-mix(in oklch, var(--color-highlight), transparent 50%);` |
| `.comment-entry:hover, .comment-entry.active { border-color: #3b82f6 }` (201) | `border-color: var(--color-comment-active);` |
| `.comment-entry:hover, .comment-entry.active { background-color: rgba(59, 130, 246, 0.05) }` (202) | `background-color: color-mix(in oklch, var(--color-comment-active), transparent 95%);` |
| `.margin-comment { border-left: 3px solid rgba(251, 191, 36, 0.7) }` (205) | `border-left: 3px solid color-mix(in oklch, var(--color-highlight), transparent 30%);` |
| `:where(.dark) dialog.feedback-sheet { background: #1c1917 }` (254) | `background: var(--color-sheet-surface-dark);` |
| `dialog.feedback-sheet::backdrop { background: rgba(0, 0, 0, 0.5) }` (258) | `background: var(--color-scrim);` |
| `@keyframes feedback-fab-pulse { … rgb(13 148 136 / 0.4) … }` (311) | `box-shadow: 0 0 0 0 color-mix(in oklch, var(--color-pulse-ring), transparent 60%);` |
| `@keyframes feedback-fab-pulse { … rgb(13 148 136 / 0) … }` (314) | `box-shadow: 0 0 0 8px transparent;` |

Rationale for `color-mix` over dedicated opacity tokens: introducing seven
separate `--color-highlight-30`, `--color-highlight-50`, etc. tokens bloats
the surface area and hides the "these are all derived from `--color-highlight`"
relationship. `color-mix(in oklch, …, transparent NN%)` is broadly supported
(Safari 16.2+, Chrome 111+, Firefox 113+) and is the idiom Tailwind v4 itself
emits for `bg-amber-400/30`. For the transparent endpoint in the pulse
keyframe (originally `rgb(13 148 136 / 0)`), `transparent` is semantically
identical and short-circuits the mix.

White (`#fff`) is tokenised as `--color-annotation-pin-fg` rather than a
generic `--color-white` to keep the token name descriptive. If the same
literal surfaces elsewhere, a future fix can alias or rename — not this
fix's scope.

### `banned-raw-hex` exclusion narrowing

Today (`audit-config.json:158–167`):
```jsonc
"exclude": [
    "packages/haiku-ui/src/index.css",    // ← too wide
    "**/__tests__/**",
    …
]
```

After this fix, the component rules contain zero hex literals, so
`src/index.css` SHOULD be in scope of the audit. The only remaining hex
inside the file would be in `/* #xxxxxx (tailwind name) */` trailing
comments next to the token declarations. The audit regex
(`#[0-9a-fA-F]{6}\b`) matches anywhere in a line including comments, so we
have two choices:

1. **Strip the hex comments entirely** — annotate tokens with the Tailwind
   colour name in prose (`/* rose-600 → oklch(...) */` without the `#`).
2. **Keep the hex documentation comments and narrow the exclude** so only
   the lines 14-55 `@theme { … }` + `:root { … }` declaration block is
   exempted, not the whole file.

Option 1 is cleaner — no audit-script changes needed, token intent is
communicated by the Tailwind colour name and the variable name — but loses
the "what hex does this round-trip to?" reviewer signal. Option 2 needs a
script change (add CSS comment form `/* audit-allow: … */` to `allowRe` in
`audit-banned-patterns.mjs:186`) and a per-line annotation on every token
declaration.

**Chosen: Option 1.** Reasons:
- Keeps the audit script untouched (smaller blast radius, no risk of
  introducing a CSS-specific allow-list bug).
- Token variable names already encode colour intent
  (`--color-annotation-pin-bg` is obviously the annotation pin's
  background; the Tailwind roster name in a trailing
  `/* rose-600 */` comment is enough).
- Forces future additions to use `oklch()` / `var(…)` / `color-mix(…)` —
  raw hex becomes an audit failure with no escape hatch, which is exactly
  the posture the finding prescribes.

So: every `@theme` token declaration uses the comment form
`/* rose-600 (was #e11d48) */` ONCE (no bare `#xxxxxx` in the comment),
and the audit-config exclude for `packages/haiku-ui/src/index.css` is
removed.

Example token declaration comment AFTER the hex strip:
```css
--color-annotation-pin-bg: oklch(63.52% 0.237 22.75); /* rose-600 */
```
The Tailwind name alone is enough provenance; the oklch values are the
canonical truth.

## Files to modify

1. `packages/haiku-ui/src/index.css`
   - Add the eight new tokens inside the existing `@theme { … }` block
     (between the origin aliases and the closing brace).
   - Rewrite every component-rule literal per the mapping table above
     (14 touchpoints spanning annotation-pin, inline-highlight,
     comment-entry, margin-comment, dialog.feedback-sheet, dark-mode
     override, and the feedback-fab-pulse keyframe).

2. `packages/haiku-ui/audit-config.json`
   - Remove `"packages/haiku-ui/src/index.css"` from the
     `banned-raw-hex.exclude` array (line 160). Keep the rest of the
     array intact.

## Verification

1. `cd packages/haiku-ui && npx vitest run tests/audit-banned-patterns.test.ts` — audit passes with the narrowed exclude (no `banned-raw-hex` hits anywhere).
2. `cd packages/haiku-ui && node scripts/audit-banned-patterns.mjs` — sanity-run directly; exits 0.
3. `grep -nE '#[0-9a-fA-F]{6}\\b|rgba?\\(' packages/haiku-ui/src/index.css` — should return 0 results. (Hex appears in token names only via `var(--…)` references now.)
4. `cd packages/haiku-ui && npx tsc --noEmit` — compile clean (no TS changes expected, but sanity).
5. Visual smoke test: `cd packages/haiku-ui && npx vitest run src/pages/review/__tests__` — no regressions in the review-page tests that render `.annotation-pin` / `.feedback-sheet`.
6. If a focused visual regression snapshot exists for `AnnotationCanvas`, run it; otherwise confirm via component story / dev harness that pin colour, selected outline, inline-highlight tint, and FAB pulse glow look identical before/after.

## Risks

- **Token naming churn.** Other files might already reference
  `--color-feedback-*` etc. Double-check: none of the eight new token
  names collide with existing entries in `@theme` or `:root` — all new.
- **`color-mix` browser support.** Baseline is Safari 16.2 / Chrome 111 /
  Firefox 113 (Mar 2023). If the SPA targets older Safari, the pulse keyframe
  and inline-highlight fades degrade to invalid color and render transparent.
  The `.browserslistrc` / `package.json` `browserslist` should already cover
  this — verify before shipping. If it doesn't, fall back to dedicated
  `--color-highlight-30`, `-50`, `-70` tokens rather than `color-mix`.
- **Audit-config narrowing surfaces other debt.** Removing the
  `src/index.css` exclude may reveal hex literals elsewhere in the CSS
  that FB-42 didn't enumerate (I only enumerated the ones the reviewer
  flagged + everything grep caught in §Current hex inventory below). Run
  the audit after the edit; if NEW hits appear (say, a value I didn't
  see), tokenise them the same way — do NOT re-widen the exclude.
- **Token whiteness for pin border.** `--color-annotation-pin-fg` does
  double-duty (text colour + border colour) on `.annotation-pin` — both
  semantically "the contrast layer against the pin background". If a
  future designer wants the border a different shade from the numeral,
  they'll need to split the token. Leaving that as an intentional
  two-role alias, documented by the `color: var(…); border: 2px solid
  var(…);` usage in the same rule.
- **Dark-mode token for sheet surface.** Using oklch equivalent of
  stone-900 is semantically correct, but Tailwind's `@theme` emits
  `--color-stone-900` natively — we could reference
  `var(--color-stone-900)` directly and skip declaring
  `--color-sheet-surface-dark`. Decision: keep the dedicated
  `--color-sheet-surface-dark` alias because future sheet-surface skin
  changes (e.g., darker-than-stone-900) shouldn't have to touch the
  stone palette root.

## Anti-patterns avoided

- No new unit spec created — strict fix-mode.
- No FSM field touched.
- No behavioural change to JS/TS modules — this is CSS + audit-config
  only.
- No change to `audit-banned-patterns.mjs` — the script stays
  CSS-comment-unaware, forcing future additions to route through token
  names instead of inline allow-comments (aligns with finding's
  prescription to "remove the blanket exclusion" rather than paper over
  it with more allowlists).
- Color-mix fades over opacity-variant tokens (avoids token-surface
  bloat; still inspectable via DevTools computed style).

## Builder hand-off notes

1. Add tokens to `@theme { … }` in **alphabetical-ish cluster order** —
   group the annotation-pin trio, then `--color-highlight`, then
   `--color-comment-active`, then the scrim/shadow/sheet/pulse
   utilities. Consistency with the existing `--color-feedback-*` /
   `--color-origin-*` grouping makes the block scannable.
2. When rewriting keyframe step two (line 314 `rgb(13 148 136 / 0)`),
   use `transparent` (not `var(--color-pulse-ring)` with 100%
   transparency via color-mix) — it's semantically identical, shorter,
   and avoids a pointless `color-mix` wrapper.
3. After editing, re-run the audit and grep verifications from
   §Verification *before* committing. The assessor hat will re-run them
   on bolt 2; catching any missed literal now saves a round-trip.
4. Commit message: `haiku: fix FB-42 bolt 1 (planner)` per the
   FSM-issued instructions.
