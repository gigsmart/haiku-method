Feature: Feedback file CRUD via haiku_feedback MCP tool and companions
  As the H-AI-K-U orchestrator and its agents
  I need to create, read, update, delete, and reject feedback files
  So that review findings persist as durable files on disk and survive session restarts

  Background:
    Given an active intent "universal-feedback-model" with stage "development"
    And the feedback directory ".haiku/intents/universal-feedback-model/stages/development/feedback/" exists
    And the existing Sentry tool has been renamed from "haiku_feedback" to "haiku_report"

  # ---------------------------------------------------------------------------
  # Happy Path: Create
  # ---------------------------------------------------------------------------

  Scenario: Create a feedback file via haiku_feedback
    When I call haiku_feedback with:
      | intent    | universal-feedback-model       |
      | stage     | development                    |
      | title     | Missing null guard in parser    |
      | body      | The JSON parser at line 42 does not handle null input. |
      | origin    | adversarial-review             |
      | author    | security-reviewer              |
    Then a feedback file "01-missing-null-guard-in-parser.md" is created in "stages/development/feedback/"
    And its frontmatter contains:
      | status      | pending              |
      | origin      | adversarial-review   |
      | author      | security-reviewer    |
      | author_type | agent                |
      | visit       | 0                    |
    And the body contains "The JSON parser at line 42 does not handle null input."
    And the tool returns the file path and identifier "FB-01"
    And gitCommitState is called once

  Scenario: Sequential numbering auto-increments from highest existing prefix
    Given feedback files already exist:
      | file                         |
      | 01-first-finding.md          |
      | 02-second-finding.md         |
    When I call haiku_feedback with title "Third finding" and stage "development"
    Then the created file is "03-third-finding.md"
    And its identifier is "FB-03"

  Scenario: Default author values when no author or origin specified
    When I call haiku_feedback with:
      | intent    | universal-feedback-model       |
      | stage     | development                    |
      | title     | Implicit defaults              |
      | body      | No author or origin supplied.  |
    Then a feedback file is created in "stages/development/feedback/"
    And its frontmatter contains:
      | author      | agent   |
      | author_type | agent   |
      | origin      | agent   |

  Scenario: Create feedback with optional source_ref
    When I call haiku_feedback with:
      | intent     | universal-feedback-model       |
      | stage      | development                    |
      | title      | Race condition in worker pool   |
      | body       | Workers can starve under high concurrency. |
      | origin     | external-pr                    |
      | source_ref | https://github.com/org/repo/pull/42 |
    Then the created file's frontmatter contains:
      | source_ref | https://github.com/org/repo/pull/42 |

  # ---------------------------------------------------------------------------
  # Happy Path: List
  # ---------------------------------------------------------------------------

  Scenario: List all feedback for a stage
    Given feedback files exist in "stages/development/feedback/":
      | file                        | status    |
      | 01-finding-a.md             | pending   |
      | 02-finding-b.md             | addressed |
      | 03-finding-c.md             | rejected  |
    When I call haiku_feedback_list with intent "universal-feedback-model" and stage "development"
    Then the result contains 3 items
    And each item includes id, title, body, status, origin, author, author_type, created_at, and visit

  Scenario: List feedback filtered by status
    Given feedback files exist in "stages/development/feedback/":
      | file                        | status    |
      | 01-finding-a.md             | pending   |
      | 02-finding-b.md             | addressed |
      | 03-finding-c.md             | pending   |
    When I call haiku_feedback_list with status filter "pending"
    Then the result contains 2 items
    And both items have status "pending"

  Scenario: List feedback across all stages when stage is omitted
    Given feedback files exist in both "stages/development/feedback/" and "stages/design/feedback/"
    When I call haiku_feedback_list with intent "universal-feedback-model" and no stage
    Then the result includes items from both "development" and "design" stages

  # ---------------------------------------------------------------------------
  # Happy Path: Update
  # ---------------------------------------------------------------------------

  Scenario: Update feedback status to addressed with addressed_by
    Given feedback file "01-finding-a.md" exists with status "pending" and author_type "agent"
    When I call haiku_feedback_update with:
      | intent      | universal-feedback-model |
      | stage       | development              |
      | feedback_id | 01                       |
      | status      | addressed                |
      | addressed_by| unit-03-fix-parser       |
    Then the file's frontmatter status is "addressed"
    And the file's frontmatter addressed_by is "unit-03-fix-parser"
    And gitCommitState is called once

  # ---------------------------------------------------------------------------
  # Happy Path: Reject
  # ---------------------------------------------------------------------------

  Scenario: Reject agent-authored feedback with a reason
    Given feedback file "01-false-positive.md" exists with status "pending" and author_type "agent"
    When I call haiku_feedback_reject with:
      | intent      | universal-feedback-model |
      | stage       | development              |
      | feedback_id | 01                       |
      | reason      | False positive — the null case is handled by the caller. |
    Then the file's frontmatter status is "rejected"
    And the rejection reason is appended to the body
    And gitCommitState is called once

  # ---------------------------------------------------------------------------
  # Happy Path: Delete
  # ---------------------------------------------------------------------------

  Scenario: Delete a closed agent-authored feedback file
    Given feedback file "01-stale-item.md" exists with status "closed" and author_type "agent"
    When I call haiku_feedback_delete with intent "universal-feedback-model", stage "development", feedback_id "01"
    Then the file "01-stale-item.md" no longer exists on disk
    And gitCommitState is called once

  # ---------------------------------------------------------------------------
  # Happy Path: Agent can address human-authored feedback
  # ---------------------------------------------------------------------------

  Scenario: Agent marks human-authored feedback as addressed
    Given feedback file "01-user-concern.md" exists with author_type "human" and status "pending"
    When I call haiku_feedback_update with:
      | intent      | universal-feedback-model |
      | stage       | development              |
      | feedback_id | 01                       |
      | status      | addressed                |
      | addressed_by| unit-04-layout-fix       |
    Then the file's frontmatter status is "addressed"
    And the file's frontmatter addressed_by is "unit-04-layout-fix"
    And gitCommitState is called once
    # Agents CAN mark human-authored feedback as addressed, just not closed

  # ---------------------------------------------------------------------------
  # Happy Path: Tool rename verification (US-09)
  # ---------------------------------------------------------------------------

  Scenario: haiku_feedback tool routes to feedback-file creation not Sentry
    When I call haiku_feedback with:
      | intent | universal-feedback-model                |
      | stage  | development                             |
      | title  | Verify routing                          |
      | body   | This should create a feedback file.     |
    Then the tool returns a feedback file path and identifier
    And no Sentry event is created
    And the file exists on disk in the feedback directory

  Scenario: haiku_report tool still submits to Sentry
    When I call haiku_report with a bug description
    Then the call routes to Sentry (not the feedback-file tool)
    And no feedback file is created on disk

  # ---------------------------------------------------------------------------
  # Error: Create
  # ---------------------------------------------------------------------------

  Scenario: Create fails when required field "title" is missing
    When I call haiku_feedback without a title
    Then the tool returns a validation error mentioning "title is required"
    And no feedback file is created

  Scenario: Create fails when required field "intent" is missing
    When I call haiku_feedback without an intent
    Then the tool returns a validation error mentioning "intent is required"

  Scenario: Create fails when required field "stage" is missing
    When I call haiku_feedback without a stage
    Then the tool returns a validation error mentioning "stage is required"

  Scenario: Create fails when origin is not a valid enum value
    When I call haiku_feedback with origin "made-up-origin"
    Then the tool returns a validation error mentioning invalid origin value

  # ---------------------------------------------------------------------------
  # Error: Update
  # ---------------------------------------------------------------------------

  Scenario: Agent cannot set status to "closed" on human-authored feedback
    Given feedback file "01-user-comment.md" exists with author_type "human" and status "pending"
    When I call haiku_feedback_update with feedback_id "01" and status "closed"
    Then the tool returns an error "agents cannot close human-authored feedback"
    And the file's status remains "pending"

  Scenario: Update fails for non-existent feedback ID
    When I call haiku_feedback_update with feedback_id "99" and status "addressed"
    Then the tool returns an error indicating feedback item "99" was not found

  Scenario: Update fails when setting status to an invalid value
    Given feedback file "01-finding.md" exists with status "pending"
    When I call haiku_feedback_update with feedback_id "01" and status "nonexistent-status"
    Then the tool returns a validation error for invalid status

  # ---------------------------------------------------------------------------
  # Error: Reject
  # ---------------------------------------------------------------------------

  Scenario: Reject fails on human-authored feedback
    Given feedback file "01-user-note.md" exists with author_type "human" and status "pending"
    When I call haiku_feedback_reject with feedback_id "01" and reason "Not relevant"
    Then the tool returns an error "agents cannot reject human-authored feedback"
    And the file's status remains "pending"

  Scenario: Reject fails when feedback is already closed
    Given feedback file "01-done.md" exists with status "closed" and author_type "agent"
    When I call haiku_feedback_reject with feedback_id "01" and reason "Stale"
    Then the tool returns an error indicating the item is already in a terminal state

  Scenario: Reject fails without a reason
    Given feedback file "01-finding.md" exists with status "pending" and author_type "agent"
    When I call haiku_feedback_reject with feedback_id "01" and no reason
    Then the tool returns a validation error mentioning "reason is required"

  # ---------------------------------------------------------------------------
  # Error: Delete
  # ---------------------------------------------------------------------------

  Scenario: Delete fails on a pending feedback item
    Given feedback file "01-open-finding.md" exists with status "pending"
    When I call haiku_feedback_delete with feedback_id "01"
    Then the tool returns an error "cannot delete feedback with status pending"
    And the file still exists on disk

  Scenario: Agent cannot delete human-authored feedback
    Given feedback file "01-user-comment.md" exists with author_type "human" and status "addressed"
    When I call haiku_feedback_delete with feedback_id "01"
    Then the tool returns an error "agents cannot delete human-authored feedback"
    And the file still exists on disk

  Scenario: Human cannot delete agent-authored feedback via MCP tool
    Given feedback file "01-agent-finding.md" exists with author_type "agent" and status "addressed"
    When I call haiku_feedback_delete with feedback_id "01" as author_type "human"
    Then the tool returns an error "human-authored deletions must go through the review UI"

  # ---------------------------------------------------------------------------
  # Edge Cases
  # ---------------------------------------------------------------------------

  Scenario: Feedback directory does not exist yet (first feedback for stage)
    Given the directory "stages/development/feedback/" does not exist
    When I call haiku_feedback with title "First finding ever" and stage "development"
    Then the directory "stages/development/feedback/" is created
    And feedback file "01-first-finding-ever.md" is created with correct frontmatter
    And the identifier is "FB-01"

  Scenario: Concurrent numbering with gap in sequence
    Given feedback files exist:
      | file                        |
      | 01-finding-a.md             |
      | 03-finding-c.md             |
    When I call haiku_feedback with title "New finding"
    Then the created file is "04-new-finding.md"
    And its identifier is "FB-04"
    # Numbering is based on highest existing prefix + 1, not gap-filling

  Scenario: Slug generation from title with special characters
    When I call haiku_feedback with title "SQL injection in user's <input> field!!!"
    Then the created file slug contains only lowercase alphanumeric characters and hyphens
    And the file is created successfully

  Scenario: List returns empty array when no feedback directory exists
    Given the directory "stages/inception/feedback/" does not exist
    When I call haiku_feedback_list with stage "inception"
    Then the result is an empty array
    And no error is thrown

  Scenario: List returns empty array when feedback directory is empty
    Given the directory "stages/development/feedback/" exists but contains no files
    When I call haiku_feedback_list with stage "development"
    Then the result is an empty array

  Scenario: Session restart does not lose feedback
    Given feedback file "01-critical-finding.md" was created in a previous session
    And the MCP server has restarted
    When I call haiku_feedback_list with stage "development"
    Then the result contains "01-critical-finding.md"
    And all frontmatter fields are intact
    # Feedback is files on disk — no in-memory state required

  Scenario: Visit field reflects current stage visits counter
    Given the stage "development" state.json has visits set to 2
    When I call haiku_feedback with title "Post-revisit finding"
    Then the created file's frontmatter visit is 2
