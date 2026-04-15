Feature: Iframe review gate via MCP Apps
  When the Cowork host supports MCP Apps and the FSM reaches a gate_review action,
  the review UI loads inside a sandboxed iframe rather than a browser tab. The tool
  result carries _meta.ui.resourceUri pointing to the ui://haiku/review resource. The
  host preloads and mounts the iframe in the conversation surface. The human reviewer
  submits a decision via the bottom-sheet panel. The iframe stays mounted until the
  host unmounts it after the tool call resolves.

  Background:
    Given the MCP initialize handshake completed with "experimental.apps" capability
    And hostSupportsMcpApps() returns true
    And the review SPA resource is registered at "ui://haiku/review/<version>"
    And the FSM is in the elaborate phase with a pending gate_review

  # ─── Happy paths ───

  Scenario: Tool result carries _meta.ui.resourceUri — host renders the iframe
    When the agent triggers the gate_review action
    Then the tool result contains "_meta.ui.resourceUri" equal to "ui://haiku/review/<version>"
    And startHttpServer is not called
    And openTunnel is not called
    And openBrowser is not called
    And the Cowork host renders the review SPA inside a sandboxed iframe

  Scenario: Human reviewer approves — FSM advances and iframe stays until host unmounts
    Given the review SPA is mounted inside the Cowork host iframe
    And the session data is hydrated via updateModelContext
    When the human reviewer clicks the Approve button in the bottom-sheet panel
    And submits via haiku_cowork_review_submit with decision "approved"
    Then the tool call resolves with "{decision: 'approved', feedback: '', annotations: undefined}"
    And intent_reviewed is set to true in intent.md frontmatter
    And fsmAdvancePhase is called moving the FSM to the execute phase
    And the SPA renders the "Approved" success state
    And the SPA does not call window.close or window.history.back
    And the iframe remains mounted until the Cowork host unmounts it

  Scenario: Human reviewer requests changes — FSM stays in elaborate, feedback returned
    Given the review SPA is mounted inside the Cowork host iframe
    When the human reviewer expands the bottom sheet and enters feedback text
    And submits via haiku_cowork_review_submit with decision "changes_requested"
    Then the tool call resolves with "{decision: 'changes_requested', feedback: '<text>'}"
    And the FSM does not advance to execute
    And the SPA renders the "Changes requested" success state echoing the feedback

  Scenario: Human reviewer escalates to external review
    Given the review SPA is mounted inside the Cowork host iframe
    When the human reviewer selects "External review" in the bottom-sheet panel
    And submits via haiku_cowork_review_submit with decision "external_review"
    Then the tool call resolves with "{decision: 'external_review', feedback: '', annotations: undefined}"
    And fsmAdvancePhase is called via the external_review arm of gate_review
    And the SPA renders the "External review requested" success state
    And the external review URL is shown as a copy-to-clipboard input, not a clickable link

  # ─── Regression — non-MCP-Apps host ───

  Scenario: Non-MCP-Apps host — gate_review uses HTTP+tunnel path
    Given hostSupportsMcpApps() returns false
    When the agent triggers the gate_review action
    Then the tool result does not contain "_meta.ui.resourceUri"
    And startHttpServer is called
    And the review URL is opened in a browser tab

  # ─── Error scenarios ───

  Scenario: _meta.ui.resourceUri present in tool result but host fails to mount the iframe
    Given the tool result carries "_meta.ui.resourceUri"
    When the Cowork host fails to mount the iframe within the expected timeout
    Then the gate remains open
    And the agent does not advance the FSM
    And no unhandled exception is thrown

  Scenario: Iframe mounted but host-bridge handshake does not complete
    Given the Cowork host mounted the iframe
    When the host-bridge probe inside the SPA fails to construct a new App instance
    Then isMcpAppsHost() returns false inside the SPA
    And the NegotiationErrorScreen is rendered with error code "BRIDGE_HANDSHAKE_FAILED"
    And a retry button allows the human reviewer to re-attempt the handshake
