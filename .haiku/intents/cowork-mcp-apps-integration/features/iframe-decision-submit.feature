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
