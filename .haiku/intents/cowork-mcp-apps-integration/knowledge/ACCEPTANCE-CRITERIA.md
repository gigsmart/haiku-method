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

**GR-01** Every interactive element rendered inside the iframe has a minimum touch
target of 44px in both dimensions (mapping to `--iframe-min-touch`). This includes the
drag handle (4px visual bar, 44px hit zone), decision buttons, status pill retry
affordance, and error-screen primary actions.

**GR-02** The first interactive element receives focus automatically when the iframe
mounts. `Tab` cycles within the iframe. `Shift+Tab` from the first element returns
focus to the host (browser default — no manual trap). After a decision is submitted,
focus moves to the success-state heading.

**GR-03** The SPA never calls `window.close`, `window.history.back`, or any unmount
API. Post-decision, the iframe waits for the host to unmount. No `tryCloseTab`
invocation on the MCP Apps path.

**GR-04** No `target="_blank"` on any anchor rendered inside the iframe. External-review
URLs render as copy-to-clipboard inputs with a short "open in your tools" instruction
line — never as clickable links (sandbox `allow-popups` not assumed).

**GR-05** No environment variable (`CLAUDE_CODE_IS_COWORK`, `isCoworkHost`, or any
variant) is read to determine whether to use the MCP Apps path. Detection is via
`hostSupportsMcpApps()` (capability negotiation only).

**GR-06** Body text meets 4.5:1 contrast against `--iframe-bg` (`stone-950`). Large
text and UI components (status pills, decision buttons, icons) meet 3:1. `<HostBridgeStatus>`
state colors (`teal-500`, `amber-400`, `red-500`) meet 4.5:1 against `stone-950`.

**GR-07** Every form control has a programmatic label. Decision buttons are wrapped in
a `<form>` with `aria-labelledby` pointing at a hidden heading. Form regions in
`QuestionPage` and `DesignPicker` carry `aria-labelledby`.

**GR-08** The loading spinner respects `prefers-reduced-motion`: when the preference
is set, the spinner is replaced with a static "Loading…" label and all transition
animations are removed (snap behavior replaces animated drag).

**GR-09** No raw hex values in component styles — all colors come from existing
Tailwind palette entries via named classes or the iframe-specific CSS custom properties
defined in `knowledge/DESIGN-TOKENS.md`.

**GR-10** The iframe never applies `position: fixed` in a way that traps the host
scroll. The entire iframe scrolls as a single document. The bottom sheet uses
`position: sticky` (or equivalent within the iframe scroll container) — it sticks
within the iframe, not the host viewport.

**GR-11** The non-MCP-Apps HTTP path is byte-identical to its pre-intent state. No
edit to the else-arm of any `hostSupportsMcpApps()` branch changes existing HTTP+tunnel
behavior.

---

## Variant-Specific Acceptance Criteria

### V1 — MCP Host Capability

_Sources: inception `unit-01`, inception `unit-08`._

**V1-01 (P0)** When the MCP host echoes `experimental.apps` in the `initialize`
response, `hostSupportsMcpApps()` returns `true`. When the host does not echo it,
`hostSupportsMcpApps()` returns `false`. The accessor is evaluated at most once per
connection (cached on first read).

**V1-02 (P0)** When `hostSupportsMcpApps()` is `true`, the tool result for the gate
action carries `_meta.ui.resourceUri = "ui://haiku/review/" + REVIEW_APP_VERSION`.
When `hostSupportsMcpApps()` is `false`, the tool result has no `_meta` field.

**V1-03 (P0)** When `hostSupportsMcpApps()` is `true`, `startHttpServer`,
`openTunnel`, and `openBrowser` are never called during the review gate flow, the
visual question flow, or the design direction flow.

**V1-04 (P0)** When `hostSupportsMcpApps()` is `false`, the HTTP+tunnel+browser path
runs and the final `intent.md` frontmatter state (`intent_reviewed: true`) and
`state.json` (`phase: "execute"`) are bit-identical to the pre-intent behavior.

**V1-05 (P1)** The feature works on any MCP host that advertises `experimental.apps`
— not only Cowork. No Cowork-specific env var or hostname check is present anywhere
in the detection path.

### V2 — Workspace State

_Sources: inception `unit-01`._

**V2-01 (P0)** When `hostSupportsMcpApps()` is `true` and the `roots` capability
surfaces zero workspace folders, `requestHostWorkspace()` is called before any
`.haiku/` write. The call fires exactly once per session.

**V2-02 (P0)** When `roots.length === 1`, the workspace is auto-selected and
`requestHostWorkspace()` is not called.

**V2-03 (P1)** When `roots.length > 1`, an `elicitInput` pick is presented and the
user's selection is cached for the session. Subsequent `.haiku/` writes use the
selected root.

**V2-04 (P0)** The workspace handshake does not modify the behavior of any
downstream review flow. The gate opens with identical session data regardless of
which root was selected.

### V3 — Iframe Breakpoint

_Sources: design `unit-01`, design `unit-04`, `knowledge/DESIGN-TOKENS.md`._

**V3-01 (P0)** At narrow breakpoint (≤ 480px), all interactive elements are stacked
in a single column, the bottom sheet is pinned to the bottom of the iframe, and
non-essential metadata is hidden. No horizontal overflow.

**V3-02 (P0)** At all three breakpoints, the breakpoint is determined by a
`ResizeObserver` on the iframe root element — not by `window.innerWidth` or CSS
media queries.

**V3-03 (P0)** The bottom sheet is visible and accessible at all three breakpoints.
At narrow, the collapsed sheet shows at minimum the Approve and Changes buttons plus
the drag handle within the 44px touch target floor.

**V3-04 (P1)** At wide breakpoint (≥ 769px), the layout approximates the browser-tab
appearance (fuller metadata visibility) while retaining the topbar-not-sidebar pattern.

**V3-05 (P1)** The `DesignPicker` archetype cards stack vertically at narrow, and the
parameter sliders appear below the preview. At wide, cards may appear side-by-side and
sliders may appear beside the preview.

**V3-06 (P1)** The `AnnotationCanvas` resizes to fit the iframe width at every
breakpoint with aspect ratio preserved. Pinned annotations scale proportionally.

### V4 — Decision Outcome

_Sources: inception `unit-05`, design `unit-05`._

**V4-01 (P0)** When the human reviewer submits `approved`, the `haiku_cowork_review_submit`
handler resolves with `{ decision: "approved", feedback: "", annotations: undefined }`
(or the feedback and annotations the user provided), the `gate_review` arm at
`orchestrator.ts:3016` writes `intent_reviewed: true` to `intent.md` frontmatter, and
`fsmAdvancePhase` is called.

**V4-02 (P0)** When the human reviewer submits `changes_requested`, the handler
resolves with the feedback field populated, and the orchestrator processes the
`changes_requested` branch without advancing the phase.

**V4-03 (P0)** When the human reviewer submits `external_review`, the handler resolves
with the external-review escalation data, and `fsmAdvancePhase` is called at
`orchestrator.ts:3032`. The external-review URL is never rendered as a clickable link
inside the iframe.

**V4-04 (P0)** The resolved object shape for all three outcomes on the MCP Apps path
is equal to the resolved object shape on the HTTP path (snapshot parity per inception
`unit-05` completion criteria).

**V4-05 (P0)** After any decision is submitted, the SPA transitions to the appropriate
success state (green for approved, amber for changes requested, indigo for external
review), focus moves to the success heading, and an `aria-live="polite"` announcement
fires.

### V5 — Session Type

_Sources: inception `unit-06`, design `unit-04`._

**V5-01 (P0)** `haiku_cowork_review_submit` is a single tool with exactly one `ListTools`
entry. Its zod schema is a `discriminatedUnion` on `session_type` with exactly three
literals: `"review"`, `"question"`, `"design_direction"`.

**V5-02 (P0)** When `session_type: "review"` is submitted, the decision resolves the
`_openReviewAndWait` blocking promise. The FSM gate branches as described in V4.

**V5-03 (P0)** When `session_type: "question"` is submitted, the answer resolves the
`ask_user_visual_question` blocking promise. The tool result payload is byte-identical
to the HTTP path payload.

**V5-04 (P0)** When `session_type: "design_direction"` is submitted, the selected
direction resolves the `pick_design_direction` blocking promise. The stage-state write
for `design_direction_selected` fires on the MCP Apps branch with the same JSON shape
as the HTTP path.

**V5-05 (P0)** All three session types use the same `ui://haiku/review/{version}`
resource URI in `_meta.ui.resourceUri`. The SPA routes to the correct screen
(`IntentReview`/`UnitReview`, `QuestionPage`, `DesignPicker`) based on `session.session_type`
delivered via `updateModelContext`.

**V5-06 (P1)** A single FSM run exercising a review gate, a visual question, and a
design direction in sequence delivers `_meta.ui.resourceUri` on each tool result and
each corresponding submit call resolves its awaiting promise without interference.

### V6 — Connection State

_Sources: `stages/design/DESIGN-BRIEF.md`, design `unit-02`, design `unit-03`._

**V6-01 (P0)** In the `connected` state, `<HostBridgeStatus>` shows a teal dot labeled
"Connected". No user action is required. The `aria-live="polite"` region reflects the
state change when transitioning into this state from `reconnecting`.

**V6-02 (P0)** In the `reconnecting` state, `<HostBridgeStatus>` shows an amber pulsing
indicator labeled "Reconnecting". The SPA does not show an error screen during
reconnection — it degrades to the status pill only.

**V6-03 (P0)** In the `error` state, `<HostBridgeStatus>` shows a red dot labeled
"Error" with a visible click-to-retry affordance (≥ 44px touch target). Clicking
retries the host-bridge handshake. If the retry is in flight, the button shows a
spinner. If the retry fails, the escalate panel is revealed (error code + copy session
ID).

**V6-04 (P0)** In the `negotiation-failed` state, the SPA renders `<NegotiationErrorScreen>`:
a centered card with a specific error code, a retry button (≥ 44px), and an
`aria-live="assertive"` announcement. If retry fails after the first attempt, the
escalate panel (copy session ID) is revealed. No other browser-chrome assumptions
(no `window.open`, no email link).

**V6-05 (P1)** In the `sandbox-restricted` state, `<SandboxErrorScreen>` renders: a
centered card naming the blocked feature specifically (not generically), a "Why this
happens" disclosure toggle (collapsed by default, `aria-expanded="false"` initially),
and an `aria-live="assertive"` region. The disclosure-open variant renders correctly
at the narrow breakpoint without overflow.

**V6-06 (P1)** In the `session-expired` state, `<SessionExpiredScreen>` renders a
centered card with copy-to-clipboard for the request text "ask Claude Code to generate
a new review link", no buttons that assume browser-tab behavior, and an
`aria-live="assertive"` announcement.

**V6-07 (P1)** In the `stale-host` state, `<StaleHostWarning>` renders as a dismissible
soft-warning banner — not a blocking error screen. The reviewer can still attempt to
use the review UI. A dismiss action (≥ 44px) removes the warning.

---

## Prioritization

### P0 — Must-have for v1

The following are required before the product stage can be considered complete:

- **V1-01 through V1-04**: MCP Apps host detection via capability negotiation and the
  divergent transport branching that follows.
- **V3-01 through V3-03**: Bottom-sheet shell functional at all three breakpoints,
  `ResizeObserver`-driven, touch-accessible.
- **V4-01 through V4-05**: All three decision outcomes round-trip correctly through
  `haiku_cowork_review_submit` with shape parity against the HTTP path.
- **V5-01 through V5-05**: Single submit tool, three session types, each type resolves
  correctly and stage-state writes fire.
- **V6-01 through V6-04**: Connected, reconnecting, error, and negotiation-failed
  connection states — the last being the highest-risk failure mode (per inception
  `unit-08`).
- **GR-01 through GR-11**: All general rules apply to every P0 item.

### P1 — Follow-up after v1

- **V1-05**: Multi-host parity verification (Claude Desktop, Goose, VS Code Copilot).
- **V2-03**: Multi-root `elicitInput` pick.
- **V3-04 through V3-06**: Wide-breakpoint full layout, `DesignPicker` grid,
  `AnnotationCanvas` responsive resize.
- **V5-06**: Single FSM run covering all three session types in sequence.
- **V6-05 through V6-07**: `sandbox-restricted`, `session-expired`, and `stale-host`
  error screens. The `negotiation-failed` screen (V6-04) is P0 because it represents
  the most likely first-contact failure; the remaining three cover edge states that
  don't block the happy path.

---

## Traceability Index

| AC item(s) | Upstream unit |
|---|---|
| V1-01, V1-05 | inception `unit-01-cowork-env-probe` |
| V1-02, V1-03 | inception `unit-03-ui-resource-registration`, `unit-05-cowork-open-review-handler` |
| V1-04, GR-11 | inception `unit-05-cowork-open-review-handler` |
| V2-01 through V2-04 | inception `unit-01-cowork-env-probe` |
| V3-01 through V3-06 | design `unit-01-iframe-shell-layout`, `unit-04-iframe-content-screens` |
| V4-01 through V4-04 | inception `unit-05-cowork-open-review-handler` |
| V4-05, V5 success states | design `unit-05-success-state-and-unmount` |
| V5-01 through V5-06 | inception `unit-06-visual-question-design-direction` |
| V6-01 through V6-03 | design `unit-02-boot-and-status` |
| V6-04 through V6-07 | design `unit-03-error-states` |
| GR-01, GR-03, GR-09 | design `unit-01-iframe-shell-layout`, `knowledge/DESIGN-TOKENS.md` |
| GR-02, GR-07, GR-08 | `stages/design/DESIGN-BRIEF.md` |
| GR-04, GR-10 | `stages/design/DESIGN-BRIEF.md`, design `unit-05-success-state-and-unmount` |
| GR-05 | inception `unit-01-cowork-env-probe`, `unit-05`, `unit-06`, `unit-08` |
| GR-06 | `knowledge/DESIGN-TOKENS.md` |

---

## Specification review

Reviewed by specification hat (unit-01-finalize-acceptance-criteria, bolt 1).

All 40 AC items (V1-01 through V6-07, GR-01 through GR-11) are concretely testable as
Gherkin scenarios. Each criterion names a specific observable: a boolean return value,
a labeled DOM state, a call count, a pixel measurement, a CSS property, a contrast
ratio, or an ARIA attribute value. No item uses vague language such as "works correctly"
or "looks right".

Vague `Test:` lines: **(none)**

One note for the feature-file author: V6-04 (`negotiation-failed`) and V6-05
(`sandbox-restricted`) both test error-screen rendering at the narrow breakpoint.
Consider a shared background step for "Given the iframe renders at ≤ 480px width" to
avoid duplication across those scenarios.
