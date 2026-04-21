# Tactical Plan — FB-44 (Unit-numbering collision in stages/development/artifacts/)

**Finding:** `stages/development/artifacts/` contains two parallel, incompatible notions of "unit N". Current-visit tactical plans (`unit-NN-tactical-plan.md`, `unit-NN-review-findings*.md`, `unit-NN-review-notes.md`) describe the UI/a11y work defined by `units/unit-NN-*.md`. Older free-form implementation notes (`unit-NN-<slug>.md`) describe backend/MCP work from earlier visits against a different unit-numbering scheme. Both series live in the same artifact namespace under the same IDs (unit-02 through unit-08), so a downstream reader cannot tell which "unit-04" a given artifact belongs to.

**Required remedy (from feedback):** rename the older artifact notes to reflect their actual identity (e.g., `legacy-*.md`) and add a stage-level index mapping each legacy area to the current-visit unit that exercises its regression surface.

## Files to modify

### 1. Rename legacy implementation notes (`git mv`)

All eight legacy notes in `stages/development/artifacts/` get a `legacy-` prefix and drop the colliding `unit-NN-` token. The new name describes the work's actual identity, not its former unit number. Use `git mv` so history is preserved.

| Current name | New name |
|---|---|
| `unit-02-crud-companion-tools.md` | `legacy-crud-companion-tools.md` |
| `unit-03-extract-haiku-ui-notes.md` | `legacy-extract-haiku-ui-notes.md` |
| `unit-03-rename-notes.md` | `legacy-rename-haiku-feedback-to-haiku-report.md` |
| `unit-04-gate-feedback-check.md` | `legacy-gate-feedback-check.md` |
| `unit-05-orchestrator-integration.md` | `legacy-orchestrator-integration.md` |
| `unit-06-enforce-iteration-fix.md` | `legacy-enforce-iteration-fix.md` |
| `unit-07-external-review-detection.md` | `legacy-external-review-detection.md` |
| `unit-08-implementation.md` | `legacy-review-server-and-ui-impl.md` |

**Do NOT rename** any of the current-visit artifacts:
- `unit-NN-tactical-plan.md`
- `unit-NN-review-findings.md`, `unit-NN-review-findings-bolt-*.md`
- `unit-NN-review-notes.md`
- `fix-FB-NN-tactical-plan.md`, `fb-NN-fix-plan.md`, `fb-NN-tactical-plan.md`
- `bundle-baseline.html`, `test-baseline.json`, `test-deltas.json`

### 2. Create stage-level legacy index

Write a new file `stages/development/artifacts/LEGACY-INDEX.md` that:

1. Explains why the legacy notes exist (prior visit used a different unit-numbering scheme; renamed to avoid collision with current `units/unit-NN-*.md` spec files).
2. Maps each legacy note to the current-visit unit whose regression surface it exercises (best match — some legacy work has no direct current unit).
3. Disambiguates `test-baseline.json`: its gate/feedback/revisit/external-review tests belong to the **legacy backend work**, not to any current UI-stack unit.

Mapping table (author's best read after diffing legacy content against current unit titles):

| Legacy note (new name) | What it implemented | Regression surface today owned by |
|---|---|---|
| `legacy-crud-companion-tools.md` | `haiku_feedback_update/delete/reject/list` MCP tools, feedback lifecycle guards | Core MCP backend — no current development-stage unit; see `test-baseline.json` feedback.test.mjs + lifecycle tests |
| `legacy-extract-haiku-ui-notes.md` | Builder notes from earlier haiku-ui extraction attempt | Superseded by current `unit-03-extract-haiku-ui-package.md` |
| `legacy-rename-haiku-feedback-to-haiku-report.md` | Renamed `haiku_feedback` MCP tool → `haiku_report` | Core MCP backend — no current development-stage unit |
| `legacy-gate-feedback-check.md` | Gate-phase pending-feedback check, `haiku_revisit` reasons extension, `feedback_revisit` action | Core orchestrator — no current development-stage unit; `test-baseline.json` gate-feedback.test.mjs + external-review.test.mjs |
| `legacy-orchestrator-integration.md` | `writeReviewFeedbackFiles`, `additive_elaborate` action, unit-advance-hat closure | Core orchestrator — no current development-stage unit |
| `legacy-enforce-iteration-fix.md` | `allStagesCompleted()` replacing unit-file glob in enforce-iteration stop hook | Core hooks — no current development-stage unit; `test-baseline.json` enforce-iteration.test.mjs |
| `legacy-external-review-detection.md` | `checkExternalState`, changes-requested detection, GitHub/GitLab polling | Core orchestrator — no current development-stage unit; `test-baseline.json` external-review.test.mjs |
| `legacy-review-server-and-ui-impl.md` | HTTP feedback CRUD, early FeedbackPanel/StageProgressStrip, `/review/current` route | Superseded piecewise by current `unit-07-review-page-desktop-and-mobile.md` (review page), `unit-08-feedback-components.md` (feedback cluster), `unit-12-stage-progress-strip.md` (progress strip) — with the HTTP endpoint layer living in core MCP backend |

Include a short "How to read this" paragraph up top, and a NOTE that `units/unit-NN-*.md` is always the source of truth for the current visit; legacy notes are frozen historical artifacts.

## Implementation steps

Steps the **builder** hat will execute in the next bolt:

1. `git mv` each of the 8 legacy notes to its new name (preserve git history).
2. Create `stages/development/artifacts/LEGACY-INDEX.md` with the mapping table and guidance paragraphs above.
3. Grep the repo for any references to the old legacy filenames (`rg "unit-0[2-8]-(crud-companion|extract-haiku-ui-notes|rename-notes|gate-feedback-check|orchestrator-integration|enforce-iteration-fix|external-review-detection|implementation)"`) and update any hits. No cross-references are expected, but confirm.
4. Stage all renames + the new index file.

## Verification

- `ls stages/development/artifacts/ | grep -E "^unit-[0-9]+-"` returns ONLY `unit-NN-tactical-plan.md`, `unit-NN-review-findings*.md`, `unit-NN-review-notes.md` (no legacy collisions).
- `ls stages/development/artifacts/legacy-*.md` returns exactly 8 files.
- `cat stages/development/artifacts/LEGACY-INDEX.md` renders a complete mapping table for all 8 legacy notes.
- `rg "unit-04-gate-feedback-check|unit-06-enforce-iteration-fix|unit-07-external-review-detection|unit-08-implementation|unit-02-crud-companion-tools|unit-03-extract-haiku-ui-notes|unit-03-rename-notes|unit-05-orchestrator-integration"` returns no stale references outside LEGACY-INDEX.md itself.
- No changes to `units/` frontmatter, no changes to `state.json`, no changes to current tactical plans.

## Risk assessment

- **Low risk of collateral damage.** These are documentation artifacts. No code, no tests, no FSM state depends on their filenames.
- **History preservation risk:** must use `git mv`, not `rm + write`, so blame/log keep tracking the content.
- **Mapping accuracy risk:** the "regression surface today" column is a judgment call — some legacy work (CRUD tools, enforce-iteration, external-review detection) has no current unit because it's core MCP backend, not review-UI. Index marks those honestly as "no current development-stage unit" rather than forcing a wrong mapping.
- **Parallel-fix chain risk:** other FB-NN fix chains may be editing the same directory. Re-read the artifacts dir listing immediately before each `git mv` to confirm the legacy file still exists at the expected name.

## Out of scope

- Promoting legacy notes into current unit specs (feedback remedy option b) — rejected in favor of option a (rename + index) because the legacy work is mostly core MCP backend that does not map cleanly onto the current development-stage unit set, and creating new unit specs would widen this finding's blast radius beyond a documentation fix.
- Modifying `knowledge/IMPLEMENTATION-MAP.md` — that's a separate finding if it's stale.
- Renaming `fb-NN-fix-plan.md` / `fix-FB-NN-tactical-plan.md` — those follow a clearly scoped `fb-`/`fix-FB-` prefix and do not collide with the unit-NN namespace.
