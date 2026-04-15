Feature: Workspace handshake via roots capability
  Before any .haiku/ directory write, the server inspects the MCP roots capability
  to determine the workspace path. When roots are absent or empty, a requestHostWorkspace()
  indirection fires to prompt the human reviewer to open a folder. When multiple roots
  are present, an elicitInput pick is presented. The selection is cached for the entire
  session. This replaces the CLAUDE_CODE_WORKSPACE_HOST_PATHS env-var pattern entirely.

  Background:
    Given the H·AI·K·U MCP server has started
    And the initialize handshake has completed
    And no environment variable CLAUDE_CODE_WORKSPACE_HOST_PATHS is set

  # ─── Happy paths ───

  Scenario: Host advertises exactly one root — auto-selected with no prompt
    Given the MCP client advertised "roots" capability with one workspace folder "/workspace/my-project"
    And hostSupportsMcpApps() returns true
    When the agent attempts to create a .haiku/ directory
    Then getMcpHostWorkspacePaths() returns ["/workspace/my-project"]
    And the workspace "/workspace/my-project" is auto-selected without elicitInput
    And requestHostWorkspace() is never called
    And the .haiku/ write proceeds under "/workspace/my-project"

  Scenario: Host advertises multiple roots — human reviewer picks via elicitInput
    Given the MCP client advertised "roots" capability with two workspace folders
      | path                          |
      | /workspace/project-a          |
      | /workspace/project-b          |
    And hostSupportsMcpApps() returns true
    When the agent attempts to create a .haiku/ directory
    Then getMcpHostWorkspacePaths() returns both paths
    And elicitInput is called presenting both workspace paths to the human reviewer
    And the .haiku/ write proceeds under the path the human reviewer selected
    And the selection is cached for the rest of the session

  # ─── Zero-roots scenarios ───

  Scenario: Host advertises roots capability with zero entries — handshake fires before any write
    Given the MCP client advertised "roots" capability with an empty list
    And hostSupportsMcpApps() returns true
    When the agent attempts to create a .haiku/ directory
    Then requestHostWorkspace() is called before any .haiku/ write
    And no .haiku/ directory write occurs before requestHostWorkspace() resolves
    And after the human reviewer opens a folder the handshake resolves with the new root
    And the .haiku/ write proceeds under the newly opened folder

  Scenario: Host does not advertise roots capability at all — handshake fires before any write
    Given the MCP client sent an initialize request without a "roots" capability
    And hostSupportsMcpApps() returns true
    When the agent attempts to create a .haiku/ directory
    Then getMcpHostWorkspacePaths() returns an empty array
    And requestHostWorkspace() is called before any .haiku/ write

  # ─── Regression — non-MCP-Apps host ───

  Scenario: Non-MCP-Apps host — workspace resolved via filesystem, no handshake
    Given hostSupportsMcpApps() returns false
    When the agent resolves the haiku root
    Then getMcpHostWorkspacePaths() is not called
    And requestHostWorkspace() is never called
    And the existing findHaikuRoot filesystem walk is used instead

  # ─── Error scenarios ───

  Scenario: requestHostWorkspace() times out waiting for the human reviewer to open a folder
    Given the MCP client advertised "roots" capability with an empty list
    And hostSupportsMcpApps() returns true
    When requestHostWorkspace() is called and the human reviewer does not respond within the timeout
    Then the agent surfaces a descriptive error to the Cowork host
    And no .haiku/ write occurs

  Scenario: Cached workspace selection is reused across multiple .haiku/ writes in the same session
    Given the human reviewer previously selected "/workspace/my-project" via elicitInput
    When the agent performs a second .haiku/ write in the same session
    Then requestHostWorkspace() is not called again
    And elicitInput is not called again
    And the write proceeds under "/workspace/my-project"
