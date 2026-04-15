Feature: Review SPA host-bridge runtime detection
  The bundled review SPA contains a host-bridge.ts module that probes at module-load
  time whether it is running inside an MCP Apps host iframe or a regular browser tab.
  The probe uses two gates: window.parent !== window AND new App({...}) succeeds. Both
  must pass for MCP Apps mode to be selected. The result is cached for the entire
  connection lifetime and cannot change. All session transport calls (submitDecision,
  submitAnswers, submitDesignDirection, getSession) are routed through the bridge.

  Background:
    Given the review SPA bundle has been loaded inside an iframe or browser context
    And the host-bridge.ts module is initializing

  # ─── Happy path — MCP Apps mode ───

  Scenario: Both detection gates pass — MCP Apps mode selected and cached
    Given window.parent is a distinct object from window
    And constructing a new App instance succeeds without throwing
    When isMcpAppsHost() is called
    Then it returns true
    And subsequent calls to isMcpAppsHost() return true without re-running the probe
    And the console logs "isMcpAppsHost() == true"

  Scenario: MCP Apps mode — submitDecision routes through App.callServerTool
    Given isMcpAppsHost() returns true
    When the human reviewer submits a decision
    Then submitDecision calls App.callServerTool with the review payload
    And the existing fetch() or WebSocket path is not invoked

  Scenario: MCP Apps mode — getSession hydrates from updateModelContext, not HTTP fetch
    Given isMcpAppsHost() returns true
    When the SPA initializes the session
    Then session data is received via App ontoolresult or updateModelContext
    And no GET /api/session/:id HTTP request is made

  # ─── Browser mode — fallback ───

  Scenario: window.parent equals window — browser mode selected
    Given window.parent is the same object as window
    When isMcpAppsHost() is called
    Then it returns false
    And the console logs "isMcpAppsHost() == false"
    And all transport calls route through the existing WebSocket and fetch paths

  Scenario: App constructor throws — browser mode selected despite nested window
    Given window.parent is a distinct object from window
    And constructing a new App instance throws an error
    When isMcpAppsHost() is called
    Then it returns false
    And the App constructor error is caught and not re-thrown
    And the console logs "isMcpAppsHost() == false"

  # ─── Cache behavior ───

  Scenario: Detection result is cached for the connection lifetime
    Given isMcpAppsHost() was called once and returned true
    When isMcpAppsHost() is called nine more times
    Then the window.parent comparison and App constructor are each invoked exactly once total
    And all ten calls return the same value

  # ─── Regression — browser-tab path unchanged ───

  Scenario: Browser mode — submitDecision falls back to WebSocket first, HTTP POST second
    Given isMcpAppsHost() returns false
    And a WebSocket connection to ws://localhost/ws/session/:id is open
    When the human reviewer submits a decision
    Then submitDecision sends via the open WebSocket
    And App.callServerTool is not called

  Scenario: Browser mode — WebSocket closed, submitDecision falls back to HTTP POST
    Given isMcpAppsHost() returns false
    And the WebSocket connection to the review server has closed
    When the human reviewer submits a decision
    Then submitDecision sends a POST to /api/session/:id/decision
    And App.callServerTool is not called

  # ─── Error scenarios ───

  Scenario: App instance constructed but callServerTool rejects on first use
    Given isMcpAppsHost() returned true and was cached
    When App.callServerTool rejects with a network error during submitDecision
    Then the error propagates to the useSession hook
    And the SPA renders the NegotiationErrorScreen with the error detail

  Scenario: Probe runs during bundle load but DOM is not yet ready
    Given the review SPA is executing in a sandboxed iframe with deferred DOM
    When host-bridge.ts initializes before DOMContentLoaded fires
    Then isMcpAppsHost() defers the App constructor attempt until the guard condition is met
    And the detection result is still cached exactly once
