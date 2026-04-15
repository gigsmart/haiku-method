# Design Decisions: Universal Feedback Model and Review Recovery

---

## Decision 1: Universal Feedback Currency

### Choice

All feedback — regardless of source — persists as files in `.haiku/intents/{slug}/stages/{stage}/feedback/NN-{slug}.md` using a single shared schema (frontmatter with `status`, `origin`, `author`, `author_type`, `visit`, `source_ref`, `addressed_by`; markdown body).

### Alternatives Considered

1. **Per-source handling.** Each feedback source (adversarial review, external PR, user annotations, user chat, agent-discovered) gets its own storage location, schema, and FSM check. Review agent findings go in `review-findings/`, external PR comments in `pr-comments/`, user annotations in `annotations/`, etc.

2. **Database-backed feedback store.** Use SQLite or a JSON state file to track feedback items rather than individual markdown files.

3. **In-memory feedback with periodic flush.** Keep feedback in the MCP server's memory and write to disk only at phase boundaries.

### Rationale

One FSM check — count files in `feedback/` where `status: pending` — handles every source uniformly. No per-source branching in the orchestrator, no source-specific phase handlers, no separate query logic for "did any review agent find something" vs. "did the user leave a comment." The FSM doesn't care *who* left feedback or *how* — it only cares whether pending feedback exists. This is the simplest possible structural gate.

File-per-item aligns with the existing H·AI·K·U persistence model (units are files, knowledge docs are files, state is files). Git tracks every change. Items are human-readable, diffable, and survive any runtime failure.

### Tradeoffs

- **Pro:** One code path for all feedback sources. Dead-simple FSM gate logic. Git-backed durability. Human-readable.
- **Pro:** New feedback sources (e.g., CI failure annotations) require zero FSM changes — just write a file with the right schema.
- **Con:** Filesystem I/O on every `haiku_run_next` to count pending items. Acceptable at expected scale (<20 items per stage).
- **Con:** No relational queries (e.g., "all feedback across all intents by author"). Acceptable — feedback is stage-scoped by design.

---

## Decision 2: Direct Subagent Feedback Persistence

### Choice

Review subagents call the `haiku_feedback` MCP tool directly to persist findings as feedback files the instant they are discovered. Subagents inherit MCP tool access from the parent agent per Claude Code documentation (tools are inherited when the `tools` field is omitted in the `Task` `AgentDefinition`).

### Alternatives Considered

1. **Parent-mediated relay.** Subagents return findings as structured text. The parent agent parses the findings and writes feedback files on their behalf.

2. **Shared memory / IPC.** Subagents write to a shared in-memory store that the parent flushes to disk after all subagents complete.

3. **Subagent stdout parsing.** Subagents emit findings in a structured format (JSON lines, etc.) that the orchestrator captures and converts to feedback files.

### Rationale

Parent-mediated relay introduces a single point of failure: the parent agent's context window. If the parent crashes, compacts, overflows, or gets `/clear`-ed between receiving subagent findings and writing them to disk, findings are lost. This is the exact bug the feedback model is designed to fix.

Direct persistence eliminates the middleman entirely. Each finding hits disk the moment the subagent identifies it. There's no window of vulnerability between "finding discovered" and "finding persisted." The parent agent cannot accidentally or intentionally suppress findings because it never touches them — the subagent wrote them directly.

Claude Code's `Task` tool documentation confirms that subagents inherit MCP tool access from the parent when the `tools` field is omitted. Review subagents are already spawned this way (`orchestrator.ts:3142`). No infrastructure change needed.

### Tradeoffs

- **Pro:** Zero context-loss risk. Findings persist the instant they're discovered.
- **Pro:** Parent agent's job simplifies to: spawn subagents, wait, call `haiku_run_next`.
- **Pro:** No new infrastructure — uses existing MCP tool access inheritance.
- **Con:** Subagent prompt template must be updated to instruct `haiku_feedback` calls. Subagents that fail mid-execution may leave partial findings on disk (acceptable — partial findings are better than zero findings).
- **Con:** Each subagent feedback write triggers a `gitCommitState`, so N findings = N commits. Acceptable for traceability; can batch in v2 if noisy.

---

## Decision 3: Auto-Revisit on Pending Feedback (No Agent-Approval Tool)

### Choice

At the review-to-gate transition, the orchestrator counts pending feedback files. If the count is greater than zero, the FSM rolls the phase back to `elaborate` and increments `state.visits`. The absence of pending feedback IS the approval signal. There is no `haiku_stage_approve` tool.

### Alternatives Considered

1. **Explicit approval tool (`haiku_stage_approve`).** After review agents run, the parent agent calls an approval tool that checks feedback and either approves or rejects.

2. **Threshold-based gate.** Allow advancement if pending feedback count is below a configurable threshold (e.g., "up to 2 LOW-severity items allowed").

3. **Agent-driven resolution.** After review agents write findings, the parent agent fixes them inline and marks them `addressed` before calling `haiku_run_next`, avoiding the rollback entirely.

### Rationale

An explicit approval tool is a conversational enforcement mechanism dressed up as a structural one. The agent can choose not to call it, call it at the wrong time, or be coached to call it regardless of findings. The whole point of the feedback model is to remove agent discretion from the enforcement path.

By making the FSM's own file-count check the sole gatekeeper, the approval signal is structural: the only way to advance is for every feedback item to be in a non-pending state. Agents can mark agent-authored feedback as `addressed` or `rejected`, but they cannot close human-authored feedback. The FSM checks the files — not the agent's claim about the files.

No tool means no bypass vector. The gate is the filesystem state itself.

### Tradeoffs

- **Pro:** Structurally un-bypassable. Agents can't skip what they can't call.
- **Pro:** Simpler API surface — no approval tool to document, test, or maintain.
- **Pro:** Author-based guards (agents can't close human-authored feedback) provide a natural trust boundary without extra tooling.
- **Con:** Every pending feedback item blocks advancement, even LOW-severity agent-authored items. Could slow down stages with noisy review agents. Mitigation: agents can `reject` their own LOW-severity findings with a reason.
- **Con:** No "override" mechanism for humans who want to advance despite pending feedback. The user must explicitly close or reject remaining items. This is intentional — it forces conscious acknowledgment.

---

## Decision 4: Additive Elaborate Mode with `closes: [FB-NN]`

### Choice

When `visits > 0` and completed units exist, the elaborate phase adds NEW units only. Each new unit must declare `closes: [FB-NN, ...]` in its frontmatter, mapping to the feedback items it addresses. Completed units from prior visits are read-only — they cannot be edited or re-executed.

### Alternatives Considered

1. **Re-elaborate everything.** On revisit, throw away all units and re-elaborate from scratch, incorporating feedback into the fresh plan.

2. **Edit-in-place.** Allow modifications to completed units' descriptions and re-execution of previously completed units.

3. **Patch units.** Create "patch" units that reference and modify the output of prior units without a formal `closes:` linkage.

### Rationale

Completed units represent merged code (in discrete mode) or committed work (in continuous mode). You can't un-merge a PR. You can't un-commit code that's been pushed and built against. The only safe operation is to add new units that layer fixes on top.

The `closes: [FB-NN]` declaration creates an explicit, auditable link between feedback and the units that address it. During the next review cycle, review agents can verify that each feedback item was actually addressed by inspecting the units that claim to close it. This is analogous to GitHub's "Fixes #123" convention — it creates traceability.

Read-only completed units prevent the dangerous pattern of modifying previously-reviewed work. If a completed unit needs changes, the correct approach is a new unit that supersedes the relevant parts.

### Tradeoffs

- **Pro:** Safe by construction — can't break already-merged work.
- **Pro:** Auditable — every feedback item maps to the unit(s) that address it.
- **Pro:** Review agents can verify feedback resolution by checking `closes:` linkages.
- **Con:** Generates more units over time (additive, not consolidating). A stage with many revisit cycles accumulates units. Acceptable — clarity over brevity.
- **Con:** Requires the elaborate instruction builder to include pending feedback items in the prompt and validate `closes:` references. More complex elaborate logic.
- **Con:** Edge case: a feedback item may require changes that span multiple completed units. The new unit must address all affected areas in a single coherent change. This is a constraint the elaborating agent must handle.

---

## Decision 5: `haiku_feedback` Name Collision Resolution

### Choice

Rename the existing `haiku_feedback` MCP tool (Sentry bug-report submission, `server.ts:349`) to `haiku_report`. The `haiku_feedback` name is then used for the new review-finding feedback tool.

### Alternatives Considered

1. **Name the new tool `haiku_review_feedback` or `haiku_finding`.** Keep the existing Sentry tool name unchanged.

2. **Name the new tool `haiku_stage_feedback`.** Scopes the name to stages.

3. **Namespace both: `haiku_feedback_report` (Sentry) and `haiku_feedback_create` (new).** Split the namespace.

### Rationale

"Feedback" semantically maps to the new concept: structured findings from review agents, users, and external sources. The existing Sentry tool is a bug report submission mechanism — "report" is a more accurate name for what it does ("report a bug to the team").

Renaming the existing tool is less invasive than it appears: the tool is called from the `/haiku:report` skill, which already uses the word "report." The rename aligns the tool name with the skill name. The `/haiku:report` skill's implementation references the tool by name and needs a one-line update.

Keeping `haiku_feedback` for the new tool means agents writing review findings use the most natural, discoverable name. No cognitive overhead of remembering `haiku_review_feedback` vs. `haiku_feedback`.

### Tradeoffs

- **Pro:** Semantic clarity — "feedback" = review findings, "report" = bug reports.
- **Pro:** Aligns tool name with skill name (`/haiku:report`).
- **Pro:** Most natural name for the high-frequency use case (review subagents calling it repeatedly).
- **Con:** Breaking change for any external documentation or muscle memory referencing `haiku_feedback` as the Sentry tool. Low impact — the tool is used infrequently and only through the `/haiku:report` skill.
- **Con:** Requires updating `server.ts`, the skill definition, and any tests that reference the old name.

---

## Decision 6: Gate-Phase Feedback Check Placement

### Choice

The pending-feedback check lives in the gate phase handler, not the review phase handler. When the gate handler fires (after review agents have completed and the parent calls `haiku_run_next`), it reads the feedback directory and counts pending items. If any exist, it rolls the phase back to `elaborate` and increments `visits`.

### Alternatives Considered

1. **Review phase handler check.** Don't advance the FSM to gate at `orchestrator.ts:1625`. Instead, after review agents complete, the next `haiku_run_next` re-enters the review handler, which checks feedback and decides whether to advance to gate or roll to elaborate.

2. **Post-review callback.** Add a new FSM phase (`review-check`) between review and gate that handles the feedback check.

3. **Hook-based check.** Run the feedback check as a hook (like quality gates) rather than inline in the phase handler.

### Rationale

The current FSM flow advances to gate *before* review agents run (`fsmAdvancePhase` at line 1625). Changing this behavior would require restructuring the review phase handler's control flow — it currently returns the review action payload after advancing to gate, and the parent agent receives the instruction to spawn subagents.

Placing the check in the gate handler is minimally invasive. The FSM is already at gate when the parent calls `haiku_run_next` after review agents complete. The gate handler is the natural next tick. Adding a feedback check at the top of the gate handler — before any gate logic (auto, ask, external, compound) — intercepts the flow cleanly. If pending feedback exists, it short-circuits the gate and rolls to elaborate. If not, the gate proceeds normally.

This works *with* the existing FSM flow rather than against it.

### Tradeoffs

- **Pro:** Minimally invasive — no changes to the review phase handler's advance-then-return pattern.
- **Pro:** Works with the existing FSM flow, not against it.
- **Pro:** Single, clear check point — the gate handler is the funnel all review outcomes pass through.
- **Con:** The FSM briefly sits at `gate` phase while review agents are running. Semantically, it's still "in review" from the user's perspective. This is an existing quirk, not a new one — the feedback check doesn't make it worse.
- **Con:** If someone adds logic to the gate handler above the feedback check, it could fire before feedback is evaluated. Mitigation: the check must be the very first thing in the gate handler, clearly commented as a precondition.

---

## Decision 7: User Authorship as Flat "user" Literal

### Choice

V1 uses `author: "user"` for all human-sourced feedback. No git config lookup (`git config user.name`), no environment variable resolution, no identity provider integration.

### Alternatives Considered

1. **Git identity.** Read `git config user.name` and `git config user.email` to populate the author field.

2. **Environment variable.** Use `$USER`, `$LOGNAME`, or a custom `$HAIKU_USER` env var.

3. **MCP session identity.** Extract identity from the MCP server's session context or authentication headers.

### Rationale

The MCP server has no reliable runtime mechanism for human identity resolution. `git config` may not be set in all environments (CI, containers, fresh machines). Environment variables are inconsistent across platforms. The MCP protocol doesn't carry authenticated user identity.

More importantly, the feedback model's trust boundary doesn't require user identity — it requires the distinction between `author_type: human` and `author_type: agent`. An agent cannot close human-authored feedback regardless of which specific human wrote it. The structural guard is "was this written by a person or a machine," not "was this written by Alice or Bob."

V1 ships without user identity. If multi-user feedback attribution becomes necessary (e.g., team code review with multiple reviewers), user identity can be layered in via git config or provider-authenticated sessions in a future version.

### Tradeoffs

- **Pro:** Zero configuration required. Works in every environment without setup.
- **Pro:** No privacy concerns — doesn't scrape usernames from the system.
- **Pro:** The trust boundary (human vs. agent) works without identity resolution.
- **Con:** Multi-reviewer scenarios can't distinguish who left which feedback. All human feedback looks the same. Acceptable for v1 — single-developer workflow is the primary use case.
- **Con:** If a future version adds identity, existing feedback files will have `author: "user"` with no way to retroactively attribute them. Acceptable — old feedback doesn't need attribution.

---

## Decision 8: `haiku_revisit` with Optional Reasons

### Choice

The existing `haiku_revisit` tool is extended to accept an optional `reasons: [{title, body}]` parameter. When called with reasons, it writes each reason as a feedback file (origin: `user-chat` or `agent`) and then rolls the FSM phase back. When called without reasons, it returns a stopgap message instructing the agent to collect reasons from the user before retrying.

### Alternatives Considered

1. **Separate `haiku_fail` tool.** Create a dedicated tool for "stage failed, go back" that always requires reasons.

2. **Revisit without feedback integration.** Keep `haiku_revisit` as-is (just rolls the phase back) and have the agent manually call `haiku_feedback` for each reason before calling revisit.

3. **Mandatory reasons (no optional path).** Always require reasons — fail the tool call if reasons are omitted.

### Rationale

`haiku_revisit` already handles go-back semantics — rolling the FSM phase backward, adjusting stage state, and managing the transition. Adding feedback-file creation to the same tool keeps the operation atomic: one call both records why the revisit is happening and executes the rollback. No risk of the agent forgetting to write feedback before revisiting, or writing feedback but failing to revisit.

A separate `haiku_fail` tool duplicates the go-back mechanics and adds API surface for the same semantic operation. "Revisit with reasons" and "fail with reasons" are the same thing from the FSM's perspective — the stage rolls back and feedback explains why.

The optional path (no reasons → stopgap) handles the case where the user says "go back" without explaining why. The agent gets a clear instruction: "collect reasons first." This is better than silently creating a revisit with no feedback trail.

### Tradeoffs

- **Pro:** Atomic operation — feedback creation and FSM rollback happen together.
- **Pro:** No new tool — extends an existing concept rather than adding API surface.
- **Pro:** The stopgap path guides agents toward proper feedback collection rather than failing hard.
- **Con:** Overloads the `haiku_revisit` tool with two behaviors (with/without reasons). Slightly more complex implementation.
- **Con:** The stopgap message is conversational guidance, not structural enforcement. An agent could theoretically call revisit without reasons repeatedly. Mitigation: the stopgap doesn't execute the revisit — it returns without rolling back, so the agent can't bypass feedback by spamming empty revisits.
