# Acceptance Criteria: Universal Feedback Model and Review Recovery

---

## US-01: Feedback File Creation

**As** a review subagent or orchestrator internal process,
**I want to** persist review findings as durable feedback files on disk,
**so that** findings survive session restarts, context compaction, and parent-agent crashes.

**Priority:** P0

### AC-01.1: Basic feedback file creation via MCP tool

- **Given** an active intent with stage "development" at the review phase
- **When** an agent calls `haiku_feedback({ intent: "my-intent", stage: "development", title: "Missing null check", body: "handleSubmit at line 42 dereferences a potentially null ref", origin: "adversarial-review", author: "security-reviewer" })`
- **Then** a file is created at `.haiku/intents/my-intent/stages/development/feedback/01-missing-null-check.md`
- **And** the frontmatter contains `status: pending`, `origin: adversarial-review`, `author: security-reviewer`, `author_type: agent`, `created_at:` (ISO8601), `visit:` (current stage visits value)
- **And** the body contains the markdown text passed in `body`
- **And** a git commit is created via `gitCommitState`

### AC-01.2: Sequential numbering auto-increments

- **Given** a stage feedback directory already contains `01-first-finding.md` and `02-second-finding.md`
- **When** a new feedback item is created
- **Then** the file is named `03-{slug}.md`

### AC-01.3: Feedback directory auto-created when absent

- **Given** a stage has never had feedback (no `feedback/` directory exists)
- **When** `haiku_feedback` is called for that stage
- **Then** the `feedback/` directory is created automatically
- **And** the feedback file is written as `01-{slug}.md`

### AC-01.4: Default author values

- **Given** a call to `haiku_feedback` with no `author` or `origin` specified
- **When** the feedback file is written
- **Then** `author` defaults to `"agent"` and `author_type` defaults to `"agent"`
- **And** `origin` defaults to `"agent"`

---

## US-02: Feedback CRUD Operations

**As** an agent or review UI user,
**I want to** read, update, delete, and reject feedback items,
**so that** feedback lifecycle is fully managed without manual file editing.

**Priority:** P0

### AC-02.1: List feedback items for a stage

- **Given** a stage with 5 feedback files (3 pending, 1 addressed, 1 closed)
- **When** `haiku_feedback_list({ intent: "my-intent", stage: "development" })` is called
- **Then** all 5 items are returned with parsed frontmatter and body
- **And** each item includes `id` (numeric prefix), `slug`, `title`, `body`, `status`, `origin`, `author`, `author_type`, `created_at`, `visit`

### AC-02.2: List with status filter

- **Given** a stage with 3 pending and 2 closed feedback items
- **When** `haiku_feedback_list({ intent: "my-intent", stage: "development", status: "pending" })` is called
- **Then** only the 3 pending items are returned

### AC-02.3: List across all stages

- **Given** an intent with feedback in stages "design" (2 items) and "development" (3 items)
- **When** `haiku_feedback_list({ intent: "my-intent" })` is called (no `stage` parameter)
- **Then** all 5 items are returned, each annotated with its stage name

### AC-02.4: Update feedback status

- **Given** a pending feedback item FB-02 authored by an agent
- **When** `haiku_feedback_update({ intent: "my-intent", stage: "development", feedback_id: "02", status: "addressed", addressed_by: "unit-03-fix-null-check" })` is called
- **Then** the feedback file's frontmatter is updated with `status: addressed` and `addressed_by: unit-03-fix-null-check`
- **And** a git commit is created

### AC-02.5: Agent cannot close human-authored feedback

- **Given** a pending feedback item authored by `author_type: human`
- **When** an agent calls `haiku_feedback_update({ ..., feedback_id: "01", status: "closed" })`
- **Then** the call returns an error: "Cannot close human-authored feedback via agent tool. Use the review UI."
- **And** the file is unchanged

### AC-02.6: Agent can mark human-authored feedback as addressed

- **Given** a pending feedback item authored by `author_type: human`
- **When** an agent calls `haiku_feedback_update({ ..., feedback_id: "01", status: "addressed", addressed_by: "unit-04-layout-fix" })`
- **Then** the update succeeds and status changes to `addressed`

### AC-02.7: Delete feedback — cannot delete pending items

- **Given** a feedback item with `status: pending`
- **When** `haiku_feedback_delete({ intent: "my-intent", stage: "development", feedback_id: "01" })` is called
- **Then** the call returns an error: "Cannot delete pending feedback items. Address, close, or reject first."
- **And** the file is unchanged

### AC-02.8: Delete feedback — author_type enforcement

- **Given** a closed feedback item with `author_type: human`
- **When** an agent calls `haiku_feedback_delete` for that item
- **Then** the call returns an error: "Human-authored feedback can only be deleted via the review UI."

### AC-02.9: Reject agent-authored feedback

- **Given** a pending feedback item with `author_type: agent` and `origin: adversarial-review`
- **When** `haiku_feedback_reject({ intent: "my-intent", stage: "development", feedback_id: "03", reason: "False positive — the null case is handled by the caller" })` is called
- **Then** the feedback file status changes to `rejected`
- **And** the rejection reason is appended to the body or stored in frontmatter

### AC-02.10: Cannot reject human-authored feedback via agent tool

- **Given** a pending feedback item with `author_type: human`
- **When** an agent calls `haiku_feedback_reject` for that item
- **Then** the call returns an error: "Human-authored feedback cannot be rejected by agents."

---

## US-03: Structural Review Gate (Auto-Revisit)

**As** the FSM orchestrator,
**I want to** block the review-to-gate transition when pending feedback exists,
**so that** review findings are structurally enforced, not just prompt-enforced.

**Priority:** P0

### AC-03.1: Gate phase rolls back when pending feedback exists

- **Given** a stage at `phase: gate` with 3 feedback files, 2 of which have `status: pending`
- **When** `haiku_run_next` is called
- **Then** the FSM sets `phase: elaborate` in the stage's `state.json`
- **And** `visits` is incremented by 1
- **And** the returned action is `feedback_revisit` with the list of pending feedback items

### AC-03.2: Gate phase proceeds normally when no pending feedback

- **Given** a stage at `phase: gate` with 3 feedback files, all `status: closed` or `addressed`
- **When** `haiku_run_next` is called
- **Then** the normal gate logic proceeds (auto-advance, ask, external, or compound — per the stage's review type)

### AC-03.3: Gate phase proceeds when feedback directory is empty or absent

- **Given** a stage at `phase: gate` with no `feedback/` directory
- **When** `haiku_run_next` is called
- **Then** the normal gate logic proceeds without error

### AC-03.4: Visits counter persists across session restarts

- **Given** a stage that has been rolled back twice (visits = 2) and the user restarts the session
- **When** the agent resumes via `/haiku:pickup` and calls `haiku_run_next`
- **Then** `state.json` still reads `visits: 2`
- **And** the FSM behavior is consistent with the visit count

### AC-03.5: Review subagent findings trigger auto-revisit on next tick

- **Given** review subagents have written 4 feedback files via `haiku_feedback` during the review phase
- **And** the parent agent calls `haiku_run_next` (entering gate phase)
- **When** the gate phase handler checks pending feedback
- **Then** it detects 4 pending items and rolls back to elaborate
- **And** the agent receives `feedback_revisit` instructions listing all 4 items

---

## US-04: Enforce-Iteration Fix

**As** the enforce-iteration hook,
**I want to** determine intent completion by checking per-stage `state.json` status,
**so that** intents are not prematurely marked complete when later stages have no units.

**Priority:** P0

### AC-04.1: Intent not marked complete when later stages are unstarted

- **Given** an intent with stages [inception, design, development, security]
- **And** inception has `state.json` status `completed` with completed unit files
- **And** design, development, and security have no `state.json` or no units
- **When** the enforce-iteration hook runs
- **Then** `intent.status` remains unchanged (not flipped to `completed`)

### AC-04.2: Intent marked complete when all declared stages are completed

- **Given** an intent with stages [inception, design, development, security]
- **And** all four stages have `state.json` status `completed`
- **When** the enforce-iteration hook runs
- **Then** `intent.status` is set to `completed`

### AC-04.3: Stages without state.json default to incomplete

- **Given** an intent with stages [inception, design]
- **And** inception has `state.json` status `completed`
- **And** design has no `state.json` file at all
- **When** the enforce-iteration hook checks completion
- **Then** design is treated as not-completed
- **And** intent is not marked complete

### AC-04.4: Unit file count no longer drives completion

- **Given** an intent where `findUnitFiles()` across all stages returns 5 unit files, all completed
- **But** only 2 of 4 declared stages have `state.json` status `completed`
- **When** the enforce-iteration hook runs
- **Then** intent is NOT marked complete (the unit-file glob result is not used for completion)

---

## US-05: Review UI Feedback Integration

**As** a reviewer using the review UI,
**I want to** see existing feedback, create new feedback via annotations, and manage feedback status,
**so that** review comments flow through the same durable feedback model as agent findings.

**Priority:** P0

### AC-05.1: Feedback panel displays existing items on review open

- **Given** a stage with 5 feedback items from a prior review cycle (3 pending, 1 addressed, 1 closed)
- **When** the review UI opens for the gate review
- **Then** the sidebar "Feedback" tab displays all 5 items grouped by visit
- **And** each item shows its status badge, origin icon, title, and metadata

### AC-05.2: Request Changes creates individual feedback files

- **Given** a reviewer has created 3 inline comments and 1 general comment in the "Mine" tab
- **When** the reviewer clicks "Request Changes"
- **Then** 4 feedback files are created sequentially via `POST /api/feedback/{intent}/{stage}`
- **And** each file has `origin: user-visual` (inline/pin) or `origin: user-chat` (general), `author: user`, `author_type: human`
- **And** the decision is submitted with a summary referencing the created feedback IDs
- **And** the "Feedback" tab refreshes to show the newly created items

### AC-05.3: Approve with pending feedback shows confirmation

- **Given** 2 pending feedback items exist for the current stage
- **When** the reviewer clicks "Approve"
- **Then** a confirmation dialog appears: "There are 2 pending feedback items. Approving will close all remaining items. Continue?"
- **And** if confirmed, all pending items are set to `closed` and the approval proceeds

### AC-05.4: Feedback status changes from review UI

- **Given** an expanded feedback item with `status: pending` and `author_type: agent`
- **When** the reviewer clicks "Reject" and provides a reason
- **Then** the item status changes to `rejected` via the CRUD API
- **And** the badge updates immediately (optimistic UI)
- **And** on API error, the badge reverts and an error toast appears

### AC-05.5: Feedback items sorted correctly within groups

- **Given** a visit group with 2 pending, 1 addressed, and 1 closed item
- **When** the group renders in the feedback list
- **Then** pending items appear first, then addressed, then closed/rejected
- **And** within the same status, newest items appear first (by `created_at` desc)

---

## US-06: External PR/MR Changes-Requested Detection

**As** the orchestrator,
**I want to** detect changes-requested on external PRs/MRs and create feedback files,
**so that** external review comments enter the same feedback lifecycle as internal findings.

**Priority:** P0 (detection + summary feedback file)

### AC-06.1: GitHub PR changes-requested creates summary feedback

- **Given** a stage at external review gate with a PR URL in state
- **And** `gh pr view` reports `CHANGES_REQUESTED` review decision
- **When** `haiku_run_next` checks the external approval
- **Then** a single feedback file is created with `origin: external-pr`, `author_type: human`, and a body summarizing the review state
- **And** the FSM rolls back to elaborate (via the pending-feedback gate check)

### AC-06.2: GitLab MR changes-requested follows the same pattern

- **Given** a stage at external review gate with an MR URL
- **And** `glab mr view` reports a non-approved state
- **When** `haiku_run_next` checks the external approval
- **Then** a feedback file is created with `origin: external-mr`

### AC-06.3: Approved external review does not create feedback

- **Given** a stage at external review gate
- **And** `gh pr view` reports `APPROVED`
- **When** `haiku_run_next` checks the external approval
- **Then** no feedback file is created
- **And** the gate proceeds to advance the stage

---

## US-07: Additive Elaborate Mode

**As** the orchestrator in a revisit cycle,
**I want to** run the elaborate phase in additive mode where completed units are frozen and new units must declare `closes: [FB-NN]`,
**so that** feedback resolution is structurally tied to unit completion.

**Priority:** P0

### AC-07.1: Additive elaborate triggered when visits > 0

- **Given** a stage with `visits: 1` in `state.json` and 3 pending feedback items
- **When** the elaborate phase runs
- **Then** the returned action is `additive_elaborate` (not plain `elaborate`)
- **And** the instruction payload includes the list of pending feedback items with their FB-NN identifiers and bodies

### AC-07.2: Completed units are read-only in additive mode

- **Given** a stage with visits > 0 and 2 completed units from prior visits
- **When** the agent attempts to modify a completed unit's frontmatter or body
- **Then** the modification is rejected (the orchestrator or validation prevents it)

### AC-07.3: New units must declare closes field

- **Given** a stage in additive elaborate mode with pending feedback FB-01 and FB-03
- **When** a new unit is created with frontmatter `closes: [FB-01, FB-03]`
- **Then** the unit passes DAG validation
- **And** the feedback items FB-01 and FB-03 can be marked as `addressed` referencing this unit

### AC-07.4: New unit without closes field fails validation

- **Given** a stage in additive elaborate mode
- **When** a new unit is created without a `closes:` field in frontmatter
- **Then** DAG validation produces an error indicating that units in additive mode must declare which feedback they address

### AC-07.5: closes references must map to real feedback IDs

- **Given** a stage in additive elaborate mode
- **When** a new unit declares `closes: [FB-99]` but FB-99 does not exist
- **Then** DAG validation produces an error: "FB-99 does not match any feedback item"

### AC-07.6: First visit (visits = 0) uses normal elaborate

- **Given** a stage with `visits: 0` (or no visits field)
- **When** the elaborate phase runs
- **Then** normal elaborate behavior occurs (no additive constraints, no `closes:` requirement)

---

## US-08: Review Subagent Direct Feedback Writes

**As** a review subagent,
**I want to** call `haiku_feedback` directly to persist each finding,
**so that** findings are durable from the moment of discovery without parent-agent mediation.

**Priority:** P0

### AC-08.1: Subagent prompt instructs direct haiku_feedback calls

- **Given** the orchestrator generates a review subagent prompt for a stage
- **When** the `<subagent>` template is built
- **Then** it instructs the subagent to call `haiku_feedback({ intent, stage, title, body, origin: "adversarial-review", author: agentName })` for each finding
- **And** it does NOT instruct the subagent to "report findings as severity/file/line/description" (the old text-only format)

### AC-08.2: Parent instructions simplified

- **Given** the orchestrator generates parent instructions for the review phase
- **When** the `withInstructions` builder runs
- **Then** the parent instructions say: "Spawn review subagents (they persist findings via haiku_feedback). After all subagents complete, call haiku_run_next."
- **And** the instructions do NOT say: "Collect findings. If HIGH severity findings exist, fix them and re-review."

### AC-08.3: Subagent findings survive parent crash

- **Given** a review subagent has written 3 feedback files via `haiku_feedback`
- **And** the parent agent session crashes or is restarted
- **When** the user resumes via `/haiku:pickup`
- **Then** the 3 feedback files are still on disk
- **And** the gate phase pending-feedback check detects them

---

## US-09: Sentry Tool Rename

**As** a user of the `/haiku:report` skill,
**I want to** submit bug reports via `haiku_report` (not `haiku_feedback`),
**so that** the `haiku_feedback` name is freed for the new feedback-file tool.

**Priority:** P0 (blocks US-01)

### AC-09.1: Sentry tool renamed to haiku_report

- **Given** the MCP server tool list
- **When** the tools are listed
- **Then** `haiku_report` appears (Sentry bug-report tool)
- **And** `haiku_feedback` is the new feedback-file creation tool (not the Sentry tool)

### AC-09.2: /haiku:report skill still works

- **Given** a user invokes the `/haiku:report` skill
- **When** the skill executes
- **Then** it calls `haiku_report` (the renamed tool) and submits to Sentry successfully

---

## US-10: Changes-Requested Handler Writes Feedback Files

**As** the orchestrator handling a review UI `changes_requested` decision,
**I want to** convert annotations and comments into individual feedback files,
**so that** review UI feedback enters the same durable model as agent findings.

**Priority:** P0

### AC-10.1: Annotations become individual feedback files

- **Given** the review UI submits `changes_requested` with 3 annotations (2 inline comments, 1 pin)
- **When** the orchestrator's changes_requested handler runs
- **Then** 3 feedback files are created, each with `origin: user-visual`, `author: user`, `author_type: human`
- **And** inline comment bodies include the quoted selected text

### AC-10.2: General feedback string becomes a feedback file

- **Given** the review UI submits `changes_requested` with a non-empty general feedback string and no annotations
- **When** the orchestrator's changes_requested handler runs
- **Then** 1 feedback file is created with `origin: user-chat`, `author: user`, `author_type: human`

### AC-10.3: Empty submission creates no feedback files

- **Given** the review UI submits `changes_requested` with no annotations and an empty feedback string
- **When** the orchestrator's changes_requested handler runs
- **Then** no feedback files are created
- **And** the decision is still processed (the phase rolls back naturally on next tick if pending feedback exists from other sources)

---

## US-11: Review Server CRUD Endpoints

**As** the review app SPA,
**I want to** call REST endpoints to manage feedback files,
**so that** the browser can read, create, update, and delete feedback without direct filesystem access.

**Priority:** P0

### AC-11.1: GET returns feedback items as JSON

- **Given** a stage with 4 feedback files
- **When** `GET /api/feedback/{intent}/{stage}` is called
- **Then** a 200 response with a JSON array of 4 feedback items is returned
- **And** each item includes all frontmatter fields plus `id`, `slug`, and `body`

### AC-11.2: POST creates a feedback file

- **Given** a valid POST body with `title`, `body`, and `origin`
- **When** `POST /api/feedback/{intent}/{stage}` is called
- **Then** a 201 response with the created item is returned
- **And** the feedback file exists on disk with correct frontmatter

### AC-11.3: PUT updates a feedback file

- **Given** an existing feedback file FB-02
- **When** `PUT /api/feedback/{intent}/{stage}/02` is called with `{ status: "closed" }`
- **Then** a 200 response with the updated item is returned
- **And** the file's frontmatter is patched

### AC-11.4: DELETE removes a feedback file

- **Given** a closed feedback file FB-02 with `author_type: human`
- **When** `DELETE /api/feedback/{intent}/{stage}/02` is called from the review UI
- **Then** a 204 response is returned
- **And** the file is removed from disk

### AC-11.5: 404 for non-existent intent or stage

- **Given** a non-existent intent slug "ghost-intent"
- **When** `GET /api/feedback/ghost-intent/development` is called
- **Then** a 404 response is returned

### AC-11.6: 400 for invalid POST body

- **Given** a POST body missing the required `title` field
- **When** `POST /api/feedback/{intent}/{stage}` is called
- **Then** a 400 response with a validation error is returned

### AC-11.7: Guard enforcement on endpoints

- **Given** a pending feedback item
- **When** `DELETE /api/feedback/{intent}/{stage}/{id}` is called
- **Then** a 403 response is returned: "Cannot delete pending feedback items"

---

## P1 (Follow-Up) Stories

### US-P1.1: Individual External PR Comment Parsing

**As** the orchestrator,
**I want to** parse individual review comments from GitHub/GitLab and create one feedback file per comment,
**so that** external reviewer feedback is granular rather than a single summary.

**Priority:** P1

- Requires provider-specific comment format parsing (GitHub review comments, GitLab MR discussions)
- v1 creates a single summary feedback file per changes-requested event

### US-P1.2: Mobile Review FAB and Sheet Overlay

**As** a mobile reviewer,
**I want to** access feedback and review actions via a floating action button and full-screen sheet,
**so that** I can review on mobile (currently not possible at all).

**Priority:** P1

- New components: `FeedbackFAB`, `MobileFeedbackSheet`
- Focus trap, FAB pulse animation, responsive sheet

### US-P1.3: Debounced Draft Comment Persistence

**As** a reviewer,
**I want to** have my in-progress annotations auto-saved as draft feedback files,
**so that** I don't lose comments if I close the browser tab before submitting.

**Priority:** P1

- Debounced persistence of draft comments as the user types
- Draft feedback files that are finalized on submission

### US-P1.4: Max Visits Cap Per Stage

**As** a project maintainer,
**I want to** configure a maximum number of revisit cycles per stage,
**so that** a feedback loop cannot spin indefinitely.

**Priority:** P1

- Configurable `max_visits` in `STAGE.md` frontmatter or studio config
- When exceeded, force the gate to proceed with a warning

### US-P1.5: Review UI Auth with Real User Identity

**As** the feedback system,
**I want to** record the actual user's identity in `author` (not a flat `"user"` literal),
**so that** multi-user scenarios have proper attribution.

**Priority:** P1

- Requires runtime identity detection or login in the review UI
- v1 uses `author: "user"` for all human-authored feedback

### US-P1.6: Feedback Dependency Graph

**As** an agent in additive elaborate mode,
**I want to** express dependencies between feedback items,
**so that** addressing one item that subsumes others can cascade-close the group.

**Priority:** P1

---

## Edge Cases

### EC-01: Empty feedback directory

- **Given** a stage's `feedback/` directory exists but contains no files
- **When** `readFeedbackFiles` or `countPendingFeedback` is called
- **Then** an empty array / zero count is returned (no error)
- **And** the gate phase proceeds normally

### EC-02: Absent feedback directory

- **Given** a stage has never had feedback and `feedback/` does not exist
- **When** `readFeedbackFiles` or `countPendingFeedback` is called
- **Then** an empty array / zero count is returned (no error, no directory creation)
- **And** the gate phase proceeds normally

### EC-03: Concurrent feedback writes (same stage)

- **Given** two review subagents writing feedback for the same stage simultaneously
- **When** both call `haiku_feedback` at nearly the same time
- **Then** both files are created with unique numeric prefixes (no collision)
- **And** the MCP server's single-process sequential handling prevents race conditions within a single server
- **And** if multiple processes are involved, the slug portion prevents filename collision even if NN is duplicated

### EC-04: Session restart mid-review

- **Given** review subagents have written 3 feedback files, but the parent agent session crashes before calling `haiku_run_next`
- **When** the user resumes via `/haiku:pickup`
- **Then** the 3 feedback files are on disk (committed to git)
- **And** the FSM phase is still `review` (or wherever it was when the crash occurred)
- **And** on the next `haiku_run_next`, the gate pending-feedback check detects the 3 pending items

### EC-05: Feedback on a stage with no units yet

- **Given** a stage has `phase: elaborate` with no units created yet (visits = 0)
- **And** someone (e.g., an external review comment ingested early) creates a feedback file for this stage
- **When** the elaborate phase runs
- **Then** the feedback file exists but does not trigger additive mode (visits = 0)
- **And** the feedback is informational context for the agent during initial elaboration
- **And** if the agent later enters the gate phase, the pending feedback will block advancement

### EC-06: Rejected feedback re-raised in next review cycle

- **Given** feedback FB-03 was rejected with reason "false positive" in visit 1
- **And** a review subagent in visit 2 discovers the same issue and creates FB-07 with similar content
- **When** the gate phase checks pending feedback
- **Then** FB-07 is counted as pending (FB-03's rejection does not suppress new findings on the same topic)
- **And** the agent or user must independently address or reject FB-07

### EC-07: All feedback addressed but gate type is "ask"

- **Given** a stage at `phase: gate` with all feedback items `status: addressed` or `closed`
- **And** the stage's review type is `ask` (requires human approval)
- **When** `haiku_run_next` is called
- **Then** the pending-feedback check passes (no pending items)
- **And** the normal `ask` gate opens the review UI for human approval
- **And** the reviewer sees the addressed feedback items with their status badges in the sidebar

### EC-08: Feedback created for a stage that has already completed

- **Given** a stage with `state.json` status `completed`
- **When** `haiku_feedback` is called for that stage
- **Then** the feedback file is created (writes are not blocked on completed stages)
- **And** the feedback exists for informational purposes but does not retroactively block the completed stage
- **Note:** This handles late-arriving external review comments on already-advanced stages

### EC-09: Visits field missing from legacy state.json

- **Given** a `state.json` created before the feedback model was implemented (no `visits` field)
- **When** the gate phase reads `state.json`
- **Then** `visits` defaults to `0`
- **And** behavior is identical to a fresh stage with no revisit history

### EC-10: Feedback slug collision

- **Given** two feedback items with the same derived slug in the same stage
- **When** the second item is created
- **Then** the numeric prefix differentiates them: `01-missing-null-check.md` and `02-missing-null-check.md`
- **And** both files coexist without issue

---

## Error Paths

### EP-01: Git commit failure during feedback write

- **Given** the git working directory has a conflict or `.git/index.lock` exists
- **When** `haiku_feedback` calls `gitCommitState` and the commit fails
- **Then** the feedback file is still written to disk (the write happens before the commit)
- **And** the tool returns an error indicating the git commit failed
- **And** the feedback file will be included in the next successful commit
- **And** the agent or user is informed to resolve the git state

### EP-02: Network failure on CRUD endpoint

- **Given** the review app is calling `POST /api/feedback/{intent}/{stage}` during "Request Changes" submission
- **And** the MCP HTTP server becomes unreachable mid-sequence (e.g., after 2 of 4 items created)
- **When** the 3rd POST fails
- **Then** the review UI shows an error toast identifying which items failed
- **And** the 2 successfully created items persist on disk
- **And** the user can retry the failed items (the submission is not all-or-nothing)

### EP-03: Malformed feedback file on disk

- **Given** a feedback file exists but has invalid YAML frontmatter (e.g., syntax error, missing required fields)
- **When** `readFeedbackFiles` parses the file
- **Then** the malformed file is skipped with a warning (not a hard error that blocks the entire list)
- **And** the `countPendingFeedback` function does not count the malformed file
- **And** the stage can still advance through the gate

### EP-04: Missing stage directory

- **Given** `haiku_feedback` is called with `stage: "nonexistent"`
- **And** no directory exists at `.haiku/intents/{slug}/stages/nonexistent/`
- **When** the tool attempts to write the feedback file
- **Then** the tool returns an error: "Stage directory not found: nonexistent"
- **And** no files or directories are created

### EP-05: Invalid feedback_id on update/delete

- **Given** `haiku_feedback_update` is called with `feedback_id: "99"` but no FB-99 file exists
- **When** the handler looks up the file
- **Then** it returns a 404 error: "Feedback item 99 not found in stage development"

### EP-06: Review server CRUD endpoint — concurrent PUT conflict

- **Given** the review UI sends a PUT to update FB-02's status to `closed`
- **And** simultaneously an agent calls `haiku_feedback_update` on the same item to set `addressed`
- **When** both writes reach the server
- **Then** the last write wins (filesystem semantics)
- **And** the git history records both states (two separate commits)
- **And** no data corruption occurs

### EP-07: Feedback write during elaborate phase (non-review context)

- **Given** a stage at `phase: elaborate` (not review)
- **When** `haiku_feedback` is called (e.g., an agent proactively logging a concern)
- **Then** the feedback file is created normally
- **And** the feedback will be counted when the stage eventually reaches the gate phase

### EP-08: CRUD endpoint with missing intent directory

- **Given** `POST /api/feedback/nonexistent-intent/development` is called
- **And** the intent directory does not exist
- **When** the server attempts to resolve the path
- **Then** a 404 response is returned: "Intent not found: nonexistent-intent"

### EP-09: Extremely long feedback body

- **Given** a feedback body exceeding 100KB of markdown
- **When** `haiku_feedback` is called
- **Then** the file is written without truncation (feedback files are not size-limited)
- **And** `gitCommitState` commits the large file normally
- **And** the review UI renders the body with scrollable overflow

### EP-10: Feedback file manually deleted outside the system

- **Given** a user manually deletes a feedback file from the filesystem (not via the API)
- **When** `readFeedbackFiles` runs on the next tick
- **Then** the deleted file is simply absent from the results
- **And** any `closes: [FB-NN]` references to that ID in units become dangling but do not cause validation errors (the feedback is gone, the unit's claim is moot)

---

## Traceability Matrix

| User Story | Implementation Group(s) | Key Files |
|---|---|---|
| US-01 (Feedback Creation) | Group 1, Group 2 | `state-tools.ts` |
| US-02 (CRUD) | Group 1, Group 3 | `state-tools.ts` |
| US-03 (Auto-Revisit) | Group 5 | `orchestrator.ts` |
| US-04 (Enforce-Iteration) | Group 9 | `enforce-iteration.ts`, `utils.ts` |
| US-05 (Review UI) | Group 12 | `ReviewSidebar.tsx`, `ReviewPage.tsx`, `useSession.ts`, `types.ts` |
| US-06 (External Detection) | Group 10 | `orchestrator.ts` |
| US-07 (Additive Elaborate) | Group 8 | `orchestrator.ts` |
| US-08 (Subagent Writes) | Group 7 | `orchestrator.ts` |
| US-09 (Tool Rename) | Group 4 | `server.ts`, `SKILL.md` |
| US-10 (Changes-Requested) | Group 6 | `orchestrator.ts` |
| US-11 (CRUD Endpoints) | Group 11 | `http.ts` |
