Feature: MCP Apps capability negotiation
  During the MCP initialize handshake the server advertises experimental.apps support.
  The client echoes back its own capability set. The server reads getClientCapabilities()
  to determine which review transport to use — MCP Apps iframe path or the existing
  HTTP+tunnel path. Environment variables are never consulted for transport selection;
  capability negotiation is the sole signal. A missing or stale capability must surface
  a clear error rather than silently falling through to a broken state.

  Background:
    Given the H·AI·K·U MCP server has started
    And the server capabilities block includes "experimental.apps: {}"
    And no environment variable CLAUDE_CODE_IS_COWORK is set

  # ─── Happy path ───

  Scenario: Client supports MCP Apps — server routes to iframe path
    Given the MCP client sends an initialize request advertising "experimental.apps: {}"
    When the initialize handshake completes
    Then getClientCapabilities() returns an object containing "experimental.apps"
    And hostSupportsMcpApps() returns true
    And the agent uses the MCP Apps review transport for gate_review actions
    And startHttpServer is never called
    And openTunnel is never called
    And openBrowser is never called

  # ─── Regression — non-MCP-Apps host ───

  Scenario: Client does not advertise MCP Apps capability — server falls through to HTTP path
    Given the MCP client sends an initialize request without "experimental.apps" in capabilities
    When the initialize handshake completes
    Then getClientCapabilities() returns an object without "experimental.apps"
    And hostSupportsMcpApps() returns false
    And the agent uses the HTTP+tunnel review transport for gate_review actions
    And the tool result for gate_review does not contain "_meta.ui.resourceUri"

  # ─── Error scenarios ───

  Scenario: Capability advertised during handshake but App.callServerTool fails at runtime
    Given the MCP client advertised "experimental.apps" during initialize
    And hostSupportsMcpApps() returned true and the session was opened
    When App.callServerTool raises a runtime error during the review session
    Then the SPA renders the NegotiationErrorScreen with error code "NEGOTIATION_FAILED"
    And a retry button is visible
    And the agent does not advance the FSM until the session resolves

  Scenario: hostSupportsMcpApps() caches the result — repeated calls do not re-query capabilities
    Given the MCP client advertised "experimental.apps" during initialize
    When hostSupportsMcpApps() is called ten times during the session
    Then getClientCapabilities() is invoked exactly once
    And all ten calls return the same boolean value

  Scenario: CLAUDE_CODE_IS_COWORK env var is set but client did not advertise capability
    Given the environment variable CLAUDE_CODE_IS_COWORK is set to "1"
    And the MCP client sends an initialize request without "experimental.apps"
    When the initialize handshake completes
    Then hostSupportsMcpApps() returns false
    And the agent uses the HTTP+tunnel review transport
    And no env-var-based branching logic is executed

  Scenario Outline: Client echoes partial or malformed capability — server falls through safely
    Given the MCP client sends an initialize request with capabilities "<capability_value>"
    When the initialize handshake completes
    Then hostSupportsMcpApps() returns <expected_result>
    And the server does not crash or throw an unhandled exception

    Examples:
      | capability_value             | expected_result |
      | {}                           | false           |
      | { experimental: {} }         | false           |
      | { experimental: { apps: 1 }} | true            |
      | null                         | false           |
