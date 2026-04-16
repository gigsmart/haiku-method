# Architecture: Universal Feedback Model and Review Recovery

Quick-reference for implementors. Cross-reference DATA-CONTRACTS.md for field-level schemas and IMPLEMENTATION-MAP.md for group scoping.

---

## 1. Module Map

### Core packages (all under `packages/haiku/src/`)

| File | Responsibility | Changes Required |
|---|---|---|
| `state-tools.ts` | Resource MCP tools, `gitCommitState`, frontmatter helpers. **New:** `writeFeedbackFile`, `readFeedbackFiles`, `countPendingFeedback`, `updateFeedbackFile`, `deleteFeedbackFile` + tool defs/handlers for `haiku_feedback`, `haiku_feedback_update`, `haiku_feedback_delete`, `haiku_feedback_reject`, `haiku_feedback_list`. | Groups 1, 2, 3 |
| `orchestrator.ts` | FSM driver (`runNext`), phase handlers, `withInstructions` builder, gate logic, `revisit()`. **New:** pending-feedback gate check, `feedback_revisit` action, additive elaborate mode, subagent prompt rewrite, `changes_requested` feedback-file writes, external detection extension, `haiku_revisit` reasons parameter. | Groups 5, 6, 7, 8, 10 |
| `server.ts` | MCP server setup, tool registration, tool routing. **Change:** rename `haiku_feedback` (Sentry) to `haiku_report` at line 349 and handler at line 416. | Group 4 |
| `http.ts` | HTTP server, session API, file serving, review decide endpoint. **New:** CRUD endpoints `GET/POST/PUT/DELETE /api/feedback/{intent}/{stage}[/{id}]`. | Group 11 |
| `sessions.ts` | In-memory session store (review, question, design_direction). No structural changes -- sessions remain transient; feedback persistence is file-based. | -- |

### Hooks (under `packages/haiku/src/hooks/`)

| File | Responsibility | Changes Required |
|---|---|---|
| `enforce-iteration.ts` | Stop hook -- rescue when execution loop exits. **Bug:** uses `findUnitFiles()` cross-stage glob to determine completion. **Fix:** check per-stage `state.json` status instead. | Group 9 |
| `utils.ts` | Shared utilities including `findUnitFiles` (lines 150-165). **New:** `readStageStatuses(intentDir)` helper. | Group 9 |
| `subagent-context.ts` | Context generation for Task subagents. No changes -- subagents already inherit MCP tools from parent. | -- |

### Review App (under `packages/haiku/review-app/src/`)

| File | Responsibility | Changes Required |
|---|---|---|
| `components/ReviewPage.tsx` | Main review view with tabs. **New:** feedback panel/tab. | Group 12 |
| `components/ReviewSidebar.tsx` | Decision buttons, comment management. **Change:** "Request Changes" writes individual feedback files via CRUD API instead of serializing to a string. | Group 12 |
| `hooks/useSession.ts` | Session fetching/submission. **New:** `useFeedback` hook + CRUD helpers. | Group 12 |
| `types.ts` | Type definitions. **New:** `FeedbackItem` interface. | Group 12 |

### Plugin assets

| File | Responsibility | Changes Required |
|---|---|---|
| `plugin/skills/report/SKILL.md` | `/haiku:report` skill definition. **Change:** tool reference `haiku_feedback` -> `haiku_report`. | Group 4 |
| `website/public/prototype-stage-flow.html` | Canonical runtime architecture visualization. **Change:** feedback check in review->gate flow, tool specs, state schema. | Group 13 |

---

## 2. Data Flow

### 2a. Subagent review finding (adversarial review)

```
review subagent
  |  calls haiku_feedback MCP tool directly
  v
state-tools.ts :: handleStateTool("haiku_feedback")
  |  calls writeFeedbackFile()
  v
writeFeedbackFile()
  |  1. mkdirSync(feedbackDir, { recursive: true })
  |  2. readdirSync -> compute next NN prefix
  |  3. writeFileSync(NN-{slug}.md)  [frontmatter + body]
  |  4. gitCommitState("feedback: create FB-NN in {stage}")
  v
.haiku/intents/{slug}/stages/{stage}/feedback/NN-{slug}.md  (on disk + committed to git)
```

### 2b. Review UI "Request Changes"

```
Browser (ReviewSidebar)
  |  POST /api/feedback/{intent}/{stage}  (one per comment/annotation)
  v
http.ts :: handleFeedbackPost()
  |  calls writeFeedbackFile() with origin: "user-visual", author_type: "human"
  v
feedback file on disk + git commit
  |
  v
Browser submits decision via POST /review/{sessionId}/decide
  |  decision: "changes_requested"
  v
orchestrator.ts :: changes_requested handler
  |  (feedback files already exist -- no need to re-create from string)
  |  returns action with references to feedback files
  v
withInstructions("changes_requested") -> agent instructions
```

### 2c. Gate-phase pending-feedback check (the structural enforcement)

```
agent calls haiku_run_next
  |
  v
orchestrator.ts :: runNext()
  |  phase === "gate"
  |  FIRST THING: countPendingFeedback(slug, currentStage)
  |
  +--> count === 0 --> normal gate logic (auto/ask/external)
  |
  +--> count > 0
        |  1. increment state.visits
        |  2. set phase = "elaborate"
        |  3. writeJson(state.json)
        |  4. return action: "feedback_revisit"
        v
  withInstructions("feedback_revisit")
    |  lists pending FB items
    |  instructs: "elaborate new units with closes: [FB-NN]"
    v
  agent elaborates in additive mode (visits > 0)
    |  new units must declare closes: [FB-NN]
    |  completed units from prior visits are read-only
    v
  execute -> review -> gate -> (check again)
```

### 2d. External PR changes-requested

```
orchestrator.ts :: external review check (poll)
  |  gh pr view / glab mr view -> CHANGES_REQUESTED
  v
writeFeedbackFile(origin: "external-pr")
  |  single summary file for v1
  v
FSM rolls to elaborate (pending feedback check fires on next gate entry)
```

### 2e. haiku_revisit with reasons

```
agent calls haiku_revisit({ intent, reasons: [{title, body}] })
  |
  v
orchestrator.ts :: revisit handler
  |  1. validate reasons array (non-empty, each has title + body)
  |  2. for each reason: writeFeedbackFile(origin: "agent")
  |  3. roll FSM to elaborate, increment visits
  |  4. return action: "revisit" with feedback_created list
  v
additive elaborate mode (same as 2c)
```

---

## 3. Key Abstractions

### 3a. Feedback file format

**Location:** `.haiku/intents/{slug}/stages/{stage}/feedback/NN-{slug}.md`

Frontmatter-plus-markdown, same pattern as unit files. Frontmatter fields: `title`, `status` (pending|addressed|closed|rejected), `origin`, `author`, `author_type` (human|agent), `created_at`, `visit`, `source_ref`, `addressed_by`. Body is freeform markdown.

`FB-NN` identifiers are scoped per-stage. The numeric prefix `NN` is the identifier (e.g., `FB-03` = `03-*.md`).

Status lifecycle: `pending` -> `addressed` -> `closed`. `pending` -> `rejected` (agent-authored only, by agents). Only `pending` blocks the gate.

### 3b. Pending-count gate

Injected at the top of the `if (phase === "gate")` block in `orchestrator.ts` (~line 1669). Before any gate resolution logic (auto/ask/external), the FSM reads the feedback directory and counts items with `status: pending`. If count > 0, the gate is short-circuited: phase rolls to `elaborate`, `visits` increments, and the agent gets a `feedback_revisit` action.

This is the structural enforcement. No prompt-level instruction can bypass it. The FSM literally won't enter gate logic while pending feedback exists.

### 3c. Additive elaborate mode

When `stageState.visits > 0`, the elaborate phase operates differently:

- **Completed units from prior visits are read-only.** The agent cannot modify them.
- **New units must declare `closes: [FB-NN]`** referencing specific pending feedback items.
- **The elaborate instruction builder includes the list of pending feedback items** so the agent knows what to address.
- **DAG validation** checks that `closes:` references map to real feedback IDs.

### 3d. `writeFeedbackFile` helper

Lives in `state-tools.ts`. Core function that all feedback creation paths use:

1. Ensures `feedbackDir` exists (`mkdirSync` with `{ recursive: true }`)
2. Reads existing files to compute next sequential NN (read-then-increment)
3. Derives slug from title (lowercase, non-alphanumeric -> hyphens, max 60 chars)
4. Writes frontmatter + body to `NN-{slug}.md`
5. Calls `gitCommitState("feedback: create FB-NN in {stage}")`
6. Returns `{ feedback_id: "FB-NN", file: "..." }`

Companion functions: `readFeedbackFiles`, `countPendingFeedback`, `updateFeedbackFile`, `deleteFeedbackFile` -- all in `state-tools.ts`.

### 3e. Author-type guards

Two access contexts exist:

| Context | Actor | Tool surface | Can close human feedback? | Can delete pending? |
|---|---|---|---|---|
| MCP tools | Agent | `haiku_feedback_*` | No | No |
| HTTP API | Human (review UI) | `GET/POST/PUT/DELETE /api/feedback/` | Yes | No |

The asymmetry is intentional: agents cannot bypass human feedback, but humans can override agent feedback.

---

## 4. Dependency Graph (Implementation Groups as DAG)

```
                    ┌─────────────┐
                    │  Group 1    │
                    │  schema +   │
                    │  helpers    │
                    └──────┬──────┘
           ┌───────┬───────┼───────┬────────┬─────────┐
           v       v       v       v        v         v
      ┌────────┐┌─────┐┌──────┐┌──────┐┌────────┐┌────────┐
      │Group 2 ││Grp 5││Grp 6 ││Grp 10││Grp 11  ││        │
      │haiku_  ││gate ││chg_  ││extern││HTTP    ││ Grp 9  │
      │feedback││check││req   ││detect││CRUD    ││enforce │
      │tool    ││     ││writes││      ││        ││(indep) │
      └───┬────┘└──┬──┘└──────┘└──────┘└───┬────┘└────────┘
          │        │                        │
    ┌─────┴─┐  ┌───┴──┐                ┌───┴───┐
    │Group 3│  │Grp 8 │                │Grp 12 │
    │CRUD   │  │addit.│                │Review  │
    │tools  │  │elab. │                │App UI  │
    └───────┘  └──────┘                └───────┘
          │
    ┌─────┴─┐
    │Group 7│
    │subagt │
    │prompt │
    └───────┘

    ┌────────────────────────┐
    │ Group 4 (rename Sentry │──── must land before/with Group 2
    │ haiku_feedback ->      │     (name collision avoidance)
    │ haiku_report)          │
    └────────────────────────┘

    ┌────────────────────────┐
    │ Group 13 (prototype    │──── after Groups 5, 7, 8 finalized
    │ visual updates)        │
    └────────────────────────┘
```

**Critical path:** 1 -> 2/4 -> 5 -> 8 (longest chain)

**Fully independent:** Group 9 (enforce-iteration fix) -- no dependency on the feedback model.

**Parallelizable after Group 1:** Groups 5, 6, 10, 11 all depend only on Group 1's helpers.

---

## 5. Architectural Decisions

### Why file-per-feedback (not a database or JSON array)

1. **Git-native persistence.** Feedback files live in `.haiku/` and are committed via `gitCommitState`. They survive session restarts, context compaction, agent crashes, and `/clear`. A JSON array in `state.json` would work but creates merge conflicts when multiple agents write concurrently.
2. **Per-item granularity.** Each file is independently addressable, updatable, and deletable. Git history shows per-feedback provenance. The `FB-NN` identifier maps directly to a filename.
3. **Pattern consistency.** Units are already file-per-unit with frontmatter. Feedback follows the same pattern. No new storage abstraction needed.
4. **Concurrent safety.** Multiple subagents writing feedback simultaneously create separate files. The only collision risk is the NN prefix, mitigated by read-then-increment within a single MCP server process.

### Why gate-phase check (not review-phase)

The review phase's job is to *run* adversarial review agents and create feedback files. The gate phase's job is to *decide* whether to advance. Checking for pending feedback at gate entry means:

1. **Review subagents write findings, then the FSM checks.** The temporal ordering is correct: create first, check second.
2. **All feedback sources converge at one checkpoint.** Whether feedback came from subagents, the review UI, external PR comments, or `haiku_revisit`, the gate check catches it uniformly.
3. **The current review-to-gate FSM advance at line 1625 doesn't need to change.** The FSM still advances from review to gate after quality gates pass. The new check intercepts at gate entry, before any gate resolution logic.

### Why parent-mediated for external comments but direct for subagents

**Subagents call `haiku_feedback` directly** because:
- Task subagents inherit MCP tool access from the parent (confirmed in Claude Code docs -- tools inherited when `tools` field omitted in `AgentDefinition`).
- Direct writes are structurally superior: the parent agent cannot accidentally or intentionally suppress findings.
- Findings persist the instant the subagent writes them, surviving parent crashes or context overflow.

**External PR/MR comments go through the orchestrator** because:
- The orchestrator is the only actor polling for external review status (`checkExternalApproval`).
- Parsing provider-specific comment formats (GitHub review comments, GitLab MR discussions) requires provider-aware code that lives in the orchestrator, not in a subagent.
- For v1, a single summary feedback file per external review cycle is sufficient. Individual comment parsing is a v2 concern.

**Review UI comments go through the HTTP API** because:
- The browser has no MCP tool access. It communicates via HTTP endpoints on the localhost server.
- Each comment becomes a `POST /api/feedback/{intent}/{stage}` call, creating individual feedback files server-side.
- The "Request Changes" submit then only needs to record the decision, not relay comment content.

### Why rename `haiku_feedback` (Sentry) to `haiku_report`

The name `haiku_feedback` is the natural, unambiguous name for the feedback-file creation tool. The existing Sentry bug-report tool occupies this name (`server.ts:349`). Renaming to `haiku_report` is semantically accurate (it reports bugs/feedback to the team) and frees the name for the primary use case. The corresponding skill is already `/haiku:report`.

### Why `visits` counter instead of a boolean

A counter enables:
- Knowing how many revisit cycles a stage has been through (useful for telemetry, safeguards, and the `visit` field on feedback files).
- Setting thresholds (e.g., "if visits > 3, escalate to human" -- future enhancement).
- Distinguishing first-pass elaborate (full decomposition) from revisit-pass elaborate (additive only).

---

## 6. File System Layout

```
.haiku/intents/{slug}/
  intent.md                          # intent frontmatter (unchanged)
  stages/{stage}/
    state.json                       # + visits: number
    units/
      unit-01-*.md                   # + closes: [FB-NN] (when visits > 0)
    feedback/                        # NEW directory
      01-descriptive-slug.md         # feedback file
      02-another-finding.md          # feedback file
      ...
```

---

## 7. Integration Points Summary

| Source | Creates feedback via | Origin value | Author type |
|---|---|---|---|
| Review subagent | `haiku_feedback` MCP tool (direct) | `adversarial-review` | `agent` |
| Parent agent | `haiku_feedback` MCP tool | `agent` | `agent` |
| `haiku_revisit` with reasons | `writeFeedbackFile` (internal) | `agent` | `agent` |
| Review UI "Request Changes" | `POST /api/feedback/` HTTP endpoint | `user-visual` | `human` |
| Review UI general feedback | `POST /api/feedback/` HTTP endpoint | `user-chat` | `human` |
| External PR changes_requested | `writeFeedbackFile` (orchestrator internal) | `external-pr` | `human` |
| External MR changes_requested | `writeFeedbackFile` (orchestrator internal) | `external-mr` | `human` |
| `changes_requested` handler (legacy path) | `writeFeedbackFile` (orchestrator internal) | `user-visual` / `user-chat` | `human` |

All paths converge at the gate-phase pending-feedback check. One checkpoint, many sources.
