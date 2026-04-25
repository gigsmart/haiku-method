Feature: Intent completion keys off per-stage state.json status
  As the enforce-iteration hook
  I need to determine intent completion by checking each declared stage's state.json status
  So that intents with unstarted stages are not prematurely marked completed

  Background:
    Given an intent "multi-stage-app" declared with stages:
      | stage       |
      | inception   |
      | design      |
      | development |
      | security    |

  # ---------------------------------------------------------------------------
  # Happy Path: Correct completion detection
  # ---------------------------------------------------------------------------

  Scenario: Intent is NOT completed when only one stage is done
    Given stage statuses are:
      | stage       | state.json status |
      | inception   | completed         |
      | design      | (no state.json)   |
      | development | (no state.json)   |
      | security    | (no state.json)   |
    When the enforce-iteration hook runs
    Then intent.status is NOT set to "completed"
    And the hook recognizes 3 stages are not yet completed

  Scenario: Intent IS completed when all declared stages are completed
    Given stage statuses are:
      | stage       | state.json status |
      | inception   | completed         |
      | design      | completed         |
      | development | completed         |
      | security    | completed         |
    When the enforce-iteration hook runs
    Then intent.status is set to "completed"

  Scenario: Intent is NOT completed when one stage is still active
    Given stage statuses are:
      | stage       | state.json status |
      | inception   | completed         |
      | design      | completed         |
      | development | active            |
      | security    | (no state.json)   |
    When the enforce-iteration hook runs
    Then intent.status is NOT set to "completed"

  Scenario: Intent is NOT completed when a stage has not been started
    Given stage statuses are:
      | stage       | state.json status |
      | inception   | completed         |
      | design      | completed         |
      | development | completed         |
      | security    | (no state.json)   |
    When the enforce-iteration hook runs
    Then intent.status is NOT set to "completed"
    And the hook treats the missing state.json as "not started"

  # ---------------------------------------------------------------------------
  # Regression: The specific bug being fixed
  # ---------------------------------------------------------------------------

  Scenario: Bug reproduction — globbing unit files incorrectly marks intent completed
    Given stage "inception" has 3 completed unit files in "stages/inception/units/"
    And stage "inception" state.json status is "completed"
    And stages "design", "development", "security" have no unit files and no state.json
    When the enforce-iteration hook runs using the NEW per-stage status check
    Then intent.status is NOT set to "completed"
    # The old code would glob unit files, find 3 completed out of 3 total,
    # and incorrectly conclude the intent was done.

  Scenario: Bug reproduction — the cowork-mcp-apps-integration case
    Given an intent with stages ["inception", "design", "development"]
    And only "inception" has been elaborated with 2 units, both completed
    And "inception" state.json status is "completed"
    And "design" and "development" have no state.json files
    When the enforce-iteration hook runs
    Then intent.status is NOT set to "completed"
    And the intent remains active for the next stage to begin

  # ---------------------------------------------------------------------------
  # Error Scenarios
  # ---------------------------------------------------------------------------

  Scenario: Corrupted state.json in one stage does not crash the hook
    Given stage statuses are:
      | stage       | state.json status    |
      | inception   | completed            |
      | design      | (corrupted JSON)     |
      | development | active               |
    When the enforce-iteration hook runs
    Then the hook logs a warning about the corrupted state.json in "design"
    And the corrupted stage is treated as "not completed"
    And intent.status is NOT set to "completed"
    And the hook does not throw an unhandled exception

  Scenario: Intent frontmatter has no stages array
    Given the intent.md frontmatter does not declare a "stages:" array
    When the enforce-iteration hook runs
    Then the hook falls back to discovering stage directories on disk
    And completion is evaluated against the discovered stages

  Scenario: Declared stage has no directory on disk
    Given the intent declares stage "security" but no "stages/security/" directory exists
    When the enforce-iteration hook runs
    Then stage "security" is treated as "not completed"
    And intent.status is NOT set to "completed"
    And no error is thrown for the missing directory

  # ---------------------------------------------------------------------------
  # Edge Cases
  # ---------------------------------------------------------------------------

  Scenario: Single-stage intent completes correctly
    Given an intent with stages ["development"]
    And "development" state.json status is "completed"
    When the enforce-iteration hook runs
    Then intent.status is set to "completed"

  Scenario: Stage with visits > 0 that reaches completed status
    Given stage "development" state.json contains:
      | field   | value     |
      | status  | completed |
      | visits  | 3         |
    And all other stages are also "completed"
    When the enforce-iteration hook runs
    Then intent.status is set to "completed"
    # visits counter is irrelevant to completion — only status matters

  Scenario: Stage status "blocked" does not count as completed
    Given stage "development" state.json status is "blocked"
    When the enforce-iteration hook runs
    Then intent.status is NOT set to "completed"

  Scenario: findUnitFiles still works for other consumers
    Given the findUnitFiles function in utils.ts is unchanged
    When another hook or tool calls findUnitFiles for the current stage
    Then it returns unit files for that stage as before
    # The fix changes enforce-iteration only — findUnitFiles is not removed

  Scenario: readStageStatuses returns correct map for all stages
    Given stage statuses are:
      | stage       | state.json status |
      | inception   | completed         |
      | design      | active            |
      | development | (no state.json)   |
    When readStageStatuses is called for the intent
    Then the returned map is:
      | stage       | status        |
      | inception   | completed     |
      | design      | active        |
      | development | (not present) |

  Scenario: Empty intent with no stages at all
    Given an intent with stages []
    When the enforce-iteration hook runs
    Then intent.status is set to "completed"
    # Vacuously true — all zero stages are completed
