Feature: haiku_cowork_review_submit tool — decision submission
  A single MCP tool haiku_cowork_review_submit accepts all review decisions from the
  SPA via the host bridge. It uses a discriminated union on session_type to validate
  the per-variant data payload. Submission resolves the in-memory promise that
  gate_review, ask_user_visual_question, and pick_design_direction are blocking on.
  The resolved payload must be shape-identical to the HTTP-path snapshot so downstream
  FSM branching is unchanged.

  Background:
    Given the MCP initialize handshake completed with "experimental.apps" capability
    And hostSupportsMcpApps() returns true
    And the review SPA is mounted and the host bridge is connected
    And an active session exists with a pending tool-call promise

  # ─── Happy paths by session type ───

  Scenario Outline: Submission resolves the awaiting promise and returns the correct shape
    Given an active session of type "<session_type>"
    And the human reviewer has filled in the required fields for that session type
    When the SPA calls haiku_cowork_review_submit with session_type "<session_type>" and data "<data_summary>"
    Then the tool validates the payload against the "<session_type>" zod variant
    And the awaiting promise resolves with shape matching the HTTP-path snapshot
    And the tool returns a success acknowledgement to the SPA

    Examples:
      | session_type      | data_summary                                   |
      | review            | decision=approved, feedback=''                 |
      | review            | decision=changes_requested, feedback='Fix X'   |
      | review            | decision=external_review, feedback=''          |
      | question          | answers=['option-a', 'option-c']               |
      | design_direction  | selection='archetype-2', parameters={spacing:4}|

  # ─── Shape-parity assertions ───

  Scenario: review session submit matches HTTP-path decision snapshot byte-for-byte
    Given an active session of type "review"
    And the HTTP-path golden snapshot is recorded for decision "approved"
    When the SPA submits haiku_cowork_review_submit with decision "approved" and no feedback
    Then the resolved payload equals the HTTP-path golden snapshot
    And the payload contains keys "decision", "feedback", and "annotations"

  Scenario: design_direction submit fires stage-state write design_direction_selected
    Given an active session of type "design_direction"
    When the SPA submits haiku_cowork_review_submit with a valid design direction selection
    Then the tool resolves the promise
    And getStageState().design_direction_selected equals the submitted payload
    And the stage-state write runs on the MCP Apps branch identically to the HTTP branch

  # ─── Schema validation ───

  Scenario: Submission with unknown session_type is rejected before resolving the promise
    When the SPA calls haiku_cowork_review_submit with session_type "unknown_type"
    Then the tool returns a zod validation error
    And the awaiting promise is not resolved
    And the agent does not advance the FSM

  Scenario: Submission with mismatched session_type and data payload is rejected
    Given an active session of type "question"
    When the SPA calls haiku_cowork_review_submit with session_type "review" and a review-shaped payload
    Then the tool returns a validation error indicating the session_type mismatch
    And the awaiting promise is not resolved

  # ─── Regression ───

  Scenario: Non-MCP-Apps host — haiku_cowork_review_submit is not invoked
    Given hostSupportsMcpApps() returns false
    When the agent opens a review gate
    Then the human reviewer submits a decision via the HTTP POST /api/session/:id/decision endpoint
    And haiku_cowork_review_submit is never called
    And the resolved payload shape is identical to the MCP Apps path

  # ─── Error scenarios ───

  Scenario: Submission references a session ID that does not exist or has already resolved
    When the SPA calls haiku_cowork_review_submit with a stale or unknown session_id
    Then the tool returns an error indicating the session is not found
    And no FSM state is modified

  Scenario: Duplicate submission for the same session ID is rejected
    Given the SPA already submitted a decision for session "session-abc"
    When the SPA calls haiku_cowork_review_submit again with session_id "session-abc"
    Then the tool returns an error indicating the session has already been resolved
    And the FSM state is not modified a second time

  # ─── All session types share the same resource URI (V5-05) ───

  Scenario Outline: All three session types carry the same ui://haiku/review URI in _meta
    Given hostSupportsMcpApps() returns true
    And a session of type "<session_type>" is about to open
    When the agent emits the tool result
    Then the tool result _meta.ui.resourceUri matches the pattern "ui://haiku/review/<12-hex-chars>"
    And the SPA routes to the "<expected_screen>" screen based on session.session_type

    Examples:
      | session_type      | expected_screen |
      | review            | IntentReview    |
      | question          | QuestionPage    |
      | design_direction  | DesignPicker    |

  # ─── FSM run covering all three session types (V5-06) ───

  Scenario: Single FSM run delivering all three session types in sequence resolves without interference
    Given hostSupportsMcpApps() returns true
    And a FSM run is started that will exercise review, question, and design_direction sessions in sequence
    When each session opens and haiku_cowork_review_submit is called for each
    Then each tool result carries a valid _meta.ui.resourceUri
    And each submission resolves exactly its own awaiting promise
    And no submission resolves a promise belonging to a different session

  # ─── Blocking timeout decision (V5-09) ───

  Scenario: haiku_cowork_timeout_probe does not appear in the production list_tools response
    Given the MCP server is running in a non-debug build
    When a client sends a tools/list request
    Then the response contains zero entries named "haiku_cowork_timeout_probe"

  Scenario: _openReviewAndWait blocks on a single await with no resume token persisted
    Given an active review session with a pending gate_review
    When the human reviewer does not respond before the connection drops
    Then the awaiting promise rejects with a timeout error
    And no resume token or partial state is written to intent.md or state.json

  # ─── QuestionPage layout (SC-01) ───

  Scenario Outline: QuestionPage layout adapts correctly at each breakpoint
    Given a session of type "question" with a question image and multiple answer options
    And the iframe is rendered at width "<width>" pixels
    When the QuestionPage is displayed
    Then the layout is "<layout_mode>"

    Examples:
      | width | layout_mode  |
      | 400   | single-column|
      | 600   | side-by-side |
      | 900   | side-by-side |

# Audit log
# Added 2026-04-15 during product/unit-02-finalize-feature-files review.
# Gaps addressed:
#   V5-05 — all three session types share the same resource URI had no scenario.
#            Added Scenario Outline covering review, question, design_direction.
#   V5-06 — FSM run exercising all three session types had no scenario.
#            Added: "Single FSM run delivering all three session types in sequence".
#   V5-09 — blocking timeout decision had no scenario.
#            Added: haiku_cowork_timeout_probe not in list_tools + _openReviewAndWait blocks.
#   SC-01 — QuestionPage side-by-side at medium/wide had no scenario.
#            Added Scenario Outline for narrow (single-column) vs medium/wide (side-by-side).
