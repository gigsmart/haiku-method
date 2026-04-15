Feature: Error recovery for the four iframe error states
  The review SPA inside an MCP Apps iframe can encounter four distinct failure modes,
  each with its own centered-card UI and specific recovery action. Capability
  negotiation failures offer retry with escalation. Sandbox-restricted failures show
  what was blocked with a disclosure. Expired sessions provide copy-to-clipboard
  assistance. Stale-host warnings are non-blocking and dismissable. None of these
  states assume a browser tab is available.

  Background:
    Given the review SPA is mounted inside a Cowork host iframe
    And the host-bridge has completed its detection probe

  # ─── Capability-negotiation error ───

  Scenario: App.callServerTool fails during the review session — negotiation error card shown
    Given isMcpAppsHost() returned true and the session was opened
    When App.callServerTool raises an error with code "NEGOTIATION_FAILED"
    Then the SPA renders the NegotiationErrorScreen
    And the card displays error code "NEGOTIATION_FAILED"
    And a "Retry" button is visible with a touch target of at least 44px
    And an "Escalate" link reveals a copy-to-clipboard session ID field

  Scenario: Retry succeeds on second attempt — NegotiationErrorScreen dismissed
    Given the NegotiationErrorScreen is showing with error code "NEGOTIATION_FAILED"
    When the human reviewer clicks the Retry button
    Then the button shows a loading spinner
    And App.callServerTool is called again
    And on success the NegotiationErrorScreen unmounts and the review session resumes

  Scenario: Retry fails again — escalation panel is revealed
    Given the NegotiationErrorScreen is showing with error code "NEGOTIATION_FAILED"
    When the human reviewer clicks the Retry button and it fails again
    Then the retry button shows a "Retry failed" state
    And the escalation panel with copy-to-clipboard session ID is revealed automatically

  # ─── Sandbox-restricted error ───

  Scenario: Clipboard write blocked by iframe sandbox — sandbox error card shown
    Given isMcpAppsHost() returns true
    When the SPA attempts a clipboard write and the sandbox blocks it
    Then the SPA renders the SandboxErrorScreen
    And the card names the blocked feature "clipboard-write"
    And error code "SANDBOX_CLIPBOARD_WRITE" is displayed
    And a "Why this happens" disclosure toggle is visible

  Scenario: Human reviewer expands the "Why this happens" disclosure
    Given the SandboxErrorScreen is showing with a closed disclosure
    When the human reviewer activates the disclosure toggle
    Then the disclosure panel expands with aria-expanded="true"
    And the explanation text is revealed describing the sandbox restriction

  # ─── Session expired error ───

  Scenario: JWT-derived session is stale — expired card shown
    Given the review SPA initialized with a session token
    When the server rejects a callServerTool call because the session JWT has expired
    Then the SPA renders the SessionExpiredScreen
    And the card displays error code "SESSION_EXPIRED"
    And a copy-to-clipboard input contains the text "Please generate a new review link"
    And no browser-tab or window.open reference appears in the recovery instructions

  Scenario: Human reviewer copies the session-expired recovery text
    Given the SessionExpiredScreen is showing
    When the human reviewer activates the copy-to-clipboard button
    Then the recovery phrase is written to the clipboard if sandbox permits
    And if clipboard is blocked a "select to copy" textarea is revealed instead

  # ─── Stale-host warning ───

  Scenario: Host advertises a protocol version older than what the SPA expects — warning shown
    Given the Cowork host connected with protocol version "0.9.0"
    And the SPA expects protocol version "1.0.0" or higher
    When the host-bridge detects the version mismatch
    Then a StaleHostWarning banner is shown at the top of the SPA
    And the warning displays error code "STALE_HOST_PROTOCOL"
    And the review session continues to load — the warning is non-blocking
    And a Dismiss button allows the human reviewer to hide the banner

  Scenario: Stale-host warning dismissed — session proceeds normally
    Given the StaleHostWarning banner is visible
    When the human reviewer clicks Dismiss
    Then the banner unmounts
    And the review session content remains fully functional

  # ─── Regression — non-MCP-Apps host ───

  Scenario: Non-MCP-Apps host — error states do not render inside an iframe
    Given isMcpAppsHost() returns false
    When a network error occurs during the HTTP-path review session
    Then the existing browser-tab error handling is used
    And none of the four iframe error screens are rendered

  # ─── Accessibility on error states ───

  Scenario Outline: Each error card announces immediately via aria-live assertive
    Given the "<error_state>" error card is rendered
    Then the error message container has aria-live="assertive"
    And the error code is included in the announced text

    Examples:
      | error_state        |
      | NEGOTIATION_FAILED |
      | SANDBOX_CLIPBOARD_WRITE |
      | SESSION_EXPIRED    |
      | STALE_HOST_PROTOCOL |

  # ─── Connected state (V6-01) ───

  Scenario: HostBridgeStatus shows teal Connected dot and announces via aria-live on reconnect
    Given the HostBridgeStatus pill has just transitioned from "reconnecting" to "connected"
    Then the status pill displays a teal dot labeled "Connected"
    And the aria-live="polite" region fires an announcement with the "Connected" text

  # ─── Reconnecting state (V6-02) ───

  Scenario: HostBridgeStatus shows amber pulsing indicator during reconnect — no error screen
    Given the host bridge connection drops while the review session is active
    When the bridge enters "reconnecting" state
    Then the HostBridgeStatus pill shows an amber pulsing indicator labeled "Reconnecting"
    And no error card or blocking screen is rendered
    And the review session content remains visible during the reconnection attempt

  # ─── Boot sequence phases (V6-08) ───

  Scenario: Boot screen progresses through loading → connecting → ready phases in order
    Given the review SPA has just been mounted inside the Cowork host iframe
    When the boot sequence executes
    Then the IframeBootScreen transitions through "loading" phase first
    And then transitions to "connecting" phase
    And then transitions to "ready" phase
    And the review screen renders only after the "ready" phase completes

  Scenario: Boot screen reduced-motion replaces fade-out with instant transition
    Given the operating system reports prefers-reduced-motion: reduce
    When the IframeBootScreen transitions from "ready" to the review screen
    Then no CSS fade or opacity transition fires
    And the review screen appears immediately without animation

# Audit log
# Added 2026-04-15 during product/unit-02-finalize-feature-files review.
# Gaps addressed:
#   V6-01 — HostBridgeStatus connected state + aria-live on reconnect→connected had no scenario.
#            Added: "HostBridgeStatus shows teal Connected dot and announces via aria-live".
#   V6-02 — Reconnecting state: amber pulsing, no error screen had no scenario.
#            Added: "HostBridgeStatus shows amber pulsing indicator — no error screen".
#   V6-08 — Boot screen three-phase sequence and reduced-motion fallback had no scenario.
#            Added: "Boot screen progresses through loading → connecting → ready" and
#            "Boot screen reduced-motion replaces fade-out with instant transition".
