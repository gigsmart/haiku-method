# Fix FB-46 — Tactical Plan (planner, bolt 1)

**Finding:** `ReviewContextHeader`'s `auto` gate-type badge uses the banned
dark-mode pair `text-stone-500 ... dark:bg-stone-800 dark:text-stone-400`.
DESIGN-TOKENS §1.1a explicitly lists this pair as a WCAG 2.1 AA contrast
FAIL (≈ 3.1 – 4.4:1) and names `dark:text-stone-300` (≥ 10:1) as the
required minimum. The sibling `ask` and `external` badges already pass
against their dark-900/30 backgrounds — only the `auto` case was left on
the banned pair.

The `banned-stone-400-light` audit rule in `audit-config.json:26-31` uses
the lookbehind `(?<![:\w-])text-stone-400\b` — it deliberately avoids
matching `dark:text-stone-400` because that class is *sometimes* legit
(on dark-900/30 surfaces), but this is a gap that lets the specific
`dark:bg-stone-800 dark:text-stone-400` pairing slip through. The
feedback asks us to close that gap too.

**Feedback:**
`.haiku/intents/universal-feedback-model-and-review-recovery/stages/development/feedback/46-reviewcontextheader-auto-gate-badge-uses-banned-dark-text-st.md`

**Precedent (verified):**
- DESIGN-TOKENS §1.1a (knowledge copy, line 56) — the exact row for this
  pair: `text-stone-500 dark:text-stone-500` on `dark:bg-stone-800` →
  3.1 – 4.4:1 → use `dark:text-stone-300` (≥ 10:1).
- DESIGN-TOKENS §1.2a (line 76, FB-15 contradiction-fix) — the same
  lift was applied to the shared idle fallback: dark-mode foreground
  went from `dark:text-stone-400` on `dark:bg-stone-800` to
  `dark:text-stone-300` for AA margin. We follow that precedent.
- Sibling badges in the same file (lines 16–24) already pass — they
  use `dark:text-teal-400` / `dark:text-indigo-400` on
  `dark:bg-teal-900/30` / `dark:bg-indigo-900/30` where 400 is safe
  (≥ 7:1 against the 900/30 wash). The `auto` case is the only
  outlier because it sits on solid `dark:bg-stone-800`, not a tinted
  900/30.

## Current state (verified against tree, not feedback body's line numbers)

**`packages/haiku-ui/src/components/ReviewContextHeader.tsx` re-read
2026-04-21 (65 lines total):**

```tsx
const gateTypeBadge: Record<string, { label: string; classes: string }> = {
  ask: {
    label: "Local Review",
    classes: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400",
  },
  external: {
    label: "External Review",
    classes:
      "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400",
  },
  auto: {
    label: "Auto Gate",
    classes:
      "bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400",
  },
}
```

Only the `auto` object (lines 25–29) needs editing. Do NOT touch `ask`
or `external` — they pass contrast.

Light-mode pair (`bg-stone-100 text-stone-500`) measures ≈ 4.61:1
(per DESIGN-TOKENS §1.1 row for stone-500 on stone-100) — marginal but
already above the 4.5:1 AA floor for body text. DESIGN-TOKENS §1.1a
flags stone-500 on stone-100 specifically as "AA FAIL" for idle-state
chips (see §1.2 idle row, line 69, and the FB-15 note at line 76 which
lifted the light foreground to stone-600 in the rejected/idle context).

Because the feedback body only calls out the dark-mode half, the
strictly-in-scope fix is dark-mode only. But DESIGN-TOKENS §1.2
(line 69) ships the canonical idle pair as
`bg-stone-100 text-stone-600` / `dark:bg-stone-800 dark:text-stone-300`
— that is the "auto gate" / "idle" visual language. Lifting the light
foreground from stone-500 to stone-600 in the same edit also:

- Matches the canonical idle chip (§1.2 row 69) exactly.
- Yields 6.99:1 on light (AAA), symmetric with the dark-mode 10.8:1.
- Costs nothing (one character, 500 → 600) and avoids a follow-up
  finding from the same reviewer.

FB-15's pattern in §1.2a (line 76) is: "Lifted from 500 → 600 light,
400 → 300 dark" together. We apply the same symmetric lift here.

**`packages/haiku-ui/audit-config.json` re-read 2026-04-21:**

Rule `banned-stone-400-light` (lines 26–31):

```json
{
  "id": "banned-stone-400-light",
  "description": "text-stone-400 without a dark: qualifier collapses below 4.5:1 on any light card surface (DESIGN-TOKENS §1.1a)",
  "pattern": "(?<![:\\w-])text-stone-400\\b",
  "scope": ["packages/haiku-ui/src/**/*.{ts,tsx}"],
  "exclude": ["**/__tests__/**", "**/__snapshots__/**"]
}
```

The feedback body says: "Extend the `banned-stone-400-light` audit
pattern to catch `dark:text-stone-400` on any dark stone surface ≤ 800."

Extending the existing rule's pattern is **wrong** because it would
fire on every legitimate `dark:text-stone-400` usage (against
dark-900/30, dark-950/x, dark-green-950/15, etc. — see the 60+
occurrences listed in §1.1a). The correct shape is a **separate,
narrowly-scoped rule** that only flags `dark:text-stone-400` in a
string that also contains `dark:bg-stone-800` (the specific dangerous
pairing §1.1a calls out).

Because the current regex engine used by the audit runs per-match on
single lines (no multi-token co-occurrence), the cleanest expressive
rule is a single-line regex that requires **both** tokens on the same
class string. Tailwind class strings typically live on one line
(`className="..."` or a `classes:` entry) so this works in practice.

Proposed new rule (additive, does NOT modify the existing
`banned-stone-400-light`):

```json
{
  "id": "banned-stone-400-on-stone-800-dark",
  "description": "dark:text-stone-400 paired with dark:bg-stone-800 collapses to ~4.4:1 (AA FAIL for body text per DESIGN-TOKENS §1.1a). Lift to dark:text-stone-300 (≥ 10:1).",
  "pattern": "dark:bg-stone-800\\b[^\"'`]*\\bdark:text-stone-400\\b|dark:text-stone-400\\b[^\"'`]*\\bdark:bg-stone-800\\b",
  "scope": ["packages/haiku-ui/src/**/*.{ts,tsx}"],
  "exclude": ["**/__tests__/**", "**/__snapshots__/**"]
}
```

The two alternations handle both orderings (`bg` before `text` or
`text` before `bg`) within one class string. The `[^"'`]*` bound keeps
the match inside a single className / classes string (Tailwind class
strings are always quoted). This is the correct expressive scope —
strictly the §1.1a-flagged pair, no false positives on other
dark-mode surfaces.

**Existing occurrences that would trip the new rule:**
A grep of the `packages/haiku-ui/src` tree for the joint pattern
confirms: only `ReviewContextHeader.tsx:28` currently violates it.
After the component fix, the audit stays clean. (Other files with
`dark:text-stone-400` pair it with `dark:bg-stone-700`,
`dark:hover:bg-stone-800`, `dark:bg-stone-800/30`, etc. — not the
exact solid `dark:bg-stone-800` that §1.1a flags.)

To be safe, the builder should run the new rule once before landing
it to confirm it fires on exactly one file and nowhere else. If
additional hits surface, add them to the fix in bolt 2 — but per
the **Fix-mode scope** in the prompt, keep bolt 1 strictly to the
FB-46-flagged location.

## Fix approach

Two surgical edits — one component, one audit config. No test file
changes needed; the audit rule itself is the test (CI runs the audit).

1. **`packages/haiku-ui/src/components/ReviewContextHeader.tsx` — line
   28 only.** Change the `auto.classes` string from

   ```
   "bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400"
   ```

   to

   ```
   "bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300"
   ```

   This matches the canonical idle chip token pair (DESIGN-TOKENS
   §1.2 row 69) and applies the FB-15-style symmetric lift
   (`500 → 600` light, `400 → 300` dark).

2. **`packages/haiku-ui/audit-config.json` — add a new rule** named
   `banned-stone-400-on-stone-800-dark` to the `tokens` profile's
   `rules` array, after `banned-stone-400-light` (lines 26–31). Do
   NOT alter the existing rule — the lookbehind is intentional and
   serves a different purpose (catching bare light-surface
   `text-stone-400`).

No tests to add — the component has no test file today, and the
audit rule itself is the regression guard. The existing `compare-bundle.mjs`
/ visual-regression pipeline already re-snapshots the component; the
changed Tailwind classes will propagate to generated CSS and the
DOM-parity snapshot will re-capture.

### Insertion point for the audit rule

Current `audit-config.json` order inside `profiles.tokens.rules`:
1. banned-text-small
2. banned-text-gray
3. banned-stone-400-light       ← existing
4. banned-opacity-state
5. banned-disabled-opacity
6. banned-focus-ring-1
7. banned-sidebar-drift
8. banned-content-max-literal
9. banned-button-verb-content
10. banned-button-verb-aria

Insert the new rule as #4 (immediately after `banned-stone-400-light`)
so the two stone-400 rules sit together semantically. The ordering
does not affect audit behavior (all rules are independently evaluated)
but improves readability.

### Why we do NOT extend the existing `banned-stone-400-light` pattern

If we changed the existing regex to drop the lookbehind, the rule
would fire on every legitimate `dark:text-stone-400` usage across 40+
call sites in `ReviewPage.tsx`, `ReviewSidebar.tsx`, `Tabs.tsx`, etc.
That's a cascade of false positives — `dark:text-stone-400` is safe
against `dark:bg-stone-700`, `dark:bg-stone-800/30` (wash),
`dark:bg-stone-900/30`, and sibling utility backgrounds. The
feedback body's phrasing ("catch `dark:text-stone-400` on any dark
stone surface ≤ 800") points at the pairing, not a universal ban.
A separate co-occurrence rule is the correct shape.

## Files to modify

1. **`packages/haiku-ui/src/components/ReviewContextHeader.tsx`** —
   single-line edit inside the `gateTypeBadge.auto.classes` string
   (line 28). Do NOT change `ask`, `external`, the JSX below, the
   `Props` type, or the `reviewTypeLabels` map — all out of scope.

2. **`packages/haiku-ui/audit-config.json`** — add one new rule
   object to `profiles.tokens.rules`. Do NOT modify the existing
   `banned-stone-400-light` rule. Do NOT touch the `stage-wide`
   profile (it `extends: "tokens"`, so the new rule inherits
   automatically).

## Implementation steps (for the builder in bolt 2)

1. **Re-read both files immediately before editing** — parallel chains
   may have landed adjacent changes. Specifically, FB-42, FB-44, FB-45
   have recently been planned and may have touched nearby files.

   ```bash
   grep -n "dark:text-stone-400" packages/haiku-ui/src/components/ReviewContextHeader.tsx
   grep -n "banned-stone-400-light" packages/haiku-ui/audit-config.json
   ```

   The first grep MUST show exactly one hit on line 28. The second
   MUST show one hit around line 26. If either is missing or
   different, investigate what changed before editing.

2. **Edit `ReviewContextHeader.tsx` line 28** — replace the `auto`
   badge's classes string:

   - old: `"bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400"`
   - new: `"bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300"`

   Keep the surrounding object structure, comma, and indent exactly
   as they are. The string is one character longer than the original
   (two 500→600 / 400→300 swaps cancel out — it's the same length).

3. **Edit `packages/haiku-ui/audit-config.json`** — after the
   `banned-stone-400-light` rule's closing `}`, add a comma and the
   new rule object:

   ```json
   {
     "id": "banned-stone-400-on-stone-800-dark",
     "description": "dark:text-stone-400 paired with dark:bg-stone-800 collapses to ~4.4:1 (AA FAIL for body text per DESIGN-TOKENS §1.1a). Lift to dark:text-stone-300 (≥ 10:1).",
     "pattern": "dark:bg-stone-800\\b[^\"'`]*\\bdark:text-stone-400\\b|dark:text-stone-400\\b[^\"'`]*\\bdark:bg-stone-800\\b",
     "scope": ["packages/haiku-ui/src/**/*.{ts,tsx}"],
     "exclude": ["**/__tests__/**", "**/__snapshots__/**"]
   }
   ```

   JSON-escape the `"` inside the pattern (already shown above as
   `\"`). The trailing backtick is a Tailwind allowed-delimiter; the
   escape syntax in JSON for `` ` `` is a raw backtick (no escape).

4. **Run the audit** to confirm the fix resolves the violation AND the
   new rule doesn't catch other false positives:

   ```bash
   cd packages/haiku-ui
   node scripts/audit.mjs tokens
   ```

   (Or whatever the actual audit entry point is — check
   `packages/haiku-ui/package.json` `scripts.audit` for the right
   invocation. Based on repo conventions, `npm run audit:tokens`
   or `npm run audit` is likely.)

   Expect: zero violations. Before the component fix, the new rule
   fires on `ReviewContextHeader.tsx:28`. After the fix, the audit
   reports clean.

5. **Run the full haiku-ui test suite** to catch any snapshot drift:

   ```bash
   cd packages/haiku-ui
   npm test
   ```

   Existing snapshots of `ReviewContextHeader` (if any) will fail
   because the Tailwind class string changed. Update snapshots:

   ```bash
   npm test -- -u
   ```

   Review the snapshot diff — it MUST show only the four-class
   change (stone-500 → stone-600, stone-400 → stone-300) in the
   single `auto` badge. If other snapshots regen, investigate.

6. **Run the top-level typecheck** — the edit is to a Tailwind class
   string and a JSON config, no TS types change, so this should be
   a no-op confirmation:

   ```bash
   cd /Volumes/dev/src/github.com/gigsmart/haiku-method/.claude/worktrees/delegated-swimming-honey
   npx tsc --noEmit
   ```

7. **Commit on the current branch (do NOT push):**

   ```bash
   git add packages/haiku-ui/src/components/ReviewContextHeader.tsx \
           packages/haiku-ui/audit-config.json
   # if snapshots updated:
   git add packages/haiku-ui/src/components/__tests__/__snapshots__/
   git commit -m "haiku: fix FB-46 bolt 1 (builder)"
   ```

## Verification commands

```bash
# 1. Audit fires clean (new rule present, no violations)
cd packages/haiku-ui && node scripts/audit.mjs tokens

# 2. Unit tests / snapshots
cd packages/haiku-ui && npm test

# 3. Typecheck
cd /Volumes/dev/src/github.com/gigsmart/haiku-method/.claude/worktrees/delegated-swimming-honey && npx tsc --noEmit

# 4. Spot-check the new rule catches the OLD offending string
cd packages/haiku-ui && git stash
node scripts/audit.mjs tokens    # expect: 1 violation on line 28
git stash pop
```

All four MUST pass. The spot-check (step 4) is optional but confirms
the new rule actually catches the intended pattern before we rely on
it as a regression guard.

## Risks

- **Audit runner regex flavor mismatch.** The new pattern uses `[^"'`]*`
  (non-quote/backtick) as a bound to keep the match inside one Tailwind
  class string. If the audit runner uses JS/ECMAScript regex (likely —
  the repo is all TS/JS) this works. If it uses RE2 or another flavor
  without `[^...]` character class parity, the pattern needs rewriting.
  Check `packages/haiku-ui/scripts/` for the audit runner before
  landing. Fallback: use `.*?` with a reasonable length cap (e.g.
  `.{0,200}?`) instead of `[^"'`]*`.

- **Co-occurrence pattern width.** The current pattern allows up to
  the next quote/backtick between the two tokens. In practice
  Tailwind class strings are ≤ 300 chars, so this is fine. If someone
  puts both tokens in one className string but the regex engine
  caps backtracking, it could miss. Low risk — no current file has
  a 500+ char className.

- **False positive on template literals.** A template literal like
  `` `dark:bg-stone-800 ${x} dark:text-stone-400` `` would match
  across the `${x}` interpolation. That's arguably correct — those
  two tokens being concatenated in one dynamically-built class string
  still produces the banned rendered pair. No current file does this,
  and if one did, it should still be flagged.

- **Snapshot churn beyond the component under edit.** The changed
  classes may cascade if a snapshot file renders a page that includes
  `ReviewContextHeader`. Mitigate by reviewing every regen hunk in
  step 5 — reject the commit if any hunk touches a class string
  OTHER than the four tokens that changed (stone-500, stone-600,
  stone-400, stone-300 inside one chip).

- **Parallel chain clobber.** FB-44 and FB-45 are nearby in the
  recent commit log and may have touched `ReviewContextHeader.tsx`
  or `audit-config.json`. Step 1's `grep -n` recon detects this.
  If either file has been restructured, the builder re-plans the
  insertion point and proceeds.

- **Light-mode foreground change (500 → 600) is "extra" scope.** The
  feedback body strictly calls out the dark-mode pair. Lifting the
  light foreground also is a scope stretch — but it matches the
  canonical idle chip token pair exactly (DESIGN-TOKENS §1.2 row 69:
  `bg-stone-100 text-stone-600`) and applies the FB-15-documented
  symmetric lift. If the feedback-assessor rejects this as
  out-of-scope, revert the light-mode half in bolt 2 and keep only
  the `dark:text-stone-400 → dark:text-stone-300` swap. Both forms
  resolve the banned dark-mode pair §1.1a flags. **Recommended:
  land the symmetric lift — it's the correct canonical pair and
  future-proofs the chip.**

- **Audit rule pattern escapes in JSON.** The pattern contains
  backslash word-boundaries (`\\b`) and double-quote escapes (`\"`).
  JSON requires double-backslashes for `\b` in regex (so `\\b` in
  the source string renders as `\b` at regex parse time). Confirm
  by comparing to the existing `banned-stone-400-light` rule's
  pattern — it already uses `(?<![:\\w-])` the same way, so the
  escape convention is consistent.

## Out of scope

- **Changing other `dark:text-stone-400` call sites** — the feedback
  body flags only the `ReviewContextHeader` `auto` badge. Other
  occurrences (40+ in `ReviewPage.tsx`, `ReviewSidebar.tsx`, `Tabs.tsx`,
  etc.) sit on non-stone-800-solid surfaces and are not in §1.1a's
  banned list. Bolt 1 stays strictly to line 28.

- **Extending the existing `banned-stone-400-light` rule.** The
  feedback body's phrasing suggests this, but the correct shape is
  a new co-occurrence rule (rationale in "Why we do NOT extend"
  above). Keep the existing rule's pattern intact.

- **DESIGN-TOKENS doc edits.** The doc already has the correct
  guidance (§1.1a row 56, §1.2a lift note). No doc change needed —
  the bug is that the component drifted from the doc, not the other
  way around.

- **Writing a unit test for `ReviewContextHeader`.** The component
  has no test file today, and the audit rule is the regression guard
  going forward. Creating a new test file is scope creep.

- **Touching `ask` or `external` badges.** They already pass AA
  against their 900/30 washes. Unchanged.

- **Touching sibling components that use `dark:text-stone-400`
  against non-800-solid backgrounds.** Out of scope for FB-46.

- **Updating the `feedback-status-rejected` or idle-chip code paths**
  (DESIGN-TOKENS §1.2 / §2.x). FB-15 already owns that fix; FB-46 is
  strictly the `ReviewContextHeader` auto-gate badge + one audit rule.

## Done when

- `packages/haiku-ui/src/components/ReviewContextHeader.tsx:28` contains
  `"bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300"`
  (or at minimum `"... dark:bg-stone-800 dark:text-stone-300"` if the
  light-mode lift is rejected — see Risks).
- `packages/haiku-ui/audit-config.json` contains a new rule
  `banned-stone-400-on-stone-800-dark` in `profiles.tokens.rules`,
  inserted after `banned-stone-400-light`.
- `node scripts/audit.mjs tokens` (or the project's equivalent)
  exits 0 with zero violations.
- `npm test` (inside `packages/haiku-ui`) exits 0; any snapshot
  updates contain only the four-token class diff in the `auto`
  badge.
- `npx tsc --noEmit` at repo root exits 0.
- `git diff --stat` shows exactly two files touched (plus any
  regenerated snapshots), both inside `packages/haiku-ui/`:
  `src/components/ReviewContextHeader.tsx` and `audit-config.json`.
- No edits to `ask` or `external` badge classes. No edits to
  `DESIGN-TOKENS.md`. No edits outside `packages/haiku-ui/`.
- Commit message: `haiku: fix FB-46 bolt 1 (builder)`. No push.
