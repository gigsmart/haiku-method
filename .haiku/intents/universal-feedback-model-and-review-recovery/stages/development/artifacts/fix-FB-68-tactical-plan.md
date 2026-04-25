# Fix FB-68 — Tactical Plan (planner, bolt 1)

**Finding:** DOM parity sanity assertion `expect(rendered.length).toBeGreaterThan(16)` in `packages/haiku-ui/tests/parity.spec.tsx:155` is effectively tautological — any non-trivial DOM string clears 16 characters, so a silently-broken render (e.g. `<div>Failed to load…</div>`) that regenerates the snapshot with `-u` would pass the sanity gate and lock in a broken baseline.
**Feedback:** `.haiku/intents/universal-feedback-model-and-review-recovery/stages/development/feedback/68-dom-parity-snapshot-test-passes-on-any-dom-16-characters.md`

## Root cause

Re-read `packages/haiku-ui/tests/parity.spec.tsx` at fix time (parallel-chain clobber guard):

- Line 151: `const rendered = normalizeDomSnapshot(container.innerHTML)` captures the post-hydration DOM.
- Line 155: the single "sanity" assertion is `expect(rendered.length).toBeGreaterThan(16)` — byte-count only, no content check.
- Lines 157–160: call `assertStructuralMarkers(fx.name, rendered, session)` which DOES check several real invariants (`<header`, `id="main-content"`, `"Powered by"`, `role="banner"`, `role="main"`, `role="contentinfo"`, skip link, live-regions) and fixture-specific title presence (review / question / direction).
- Line 164: `expect(rendered).toMatchSnapshot(\`dom-${fx.name}.html\`)` is the regression gate.

The structural-marker block is the real defense. The 16-char sanity check adds nothing meaningful: a page that crashed and rendered `<div>Failed to load session</div>` (~40 chars) would pass the size gate AND would still fail `assertStructuralMarkers` on `<header` / `role="banner"` / etc — so in practice the size check is redundant, not dangerous. BUT the reviewer's snapshot-regeneration scenario is legitimate: if a future refactor breaks rendering so that a shell shows (the `<header>`, `role="main"` landmarks, the footer) but the session-body content is missing, `assertStructuralMarkers` would still pass (shell markers are unchanged) and the 16-char gate would pass too, and `-u` would bake the broken body into the snapshot. The structural-marker block already checks for the fixture title, so the body-level content is partially protected — but per-fixture body invariants (units list for review, question prompts for question, direction archetypes for direction) are not explicitly pinned.

The fix is to replace the tautological length check with:
1. **A positive content invariant** — content the fixture payload *guarantees* will appear in the rendered DOM (intent title + every unit slug for review; title + question text for question; title + every archetype label for direction).
2. **A negative error-state guard** — assert the rendered DOM does NOT match `/error|failed to load/i` (case-insensitive), so a shell-only render that silently collapses to an error state is caught regardless of whether the shell markers are present.

This matches the reviewer's "Suggested fix" exactly and mirrors the pattern `assertStructuralMarkers` already uses for title presence.

## Fixture shape (verified at fix time)

Parsed from `packages/haiku-ui/test-fixtures/` to anchor the invariants to real payload data:

- **`review-session.json`** — `intent.title = "Test Intent"`, `units = []`, `criteria = []`. The units loop in the reviewer's suggested fix is a no-op on this fixture; the intent title assertion is the load-bearing check. When the fixture ships with units (e.g. `review-session-full.json`), the loop becomes meaningful. Keep the loop (it documents intent + is exercised by any fixture that actually carries units), plus the intent-title assertion (the current structural-marker block already covers this; no double-assertion needed — `assertStructuralMarkers` handles it).
- **`question-session.json`** — `title = "Which direction should we explore?"`, `questions: Array<{ ... }>`. Assert title appears + at least one question's prompt/text appears, to pin "rendered the question body, not just the shell".
- **`direction-session.json`** — `title = "Pick a design direction"`, `archetypes: Array<{ ... }>`. Assert title appears + at least one archetype label appears, to pin "rendered the picker, not just the shell".

## Fix approach

**Single file, single function:** extend the parity spec's per-fixture body in `packages/haiku-ui/tests/parity.spec.tsx`:

1. **Replace** the `expect(rendered.length).toBeGreaterThan(16)` sanity check with:
   - A per-fixture positive content invariant block (guarded by `fx.name`).
   - A global negative error-state guard: `expect(rendered).not.toMatch(/error|failed to load/i)`.
2. **Do not modify** `assertStructuralMarkers` — it already works, and duplicating the title check there would create two sources of truth. The new per-fixture body invariants live inline in the `it(...)` block, right where the old length check sat.
3. **Do not modify** fixtures — they already carry the data the assertions will read.
4. **Do not regenerate snapshots** — this fix is additive assertions only, and the rendered DOM does not change.

### Why inline (not inside `assertStructuralMarkers`)

The existing `assertStructuralMarkers` function already branches on `fxName` for title checks. Adding the new body-content assertions there would consolidate per-fixture logic — which is clean. However, the reviewer's point is that the SANITY CHECK (line 155) is the part that passes vacuously and lets `-u` bake in a broken baseline. Placing the replacement directly at line 155 keeps the "sanity gate before snapshot" ordering intact (structural markers already run at line 160, between length check and snapshot). A reader comparing the before/after diff sees the bad sanity check swapped for a meaningful one; no cross-function hop required.

Builder's call: if inlining feels cluttered (~20 extra lines per fixture branch), factor the new logic into a helper `assertBodyContent(fxName, rendered, session)` placed *above* `assertStructuralMarkers`. The helper has the same signature as `assertStructuralMarkers`. Either placement is acceptable — the invariants themselves are what matters.

### Why not pin specific selectors (`.review-unit-card`, etc.)

The reviewer's structural-marker pattern pins *attributes* (`role="banner"`, `id="main-content"`) not *selectors*. Component DOM can churn (class names, wrapper divs) without breaking functionality. Pinning on payload-derived strings (intent title, unit slugs, question text, archetype names) is stable across refactors because those strings flow from the JSON fixture into the rendered output — if the payload renders, the strings are present. This matches the existing pattern and is resilient.

## Files to modify

1. **`packages/haiku-ui/tests/parity.spec.tsx`**
   - Delete line 155 (`expect(rendered.length).toBeGreaterThan(16)`) and the two-line comment above it (153–154).
   - Insert a per-fixture body-content block at the same location:
     ```ts
     // Body-content sanity: every fixture must render its actual payload,
     // not a shell-only error state. If this regresses, `-u` snapshot
     // regeneration would otherwise silently bake in a broken baseline.
     if (fx.name === "review") {
       const r = session as ReviewSessionPayload
       if (r.intent?.title) expect(rendered).toContain(escapeHtml(r.intent.title))
       for (const unit of r.units ?? []) {
         if (unit.slug) expect(rendered).toContain(escapeHtml(unit.slug))
       }
     } else if (fx.name === "question") {
       const q = session as QuestionSessionPayload
       if (q.title) expect(rendered).toContain(escapeHtml(q.title))
       const firstPrompt = q.questions?.[0]?.prompt ?? q.questions?.[0]?.text
       if (firstPrompt) expect(rendered).toContain(escapeHtml(firstPrompt))
     } else if (fx.name === "direction") {
       const d = session as DirectionSessionPayload
       if (d.title) expect(rendered).toContain(escapeHtml(d.title))
       const firstArchetype =
         d.archetypes?.[0]?.name ?? d.archetypes?.[0]?.label ?? d.archetypes?.[0]?.title
       if (firstArchetype) expect(rendered).toContain(escapeHtml(firstArchetype))
     }
     // Negative guard: the rendered DOM must NOT be an error state. A
     // shell-only render that silently collapses to `<div>Failed to load…</div>`
     // would still pass the shell-marker checks; this guard catches that.
     expect(rendered).not.toMatch(/error|failed to load/i)
     ```
   - The builder **MUST** verify the exact field names on the `QuestionSessionPayload` / `DirectionSessionPayload` types in `packages/haiku-api/src/schemas/session.ts` (or wherever `QuestionSessionPayload.questions[n]` and `DirectionSessionPayload.archetypes[n]` are defined) and use the real field name in place of the `?? x ?? y ?? z` fallbacks. The fallback chain in the plan is defensive — builder replaces it with the canonical field once types are inspected.
   - Hoist `escapeHtml` into the `it(...)` body scope if needed, or keep it at module scope where it currently lives (line 222) and call it directly. No change to `escapeHtml` itself.

2. **No other files.** No component changes, no fixture changes, no snapshot changes, no transformer changes.

## Implementation steps (for the builder in bolt 2)

1. **Re-read `packages/haiku-ui/tests/parity.spec.tsx` immediately before editing** — sibling fix chains may have touched it. Diff against this plan's expected starting state (line 155 = `expect(rendered.length).toBeGreaterThan(16)`).
2. **Inspect the session schemas:**
   ```bash
   rg -n "QuestionSessionPayload|DirectionSessionPayload" packages/haiku-api/src/schemas/
   ```
   Confirm the exact field name for a question's prompt string (`prompt` / `text` / `body` — pick the real one) and the archetype's display label (`name` / `label` / `title`). Update the plan's `?? ... ?? ...` fallback chain with the canonical field before committing.
3. **Apply the edit** — replace the length check (line 153–155 block including the comment) with the new per-fixture body block + negative error guard described above.
4. **Run the parity spec in isolation** to confirm it still passes and nothing in the snapshot moves:
   ```bash
   cd packages/haiku-ui
   npx vitest run tests/parity.spec.tsx
   ```
5. **Prove the assertion is not tautological** by running a targeted mutation test: temporarily modify the `makeMockClient` to make `fetchSession` throw, or swap the `<App>` render for a `<div>Failed to load session</div>` stub in one fixture's `it(...)`, and confirm the test now fails on the new assertions (not the snapshot diff). Revert. This is a build-step verification only — not a committed change.
6. **Run the full `haiku-ui` suite** to catch collateral:
   ```bash
   npx vitest run
   ```
7. **Run type check** to confirm the narrowed `session as XxxSessionPayload` casts still typecheck after any schema field swaps:
   ```bash
   npx tsc --noEmit
   ```
8. **Run the audit** to confirm no banned patterns were introduced:
   ```bash
   node scripts/audit-banned-patterns.mjs --profile=stage-wide
   ```
9. **Do NOT run `npx vitest run tests/parity.spec.tsx -u`.** The fix is additive assertions only; the rendered DOM does not change; the snapshot must not drift. If it does, stop and investigate — that signals either a sibling chain edited a component OR the new assertion accidentally mutated DOM (e.g. by importing the wrong symbol).

## Verification commands

```bash
cd packages/haiku-ui
npx vitest run tests/parity.spec.tsx                     # exit 0
npx vitest run                                           # whole haiku-ui suite, exit 0
npx tsc --noEmit                                         # exit 0
node scripts/audit-banned-patterns.mjs --profile=stage-wide   # exit 0
```

All four must exit 0. No snapshot regeneration (`-u`) is part of this fix.

## Risks

- **Parallel-chain clobber.** Multiple fix chains live in the test tree this bolt. Re-read `parity.spec.tsx` immediately before writing; if a sibling chain already edited line 155, merge forward against the new baseline rather than reverting.
- **Schema field-name drift.** The plan uses a defensive `?? ?? ??` chain for question-prompt and archetype-label fields because the exact wire field isn't confirmed in the plan's context window. Builder MUST verify in `packages/haiku-api/src/schemas/session.ts` (or equivalent) and substitute the canonical field name. If the schema genuinely allows multiple shapes, keep the fallback — otherwise collapse it.
- **Fixture has no payload data.** `review-session.json` currently ships with `units: []` — the units loop is a no-op on this fixture. That is acceptable: the loop documents the intent (every unit slug must render when present), and `review-session-full.json` / any future fixture that carries units will exercise it. The intent-title assertion is the load-bearing check on the current fixture.
- **`question-session.json` schema uncertainty.** The question fixture's `questions` array shape is not confirmed in the plan's scratch-pad; if `questions[0]` doesn't carry a user-visible prompt string (e.g. it's just `{ id, options }` with no text), the assertion will be a no-op via the `if (firstPrompt)` guard. Builder MUST either (a) find the right field and remove the guard, or (b) fall back to asserting that the rendered DOM contains at least the question's session title — which the current pattern already does via the existing structural-marker block. Choose (a) if possible; (b) is acceptable only if the fixture genuinely carries no user-visible question body.
- **Negative guard false positives.** The `/error|failed to load/i` regex is broad. If a future fixture legitimately includes the word "error" in its payload (e.g. a question fixture asking "what error state should we cover?"), the negative guard will false-fail. None of the current three fixtures do; builder verifies by grepping each fixture JSON for `error|failed to load` before committing. If a fixture trips the guard, tighten the regex to `/\berror\b|failed to load/i` with word boundaries, or scope the negative guard to a specific container like `expect(container.querySelector('[role="alert"]')).toBeNull()`.
- **Snapshot coupling.** The `dom-${fx.name}.html` snapshot is the regression gate per line 164. This fix MUST NOT regenerate it. If `npx vitest run tests/parity.spec.tsx` produces a snapshot diff after the change, something is wrong — the new assertions do not alter DOM. Investigate before bypassing.

## Out of scope

- **Replacing `toMatchSnapshot` with a different gate.** The snapshot is the commit-pinned baseline; the fix is about making the SANITY GATE before the snapshot call meaningful, not about replacing the snapshot itself.
- **Adding Playwright / cross-browser coverage.** The file header explicitly scopes this to jsdom as the agreed-upon alternative to the Playwright contract (see FB-04 §"Suggested fix"). A Playwright harness is a separate unit.
- **Refactoring `assertStructuralMarkers`.** Current behavior is correct; this fix adds body-content assertions in parallel to the existing shell-marker assertions. Do not touch `assertStructuralMarkers`.
- **Widening the fixture set.** Adding `review-session-full.json` to the parity `FIXTURES` array would exercise the units loop more thoroughly, but it's a fixture-scope change owned by the test infrastructure unit, not this fix. If the builder wants to strengthen coverage, file a follow-up seed — do NOT add fixtures in this bolt.
- **Modifying `dom-parity-transformer.ts`.** The transformer is working as intended for snapshot stability; nothing in this fix touches normalization.

## Done when

- `packages/haiku-ui/tests/parity.spec.tsx` no longer contains `expect(rendered.length).toBeGreaterThan(16)`.
- `parity.spec.tsx` contains per-fixture body-content assertions (intent title + unit slugs for review; title + first question prompt for question; title + first archetype label for direction) plus a negative `expect(rendered).not.toMatch(/error|failed to load/i)` guard at the old line-155 position.
- `escapeHtml` is reused from the existing module-scope function (no duplication).
- `npx vitest run tests/parity.spec.tsx` exits 0 with no snapshot diff.
- `npx vitest run` (whole haiku-ui suite) exits 0.
- `npx tsc --noEmit` exits 0.
- `node scripts/audit-banned-patterns.mjs --profile=stage-wide` exits 0.
- `git diff` on this commit touches exactly one file: `packages/haiku-ui/tests/parity.spec.tsx`.
