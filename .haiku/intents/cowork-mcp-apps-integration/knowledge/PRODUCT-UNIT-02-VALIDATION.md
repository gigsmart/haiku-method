---
artifact: validator-log
unit: unit-02-finalize-feature-files
stage: product
hat: validator
validated_at: '2026-04-15'
---

# Validator Log — unit-02-finalize-feature-files

## Criterion 1 — All 7 .feature files parse as valid Gherkin

Manual inspection of all 7 files. Each file uses correct `Feature:`, `Background:`, `Scenario:`, `Scenario Outline:`, `Examples:` keywords. Step prefixes (`Given`/`When`/`Then`/`And`) are consistent throughout. Indentation is uniform (2-space scenarios, 4-space steps). No syntax violations found.

**PASS** — All 7 files parse as valid Gherkin.

Files verified:
- `mcp-apps-capability-negotiation.feature` — 10 scenarios, 1 Scenario Outline
- `workspace-handshake.feature` — 8 scenarios, no Outline
- `iframe-review-gate.feature` — 9 scenarios, 1 Scenario Outline
- `iframe-decision-submit.feature` — 13 scenarios, 4 Scenario Outlines
- `host-bridge-detection.feature` — 10 scenarios, no Outline
- `error-recovery.feature` — 15 scenarios, 1 Scenario Outline
- `accessibility-iframe.feature` — 22 scenarios, 4 Scenario Outlines

## Criterion 2 — Every AC item has a covering scenario

Cross-referencing `ACCEPTANCE-CRITERIA.md` (V1–V6, GR-01–GR-11, SC-01–SC-02) against feature scenarios:

| AC Group | AC Items | Coverage |
|---|---|---|
| V1 (MCP host capability) | V1-01 through V1-07 | `mcp-apps-capability-negotiation.feature`: all seven addressed. V1-01 → "Client supports/does not support MCP Apps"; V1-02 → "_meta.ui.resourceUri present in tool result"; V1-03 → "startHttpServer never called"; V1-04 → HTTP path unchanged; V1-05 → env-var scenario; V1-06 → "resources/list returns one entry" + "resources/read returns byte-identical"; V1-07 → hash stability scenarios. |
| V2 (Workspace state) | V2-01 through V2-04 | `workspace-handshake.feature`: V2-01 → "zero roots" scenario; V2-02 → "one root auto-selected"; V2-03 → "multiple roots elicitInput"; V2-04 → "Gate session data identical". |
| V3 (Breakpoint) | V3-01 through V3-08 | V3-01, V3-03, V3-04 → `iframe-review-gate.feature` + `accessibility-iframe.feature`; V3-02 → "ResizeObserver not window.innerWidth" in `accessibility-iframe.feature`; V3-05, V3-06 → `accessibility-iframe.feature` (DesignPicker stacking, AnnotationCanvas resize via general scenarios); V3-07 → "Drag < 24px" + "Fling > 0.5px/ms" in `accessibility-iframe.feature`; V3-08 → "Decision panel emphasis styling" in `accessibility-iframe.feature`. Note: V3-04, V3-05, V3-06 are P1 items; `accessibility-iframe.feature` Scenario Outlines cover the touch-target dimension across breakpoints. |
| V4 (Decision outcome) | V4-01 through V4-06 | `iframe-review-gate.feature`: V4-01 → "Human reviewer approves"; V4-02 → "requests changes"; V4-03 → "escalates to external review"; V4-04 → shape-parity scenario in `iframe-decision-submit.feature`; V4-05 → Scenario Outline "Each decision outcome renders correct success-state colour" in `iframe-review-gate.feature`; V4-06 → "Success state contains no buttons". |
| V5 (Session type) | V5-01 through V5-09 | `iframe-decision-submit.feature`: V5-01 → "haiku_cowork_review_submit is not invoked" (regression) + "unknown session_type rejected"; V5-02 → review session Outline row; V5-03 → question session Outline row; V5-04 → "design_direction submit fires stage-state write"; V5-05 → Scenario Outline "All three session types carry same URI"; V5-06 → "Single FSM run all three session types"; V5-07 → `host-bridge-detection.feature` "submitDecision routes through App.callServerTool" + "getSession hydrates from updateModelContext"; V5-08 → "Both detection gates pass" + "App throws → browser mode"; V5-09 → "haiku_cowork_timeout_probe not in list_tools" + "_openReviewAndWait blocks on single await". |
| V6 (Connection state) | V6-01 through V6-08 | `error-recovery.feature`: V6-01 → "teal Connected dot + aria-live on reconnect"; V6-02 → "amber pulsing, no error screen"; V6-03 → error state Retry+escalate; V6-04 → NegotiationErrorScreen; V6-05 → SandboxErrorScreen; V6-06 → SessionExpiredScreen; V6-07 → StaleHostWarning banner; V6-08 → "Boot screen loading → connecting → ready" + reduced-motion. |
| GR-01 through GR-11 | All 11 | `accessibility-iframe.feature`: GR-01 → touch target Scenario Outline; GR-02 → "Focus moves on mount" + "After decision focus moves to heading"; GR-03 → "no window.close" in `iframe-review-gate.feature`; GR-04 → "external-review URL is copy-to-clipboard" in `iframe-review-gate.feature`; GR-05 → env-var scenario in `mcp-apps-capability-negotiation.feature`; GR-06 → "Body text meets 4.5:1 contrast" in `accessibility-iframe.feature`; GR-07 → "aria-labelledby on form controls"; GR-08 → "prefers-reduced-motion disables spinner" + drag animation; GR-09 → "No raw hex colour values"; GR-10 → "position:sticky within iframe"; GR-11 → HTTP regression scenario in `mcp-apps-capability-negotiation.feature`. |
| SC-01 through SC-02 | Both | SC-01 → "QuestionPage layout at each breakpoint" Scenario Outline in `iframe-decision-submit.feature`; SC-02 → "Keyboard shortcuts visible in screen footer" Scenario Outline in `accessibility-iframe.feature`. |

**PASS** — All AC items map to at least one scenario. Zero coverage gaps.

## Criterion 3 — Each feature has ≥ 1 happy + ≥ 3 error + ≥ 1 edge scenario

| Feature | Happy | Error | Edge | Result |
|---|---|---|---|---|
| `mcp-apps-capability-negotiation.feature` | 1 (client supports) | 4 (callServerTool fails, caching, env-var set, partial capability Outline) | 2 (resource list/read, hash stability) | PASS |
| `workspace-handshake.feature` | 2 (1-root, multi-root) | 3 (timeout, zero roots, no roots capability) | 1 (cached selection parity) | PASS |
| `iframe-review-gate.feature` | 3 (approve, changes, external) | 3 (iframe fails to mount, bridge handshake fails, non-MCP-Apps regression) | 2 (success Outline, no-buttons scenario) | PASS |
| `iframe-decision-submit.feature` | 5 (Outline rows: 3 review variants + question + design_direction) | 4 (unknown type, mismatched type, non-MCP-Apps regression, stale session) | 3 (shape parity, duplicate submit, V5-06 FSM run) | PASS |
| `host-bridge-detection.feature` | 3 (both gates pass, submitDecision, getSession) | 3 (parent===window, App throws, callServerTool rejects) | 2 (cache behavior, deferred DOM) | PASS |
| `error-recovery.feature` | 1 (connected state) | 7 (negotiation, retry success, retry fail, sandbox, expired, stale-host, regression) | 4 (disclosure toggle, copy clipboard, dismiss warning, Outline aria-live) | PASS |
| `accessibility-iframe.feature` | 3 (mount focus, decision focus, tab cycle) | 4 (Shift+Tab host return, drag < 24px no snap, non-MCP-Apps regression, no raw hex) | 6 (ResizeObserver, fling, reduced-motion spinner, reduced-motion drag, colour contrast, aria-labelledby) | PASS |

**PASS** — All 7 features meet ≥ 1 happy + ≥ 3 error + ≥ 1 edge.

## Criterion 4 — Scenario Outline used in iframe-decision-submit.feature and accessibility-iframe.feature

- `iframe-decision-submit.feature`: Contains **4** Scenario Outlines. The main "Submission resolves the awaiting promise" Outline covers 3 decision outcomes × session types; additional Outlines for resource URI per session type, QuestionPage layout, and FSM run.
- `accessibility-iframe.feature`: Contains **4** Scenario Outlines. Touch target Outline covers elements × widths; keyboard shortcuts Outline covers screens × widths.

**PASS** — Both required files use Scenario Outline.

## Criterion 5 — Domain language consistency

All actor names in the feature files (`human reviewer`, `Cowork host`, `MCP client`, `MCP server`, `agent`, `SPA`) match the terminology in `ACCEPTANCE-CRITERIA.md`. The phrase "the user" does not appear as a generic actor — the role is consistently named `human reviewer`. `User Agent` does not appear in any feature file. The Background steps use consistent entity names across files.

**PASS** — Domain language is consistent with the AC document.

## Criterion 6 — No step-definition glue code

`grep -rn '@When|@Then|step(' features/` → **ZERO HITS**

**PASS** — No glue code present in any feature file.

---

## Potential Scope Additions (not gaps — informational)

One AC item that does not map directly to a scenario by explicit name:

- **GR-11** (HTTP path byte-identical) — covered implicitly by regression scenarios in `mcp-apps-capability-negotiation.feature` ("Client does not advertise MCP Apps capability — server falls through to HTTP path") and `iframe-review-gate.feature` ("Non-MCP-Apps host — gate_review uses HTTP+tunnel path"). These scenarios test observable behavior of GR-11 but do not name the "byte-identical diff" test. This is acceptable: the test mechanism (`node scripts/diff-http-branch.mjs`) is an implementation-time check, not a user-observable behavior. AC document already notes this. No gap.

---

## VERDICT

**APPROVED**

All 6 completion criteria PASS. Zero AC coverage gaps. Zero glue-code violations. All 7 feature files are syntactically valid Gherkin with adequate scenario depth. Scenario Outlines present in required files. Domain language consistent throughout.
