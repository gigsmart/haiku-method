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

  # ─── ResizeObserver-driven breakpoints (V3-02) ───

  Scenario: Breakpoint is determined by ResizeObserver, not window.innerWidth or CSS media queries
    Given the review SPA is mounted inside a Cowork host iframe
    When the iframe root element is resized to 400 pixels wide
    Then the layout class changes to "narrow" driven by the ResizeObserver callback
    And window.innerWidth is not read during breakpoint detection
    And no @media CSS rule is used as the breakpoint signal

  # ─── Drag gesture thresholds (V3-07) ───

  Scenario: Drag less than 24px minimum distance does not trigger a snap
    Given the bottom sheet is in the collapsed state
    When the human reviewer drags the handle upward by 20 pixels
    Then the bottom sheet remains in the collapsed state
    And no snap transition fires

  Scenario: Fling above 0.5px/ms velocity threshold triggers a snap
    Given the bottom sheet is in the collapsed state
    When the human reviewer releases the drag handle with a velocity of 0.6px/ms upward
    Then the bottom sheet snaps to the half-pane position
    And no full-pane snap position is reached

  # ─── Decision panel emphasis styling (V3-08) ───

  Scenario: Decision panel renders with teal top border, drop shadow, and teal Approve button
    Given the bottom sheet is rendered at narrow breakpoint
    When the decision panel is inspected
    Then the top border of the bottom sheet uses the teal-500 colour
    And a drop shadow of "0 -8px 24px rgba(0,0,0,0.4)" is applied above the sheet
    And the Approve button has a teal-500 background colour

  # ─── Colour contrast (GR-06) ───

  Scenario: Body text meets 4.5:1 contrast and UI components meet 3:1 against iframe background
    Given the review SPA is rendered with the stone-950 background
    When an axe-core colour contrast audit runs against the rendered SPA
    Then zero colour-contrast violations are reported
    And HostBridgeStatus state colours meet at least 4.5:1 against stone-950

  # ─── Programmatic labels on form controls (GR-07) ───

  Scenario: Decision form and question form regions carry aria-labelledby
    Given the decision bottom sheet and QuestionPage are rendered
    When the DOM is inspected for form region labelling
    Then the decision form is wrapped in an element with aria-labelledby pointing to a hidden heading
    And the QuestionPage form region has aria-labelledby
    And the DesignPicker form region has aria-labelledby

  # ─── No raw hex values in component styles (GR-09) ───

  Scenario: No raw hex colour values appear in component inline styles
    Given the review SPA is rendered in a Cowork host iframe
    When all inline style attributes in the DOM are inspected
    Then no attribute value contains a raw hex colour pattern
    And all colours are expressed via named Tailwind classes or iframe CSS custom properties

  # ─── No position:fixed trapping host scroll (GR-10) ───

  Scenario: Bottom sheet uses position:sticky within the iframe — host scroll is unaffected
    Given the review SPA is mounted inside a 600px tall iframe
    When the human reviewer scrolls the iframe content
    Then the bottom sheet sticks within the iframe scroll container
    And the host window.scrollY does not change
    And no element inside the iframe uses position:fixed

  # ─── Keyboard shortcuts visible at all breakpoints (SC-02) ───

  Scenario Outline: Keyboard shortcuts are visible in the screen footer at each breakpoint
    Given the "<screen>" review screen is rendered
    And the iframe width is "<width>" pixels
    When the screen footer is inspected
    Then at least one <kbd> element is visible in the footer

    Examples:
      | screen           | width |
      | IntentReview     | 400   |
      | UnitReview       | 600   |
      | QuestionPage     | 900   |
      | DesignPicker     | 400   |
      | AnnotationCanvas | 600   |

# Audit log
# Added 2026-04-15 during product/unit-02-finalize-feature-files review.
# Gaps addressed:
#   V3-02 — ResizeObserver not window.innerWidth had no scenario.
#            Added: "Breakpoint is determined by ResizeObserver, not window.innerWidth".
#   V3-07 — Drag gesture thresholds (24px min, 0.5px/ms fling, no full-pane) had no scenario.
#            Added: "Drag < 24px does not trigger snap" and "Fling > 0.5px/ms triggers snap".
#   V3-08 — Decision panel emphasis styling had no scenario.
#            Added: "Decision panel renders with teal top border, drop shadow, teal Approve button".
#   GR-06 — Colour contrast assertion had no scenario.
#            Added: "Body text meets 4.5:1 contrast and UI components meet 3:1".
#   GR-07 — aria-labelledby on form controls had no scenario.
#            Added: "Decision form and question form regions carry aria-labelledby".
#   GR-09 — No raw hex values in component styles had no scenario.
#            Added: "No raw hex colour values appear in component inline styles".
#   GR-10 — position:fixed not trapping host scroll had no scenario.
#            Added: "Bottom sheet uses position:sticky — host scroll is unaffected".
#   SC-02 — Keyboard shortcuts in footer at all breakpoints had no scenario.
#            Added Scenario Outline for all five review screens × representative breakpoints.
