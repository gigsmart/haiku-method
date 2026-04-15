---
artifact: coverage-mapping
stage: product
phase: elaborate
intent: cowork-mcp-apps-integration
status: scaffold
---

# Coverage Mapping — cowork-mcp-apps-integration

Traces every numbered completion criterion from inception and design stages to
an acceptance-criteria entry and a behavioral spec scenario. Produced as a
scaffold during the product elaborate phase; validator hat must re-evaluate
after `ACCEPTANCE-CRITERIA.md` and `features/*.feature` are finalized.

## Coverage Matrix

| Source unit | Criterion # | Criterion summary | AC reference | Spec reference | Status |
|---|---|---|---|---|---|
| inception/unit-01 | 1 | `experimental.apps` advertised in server capabilities block | TBD: ACCEPTANCE-CRITERIA.md §… | TBD: features/<file>.feature — … | pending |
| inception/unit-01 | 2 | `hostSupportsMcpApps()` and `getMcpHostWorkspacePaths()` exported from state-tools | TBD: ACCEPTANCE-CRITERIA.md §… | TBD: features/<file>.feature — … | pending |
| inception/unit-01 | 3 | Negotiation integration test: stub client with/without `apps` capability returns correct boolean | TBD: ACCEPTANCE-CRITERIA.md §… | TBD: features/<file>.feature — … | pending |
| inception/unit-01 | 4 | Caching is idempotent: `getClientCapabilities()` invoked at most once per connection | TBD: ACCEPTANCE-CRITERIA.md §… | TBD: features/<file>.feature — … | pending |
| inception/unit-01 | 5 | Handshake fires only when `hostSupportsMcpApps() && roots.length === 0` | TBD: ACCEPTANCE-CRITERIA.md §… | TBD: features/<file>.feature — … | pending |
| inception/unit-01 | 6 | Handshake precedes first `.haiku/` write | TBD: ACCEPTANCE-CRITERIA.md §… | TBD: features/<file>.feature — … | pending |
| inception/unit-01 | 7 | Existing `state-tools.test.ts` suite passes without modification | TBD: ACCEPTANCE-CRITERIA.md §… | TBD: features/<file>.feature — … | pending |
| inception/unit-01 | 8 | No `CLAUDE_CODE_IS_COWORK` in state-tools or hooks | TBD: ACCEPTANCE-CRITERIA.md §… | TBD: features/<file>.feature — … | pending |
| inception/unit-01 | 9 | `VALIDATION.md` has "MCP Apps capability negotiation" section | TBD: ACCEPTANCE-CRITERIA.md §… | TBD: features/<file>.feature — … | pending |
| inception/unit-01 | 10 | No transport/UI files touched except capabilities block in server.ts | TBD: ACCEPTANCE-CRITERIA.md §… | TBD: features/<file>.feature — … | pending |
| inception/unit-02 | 1 | `knowledge/COWORK-TIMEOUT-SPIKE.md` exists with a `max observed:` measurement | TBD: ACCEPTANCE-CRITERIA.md §… | TBD: features/<file>.feature — … | pending |
| inception/unit-02 | 2 | Document names `blocking` or `resumable` decision | TBD: ACCEPTANCE-CRITERIA.md §… | TBD: features/<file>.feature — … | pending |
| inception/unit-02 | 3 | unit-05 commit message carries `unit-02-outcome: blocking\|resumable` | TBD: ACCEPTANCE-CRITERIA.md §… | TBD: features/<file>.feature — … | pending |
| inception/unit-02 | 4 | Probe tool absent from production tool list or guarded by `HAIKU_COWORK_DEBUG=1` | TBD: ACCEPTANCE-CRITERIA.md §… | TBD: features/<file>.feature — … | pending |
| inception/unit-02 | 5 | If `resumable`, followup note added to `knowledge/DISCOVERY.md` | TBD: ACCEPTANCE-CRITERIA.md §… | TBD: features/<file>.feature — … | pending |
| inception/unit-03 | 1 | `resources: {}` capability advertised in server.ts capabilities block | TBD: ACCEPTANCE-CRITERIA.md §… | TBD: features/<file>.feature — … | pending |
| inception/unit-03 | 2 | `ListResourcesRequestSchema` and `ReadResourceRequestSchema` handlers registered | TBD: ACCEPTANCE-CRITERIA.md §… | TBD: features/<file>.feature — … | pending |
| inception/unit-03 | 3 | `ui://haiku/review` URI referenced in server.ts and a test file | TBD: ACCEPTANCE-CRITERIA.md §… | TBD: features/<file>.feature — … | pending |
| inception/unit-03 | 4 | `resources/list` returns correct URI pattern and `text/html` mimeType | TBD: ACCEPTANCE-CRITERIA.md §… | TBD: features/<file>.feature — … | pending |
| inception/unit-03 | 5 | `resources/read` returns byte-exact HTML content | TBD: ACCEPTANCE-CRITERIA.md §… | TBD: features/<file>.feature — … | pending |
| inception/unit-03 | 6 | `REVIEW_APP_VERSION` hash is stable across rebuilds without source change, bumps on edit | TBD: ACCEPTANCE-CRITERIA.md §… | TBD: features/<file>.feature — … | pending |
| inception/unit-03 | 7 | `buildUiResourceMeta()` exists in `ui-resource.ts` and is pure | TBD: ACCEPTANCE-CRITERIA.md §… | TBD: features/<file>.feature — … | pending |
| inception/unit-03 | 8 | `http.ts` is untouched; `serveSpa` integration tests still pass | TBD: ACCEPTANCE-CRITERIA.md §… | TBD: features/<file>.feature — … | pending |
| inception/unit-03 | 9 | Unrelated tool result has no `_meta` leakage | TBD: ACCEPTANCE-CRITERIA.md §… | TBD: features/<file>.feature — … | pending |
| inception/unit-04 | 1 | `host-bridge.ts` is the only importer of `fetch`/`WebSocket` in session-transport path | TBD: ACCEPTANCE-CRITERIA.md §… | TBD: features/<file>.feature — … | pending |
| inception/unit-04 | 2 | `useSession.ts` imports `host-bridge.ts` and contains no direct `fetch`/`WebSocket` | TBD: ACCEPTANCE-CRITERIA.md §… | TBD: features/<file>.feature — … | pending |
| inception/unit-04 | 3 | `@modelcontextprotocol/ext-apps` in `review-app/package.json` dependencies | TBD: ACCEPTANCE-CRITERIA.md §… | TBD: features/<file>.feature — … | pending |
| inception/unit-04 | 4 | Vitest: `isMcpAppsHost()` true when `window.parent !== window` + App constructor succeeds | TBD: ACCEPTANCE-CRITERIA.md §… | TBD: features/<file>.feature — … | pending |
| inception/unit-04 | 5 | Vitest: `isMcpAppsHost()` false when `window.parent === window` routes through WebSocket/HTTP | TBD: ACCEPTANCE-CRITERIA.md §… | TBD: features/<file>.feature — … | pending |
| inception/unit-04 | 6 | Build still emits single inlined `REVIEW_APP_HTML` with no external asset refs | TBD: ACCEPTANCE-CRITERIA.md §… | TBD: features/<file>.feature — … | pending |
| inception/unit-04 | 7 | Bundle budget: gzipped HTML grows by no more than 50 KB | TBD: ACCEPTANCE-CRITERIA.md §… | TBD: features/<file>.feature — … | pending |
| inception/unit-04 | 8 | Full review-app test suite green | TBD: ACCEPTANCE-CRITERIA.md §… | TBD: features/<file>.feature — … | pending |
| inception/unit-05 | 1 | Non-MCP-Apps HTTP branch is byte-identical to pre-intent snapshot | TBD: ACCEPTANCE-CRITERIA.md §… | TBD: features/<file>.feature — … | pending |
| inception/unit-05 | 2 | MCP Apps branch: `startHttpServer`, `openTunnel`, `openBrowser` each called 0 times | TBD: ACCEPTANCE-CRITERIA.md §… | TBD: features/<file>.feature — … | pending |
| inception/unit-05 | 3 | Entry tool result carries `_meta.ui.resourceUri = "ui://haiku/review/<version>"` | TBD: ACCEPTANCE-CRITERIA.md §… | TBD: features/<file>.feature — … | pending |
| inception/unit-05 | 4 | `haiku_cowork_review_submit` registered as exactly 1 array entry + 1 dispatch case | TBD: ACCEPTANCE-CRITERIA.md §… | TBD: features/<file>.feature — … | pending |
| inception/unit-05 | 5 | Decision shape parity: MCP Apps result equals HTTP path result for all 3 decisions | TBD: ACCEPTANCE-CRITERIA.md §… | TBD: features/<file>.feature — … | pending |
| inception/unit-05 | 6 | Orchestrator `gate_review` branches unchanged; `fsmAdvancePhase` spy confirms | TBD: ACCEPTANCE-CRITERIA.md §… | TBD: features/<file>.feature — … | pending |
| inception/unit-05 | 7 | Commit message contains `unit-02-outcome: blocking\|resumable` | TBD: ACCEPTANCE-CRITERIA.md §… | TBD: features/<file>.feature — … | pending |
| inception/unit-05 | 8 | No `isCoworkHost`/`CLAUDE_CODE_IS_COWORK` in server.ts changes | TBD: ACCEPTANCE-CRITERIA.md §… | TBD: features/<file>.feature — … | pending |
| inception/unit-05 | 9 | `VALIDATION.md` documents both transports ("MCP Apps review transport") | TBD: ACCEPTANCE-CRITERIA.md §… | TBD: features/<file>.feature — … | pending |
| inception/unit-06 | 1 | `startHttpServer` calls inside MCP Apps branch of both handlers = 0 | TBD: ACCEPTANCE-CRITERIA.md §… | TBD: features/<file>.feature — … | pending |
| inception/unit-06 | 2 | `server-visual-question-cowork.test.ts` passes with spies asserting 0 calls | TBD: ACCEPTANCE-CRITERIA.md §… | TBD: features/<file>.feature — … | pending |
| inception/unit-06 | 3 | `server-design-direction-cowork.test.ts` passes + `design_direction_selected` written | TBD: ACCEPTANCE-CRITERIA.md §… | TBD: features/<file>.feature — … | pending |
| inception/unit-06 | 4 | Both MCP Apps handlers: `result._meta.ui.resourceUri === "ui://haiku/review/{version}"` | TBD: ACCEPTANCE-CRITERIA.md §… | TBD: features/<file>.feature — … | pending |
| inception/unit-06 | 5 | Non-MCP-Apps snapshot equality: returned text payload matches golden from `main` | TBD: ACCEPTANCE-CRITERIA.md §… | TBD: features/<file>.feature — … | pending |
| inception/unit-06 | 6 | `haiku_cowork_review_submit` zod schema has exactly 3 `session_type` literals | TBD: ACCEPTANCE-CRITERIA.md §… | TBD: features/<file>.feature — … | pending |
| inception/unit-06 | 7 | E2E stub test: review gate + visual question + design direction each carry `_meta.ui.resourceUri` | TBD: ACCEPTANCE-CRITERIA.md §… | TBD: features/<file>.feature — … | pending |
| inception/unit-06 | 8 | No `isCoworkHost`/`CLAUDE_CODE_IS_COWORK` in unit-06 changes | TBD: ACCEPTANCE-CRITERIA.md §… | TBD: features/<file>.feature — … | pending |
| inception/unit-07 | 1 | `rg 'get_review_status'` (excluding CHANGELOG and unit-07 spec) returns zero hits | TBD: ACCEPTANCE-CRITERIA.md §… | TBD: features/<file>.feature — … | pending |
| inception/unit-07 | 2 | All 11 `.haiku/intents/` files and 8 `.ai-dlc/` files in inventory are touched | TBD: ACCEPTANCE-CRITERIA.md §… | TBD: features/<file>.feature — … | pending |
| inception/unit-07 | 3 | Replacement text accurately describes current blocking review flow | TBD: ACCEPTANCE-CRITERIA.md §… | TBD: features/<file>.feature — … | pending |
| inception/unit-07 | 4 | `CHANGELOG.md` includes a doc-cleanup entry under the next unreleased section | TBD: ACCEPTANCE-CRITERIA.md §… | TBD: features/<file>.feature — … | pending |
| inception/unit-07 | 5 | No changes under `packages/haiku/src/**`, `website/content/**`, or `VALIDATION.md` | TBD: ACCEPTANCE-CRITERIA.md §… | TBD: features/<file>.feature — … | pending |
| inception/unit-08 | 1 | `COWORK-E2E-PLAN.md` exists in knowledge directory | TBD: ACCEPTANCE-CRITERIA.md §… | TBD: features/<file>.feature — … | pending |
| inception/unit-08 | 2 | Plan references `unit-08-cowork-e2e-validation-research.md` | TBD: ACCEPTANCE-CRITERIA.md §… | TBD: features/<file>.feature — … | pending |
| inception/unit-08 | 3 | Fixture intent created at `.haiku/intents/mcp-apps-e2e-smoke-*/intent.md` | TBD: ACCEPTANCE-CRITERIA.md §… | TBD: features/<file>.feature — … | pending |
| inception/unit-08 | 4 | `intent_reviewed: true` written to fixture intent frontmatter | TBD: ACCEPTANCE-CRITERIA.md §… | TBD: features/<file>.feature — … | pending |
| inception/unit-08 | 5 | `state.json` `phase === "execute"` after FSM advance | TBD: ACCEPTANCE-CRITERIA.md §… | TBD: features/<file>.feature — … | pending |
| inception/unit-08 | 6 | Session log contains `gate_review_opened` and `decision: "approved"` events | TBD: ACCEPTANCE-CRITERIA.md §… | TBD: features/<file>.feature — … | pending |
| inception/unit-08 | 7 | `initialize` capture shows both server and client advertising `experimental.apps` | TBD: ACCEPTANCE-CRITERIA.md §… | TBD: features/<file>.feature — … | pending |
| inception/unit-08 | 8 | Captured tool result JSON contains `_meta.ui.resourceUri` | TBD: ACCEPTANCE-CRITERIA.md §… | TBD: features/<file>.feature — … | pending |
| inception/unit-08 | 9 | Iframe console log shows `isMcpAppsHost.*true` | TBD: ACCEPTANCE-CRITERIA.md §… | TBD: features/<file>.feature — … | pending |
| inception/unit-08 | 10 | Screenshot evidence: ≥ 3 `.png` files (iframe render, decision submit, next FSM tick) | TBD: ACCEPTANCE-CRITERIA.md §… | TBD: features/<file>.feature — … | pending |
| inception/unit-08 | 11 | Regression diff between MCP-Apps and non-MCP-Apps runs empty except expected transport divergences | TBD: ACCEPTANCE-CRITERIA.md §… | TBD: features/<file>.feature — … | pending |
| inception/unit-08 | 12 | Plan does NOT instruct validator to set `CLAUDE_CODE_IS_COWORK` | TBD: ACCEPTANCE-CRITERIA.md §… | TBD: features/<file>.feature — … | pending |
| design/unit-01 | 1 | Six mockup files exist: `iframe-shell-{narrow,medium,wide}-{collapsed,expanded}.html` | TBD: ACCEPTANCE-CRITERIA.md §… | TBD: features/<file>.feature — … | pending |
| design/unit-01 | 2 | All interactive states documented: 5 states × 3 elements = 15 visible variants per breakpoint | TBD: ACCEPTANCE-CRITERIA.md §… | TBD: features/<file>.feature — … | pending |
| design/unit-01 | 3 | Touch targets ≥ 44px on every interactive element at narrow breakpoint | TBD: ACCEPTANCE-CRITERIA.md §… | TBD: features/<file>.feature — … | pending |
| design/unit-01 | 4 | Focus order documented as numbered list; keyboard collapse/expand via arrow keys | TBD: ACCEPTANCE-CRITERIA.md §… | TBD: features/<file>.feature — … | pending |
| design/unit-01 | 5 | No raw hex values — Tailwind classes only | TBD: ACCEPTANCE-CRITERIA.md §… | TBD: features/<file>.feature — … | pending |
| design/unit-01 | 6 | Bottom sheet sticks at iframe bottom via `position: sticky` or fixed-within-iframe | TBD: ACCEPTANCE-CRITERIA.md §… | TBD: features/<file>.feature — … | pending |
| design/unit-01 | 7 | Backdrop dim documented in expanded variants (`opacity-60 pointer-events-auto`) | TBD: ACCEPTANCE-CRITERIA.md §… | TBD: features/<file>.feature — … | pending |
| design/unit-01 | 8 | `prefers-reduced-motion` fallback documented for drag-to-expand | TBD: ACCEPTANCE-CRITERIA.md §… | TBD: features/<file>.feature — … | pending |
| design/unit-01 | 9 | Drag gesture spec: min 24px distance, 0.5px/ms fling, two snap points, no full-pane | TBD: ACCEPTANCE-CRITERIA.md §… | TBD: features/<file>.feature — … | pending |
| design/unit-01 | 10 | Decision panel emphasis matches `emphasis: 3`: teal-500 border, drop shadow, teal Approve button | TBD: ACCEPTANCE-CRITERIA.md §… | TBD: features/<file>.feature — … | pending |
| design/unit-02 | 1 | Boot screen mockup exists showing `loading`/`connecting`/`ready` phases (≥ 3 `phase=` markers) | TBD: ACCEPTANCE-CRITERIA.md §… | TBD: features/<file>.feature — … | pending |
| design/unit-02 | 2 | HostBridgeStatus mockup exists showing `connected`/`reconnecting`/`error` states (≥ 3 `state=` markers) | TBD: ACCEPTANCE-CRITERIA.md §… | TBD: features/<file>.feature — … | pending |
| design/unit-02 | 3 | `aria-live` copy documented for each state transition | TBD: ACCEPTANCE-CRITERIA.md §… | TBD: features/<file>.feature — … | pending |
| design/unit-02 | 4 | Reduced-motion fallback in boot screen mockup | TBD: ACCEPTANCE-CRITERIA.md §… | TBD: features/<file>.feature — … | pending |
| design/unit-02 | 5 | Contrast ratio ≥ 4.5:1 for status pill text against `stone-950` background | TBD: ACCEPTANCE-CRITERIA.md §… | TBD: features/<file>.feature — … | pending |
| design/unit-02 | 6 | Touch target ≥ 44px for error-state retry affordance | TBD: ACCEPTANCE-CRITERIA.md §… | TBD: features/<file>.feature — … | pending |
| design/unit-02 | 7 | No raw hex in boot screen or host-bridge-status mockups | TBD: ACCEPTANCE-CRITERIA.md §… | TBD: features/<file>.feature — … | pending |
| design/unit-03 | 1 | Four error mockup files exist at named paths | TBD: ACCEPTANCE-CRITERIA.md §… | TBD: features/<file>.feature — … | pending |
| design/unit-03 | 2 | Each mockup names a specific error code in the visible card (≥ 4 hits) | TBD: ACCEPTANCE-CRITERIA.md §… | TBD: features/<file>.feature — … | pending |
| design/unit-03 | 3 | Sandbox error has disclosure-open variant (`aria-expanded="true"`) | TBD: ACCEPTANCE-CRITERIA.md §… | TBD: features/<file>.feature — … | pending |
| design/unit-03 | 4 | Negotiation error has retry-pending and retry-failed variants (≥ 3 `variant=` markers) | TBD: ACCEPTANCE-CRITERIA.md §… | TBD: features/<file>.feature — … | pending |
| design/unit-03 | 5 | Touch targets ≥ 44px across all four error files | TBD: ACCEPTANCE-CRITERIA.md §… | TBD: features/<file>.feature — … | pending |
| design/unit-03 | 6 | No placeholder copy (`Lorem ipsum`, `TODO`, etc.) | TBD: ACCEPTANCE-CRITERIA.md §… | TBD: features/<file>.feature — … | pending |
| design/unit-03 | 7 | `aria-live="assertive"` on error message container in all four files | TBD: ACCEPTANCE-CRITERIA.md §… | TBD: features/<file>.feature — … | pending |
| design/unit-03 | 8 | No raw hex in all four error mockups | TBD: ACCEPTANCE-CRITERIA.md §… | TBD: features/<file>.feature — … | pending |
| design/unit-04 | 1 | 15 mockup files exist (5 screens × 3 breakpoints) | TBD: ACCEPTANCE-CRITERIA.md §… | TBD: features/<file>.feature — … | pending |
| design/unit-04 | 2 | DesignPicker stacks vertically at narrow (no flex-row) | TBD: ACCEPTANCE-CRITERIA.md §… | TBD: features/<file>.feature — … | pending |
| design/unit-04 | 3 | AnnotationCanvas has `max-width: 100%` and aspect-ratio preserved at all breakpoints | TBD: ACCEPTANCE-CRITERIA.md §… | TBD: features/<file>.feature — … | pending |
| design/unit-04 | 4 | Keyboard shortcuts documented in each screen's footer (≥ 5 `kbd` elements at narrow) | TBD: ACCEPTANCE-CRITERIA.md §… | TBD: features/<file>.feature — … | pending |
| design/unit-04 | 5 | Touch targets ≥ 44px across all 15 mockups (≥ 30 `min-height` instances) | TBD: ACCEPTANCE-CRITERIA.md §… | TBD: features/<file>.feature — … | pending |
| design/unit-04 | 6 | No raw hex across all 15 files | TBD: ACCEPTANCE-CRITERIA.md §… | TBD: features/<file>.feature — … | pending |
| design/unit-04 | 7 | `aria-labelledby` on form regions in QuestionPage and DesignPicker | TBD: ACCEPTANCE-CRITERIA.md §… | TBD: features/<file>.feature — … | pending |
| design/unit-04 | 8 | External-review URL is copy-to-clipboard input, not a clickable link, in intent-review mockups | TBD: ACCEPTANCE-CRITERIA.md §… | TBD: features/<file>.feature — … | pending |
| design/unit-05 | 1 | Three success-state mockups exist at `success-{approved,changes-requested,external-review}.html` | TBD: ACCEPTANCE-CRITERIA.md §… | TBD: features/<file>.feature — … | pending |
| design/unit-05 | 2 | No `<button>` elements in any success state | TBD: ACCEPTANCE-CRITERIA.md §… | TBD: features/<file>.feature — … | pending |
| design/unit-05 | 3 | No `window.close`, `history.back`, or `close()` references in success mockups | TBD: ACCEPTANCE-CRITERIA.md §… | TBD: features/<file>.feature — … | pending |
| design/unit-05 | 4 | `aria-live="polite"` on success heading in all three files | TBD: ACCEPTANCE-CRITERIA.md §… | TBD: features/<file>.feature — … | pending |
| design/unit-05 | 5 | Focus moves to heading documented in each mockup ("Focus management:" comment) | TBD: ACCEPTANCE-CRITERIA.md §… | TBD: features/<file>.feature — … | pending |
| design/unit-05 | 6 | Reduced-motion fallback documented for fade-in animation | TBD: ACCEPTANCE-CRITERIA.md §… | TBD: features/<file>.feature — … | pending |
| design/unit-05 | 7 | External-review URL is copy-to-clipboard input, not `target="_blank"` anchor | TBD: ACCEPTANCE-CRITERIA.md §… | TBD: features/<file>.feature — … | pending |
| design/unit-05 | 8 | No raw hex in all three success mockups | TBD: ACCEPTANCE-CRITERIA.md §… | TBD: features/<file>.feature — … | pending |

## Gaps Found

_Validator hat populates this section during execute phase if any criterion
above has no corresponding AC entry or spec scenario after
`ACCEPTANCE-CRITERIA.md` and the `features/*.feature` files are finalized._

## Scope Creep

_Validator hat populates this section if any AC entry or spec scenario does
not trace back to a numbered criterion in the matrix above._

## Validation Decision

```
status: PENDING_VALIDATION
note: Scaffold produced during product elaborate phase. Validator hat must
re-evaluate during execute phase after ACCEPTANCE-CRITERIA.md and the
features/*.feature files are finalized.
```
