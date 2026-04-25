# Legacy Artifacts Index

## How to read this

`units/unit-NN-*.md` is the **source of truth** for the current visit's unit specs. The files in this directory prefixed `legacy-*.md` are frozen implementation notes from earlier visits that used a different unit-numbering scheme. They are kept for historical traceability and to help locate the regression surface each piece of legacy work lives on today.

If you are looking for "what does unit-NN do right now," always start at `stages/development/units/unit-NN-*.md` and `stages/development/artifacts/unit-NN-tactical-plan.md`. Do NOT use the `legacy-*.md` notes as current specs.

These legacy notes were renamed out of the `unit-NN-*.md` namespace (FB-44) because the prior visit's `unit-04` (gate-feedback-check), `unit-06` (enforce-iteration-fix), `unit-07` (external-review-detection), `unit-08` (review-server/UI impl), and their siblings described different work than the current visit's `unit-04` (design-token-system), `unit-06` (shell-and-routing), `unit-07` (review-page-desktop-and-mobile), `unit-08` (feedback-components), etc. Reading both under the same ID produced ambiguous lookups — this rename resolves that ambiguity.

## Mapping: legacy note → current regression surface

| Legacy note (new name) | What it implemented | Regression surface today owned by |
|---|---|---|
| `legacy-crud-companion-tools.md` | `haiku_feedback_update`, `haiku_feedback_delete`, `haiku_feedback_reject`, `haiku_feedback_list` MCP tools and feedback lifecycle guards | Core MCP backend — no current development-stage unit. See `test-baseline.json` feedback.test.mjs and feedback-lifecycle tests. |
| `legacy-extract-haiku-ui-notes.md` | Builder notes from an earlier `haiku-ui` package extraction attempt | Superseded by current `units/unit-03-extract-haiku-ui-package.md`. |
| `legacy-rename-haiku-feedback-to-haiku-report.md` | Renamed the `haiku_feedback` MCP tool to `haiku_report` | Core MCP backend — no current development-stage unit. |
| `legacy-gate-feedback-check.md` | Gate-phase pending-feedback check, `haiku_revisit` reason extension, and the `feedback_revisit` orchestrator action | Core orchestrator — no current development-stage unit. `test-baseline.json` gate-feedback.test.mjs and external-review.test.mjs exercise this surface. |
| `legacy-orchestrator-integration.md` | `writeReviewFeedbackFiles`, the `additive_elaborate` action, unit-advance-hat closure paths | Core orchestrator — no current development-stage unit. |
| `legacy-enforce-iteration-fix.md` | `allStagesCompleted()` replacing the unit-file glob inside the enforce-iteration stop hook | Core hooks — no current development-stage unit. `test-baseline.json` enforce-iteration.test.mjs exercises this surface. |
| `legacy-external-review-detection.md` | `checkExternalState`, changes-requested detection, GitHub/GitLab polling | Core orchestrator — no current development-stage unit. `test-baseline.json` external-review.test.mjs exercises this surface. |
| `legacy-review-server-and-ui-impl.md` | HTTP feedback CRUD, the early `FeedbackPanel`/`StageProgressStrip` sketches, the `/review/current` route | Superseded piecewise by current `units/unit-07-review-page-desktop-and-mobile.md` (review page), `units/unit-08-feedback-components.md` (feedback cluster), and `units/unit-12-stage-progress-strip.md` (progress strip). The HTTP endpoint layer lives in core MCP backend. |

## Disambiguation note for `test-baseline.json`

The backend regression tests baselined by `test-baseline.json` — gate-feedback, external-review, enforce-iteration, feedback-lifecycle, review-server HTTP endpoints — belong to the **legacy backend work** tracked above. They are **not** owned by any current UI-stack unit (unit-04 design-tokens, unit-06 shell-and-routing, etc.). When a current-visit reviewer is chasing a failure in one of those test files, they should route the finding via these legacy mappings (typically to core MCP backend, which has no current development-stage unit) rather than assuming the same-numbered current-visit unit owns it.

## Scope of this rename

- **Renamed:** 8 legacy implementation notes only. `git mv` used throughout to preserve history.
- **Not renamed:** current-visit artifacts (`unit-NN-tactical-plan.md`, `unit-NN-review-findings*.md`, `unit-NN-review-notes.md`, `unit-NN-coverage-supplement.md`), feedback fix plans (`fb-NN-fix-plan.md`, `fb-NN-tactical-plan.md`, `fix-FB-NN-tactical-plan.md`), and the baseline files (`bundle-baseline.html`, `test-baseline.json`, `test-deltas.json`).
- **Not modified:** `units/` specs, `state.json`, any tactical plans. This is a documentation-only disambiguation.
