---
name: acceptance-criteria
stage: product
intent: cowork-mcp-apps-integration
scope: intent
---

# Acceptance Criteria — MCP Apps Review Experience

Sources consulted: `knowledge/DISCOVERY.md`, `stages/design/DESIGN-BRIEF.md`,
`knowledge/DESIGN-TOKENS.md`, `stages/inception/artifacts/INDEX.md`, all eight
inception unit specs (`unit-01` through `unit-08`), and all five design unit specs
(`unit-01` through `unit-05`).

---

## User Stories

_Sources: `stages/design/DESIGN-BRIEF.md`, inception `unit-05`, inception `unit-06`, design `unit-04`._

### Intent review

As the human reviewer, I want to see the intent overview, units list, criteria, and
decision panel rendered inline in the host conversation surface, so that I can approve
or request changes without leaving the host application or opening a browser tab.

As the agent driving `haiku_run_next`, I want the gate to block until the human
reviewer submits a decision via `haiku_cowork_review_submit`, so that the FSM only
advances to execute after a deliberate human action.

### Unit review

As the human reviewer, I want to see the unit spec, acceptance criteria, and decision
panel in a single scrollable iframe, so that I can evaluate one unit at a time without
context-switching to a separate tool.

### Question session

As the human reviewer, I want to answer a structured visual question (multiple-choice
or multi-select, with optional context markdown and image attachments) inside the iframe,
so that elaboration-phase decisions are captured without polling or browser windows.

As the agent driving `haiku_run_next`, I want `ask_user_visual_question` to deliver
the question via the MCP Apps iframe path when the host supports it, so that the
question resolves via the same `haiku_cowork_review_submit` channel as review gates.

### Design direction

As the agent driving `haiku_run_next`, I want `pick_design_direction` to present
archetype cards and parameter sliders inside the iframe, so that the stage-state
write for `design_direction_selected` fires on the MCP Apps branch with the same
JSON shape as the HTTP path.

As the human reviewer, I want to select a design direction using the archetype cards
and confirm via the bottom sheet, so that my selection is recorded in stage state
without requiring clipboard access or a separate browser tab.

### Annotation canvas

As the human reviewer, I want to pin annotations on a screenshot inside the iframe
canvas, so that feedback is spatially tied to specific areas of the design without
requiring file downloads or external tools.

### Error and success states

As the human reviewer, I want a clear, actionable error screen when the host-bridge
handshake fails, so that I know whether to retry or escalate without needing to
interpret raw error messages.

As the human reviewer, I want a persistent success state after submitting a decision,
so that I can confirm my action was received before the Cowork host unmounts the iframe.

As the Cowork host, I want the iframe to wait passively after a decision is submitted
and never call `window.close` or navigate, so that the host controls iframe dismissal
based on the resolved tool call.

---

## Variability Brief

_Sources: inception `unit-01` (capability negotiation), `stages/design/DESIGN-BRIEF.md`
(breakpoints, connection states), inception `unit-06` (session types), inception
`unit-05` (decision outcomes)._

The system's behavior varies across six independent axes. Each axis generates its own
variant-specific acceptance criteria in the section below.

### Axis 1 — MCP host capability: `experimental.apps` advertised vs. not

The server advertises `experimental.apps` in its `initialize` capabilities block.
The host echoes it back (or not) during the `initialize` handshake. The
`hostSupportsMcpApps()` accessor caches the result for the life of the connection.
When the host does not echo the capability back, the HTTP+tunnel+browser path runs
unchanged — this is the regression axis, not a degraded mode.

### Axis 2 — Workspace state: roots with N folders vs. zero folders

When `hostSupportsMcpApps()` is true, the server checks the `roots` capability.
`roots.length > 1` triggers an `elicitInput` pick. `roots.length === 1` auto-selects.
`roots.length === 0` triggers `requestHostWorkspace()` before any `.haiku/` write.
Downstream behavior (review flow) is identical once a root is resolved.

### Axis 3 — Iframe breakpoint: narrow / medium / wide

The iframe renders at one of three width bands (per design `unit-04`):
- Narrow: ≤ 480px — single column, everything stacked, non-essential metadata hidden.
- Medium: 481–768px — same column, more horizontal padding, short metadata tags visible.
- Wide: ≥ 769px — full layout without fixed sidebar; topbar pattern stays.

Breakpoints are detected via `ResizeObserver` on the iframe root, not CSS media queries.

### Axis 4 — Decision outcome: `approved` / `changes_requested` / `external_review`

`haiku_cowork_review_submit` accepts a `session_type: "review"` discriminant and one
of three decision values. Each resolves the blocking promise in `_openReviewAndWait`
and maps to the corresponding `gate_review` arm in `orchestrator.ts` at `:3016–3032`.

### Axis 5 — Session type: `review` / `question` / `design_direction`

`haiku_cowork_review_submit` uses a `z.discriminatedUnion` on `session_type`. Each
variant carries a per-shape `data` payload. All three session types use the same
`ui://haiku/review/{version}` resource and the same host bridge.

### Axis 6 — Connection state

`<HostBridgeStatus>` reflects one of six connection states:
- `connected` — bridge handshake complete, live session.
- `reconnecting` — bridge dropped, auto-retry in progress.
- `error` — retries exhausted; manual retry available.
- `negotiation-failed` — host advertised `experimental.apps` but `App.callServerTool`
  failed at runtime or the handshake timed out.
- `sandbox-restricted` — the iframe sandbox blocked a required feature.
- `session-expired` — the JWT-derived session is stale.
- `stale-host` — host protocol version is older than the SPA expects (soft warning).

---

## General Rules

_Apply to every variant. Sources: `stages/design/DESIGN-BRIEF.md`,
`knowledge/DESIGN-TOKENS.md`, design `unit-01`, design `unit-05`._

**GR-01 (P0)** Every interactive element rendered inside the iframe has a minimum touch
target of 44px in both dimensions (mapping to `--iframe-min-touch`). This includes the
drag handle (4px visual bar, 44px hit zone), decision buttons, status pill retry
affordance, and error-screen primary actions.
Test: `grep -c "min-height" stages/design/artifacts/*.html` ≥ 30.

**GR-02 (P0)** The first interactive element receives focus automatically when the iframe
mounts. `Tab` cycles within the iframe. `Shift+Tab` from the first element returns
focus to the host (browser default — no manual trap). After a decision is submitted,
focus moves to the success-state heading.
Test: Vitest: assert `document.activeElement` is the first interactive element on mount
and equals the success heading after `haiku_cowork_review_submit` resolves.

**GR-03 (P0)** The SPA never calls `window.close`, `window.history.back`, or any unmount
API. Post-decision, the iframe waits for the host to unmount. No `tryCloseTab`
invocation on the MCP Apps path.
Test: `! grep -rn "window.close\|history.back\|tryCloseTab" packages/haiku/review-app/src/`
returns zero hits in the MCP Apps branch.

**GR-04 (P0)** No `target="_blank"` on any anchor rendered inside the iframe. External-review
URLs render as copy-to-clipboard inputs with a short "open in your tools" instruction
line — never as clickable links (sandbox `allow-popups` not assumed).
Test: `! grep 'target="_blank"' stages/design/artifacts/*.html` returns zero hits.

**GR-05 (P0)** No environment variable (`CLAUDE_CODE_IS_COWORK`, `isCoworkHost`, or any
variant) is read to determine whether to use the MCP Apps path. Detection is via
`hostSupportsMcpApps()` (capability negotiation only).
Test: `rg -n 'CLAUDE_CODE_IS_COWORK|isCoworkHost' packages/haiku/src/server.ts packages/haiku/src/state-tools.ts packages/haiku/src/hooks/`
returns zero hits in MCP Apps branch changes.

**GR-06 (P0)** Body text meets 4.5:1 contrast against `--iframe-bg` (`stone-950`). Large
text and UI components (status pills, decision buttons, icons) meet 3:1. `<HostBridgeStatus>`
state colors (`teal-500`, `amber-400`, `red-500`) meet 4.5:1 against `stone-950`.
Test: Axe-core check on rendered SPA asserts zero color-contrast violations.

**GR-07 (P0)** Every form control has a programmatic label. Decision buttons are wrapped in
a `<form>` with `aria-labelledby` pointing at a hidden heading. Form regions in
`QuestionPage` and `DesignPicker` carry `aria-labelledby`.
Test: `grep -c "aria-labelledby" stages/design/artifacts/question-*.html stages/design/artifacts/design-picker-*.html`
returns ≥ 6.

**GR-08 (P0)** The loading spinner respects `prefers-reduced-motion`: when the preference
is set, the spinner is replaced with a static "Loading…" label and all transition
animations are removed (snap behavior replaces animated drag).
Test: `grep -q "prefers-reduced-motion" stages/design/artifacts/boot-screen.html`; Vitest:
mock `prefers-reduced-motion: reduce` and assert spinner replaced by static label.

**GR-09 (P0)** No raw hex values in component styles — all colors come from existing
Tailwind palette entries via named classes or the iframe-specific CSS custom properties
defined in `knowledge/DESIGN-TOKENS.md`.
Test: `rg -n '#[0-9a-fA-F]{3,6}' stages/design/artifacts/*.html` returns zero hits in
style attributes.

**GR-10 (P0)** The iframe never applies `position: fixed` in a way that traps the host
scroll. The entire iframe scrolls as a single document. The bottom sheet uses
`position: sticky` (or equivalent within the iframe scroll container) — it sticks
within the iframe, not the host viewport.
Test: Integration test asserts bottom sheet sticks within a 600px iframe without
affecting the host `window.scrollY`.

**GR-11 (P0)** The non-MCP-Apps HTTP path is byte-identical to its pre-intent state. No
edit to the else-arm of any `hostSupportsMcpApps()` branch changes existing HTTP+tunnel
behavior.
Test: `node scripts/diff-http-branch.mjs` exits 0; existing non-Cowork integration
tests pass without modification.

---

## Variant-Specific Acceptance Criteria

### V1 — MCP Host Capability

_Sources: inception `unit-01`, inception `unit-03`, inception `unit-08`._

**V1-01 (P0)** When the MCP host echoes `experimental.apps` in the `initialize`
response, `hostSupportsMcpApps()` returns `true`. When the host does not echo it,
`hostSupportsMcpApps()` returns `false`. The accessor is evaluated at most once per
connection (cached on first read).
Test: Integration test: stub client with `apps` → `true`; without → `false`; spy on
`getClientCapabilities()` asserts ≤ 1 call across ten invocations.

**V1-02 (P0)** When `hostSupportsMcpApps()` is `true`, the tool result for the gate
action carries `_meta.ui.resourceUri = "ui://haiku/review/" + REVIEW_APP_VERSION`.
When `hostSupportsMcpApps()` is `false`, the tool result has no `_meta` field.
Test: `rg "_meta\\.ui\\.resourceUri" packages/haiku/src/server.ts` returns ≥ 1 hit in
the MCP Apps branch; snapshot on `haiku_version_info` confirms `_meta` is `undefined`.

**V1-03 (P0)** When `hostSupportsMcpApps()` is `true`, `startHttpServer`,
`openTunnel`, and `openBrowser` are never called during the review gate flow, the
visual question flow, or the design direction flow.
Test: `vi.spyOn` on each; assert `callCount === 0` for all three flows.

**V1-04 (P0)** When `hostSupportsMcpApps()` is `false`, the HTTP+tunnel+browser path
runs and the final `intent.md` frontmatter state (`intent_reviewed: true`) and
`state.json` (`phase: "execute"`) are bit-identical to the pre-intent behavior.
Test: Non-MCP-Apps integration suite passes; `git diff HEAD~1 --` shows no change to
the else-arm of any branched handler.

**V1-05 (P1)** The feature works on any MCP host that advertises `experimental.apps`
— not only Cowork. No Cowork-specific env var or hostname check is present anywhere
in the detection path.
Test: `rg -rn "CLAUDE_CODE_IS_COWORK|isCoworkHost|cowork" packages/haiku/src/server.ts`
returns zero hits in detection/branching path; validated against non-Cowork stub.

**V1-06 (P0)** The `ui://haiku/review/{version}` resource is registered via
`ListResourcesRequestSchema` and `ReadResourceRequestSchema` handlers. `resources/list`
returns exactly one resource with URI matching `/^ui:\/\/haiku\/review\/[0-9a-f]{12}$/`
and `mimeType: "text/html"`. `resources/read` returns content byte-identical to
`REVIEW_APP_HTML`.
Test: JSON-RPC integration test against a booted in-process server; assert URI pattern,
mimeType, and content length.

**V1-07 (P0)** The `REVIEW_APP_VERSION` hash is stable across two consecutive
`npm run prebuild` runs with no source change, and changes when any byte in
`packages/review-app/src/` is modified.
Test: `diff` of two consecutive prebuild outputs is empty; modify source file, rebuild,
assert hash differs.

### V2 — Workspace State

_Sources: inception `unit-01`._

**V2-01 (P0)** When `hostSupportsMcpApps()` is `true` and the `roots` capability
surfaces zero workspace folders, `requestHostWorkspace()` is called before any
`.haiku/` write. The call fires exactly once per session.
Test: Spy asserts handshake call index < first `.haiku/` write call index and
`callCount === 1` per session.

**V2-02 (P0)** When `roots.length === 1`, the workspace is auto-selected and
`requestHostWorkspace()` is not called.
Test: Integration test: `roots = [{uri: "file:///workspace"}]`; assert
`requestHostWorkspace` `callCount === 0`.

**V2-03 (P1)** When `roots.length > 1`, an `elicitInput` pick is presented and the
user's selection is cached for the session. Subsequent `.haiku/` writes use the
selected root.
Test: `roots = [{uri: "file:///a"}, {uri: "file:///b"}]`; assert `elicitInput` called
once and selected path used for all `.haiku/` writes.

**V2-04 (P0)** The workspace handshake does not modify the behavior of any
downstream review flow. The gate opens with identical session data regardless of
which root was selected.
Test: Compare gate session data between `roots.length === 0` and `roots.length === 1`
runs; assert equal.

### V3 — Iframe Breakpoint

_Sources: design `unit-01`, design `unit-04`, `knowledge/DESIGN-TOKENS.md`._

**V3-01 (P0)** At narrow breakpoint (≤ 480px), all interactive elements are stacked
in a single column, the bottom sheet is pinned to the bottom of the iframe, and
non-essential metadata is hidden. No horizontal overflow.
Test: Inspect `iframe-shell-narrow-collapsed.html`; no `flex-row` on main content.
Vitest: mock `ResizeObserver` at 400px; assert layout class is `narrow`.

**V3-02 (P0)** At all three breakpoints, the breakpoint is determined by a
`ResizeObserver` on the iframe root element — not by `window.innerWidth` or CSS
media queries.
Test: `! grep -n "window.innerWidth\|@media" packages/haiku/review-app/src/` returns
zero hits in the breakpoint-detection path.

**V3-03 (P0)** The bottom sheet is visible and accessible at all three breakpoints.
At narrow, the collapsed sheet shows at minimum the Approve and Changes buttons plus
the drag handle within the 44px touch target floor.
Test: `iframe-shell-narrow-collapsed.html` has `min-height: 44px` on drag handle;
Vitest asserts sheet is in DOM at all three breakpoints.

**V3-04 (P1)** At wide breakpoint (≥ 769px), the layout approximates the browser-tab
appearance (fuller metadata visibility) while retaining the topbar-not-sidebar pattern.
Test: `iframe-shell-wide-collapsed.html` has topbar and no left-sidebar element.

**V3-05 (P1)** The `DesignPicker` archetype cards stack vertically at narrow, and the
parameter sliders appear below the preview. At wide, cards may appear side-by-side.
Test: `design-picker-narrow.html` has no `flex-row` on the archetype list;
`design-picker-wide.html` has side-by-side layout.

**V3-06 (P1)** The `AnnotationCanvas` resizes to fit the iframe width at every
breakpoint with aspect ratio preserved. Pinned annotations scale proportionally.
Test: `annotation-canvas-narrow.html` has `max-width: 100%` and preserved aspect ratio;
Vitest asserts annotation positions scale correctly on resize.

**V3-07 (P0)** The bottom-sheet drag gesture has minimum drag distance 24px and fling
velocity threshold 0.5px/ms. The sheet snaps between `collapsed` and `half-pane` only
— no `full-pane` snap. When `prefers-reduced-motion` is set, drag snaps instantly.
Test: Vitest: < 24px drag → no snap; > 0.5px/ms fling → snap; reduced-motion → no
CSS transition fires.

**V3-08 (P0)** The decision panel emphasis level 3 is applied: top border `teal-500`,
drop shadow `0 -8px 24px rgba(0,0,0,0.4)` above the sheet, Approve button background
`teal-500`.
Test: `iframe-shell-narrow-collapsed.html` has `border-t` teal and shadow CSS; Vitest
asserts Approve button has `bg-teal-500`.

### V4 — Decision Outcome

_Sources: inception `unit-05`, design `unit-05`._

**V4-01 (P0)** When the human reviewer submits `approved`, the `haiku_cowork_review_submit`
handler resolves with `{ decision: "approved", feedback: "", annotations: undefined }`
(or the user's feedback/annotations), `gate_review` at `orchestrator.ts:3016` writes
`intent_reviewed: true` to `intent.md`, and `fsmAdvancePhase` is called.
Test: Submit `approved`; spy on `fsmAdvancePhase` asserts one call; assert
`intent.md` frontmatter contains `intent_reviewed: true`.

**V4-02 (P0)** When the human reviewer submits `changes_requested`, the handler
resolves with the feedback field populated, and the orchestrator processes the
`changes_requested` branch without advancing the phase.
Test: Submit `changes_requested`; spy on `fsmAdvancePhase` asserts zero calls; assert
resolved `feedback` matches submitted text.

**V4-03 (P0)** When the human reviewer submits `external_review`, the handler resolves
with the external-review escalation data, `fsmAdvancePhase` is called at
`orchestrator.ts:3032`, and the external-review URL is never a clickable link inside
the iframe.
Test: Submit `external_review`; assert `fsmAdvancePhase` called once; assert SPA DOM
has no `<a>` for the URL — only a copy-to-clipboard input.

**V4-04 (P0)** The resolved object shape for all three outcomes on the MCP Apps path
is equal to the resolved object shape on the HTTP path (snapshot parity per inception
`unit-05` completion criteria).
Test: `expect(mcpAppsResult).toEqual(httpResult)` for `approved`, `changes_requested`,
and `external_review` against golden snapshots from `main`.

**V4-05 (P0)** After any decision is submitted, the SPA transitions to the appropriate
success state (green for approved, amber for changes requested, indigo for external
review), focus moves to the success heading, and an `aria-live="polite"` announcement
fires.
Test: `grep -c 'aria-live="polite"' stages/design/artifacts/success-*.html` returns ≥ 3;
Vitest: assert `document.activeElement` is the success heading after submit.

**V4-06 (P0)** The three success states contain no buttons. The SPA does not call
`window.close`, `window.history.back`, or any navigation API after a decision is
submitted.
Test: `! grep -E '<button' stages/design/artifacts/success-*.html` returns zero hits;
`! grep -i "window.close\|history.back" stages/design/artifacts/success-*.html` returns
zero hits.

### V5 — Session Type

_Sources: inception `unit-06`, design `unit-04`._

**V5-01 (P0)** `haiku_cowork_review_submit` is a single tool with exactly one `ListTools`
entry. Its zod schema is a `discriminatedUnion` on `session_type` with exactly three
literals: `"review"`, `"question"`, `"design_direction"`.
Test: `rg -c 'session_type: z\.literal' packages/haiku/src/server.ts` equals `3`;
`list_tools` returns exactly one entry for `haiku_cowork_review_submit`.

**V5-02 (P0)** When `session_type: "review"` is submitted, the decision resolves the
`_openReviewAndWait` blocking promise. The FSM gate branches as described in V4.
Test: Vitest: submit `review`; assert `_openReviewAndWait` promise resolves with
correct payload within test timeout.

**V5-03 (P0)** When `session_type: "question"` is submitted, the answer resolves the
`ask_user_visual_question` blocking promise. The tool result payload is byte-identical
to the HTTP path payload.
Test: `vitest run server-visual-question-cowork.test.ts`; assert `startHttpServer`,
`openTunnel`, `spawn` each called 0 times; snapshot equals HTTP golden.

**V5-04 (P0)** When `session_type: "design_direction"` is submitted, the selected
direction resolves the `pick_design_direction` blocking promise. The stage-state write
for `design_direction_selected` fires with the same JSON shape as the HTTP path.
Test: `vitest run server-design-direction-cowork.test.ts`; assert `getStageState().design_direction_selected`
equals submitted payload; assert `startHttpServer`, `openTunnel`, `spawn` called 0 times.

**V5-05 (P0)** All three session types use the same `ui://haiku/review/{version}`
resource URI in `_meta.ui.resourceUri`. The SPA routes to the correct screen based on
`session.session_type` delivered via `updateModelContext`.
Test: For each session type, assert `result._meta.ui.resourceUri` matches
`/^ui:\/\/haiku\/review\/[0-9a-f]{12}$/` and SPA renders the correct screen component.

**V5-06 (P1)** A single FSM run exercising all three session types in sequence delivers
`_meta.ui.resourceUri` on each tool result and each submit resolves its awaiting
promise without interference.
Test: End-to-end stub test; assert each tool result carries the URI and each submit
resolves exactly its awaiting promise.

**V5-07 (P0)** The host bridge (`host-bridge.ts`) is the sole importer of `fetch` and
`WebSocket` in the session-transport path. `useSession.ts` contains no direct `fetch`
or `WebSocket` construction.
Test: `grep -r "new WebSocket" packages/haiku/review-app/src` returns only `host-bridge.ts`;
`grep -n "fetch\|WebSocket" packages/haiku/review-app/src/hooks/useSession.ts` returns zero hits.

**V5-08 (P0)** The `isMcpAppsHost()` probe returns `true` only when both
`window.parent !== window` AND `new App({...})` succeeds. Any throw causes fallback
to browser mode. Result is cached on first call.
Test: Vitest: parent≠window + valid App → `true`; parent===window → `false`; App
throws → `false`.

**V5-09 (P0)** The timeout spike decision is `blocking`: `_openReviewAndWait` uses a
single `await` with no FSM persistence of a resume token. `haiku_cowork_timeout_probe`
does not appear in the production `list_tools` response.
Test: `list_tools` in non-debug build returns zero entries for `haiku_cowork_timeout_probe`;
`knowledge/COWORK-TIMEOUT-SPIKE.md` contains `recommendation: blocking`.

**V5-10 (P0)** **Blocking-path host-timeout fallback.** If the host tears down the
`_openReviewAndWait` tool call before the reviewer submits a decision (host ceiling
lower than the 30-min await), the MCP Apps branch MUST NOT leave the FSM wedged.
The handler observes the cancellation (via the `AbortSignal` the MCP SDK threads
through the tool call) and:

1. Logs the host-timeout to `stFile` as `event: "gate_review_host_timeout"` with a
   `detected_at_seconds` field recording how long the await was held before teardown.
2. Clears the in-memory pending-decision promise for the session.
3. Resolves `_openReviewAndWait` with a synthetic `{decision: "changes_requested", feedback: "Review timed out before decision was submitted. Please retry.", annotations: undefined}` so the orchestrator's existing `gate_review` branching at `orchestrator.ts:3032` fires the retry path rather than crashing.
4. Marks the intent with an `intent.blocking_timeout_observed: true` frontmatter flag so a followup bolt can trigger the unit-02 spike's `resumable` switch without re-discovering the issue.

Test: Vitest injects an `AbortSignal` that fires after 100ms, asserts the handler
resolves with the synthetic `changes_requested` payload, asserts the session log
contains a `gate_review_host_timeout` event, asserts the intent frontmatter now
contains `blocking_timeout_observed: true`. This is the ONLY fallback — the handler
MUST NOT retry internally, MUST NOT hold a new tool call open, MUST NOT attempt to
write a resume token (that's the resumable branch's job if unit-02 switches outcomes).

**V5-11 (P0)** **Blocking-path host-timeout does not corrupt state.** After V5-10
fires, the `.haiku/intents/<slug>/stages/<stage>/state.json` is unchanged from its
pre-timeout snapshot — `phase`, `gate_outcome`, `completed_at` are all untouched.
The synthetic `changes_requested` only resolves the handler promise; it does not
advance the FSM.
Test: Vitest snapshots the state.json before and after the timeout, asserts they
are byte-identical.

### V6 — Connection State

_Sources: `stages/design/DESIGN-BRIEF.md`, design `unit-02`, design `unit-03`._

**V6-01 (P0)** In the `connected` state, `<HostBridgeStatus>` shows a teal dot labeled
"Connected". The `aria-live="polite"` region reflects the state change when entering
from `reconnecting`.
Test: `host-bridge-status.html` has `state=connected` teal dot; Vitest: assert
`aria-live` text updates on `reconnecting` → `connected` transition.

**V6-02 (P0)** In the `reconnecting` state, `<HostBridgeStatus>` shows an amber pulsing
indicator labeled "Reconnecting". The SPA does not show an error screen — it degrades
to the status pill only.
Test: `host-bridge-status.html` has `state=reconnecting` variant; Vitest: assert no
error screen component is mounted while in `reconnecting` state.

**V6-03 (P0)** In the `error` state, `<HostBridgeStatus>` shows a red dot labeled
"Error" with a click-to-retry affordance (≥ 44px). Clicking retries the handshake; if
retry fails, the escalate panel (error code + copy session ID) is revealed.
Test: Retry button has `min-height: 44px`; simulate click → `App.callServerTool`
retry invoked; simulate failure → escalate panel mounts.

**V6-04 (P0)** In the `negotiation-failed` state, the SPA renders `<NegotiationErrorScreen>`:
centered card with specific error code, retry button (≥ 44px), `aria-live="assertive"`,
and escalate panel (copy session ID) revealed on second retry failure.
Test: `grep -E "Error code: [A-Z_]+" stages/design/artifacts/error-negotiation.html` ≥ 1;
`grep -c 'variant=' ...` ≥ 3; `grep -c 'aria-live="assertive"' ...` ≥ 1.

**V6-05 (P1)** In the `sandbox-restricted` state, `<SandboxErrorScreen>` renders: a
card naming the blocked feature specifically, a "Why this happens" disclosure
(`aria-expanded="false"` initially), and an `aria-live="assertive"` region. The
disclosure-open variant renders correctly at narrow without overflow.
Test: Both `aria-expanded="true"` and `aria-expanded="false"` present in `error-sandbox.html`;
inspect disclosure-open at narrow for overflow.

**V6-06 (P1)** In the `session-expired` state, `<SessionExpiredScreen>` renders a
centered card with copy-to-clipboard for "ask Claude Code to generate a new review link",
no browser-tab-assuming buttons, and an `aria-live="assertive"` announcement.
Test: `grep -c 'aria-live="assertive"' stages/design/artifacts/error-expired.html` ≥ 1;
no `<a target="_blank">` or `window.open` in the mockup.

**V6-07 (P1)** In the `stale-host` state, `<StaleHostWarning>` renders as a dismissible
soft-warning banner — not a blocking error screen. The reviewer can still use the
review UI. Dismiss action ≥ 44px.
Test: `error-stale.html` is a banner layout (not full-screen card); Vitest: assert
review screen remains mounted and interactive; dismiss has `min-height: 44px`.

**V6-08 (P0)** The iframe boot sequence progresses through `loading` → `connecting` →
`ready` phases before the first review screen renders. `prefers-reduced-motion` replaces
the `ready` fade-out with an instant transition.
Test: `grep -c "phase=" stages/design/artifacts/boot-screen.html` ≥ 3;
`grep -q "prefers-reduced-motion" stages/design/artifacts/boot-screen.html`; Vitest:
assert phases fire in order on mount.

---

## Screen Content Criteria

_Sources: design `unit-04`, design `unit-05`._

**SC-01 (P0)** The `QuestionPage` renders the question text, answer options, and any
image attachment in a single column at narrow breakpoint. At medium and wide, the
question image and option list appear side-by-side.
Test: Inspect `question-narrow.html` for single-column layout; inspect `question-medium.html`
and `question-wide.html` for side-by-side layout.

**SC-02 (P0)** All five review screens (`IntentReview`, `UnitReview`, `QuestionPage`,
`DesignPicker`, `AnnotationCanvas`) display keyboard shortcuts in the screen footer at
all three breakpoints.
Test: `grep -c "kbd" stages/design/artifacts/*-narrow.html` returns ≥ 5 (one per screen).

---

## Prioritization

### P0 — Must-have for v1

The following are required before the product stage can be considered complete:

- **V1-01 through V1-04, V1-06, V1-07**: MCP Apps host detection, `_meta.ui` envelope,
  resource registration, version stability, and HTTP regression parity.
- **V2-01, V2-02, V2-04**: Workspace handshake for zero-root and single-root cases.
- **V3-01 through V3-03, V3-07, V3-08**: Bottom-sheet shell, `ResizeObserver`-driven
  breakpoints, touch targets, drag gesture, and emphasis styling.
- **V4-01 through V4-06**: All three decision outcomes round-trip correctly, success
  states have correct copy and no buttons.
- **V5-01 through V5-05, V5-07 through V5-09**: Single submit tool, three session types,
  host-bridge transport isolation, `isMcpAppsHost()` detection, blocking timeout decision.
- **V6-01 through V6-04, V6-08**: Connected, reconnecting, error, negotiation-failed
  connection states, and boot screen phases.
- **GR-01 through GR-11**: All general rules apply to every P0 item.
- **SC-01, SC-02**: Content screen layout and keyboard shortcut presence.

### P1 — Follow-up after v1

- **V1-05**: Multi-host parity verification (Claude Desktop, Goose, VS Code Copilot).
- **V2-03**: Multi-root `elicitInput` pick.
- **V3-04 through V3-06**: Wide-breakpoint full layout, `DesignPicker` grid,
  `AnnotationCanvas` responsive resize.
- **V5-06**: Single FSM run covering all three session types in sequence.
- **V6-05 through V6-07**: `sandbox-restricted`, `session-expired`, and `stale-host`
  error screens.

---

## Traceability Index

| AC item(s) | Upstream unit |
|---|---|
| V1-01, V1-05 | inception `unit-01-cowork-env-probe` |
| V1-02, V1-03, V1-06, V1-07 | inception `unit-03-ui-resource-registration`, `unit-05-cowork-open-review-handler` |
| V1-04, GR-11 | inception `unit-05-cowork-open-review-handler` |
| V2-01 through V2-04 | inception `unit-01-cowork-env-probe` |
| V3-01 through V3-08 | design `unit-01-iframe-shell-layout`, `unit-04-iframe-content-screens` |
| V4-01 through V4-04 | inception `unit-05-cowork-open-review-handler` |
| V4-05, V4-06 | design `unit-05-success-state-and-unmount`, inception `unit-05-cowork-open-review-handler` |
| V5-01 through V5-06 | inception `unit-06-visual-question-design-direction` |
| V5-07, V5-08 | inception `unit-04-spa-host-bridge` |
| V5-09 | inception `unit-02-cowork-timeout-spike`, `unit-05-cowork-open-review-handler` |
| V6-01 through V6-03 | design `unit-02-boot-and-status` |
| V6-04 through V6-07 | design `unit-03-error-states` |
| V6-08 | design `unit-02-boot-and-status` |
| SC-01 | design `unit-04-iframe-content-screens` |
| SC-02 | design `unit-04-iframe-content-screens` |
| GR-01, GR-03, GR-09 | design `unit-01-iframe-shell-layout`, `knowledge/DESIGN-TOKENS.md` |
| GR-02, GR-07, GR-08 | `stages/design/DESIGN-BRIEF.md` |
| GR-04, GR-10 | `stages/design/DESIGN-BRIEF.md`, design `unit-05-success-state-and-unmount` |
| GR-05 | inception `unit-01-cowork-env-probe`, `unit-05`, `unit-06`, `unit-08` |
| GR-06 | `knowledge/DESIGN-TOKENS.md` |

---

## Audit Log

_Added during product/unit-01-finalize-acceptance-criteria review (2026-04-15)._

Unreferenced criteria found and addressed:

| Gap | Unit | Resolution |
|---|---|---|
| `resources/list` and `resources/read` JSON-RPC contracts | inception `unit-03` criterion 4–5 | Added **V1-06** |
| `REVIEW_APP_VERSION` hash stability and bump-on-change | inception `unit-03` criterion 6 | Added **V1-07** |
| No accidental `_meta` leakage to unrelated tools | inception `unit-03` criterion 9 | Folded into **V1-02** Test: line |
| `haiku_cowork_timeout_probe` not in production `list_tools` | inception `unit-02` criterion 4 | Added **V5-09** |
| Blocking-vs-resumable outcome recorded (`recommendation: blocking`) | inception `unit-02` criterion 2 | Added to **V5-09** |
| `host-bridge.ts` sole transport importer; `useSession.ts` no direct fetch/WS | inception `unit-04` criteria 1–2 | Added **V5-07** |
| `isMcpAppsHost()` two-gate probe logic and caching | inception `unit-04` criteria 3–4 | Added **V5-08** |
| Boot screen three-phase sequence and reduced-motion fallback | design `unit-02` criteria 1, 4 | Added **V6-08** |
| Bottom-sheet drag gesture spec (24px min, 0.5px/ms fling, no full-pane) | design `unit-01` criterion 9 | Added **V3-07** |
| Decision panel emphasis level 3 (teal border, shadow, button color) | design `unit-01` criterion 10 | Added **V3-08** |
| Success states contain no buttons | design `unit-05` criterion 2 | Added **V4-06** |
| Question screen side-by-side layout at medium/wide | design `unit-04` in-scope item | Added **SC-01** |
| Keyboard shortcuts visible in all screen footers | design `unit-04` criterion 4 | Added **SC-02** |
| `Test:` line missing from all 33 pre-existing AC items | All sections | Added `Test:` lines to all GR, V1–V6 items |
| No explicit traceability entry for inception `unit-02`, `unit-04`, design `unit-05` | Traceability index | Added rows for V4-06, V5-07, V5-08, V5-09, V6-08, SC-01, SC-02 |

Criteria that required no new AC items (already covered):
- inception `unit-01` caching idempotency → covered by V1-01 Test: spy assertion
- inception `unit-01` handshake precedes .haiku/ writes → covered by V2-01 Test:
- inception `unit-04` bundle budget (≤ 50 KB gzip growth) → implementation-time check, not a user-observable acceptance criterion; recorded as a PR gate in unit-04 spec, not duplicated here
- inception `unit-07` doc scrub (get_review_status references) → cleanup unit, no user-observable behavior
- inception `unit-08` E2E plan existence → delivery artifact, not a behavioral AC; covered by the unit-08 completion criteria which are self-contained

---

## Specification review

Reviewed by specification hat (unit-01-finalize-acceptance-criteria, bolt 1).

All 60 AC items (GR-01 through GR-11, V1-01 through V6-08, SC-01, SC-02) have concrete
`Test:` lines. Each names a specific, observable behavior: grep return counts, Vitest
spy `callCount` assertions, exact DOM property values, ARIA attribute literals, or pixel
measurements. No item uses vague language such as "works correctly" or "looks right".

Vague `Test:` lines: **(none)**

One note for the feature-file author: V3-01 and V3-07 both set up the narrow breakpoint
context. A shared Gherkin `Background` step — `Given the iframe root observes a width
of 400px` — would eliminate duplicated `Given` setup across those scenarios and the
narrow-breakpoint variants in V6-04 and V6-05.

---

## Validation log

_validator hat · unit-01-finalize-acceptance-criteria · bolt 1 · 2026-04-15_

| Criterion | Verdict | Evidence |
|---|---|---|
| 1. Every inception/design criterion referenced | PASS | All 8 inception units (01–08) and 5 design units (01–05) appear in the traceability index. Unit-07 (doc-scrub) explicitly documented as needing no new AC items in the audit log. |
| 2. Every AC item has a `Test:` line | PASS | `grep -c '^Test:' ACCEPTANCE-CRITERIA.md` = 55; `grep -c AC items` = 55. Exact 1:1 match. |
| 3. Variability brief lists all six axes | PASS | All six `### Axis N` headers present: capability negotiation, workspace roots, iframe breakpoint, decision outcome, session type, connection state. |
| 4. P0/P1 split justified per item | PASS | Every AC item carries an inline `(P0)` or `(P1)` label. Prioritization section summarizes rationale (P0 = required for v1 ship; P1 = follow-up). 48 P0, 10 P1 — split aligns with MCP Apps core-path vs. enhanced-UX boundary. |
| 5. No env-var coupling | PASS | `rg 'CLAUDE_CODE_IS_COWORK\|isCoworkHost' ACCEPTANCE-CRITERIA.md` hits only appear in GR-05 and V1-05 ban-text and their `Test:` grep commands — zero behavioral coupling. |

**APPROVED** — no gaps found. Stage may advance.
