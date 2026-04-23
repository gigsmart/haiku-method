---
title: >-
  Stage-wide audit — contrast (rendered), state coverage, banned patterns,
  bundle, runtime parity
type: audit
depends_on:
  - unit-07-review-page-desktop-and-mobile
  - unit-08-feedback-components
  - unit-09-agent-feedback-toggle
  - unit-10-feedback-sheet-mobile
  - unit-11-revisit-modal-and-assessor-card
  - unit-12-stage-progress-strip
  - unit-13-annotation-canvas
  - unit-14-question-and-direction-pages
quality_gates:
  - typecheck
  - test
  - build
inputs:
  - knowledge/DESIGN-TOKENS.md
  - stages/design/DESIGN-BRIEF.md
  - stages/design/artifacts/contrast-and-type-audit.md
  - stages/design/artifacts/state-coverage-grid.md
  - stages/design/artifacts/touch-target-audit.md
  - stages/design/artifacts/motion-and-reduced-motion-spec.md
  - stages/design/artifacts/footer-button-copy-spec.md
  - stages/design/artifacts/focus-ring-spec.html
  - stages/design/artifacts/keyboard-shortcut-map.html
  - stages/design/artifacts/aria-live-sequencing-spec.md
  - stages/design/artifacts/aria-landmark-spec.md
status: completed
bolt: 1
hat: reviewer
started_at: '2026-04-21T19:27:51Z'
hat_started_at: '2026-04-21T20:10:06Z'
iterations:
  - hat: planner
    started_at: '2026-04-21T19:27:51Z'
    completed_at: '2026-04-21T19:33:36Z'
    result: advance
  - hat: builder
    started_at: '2026-04-21T19:33:36Z'
    completed_at: '2026-04-21T20:10:06Z'
    result: advance
  - hat: reviewer
    started_at: '2026-04-21T20:10:06Z'
    completed_at: '2026-04-21T20:18:05Z'
    result: advance
outputs:
  - stages/development/artifacts/unit-15-tactical-plan.md
  - packages/haiku-api/package.json
  - packages/haiku-api/scripts/audit-openapi-parity.mjs
  - packages/haiku-ui/audit-config.json
  - packages/haiku-ui/budget-baseline.json
  - packages/haiku-ui/budget.json
  - packages/haiku-ui/package.json
  - packages/haiku-ui/scripts/audit-banned-patterns.mjs
  - packages/haiku-ui/scripts/audit-bundle-size.mjs
  - packages/haiku-ui/scripts/audit-contrast.mjs
  - packages/haiku-ui/scripts/audit-keyboard-shortcuts.mjs
  - packages/haiku-ui/scripts/audit-live-regions.mjs
  - packages/haiku-ui/scripts/audit-reduced-motion.mjs
  - packages/haiku-ui/scripts/audit-state-coverage.mjs
  - packages/haiku-ui/scripts/audit-touch-targets.mjs
  - packages/haiku-ui/src/components/AnnotationCanvas.tsx
  - packages/haiku-ui/src/components/InlineComments.tsx
  - packages/haiku-ui/src/components/MermaidDiagram.tsx
  - packages/haiku-ui/src/components/MermaidFlow.tsx
  - >-
    packages/haiku-ui/src/components/__tests__/AssessorSummaryCard.states.test.tsx
  - packages/haiku-ui/src/components/__tests__/RevisitModal.states.test.tsx
  - >-
    packages/haiku-ui/src/components/__tests__/StageProgressStrip.states.test.tsx
  - >-
    packages/haiku-ui/src/components/__tests__/__snapshots__/AssessorSummaryCard.states.test.tsx.snap
  - >-
    packages/haiku-ui/src/components/__tests__/__snapshots__/RevisitModal.states.test.tsx.snap
  - >-
    packages/haiku-ui/src/components/__tests__/__snapshots__/StageProgressStrip.states.test.tsx.snap
  - packages/haiku-ui/src/components/feedback/FeedbackItem.tsx
  - >-
    packages/haiku-ui/src/components/feedback/__tests__/AgentFeedbackToggle.states.test.tsx
  - >-
    packages/haiku-ui/src/components/feedback/__tests__/FeedbackFloatingButton.states.test.tsx
  - >-
    packages/haiku-ui/src/components/feedback/__tests__/FeedbackSheet.states.test.tsx
  - >-
    packages/haiku-ui/src/components/feedback/__tests__/__snapshots__/AgentFeedbackToggle.states.test.tsx.snap
  - >-
    packages/haiku-ui/src/components/feedback/__tests__/__snapshots__/FeedbackFloatingButton.states.test.tsx.snap
  - >-
    packages/haiku-ui/src/components/feedback/__tests__/__snapshots__/FeedbackSheet.states.test.tsx.snap
  - packages/haiku-ui/src/components/mermaid-flow/layout.ts
  - packages/haiku-ui/src/index.css
  - packages/haiku-ui/src/shell/ShellLayout.tsx
  - packages/haiku-ui/tests/__snapshots__/parity.spec.tsx.snap
  - stages/development/artifacts/unit-15-review-findings.md
completed_at: '2026-04-21T20:18:05Z'
model: sonnet
---
# Stage-wide audit

Single final unit. Runs the superset audits after every component unit lands. Every gate is a deterministic executable — no prose gates.

## Scope

**New audit scripts owned by this unit:**

- `packages/haiku-ui/scripts/audit-touch-targets.mjs` — headless-browser walk of the built SPA; every interactive element (computed via `[role=button], [role=switch], button, [tabindex="0"]`, etc.) measures `getBoundingClientRect()` ≥ 44×44. Exit 0 on pass.
- `packages/haiku-ui/scripts/audit-bundle-size.mjs` — compares `dist/index.html` gzipped size against `packages/haiku-ui/budget.json` (`haiku-ui-bundle.gzip.max = 500KB`); fails on absolute cap or 5% regression vs `packages/haiku-ui/budget-baseline.json` (updated only via explicit PR).
- `packages/haiku-ui/scripts/audit-state-coverage.mjs` — asserts every §2 component from DESIGN-BRIEF has a `__snapshots__/{Component}.states.test.tsx.snap` file with ≥ (6 × status-variants) snapshot entries. Per-component cardinality ≤ 36.
- Extends `packages/haiku-ui/scripts/audit-contrast.mjs` with `--mode=rendered`: headless browser, walks DOM of every page served by fixtures, deduplicates pairs by `(fg-token, bg-token, font-size-bucket)`, asserts WCAG pass. **30s wall-clock budget**; unique-pair count asserted < 200 to catch explosions.
- Extends `packages/haiku-ui/audit-config.json` with `stage-wide` profile:
  - Token-layer bans (inherited from `tokens` profile).
  - **XSS sinks**: `dangerouslySetInnerHTML`, `innerHTML\\s*=`, `\\beval\\(`, `new Function\\(`, `document\\.write\\(` — scope `packages/haiku-ui/src/**/*.{ts,tsx}` and `packages/haiku-api/src/**/*.ts`; exclusions in `__tests__` and allow-listed lines with `// audit-allow: <reason>` comment.
  - **Button-verb bans**: `<[Bb]utton[^>]*>\\s*(Reject|Close|Address|Re-open)\\s*<|aria-label=["'](Reject|Close|Address|Re-open)["']` scoped to `packages/haiku-ui/src/**/*.{ts,tsx}`.
  - **Hyphenated "Re-open"**: same scope as verb bans.
  - **Raw hex colors**: scope to `src/**/*.{ts,tsx,css}` excluding `index.css` (where custom-property definitions live), `__snapshots__`, `scripts/**`.
  - **`max-w-\\[1400px\\]` literal**: full scope.
  - **Sidebar `lg:w-96` regression**: scope to sidebar-relevant files (audit-config notes the rationale).
  - **`focus:ring-1`**: full scope.
- `packages/haiku-api/scripts/audit-openapi-parity.mjs` (owned by unit-01, invoked here) — run against a test MCP + `dist/openapi.json`, bounded probe, 30s budget.

**A11y audit** — axe-core RTL tests (already established in unit-06) cover every page against WCAG 2.1 AA. No Lighthouse — `chrome-launcher` was clobbering local dev Chrome. A Playwright-sandboxed axe audit lands as a follow-up unit; out of scope here.

**Reduced-motion audit** — a headless walk of the built SPA with `prefers-reduced-motion: reduce` emulated; asserts every animated element either uses `motion-safe:*` classes or has a `@media (prefers-reduced-motion: reduce)` override.

**Keyboard-shortcut spec compliance** — parses `keyboard-shortcut-map.html §2` table, asserts every `(key, scope)` row has a matching `useShortcut(key, ..., { scope })` registration in the source.

**Live-region plumbing** — grep + AST scan: `#feedback-live-polite` and `#feedback-live-assertive` mounted exactly once across the app; `useAnnounce` call sites only target those IDs.

**Snapshot execution budget** — test runner parallelization ceiling 5 minutes wall-clock for state-coverage snapshots (Vitest `--threads` enabled).

## Out of scope

- Any new feature work (must have landed in prior units).

## Completion Criteria

All of these commands exit 0:

- `npx tsc --noEmit` (repo-wide)
- `npm test` (all packages; baselines preserved from unit-02's `test-baseline.json`)
- `node packages/haiku-ui/scripts/verify-tokens.mjs`
- `node packages/haiku-ui/scripts/audit-contrast.mjs --mode=tokens`
- `node packages/haiku-ui/scripts/audit-contrast.mjs --mode=rendered` (30s budget)
- `node packages/haiku-ui/scripts/audit-touch-targets.mjs`
- `node packages/haiku-ui/scripts/audit-bundle-size.mjs`
- `node packages/haiku-ui/scripts/audit-state-coverage.mjs`
- `node packages/haiku-ui/scripts/audit-banned-patterns.mjs --profile=stage-wide`
- `node packages/haiku-api/scripts/audit-openapi-parity.mjs`
- `packages/haiku-ui/scripts/audit-lighthouse.mjs` does NOT exist (grep `lighthouse` across `packages/haiku-ui/package.json` + `packages/haiku-ui/scripts/` returns zero matches).

Additional:
- Reduced-motion audit script output shows 100% of animated elements compliant.
- Keyboard-shortcut compliance: every row from `keyboard-shortcut-map.html §2` has a matching registration (script reports orphaned map rows or unregistered source bindings and exits non-zero on any).
- Live-region mount count: exactly 1 for each of `#feedback-live-polite` and `#feedback-live-assertive`.
- State-coverage snapshot suite completes within 5-minute wall-clock budget.
