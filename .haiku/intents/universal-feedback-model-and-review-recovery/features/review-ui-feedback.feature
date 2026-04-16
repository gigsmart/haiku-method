Feature: Review UI changes_requested writes feedback files and inline annotations persist via CRUD
  As the H-AI-K-U review app and orchestrator
  I need review UI comments and annotations to become durable feedback files
  So that user review feedback survives session restarts and drives the structural revisit cycle

  Background:
    Given an active intent "feedback-intent" with stage "development"
    And the stage is at the review gate (review UI is open)
    And the review app is served at the HTTP server

  # ---------------------------------------------------------------------------
  # Happy Path: Request Changes writes feedback files
  # ---------------------------------------------------------------------------

  Scenario: Single inline comment becomes a feedback file on Request Changes
    Given the reviewer selects text in a unit output and creates an inline comment:
      | text     | "This function lacks error handling" |
      | location | unit-02-parser.md, line 15           |
    When the reviewer clicks "Request Changes"
    Then a feedback file is created at "stages/development/feedback/01-*.md"
    And its frontmatter contains:
      | status      | pending      |
      | origin      | user-visual  |
      | author      | user         |
      | author_type | human        |
    And its body contains "This function lacks error handling"
    And gitCommitState is called for the feedback file

  Scenario: Multiple comments become individual feedback files
    Given the reviewer creates 3 inline comments and 1 general feedback note
    When the reviewer clicks "Request Changes"
    Then 4 feedback files are created in "stages/development/feedback/"
    And they are numbered sequentially (01, 02, 03, 04)
    And each has origin "user-visual" and author_type "human"
    And the general feedback note also becomes a feedback file (not just a string)

  Scenario: Pin annotation on an image becomes a feedback file
    Given the reviewer drops a pin annotation on an output image at coordinates (120, 340)
    And adds the comment "Logo is misaligned"
    When the reviewer clicks "Request Changes"
    Then a feedback file is created with:
      | origin      | user-visual        |
      | author_type | human              |
      | body        | Logo is misaligned |
    And the source_ref includes the annotation coordinates or reference ID

  Scenario: Feedback files are written server-side before the decision resolves
    Given the reviewer has 2 comments
    When the reviewer clicks "Request Changes"
    Then the review app calls POST /api/feedback/{intent}/{stage} for each comment
    And the server writes feedback files to disk
    And then the decision submission resolves with "changes_requested"
    And the orchestrator's _openReviewAndWait handler receives the decision
    # Feedback files exist BEFORE the orchestrator processes the decision

  Scenario: Orchestrator does not inline annotations in instruction after feedback-file integration
    Given 2 feedback files were written from the review UI
    When the orchestrator builds the changes_requested instruction
    Then the instruction references the feedback files (not inline annotation text)
    And the instruction directs the agent to call haiku_feedback_list to see pending items

  # ---------------------------------------------------------------------------
  # Happy Path: CRUD endpoints
  # ---------------------------------------------------------------------------

  Scenario: GET /api/feedback/{intent}/{stage} returns existing feedback items
    Given feedback files exist in "stages/development/feedback/":
      | file                    | status  | title                    |
      | 01-finding-a.md         | pending | Missing error handling   |
      | 02-finding-b.md         | closed  | Stale import removed     |
    When the review app calls GET /api/feedback/feedback-intent/development
    Then the response is a JSON array with 2 items
    And each item includes id, title, body, status, origin, author, author_type, created_at

  Scenario: POST /api/feedback/{intent}/{stage} creates a feedback file
    When the review app calls POST /api/feedback/feedback-intent/development with:
      """json
      {
        "title": "Typo in error message",
        "body": "Line 42: 'recieved' should be 'received'",
        "origin": "user-visual"
      }
      """
    Then the response includes the created feedback item with id "FB-01"
    And the file exists on disk at "stages/development/feedback/01-typo-in-error-message.md"
    And its author_type is "human" (server-side default for HTTP API)

  Scenario: PUT /api/feedback/{intent}/{stage}/{id} updates a feedback item
    Given feedback file "01-finding.md" exists with status "pending"
    When the review app calls PUT /api/feedback/feedback-intent/development/01 with:
      """json
      { "status": "closed" }
      """
    Then the response reflects the updated status
    And the file on disk has status "closed"

  Scenario: DELETE /api/feedback/{intent}/{stage}/{id} removes a feedback file
    Given feedback file "01-finding.md" exists with status "closed" and author_type "human"
    When the review app calls DELETE /api/feedback/feedback-intent/development/01
    Then the response is 200 OK
    And the file no longer exists on disk

  # ---------------------------------------------------------------------------
  # Happy Path: Feedback display in review UI
  # ---------------------------------------------------------------------------

  Scenario: Review UI displays existing feedback from prior visits
    Given the stage has visits = 1
    And feedback files from the prior visit:
      | file                    | status    | origin            | visit |
      | 01-old-finding.md       | addressed | adversarial-review| 0     |
      | 02-still-open.md        | pending   | adversarial-review| 0     |
    When the review UI opens for the gate
    Then the feedback panel displays both items
    And "01-old-finding.md" shows a status badge "addressed" with blue styling
    And "02-still-open.md" shows a status badge "pending" with amber styling
    And origin badges show the adversarial-review icon

  Scenario: Feedback panel shows status transitions in real time
    Given the review UI is open with 2 pending feedback items
    When the agent marks FB-01 as "addressed" via haiku_feedback_update
    And the review UI polls or receives the update
    Then FB-01's status badge changes from "pending" (amber) to "addressed" (blue)
    And the pending count in the panel header decreases

  # ---------------------------------------------------------------------------
  # Error Scenarios
  # ---------------------------------------------------------------------------

  Scenario: POST /api/feedback with missing title returns 400
    When the review app calls POST /api/feedback/feedback-intent/development with:
      """json
      { "body": "Some feedback without a title" }
      """
    Then the response is 400 Bad Request
    And the error message mentions "title is required"

  Scenario: PUT /api/feedback for non-existent feedback ID returns 404
    When the review app calls PUT /api/feedback/feedback-intent/development/99 with:
      """json
      { "status": "closed" }
      """
    Then the response is 404 Not Found

  Scenario: DELETE /api/feedback on a pending item returns 403
    Given feedback file "01-open.md" exists with status "pending"
    When the review app calls DELETE /api/feedback/feedback-intent/development/01
    Then the response is 403 Forbidden
    And the error message states "cannot delete feedback with status pending"

  Scenario: PUT /api/feedback with invalid status value returns 400
    Given feedback file "01-finding.md" exists
    When the review app calls PUT with status "invalid-status"
    Then the response is 400 Bad Request
    And the error message mentions invalid status value

  Scenario: Review UI submission fails mid-write (partial feedback creation)
    Given the reviewer has 3 comments
    And the server successfully writes feedback files for comments 1 and 2
    But the third POST /api/feedback call fails (disk error)
    Then 2 feedback files exist on disk (comments 1 and 2)
    And the review UI shows an error for the failed comment
    And the reviewer can retry the submission for the failed comment
    # Partial writes are acceptable — 2 of 3 findings persisted is better than 0

  # ---------------------------------------------------------------------------
  # Edge Cases
  # ---------------------------------------------------------------------------

  Scenario: Reviewer closes browser tab before submitting — comments are lost
    Given the reviewer has typed 3 inline comments in the review UI
    And the comments exist only in React state (browser memory)
    When the reviewer closes the browser tab without clicking "Request Changes"
    Then no feedback files are created
    And no decision is submitted
    And the review session remains open
    # This is a known v1 limitation — incremental persistence is v2

  Scenario: Reviewer approves with no comments — no feedback files created
    Given the reviewer has zero comments
    When the reviewer clicks "Approve"
    Then no feedback files are created
    And the decision "approved" is submitted normally
    And the gate proceeds

  Scenario: Reviewer approves with existing pending feedback from prior review agents
    Given feedback files from review agents:
      | file                    | status  |
      | 01-agent-finding.md     | pending |
    And the reviewer clicks "Approve" (with no new comments)
    Then the decision "approved" is submitted
    But the gate handler still checks pending feedback
    And since FB-01 is still pending, the gate rolls to elaborate
    # Human approval does not override structural feedback gate

  Scenario: GET /api/feedback for a stage with no feedback directory returns empty array
    Given no "stages/inception/feedback/" directory exists
    When the review app calls GET /api/feedback/feedback-intent/inception
    Then the response is a JSON array with 0 items
    And no error is thrown

  Scenario: Concurrent review UI sessions writing feedback for the same stage
    Given two review UI sessions are open for the same stage
    When both submit "Request Changes" simultaneously with 1 comment each
    Then 2 feedback files are created with sequential numbering (01 and 02)
    And no naming collision occurs
    # The server uses read-then-increment pattern within a single process

  Scenario: Large feedback body with markdown formatting
    When the reviewer creates a comment with:
      """
      ## Issue

      The parser fails on:

      ```json
      { "key": null }
      ```

      **Expected:** Return empty object
      **Actual:** Throws NullPointerException
      """
    And clicks "Request Changes"
    Then the feedback file body preserves the full markdown formatting
    And the file is readable and parseable
