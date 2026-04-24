Feature: haiku_revisit with optional reasons parameter
  As an agent or parent orchestrator
  I need haiku_revisit to accept structured reasons that become feedback files before rollback
  So that revisit motivation is captured durably and enters the standard feedback lifecycle

  Background:
    Given an active intent "revisit-intent" with stage "development"
    And the stage's FSM phase is "execute"
    And the feedback directory ".haiku/intents/revisit-intent/stages/development/feedback/" may or may not exist

  # ---------------------------------------------------------------------------
  # Happy Path: Reasons provided — feedback files created, then rollback
  # ---------------------------------------------------------------------------

  Scenario: Single reason creates one feedback file and rolls back
    When I call haiku_revisit with:
      | intent  | revisit-intent                                     |
      | reasons | [{ title: "Null check missing", body: "handleSubmit at line 42 dereferences a potentially null ref" }] |
    Then a feedback file "01-null-check-missing.md" is created in "stages/development/feedback/"
    And its frontmatter contains:
      | status      | pending       |
      | origin      | agent         |
      | author      | parent-agent  |
      | author_type | agent         |
    And the feedback file body contains "handleSubmit at line 42 dereferences a potentially null ref"
    And the feedback file is committed to git BEFORE the phase rollback
    And the FSM phase is set to "elaborate"
    And state.json visits is incremented by 1
    And the returned action indicates a revisit with 1 pending feedback item

  Scenario: Multiple reasons create multiple feedback files and roll back
    When I call haiku_revisit with:
      | intent  | revisit-intent |
      | reasons | [{ title: "Null check missing", body: "Parser line 42" }, { title: "Race condition", body: "Worker pool starves under concurrency" }] |
    Then 2 feedback files are created in "stages/development/feedback/"
    And the files are "01-null-check-missing.md" and "02-race-condition.md"
    And each file has status "pending", origin "agent", author "parent-agent", author_type "agent"
    And the FSM phase is set to "elaborate"
    And state.json visits is incremented by 1

  Scenario: Reasons-created feedback files have sequential numbering after existing files
    Given feedback files already exist in "stages/development/feedback/":
      | file                     |
      | 01-prior-finding.md      |
      | 02-another-finding.md    |
    When I call haiku_revisit with:
      | intent  | revisit-intent |
      | reasons | [{ title: "New issue", body: "Details here" }] |
    Then the created file is "03-new-issue.md"
    And its identifier is "FB-03"

  Scenario: Revisit with reasons when stage already has visits > 0
    Given state.json visits is already 2
    When I call haiku_revisit with:
      | intent  | revisit-intent |
      | reasons | [{ title: "Recurring issue", body: "Still broken after two revisits" }] |
    Then the feedback file's frontmatter visit is 2
    And state.json visits is incremented from 2 to 3
    And the FSM phase is set to "elaborate"

  Scenario: Revisit with reasons targeting a specific earlier stage
    Given the intent has stages [inception, design, development]
    And the active stage is "development"
    When I call haiku_revisit with:
      | intent  | revisit-intent                                     |
      | stage   | design                                              |
      | reasons | [{ title: "Missing wireframe", body: "The login flow wireframe was never produced" }] |
    Then a feedback file is created in "stages/design/feedback/"
    And the FSM jumps back to stage "design" at phase "elaborate"

  # ---------------------------------------------------------------------------
  # Stopgap: No reasons provided — FSM does NOT roll back
  # ---------------------------------------------------------------------------

  Scenario: Revisit without reasons returns a stopgap action
    When I call haiku_revisit with:
      | intent  | revisit-intent |
    Then the FSM phase remains "execute"
    And state.json visits is unchanged
    And no feedback files are created
    And the returned action is "stopgap"
    And the action message instructs the agent to collect structured reasons and re-call with reasons

  Scenario: Revisit with reasons omitted (only intent and stage provided)
    When I call haiku_revisit with:
      | intent  | revisit-intent |
      | stage   | development    |
    Then the FSM phase remains "execute"
    And the returned action is "stopgap"
    And the action message includes the expected reasons format: [{ title, body }, ...]

  # ---------------------------------------------------------------------------
  # Feedback gate integration
  # ---------------------------------------------------------------------------

  Scenario: Reasons-created feedback blocks gate advancement on next review cycle
    Given haiku_revisit was previously called with reasons creating 2 feedback files (FB-01, FB-02)
    And the stage has progressed through elaborate -> execute -> review
    And the stage is now at phase "gate"
    When haiku_run_next fires
    Then the pending-feedback check detects FB-01 and FB-02 as pending
    And the FSM rolls back to elaborate (standard auto-revisit behavior)
    And the returned action is "feedback_revisit" with count 2

  Scenario: Reasons-created feedback that was addressed does not block the gate
    Given haiku_revisit was previously called with reasons creating 2 feedback files (FB-01, FB-02)
    And both feedback files have been updated to status "addressed"
    And the stage is now at phase "gate"
    When haiku_run_next fires
    Then the pending-feedback check finds 0 pending items
    And normal gate logic proceeds

  # ---------------------------------------------------------------------------
  # Error Scenarios
  # ---------------------------------------------------------------------------

  Scenario: Empty reasons array is rejected
    When I call haiku_revisit with:
      | intent  | revisit-intent |
      | reasons | []             |
    Then the tool returns a validation error "reasons array must contain at least one item"
    And no feedback files are created
    And the FSM phase remains "execute"
    And state.json is unchanged

  Scenario: Reason with empty title is rejected
    When I call haiku_revisit with:
      | intent  | revisit-intent |
      | reasons | [{ title: "", body: "Some detail about the issue" }] |
    Then the tool returns a validation error "each reason must have a non-empty title"
    And no feedback files are created
    And the FSM phase remains "execute"
    And state.json is unchanged

  Scenario: Reason with missing body is rejected
    When I call haiku_revisit with:
      | intent  | revisit-intent |
      | reasons | [{ title: "Valid title" }] |
    Then the tool returns a validation error "each reason must have a non-empty body"
    And no feedback files are created

  Scenario: Reason with missing title is rejected
    When I call haiku_revisit with:
      | intent  | revisit-intent |
      | reasons | [{ body: "Some detail" }] |
    Then the tool returns a validation error "each reason must have a non-empty title"
    And no feedback files are created

  # ---------------------------------------------------------------------------
  # Edge Cases
  # ---------------------------------------------------------------------------

  Scenario: Feedback directory auto-created when first revisit-with-reasons fires
    Given the directory "stages/development/feedback/" does not exist
    When I call haiku_revisit with:
      | intent  | revisit-intent |
      | reasons | [{ title: "First ever feedback", body: "Details" }] |
    Then the directory "stages/development/feedback/" is created
    And feedback file "01-first-ever-feedback.md" exists with correct frontmatter

  Scenario: Git commit failure does not prevent feedback file creation
    Given the git working directory has a lock file (.git/index.lock)
    When I call haiku_revisit with:
      | intent  | revisit-intent |
      | reasons | [{ title: "Issue found", body: "Details" }] |
    Then the feedback file is written to disk
    And the tool returns a warning about the git commit failure
    And the FSM still rolls back to elaborate
    # The feedback file will be included in the next successful commit

  Scenario: Revisit with reasons on a completed stage still writes feedback
    Given stage "development" has state.json status "completed"
    When I call haiku_revisit with:
      | intent  | revisit-intent |
      | stage   | development    |
      | reasons | [{ title: "Late finding", body: "Found after stage completed" }] |
    Then feedback files are created in "stages/development/feedback/"
    And the stage status is reset to "active" as part of the revisit

  # ---------------------------------------------------------------------------
  # Tool description
  # ---------------------------------------------------------------------------

  Scenario: haiku_revisit tool description documents the reasons preference
    Given the MCP tool list is queried
    When the haiku_revisit tool definition is inspected
    Then the description mentions that passing reasons is preferred
    And the reasons parameter describes title (string, required) and body (string, required)
    And the description states that without reasons the tool returns a stopgap instead of rolling back
