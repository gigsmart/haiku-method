Feature: Accessibility behaviors for the MCP Apps iframe review UI
  The review SPA inside an MCP Apps sandboxed iframe must be fully keyboard-navigable,
  screen-reader-friendly, and touch-capable at small iframe widths. Focus must be
  managed on mount and after decisions. aria-live regions must announce connection and
  state changes. All interactive elements must meet the 44px minimum touch target.
  The SPA must not trap focus — Tab from the last element and Shift+Tab from the first
  must return focus to the Cowork host as the browser default.

  Background:
    Given the review SPA is mounted inside a Cowork host iframe
    And isMcpAppsHost() returns true
    And the session data has hydrated and the first render has completed

  # ─── Touch targets ───

  Scenario Outline: Every interactive element meets the 44px touch target minimum
    Given the iframe is rendered at width "<width>" pixels
    When the "<element>" is inspected
    Then its hit zone has a minimum height of 44px and a minimum width of 44px

    Examples:
      | width | element                          |
      | 480   | Approve button                   |
      | 480   | Changes Requested button         |
      | 480   | External Review button           |
      | 480   | bottom-sheet drag handle         |
      | 480   | HostBridgeStatus retry affordance|
      | 480   | error card Retry button          |
      | 768   | Approve button                   |
      | 769   | Approve button                   |

  # ─── Focus management on mount ───

  Scenario: Focus moves to the first interactive element when the iframe mounts
    When the IframeBootScreen transitions to the session-loaded state
    Then focus is placed on the first interactive element in the review content
    And no focus-visible outline is suppressed

  Scenario: After a decision is submitted focus moves to the success heading
    Given the human reviewer clicks the Approve button and the success state renders
    When the "Approved" success heading is painted
    Then focus moves to the "Approved" heading element
    And the heading is focusable via tabIndex="-1"

  # ─── Tab cycle within iframe ───

  Scenario: Tab key cycles through all interactive elements within the iframe
    Given the iframe contains the intent review screen with a bottom-sheet panel
    When the human reviewer presses Tab repeatedly starting from the first element
    Then focus visits every interactive element in document order
    And focus does not escape the iframe boundaries through Tab cycling

  Scenario: Shift+Tab from the first interactive element returns focus to the Cowork host
    Given focus is on the first interactive element inside the iframe
    When the human reviewer presses Shift+Tab
    Then the browser returns focus to the Cowork host's preceding focusable element
    And no JavaScript focus trap intercepts the default browser behavior

  # ─── aria-live regions ───

  Scenario: HostBridgeStatus connection state changes are announced via aria-live polite
    Given the HostBridgeStatus pill is in "connected" state
    When the host bridge transitions to "reconnecting" state
    Then the aria-live="polite" region announces the new status text
    And the announcement fires without interrupting an in-progress screen reader utterance

  Scenario: Subsequent connection state changes are each announced
    Given the HostBridgeStatus pill is in "reconnecting" state
    When the host bridge transitions to "connected" state
    Then the aria-live="polite" region announces "Connected"

  Scenario: Decision success state announces via aria-live polite
    Given the human reviewer submitted a decision
    When the success heading is rendered
    Then the aria-live="polite" region announces the outcome label
    And the announcement includes the decision type

  # ─── Keyboard navigation for the bottom sheet ───

  Scenario: Up arrow key on the drag handle expands the bottom sheet
    Given the bottom sheet is in the collapsed state
    And focus is on the drag handle
    When the human reviewer presses the Up arrow key
    Then the bottom sheet expands to half-pane
    And the feedback textarea receives focus

  Scenario: Down arrow key on the drag handle collapses the bottom sheet
    Given the bottom sheet is in the expanded half-pane state
    And focus is on the drag handle
    When the human reviewer presses the Down arrow key
    Then the bottom sheet collapses
    And focus returns to the drag handle

  # ─── Reduced motion ───

  Scenario: prefers-reduced-motion disables the boot-screen spinner animation
    Given the operating system reports prefers-reduced-motion: reduce
    When the IframeBootScreen is rendered
    Then the loading spinner animation is not running
    And a static "Loading…" label is visible instead

  Scenario: prefers-reduced-motion disables the bottom-sheet drag animation
    Given the operating system reports prefers-reduced-motion: reduce
    When the human reviewer expands the bottom sheet
    Then the sheet snaps to the half-pane position with no CSS transition

  # ─── Regression — browser-tab path ───

  Scenario: Non-MCP-Apps browser-tab path — focus management uses existing patterns
    Given isMcpAppsHost() returns false
    When the review page loads in a browser tab
    Then the existing ReviewSidebar focus management is used
    And the iframe-specific aria-live regions are not rendered
