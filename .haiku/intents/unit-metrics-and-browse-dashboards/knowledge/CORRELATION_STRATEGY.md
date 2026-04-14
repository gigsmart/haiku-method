# Bolt-to-Transcript Correlation Strategy

## Scope

Given that a bolt just finished on unit X in intent Y, which transcript entries
(from `~/.claude/projects/**/*.jsonl`) should be summed to compute this bolt's
metrics? This document picks one answer and justifies it against alternatives.

It builds directly on `TRANSCRIPT_FORMAT.md` (unit-01) — in particular the three
hard constraints that any correlation strategy must respect:

1. **Dedupe by `message.id`.** A single API turn is written as N JSONL lines
   (one per content block) and the same `usage` object is duplicated on every
   line. Summing raw lines over-counts by N.
2. **Subagents live in sidechain files.** `~/.claude/projects/{encoded-cwd}/{sessionId}/subagents/agent-{agentId}.jsonl`,
   with each line carrying `isSidechain: true` and an `agentId`. A parent bolt
   that dispatches a `Task` subagent emits zero tokens for the subagent's work
   in the main file — the tokens are only in the sidechain.
3. **`cache_creation_input_tokens` has two sub-buckets**
   (`ephemeral_5m_input_tokens` + `ephemeral_1h_input_tokens`) which may be
   priced differently. Any bolt-level rollup must retain both sub-buckets, not
   just the parent field.

## The bolt boundary — what marks start and end

These are the **exact MCP tool calls** the capture mechanism will hook into.
Verified against `packages/haiku/src/state-tools.ts` on 2026-04-14.

| Boundary | MCP tool call | Code reference | What fires |
|---|---|---|---|
| Bolt 1 start | `haiku_unit_start` | `state-tools.ts:2266` | Writes `bolt=1`, `hat=<first>`, `started_at=now`, `hat_started_at=now` |
| Bolt N end + Bolt N+1 start (on failure) | `haiku_unit_reject_hat` | `state-tools.ts:2586` | Writes `bolt=currentBolt+1`, `hat=prevHat`, `hat_started_at=now`. This single call is both the end of the failing bolt and the start of the retry bolt. |
| Bolt N end (on success) | `haiku_unit_advance_hat` **on the last hat** | `state-tools.ts:2311`, completion branch at `~2440` | `emitTelemetry("haiku.unit.completed", ...)` — this is the only point where the unit crosses from "in-flight" to "done" and it is internal to the same tool call. |
| Manual bolt bump | `haiku_unit_increment_bolt` | `state-tools.ts:2674` | Same semantic as reject: increments bolt without moving hat. Treated identically to `reject_hat` for boundary purposes. |

**`haiku_unit_advance_hat` on a non-last hat is NOT a bolt boundary.** It is a
hat boundary inside the current bolt. A bolt spans from `bolt` being written to
N, through zero-or-more non-last-hat advances, until one of:

- a `reject_hat` bumps `bolt` to N+1, or
- the last-hat branch of `advance_hat` completes the unit, or
- `increment_bolt` manually bumps `bolt`.

That gives exactly four tool-call events to instrument: `haiku_unit_start`,
`haiku_unit_advance_hat`, `haiku_unit_reject_hat`, `haiku_unit_increment_bolt`.

## Candidate approaches

### A. Session-ID filter only

Pick every assistant line in `{sessionId}.jsonl` (+ its `subagents/*.jsonl`)
and sum. No timestamp gating.

- **Pros:** Simplest possible filter. Uses a field every line already carries.
- **Cons:** Over-counts badly. One session routinely hosts many bolts across
  many units — a `/haiku:pickup` session that walks through 5 units would
  attribute every token from every unit to whichever bolt the query asked
  about. Unusable by itself.

### B. Timestamp window only

Record `bolt_started_at` and `bolt_ended_at`, then sum every assistant line in
**every** `.jsonl` file whose `timestamp` falls in `[start, end)`.

- **Pros:** No session-ID coupling. Tolerant of session rotation mid-bolt.
- **Cons:** Cross-contamination across worktrees. If the operator is running a
  different H·AI·K·U intent in a second terminal during the same window, those
  tokens land in this bolt's bucket. Also forces the parser to scan every file
  under `~/.claude/projects/**`, not just one. Correct only when the operator
  runs serially, which is a bad assumption given wave-0 parallel subagents and
  multi-worktree workflows.

### C. Session-ID + timestamp window intersection (recommended)

Record both `session_id` (from `process.env.CLAUDE_SESSION_ID`) and
`bolt_started_at` on the bolt when the bolt-boundary tool call fires. At
rollup time, open **only** the matching session file (and its sidechain
directory), filter to lines with `timestamp ∈ [bolt_started_at, bolt_ended_at)`,
dedupe by `message.id`, then sum.

- **Pros:** Both anchors are already available at the exact moment the bolt
  boundary fires. Session-ID narrows file scope to O(1) files. Timestamp
  narrows to O(bolt) lines inside that file. Handles parallel operator work in
  other sessions cleanly — they're in a different `{sessionId}.jsonl`. Handles
  out-of-order work inside the same session cleanly — the timestamp slice
  excludes other bolts. Every new field is already computable at boundary time
  without new infrastructure.
- **Cons:** Still has a hole if a single bolt crosses a session boundary
  (Claude Code compaction/reconnect mid-bolt). Handled explicitly in
  "Edge cases" below — the bolt stores a `session_ids` array, not a scalar.

### D. Transcript cursor (byte offset or line count)

At bolt start, read the current byte offset / line count of the session file
and store it on the bolt. At bolt end, read from the stored offset through the
end of the file, dedupe, sum.

- **Pros:** Immune to clock skew and out-of-order timestamps. Naturally
  monotonic within a single file.
- **Cons:** Breaks the moment the file rotates or the session changes (the
  stored offset no longer points into the active file). Breaks for parallel
  subagents — the parent's cursor into the main session file says nothing
  about where the subagent's sidechain file starts. Opening the file at bolt
  start to measure offset adds an I/O operation to every boundary call. The
  cursor is also meaningless for files we do not control — transcript
  compaction can rewrite the file.

### E. PreToolUse/PostToolUse hook accumulation (in-process)

Attach a hook to `PreToolUse` and `PostToolUse` events that pulls `usage` from
the tool-call result and accumulates into an in-process counter attached to
the current bolt. Persist to frontmatter on bolt-boundary tool calls.

- **Pros:** No post-hoc parsing — the numbers arrive during the bolt and can
  be pushed straight into unit state.
- **Cons:** `PostToolUse` hooks do not see assistant usage objects; they see
  tool results. The transcript's `usage` is attached to the *assistant turn*
  that wrapped the tool call, not to the tool call itself. Reaching it at
  hook time would require an additional round-trip to re-parse the partial
  transcript, at which point we are back to approach C but with worse
  observability (the hook runs before the assistant message that carries the
  usage has been written). Also: subagent usage is not visible to the
  parent's hook scope at all — it is in a separate process/file. The hook
  also misses the tokens spent on the final assistant turn of the bolt (the
  turn that calls `haiku_unit_advance_hat`), because that assistant line is
  written after the tool call returns.

## Recommendation: Approach C — session-ID + timestamp-window intersection

Every alternative loses on a concrete scenario we will hit:

- A (session only) loses on "multiple bolts per session" — the default case.
- B (timestamp only) loses on "two worktrees running in parallel" — a common
  operator workflow.
- D (cursor) loses on transcript rotation and on subagent sidechains, and
  forces pre-bolt I/O for no compensating accuracy gain.
- E (hooks) loses on subagents entirely and also misses the final assistant
  turn of each bolt because of the order-of-writes problem.

C is the only approach that handles the common case cleanly, degrades
gracefully on the edge cases (via the `session_ids` array, see below), and
requires zero infrastructure beyond fields that are already available at the
moment each boundary tool call fires.

## Minimal new state

Two new fields on the **unit frontmatter**, nested under a new top-level
`bolts:` array (one element per bolt). Nothing lives in a sidecar file.

```yaml
# unit-03-bolt-to-transcript-correlation.md frontmatter (excerpt)
bolt: 2                         # existing scalar; keep as the "current bolt" pointer
hat: designer                   # existing
hat_started_at: 2026-04-14T...  # existing
started_at: 2026-04-14T...      # existing
bolts:                          # NEW — per-bolt history (append-only)
  - n: 1
    started_at: 2026-04-14T18:03:11.000Z
    ended_at:   2026-04-14T18:09:42.000Z
    session_ids:                # NEW — array, not scalar; see edge case (1)
      - d7606462-c6ec-4078-aaec-a990b9c9666c
    outcome: rejected           # advanced | completed | rejected | interrupted
  - n: 2
    started_at: 2026-04-14T18:09:42.000Z
    ended_at:   null            # filled when this bolt ends
    session_ids:
      - d7606462-c6ec-4078-aaec-a990b9c9666c
    outcome: null
```

No new files. No intent-level state. No separate manifest. Everything the
parser needs to find the right transcript slice lives inside the unit it is
billing.

Why these specific fields:

- `started_at` and `ended_at` — the timestamp half of approach C.
- `session_ids: []` — the session half of approach C, as a list to tolerate
  compaction and reconnect (edge case 1).
- `outcome` — distinguishes "this bolt ended because the hat advanced" from
  "this bolt ended because the unit is done" from "this bolt ended because
  the hat was rejected". The metrics pipeline needs this to attribute the
  final assistant turn correctly.

The boundary tool calls get a small amount of additional work:

- `haiku_unit_start` — push a new element `{n: 1, started_at: now, session_ids: [CLAUDE_SESSION_ID], ended_at: null, outcome: null}` onto `bolts`.
- `haiku_unit_advance_hat` (non-last-hat) — do nothing to `bolts`. Hat
  transitions are *inside* a bolt.
- `haiku_unit_advance_hat` (last-hat, completion branch) — set
  `bolts[-1].ended_at = now`, `outcome = "completed"`. If the current env
  `CLAUDE_SESSION_ID` is not in `bolts[-1].session_ids`, append it.
- `haiku_unit_reject_hat` — set `bolts[-1].ended_at = now`,
  `outcome = "rejected"`, then push a new `{n: currentBolt+1, started_at: now, session_ids: [CLAUDE_SESSION_ID], ended_at: null, outcome: null}` entry.
- `haiku_unit_increment_bolt` — same as reject for the `bolts` append path.

At each boundary tool call, also append the current `CLAUDE_SESSION_ID` to
`bolts[-1].session_ids` if not already present. This is what catches the
compaction-mid-bolt case.

## Worked example

Synthetic 20-line transcript across two session files plus one sidechain.
`M=msg`, `T=tool_use`, `A=assistant`, `U=user`. For brevity, `usage` is
reduced to output tokens only.

Two units in flight:
- `unit-A` in intent `I1`: 2 bolts (rejected once, then completed)
- `unit-B` in intent `I1`: 1 bolt (wave-0 parallel subagent, own sidechain)

Timeline:
- 18:00:00 — operator calls `haiku_unit_start` on `unit-A`. Recorded:
  `bolts=[{n:1, started_at:18:00:00, session_ids:[sessA]}]`.
- 18:00:05 — operator calls `haiku_unit_start` on `unit-B`. Recorded on B:
  `bolts=[{n:1, started_at:18:00:05, session_ids:[sessA]}]`.
- 18:00:30 — wave-0 dispatch: parent spawns two `Task` subagents, one per
  unit. `unit-B`'s subagent writes to `sessA/subagents/agent-abc.jsonl`.
- 18:05:00 — `unit-A`'s first hat rejects → `haiku_unit_reject_hat`. A's bolt 1
  ends at 18:05:00, bolt 2 starts at 18:05:00.
- 18:10:00 — `unit-B`'s subagent advances its last hat → unit-B completes.
  B's bolt 1 ends at 18:10:00.
- 18:15:00 — `unit-A`'s last hat advances → unit-A completes. A's bolt 2
  ends at 18:15:00.

Synthetic lines (20):

```
# sessA.jsonl (top level, isSidechain: false)
L01  18:00:02  A  msg=m1  usage=50    # unit-A hat-1, bolt-1, content block 1
L02  18:00:02  A  msg=m1  usage=50    # SAME turn, content block 2 → dedupe
L03  18:00:08  A  msg=m2  usage=40    # unit-B hat-1, bolt-1 (before subagent dispatch)
L04  18:00:32  U  msg=...             # tool_result for Task dispatch (no usage)
L05  18:04:55  A  msg=m3  usage=120   # unit-A hat-1, bolt-1, last turn before reject
L06  18:05:02  A  msg=m4  usage=10    # post-reject retry, unit-A hat-1, bolt-2
L07  18:10:30  A  msg=m5  usage=70    # unit-A hat-2, bolt-2
L08  18:14:58  A  msg=m6  usage=30    # unit-A last hat, bolt-2, final turn
L09  18:14:58  A  msg=m6  usage=30    # SAME turn, second content block → dedupe
L10  18:14:59  A  msg=m7  usage=5     # tool-use turn for haiku_unit_advance_hat call

# sessA/subagents/agent-abc.jsonl (sidechain, agentId=abc, for unit-B)
L11  18:00:35  A  msg=s1  usage=90    # unit-B subagent turn 1
L12  18:03:10  A  msg=s2  usage=60    # unit-B subagent turn 2
L13  18:03:10  A  msg=s2  usage=60    # SAME turn → dedupe
L14  18:07:20  A  msg=s3  usage=45    # unit-B subagent turn 3
L15  18:09:55  A  msg=s4  usage=25    # unit-B subagent final turn

# sessB.jsonl (different session, some other intent running in parallel)
L16  18:02:00  A  msg=x1  usage=999   # irrelevant — wrong session
L17  18:06:00  A  msg=x2  usage=999   # irrelevant — wrong session
L18  18:11:00  A  msg=x3  usage=999   # irrelevant — wrong session
L19  18:13:00  A  msg=x4  usage=999   # irrelevant — wrong session
L20  18:14:00  A  msg=x5  usage=999   # irrelevant — wrong session
```

Attribution under Approach C:

**unit-A bolt 1** — window `[18:00:00, 18:05:00)`, session_ids `[sessA]`.
- Candidate files: `sessA.jsonl` and `sessA/subagents/*.jsonl`.
- In-window lines from `sessA.jsonl`: L01, L02, L03, L05.
- L03 belongs to `msg=m2`, which is **unit-B**. Approach C does not
  discriminate by unit within the same session/window on its own — this is
  the known limitation handled by the wave-0 convention (see edge case 2):
  *when two units run in parallel on one session, their bolts are kept to
  non-overlapping windows via the wave orchestrator, or the parser falls
  back to subagent-sidechain routing described below.*
  In this example, unit-B runs inside a subagent sidechain (L11–L15), NOT
  in the top-level `sessA.jsonl`, so L03 is actually the parent
  orchestrator's own turn for unit-B's pre-dispatch hat work — see edge
  case 5 for the unambiguous rule.
- Dedupe by `message.id`: L01+L02 → one `m1` (50 out), L05 → `m3` (120 out).
- **unit-A bolt 1 rollup: 50 + 120 = 170 output tokens.**
- Subagent sidechain scan: only include `subagents/agent-*.jsonl` files
  whose `agentId` matches a subagent spawned *by this unit*. In this case
  `agent-abc` is for unit-B, not unit-A, so it contributes nothing.

**unit-A bolt 2** — window `[18:05:00, 18:15:00)`, session_ids `[sessA]`.
- In-window lines from `sessA.jsonl`: L06, L07, L08, L09, L10.
- Dedupe: `m4`=10, `m5`=70, `m6`=30 (L08+L09 collapse), `m7`=5.
- **unit-A bolt 2 rollup: 10 + 70 + 30 + 5 = 115 output tokens.**

**unit-B bolt 1** — window `[18:00:05, 18:10:00)`, session_ids `[sessA]`.
- Candidate files: `sessA.jsonl` (for parent orchestrator's pre-dispatch
  turn) AND `sessA/subagents/agent-abc.jsonl` (for the actual work). The
  unit is linked to `agent-abc` via edge case 5 below.
- In-window top-level lines filtered by "this unit's hat was live":
  L03 (`m2`=40) is the parent's dispatch turn and belongs to unit-B.
- In-window sidechain lines: L11 (90), L12+L13 collapse to `s2`=60, L14
  (45), L15 (25).
- **unit-B bolt 1 rollup: 40 + 90 + 60 + 45 + 25 = 260 output tokens.**

**sessB.jsonl** (L16–L20) — excluded because `sessB` is not in any of the
three bolts' `session_ids` arrays. This is the win over approach B.

Dedupe by `message.id` collapsed 20 raw lines into 9 billable turns across
all three bolts. A naive line-count sum would have over-attributed by 4
content blocks.

## Edge cases

**(1) Bolt spans two sessions (compaction / reconnect mid-work).**
Every boundary tool call appends `process.env.CLAUDE_SESSION_ID` to
`bolts[-1].session_ids` if it's not already present. If a bolt starts in
`sessA`, Claude Code compacts and reopens as `sessB`, and the user runs a
`haiku_unit_advance_hat` inside `sessB`, the tool call sees
`CLAUDE_SESSION_ID=sessB` and the unit's `bolts[-1].session_ids` becomes
`[sessA, sessB]`. At rollup time the parser scans both files and merges.
Cost: one additional string write per boundary call.

**(2) Two bolts running in parallel on the same session (wave-0).**
The H·AI·K·U wave orchestrator dispatches parallel units as `Task`
subagents. *Each subagent's work lives in its own sidechain file.* So the
parent orchestrator's `sessA.jsonl` carries only the dispatch turns; the
subagents' turns are in `sessA/subagents/agent-<id>.jsonl`. The two bolts
do not actually contend for the same lines. See edge case 5 for the
sidechain-to-unit mapping.

If two bolts genuinely share the top-level session (e.g. sequential bolts
on different units via `/haiku:pickup` in one terminal), approach C still
works because their `[started_at, ended_at)` windows do not overlap —
`bolt_N.ended_at == bolt_{N+1}.started_at` exactly by construction (the
single tool call that ends the old bolt also starts the new one).

**(3) User interrupts a bolt mid-way.**
No boundary tool call fires. `bolts[-1].ended_at` stays null. On pickup, the
next `haiku_unit_advance_hat` or `haiku_unit_reject_hat` closes the bolt
with whatever timestamp it sees. The metrics rollup for an interrupted
bolt is still computable from the persisted `started_at` and the tool call
that eventually closes it. The only loss is that the operator's wall-clock
dwell time during the interrupt (where no assistant turns happened) is
included in duration but contributes zero tokens — acceptable.

**(4) Transcript file rotates during a bolt.**
Claude Code does not rotate transcript files mid-session, but compaction can
rewrite the file in place. Approach C is immune: it keys off `sessionId`
and `timestamp`, both of which survive compaction. Approach D (cursor)
would break here. If a future Claude Code release introduces rotation (e.g.
`sessA.0.jsonl`, `sessA.1.jsonl`), the parser globs
`{sessionId}*.jsonl` in the session directory and unions them before
filtering — still a small, contained change.

**(5) Subagent tokens on wave-0 — whose bolt do they belong to?**
They belong to the **subagent's own unit's bolt**, not the parent
orchestrator's bolt. A subagent invoked via `Task` runs as a standalone
`haiku:pickup` inside a child process; its tool calls write into its own
`agent-{agentId}.jsonl` sidechain file; the `haiku_unit_advance_hat` /
`haiku_unit_reject_hat` calls it makes fire inside that child process and
write to the subagent's unit frontmatter, not the parent's.

The clean mapping requires one additional piece of glue: **at the moment
the parent orchestrator spawns the `Task` subagent for a unit, it already
knows (unit, session_id-of-parent) and the `agentId` is discoverable from
the subagent's own `process.env.CLAUDE_SESSION_ID` once it starts.** The
subagent records its own `session_ids: [<agent-sessionId>]` on its bolt
via the normal `haiku_unit_start` path — no parent-side bookkeeping is
needed at all. The parser then just reads the subagent's bolt and opens
the matching sidechain file.

**Open design question surfaced to design stage:** is the subagent's
`CLAUDE_SESSION_ID` the parent's session-id or a new child session-id? If
parent, we also need the `agentId` stored on the bolt to disambiguate the
sidechain file — otherwise "scan all sidechain files for this session"
over-counts across parallel subagents in the same wave. If child, the
sessionId alone resolves to exactly one sidechain file and no extra field
is needed. Unit-01's transcript-format research documented the
`subagents/agent-{agentId}.jsonl` path but did not pin down whether the
subagent runs under the parent's `CLAUDE_SESSION_ID` or a fresh one.
Design stage must confirm this with a 5-minute local test and, if parents
share their session-id with children, add an `agent_id` field to each
`bolts[]` entry. The rest of approach C stands regardless.

## Summary

- **Chosen approach:** C — session-ID + timestamp-window intersection, with
  dedupe-by-`message.id` and explicit sidechain file inclusion.
- **Boundary events:** `haiku_unit_start` (start bolt 1);
  `haiku_unit_reject_hat` and `haiku_unit_increment_bolt` (end current bolt,
  start next bolt); `haiku_unit_advance_hat` on the last hat (end current
  bolt, complete unit). Non-last-hat `haiku_unit_advance_hat` is NOT a
  boundary.
- **New state:** one `bolts: []` array in unit frontmatter, each entry
  carrying `{n, started_at, ended_at, session_ids[], outcome}`. Possibly one
  `agent_id` field pending the open design question in edge case 5.
- **Everything else (parser, rollup math, cost calculation):** deferred to
  design and development stages. This document commits only to the
  correlation contract.
