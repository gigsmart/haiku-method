Feature: Auto-revisit when pending feedback exists at review-to-gate transition
  As the H-AI-K-U FSM orchestrator
  I need to structurally block review-to-gate advancement when pending feedback exists
  So that review findings cannot be bypassed via context loss, session restart, or agent discretion

  Background:
    Given an active intent "feedback-intent" with stage "development"
    And the stage's FSM phase is "gate"
    And review subagents have completed and the parent agent calls haiku_run_next

  # ---------------------------------------------------------------------------
  # Happy Path: Pending feedback triggers rollback
  # ---------------------------------------------------------------------------

  Scenario: Gate handler rolls to elaborate when pending feedback exists
    Given feedback files in "stages/development/feedback/":
      | file                          | status  | author_type |
      | 01-null-guard-missing.md      | pending | agent       |
      | 02-race-condition.md          | pending | agent       |
    When the gate phase handler fires
    Then the FSM phase is set to "elaborate"
    And state.json visits is incremented from 0 to 1
    And the returned action is "feedback_revisit"
    And the action payload includes the count of pending items (2)
    And the action payload includes summaries of each pending feedback item
    And the instruction tells the agent to elaborate new units with "closes: [FB-NN]"

  Scenario: Gate handler proceeds normally when no pending feedback exists
    Given the feedback directory "stages/development/feedback/" contains:
      | file                          | status    |
      | 01-old-finding.md             | closed    |
      | 02-another-finding.md         | addressed |
    When the gate phase handler fires
    Then the FSM phase remains "gate"
    And normal gate logic executes (auto, ask, external, or compound)
    And no visits increment occurs

  Scenario: Gate handler proceeds when all feedback is resolved
    Given feedback files in "stages/development/feedback/":
      | file                          | status    |
      | 01-finding.md                 | addressed |
      | 02-finding.md                 | rejected  |
      | 03-finding.md                 | closed    |
    When the gate phase handler fires
    Then the FSM phase remains "gate"
    And normal gate logic proceeds

  Scenario: Mixed pending and resolved feedback still triggers rollback
    Given feedback files in "stages/development/feedback/":
      | file                          | status    |
      | 01-resolved.md                | closed    |
      | 02-addressed.md               | addressed |
      | 03-still-open.md              | pending   |
    When the gate phase handler fires
    Then the FSM phase is set to "elaborate"
    And state.json visits is incremented
    And the action payload lists only the 1 pending item

  Scenario: Visits counter increments on each successive rollback
    Given state.json visits is already 2
    And feedback files include 1 pending item
    When the gate phase handler fires
    Then state.json visits is incremented from 2 to 3
    And the returned action is "feedback_revisit"

  # ---------------------------------------------------------------------------
  # Structural enforcement: no agent bypass
  # ---------------------------------------------------------------------------

  Scenario: Agent cannot skip the feedback check by calling haiku_run_next repeatedly
    Given 1 pending feedback file exists
    When the agent calls haiku_run_next
    Then the gate handler checks pending feedback before any gate logic
    And the FSM rolls to elaborate
    When the agent calls haiku_run_next again without addressing feedback
    Then the elaborate handler fires (additive mode), not the gate handler
    # The FSM is at elaborate — the agent cannot reach gate without completing elaboration

  Scenario: Feedback check is the first operation in the gate handler
    Given 1 pending feedback file exists
    And the stage gate type is "auto"
    When the gate phase handler fires
    Then the pending feedback check runs before auto-advance logic
    And the FSM rolls to elaborate
    And auto-advance does NOT fire

  Scenario: Feedback check fires before "ask" gate type
    Given 1 pending feedback file exists
    And the stage gate type is "ask"
    When the gate phase handler fires
    Then the pending feedback check runs before opening the review UI
    And the FSM rolls to elaborate
    And no review UI session is opened

  Scenario: Feedback check fires before "external" gate type
    Given 1 pending feedback file exists
    And the stage gate type is "external"
    When the gate phase handler fires
    Then the pending feedback check runs before checking external review status
    And the FSM rolls to elaborate

  # ---------------------------------------------------------------------------
  # Error Scenarios
  # ---------------------------------------------------------------------------

  Scenario: Feedback directory read failure is handled gracefully
    Given the feedback directory exists but has a corrupted file "01-bad.md" with invalid frontmatter
    When the gate phase handler fires
    Then the handler logs a warning about the unparseable file
    And the corrupted file is skipped (not counted as pending)
    And the remaining valid files are evaluated normally

  Scenario: Missing feedback directory is treated as zero pending items
    Given the directory "stages/development/feedback/" does not exist
    When the gate phase handler fires
    Then the pending feedback count is 0
    And normal gate logic proceeds
    And no error is thrown

  Scenario: Feedback file with missing status field defaults to pending
    Given feedback file "01-no-status.md" exists with no status field in frontmatter
    When the gate phase handler fires
    Then the file is treated as status "pending"
    And the FSM rolls to elaborate

  # ---------------------------------------------------------------------------
  # Edge Cases
  # ---------------------------------------------------------------------------

  Scenario: Human-authored pending feedback blocks advancement even if agent wants to proceed
    Given feedback file "01-user-concern.md" exists with status "pending" and author_type "human"
    When the gate phase handler fires
    Then the FSM rolls to elaborate
    And the agent cannot mark the item as "closed" (author-based guard)
    And the only way to advance is for the human to close or reject the item via the review UI

  Scenario: Rollback from gate preserves all existing stage state
    Given state.json contains:
      | field             | value              |
      | stage             | development        |
      | status            | active             |
      | phase             | gate               |
      | started_at        | 2026-04-15T10:00Z  |
      | elaboration_turns | 3                  |
    And 1 pending feedback file exists
    When the gate phase handler rolls to elaborate
    Then state.json phase is "elaborate"
    And state.json visits is 1
    And state.json started_at remains "2026-04-15T10:00Z"
    And state.json status remains "active"
    And state.json elaboration_turns remains 3

  Scenario: Session restart between review-agent completion and haiku_run_next
    Given review subagents wrote 3 feedback files with status "pending"
    And the MCP server restarts before the parent agent calls haiku_run_next
    When the parent agent calls haiku_run_next after restart
    Then the gate handler reads the 3 pending feedback files from disk
    And the FSM rolls to elaborate
    # This is the core durability guarantee — findings survive session loss

  Scenario: Context compaction removes agent memory of findings but files persist
    Given review subagents wrote 2 feedback files with status "pending"
    And the parent agent's context window compacts, losing all review findings
    When the parent agent calls haiku_run_next
    Then the gate handler reads the 2 pending feedback files from disk
    And the FSM rolls to elaborate with the pending items in the instruction payload
    # The agent receives the findings again via the instruction builder, not from memory

  Scenario: Gate fires immediately after stage enters review for the first time
    Given the stage just completed its first review phase (visits is 0)
    And review subagents wrote 0 feedback files
    When the gate phase handler fires
    Then visits remains 0
    And normal gate logic proceeds
    # No unnecessary rollback when review agents find nothing
