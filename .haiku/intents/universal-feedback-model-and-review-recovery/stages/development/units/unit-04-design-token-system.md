---
title: Design token system + token-scoped audit scripts
type: implementation
depends_on:
  - unit-03-extract-haiku-ui-package
quality_gates:
  - typecheck
  - test
inputs:
  - knowledge/DESIGN-TOKENS.md
  - stages/design/DESIGN-BRIEF.md
  - stages/design/artifacts/contrast-and-type-audit.md
status: completed
bolt: 1
hat: reviewer
started_at: '2026-04-21T06:19:55Z'
hat_started_at: '2026-04-21T06:51:47Z'
iterations:
  - hat: planner
    started_at: '2026-04-21T06:19:55Z'
    completed_at: '2026-04-21T06:26:43Z'
    result: advance
  - hat: builder
    started_at: '2026-04-21T06:26:43Z'
    completed_at: '2026-04-21T06:51:47Z'
    result: advance
  - hat: reviewer
    started_at: '2026-04-21T06:51:47Z'
    completed_at: '2026-04-21T06:57:56Z'
    result: advance
outputs:
  - stages/development/artifacts/unit-04-tactical-plan.md
  - packages/haiku-ui/.gitignore
  - packages/haiku-ui/audit-config.json
  - packages/haiku-ui/scripts/audit-banned-patterns.mjs
  - packages/haiku-ui/scripts/audit-contrast.mjs
  - packages/haiku-ui/scripts/verify-tokens.mjs
  - packages/haiku-ui/src/components/CriteriaChecklist.tsx
  - packages/haiku-ui/src/components/DesignPicker.tsx
  - packages/haiku-ui/src/components/FeedbackPanel.tsx
  - packages/haiku-ui/src/components/QuestionPage.tsx
  - packages/haiku-ui/src/components/ReviewCurrentPage.tsx
  - packages/haiku-ui/src/components/ReviewPage.tsx
  - packages/haiku-ui/src/components/ReviewSidebar.tsx
  - packages/haiku-ui/src/components/StageProgressStrip.tsx
  - packages/haiku-ui/src/components/StatusBadge.tsx
  - packages/haiku-ui/src/components/Tabs.tsx
  - packages/haiku-ui/src/components/Input.tsx
  - packages/haiku-ui/src/components/__tests__/Input.test.tsx
  - packages/haiku-ui/src/index.css
  - packages/haiku-ui/tailwind.config.ts
  - packages/haiku-ui/tests/__snapshots__/parity.spec.tsx.snap
  - packages/haiku-ui/vitest.config.ts
completed_at: '2026-04-21T06:57:56Z'
model: sonnet
---
# Design token system

Implement the token system defined in `knowledge/DESIGN-TOKENS.md` across `packages/haiku-ui/`: tailwind config, CSS custom properties, a primitive component layer. Ship the token-scoped audit scripts every downstream unit will lean on.

## Scope

**Token implementation:**
- `packages/haiku-ui/tailwind.config.ts` — extend palette, radii, shadows, spacing, breakpoints, typography per DESIGN-TOKENS §1. Remove banned colors (raw hex, leftover `gray-*`) from the generated class surface via `safelist` + content allow-list.
- `packages/haiku-ui/src/index.css` — CSS custom properties for light + dark theme variables; applied via `:root` + `.dark`.
- `packages/haiku-ui/src/components/Input.tsx` — typed Input variant matching DESIGN-TOKENS §2. Other primitives (Button, Badge, Card, Chip, Divider) deferred to a follow-up migration unit once consumers exist (see FB-18).
- Canonical container tokens:
  - `--sidebar-width: 20rem` (mobile), `--sidebar-width-xl: 24rem` — applied as `w-[var(--sidebar-width)] xl:w-[var(--sidebar-width-xl)]` — replaces all `w-80 xl:w-96` / `lg:w-96` drift.
  - `--content-max: 1400px` → `max-w-[var(--content-max)]` replaces `max-w-[1400px]` literals.

**Source migration pass (grep-driven):**
- Replace banned `text-[9px]`, `text-[10px]` with token-approved sizes (or explicit §2 exemptions flagged inline in prose).
- Replace banned `text-gray-*` with `text-stone-*` or semantic tokens.
- Replace banned `text-stone-400/500` paired with light/white backgrounds per banned-pairs table in `contrast-and-type-audit.md §3` (authoritative source — criterion cites the section directly).
- Replace `opacity-50|60|70` on card roots, buttons, titles, metadata with token-approved disabled patterns per DESIGN-TOKENS §1.7.
- Replace `focus:ring-1` with `focus-visible:ring-2`.

**Audit scripts owned by this unit:**
- `packages/haiku-ui/scripts/verify-tokens.mjs`:
  - Parses `knowledge/DESIGN-TOKENS.md` token tables.
  - Reads resolved `tailwind.config.ts` + `src/index.css` custom properties.
  - Asserts every declared token is present; fails on missing or value-mismatched tokens.
  - Exit 0 on parity, non-zero with specific diff on failure.
- `packages/haiku-ui/scripts/audit-contrast.mjs --mode=tokens`:
  - Enumerates default token pairs (fg × bg × font-size-bucket).
  - Computes WCAG contrast via a deterministic formula.
  - Asserts WCAG 1.4.3 AA for text, 1.4.11 Non-Text for UI.
  - Deduplicates by `(fg-token, bg-token, font-size-bucket)` tuple — one test per unique pair.
  - Outputs report to `packages/haiku-ui/reports/contrast-tokens.json`.
- `packages/haiku-ui/scripts/audit-banned-patterns.mjs`:
  - Config at `packages/haiku-ui/audit-config.json` enumerating banned regexes and their scopes.
  - Supports `--profile=tokens` (this unit's subset) and `--profile=stage-wide` (unit-15's full set).
  - Each regex has an explicit file-glob scope and exclusion glob (tests, `__snapshots__`, documentation spec files under `stages/design/artifacts/**` are allow-listed).
  - Sharpened patterns:
    - banned `{origin}` JSX: regex `\{origin\}(?!Labels)` excludes `{originLabels[origin]}`.
    - banned button verbs: match `<[Bb]utton[^>]*>\s*(Reject|Close|Address|Re-open)\s*</` and `aria-label=["'](Reject|Close|Address|Re-open)["']` only.
    - banned `Show agent feedback` without trailing `inline`: regex `"Show agent feedback"(?! inline)`.
  - Exit 0 iff every regex returns zero hits in its scope.

## Out of scope

- Component internals beyond class-string swaps (per-component behavior lives in later units).
- Rendered-DOM contrast audit (that's unit-15's `--mode=rendered`).

## Completion Criteria

- `node packages/haiku-ui/scripts/verify-tokens.mjs` exits 0 with parity report.
- `node packages/haiku-ui/scripts/audit-contrast.mjs --mode=tokens` exits 0.
- `node packages/haiku-ui/scripts/audit-banned-patterns.mjs --profile=tokens` exits 0.
- Grep for the banned patterns in `packages/haiku-ui/src/**/*.{ts,tsx,css}` returns zero hits (exclusions per audit-config.json).
- Input component has a vitest + RTL test at `packages/haiku-ui/src/components/__tests__/Input.test.tsx` asserting variant output + disabled state.
- `npx tsc --noEmit` passes.
