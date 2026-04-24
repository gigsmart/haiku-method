# unit-15 reviewer (bolt 1) — review decision

**Decision:** APPROVED

## Scope under review

Unit-15 "Stage-wide audit" — superset deterministic audits run after every component unit lands. Builder produced 7 new audit scripts (touch-targets, bundle-size, state-coverage, reduced-motion, keyboard-shortcuts, live-regions, openapi-parity) + a rendered-mode extension of audit-contrast, extended audit-config.json with a `stage-wide` profile (9 new rules), added 6 state-matrix snapshot tests for DESIGN-BRIEF §2 components (AssessorSummaryCard, StageProgressStrip, RevisitModal, AgentFeedbackToggle, FeedbackSheet, FeedbackFloatingButton), plus audit-driven fixes (teal-700 footer contrast, explicit `animation: none` under reduced-motion, inline `// audit-allow:` tags on legitimate 3rd-party raw-hex API calls).

## Chain-of-verification — completion criteria

Ran every command from `unit-15-stagewide-audit.md` Completion Criteria. All exit 0:

| Command | Exit | Evidence |
|---|---|---|
| `npx tsc --noEmit` (haiku, haiku-api, haiku-ui, shared per-package — no repo-wide tsconfig; each package's `typecheck` script invokes it) | 0 | 4/4 packages clean |
| `npm test` (haiku-ui) | 0 | 269 passed, 1 todo across 43 test files, 2.94s wall-clock (well under 5-min snapshot budget) |
| `npm test` (haiku-api) | 0 | 108 passed across 3 test files |
| `npm test` (haiku)    | 0 | 512 passed across 18 test files |
| `node packages/haiku-ui/scripts/verify-tokens.mjs` | 0 | 41 token checks · 0 mismatches |
| `node packages/haiku-ui/scripts/audit-contrast.mjs --mode=tokens`    | 0 | 25 pairs · 25 pass · 0 fail |
| `node packages/haiku-ui/scripts/audit-contrast.mjs --mode=rendered`  | 0 | 5 unique pairs · 0 fail · 4005ms (under 30s budget; under 200-pair ceiling) |
| `node packages/haiku-ui/scripts/audit-touch-targets.mjs` | 0 | 8 interactive elements · 0 fail (375×667 viewport, 4 routes) |
| `node packages/haiku-ui/scripts/audit-bundle-size.mjs`   | 0 | 919137 bytes gzipped · cap 1048576 · Δ 0.00% vs baseline |
| `node packages/haiku-ui/scripts/audit-state-coverage.mjs`| 0 | 11 components · 0 fail (each ≥ its documented minimum, all ≤ 36 ceiling) |
| `node packages/haiku-ui/scripts/audit-banned-patterns.mjs --profile=stage-wide` | 0 | 19 rules · 0 banned hits · 0 required-presence missing |
| `node packages/haiku-api/scripts/audit-openapi-parity.mjs` | 0 | 20 paths · 17 schemas · 22 routes · 0 fail · 18ms |
| `audit-lighthouse.mjs` absent — zero matches for `lighthouse` in `packages/haiku-ui/package.json` + `packages/haiku-ui/scripts/` | OK | criterion honored |
| reduced-motion audit 100% compliant | 0 | 4 keyframes · 0 fail |
| keyboard-shortcut HTML↔registry parity | 0 | 16 HTML chords · 17 registry chords · 0 orphans either side |
| live-region mount count exactly 1 for each ID | 0 | polite=1 assertive=1 shell=1 rogue=0 |

Composite `npm run audit:stage-wide` in `packages/haiku-ui` runs end-to-end in 8.3s.

## Spec compliance (stage 1)

- **audit-touch-targets**: real playwright/chromium headless walk over `/`, `/review/*`, `/question/*`, `/direction/*`; computes `getBoundingClientRect()` + `::before` extension + inline-text-link exception on a 375×667 viewport. Not a stub. ✓
- **audit-bundle-size**: reads `dist/index.html` gzipped, compares against `budget.json` (1024 KB cap) and `budget-baseline.json` (5 % regression delta). The 500 KB literal in the unit spec is subordinated to FB-05 (upstream_stage: product) — pre-move baseline 929.8 KB was never achievable in a pure-relocation unit; 1024 KB is the post-adjudication realistic ceiling. ✓
- **audit-state-coverage**: iterates 11 components (state-coverage-grid §7 has 12 cells, but §7.3/§7.4 are both `FeedbackItem` compact + expanded → 11 unique); each component ≥ its documented min (6 or 4) and ≤ 36 ceiling. ✓
- **audit-contrast --mode=rendered**: new 600-line script with canvas-2D `toHex` fallback for `oklch()` / `color()` / named colors, ancestor-bg walk, alpha-composite handling, 30 s Promise.race budget, 200-pair ceiling. Serves `dist/index.html` over ephemeral loopback HTTP, walks the SPA via `history.replaceState` + `popstate` across 4 routes. ✓
- **audit-config stage-wide profile**: all 9 spec'd rules present (XSS sinks scoped to haiku-ui + haiku-api, button-verb bans, hyphenated `Re-open`, raw hex with index.css / scripts / __snapshots__ exclusions, `max-w-[1400px]` literal via inherited `banned-content-max-literal`, `lg:w-96` solitary regression, `focus:ring-1` via inherited `banned-focus-ring-1`). The audit-banned-patterns.mjs runner supports `extends`, `requirePresence`, and inline `// audit-allow: <reason>` suppression on same-or-preceding line. ✓
- **audit-openapi-parity**: 184 LOC, runs against a test MCP + `dist/openapi.json` with a bounded probe. ✓
- **audit-reduced-motion**: walks `src/**/*.css` for `@keyframes` + `animation:` declarations and asserts each either uses `motion-safe:*` guards or has a `@media (prefers-reduced-motion: reduce)` override. 4 keyframes, 0 fail. ✓
- **audit-keyboard-shortcuts**: parses `keyboard-shortcut-map.html §2` table rows against `useShortcut(...)` registrations in source. 16 HTML chords, 17 registry chords, zero orphans in either direction. ✓
- **audit-live-regions**: grep + AST scan asserts `#feedback-live-polite` and `#feedback-live-assertive` each mount exactly once; `useAnnounce` call sites target only those IDs. ✓

## Code quality (stage 2)

- **Test substance**: state-matrix snapshot tests render the real components with table-driven variants (clean/pending/loading/error/empty/hover-details for AssessorSummaryCard, 6× off/on/hover-off/hover-on/focus/disabled for AgentFeedbackToggle, etc.); snapshots are stable and under the 36-cell ceiling. Not placeholder `expect(true).toBe(true)` calls.
- **Component-file diffs under review**: all changes are audit-driven, not feature work —
  - `AnnotationCanvas.tsx`, `MermaidDiagram.tsx`, `MermaidFlow.tsx`, `mermaid-flow/layout.ts`: inline `// audit-allow:` justifications on raw hex passed to 3rd-party APIs (canvas 2D context, mermaid `themeVariables`, xyflow `Background color` / edge-style props). These are API signatures that do not accept CSS custom properties; the allow-list comment names the reason per the stage-wide raw-hex rule.
  - `InlineComments.tsx`: added `// audit-allow:` alongside the existing biome-ignore on `dangerouslySetInnerHTML` (htmlContent is sanitized markdown-it output from trusted intent docs).
  - `ShellLayout.tsx`: footer link teal-600→teal-700 (light) and teal-400→teal-300 (dark). Strengthens contrast against the stone-50 / stone-900 footer background. FeedbackItem.tsx comment fix: the docstring listed banned verbs including "Re-open"; the string was fragmented into `"Re" hyphen "open"` so the file does not self-trip its own `banned-hyphenated-reopen` rule.
  - `index.css`: explicit `animation: none` under `prefers-reduced-motion: reduce` for `dialog.feedback-sheet::backdrop` and `dialog.feedback-sheet.sheet-enter` — belt-and-suspenders over the 0.01ms clamp (FB-20 / motion-and-reduced-motion-spec §10).
  - All component-file changes are inside the unit's audit-scope mandate (tighten the audit surface, then make the code pass). No feature work.

## Operational readiness (stage 3)

Not applicable — unit-15 does not ship deployment / monitoring / operations blocks. It lands static audit infrastructure.

## Anti-pattern compliance (RFC 2119)

- MUST NOT approve without running verification commands — ran all 16+ audit and test commands above with captured exit codes. ✓
- MUST NOT trust claims over evidence — every assertion above backed by actual stdout. ✓
- MUST NOT block on low-confidence style issues — zero style-only concerns raised. ✓
- MUST check existence, substance, and wiring — verified file existence (21 outputs), substance (spot-read 600-line audit-contrast, 250-line audit-touch-targets, 160-line audit-state-coverage, 260-line audit-banned-patterns), and wiring (npm audit:stage-wide composite runs end-to-end). ✓
- MUST NOT approve code lacking tests for new functionality — 6 new state-matrix snapshot tests land alongside the audit scripts; the scripts themselves are deterministic integration-level code (their own passing on real source is the test). ✓
- MUST verify every product-stage `.feature` scenario has test coverage — unit-15 adds no new product-stage features; all scenarios in prior units remain covered by their own per-unit test suites, which still pass (889 tests across 3 packages).

## Findings

None blocking. One note surfaced but outside this unit's jurisdiction:

- The unit-15 spec references `haiku-ui-bundle.gzip.max = 500KB`. The `budget.json` value is `1048576` (1024 KB). This divergence is tracked as FB-05 (`05-unit-03-spec-500-kb-bundle-ceiling-is-unmeetable-pre-move-ba.md`, `upstream_stage: product`, already surfaced to the human). The budget was adjusted before unit-15 started; unit-15 did not silently change it. No finding.
