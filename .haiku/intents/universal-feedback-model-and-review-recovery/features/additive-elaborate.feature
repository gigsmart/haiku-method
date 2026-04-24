Feature: Additive elaborate mode when visits > 0
  As the H-AI-K-U orchestrator's elaborate phase handler
  I need to freeze completed units and require new units to declare closes: [FB-NN]
  So that revisit cycles produce targeted fixes linked to specific feedback items

  Background:
    Given an active intent "feedback-intent" with stage "development"
    And the stage's FSM phase is "elaborate"

  # ---------------------------------------------------------------------------
  # Happy Path: Normal elaborate (visits = 0)
  # ---------------------------------------------------------------------------

  Scenario: First-time elaborate operates in standard mode
    Given state.json visits is 0 (or absent)
    And no feedback files exist
    When the elaborate phase handler fires
    Then the returned action is the standard elaborate action (not "additive_elaborate")
    And the instruction does not mention "closes:" or frozen units
    And all units are editable

  # ---------------------------------------------------------------------------
  # Happy Path: Additive elaborate (visits > 0)
  # ---------------------------------------------------------------------------

  Scenario: Additive elaborate includes pending feedback in instruction
    Given state.json visits is 1
    And feedback files exist:
      | file                           | status  | title                        |
      | 01-null-guard-missing.md       | pending | Missing null guard in parser  |
      | 02-race-condition.md           | pending | Race condition in worker pool |
      | 03-resolved-already.md         | closed  | Old finding                  |
    When the elaborate phase handler fires
    Then the returned action is "additive_elaborate"
    And the action payload includes pending_feedback with 2 items
    And the instruction lists FB-01 "Missing null guard in parser" and FB-02 "Race condition in worker pool"
    And the instruction states that completed units are frozen and read-only
    And the instruction requires new units to declare "closes: [FB-NN]" in frontmatter

  Scenario: New unit correctly declares closes field referencing feedback IDs
    Given state.json visits is 1
    And pending feedback includes FB-01 and FB-02
    When the agent creates a new unit with frontmatter:
      """
      ---
      title: Fix null guard and race condition
      status: pending
      closes: [FB-01, FB-02]
      ---
      """
    Then DAG validation accepts the unit
    And the closes references are valid feedback IDs

  Scenario: New unit addresses a single feedback item
    Given state.json visits is 1
    And pending feedback includes FB-01
    When the agent creates a new unit with closes: [FB-01]
    Then the unit is valid
    And FB-01 is linked to this unit

  Scenario: Multiple new units each close different feedback items
    Given state.json visits is 1
    And pending feedback includes FB-01, FB-02, and FB-03
    When the agent creates:
      | unit                | closes        |
      | unit-04-fix-parser  | [FB-01]       |
      | unit-05-fix-race    | [FB-02, FB-03]|
    Then both units pass DAG validation
    And all 3 feedback items are covered by at least one unit

  # ---------------------------------------------------------------------------
  # Error Scenarios
  # ---------------------------------------------------------------------------

  Scenario: New unit without closes field fails validation in additive mode
    Given state.json visits is 1
    And pending feedback includes FB-01
    When the agent creates a new unit without a "closes:" field
    Then DAG validation rejects the unit
    And the error message states that units in additive elaborate mode must declare "closes: [FB-NN]"

  Scenario: New unit references a non-existent feedback ID
    Given state.json visits is 1
    And pending feedback includes only FB-01
    When the agent creates a new unit with closes: [FB-99]
    Then DAG validation rejects the unit
    And the error message states that "FB-99" does not match any existing feedback item

  Scenario: Agent attempts to edit a completed unit from a prior visit
    Given state.json visits is 1
    And completed units from visit 0:
      | unit                          | status    |
      | unit-01-initial-parser.md     | completed |
      | unit-02-initial-worker.md     | completed |
    When the agent attempts to modify "unit-01-initial-parser.md"
    Then the modification is rejected
    And the error message states that completed units are read-only in additive elaborate mode

  Scenario: New unit declares closes for already-resolved feedback
    Given state.json visits is 2
    And feedback files:
      | file                    | status    |
      | 01-finding.md           | closed    |
      | 02-new-finding.md       | pending   |
    When the agent creates a new unit with closes: [FB-01]
    Then DAG validation rejects the unit
    And the error states that FB-01 is already closed and cannot be referenced by new units

  # ---------------------------------------------------------------------------
  # Edge Cases
  # ---------------------------------------------------------------------------

  Scenario: Additive elaborate with zero pending feedback (all resolved between cycles)
    Given state.json visits is 1
    And all feedback files have status "closed" or "rejected"
    When the elaborate phase handler fires
    Then the handler detects visits > 0 but no pending feedback
    And it proceeds to the next phase (does not stay in elaborate)
    # If there's nothing to address, don't force the agent to elaborate empty work

  Scenario: Pending units from a prior additive cycle are still editable
    Given state.json visits is 2
    And units from visit 1 that are still in status "pending" (not yet executed):
      | unit                    | status  | closes  |
      | unit-04-fix-parser.md   | pending | [FB-01] |
    When the elaborate phase handler fires in additive mode
    Then unit-04-fix-parser.md is NOT frozen (it's pending, not completed)
    And the agent can edit it
    And the agent can also create additional new units

  Scenario: DAG validation accepts a mix of old completed and new closes units
    Given state.json visits is 1
    And completed units from visit 0:
      | unit                    | status    |
      | unit-01-setup.md        | completed |
      | unit-02-core.md         | completed |
    And pending feedback: FB-01
    When the agent creates unit-03-fix.md with closes: [FB-01] and depends_on: [unit-02-core]
    Then DAG validation accepts the unit
    And the dependency on a completed unit is valid (it's a read dependency, not an edit)

  Scenario: Elaborate instruction includes feedback body text for context
    Given state.json visits is 1
    And pending feedback:
      | id    | title                         | body                                            |
      | FB-01 | Missing null guard in parser   | The JSON parser at line 42 does not handle null. |
    When the elaborate phase handler fires
    Then the instruction includes both the title and body of FB-01
    # The agent needs the full context to write targeted units

  Scenario: Visits counter is very high (stress test)
    Given state.json visits is 10
    And 1 pending feedback file exists
    When the elaborate phase handler fires
    Then the returned action is "additive_elaborate"
    And the handler functions correctly regardless of visit count
    # No arbitrary cap on visits in v1

  Scenario: Session restart during additive elaborate preserves state
    Given state.json visits is 1 with pending feedback files on disk
    And the MCP server restarts mid-elaborate
    When the agent calls haiku_run_next after restart
    Then the elaborate handler reads visits from state.json
    And reads pending feedback from the feedback directory
    And returns "additive_elaborate" with the correct payload
    # All state is on disk — no in-memory dependency
