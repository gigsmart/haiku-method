---
title: H·AI·K·U Studio Architecture — Boundaries, Lifecycle, and Hat Patterns
audience: studio authors, plugin maintainers, reviewers
status: canonical
---

# H·AI·K·U Studio Architecture

Canonical reference for how studios, stages, units, hats, and feedback fit together. Every studio under `plugin/studios/` MUST conform. Every reviewer of a studio change MUST check the change against this doc.

**Conflict resolution:** when this document and the implementation disagree, the default presumption is that this document captures the intended target state and the implementation should be brought into line — UNLESS one of the following applies:
- The conflict is a documentation bug (this doc misrepresents what was actually agreed; fix the doc).
- A specific implementation choice has shipped and is in production use; revising to match this doc would break working behavior. In that case, file a revision proposal that updates this doc first, then change the implementation in a follow-up.

This is consistent with `CLAUDE.md` and `.claude/rules/architecture-prototype-sync.md`: the canonical source of truth depends on what's drifting from what. For runtime visualizations (the prototype), the orchestrator code is canonical when they conflict. For structural rules across studios/stages/hats/feedback, this document is canonical because there's no single implementation file that fully encodes them.

## 1. Hard boundaries

### 1.1 Frontmatter is workflow engine-only

Frontmatter on workflow-managed files (`unit-NNN-*.md`, `NNN-*.md` feedback, `intent.md`) is reserved for the workflow engine. Agents MAY write frontmatter when authoring a file (the elaborator drafts a unit with declared inputs/outputs); agents MUST NOT **interpret** frontmatter for any mechanical purpose.

The v4 cursor reads FM fields as the single source of truth for workflow position — there is no per-stage `state.json`. `iterations[]`, `started_at`, `approvals.<role>`, `reviews.<role>`, and `discovery.<agent>` on the unit FM, plus `closed_at`, `iterations[]`, and `targets` on FB FM, are the witness fields the cursor walks. The migrator deletes any pre-v4 `state.json` files on first read.

- Reviewer hats do not grep `depends_on:` to detect DAG inversions. The workflow engine rejects bad DAG writes at the source.
- Verifier hats do not validate frontmatter schema. The workflow engine validates schema at every write.
- Fixer hats do not read another unit's frontmatter to plan a change. They read body content.

The single exception is the workflow engine itself (orchestrator code, MCP tool internals). workflow engine internals MAY read FM freely. **No agent-callable MCP tool exposes FM to the agent.**

### 1.2 The workflow engine owns CRUDL on units and feedback

All Create/Read/Update/Delete/List operations on `units/*.md` and `feedback/*.md` go through MCP tools. Generic file Read/Write/Edit on these paths is denied at the hook layer.

| Operation | Unit tool | Feedback tool |
|---|---|---|
| Create / full rewrite | `haiku_unit_write` | `haiku_feedback_write` |
| Read (body + title only) | `haiku_unit_read` | `haiku_feedback_read` |
| Update field | `haiku_unit_set` | `haiku_feedback_update` |
| Delete (pending only) | `haiku_unit_delete` | `haiku_feedback_delete` |
| List | `haiku_unit_list` | `haiku_feedback_list` |

`haiku_unit_get` (which exposes FM) becomes workflow engine-internal only. Agent-callable reads return body + title; FM stays inside the workflow engine.

### 1.3 Lifecycle is forward-only

Units (and feedback files) move forward only:

```
pending → active → completed
```

There are no reverse transitions. No `unwind`, no `reset`, no `revisit_unit`. Once a unit is active or completed, the work it informed cannot be unwound.

In v4, status is derived from on-disk FM fields, not stored as an enum:

| Status | Derivation | Mutable? | Notes |
|---|---|---|---|
| pending | `started_at == null` | yes — body, FM (via `_set`/`_write`), delete via `_delete` | Pre-execute review is the LAST chance to fix |
| active | `started_at != null` AND last `iterations[-1].result == null` | no — locked except for workflow-driven hat progression | Spec is frozen; hat outputs append via workflow engine-controlled flows |
| completed | last `iterations[-1].result == "advance"` AND that iteration is on the terminal hat | no — fully immutable | New work that addresses defects becomes NEW pending units in the next iteration |

**Stage revisit creates new pending units; it never modifies completed units.** If a closed FB diagnoses a defect in a completed unit, the next elaborate iteration creates a corrective unit (or a follow-up unit) — it does not edit the original. Front-loading review (verifier hats + pre-execute review) is therefore critical.

**Stages are not sealed; only intents are.** Forward-only applies to existing units' bytes (immutable post-merge). A previously-merged stage that gains a new unit (e.g. because the feedback engine added corrective work via a stage revisit) becomes ahead-of-main and the cursor automatically rewinds to it via `firstUnmergedStage`. `merge_stage` is a recurring event, not a terminal one.

## 2. Stage anatomy

### 2.1 Phases (cursor-derived)

Every stage moves through the same conceptual lifecycle. In v4 these aren't stored as a `phase:` field — they're **derived** by the cursor from the stage's on-disk shape (units present? hats progressed? reviews signed? approvals signed?). The same phases conceptually apply, but the cursor is the source of truth, not a written marker.

| Phase | When the cursor enters it | Who acts |
|---|---|---|
| **elaborate** | Stage has 0 units (or stage was rewound by feedback) → cursor emits `elaborate` | The elaborate-phase agent (one per stage; named per studio) |
| **execute** | Units exist, wave-ready or mid-hat → cursor emits `start_unit_hat` | Per-unit subagents, one hat at a time |
| **review** | Every unit's hat sequence done, but review-role slots unsigned → cursor emits `dispatch_review` (per role) | Engine-built `spec` reviewer + studio-declared review agents |
| **approve / gate** | Reviews signed, but approval-role slots unsigned → cursor emits `dispatch_approval`, `dispatch_quality_gates`, or `user_gate` | Engine-built quality_gates + configured agents + the human (mode-shaped) |
| **merge** | Every approval signed → cursor emits `merge_stage` | Engine merges the stage branch into intent main |

**Critical:** units are created **only** during the elaborate phase of THIS stage. Execution NEVER creates units. A different stage NEVER creates units for this stage.

Each stage is responsible for its own unit set. `inception` does not pre-author units for `development`. `development`'s elaborate phase authors `development`'s units, drawing on `inception`'s knowledge artifacts as inputs.

### 2.2 Units are stage-appropriate, not universal

The shape of a "unit" depends on the stage's role:

| Stage role | What a unit IS | Examples |
|---|---|---|
| **Research / distillation** (inception, market-research, discovery) | A knowledge topic to investigate | "Competitive landscape", "User persona", "Technical feasibility" |
| **Design / synthesis** (design, prototype, options) | A design component or option set | "Auth flow design", "Navigation pattern", "Data model option A" |
| **Build / execution** (development, firmware, manufacturing) | A discrete piece of work to execute | "Implement /api/users", "Wire up auth middleware", "Ship database migration" |
| **Validation / certification** (validation, certify) | A verification surface to test | "API contract test pass", "FCC pre-cert sweep", "Penetration test of auth boundary" |
| **Operational** (deployment, cutover, launch) | An operational step to perform | "Run blue-green deploy", "Migrate production data", "Flip DNS" |
| **Adversarial / security** (software/security, security-assessment) | An attack surface or threat boundary | "Auth flow surface", "Data layer surface", "Public API surface" |

A studio author defines what a unit IS for each of their stages by writing the stage's elaborate-phase contract.

### 2.3 The rally-race test

Hats form a **rally race**: each hat receives a baton from the previous hat and hands a more-evolved baton to the next. **If the baton between two hats does not matter, they are not a hat sequence — they are a list of activities and need a different structure.**

Failure modes:
- Activities that run independently and don't pass anything meaningful between them are stage-level activities, not hats. Express them as separate stage phases or as parallel review-agents, not as `hats:`.
- Activities where hat N+1 doesn't actually consume hat N's output are misnamed hats; restructure or rename.

## 3. Hat sequence pattern: plan → do → verify

Every stage's `hats:` list MUST follow `plan → do → verify`, in that order, as the leading three roles. Additional hats (e.g., adversarial loops) MAY follow but never precede.

```yaml
hats: [planner, doer, verifier]                           # minimum
hats: [planner, doer, verifier, red-team, blue-team]      # plan-do-verify + adversarial
```

### 3.1 Hat-name discipline (CRITICAL)

**Hat names MUST be distinct from phase names.** The prior model used `elaborator` as both a hat name and the elaborate phase, which created confusion at every layer of the architecture (this document, the orchestrator, the per-stage hats).

Reserved phase names that MUST NOT be used as hat names: `elaborate`, `execute`, `review`, `gate`. Stage-appropriate hat names instead:

| Stage role | Plan hat | Do hat | Verify hat |
|---|---|---|---|
| Research / distillation | `researcher` | `distiller`, `synthesizer` | `verifier`, `validator` |
| Design / synthesis | `designer`, `architect` | `synthesizer`, `composer` | `design-reviewer`, `verifier` |
| Build / execution | `planner`, `architect` | `builder`, `engineer`, `implementer` | `reviewer`, `verifier` |
| Validation / certification | `analyst`, `planner` | `tester`, `validator` | `auditor`, `certifier` |
| Operational | `coordinator`, `planner` | `operator`, `executor` | `verifier`, `qa` |
| Adversarial | `threat-modeler` | `red-team`, `attacker` | `blue-team`, `security-reviewer` |

### 3.2 Plan role

Reads the stage inputs (decisions, knowledge from prior stages, sibling units' outputs) and produces an internal plan or structured spec to guide the do role. **Baton handoff: plan artifact.**

### 3.3 Do role

Executes the plan. Produces the artifact(s) the unit is responsible for. **Baton handoff: the unit's body content.**

### 3.4 Verify role

Terminal hat. Validates the do role's output against the stage's body-level quality rules. Calls `haiku_unit_advance_hat` (success) or `haiku_unit_reject_hat` (failure). **Baton: validated output OR a structured rejection that names the failed criterion.**

The verify role's mandate is **body-only**. It does not read frontmatter for mechanical checks. Examples of legitimate verify-role rules:
- Are all sections of the unit body populated with substantive content?
- Does the body contradict any open Decision in the intent's decision register?
- Is the body internally consistent (does it cite sibling units' content correctly)?
- Does the body answer the unit's own open questions?

Examples of illegitimate verify-role rules (these are workflow engine responsibilities):
- ❌ Does `depends_on:` resolve to existing units?
- ❌ Is the YAML frontmatter schema valid?
- ❌ Does the unit's `inputs:` match the prior stage's `outputs:`?

### 3.5 Adversarial loops

Studios with adversarial workflows (security-assessment, software/security, etc.) MAY include adversarial hats AFTER the plan-do-verify triplet. Adversarial hats are exempt from the body-only rule but the plan-do-verify front loop is mandatory.

```yaml
# software/security — units = attack surfaces
hats: [threat-modeler, security-engineer, security-reviewer, red-team, blue-team, attack-resolver]
#       ↑ plan          ↑ do                ↑ verify         ↑ adversarial loop  ↑ adversarial verify
```

## 4. Stage roles in detail

### 4.1 Research / distillation stages (inception-class)

**Purpose:** Take the user's intent ("as a user I want to X") and turn it into a broad set of distinct knowledge artifacts. Market research, user problem, technical landscape, distilled WHY and high-level HOW. Outputs feed every downstream stage.

**Units:** Knowledge topics. Each unit corresponds to one investigable question or knowledge surface.

**Per-unit hat chain:** `researcher → distiller → verifier` (or stage-equivalent names).
- Researcher gathers raw findings on THIS topic
- Distiller turns raw findings into a structured, actionable knowledge artifact for THIS topic
- Verifier validates the artifact

**Baton:** topic shell → research notes → distilled artifact → validated artifact.

**Stage outputs:** Per-topic knowledge artifacts. **NOT** execution-unit specs for downstream stages; downstream stages create their own units in their own elaborate phase.

**Examples:** software/inception, hwdev/inception, libdev/inception, gamedev/concept, hwdev/requirements, product-strategy/discovery.

### 4.2 Design / synthesis stages

**Purpose:** Take the upstream knowledge and translate it into a designed solution. Architectural design, UX design, atomic design, API design.

**Units:** Design components or option sets. The DAG reflects the studio's design discipline (atomic design has hierarchy: atoms → molecules → organisms; software design might have layers: data → service → API).

**Per-unit hat chain:** `designer → synthesizer → verifier` (or equivalent).

**Examples:** software/design, hwdev/design, libdev/inception's API surface portion (currently bundled with inception — see §6 known issues).

### 4.3 Build / execution stages

**Purpose:** Take the designed solution and build it. Source code, hardware boards, training content, marketing assets.

**Units:** Discrete executable pieces of work. Each unit's spec includes acceptance criteria, completion criteria, executable verification (`quality_gates:`).

**Per-unit hat chain:** `planner → builder → reviewer` (or equivalent).

**This is the only stage role where execution-unit specs (with `depends_on:`, `quality_gates:`, executable verify-commands) make sense.** They're authored in build-stage's elaborate phase, NOT in upstream stages.

**Examples:** software/development, hwdev/firmware, hwdev/manufacturing, libdev/development.

### 4.4 Validation / certification stages

**Purpose:** Verify the built product against requirements / standards / contracts.

**Units:** Verification surfaces — one per testable boundary or compliance area.

**Per-unit hat chain:** `analyst → tester → certifier` (or equivalent).

**Examples:** hwdev/validation, software/security (as adversarial-loop variant), quality-assurance/certify, compliance/certify.

### 4.5 Operational stages

**Purpose:** Perform a step in deploying or operating the system.

**Units:** Operational steps. Often sequential (cutover step 1 must complete before step 2).

**Per-unit hat chain:** `coordinator → operator → verifier` (or equivalent).

**Examples:** software/operations, migration/cutover, marketing/launch, dev-evangelism/publish.

## 5. Workflow tick semantics

Everything in this document — phases, hats, fix loops, gates — runs on top of one foundational primitive: the **tick**. Studio authors don't usually need to think about tick mechanics, but every runtime contract in the system rests on this section. Plugin maintainers MUST understand it before changing the workflow engine.

### 5.1 What a tick is

A **tick** is one call to `haiku_run_next`. It is the agent's **only** forward-driving verb. There is no other tool the agent can call to "advance the workflow" — every advance, every wave, every stage transition, every escalation, every revisit is the result of a tick.

The shape of every tick:

1. The agent calls `haiku_run_next { intent: "<slug>" }`.
2. The workflow engine reads on-disk state (intent.md frontmatter, every unit.md and feedback.md across every stage, studio config) and derives the current **cursor position** via `derivePosition`.
3. The cursor returns one `CursorAction` describing the next concrete step (or null for mid-wave noop).
4. `run-tick.ts` maps the cursor action to an `OrchestratorAction` and returns it to the agent.
5. The agent executes the action and at some point calls `haiku_run_next` again.

That's the entire loop. The agent never asks "what should I do?" — they call `haiku_run_next` and the engine answers.

### 5.2 The cursor model — three tracks

The v4 cursor is a **pure observation function**. `derivePosition(slug)` reads disk, walks three tracks in priority order, and returns one action:

1. **Track C — drift.** Run a content-hash sweep over every signed witness on the active stage (unit reviews, output approvals, discovery records, intent-scope approvals). Any mismatch → `drift_detected`. Drift is dedup'd against open drift FBs by `source_ref` so a fired FB suppresses re-emission until it closes.
2. **Track B — feedback.** Walk every stage from index 0 through the active stage, then intent-scope. Any open FB → emit the next fix-hat dispatch (`start_feedback_hat`) or close action (`close_feedback`) for it. Cross-stage routing is purely by file location: an FB sitting in `stages/inception/feedback/` rewinds the cursor to inception's fix loop, regardless of where it was filed.
3. **Track A — intent.** On the active stage (first stage whose branch is not merged into intent main), walk the per-stage state machine: gate priority chain → wave logic → review track → approval track → `merge_stage`. The cursor's per-stage walk is described in §5.4 below.

After all three tracks return null and every stage is merged, the cursor walks intent-scope approvals (`spec`, `continuity`, `user`) and emits `intent_review` per missing role, then `merge_intent`, then `sealed`.

### 5.3 Why this model matters

The cursor is the engine's **reconciliation point**. Four properties fall out:

1. **State on disk is the truth.** No state.json, no in-memory tick state. Every cursor walk recomputes from FM. The agent does not hold workflow state in their context — anything they think they remember about "what wave we're on" or "which hat is next" is incidental. The next tick will tell them what's actually next.

2. **Recovery is mechanical.** After any failure (subagent crash, partial write, agent confusion), calling `haiku_run_next` re-derives the right next step. There is no hidden state to corrupt and no manual recovery path required for most failures — the engine reconstructs everything from disk.

3. **Composition is pure.** `derivePosition` is a pure function of `(disk, studio config) → CursorAction | null`. Every cursor walk is testable in isolation; track ordering composes without subtle bugs; the engine's behavior is deterministic given the same disk state.

4. **No LLM in the workflow-position decision.** The cursor is straight TypeScript. The LLM consumes the cursor's emitted action; it does not vote on "what comes next."

The agent's contract is one sentence: **receive instruction, do what it says, call `haiku_run_next` unless this instruction is terminal.**

### 5.4 Per-stage cursor walk (Track A)

When the active stage is set, `walkIntentTrack` evaluates these conditions in order and returns the first match:

| Order | Condition | Cursor action | Notes |
|---|---|---|---|
| 1 | Stage declares `requires_design_direction: true` and intent.md has no recorded direction for this stage | `design_direction_required` | Two-phase gate: select then surface-once |
| 1' | Direction recorded but not yet `surfaced_at` | `design_direction_complete` or `design_direction_uploaded` | One-shot surface so the agent reads annotations before elaborate |
| 2 | Stage ships `clarify/*.md` and `clarifications[<stage>]` is missing on intent.md | `clarify_required` | Per-stage Q&A captured before discovery |
| 3 | Studio declares `discovery/*.md` artifacts and any wave-ready unit lacks `discovery.<agent>` | `discovery_required` | One discovery agent per missing record per unit |
| 4 | Stage has 0 units | `elaborate` | Author the stage's unit set |
| 5 | One or more units are in-flight (started, last iteration result == null) | null (mid-wave noop) | Wait for in-flight subagents to terminate |
| 6 | Wave-ready units (started_at == null and depends_on all terminal-advanced) | `start_unit_hat` (first hat) | Wave dispatch — N subagents in parallel |
| 7 | Started units need their next hat | `start_unit_hat` (next hat per `nextHatForUnit`) | Hat advancement; reject rewinds one hat |
| 8 | All hat sequences done; some review role unsigned | `dispatch_review` (per role) or `user_gate { gate_kind: "spec" }` for the `user` role | `spec` (engine-built) → studio review agents → `user`; mode-shaped (autopilot trims to `[spec]`) |
| 9 | All reviews signed; some approval role unsigned | `dispatch_quality_gates`, `dispatch_approval` (per role), or `user_gate { gate_kind: "approval" }` | `spec` → `quality_gates` (engine-built) → studio agents → `user`; autopilot trims to `[spec, quality_gates]` |
| 10 | Every approval signed | `merge_stage` | Engine merges stage branch into intent main |

The cursor is intentionally narrow: every condition is a derived predicate over FM. There are no hidden flags, no ambient state, no "phase" field. Position falls out of the data.

### 5.5 The v4 action surface

The cursor emits exactly these `kind` values (mapped 1:1 to `OrchestratorAction.action` for the agent):

| Kind | Source | When |
|---|---|---|
| `select_studio` | `run-tick.ts` pre-cursor gate | `intent.studio` is unset; engine pops the picker, writes the value, re-ticks |
| `select_mode` | `run-tick.ts` pre-cursor gate | `intent.mode` is unset; engine pops the picker, writes the value, re-ticks |
| `select_stage` | `run-tick.ts` pre-cursor gate | Mode is `quick` and `intent.stages[]` is empty |
| `drift_detected` | Cursor Track C | Any signed witness's content hash no longer matches |
| `start_feedback_hat` | Cursor Track B | Open FB needs its next fix hat dispatched |
| `close_feedback` | Cursor Track B | Terminal fix hat advanced; engine stamps `closed_at` and applies `targets.invalidates` |
| `design_direction_required` / `_complete` / `_uploaded` | Cursor Track A pre-elaborate | Stage gates on a chosen direction; one of the three fires depending on phase |
| `clarify_required` | Cursor Track A pre-elaborate | Stage ships `clarify/*.md`; answers not recorded |
| `discovery_required` | Cursor Track A pre-elaborate | Wave-ready unit lacks a required discovery record |
| `elaborate` | Cursor Track A | Stage has 0 units |
| `start_unit_hat` | Cursor Track A | Wave-ready or mid-hat unit batch needs its next hat dispatched |
| `dispatch_review` | Cursor Track A | A non-user review role hasn't signed `reviews.<role>` on one or more units |
| `dispatch_quality_gates` | Cursor Track A | The engine-built `quality_gates` role hasn't signed approvals on one or more units |
| `dispatch_approval` | Cursor Track A | A non-user approval role hasn't signed `approvals.<role>` on one or more units |
| `user_gate` | Cursor Track A | The `user` role is the next unsigned review or approval slot; gate dispatches via review SPA (`ask`) or branch-merge poll (`external` / `await`) |
| `merge_stage` | Cursor Track A | Every approval signed; merge stage branch into intent main |
| `intent_review` | Cursor terminal walk | All stages merged; intent-scope approval `spec`/`continuity`/`user` unsigned |
| `merge_intent` | Cursor terminal walk | Intent-scope approvals signed; ready to seal |
| `sealed` | Cursor terminal walk | `intent.sealed_at` is set; nothing left to do |

The pre-stage chain — `select_studio → select_mode → (quick? → select_stage)` — is the only place orientation choices are made. The agent **never** writes `mode` or `stages` directly; both fields are FSM-driven (rejected by `haiku_intent_set` with `intent_field_engine_only`). `haiku_intent_create` does not accept `mode` or `stages` either — every orientation choice flows through real elicitation.

The agent **never branches on action type for workflow-routing decisions**. They just follow the instruction the action's prompt builder rendered.

### 5.6 Properties this gives us

- **The agent's mental model is two states**: "I have N subagents to spawn" or "I have a terminal — stop." Every tick reduces to one of these.
- **There is no agent-side coordination logic.** Wave numbers, hat sequences, slot management, bolt counters — all engine-internal, derived from FM at read time.
- **Open feedback wins over forward motion.** Track B walks before Track A, so an open FB on stage 0 forces the cursor to dispatch a fix hat against it before any later stage can advance.
- **The engine is the single point of routing truth.** A bug in cursor derivation is the only way to break the workflow — and it's testable as a pure function over fixture state.
- **Recovery is "call `haiku_run_next` again."** No special "resume" tools, no manual state edits, no "undo last action." The engine reconciles from disk every tick.

### 5.7 What changes a tick's outcome

The same intent at the same disk state will produce the same tick result. Things that change a tick's outcome:

- **An agent edits unit/feedback bodies via MCP write tools** (the only sanctioned channels).
- **A subagent advances or rejects a hat** (FM mutation via `*_advance_hat` / `*_reject_hat`, which appends to `iterations[]`).
- **A user approves or rejects at a gate** (signs `reviews.<role>` or `approvals.<role>` on one or more units).
- **A user adds feedback via the review UI** (creates new FB files).
- **An out-of-band file edit** (changes a body hash; Track C surfaces it as drift).

The engine reads disk, derives cursor, emits action. There is no other path.

### 5.8 Migration: v0 → v4

The first time the v4 engine reads a pre-v4 intent (no `plugin_version` field, or major version below 4), the v0→v4 migrator runs once and rewrites it in place:

- **intent.md**: strip deprecated fields (`active_stage`, `phase`, `status`, `completed_at`, `iteration`, `composite`, `intent_reviewed`, `gate_review_*`, `completion_review_*`, `autopilot`); stamp `plugin_version: "4.0.0"`; ensure `approvals: {}`, `started_at: null`, `sealed_at: null`.
- **unit.md**: strip deprecated fields (`status`, `hat`, `bolt`, `hat_started_at`, `iteration`, `visit`, `scope_reject_attempts`); normalize past-tense iteration results (`"rejected"` → `"reject"`, `"advanced"` → `"advance"`); synthesize `approvals.user` for any unit that was previously `status: completed` so the cursor doesn't re-approve it.
- **feedback.md**: strip deprecated fields (`status`, `bolt`, `triaged_at`, `closed_by`, `resolution`, `iteration`, `visit`, `integrator_attempts`, `upstream_stage`); preserve `replies[]` (the conversation thread); synthesize `closed_at` from terminal v3 statuses; default `targets: { unit: null, invalidates: [] }`. Files carrying `upstream_stage:` are physically relocated to that stage's `feedback/` dir with renumbering.
- **stage state.json**: deleted unconditionally — v4 derives stage position from FM.
- **Pre-v4 drift artifacts**: `baseline.json`, `drift-markers.json`, and the `baseline-content/` snapshot dir are deleted from every stage and from intent-scope. v4 uses body-sha256 in FM as the drift witness, so the legacy sidecars are noise.

Migration is best-effort but never destructive of body content. Per-file YAML parse errors are logged and the file is left unmigrated rather than tearing down the whole intent.

## 6. Fix-loop pattern

Findings (FBs) raised by adversarial reviewers are addressed by the fix-loop. The fix-loop is **mechanically identical to unit execution**, with the FB file as the work artifact.

### 6.1 FB-as-unit

When a fix-loop dispatches against an FB:
- The FB file IS the unit. The fixer hats read it, edit its body, and complete it via `haiku_feedback_advance_hat` against the FB (the FB-scoped mirror of `haiku_unit_advance_hat`; the unit-scoped tool cannot target an FB).
- Fixer hats MUST NOT edit unit files. The flagged unit is read-only context (read via `haiku_unit_read`); the fixer's deliverable is the FB body (written via `haiku_feedback_write`) populated with diagnosis, root cause, and recommended action.
- The same plan-do-verify pattern applies. The stage's `fix_hats:` list typically contains the implementer hat (per the `fix_hats must be implementer` repo convention) followed by `feedback-assessor` as the terminal verifier — minimum 2 entries today; longer chains are encouraged for stages where a planner step adds value before the implementer runs. The terminal hat validates the FB body and calls `haiku_feedback_advance_hat` to close the FB.
- workflow engine lifecycle enforcement is identical: FBs go pending → active (in fix-loop) → completed.

### 6.2 Closed FBs as input to the next iteration

A "completed" FB under the FB-as-unit model means its diagnosis is well-formed and the work-of-record is the FB body. The underlying defect is then patched through the next iteration of the upstream stage's elaborate phase, which consumes the FB body as historical diagnosis when authoring new pending units.

In v4 there is no separate `elaborate_revisit` or `feedback_revisit` action. Instead:

- **Closing a fix-hat FB** stamps `closed_at` AND applies `targets.invalidates` to the targeted unit's approvals (clearing them on disk). The cursor on the next tick walks Track A and routes through whichever approval roles got invalidated, re-running the work needed to re-sign them.
- **Cross-stage FB routing** is purely by file location. A finding sitting in `stages/<earlier>/feedback/` rewinds the cursor to that earlier stage's fix loop on the next tick, regardless of where the FB was originally filed. Track B walks every stage from index 0 through the active stage.
- **Stage rewinds** happen automatically when corrective work commits to an earlier stage's branch. That branch goes ahead of intent main and `firstUnmergedStage` returns it on the next tick, pinning the cursor there until it re-merges.

What's strictly enforced:
- Existing completed units are never modified by the fix-loop (the hook blocks unit-file edits; fixer prompts forbid them; the FM is engine-only).
- New corrective work, when authored, becomes new pending units (per §1.3 forward-only).
- The fixer hat's deliverable is the FB body — diagnosis, root cause, recommended action — written via `haiku_feedback_write`. The flagged unit is read-only context via `haiku_unit_read`.

This is why front-loading matters. By the time a defect surfaces at the gate, the original units that contain it are permanent. Corrective work happens on top of them, never to them.

### 6.3 FB classification (haiku_feedback_set_targets)

User-authored FBs land without targets (`target_unit: null`, `target_invalidates: []`). The first hat in the stage's `fix_hats:` chain is conventionally a classifier — it reads the FB body, decides which unit (if any) the finding targets and which approval roles to invalidate on closure, and calls `haiku_feedback_set_targets` to record the decision. Targets are immutable once set; subsequent calls return a stable named error.

Pre-v4 used a separate `triaged_at:` field and a pre-tick triage gate. v4 collapses that into the classifier hat: the FB-as-unit hat chain runs immediately, and the classifier IS the first hat. Cross-stage routing via `haiku_feedback_move` still exists for cases where the FB was filed against the wrong stage entirely.

## 7. Hook boundary

The PreToolUse hook denies generic file Read/Write/Edit on workflow-managed paths. The hook redirects the agent at the appropriate MCP tool.

Denied paths (Read/Write/Edit):
- `.haiku/intents/*/stages/*/units/*.md`
- `.haiku/intents/*/stages/*/feedback/*.md` and `.haiku/intents/*/feedback/*.md` (intent-scope)
- `.haiku/intents/*/intent.md`
- `.haiku/intents/*/stages/*/state.json` (defensive — v4 doesn't write these, but the guard prevents an agent from re-creating one as a workaround for a perceived missing field)
- V-11 baseline-corruption ack and thrash counter paths

Denial messages are tool-specific. For units the agent gets back something like:

```
BLOCKED: Cannot read unit file 'unit-001-foo.md' via generic Read. Unit files are
workflow-managed — use the MCP tool instead:
  haiku_unit_read { intent: "<slug>", stage: "<stage>", unit: "unit-001-foo" }
Generic file access bypasses lifecycle enforcement (pending → active → completed),
frontmatter validation (DAG, schema, cross-references), and integrity sealing.
```

Equivalent redirects exist for feedback (`haiku_feedback_read` / `haiku_feedback_write` / `haiku_feedback`), intent (`haiku_intent_get` / `haiku_run_next`), and settings (`haiku_settings_get` / `haiku_settings_set`).

Bash commands referencing these paths are **soft-warned** (logged, not blocked). The threat model is "honest agent reaches for the wrong tool by habit," not "adversarial agent." Routine MCP usage is the path of least resistance; persistent Bash bypass is anomalous and shows up in audit telemetry.

### 7.1 MCP input gates

Every agent-callable MCP tool gates its input through a TypeBox schema compiled to AJV at module load. Each schema declares `additionalProperties: false`, so unknown fields are rejected at the wire. Failures return a stable named error code — `haiku_unit_write_input_invalid`, `haiku_feedback_advance_hat_input_invalid`, etc. — with an `errors[]` list of `{ path, keyword, message, params }` entries. Agents and tests match on the named code; the human-readable message is allowed to evolve.

This matters for studio authors because it determines how an agent recovers from a typo'd tool call: the engine tells them precisely which field on which tool was wrong, in a format their harness can route. There is no "the handler will catch it" path. See `.claude/rules/schema-definitions.md` for the full schema-authoring contract.

## 8. Known structural issues — status

Tracking the gap between this document and the implementation. Fix the implementation, not the document. Items marked ✅ are reconciled; ⏳ are still ahead.

1. ✅ **`FSM_CONTRACTS_ELABORATE_BLOCK` build-class assumptions.** Split into `FSM_CONTRACTS_ELABORATE_UNIVERSAL` (rules for every stage) and `FSM_CONTRACTS_ELABORATE_BUILD_ADDENDUM` (build-class-only rules, injected only when no per-stage `phases/ELABORATION.md` override exists). All 5 inception-class stages now skip the build-class addendum because they have their own ELABORATION.md.
2. ⏳ **Inception-class stages structurally over-reach.** **Mostly mitigated:** the 5 inception-class stages now have research-stage ELABORATION.md guidance + body-only knowledge-artifact verifier hats, which steer NEW authoring toward knowledge topics. Cleanup of any pre-existing execution-spec drift in these stages' artifacts (in real intents that have already used them) still ahead — but new intents use the corrected guidance.
3. ✅ **Hat name `elaborator` collides with phase name `elaborate`** — renamed to `distiller` (role-correct per §3.1) in all 5 inception-class stages: software/inception, hwdev/inception, hwdev/requirements, libdev/inception, gamedev/concept. Other studios' non-inception `elaborator` hats are correctly the do-hat of build chains and don't have the same collision (optional polish: rename them to stage-appropriate `builder`/`composer`/etc., but not architecturally required).
4. ✅ **Build-class stages need their own ELABORATION.md.** `software/development/phases/ELABORATION.md` was already correct; the Phase 2 rollout added per-stage ELABORATION.md to almost all stages across all 22 studios.
5. ✅ **`haiku_unit_get` migration to workflow engine-internal.** Removed from agent-callable schema (`stateToolDefs`); handler retained for workflow engine-internal callers.
6. ✅ **v3-era state.json + per-stage workflow tracking removed.** v4 derives stage position from FM. The v0→v4 migrator (see §5.8) deletes `state.json` and pre-v4 drift sidecars on first read of any pre-v4 intent.
7. ✅ **`upstream_stage:` cross-stage hint removed.** v4 routes FBs by file location. The migrator strips the field and physically relocates any FB that pointed elsewhere into the target stage's `feedback/` directory (with renumbering).
8. ✅ **`triaged_at:` pre-tick triage gate replaced.** Classification is now the first hat in the stage's `fix_hats:` chain, calling `haiku_feedback_set_targets`. Cross-stage moves still go through `haiku_feedback_move`.
9. ⏳ **`review-agents/cross-stage-consistency.md` files reference FM-derived paths.** Per §1.1 this is FM-interpretation for a mechanical purpose and should be engine-enforced at `haiku_unit_advance_hat` time instead of agent-validated post-hoc. The strict fix: strip these references and add an engine-level output-existence check. The current behavior is defensive validation pending that engine enforcement and is left in place to avoid removing the only existing safety net.

Phase 2 verifier rollout:
- 91/120 stages have an explicit `verifier` (or other verify-class) terminal hat in their `hats:` list.
- The 29 stages without explicit `verifier` already end in a verify-class hat (`reviewer`, `validator`, `assessor`, `auditor`, `qa`, etc.).

Phase 3 adversarial-loop restructure:
- ✅ All 3 previously-flagged adversarial-loop stages (software/security, security-assessment/exploitation, ideation/review) restructured to put plan-do-verify before adversarial hats per §3.5. Added 6 new hat mandate files for the new plan/do/verify roles inserted (security-engineer, attack-strategist, exploit-reviewer, review-planner, synthesizer, reviewer).

Reconciled in v4:
- Architecture document itself, with the boundary rules, lifecycle, hat patterns, FB-as-unit fix-loop semantic, stage-role taxonomy, and the cursor model in §5.
- Path-boundary hook (PreToolUse) denying generic Read/Write/Edit on workflow-managed paths, with redirect messages naming the right MCP tool.
- MCP tool surface for unit/FB CRUDL with TypeBox + AJV input gates and stable named error codes (see `.claude/rules/schema-definitions.md`).
- Lifecycle enforcement on `haiku_unit_set` (active/completed → locked) and `haiku_feedback_update` (terminal-state-protected).
- Both fix-loop dispatches (`review_fix` per-stage and `intent_completion_fix` studio-level) implement FB-as-unit: fixers edit FB body via `haiku_feedback_write`, read flagged units read-only via `haiku_unit_read`, progress through fix_hats via `haiku_feedback_advance_hat`. Closure is engine-driven via the last-hat advance.
- 5 canonical inception-class verifier hats (software/inception, hwdev/inception, hwdev/requirements, libdev/inception, gamedev/concept) — body-only knowledge-artifact validation.
- `CLAUDE.md` cites this document as the canonical structural source of truth.

## 9. Studio-author checklist

When adding or modifying a stage:

- [ ] Stage role identified (research/design/build/validation/operational/adversarial)
- [ ] What a "unit" IS for this stage is documented in the stage's elaborate contract
- [ ] `hats:` list has at least 3 entries
- [ ] First hat is plan-class, second is do-class, third is verify-class
- [ ] Hat names are distinct from phase names (no `elaborate`/`execute`/`review`/`gate`)
- [ ] Each hat-to-hat handoff has a meaningful baton (rally-race test)
- [ ] Verify hat's mandate is body-only (no FM interpretation)
- [ ] If `fix_hats:` is set, it has at least 2 entries — `[<implementer>, feedback-assessor]` is the conventional minimum (the implementer per the `fix_hats must be implementer` rule; `feedback-assessor` as the terminal verifier). Longer plan-do-verify chains are encouraged where a separate planner step adds value before the implementer.
- [ ] Adversarial hats (if any) come AFTER the plan-do-verify triplet
- [ ] Hat mandate files exist for every named hat (`hats/{name}.md`)
- [ ] No mandate file references `depends_on:`, `inputs:`, `outputs:`, `status:`, or any other FM field as something the agent should read or interpret

When adding or modifying an workflow engine tool:

- [ ] Writes that affect frontmatter run the appropriate validators
- [ ] Lifecycle enforcement (pending/active/completed) is checked
- [ ] Read tools return body + title only unless the caller is workflow engine-internal
- [ ] Tool errors name the rule that fired ("status is `active`; units become immutable once started")

## 10. Source of truth

This document supersedes any conflicting guidance in:
- `website/content/papers/haiku-method.md`
- Per-studio `STUDIO.md` files
- Per-stage `STAGE.md` files
- Hat mandate files (`hats/*.md`)
- `FSM_CONTRACTS_ELABORATE_BLOCK` and related orchestrator constants

When a discrepancy is found, fix the downstream artifact, not this document — unless an explicit revision proposal is approved that updates this file first.
