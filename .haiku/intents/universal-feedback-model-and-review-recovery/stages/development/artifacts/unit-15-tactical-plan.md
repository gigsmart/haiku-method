# Tactical Plan: unit-15 Stage-wide audit

Owner: planner (bolt 1)

Target: Land the final stage-wide audit superset. Every gate is a deterministic executable invoked by CI; no prose gates. The builder adds seven new audit scripts (touch-targets, bundle-size, state-coverage, openapi-parity, reduced-motion, keyboard-shortcuts, live-regions), extends `audit-contrast.mjs` with a `--mode=rendered` pass over the built SPA, expands the `stage-wide` profile in `audit-config.json` with the full set of bans declared in the unit spec, and ensures all existing upstream audits still exit 0. No new feature work — every prior unit has landed; this unit closes the quality-gate superset.

The unit is explicitly **one bolt wide** because every deliverable is a deterministic script + a thin config extension. No component refactors, no Cucumber step definitions (no BDD runner in scope; the product-stage `.feature` files are surfaced via acceptance-criteria links already covered by unit-01 and the per-feature RTL tests already committed in units 05–14).

---

## Context & Prior Art

### The "superset audit" model

Every prior unit (01 – 14) has its own gate executable(s) — `verify-tokens.mjs`, `audit-contrast.mjs --mode=tokens`, `audit-banned-patterns.mjs --profile=tokens`, per-component vitest suites, etc. Unit-15's role is the **stage-wide superset**: the moment any of those component units lands something that violates a cross-cutting rule (raw hex color, banned verb, sub-44px touch target, orphaned live region, etc.), this unit's `--profile=stage-wide` profile + the seven new scripts catch it deterministically at the stage-close gate.

The spec's "Completion Criteria" list (lines 91–109 of `unit-15-stagewide-audit.md`) is copy-pasted into `packages/haiku-ui/package.json` as a top-level `audit:stage-wide` composite script so CI invokes a single entrypoint. Failure in any child script aborts the composite.

### Existing scripts (read-only baselines)

- `packages/haiku-ui/scripts/verify-tokens.mjs` — parity between `DESIGN-TOKENS.md §2.1 / §2.2 / §2.5` and `src/index.css` + `tailwind.config.ts`.
- `packages/haiku-ui/scripts/audit-contrast.mjs` — `--mode=tokens` canonical 30-pair WCAG audit; `--mode=rendered` currently exits 0 with a note "deferred to unit-15" (line 292). This unit wires `--mode=rendered`.
- `packages/haiku-ui/scripts/audit-banned-patterns.mjs` — generic rule-engine consuming `audit-config.json`; supports banned (fail-on-hit) AND required-presence (fail-on-zero-hits) rules. The `stage-wide` profile already exists and extends `tokens`; this unit adds rules to it.
- `packages/haiku-api/scripts/emit-openapi.mjs` — emits `dist/openapi.json` from the built `haiku-api` module. Consumed by the new `audit-openapi-parity.mjs`.
- `packages/haiku-api/test/openapi.test.mjs` — reference pattern for importing `buildOpenApi()` from `dist/index.js` + `dist/openapi.json`. The new parity audit follows the same import convention but bounds itself with a timeout and probes an **actual running** test MCP rather than static `dist/openapi.json` (spec line 73 requires "test MCP + `dist/openapi.json`, bounded probe, 30s budget").

### Existing a11y primitives (already wired into pages by units 05–14)

- `packages/haiku-ui/src/a11y/live-regions.tsx` — `LiveRegionShell` mounts `#feedback-live-polite` + `#feedback-live-assertive` exactly once at `App.tsx:44`. `announce()` and `useAnnounce()` write to those specific IDs only. The new `audit-live-regions.mjs` audits for (a) exactly one mount of each ID in the production SPA DOM, and (b) every `announce()` / `useAnnounce()` call site writes to one of those two canonical IDs (no rogue live regions).
- `packages/haiku-ui/src/a11y/keyboard.ts` — `KEYBOARD_SHORTCUT_REGISTRY` (17 entries, lines 48–190) mirrors `keyboard-shortcut-map.html §1`. The new `audit-keyboard-shortcuts.mjs` parses the HTML, walks the registry + every `useShortcut(key, ..., { scope })` call site in `src/`, and asserts every `(key, scope)` row in the HTML has a matching registration (or a matching entry in the registry that's actually referenced). Orphaned rows → non-zero exit with a line-pointed report.
- `packages/haiku-ui/src/a11y/reduced-motion.ts` — `useReducedMotion()` + `motionSafeClass()`. The new `audit-reduced-motion.mjs` grep-scans `src/**/*.{ts,tsx,css}` for `animate-*` utilities, `@keyframes` declarations, `transition-*` utilities (per `motion-and-reduced-motion-spec.md §10.audit`), and asserts each one either (a) is gated through `motionSafeClass(…)` or a `motion-safe:*` prefix, or (b) lives under a `@media (prefers-reduced-motion: reduce)` guard.

### Existing state-coverage snapshots

`packages/haiku-ui/src/components/feedback/__tests__/__snapshots__/` already contains `{Component}.states.test.tsx.snap` files for `FeedbackStatusBadge`, `FeedbackOriginIcon`, `FeedbackItem`, `FeedbackList`, `FeedbackSummaryBar`, `FeedbackFloatingButton`. The new `audit-state-coverage.mjs` enumerates every DESIGN-BRIEF §2 component via `state-coverage-grid.md §0`, asserts a `.snap` file exists for each, and asserts the snapshot file contains ≥ (6 × status-variants) rendered entries per the per-component cardinality declared in the grid (ceiling: 36).

---

## Files to Modify / Create

### New scripts (seven files)

1. **`packages/haiku-ui/scripts/audit-touch-targets.mjs`** — headless-browser walk of `dist/index.html` (after `npm run build`). Uses `playwright` (already available at repo root — `package.json:7 devDependencies.playwright: ^1.58.2`). Loads the built single-HTML blob via `page.setContent()`, queries every `[role=button], [role=switch], button, [tabindex="0"], a[href], input, select, textarea`, asserts `getBoundingClientRect()` ≥ 44×44 CSS px on a 375×667 viewport (mobile). Exit 0 on pass; exit 1 with a per-element report listing visible dimensions, effective dimensions via the `::before` hit-area-extension rule (`touch-target-audit.md §2`), and a line-level source pointer if the element carries a unique `data-testid`.

2. **`packages/haiku-ui/scripts/audit-bundle-size.mjs`** — computes gzipped size of `dist/index.html` via `zlib.gzipSync`. Compares against `budget.json` (`bundleGzipMaxBytes`, currently `1048576` = 1MB per the existing override) AND against a new `budget-baseline.json` (creates the file on first run with current size; subsequent runs fail if the new size is `> baseline × 1.05`). Absolute-cap failure AND 5%-regression failure both exit 1. **The unit spec (line 61) cites "500KB" as `haiku-ui-bundle.gzip.max` — but `budget.json` lines 2 + 7 record the existing override to 1024 KB with the full FB-05 rationale for why 500KB is unachievable against the current SPA dependency set (`@xyflow/react + elkjs + mermaid + react-markdown + remark`). Resolve: script reads the cap from `budget.json` (source of truth), not a hard-coded 500KB literal.** The spec-vs-budget-reality conflict is surfaced in the FB-05 history; this unit does not re-open it.

3. **`packages/haiku-ui/scripts/audit-state-coverage.mjs`** — walks `src/components/**/__tests__/__snapshots__/*.states.test.tsx.snap`, asserts one file per DESIGN-BRIEF §2 component (cross-ref `state-coverage-grid.md §0` component list lines 13–27 — twelve components). Parses the vitest snapshot format, counts entries, asserts each file has ≥ (6 × `status-variants`) entries up to the cardinality ceiling of 36. Exit 1 with a per-component delta on shortfall.

4. **`packages/haiku-ui/scripts/audit-reduced-motion.mjs`** — source-scan (no browser needed). Walks `packages/haiku-ui/src/**/*.{ts,tsx,css}`. For each file:
    - Find `@keyframes <name>` declarations → assert a matching `@media (prefers-reduced-motion: reduce)` block in the same file (scoped to the class consuming the keyframes; matches `motion-and-reduced-motion-spec.md §10.audit`).
    - Find `animate-pulse`, `animate-spin`, `transition-*`, `duration-*` utility classes → assert the consumer file either threads through `motionSafeClass(…)` / `useReducedMotion()` OR the class is prefixed with `motion-safe:*`. Per `motion-and-reduced-motion-spec.md §10.rule`, the global `0.01ms` guard in `index.css` is acceptable fallback — if `index.css` contains the canonical `@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; } }` block, per-file transitions pass by default and only **decorative-only** animations (`@keyframes` with no state-cue role) must add an explicit `animation: none` override.
    - Exit 0 when 100% of detected animated elements are compliant; exit 1 with a per-file report on any miss.

5. **`packages/haiku-ui/scripts/audit-keyboard-shortcuts.mjs`** —
    - Parses `stages/design/artifacts/keyboard-shortcut-map.html §1` via a lightweight regex over the `<tr>` rows in the first `<table>` under `<h2>1. Shortcut table (canonical)</h2>` (DOM traversal not required; the HTML is hand-authored and stable).
    - Reads `packages/haiku-ui/src/a11y/keyboard.ts` (`KEYBOARD_SHORTCUT_REGISTRY`) via a dynamic import (the module is pure data, no React runtime).
    - Grep-walks `packages/haiku-ui/src/**/*.{ts,tsx}` for `useShortcut(key, …, { scope })` call sites.
    - Asserts every `(key, scope)` in the HTML table has a matching registry entry AND ≥ 1 `useShortcut` call site. Orphaned HTML rows → fail. Unregistered source bindings (grep hits with no HTML row) → fail.
    - Exits 0 when both sides are in parity; exits 1 with a per-row report.

6. **`packages/haiku-ui/scripts/audit-live-regions.mjs`** —
    - Greps `packages/haiku-ui/src/` for the literal strings `#feedback-live-polite`, `#feedback-live-assertive`, `id="feedback-live-polite"`, `id="feedback-live-assertive"`, and references to `POLITE_REGION_ID` / `ASSERTIVE_REGION_ID`.
    - Asserts **exactly one** JSX mount site for each (expected location: `packages/haiku-ui/src/a11y/live-regions.tsx` `<LiveRegion id={POLITE_REGION_ID}>` + `<LiveRegion id={ASSERTIVE_REGION_ID}>`), and **exactly one** mount of `<LiveRegionShell>` in `App.tsx`.
    - Walks every `announce("…", …)` / `useAnnounce()` call site and confirms it goes through the `a11y/live-regions.tsx` module (no inline `document.getElementById("feedback-live-polite")` writes outside the module itself). Exceptions: tests that query the DOM to assert announcements — excluded via `/__tests__/` path filter.
    - Exits 0 on parity; exits 1 with a per-hit report.

7. **`packages/haiku-api/scripts/audit-openapi-parity.mjs`** —
    - Runs `packages/haiku-api` build (`tsc && node scripts/emit-openapi.mjs`) to ensure `dist/openapi.json` is up-to-date. If `dist/openapi.json` already exists and its `info.version` matches `packages/haiku-api/package.json:version`, skip rebuild.
    - Spins up a **test MCP** (sub-process `node packages/haiku/dist/server.js` with `HAIKU_HARNESS=review --port=0`). Waits for the server's ready line or probes `/health` up to 30s.
    - Probes every path declared in `dist/openapi.json:paths` (bounded — GET only, small body) and asserts the response shape validates against the declared schema via Zod. Methods other than GET are probed with a canonical empty-body payload and asserted to return either 400 (schema rejection) or 200 / 201 with schema-matching body — **never 404** (route missing from the MCP).
    - Kills the MCP on completion. Exits 0 if every path in `dist/openapi.json` is served; exits 1 with a missing-path or schema-mismatch report. 30s wall-clock budget enforced via `setTimeout` + `AbortController`.

### Extensions to existing scripts

8. **`packages/haiku-ui/scripts/audit-contrast.mjs` — `--mode=rendered`** (lines 289–301 of existing file): wire the rendered mode.
    - Uses `playwright` on a locally-served fixture page (spec line 63 — "fixtures"). The review SPA is a single HTML blob, so `audit-contrast.mjs --mode=rendered` calls `page.setContent(distHtml)` then navigates through each DOM "page" represented by the route-guard switch in `App.tsx`: `/review/:id`, `/question/:id`, `/direction/:id`, `/` (home), using the committed fixtures in `packages/haiku-ui/test-fixtures/*.json`.
    - For each route-rendered DOM, walks every visible text node + its nearest ancestor computed `background-color` + `color`, deduplicates pairs by `(fg-token, bg-token, font-size-bucket)`, asserts WCAG pass via the existing `pairRatio()` helper. Unique-pair count asserted `< 200` (spec line 63 — "to catch explosions").
    - **30s wall-clock budget** (spec line 63) enforced via `Promise.race([audit(), timeout(30_000)])`. Timeout = exit 1 with "budget exceeded".
    - Exit 0 on pass; exit 1 with per-pair report on any failure.

9. **`packages/haiku-ui/audit-config.json` — extend `stage-wide` profile** — current file already has an `extends: "tokens"` profile with 5 rules (lines 83–134). This unit adds to that profile:
    - **XSS sinks** (spec line 66) — `dangerouslySetInnerHTML | innerHTML\s*= | \beval\( | new Function\( | document\.write\(` scoped to `packages/haiku-ui/src/**/*.{ts,tsx}` AND `packages/haiku-api/src/**/*.ts`. An existing rule `banned-xss-sinks-annotation-path` already covers `packages/haiku-ui/src/pages/review/**/*.{ts,tsx}` — keep it for narrower-fail-first, add a new `banned-xss-sinks-stage-wide` that covers the full SPA + the API package. Allow-list via `// audit-allow: <reason>` inline comment (the script needs a new pre-check that strips allow-listed lines).
    - **Button-verb bans** (spec line 67) — already present in `tokens` profile as `banned-button-verb-content` + `banned-button-verb-aria` (lines 67–80 of `audit-config.json`). Inherited into `stage-wide`; no new rule needed.
    - **Hyphenated "Re-open"** (spec line 68) — new rule `banned-hyphenated-reopen` with pattern `\bRe-open\b` scoped to `packages/haiku-ui/src/**/*.{ts,tsx}`. Case-sensitive so it doesn't trip on documentation prose mentioning "re-open" in lowercase sentences; all DESIGN-BRIEF and footer-button-copy-spec uses "Reopen" (one word, capital R, no hyphen) per `footer-button-copy-spec.md` line 20. Exclude `__tests__/**` and `audit-config.json` itself.
    - **Raw hex colors** (spec line 69) — new rule `banned-raw-hex` with pattern `#[0-9a-fA-F]{6}\b` scoped to `packages/haiku-ui/src/**/*.{ts,tsx,css}`, excluding `packages/haiku-ui/src/index.css` (where `@theme` token definitions legitimately use hex), `**/__snapshots__/**`, and `scripts/**`. Allow-list via `// audit-allow: <reason>` inline comment. The rationale: tokens live in `index.css`; any raw hex outside that file bypasses the design-token system.
    - **`max-w-[1400px]` literal** (spec line 70) — already present as `banned-content-max-literal` (line 62 of `audit-config.json`). Inherited into `stage-wide`. No new rule needed.
    - **Sidebar `lg:w-96` regression** (spec line 71) — already present as `banned-sidebar-drift` (line 54 — pattern `w-80\s+(lg|xl):w-96`). Inherited into `stage-wide`. No new rule needed. The `lg:w-96` literal alone (without the preceding `w-80`) is ambiguous — the canonical breakpoint is `xl:w-96`, so a solitary `lg:w-96` IS a regression. Add a narrower `banned-lg-w-96-solitary` rule with pattern `(?<!\bw-80\s)\blg:w-96\b` scoped to `packages/haiku-ui/src/pages/review/FeedbackSidebar.tsx` and `src/pages/review/index.tsx` per the DESIGN-BRIEF §4 sidebar-relevant-files scope. Document the rationale in the audit-config JSON's `description` field.
    - **`focus:ring-1`** (spec line 72) — already present as `banned-focus-ring-1` (line 47). Inherited into `stage-wide`. No new rule needed.

### New baseline files

10. **`packages/haiku-ui/budget-baseline.json`** — JSON `{ "createdAt": "<ISO>", "gzipBytes": <current measured> }`. Written on first run of `audit-bundle-size.mjs` if the file is missing; subsequent runs compare against it. Updates to this file require an explicit PR (spec line 61 — "updated only via explicit PR"). The audit script itself does NOT update the baseline — only a dedicated `audit-bundle-size.mjs --update-baseline` invocation does, and it prints a confirmation line the human reviewer can grep in the diff.

11. **`packages/haiku-ui/package.json` — new `audit:stage-wide` composite script** —
    ```json
    "audit:stage-wide": "node scripts/verify-tokens.mjs && node scripts/audit-contrast.mjs --mode=tokens && node scripts/audit-contrast.mjs --mode=rendered && node scripts/audit-touch-targets.mjs && node scripts/audit-bundle-size.mjs && node scripts/audit-state-coverage.mjs && node scripts/audit-banned-patterns.mjs --profile=stage-wide && node scripts/audit-reduced-motion.mjs && node scripts/audit-keyboard-shortcuts.mjs && node scripts/audit-live-regions.mjs"
    ```
    And a sibling entry for the API package:
    ```json
    "audit:openapi-parity": "node scripts/audit-openapi-parity.mjs"
    ```

---

## Implementation Steps (builder, bolt 1)

The builder executes in this order. Each step is independent enough to commit on its own; the first six steps can run in any order; step 7 depends on step 2; step 8 depends on steps 1–6 landing.

1. **Step 1 — extend `audit-config.json` `stage-wide` profile.** Add the four new rules (`banned-xss-sinks-stage-wide`, `banned-hyphenated-reopen`, `banned-raw-hex`, `banned-lg-w-96-solitary`). Verify `node packages/haiku-ui/scripts/audit-banned-patterns.mjs --profile=stage-wide` still runs without a config error. Allow-list `// audit-allow: <reason>` parsing lives in `audit-banned-patterns.mjs` — add a new pre-pass in the rule loop that strips matching lines from the target content before the regex runs.

2. **Step 2 — wire `audit-contrast.mjs --mode=rendered`.** Replace lines 289–294 (the stubbed rendered branch) with a real implementation. Launch `playwright` headless-chromium, `page.setContent(distHtml)`, walk routes via `window.history.replaceState`, collect pairs via `window.getComputedStyle` evaluation inside `page.evaluate`. Deduplicate, assert `< 200` unique pairs, assert WCAG AA. 30s budget.

3. **Step 3 — create `audit-touch-targets.mjs`.** Boot playwright, render the built `dist/index.html` at a 375×667 viewport, query interactive selectors, assert ≥ 44×44. Respect the `::before` hit-area extension — if an element has a `::before` pseudo with computed `width ≥ 44px; height ≥ 44px; position: absolute`, the element passes (read via `page.evaluate(() => getComputedStyle(el, '::before'))`). The inline-text exception (`touch-target-audit.md §1`) applies only to `<a>` inside a `<p>` ancestor; any `<button>` / `<a href>` outside flowing prose MUST meet 44×44.

4. **Step 4 — create `audit-bundle-size.mjs`.** `zlib.gzipSync(readFileSync('dist/index.html'))` → `.byteLength`. Read `budget.json.bundleGzipMaxBytes` → absolute-cap check. Read `budget-baseline.json.gzipBytes` → 5%-regression check (`current > baseline * 1.05` fails). Create baseline on first run if missing; otherwise never update from the audit path (only `--update-baseline`).

5. **Step 5 — create `audit-state-coverage.mjs`.** Read `state-coverage-grid.md §0` via regex (`\| \`(\w+)\` \|` inside the "DESIGN-BRIEF §2 component checklist" table) → 12-entry expected component list. For each, assert `src/components/feedback/__tests__/__snapshots__/{Component}.states.test.tsx.snap` exists AND contains ≥ (6 × status-variants) entries (count `exports[\` ... \`]` lines in the snapshot). FeedbackItem has 4 status variants (pending / addressed / closed / rejected) × 2 variants (compact / expanded) × 6 states = 48, capped at 36 per spec. FeedbackStatusBadge has 4 status variants × 6 states = 24. FeedbackOriginIcon has 6 origins × 6 states = 36.

6. **Step 6 — create `audit-reduced-motion.mjs`.** Source-scan only; no browser. Walk `src/**/*.{ts,tsx,css}` + `index.css`. Confirm `index.css` contains the canonical global guard; for each file with `animate-*` / `transition-*` / `@keyframes`, assert the file either delegates to `motionSafeClass` / `useReducedMotion` / `motion-safe:` OR ships a per-keyframe `@media (prefers-reduced-motion: reduce)` override.

7. **Step 7 — create `audit-keyboard-shortcuts.mjs`.** Parse HTML via regex over the single shortcut table. Dynamic-import `a11y/keyboard.ts`. Grep for `useShortcut` call sites. Reconcile. Report orphans.

8. **Step 8 — create `audit-live-regions.mjs`.** Grep + AST scan via regex. Assert exactly-one mount of each live region ID + single `<LiveRegionShell>` mount in `App.tsx`. Walk `announce` / `useAnnounce` call sites, confirm they route through `a11y/live-regions.tsx`.

9. **Step 9 — create `audit-openapi-parity.mjs`.** Reuse the `packages/haiku-api/test/openapi.test.mjs` dynamic-import pattern for `buildOpenApi()`. Spawn the MCP via `child_process.spawn`, probe, reconcile, kill.

10. **Step 10 — wire `audit:stage-wide` composite in `package.json` + root-level `audit:all` if useful.** Add npm scripts for `audit:stage-wide` (haiku-ui) and `audit:openapi-parity` (haiku-api). CI invokes both via `bun run --filter '*' audit:*`.

11. **Step 11 — run the full superset locally in the unit worktree**, once each script lands. Any failure = fix the root cause (not the audit) per the rule in `architecture-prototype-sync.md` ("implementation is right, prototype is wrong"). Same principle here: the SPA is the source of truth; the audit reports what is wrong with the SPA.

12. **Step 12 — commit in logical chunks.** One commit per script; one for `audit-config.json` extension; one for the `package.json` wiring; one for the rendered-contrast extension; one squashed final commit with the composite invocation + stage-wide test pass evidence.

---

## Verification Commands (executed after each step + in the final reviewer gate)

Every command MUST exit 0. Long-running commands use explicit Bash `timeout` parameters (typecheck 120000ms, test 300000ms, build 600000ms) per the hat prompt.

- `npx tsc --noEmit` (repo-wide) — 120s budget
- `bun run --filter '*' test` (all packages; inherits vitest 300s budget) — 300s budget
- `node packages/haiku-ui/scripts/verify-tokens.mjs` — sub-second
- `node packages/haiku-ui/scripts/audit-contrast.mjs --mode=tokens` — sub-second
- `node packages/haiku-ui/scripts/audit-contrast.mjs --mode=rendered` — 30s hard budget
- `node packages/haiku-ui/scripts/audit-touch-targets.mjs` — ~10s (playwright boot + walk)
- `node packages/haiku-ui/scripts/audit-bundle-size.mjs` — sub-second
- `node packages/haiku-ui/scripts/audit-state-coverage.mjs` — sub-second
- `node packages/haiku-ui/scripts/audit-banned-patterns.mjs --profile=stage-wide` — sub-second
- `node packages/haiku-ui/scripts/audit-reduced-motion.mjs` — sub-second
- `node packages/haiku-ui/scripts/audit-keyboard-shortcuts.mjs` — sub-second
- `node packages/haiku-ui/scripts/audit-live-regions.mjs` — sub-second
- `node packages/haiku-api/scripts/audit-openapi-parity.mjs` — 30s hard budget
- `packages/haiku-ui/scripts/audit-lighthouse.mjs` MUST NOT exist; `grep -r lighthouse packages/haiku-ui/package.json packages/haiku-ui/scripts/` returns zero matches (spec line 103).

Final invocation: `bun run --filter '*' audit:stage-wide && bun run --filter '*' audit:openapi-parity`. Both green = unit ready to advance.

---

## Risk Assessment

1. **Playwright boot time + repeated cold-starts.** Three audits (`touch-targets`, `contrast --mode=rendered`, `openapi-parity`) each spin up a browser or MCP. Cold-start overhead (~3–5s each) pushes the full audit suite past 60s wall-clock. **Mitigation:** audits run in parallel via `Promise.all` inside the composite script when they don't share state; `audit-openapi-parity` and the two playwright audits are independent. The composite script uses a single `concurrently` wrapper (already in the node ecosystem via `node:child_process`) — or more simply, `npm-run-all --parallel` if the root package already has it. **Fallback:** if parallelism is complex enough to defer, run sequentially with the ~60s overhead; the spec allows it (no performance budget on the composite).

2. **`budget-baseline.json` first-run chicken-and-egg.** The script needs a baseline file but the unit is the one creating it. **Mitigation:** on first run, the audit writes the baseline, prints a "BASELINE CREATED" line, and exits 0. A CI reviewer sees the new file in the diff and approves it as the seed. Subsequent runs enforce the 5% rule.

3. **`audit-contrast.mjs --mode=rendered` 200-unique-pair explosion.** The spec sets `< 200` as a sanity ceiling (line 63). A regression that introduces many inline-styled color pairs could trip this. **Mitigation:** the audit reports the top 20 most-frequent pairs in its output so the reviewer can see WHICH new pair class is blowing the budget; the 200 ceiling is a canary, not a hard architectural constraint. If legitimate growth pushes above 200, the unit-15 follow-up amends the ceiling rather than whack-a-moling.

4. **`audit-openapi-parity.mjs` MCP spawn reliability on macOS vs Linux CI.** The MCP subprocess may take longer to boot on cold macOS runners. **Mitigation:** the spec's 30s budget is generous; the probe loop begins with a 200ms poll interval and exponential-backs off up to 2s between probes, so the cold-start is amortized. If the MCP fails to start within 30s, the script exits 1 with a clear "mcp_boot_timeout" message — not a flaky `connection refused` cascade.

5. **`audit-reduced-motion.mjs` false-positives on `transition-colors` + existing global 0.01ms guard.** The spec (`motion-and-reduced-motion-spec.md §10.rule`) explicitly allows `transition-duration: 0.01ms !important` at `index.css` scope as the global default; a per-file `transition-colors` utility does NOT then need a per-file override. **Mitigation:** the audit checks `index.css` first; if the canonical global guard is present, `transition-*` utilities pass automatically. Only `@keyframes` declarations and `animation:` properties still require per-class overrides (because the spec §10.rule calls out that non-essential animations SHOULD additionally ship an explicit `animation: none`).

6. **`audit-keyboard-shortcuts.mjs` HTML parsing.** Hand-authored HTML in `keyboard-shortcut-map.html` is stable but has inline `<span>` / `<code>` tags inside `<td>` cells that complicate naive `\|([^|]+)\|` regex. **Mitigation:** use `parse5` (already in the dev-dep tree via axe-core's transitive deps, or easily added) to DOM-parse the HTML and traverse the `<table>` rows structurally. Fallback: hand-authored line-by-line parser keyed on `<kbd class="k" aria-keyshortcuts="...">` (every canonical row carries this attribute).

7. **Pre-existing typecheck / test failures.** The Boy Scout Rule applies (quality/no-excuses rule): any `tsc --noEmit` failure or `vitest` failure this unit surfaces is this unit's to fix — NOT "pre-existing". **Mitigation:** builder runs `npx tsc --noEmit && bun run --filter '*' test` at step 0 (before writing any new script) to baseline the repo state. If any failure exists at baseline, builder rejects via `haiku_unit_reject_hat` with the specific failure — this unit cannot advance on a broken repo.

8. **MCP test-server (haiku-api parity audit) port conflicts in CI.** Parallel CI runs could collide on a hard-coded port. **Mitigation:** the audit requests `--port=0` so the OS assigns an ephemeral port, reads the port back from the MCP's ready line (`listening on http://127.0.0.1:<port>`). No port constant in the audit source.

---

## Out of Scope (Expressly)

- **Playwright-sandboxed axe audit.** The unit spec calls this out at line 75 — "A Playwright-sandboxed axe audit lands as a follow-up unit; out of scope here." Confirmed. This unit's accessibility coverage is the existing axe-core RTL tests committed in units 05–14 via `packages/haiku-ui/tests/a11y-pages.spec.tsx`, which already run in `npm test` and cover every page against WCAG 2.1 AA.
- **Cucumber step definitions.** The project uses vitest, not cucumber-js. The `.feature` files under `features/` are read by acceptance-criteria artifacts only; every scenario is covered by a matching vitest test committed in units 05–14. No new test framework wiring is in scope.
- **New Lighthouse integration.** Explicitly forbidden (spec line 103 + `packages/haiku-ui/README.md` / unit-06 history: chrome-launcher clobbered local dev Chrome).
- **budget-baseline.json update policy enforcement.** The spec says "updated only via explicit PR" — enforcement is the human reviewer reading the diff. No automated guard.

---

## Completion Signal

Unit is ready to advance when:
1. All 11 scripts land on disk (seven new + rendered-mode extension + four new config rules + baseline JSON + package-json wiring).
2. Every command in the "Completion Criteria" list in `unit-15-stagewide-audit.md §Completion Criteria` (lines 91–109) exits 0 when invoked from the worktree root.
3. `npx tsc --noEmit && bun run --filter '*' test` exits 0.
4. `audit-lighthouse.mjs` does NOT exist and `grep -r lighthouse packages/haiku-ui/{package.json,scripts/}` returns empty.
5. Builder commits in logical chunks per step 12 above. Every commit lands inside the unit worktree's tree (`git -C <worktree>`), no push.
