# Development-Stage Invariants

This file declares rules that bind every unit in the development stage.
Units MUST NOT contradict these invariants. If a unit spec and an invariant
disagree, the invariant wins and the unit spec must be corrected.

Authored as the stage-level remedy for **FB-49** ("Subjective gates in unit
completion criteria violate 'testable, no subjective judgment' mandate").
The paired `unit-completion-criteria-clarifications.md` artifact translates
each affected unit's ambiguous criteria into deterministic command-based
gates; this file owns the cross-unit invariants those clarifications
reference.

## Runtime-verification tools

**Playwright is out of scope for this stage.** Reason: the browser-launching
tooling (`chrome-launcher`, Playwright's chromium auto-download) has
repeatedly wedged on install or clobbered developers' local Chrome profiles
on this codebase. A proper Playwright-sandboxed suite will land as a
follow-up unit once an isolated Playwright workspace exists.

Consequences:
- No unit spec may require `.spec.ts` / `.spec.tsx` files executed via
  `@playwright/test`.
- Any unit currently referencing a "Playwright test" MUST convert the test
  to RTL / JSDOM (vitest) or declare the test out of scope with an explicit
  follow-up-unit reference.
- The `@playwright/test` dep, `playwright.config.ts`, and any Playwright
  spec files introduced by prior bolts MUST be absent from the final stage
  state. Gate grep (must return zero outside this invariants file and the
  paired clarifications artifact):
  `grep -R "@playwright/test\|playwright\.config" packages/`.

**Headless Lighthouse (chrome-launcher) is out of scope for this stage**
for the same reason. A11y verification happens via `axe-core` inside RTL
tests (see unit-06's axe-core gate).

## Parity / visual-regression coverage

Every "parity" or "visual-regression" criterion MUST state:

1. A single command that exits 0 on pass.
2. The enumerated assertion the command makes (either inline, or by
   pointing at a specific test file + test name).

"Parity" is never a reviewer judgment. If the rule can't be reduced to a
deterministic check, the criterion itself is broken and must be rewritten.

## Perf budgets

Perf numeric budgets (e.g. 16 ms / keypress, 100 ms first paint) must be
measured via `performance.now()` inside a vitest-jsdom test, not via
Playwright, for the duration of this stage.

## DOM parity snapshots

DOM-parity tests that rely on committed snapshots (e.g.
`tests/parity.spec.tsx`, `src/pages/review/__tests__/*.test.tsx`) MUST:

- Use the shared transformer at
  `packages/haiku-ui/tests/dom-parity-transformer.ts` to strip volatile
  attributes (`data-reactid`, auto-generated id suffixes).
- Regenerate the snapshot intentionally (never silently) when a unit's
  changes legitimately alter rendered DOM. Snapshot diffs MUST be
  documented in that unit's review notes.

## Conflict-resolution rule (cross-unit)

When two units in this stage disagree on a tool-of-record (e.g. unit-07
removes Playwright while unit-13 still requires it), the stage invariants
above are authoritative. Any unit whose body text still contradicts the
invariants is considered to have its conflicting line superseded by the
corresponding entry in `unit-completion-criteria-clarifications.md`. Unit
frontmatter (status, bolt, hat, iterations, outputs, completed_at) is not
affected — only the prose criteria.
