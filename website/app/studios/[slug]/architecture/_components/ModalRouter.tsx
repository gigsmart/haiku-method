"use client"

import { ACTORS } from "../_data/actors"
import { HOOK_BY_NAME } from "../_data/hooks"
import type {
	DerivedStage,
	ModalKind,
	StudioContentEntry,
} from "../_data/types"
import { HtmlBlock, Modal } from "./Modal"
import { renderInline, renderMarkdown, renderMdFile } from "./utils"

interface ModalRouterProps {
	modal: ModalKind | null
	onClose: () => void
	studioContent: StudioContentEntry | null
	stages: DerivedStage[]
}

/** Single source of truth for the modal-shape switch. Each `ModalKind`
 *  case renders a `<Modal>` with the appropriate body. Returns null when
 *  `modal` is null or the case can't resolve required content (e.g. a
 *  stage key that no longer exists in the loaded studio). */
export function ModalRouter({
	modal,
	onClose,
	studioContent,
	stages,
}: ModalRouterProps) {
	if (!modal) return null

	switch (modal.kind) {
		case "actor": {
			const a = ACTORS[modal.actorKey]
			if (!a) return null
			return (
				<Modal
					open
					title={`${a.icon} ${a.name}`}
					subtitle="actor · runtime player"
					onClose={onClose}
				>
					<div className="modal-section">
						<h3>role</h3>
						<HtmlBlock className="prose" html={renderInline(a.role)} />
					</div>
					<div className="modal-section">
						<h3>talks to</h3>
						<ul>
							{a.talks_to.map((t) => (
								<li key={t}>
									<HtmlBlock html={renderInline(t)} />
								</li>
							))}
						</ul>
					</div>
					<div className="modal-section">
						<h3>owns</h3>
						<ul>
							{a.owns.map((o) => (
								<li key={o}>
									<HtmlBlock html={renderInline(o)} />
								</li>
							))}
						</ul>
					</div>
					<div className="modal-section">
						<h3>notes</h3>
						<HtmlBlock className="md-content" html={renderMarkdown(a.notes)} />
					</div>
				</Modal>
			)
		}
		case "hook": {
			const h = HOOK_BY_NAME[modal.hookName]
			if (!h) return null
			return (
				<Modal
					open
					title={modal.hookName}
					subtitle={`hook · ${h.group}`}
					onClose={onClose}
				>
					<div className="modal-section">
						<h3>role</h3>
						<HtmlBlock className="prose" html={renderInline(h.desc)} />
					</div>
					<div className="modal-section">
						<h3>where it fires</h3>
						<ul>
							{h.fires.map((f) => (
								<li key={f}>
									<code>{f}</code>
								</li>
							))}
						</ul>
					</div>
					<div className="modal-section">
						<h3>file</h3>
						<div className="payload-block">{h.file}</div>
					</div>
				</Modal>
			)
		}
		case "payload": {
			const d = modal.payload
			return (
				<Modal
					open
					title="haiku_run_next"
					subtitle={`${d.stage} · ${d.key}`}
					onClose={onClose}
				>
					<div className="modal-section">
						<h3>action</h3>
						<div
							className="payload-block"
							style={{ fontWeight: 600, color: "#2563eb" }}
						>
							{d.action}
						</div>
					</div>
					<div className="modal-section">
						<h3>summary</h3>
						<HtmlBlock className="prose" html={renderInline(d.summary)} />
					</div>
					<div className="modal-section">
						<h3>payload returned to agent</h3>
						<div className="payload-block">
							{JSON.stringify(d.payload, null, 2)}
						</div>
					</div>
					<div className="modal-section">
						<h3>orchestrator validations</h3>
						<ul>
							{d.validations.map((v) => (
								<li key={v}>
									<HtmlBlock html={renderInline(v)} />
								</li>
							))}
						</ul>
					</div>
					{d.writes?.length ? (
						<div className="modal-section">
							<h3>state writes (workflow engine persists to disk)</h3>
							<ul className="writes-list">
								{d.writes.map((w) => (
									<li key={w.path + w.change}>
										<code className="write-path">{w.path}</code>
										<HtmlBlock
											className="write-change"
											html={renderInline(w.change)}
										/>
									</li>
								))}
							</ul>
						</div>
					) : null}
					{d.injection?.length ? (
						<div className="modal-section">
							<h3>how the result reaches the agent</h3>
							<ul className="writes-list">
								{d.injection.map((i) => (
									<li
										key={i.hook + i.target}
										style={{ borderLeftColor: "#2563eb" }}
									>
										<code className="write-path" style={{ color: "#1e3a8a" }}>
											{i.hook}
										</code>
										<HtmlBlock
											className="write-change"
											html={`→ <strong>${renderInline(i.target)}</strong>`}
										/>
										<HtmlBlock
											className="write-change"
											style={{ marginTop: 2 }}
											html={renderInline(i.what)}
										/>
									</li>
								))}
							</ul>
						</div>
					) : null}
					<div className="modal-section">
						<h3>instructions</h3>
						<HtmlBlock className="prose" html={renderInline(d.instructions)} />
					</div>
				</Modal>
			)
		}
		case "stageMd": {
			const s = studioContent?.stages?.[modal.stageKey]
			if (!s) return null
			return (
				<Modal
					open
					title={`${modal.stageKey.toUpperCase()} · STAGE.md`}
					subtitle={s.stagePath}
					onClose={onClose}
				>
					<HtmlBlock
						className="md-content"
						html={renderMdFile({
							frontmatter: s.frontmatter,
							content: s.stageMd,
						})}
					/>
				</Modal>
			)
		}
		case "hat": {
			const file =
				studioContent?.stages?.[modal.stageKey]?.hats?.[modal.hatName]
			if (!file) return null
			return (
				<Modal
					open
					title={`${modal.hatName} · hat`}
					subtitle={file.path}
					onClose={onClose}
				>
					<HtmlBlock className="md-content" html={renderMdFile(file)} />
				</Modal>
			)
		}
		case "reviewAgent": {
			const file =
				studioContent?.stages?.[modal.stageKey]?.reviewAgents?.[modal.agentName]
			if (!file) return null
			return (
				<Modal
					open
					title={`${modal.agentName} · review agent`}
					subtitle={file.path}
					onClose={onClose}
				>
					<HtmlBlock className="md-content" html={renderMdFile(file)} />
				</Modal>
			)
		}
		case "subagent":
			return (
				<Modal
					open
					title={`↗ ${modal.hatName} runs in a subagent`}
					subtitle={`${modal.stageKey} · v4 hat dispatch`}
					onClose={onClose}
				>
					<div className="modal-section">
						<h3>what this means</h3>
						<HtmlBlock
							className="prose"
							html={renderInline(
								`Every hat — including \`${modal.hatName}\` — runs inside its own Claude Code subagent. The cursor groups wave-ready / mid-hat units by hat-index and emits one \`start_unit_hat { stage, hat, units: [...], terminal }\` per tick; the parent dispatches one subagent per listed unit, in parallel.`,
							)}
						/>
					</div>
					<div className="modal-section">
						<h3>tools the subagent uses</h3>
						<ul>
							<li>
								<code>haiku_unit_start</code> — stamps `started_at` on first entry
							</li>
							<li>
								<code>haiku_unit_read</code> — read the unit spec body
							</li>
							<li>
								<code>haiku_unit_advance_hat</code> — terminal advance, appends to{" "}
								<code>iterations[]</code>
							</li>
							<li>
								<code>haiku_unit_reject_hat</code> — reject, rewinds one hat on the
								next tick (or re-dispatches hat[0] if reject was on hat[0])
							</li>
						</ul>
					</div>
					<div className="modal-section">
						<h3>model routing</h3>
						<HtmlBlock
							className="prose"
							html={renderInline(
								"Per-unit > hat > stage > studio cascade. The dispatch block carries the resolved tier so each subagent picks up its `default_model:` from the right level — escalations (e.g. unit rejected and bumped haiku→sonnet→opus) are visible at the unit level and override the default.",
							)}
						/>
					</div>
				</Modal>
			)
		case "schema":
			return (
				<Modal
					open
					title={modal.schemaKey}
					subtitle="schema reference"
					onClose={onClose}
				>
					<HtmlBlock
						className="prose"
						html={renderInline(
							`See \`packages/haiku/src/state-tools.ts\` for the canonical type definitions of \`${modal.schemaKey}\`.`,
						)}
					/>
				</Modal>
			)
		case "validation":
			return (
				<Modal
					open
					title={`✓ ${modal.validationKey}`}
					subtitle="elaborate-phase validation"
					onClose={onClose}
				>
					<HtmlBlock
						className="prose"
						html={renderInline(
							`Validation enforced at \`haiku_unit_write\` time in \`packages/haiku/src/state-tools.ts\` (TypeBox + AJV input gate at the wire, then unit-frontmatter validators for DAG cycle detection, depends_on cross-references, and naming convention). The \`elaborate\` cursor action surfaces the user-facing collaboration; the validators are the engine-side enforcement.`,
						)}
					/>
				</Modal>
			)
		case "revisit": {
			const prev =
				modal.stageIdx > 0 ? (stages[modal.stageIdx - 1]?.name ?? null) : null
			const stageName = stages[modal.stageIdx]?.name ?? modal.stageKey
			return (
				<Modal
					open
					title="↺ /haiku:revisit"
					subtitle={`${stageName} · go-back semantics`}
					onClose={onClose}
				>
					<div className="modal-section">
						<h3>summary</h3>
						<HtmlBlock
							className="prose"
							html={renderInline(
								"Bounces the workflow engine backwards to re-elaborate work that's already been done. Clears the target stage's `gate_outcome` and re-enters its `elaborate` phase.",
							)}
						/>
					</div>
					{prev ? (
						<div className="modal-section">
							<h3>cross-stage variant</h3>
							<HtmlBlock
								className="prose"
								html={renderInline(
									`From **${stageName}**'s elaborate → bounces back to **${prev}**'s elaborate.`,
								)}
							/>
						</div>
					) : null}
				</Modal>
			)
		}
		case "gateDetail":
			return (
				<Modal
					open
					title={modal.detailKey}
					subtitle="cursor action emitted by haiku_run_next"
					onClose={onClose}
				>
					<HtmlBlock
						className="prose"
						html={renderInline(
							modal.detailKey === "specs_gate_review"
								? "The user spec gate. The cursor's reviewRoles loop reaches the `user` role and emits `user_gate { gate_kind: \"spec\" }`. `haiku_run_next` opens the SPA review session inline (via `haiku_review_open`) and blocks on `haiku_await_gate` — single tool call, no URL+await two-step. **Reject does not re-pop the UI** — Track B walks before Track A on every tick, so any open feedback routes through `start_feedback_hat` until it closes."
								: "Quality gates run inline as part of the cursor's approval track. The cursor returns `dispatch_quality_gates { stage, units }` when `approvals.quality_gates` is missing on at least one unit. The agent runs `runQualityGates()` (configured tests / lint / typecheck); on success the engine signs `approvals.quality_gates` on every listed unit. Failures don't roll the workflow back — the agent fixes in place and re-runs until the gates pass.",
						)}
					/>
				</Modal>
			)
		case "tool":
			return (
				<Modal
					open
					title={modal.toolName}
					subtitle={`mcp tool · ${modal.contextKey ?? ""}`}
					onClose={onClose}
				>
					<HtmlBlock
						className="prose"
						html={renderInline(
							`See \`packages/haiku/src/orchestrator.ts\` and \`state-tools.ts\` for the full schema of \`${modal.toolName}\`.`,
						)}
					/>
				</Modal>
			)
		case "skill":
			return (
				<Modal open title={modal.skillName} subtitle="skill" onClose={onClose}>
					<HtmlBlock
						className="prose"
						html={renderInline(
							`See \`plugin/skills/${modal.skillName.replace(/^\/haiku:/, "")}/SKILL.md\` for the full skill mandate.`,
						)}
					/>
				</Modal>
			)
		case "aux": {
			const file = studioContent?.[modal.auxKind]?.[modal.name]
			if (!file) return null
			return (
				<Modal
					open
					title={`${modal.auxKind.replace(/s$/, "")} · ${modal.name}`}
					subtitle={file.path}
					onClose={onClose}
				>
					<HtmlBlock className="md-content" html={renderMdFile(file)} />
				</Modal>
			)
		}
		case "unit":
			return (
				<Modal
					open
					title={modal.unitId}
					subtitle={`${modal.stageName} · unit detail`}
					onClose={onClose}
				>
					<HtmlBlock
						className="prose"
						html={renderInline(
							`Demo unit \`${modal.unitId}\` (model: \`${modal.model}\`). In a real intent, units live at \`.haiku/intents/{slug}/stages/${modal.stageName.toLowerCase()}/units/\`.`,
						)}
					/>
				</Modal>
			)
		case "artifact": {
			const [stageKey, slug] = modal.artifactKey.split(".")
			const def =
				stageKey && slug
					? (studioContent?.stages?.[stageKey]?.discoveryDefs?.[slug] ??
						studioContent?.stages?.[stageKey]?.outputDefs?.[slug] ??
						null)
					: null
			if (!def) {
				return (
					<Modal
						open
						title={modal.artifactKey}
						subtitle="no template defined"
						onClose={onClose}
					>
						<HtmlBlock
							className="prose"
							html={renderInline(
								`No \`discovery/\` or \`outputs/\` template was found in the studio for \`${modal.artifactKey}\`. The artifact still flows through the pool — it's just not formally specified by the studio.`,
							)}
						/>
					</Modal>
				)
			}
			return (
				<Modal
					open
					title={modal.artifactKey}
					subtitle={def.path}
					onClose={onClose}
				>
					<HtmlBlock className="md-content" html={renderMdFile(def)} />
				</Modal>
			)
		}
		case "intentCreation":
			return (
				<Modal
					open
					title="Intent creation"
					subtitle="user ↔ agent · /haiku:start"
					onClose={onClose}
				>
					<HtmlBlock
						className="prose"
						html={renderInline(
							"User and agent exchange Q&A until the agent has enough to call `haiku_intent_create` (which writes `intent.md` with the title, body, and slug — but **not** `studio`, `mode`, or `stages`, which are FSM-driven). On the first `haiku_run_next` tick the pre-cursor selection chain fires: `select_studio` → `select_mode` → (if mode=quick) `select_stage`. `haiku_run_next` blocks on the SPA picker inline for each step and writes the chosen value, then walks Track A — initially `elaborate { stage: <first> }` since the stage has no units.",
						)}
					/>
				</Modal>
			)
		case "tickSemantics":
			return (
				<Modal
					open
					title="⏱ workflow tick semantics (v4)"
					subtitle="haiku_run_next is the agent's only forward-driving verb"
					onClose={onClose}
				>
					<div className="modal-section">
						<h3>what a tick is</h3>
						<HtmlBlock
							className="prose"
							html={renderInline(
								"A **tick** is one call to `haiku_run_next`. It is the agent's only forward-driving verb. There is no other tool the agent can call to advance the workflow — every advance, every wave, every stage transition, every escalation, every revisit is the result of a tick. The agent's contract is one sentence: **receive instruction, do what it says, call `haiku_run_next` unless this instruction is terminal.**",
							)}
						/>
					</div>
					<div className="modal-section">
						<h3>shape of every tick</h3>
						<ol className="writes-list">
							<li>
								<HtmlBlock
									className="prose"
									html={renderInline(
										'Agent calls `haiku_run_next { intent: "<slug>" }`.',
									)}
								/>
							</li>
							<li>
								<HtmlBlock
									className="prose"
									html={renderInline(
										"Engine reads on-disk state (intent.md frontmatter, every unit.md and feedback.md across every stage, studio config) and derives the current **cursor position** via `derivePosition`.",
									)}
								/>
							</li>
							<li>
								<HtmlBlock
									className="prose"
									html={renderInline(
										"The cursor returns one `CursorAction` (or null for mid-wave noop). `run-tick.ts` maps it to an `OrchestratorAction` and returns it to the agent.",
									)}
								/>
							</li>
							<li>
								<HtmlBlock
									className="prose"
									html={renderInline(
										"Agent executes the action and at some point calls `haiku_run_next` again. Loop.",
									)}
								/>
							</li>
						</ol>
					</div>
					<div className="modal-section">
						<h3>cursor track priority</h3>
						<ul className="writes-list">
							<li>
								<HtmlBlock
									className="prose"
									html={renderInline(
										"**Track C — drift sweep.** Re-hashes signed witnesses (unit body, declared outputs, discovery records) on the active stage. Mismatch → `drift_detected`. Dedup'd against open drift FBs by `source_ref`.",
									)}
								/>
							</li>
							<li>
								<HtmlBlock
									className="prose"
									html={renderInline(
										"**Track B — feedback.** Walks every stage from index 0 through the active stage, then intent-scope. Open FB → `start_feedback_hat` (next fix-hat dispatch) or `close_feedback` (terminal advance landed). Cross-stage routing is purely by file location.",
									)}
								/>
							</li>
							<li>
								<HtmlBlock
									className="prose"
									html={renderInline(
										"**Track A — intent.** On the active stage, walk: `design_direction_required` → `clarify_required` → `discovery_required` → `elaborate` → `start_unit_hat` → `dispatch_review` / `user_gate { spec }` → `dispatch_quality_gates` / `dispatch_approval` / `user_gate { approval }` → `merge_stage`.",
									)}
								/>
							</li>
							<li>
								<HtmlBlock
									className="prose"
									html={renderInline(
										"**Terminal walk.** All stages merged → intent-scope approvals (`spec`, `continuity`, `user`) → `intent_review` per missing role → `merge_intent` → `sealed`.",
									)}
								/>
							</li>
						</ul>
					</div>
					<div className="modal-section">
						<h3>pre-cursor selection gates</h3>
						<HtmlBlock
							className="prose"
							html={renderInline(
								"Before the cursor walks, `run-tick.ts` checks orientation: missing `intent.studio` → `select_studio`; missing `intent.mode` → `select_mode`; mode `quick` with empty `intent.stages[]` → `select_stage`. `haiku_run_next` blocks on the SPA picker inline; the agent never sees `select_*` in chat unless a non-haiku_run_next caller bypassed the gate. The agent **never writes `mode` or `stages` directly** — both fields are FSM-driven.",
							)}
						/>
					</div>
					<div className="modal-section">
						<h3>v4 action surface</h3>
						<HtmlBlock
							className="prose"
							html={renderInline(
								"The cursor emits exactly these `kind` values: `select_studio`, `select_mode`, `select_stage`, `drift_detected`, `start_feedback_hat`, `close_feedback`, `design_direction_required` / `_complete` / `_uploaded`, `clarify_required`, `discovery_required`, `elaborate`, `start_unit_hat`, `dispatch_review`, `dispatch_quality_gates`, `dispatch_approval`, `user_gate { spec | approval }`, `merge_stage`, `intent_review`, `merge_intent`, `sealed`.",
							)}
						/>
					</div>
					<div className="modal-section">
						<h3>why this matters</h3>
						<ul className="writes-list">
							<li>
								<HtmlBlock
									className="prose"
									html={renderInline(
										"**State on disk is the truth.** No state.json, no in-memory tick state. Every cursor walk recomputes from FM. Agent holds no workflow state.",
									)}
								/>
							</li>
							<li>
								<HtmlBlock
									className="prose"
									html={renderInline(
										"**Recovery is mechanical.** After any failure, calling `haiku_run_next` re-derives the right next step. No manual recovery for most failures.",
									)}
								/>
							</li>
							<li>
								<HtmlBlock
									className="prose"
									html={renderInline(
										"**Composition is pure.** `derivePosition` is a pure function of `(disk, studio config) → CursorAction | null`. Deterministic given the same disk state. No LLM in the workflow-position decision.",
									)}
								/>
							</li>
							<li>
								<HtmlBlock
									className="prose"
									html={renderInline(
										"**Open feedback wins over forward motion.** Track B walks before Track A — an open FB on stage 0 forces the cursor to dispatch a fix hat against it before any later stage advances.",
									)}
								/>
							</li>
						</ul>
					</div>
					<div className="modal-section">
						<h3>canonical reference</h3>
						<HtmlBlock
							className="prose"
							html={renderInline(
								'`plugin/studios/ARCHITECTURE.md` §5 — "Workflow tick semantics." Authoritative when this prototype and the architecture doc disagree on tick contracts. The cursor source lives in `packages/haiku/src/orchestrator/workflow/cursor.ts`; the tick wrapper in `run-tick.ts`.',
							)}
						/>
					</div>
				</Modal>
			)
		case "cursorTracks":
			return (
				<Modal
					open
					title="⛓ cursor track walk (v4)"
					subtitle="cursor.ts · derivePosition walks Track C → Track B → Track A on every tick"
					onClose={onClose}
				>
					<div className="modal-section">
						<h3>where it sits</h3>
						<HtmlBlock
							className="prose"
							html={renderInline(
								"Implemented in `packages/haiku/src/orchestrator/workflow/cursor.ts` (`derivePosition`). On every `haiku_run_next` tick — after the v0→v4 migrator (idempotent, one-time per intent) and the pre-cursor selection gates (`select_studio` / `select_mode` / `select_stage`) — the cursor reads disk and walks three tracks in priority order. Pure observation: no side effects, same disk → same answer.",
							)}
						/>
					</div>
					<div className="modal-section">
						<h3>three tracks (priority order)</h3>
						<ul className="writes-list">
							<li>
								<HtmlBlock
									className="prose"
									html={renderInline(
										"**Track C — drift sweep.** `runDriftSweep` re-hashes each unit's body / declared outputs and compares against the FM witness (`reviews.<role>.body_sha256`, `approvals.<role>.witnesses[]`). Any mismatch → `drift_detected`. Pre-v4 baseline artifacts (`baseline.json`, `drift-markers.json`, `baseline-content/`) are deleted by the v0→v4 migrator — v4 stores the witness directly on FM. Kill-switch: `drift_detection: false` in settings.yml.",
									)}
								/>
							</li>
							<li>
								<HtmlBlock
									className="prose"
									html={renderInline(
										"**Track B — feedback.** Walks stages 0..active in order, then intent-scope. Open FB → emit the next fix-hat dispatch (`start_feedback_hat`) or `close_feedback` for it. **Cross-stage routing is purely by file location** — an FB sitting in `stages/<earlier>/feedback/` rewinds the cursor to that earlier stage's fix loop, regardless of where it was filed. There is no `upstream_stage:` field; the v0→v4 migrator strips it and physically relocates files.",
									)}
								/>
							</li>
							<li>
								<HtmlBlock
									className="prose"
									html={renderInline(
										"**Track A — intent.** On the active stage (first stage whose branch is not merged into intent main, derived via `firstUnmergedStage`), walk the per-stage state machine in §5.4 order: design_direction → clarify → discovery → elaborate → wave logic → review track → approval track → `merge_stage`.",
									)}
								/>
							</li>
						</ul>
					</div>
					<div className="modal-section">
						<h3>FB classification (no pre-tick triage gate)</h3>
						<HtmlBlock
							className="prose"
							html={renderInline(
								"v3 used a `triaged_at:` frontmatter field and a separate pre-tick triage gate. v4 collapses that into the FB-as-unit hat chain: the **first hat in the stage's `fix_hats:` chain is conventionally a classifier**. It reads the FB body, decides which unit (if any) the finding targets and which approval roles to invalidate on closure, and calls `haiku_feedback_set_targets` to record the decision. Targets are immutable once set. Cross-stage moves still go through `haiku_feedback_move` (which physically relocates the file to the target stage's `feedback/` dir).",
							)}
						/>
					</div>
					<div className="modal-section">
						<h3>recurring merge_stage</h3>
						<HtmlBlock
							className="prose"
							html={renderInline(
								"Stages are NEVER sealed — only intents are. A previously-merged stage that gains a new unit (because the fix-loop authored corrective work) becomes ahead-of-main and `firstUnmergedStage` rewinds the cursor to it on the next tick. `merge_stage` is a recurring event, not a terminal one. Forward-only applies to existing units' bytes (immutable post-merge), not to whether a stage is \"done.\"",
							)}
						/>
					</div>
					<div className="modal-section">
						<h3>canonical reference</h3>
						<HtmlBlock
							className="prose"
							html={renderInline(
								'`plugin/studios/ARCHITECTURE.md` §5.2–§5.4 (cursor model, properties, per-stage walk). Source: `packages/haiku/src/orchestrator/workflow/cursor.ts`.',
							)}
						/>
					</div>
				</Modal>
			)
	}
}
