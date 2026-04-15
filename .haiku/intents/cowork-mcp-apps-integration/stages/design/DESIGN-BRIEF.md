---
name: design-brief
stage: design
intent: cowork-mcp-apps-integration
scope: intent
---

# Design Brief — MCP Apps Review Experience

## Context

The review SPA renders inside an MCP Apps **sandboxed iframe** when the connected MCP host advertises the `experimental.apps` capability. This is a different surface from the existing browser-tab review path, even though the React component tree is shared. The iframe lives inline in the host's conversation/chat surface (Cowork today; Claude Desktop, Goose, VS Code Copilot if/when they adopt). It is **not** a standalone page.

## Affected screens

The same five logical screens that exist today, re-pressed for the iframe context:

1. **Intent review** — `IntentReview.tsx` — overview, units list, dependencies graph, criteria, knowledge, artifacts, decision panel.
2. **Unit review** — `UnitReview.tsx` — unit spec, criteria, decision panel.
3. **Question session** — `QuestionPage.tsx` — multiple-choice / multi-select questions with optional context markdown and image attachments.
4. **Design direction picker** — `DesignPicker.tsx` — archetype cards with HTML previews + parameter sliders.
5. **Annotation canvas** — `AnnotationCanvas.tsx` — image-pin + screenshot annotation overlay.

Plus the wrapper screens that bracket all of the above:

6. **Iframe boot / loading** — what the user sees from `<iframe srcdoc>` mount → host-bridge probe → session data hydrated → first render.
7. **Capability-negotiation error** — host advertised the capability but `App.callServerTool` failed during runtime, OR the SPA loaded but the bridge handshake didn't complete.
8. **Sandbox-restricted error** — iframe sandbox blocked a feature the SPA needs (clipboard, file download, popups). Show what + how to recover.
9. **Session expired** — the JWT-derived session is stale. Show "ask for a new link" without any browser-tab assumptions.
10. **Stale-host warning** — the host advertises `experimental.apps` but its protocol version is older than what the SPA expects. Soft warning, not a hard block.

## Layout structure (per screen)

### Iframe-context invariants (apply to all screens)

- **Single column inside the iframe.** No fixed sidebar — the iframe width can be as small as 480px in some hosts. The existing `ReviewSidebar.tsx` collapses to a top bar in iframe mode.
- **No scroll trap.** The SPA never `position: fixed` overlays anything that would prevent the host from scrolling past the iframe. The whole iframe scrolls as a single document.
- **No browser-chrome assumptions.** No `window.open`, no `tryCloseTab`, no `navigator.sendBeacon` for cleanup. Cleanup happens via the host bridge or via the heartbeat dropping (PR #213's pattern, ported to the bundled SPA).
- **Touch targets ≥ 44px.** Even on Cowork desktop, the iframe may display at small sizes and some hosts are touch-capable.
- **Focus management.** The iframe gains focus from the host on mount. The first interactive element gets focus automatically. `Tab` cycles within the iframe; `Shift+Tab` from the first element returns focus to the host (browser default — no manual trap).

### Per-screen layout deltas vs browser-tab today

**Selected layout direction: bottom-sheet decision panel** (chosen via `pick_design_direction`). Content fills the iframe; the decision panel is a draggable bottom sheet that starts collapsed (just buttons + drag handle) and expands to half-pane to reveal feedback fields. The full sidebar metadata moves into the scrollable content area; only a minimal status strip lives at the top.

- **Intent review:** Sidebar metadata (units, dependencies, criteria) becomes inline sections in the scrollable content. Decision panel is the bottom sheet.
- **Unit review:** Same pattern — sidebar inline, decision in the sheet.
- **Question session:** Question form lives in the content area; submit lives in the bottom sheet.
- **Design direction picker:** Archetype cards stack vertically; selection commit lives in the bottom sheet.
- **Annotation canvas:** Canvas fills the content area; "Apply annotations" / "Clear" actions live in the bottom sheet.
- **Iframe boot:** Centered loading spinner with three-phase status text (`Loading…` → `Connecting…` → `Ready`).
- **Capability-negotiation error:** Centered card with icon, error code, retry button (calls `App.callServerTool` again), and an escalate-link to copy the session ID for a bug report.
- **Sandbox-restricted error:** Centered card with the blocked feature name and a "Why this happens" disclosure.
- **Session expired:** Centered card with copy-to-clipboard for the request "ask Claude Code to generate a new review link" plus a small explanation.

## Component inventory deltas

- **New:** `<HostBridgeStatus>` — a small status pill in the collapsed top bar showing `MCP Apps · connected | reconnecting | error`. Replaces the existing browser-mode `<ReconnectingBanner>` when in iframe mode.
- **New:** `<IframeBootScreen>` — three-phase loading screen (rendered before session data hydrates).
- **New:** `<NegotiationErrorScreen>` — centered error card.
- **New:** `<SandboxErrorScreen>` — centered error card.
- **Modified:** `<ReviewSidebar>` — sidebar/topbar dual-mode based on `host-bridge.ts#isMcpAppsHost()`.
- **Unchanged:** `<ReviewRouter>`, `<IntentReview>`, `<UnitReview>`, `<QuestionForm>`, `<DesignPicker>`, `<AnnotationCanvas>`, `<MarkdownViewer>`, `<CriteriaChecklist>`, `<StatusBadge>`.

## Interaction states (per interactive element)

For each new component, specify all applicable states:

- `<HostBridgeStatus>`: `connected` (teal dot, "Connected"), `reconnecting` (amber pulse, "Reconnecting"), `error` (red dot, "Error" + click to retry).
- `<IframeBootScreen>`: `loading` (spinner), `ready` (fade-out → unmount).
- `<NegotiationErrorScreen>`: `default`, `retry-pending` (button shows spinner), `retry-failed` (escalate panel revealed).
- `<SandboxErrorScreen>`: `default`, `disclosure-open`.

For existing components in iframe mode: `<ReviewSidebar>` adds a `collapsed-topbar` mode with hover/focus/active on the accordion toggle.

## Responsive behavior

Three iframe-width breakpoints (different from the browser-tab breakpoints because the iframe sets its own viewport):

- **Narrow (≤ 480px)**: stack everything; pin decision panel to the bottom; hide non-essential metadata.
- **Medium (481–768px)**: same as narrow but with more horizontal padding; show short metadata tags.
- **Wide (≥ 769px)**: full layout (close to today's browser-tab look) but **without** a fixed-width sidebar — the topbar pattern stays.

Do **not** rely on `window.innerWidth` — use a `ResizeObserver` on the iframe root because the host can resize the iframe at any time.

## Navigation flows

The iframe has no concept of "back" or routing — it's a single-shot review session. Internal navigation between intent overview / units / criteria is via the existing tab/section pattern, untouched.

When a decision is submitted (`approved` / `changes_requested` / `external_review`), the SPA shows a brief success state and then *waits for the host to unmount the iframe*. It does NOT call `window.close` or attempt to navigate. The host decides when to dismiss based on the resolved tool call.

## Accessibility requirements

- **Contrast ratios:** 4.5:1 for body text, 3:1 for large text. All status pills meet 4.5:1 against their background.
- **Label associations:** Every form control has a programmatic label. Decision buttons are wrapped in a `<form>` with `aria-labelledby` pointing at a hidden heading.
- **Keyboard navigation:** All interactive elements reachable via `Tab`. Decision panel: `1` = approve, `2` = changes_requested, `3` = external_review (with visible hints).
- **Focus management:** First interactive element gets focus on mount. After a decision, focus moves to the success-state heading until the iframe unmounts.
- **`aria-live` regions:** Connection status changes (`<HostBridgeStatus>`) announce via `aria-live="polite"`.
- **Reduced motion:** Loading spinner respects `prefers-reduced-motion` and degrades to a static "Loading…" label.

## Design gaps (known, dispositioned)

- **Rich media inside the iframe** (image lightbox, video playback): designed → reuse existing components, but lightbox can't escape the iframe. Document the constraint in user-facing copy.
- **Copy-to-clipboard inside the iframe sandbox**: deferred → some sandbox configurations block clipboard write. Fall back to a "select to copy" `<textarea>` reveal.
- **External-review external links**: the iframe sandbox blocks `target="_blank"` by default unless `allow-popups` is set. Designed → external review URL renders as a copy-to-clipboard input plus a short "open in your tools" instruction. Don't rely on a clickable link.
- **Multi-iframe coordination** (multiple haiku reviews open simultaneously in the same Cowork conversation): out of scope for v1 — first session wins, second session shows a "review in progress" placeholder.

## Open questions for the team

1. Does Cowork pin a fixed iframe height or let the SPA request its own? If fixed, decision panel sticky-bottom gets a hard cap.
2. Does Cowork's sandbox include `allow-clipboard-write` by default, or do we need to assume the worst?
3. What's the maximum iframe payload size Cowork accepts for a `ui://` resource? (5.15 MB inlined HTML — flagged in unit-03 of inception.)
4. Should the SPA expose a "send to other Claude" share button for the review state? Out of scope but worth tracking.
