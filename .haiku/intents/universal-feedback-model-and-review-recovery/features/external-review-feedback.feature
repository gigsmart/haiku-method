Feature: External PR/MR changes-requested detection routes comments through haiku_feedback
  As the H-AI-K-U orchestrator handling external review gates
  I need to detect changes-requested on PRs/MRs and create feedback files
  So that external review findings enter the same structural gate as all other feedback sources

  Background:
    Given an active intent "feedback-intent" with stage "development"
    And the stage gate type is "external"
    And the stage has an open pull request or merge request for external review

  # ---------------------------------------------------------------------------
  # Happy Path: GitHub PR changes-requested
  # ---------------------------------------------------------------------------

  Scenario: GitHub PR changes-requested creates a summary feedback file
    Given the external PR at "https://github.com/org/repo/pull/42" has review state "CHANGES_REQUESTED"
    When the orchestrator checks external approval status via "gh pr view"
    Then checkExternalApproval returns { approved: false, changes_requested: true }
    And a feedback file is created at "stages/development/feedback/01-*.md"
    And its frontmatter contains:
      | status      | pending                                      |
      | origin      | external-pr                                  |
      | author      | user                                         |
      | author_type | human                                        |
      | source_ref  | https://github.com/org/repo/pull/42          |
    And its body summarizes the changes-requested review state
    And gitCommitState is called

  Scenario: GitHub PR approved proceeds normally — no feedback created
    Given the external PR has review state "APPROVED"
    When the orchestrator checks external approval status
    Then checkExternalApproval returns { approved: true, changes_requested: false }
    And no feedback file is created
    And the gate proceeds to the next stage

  Scenario: External feedback triggers FSM rollback to elaborate
    Given a feedback file was created from the external PR changes-requested
    When the orchestrator processes the external review result
    Then the FSM phase is rolled back to "elaborate"
    And state.json visits is incremented
    And the auto-revisit cycle begins (same as any other pending feedback)

  Scenario: Multiple external review rounds create sequential feedback files
    Given a prior feedback file "01-external-pr-review.md" exists from visit 0
    And the PR receives another "CHANGES_REQUESTED" review after the agent pushes fixes
    When the orchestrator detects the new changes-requested state
    Then a new feedback file "02-*.md" is created with visit matching the current visits counter
    And the prior file remains (it may have been addressed or closed)

  # ---------------------------------------------------------------------------
  # Happy Path: GitLab MR changes-requested
  # ---------------------------------------------------------------------------

  Scenario: GitLab MR non-approved state creates a feedback file
    Given the external MR at a GitLab project has a non-approved review state
    When the orchestrator checks external approval status via "glab mr view"
    Then checkExternalApproval returns { approved: false, changes_requested: true }
    And a feedback file is created with:
      | origin      | external-mr |
      | author_type | human       |
    And the body summarizes the MR review state

  # ---------------------------------------------------------------------------
  # Happy Path: V1 single-file summary
  # ---------------------------------------------------------------------------

  Scenario: V1 creates a single summary feedback file (not per-comment)
    Given the external PR has 5 review comments from different reviewers
    When the orchestrator detects changes-requested
    Then exactly 1 feedback file is created (not 5)
    And its body indicates that the external review requested changes
    And the body does NOT contain individual parsed comments
    # V1 creates a summary — per-comment parsing is v2

  # ---------------------------------------------------------------------------
  # Error Scenarios
  # ---------------------------------------------------------------------------

  Scenario: External review check command fails (gh/glab not installed)
    Given the "gh" CLI tool is not available on the system
    When the orchestrator attempts to check external approval status
    Then the check fails gracefully
    And the stage remains in "awaiting external review" state
    And no feedback file is created
    And the error is logged for debugging

  Scenario: External review check returns ambiguous state (pending review, not changes-requested)
    Given the external PR has review state "PENDING" (no reviews submitted yet)
    When the orchestrator checks external approval status
    Then checkExternalApproval returns { approved: false, changes_requested: false }
    And no feedback file is created
    And the stage continues waiting for review

  Scenario: External review check times out
    Given the "gh pr view" command hangs and times out
    When the orchestrator attempts to check external approval status
    Then the check fails gracefully with a timeout error
    And the stage remains in its current state
    And no feedback file is created
    And the error is logged

  Scenario: PR URL is malformed or does not match any known provider
    Given the stage has a source_ref "https://unknown-vcs.example.com/review/123"
    When the orchestrator attempts to detect external review state
    Then the check returns an error or unknown-provider result
    And no feedback file is created
    And the error is surfaced to the agent for resolution

  # ---------------------------------------------------------------------------
  # Edge Cases
  # ---------------------------------------------------------------------------

  Scenario: PR transitions from changes-requested to approved between checks
    Given the orchestrator previously created feedback file "01-external-pr-review.md" (status: pending)
    And the external PR reviewer now approves the PR
    When the orchestrator checks external approval status
    Then checkExternalApproval returns { approved: true, changes_requested: false }
    And no new feedback file is created
    But the existing feedback file "01-external-pr-review.md" retains its current status
    # The agent or user must explicitly close or address the prior feedback file

  Scenario: PR is merged externally — branch merge detection fires
    Given the external PR is merged (branch merged into target)
    When the orchestrator detects the branch merge
    Then the gate treats the merge as approval
    And no changes-requested feedback is created
    And the stage advances normally (assuming no other pending feedback)

  Scenario: External review creates feedback, then agent addresses it, then another review comes in
    Given feedback file "01-initial-review.md" was created from external PR (status: pending)
    And the agent marks it as "addressed" and pushes fixes
    And the reviewer submits another "CHANGES_REQUESTED" review
    When the orchestrator detects the new changes-requested state
    Then a new feedback file "02-*.md" is created
    And "01-initial-review.md" remains in status "addressed"
    And the gate check finds FB-02 pending, triggering another revisit cycle

  Scenario: External gate with compound type [external, ask] and changes-requested
    Given the stage gate type is "[external, ask]" (compound)
    And the user chose the "external" path
    And the external PR has review state "CHANGES_REQUESTED"
    When the orchestrator detects changes-requested
    Then a feedback file is created with origin "external-pr"
    And the FSM rolls to elaborate (same behavior as simple external gate)

  Scenario: Session restart between external detection and feedback file write
    Given the orchestrator detected "CHANGES_REQUESTED" but crashed before writing the feedback file
    When the MCP server restarts and the agent calls haiku_run_next
    Then the orchestrator re-checks external approval status
    And detects "CHANGES_REQUESTED" again
    And creates the feedback file on this attempt
    # The external review state is durable (it lives on GitHub/GitLab), so re-detection works

  Scenario: No external PR/MR exists for the stage
    Given the stage gate type is "external" but no PR/MR URL is recorded in stage state
    When the orchestrator attempts to check external approval
    Then the check returns a "no external review URL configured" result
    And the stage remains blocked until an external review is submitted
    And no feedback file is created

  Scenario: External review with only "COMMENTED" state (not changes-requested or approved)
    Given the external PR has review state "COMMENTED" (reviewer left comments but did not request changes)
    When the orchestrator checks external approval status
    Then checkExternalApproval returns { approved: false, changes_requested: false }
    And no feedback file is created
    And the stage continues waiting for a definitive review decision
    # "COMMENTED" is not actionable — the reviewer hasn't made a decision yet
