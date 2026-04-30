"use client"

import { useRouter } from "next/navigation"
import {
	Fragment,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react"
import { ACTORS } from "../_data/actors"
import {
	payloadFor,
	type TransitionKey,
	type TransitionOpts,
} from "../_data/payload-for"
import type {
	DerivedStage,
	ExecutionMode,
	ModalKind,
	StudioContentBundle,
	StudioContentEntry,
} from "../_data/types"
import "./arch.css"
import { ModalRouter } from "./ModalRouter"
import {
	branchName,
	demoWavesAndUnits,
	effectiveMode,
	formatInputs,
	gateClass,
	gateFromReview,
	shortHat,
} from "./utils"

interface ArchitectureMapProps {
	initialStudioDir: string
}

export function ArchitectureMap({ initialStudioDir }: ArchitectureMapProps) {
	const router = useRouter()
	const [bundle, setBundle] = useState<StudioContentBundle | null>(null)
	const [bundleError, setBundleError] = useState<string | null>(null)
	const [activeStudio, setActiveStudio] = useState(initialStudioDir)
	const [mode, setMode] = useState<ExecutionMode>("continuous")
	const [continuousFrom, setContinuousFrom] = useState<string>("")
	const [modal, setModal] = useState<ModalKind | null>(null)
	const [matchedArtifact, setMatchedArtifact] = useState<string | null>(null)
	const mainRef = useRef<HTMLDivElement>(null)

	// Track whether the component is still mounted so the loader (used by
	// the mount-effect AND the Retry button) can no-op state updates after
	// unmount. Without this, retrying during an unmount transition would
	// fire `setBundle` / `setBundleError` on a torn-down component (benign
	// in React 18+ but worth avoiding).
	const mountedRef = useRef(true)
	useEffect(() => {
		mountedRef.current = true
		return () => {
			mountedRef.current = false
		}
	}, [])

	const loadBundle = useCallback(() => {
		setBundleError(null)
		setBundle(null)
		fetch("/prototype-stage-content.json")
			.then((r) => {
				if (!r.ok) throw new Error(`HTTP ${r.status}`)
				return r.json()
			})
			.then((data: StudioContentBundle) => {
				if (!mountedRef.current) return
				setBundle(data)
			})
			.catch((err: unknown) => {
				if (!mountedRef.current) return
				const message = err instanceof Error ? err.message : String(err)
				console.warn("studio content fetch failed", err)
				setBundleError(message)
			})
	}, [])

	// Fetch the bundle ONCE on mount — it's a static JSON containing every
	// studio. Studio switching is a pure state change after this; no refetch.
	useEffect(() => {
		loadBundle()
	}, [loadBundle])

	// Once the bundle loads (or the active studio drifts to something the
	// bundle doesn't recognize), fall back to defaultStudio / first available.
	useEffect(() => {
		if (!bundle) return
		if (bundle.studios?.[activeStudio]) return
		const fallback =
			bundle.defaultStudio || Object.keys(bundle.studios || {})[0] || "software"
		setActiveStudio(fallback)
	}, [bundle, activeStudio])

	const studioContent: StudioContentEntry | null =
		bundle?.studios?.[activeStudio] ?? null

	const stages: DerivedStage[] = useMemo(() => {
		if (!studioContent) return []
		const order = Array.isArray(studioContent.stagesOrder)
			? studioContent.stagesOrder
			: []
		const out: DerivedStage[] = []
		for (const key of order) {
			const stage = studioContent.stages?.[key]
			if (!stage) continue
			const fm = stage.frontmatter ?? {}
			const hats =
				Array.isArray(fm.hats) && fm.hats.length
					? (fm.hats as string[])
					: Object.keys(stage.hats ?? {})
			const reviewAgents = Object.keys(stage.reviewAgents ?? {})
			const gate = gateFromReview(fm.review)
			const outputsFromFm = Array.isArray(fm.outputs)
				? (
						fm.outputs as Array<
							{ discovery?: string; output?: string } | string
						>
					)
						.map((o) =>
							typeof o === "string" ? o : (o?.discovery ?? o?.output ?? ""),
						)
						.filter(Boolean)
				: []
			const outputsUnion = new Set<string>([
				...outputsFromFm,
				...Object.keys(stage.discoveryDefs ?? {}),
				...Object.keys(stage.outputDefs ?? {}),
			])
			const { waves, units } = demoWavesAndUnits(hats.length)
			out.push({
				key,
				name: key.charAt(0).toUpperCase() + key.slice(1),
				reviewLabel: gate.label,
				hats,
				waves,
				units,
				reviewAgents,
				inputs: formatInputs(fm.inputs),
				outputs: Array.from(outputsUnion),
				gate: { type: gate.type, options: gate.options },
			})
		}
		return out
	}, [studioContent])

	useEffect(() => {
		if (mode !== "hybrid" || !stages.length) return
		const valid = stages.slice(1).map((s) => s.name.toLowerCase())
		if (!valid.includes(continuousFrom)) {
			setContinuousFrom(valid[Math.floor(valid.length / 2)] ?? valid[0] ?? "")
		}
	}, [mode, stages, continuousFrom])

	const continuousFromIdx = useMemo(
		() => stages.findIndex((s) => s.name.toLowerCase() === continuousFrom),
		[stages, continuousFrom],
	)

	const studioOptions = useMemo(() => {
		if (!bundle)
			return [] as Array<{
				category: string
				items: { dir: string; stageCount: number }[]
			}>
		const list = bundle.studioList ?? []
		const byCat = new Map<string, { dir: string; stageCount: number }[]>()
		for (const s of list) {
			const cat = s.category || "other"
			if (!byCat.has(cat)) byCat.set(cat, [])
			byCat.get(cat)?.push({ dir: s.dir, stageCount: s.stageCount })
		}
		return [...byCat.entries()]
			.sort((a, b) => a[0].localeCompare(b[0]))
			.map(([category, items]) => ({
				category,
				items: items.sort((a, b) => a.dir.localeCompare(b.dir)),
			}))
	}, [bundle])

	const closeModal = useCallback(() => setModal(null), [])

	// Artifact hover-pair: when hovering over an artifact chip, highlight all
	// matching artifacts (including in the knowledge pool sidebar).
	const matchArtifact = useCallback(
		(key: string | null, query: string | null) => {
			if (!query) {
				setMatchedArtifact(null)
				return
			}
			setMatchedArtifact(query)
		},
		[],
	)

	const isArtifactMatch = useCallback(
		(key: string) => {
			if (!matchedArtifact) return false
			if (key === matchedArtifact) return true
			if (matchedArtifact.endsWith(".*")) {
				return key.startsWith(matchedArtifact.slice(0, -1))
			}
			if (key.endsWith(".*")) {
				return matchedArtifact.startsWith(key.slice(0, -1))
			}
			return false
		},
		[matchedArtifact],
	)

	const renderActorsStrip = () => {
		const arrows = [
			{ label: "conversation", glyph: "⇆" },
			{ label: "intercepts", glyph: "↔" },
			{ label: "tool calls", glyph: "→" },
			{ label: "openReviewAndWait", glyph: "→" },
		]
		const order: { key: string; cls: string }[] = [
			{ key: "user", cls: "user" },
			{ key: "agent", cls: "agent" },
			{ key: "hooks", cls: "hooks" },
			{ key: "orchestrator", cls: "orchestrator" },
			{ key: "webui", cls: "webui" },
		]
		return (
			<section className="actors-strip">
				<h2>Actors</h2>
				{order.map((actor, i) => {
					const def = ACTORS[actor.key]
					return (
						<Fragment key={actor.key}>
							<button
								type="button"
								className={`actor-box ${actor.cls}`}
								onClick={() => setModal({ kind: "actor", actorKey: actor.key })}
							>
								<div>
									<span className="actor-icon">{def.icon}</span>{" "}
									<span className="actor-name">{def.name}</span>
								</div>
								<div className="actor-role">{def.role.split(".")[0]}</div>
							</button>
							{i < order.length - 1 && arrows[i] ? (
								<div className="actor-arrow">
									<span>{arrows[i].glyph}</span>
									<span className="arrow-label">{arrows[i].label}</span>
								</div>
							) : null}
						</Fragment>
					)
				})}
			</section>
		)
	}

	const callPill = (
		stage: DerivedStage,
		idx: number,
		mStage: ExecutionMode,
		key: TransitionKey,
		opts: TransitionOpts = {},
		variant: "full" | "mini" = "full",
		caption?: string,
	) => {
		const p = payloadFor(stage, idx, mStage, key, opts)
		if (!p) return null
		const onClick = () =>
			setModal({
				kind: "payload",
				payload: { stage: stage.name, key, ...p },
			})
		// The mini chip's label IS the action — including hat-to-hat which is
		// actually `haiku_unit_advance_hat` (subagent-driven, not a workflow tick).
		const miniLabel = key === "hat-to-hat" ? "advance_hat" : "haiku_run_next"
		if (variant === "mini") {
			return (
				<button
					type="button"
					className="call-mini"
					onClick={onClick}
					title={`${p.action} — ${p.summary}`}
				>
					{miniLabel}
				</button>
			)
		}
		return (
			<div className="phase-arrow with-call">
				<button type="button" className="call-chip" onClick={onClick}>
					haiku_run_next
				</button>
				{caption ? (
					<span
						style={{
							fontFamily: "ui-monospace, 'SF Mono', monospace",
							fontSize: 9,
							color: "var(--muted)",
							marginTop: 2,
						}}
					>
						→ returns <strong style={{ color: "#1f2937" }}>{p.action}</strong> ·{" "}
						{caption}
					</span>
				) : null}
				<span className="arrow-glyph">↓</span>
				<div className="call-tooltip">
					<div className="tt-action">{p.action}</div>
					<div className="tt-summary">{p.summary}</div>
					<div className="tt-hint">
						click for full payload &amp; validations
					</div>
				</div>
			</div>
		)
	}

	const renderStage = (stage: DerivedStage, idx: number) => {
		const mStage = effectiveMode(idx, mode, continuousFromIdx)
		const stageGate = effectiveGate(stage, mStage)
		const isAutoGate =
			stageGate.type === "auto" || stageGate.type.startsWith("auto ")
		const isContinuousMarker = mode === "hybrid" && idx === continuousFromIdx
		const lower = stage.name.toLowerCase()
		const isFirst = idx === 0

		return (
			<Fragment key={stage.key}>
				<section
					className={`stage${isContinuousMarker ? " continuous-marker-stage" : ""}`}
				>
					<header>
						<button
							type="button"
							className="clickable"
							style={{
								all: "unset",
								cursor: "pointer",
								fontSize: "15px",
								fontWeight: 600,
								letterSpacing: "0.02em",
								textTransform: "uppercase",
							}}
							onClick={() => setModal({ kind: "stageMd", stageKey: lower })}
							title="open STAGE.md"
						>
							{idx + 1}. {stage.name}
						</button>
					</header>

					<button
						type="button"
						onClick={() => setModal({ kind: "preTickTriage" })}
						style={{
							all: "unset",
							display: "flex",
							alignItems: "center",
							gap: 8,
							margin: "0 0 4px",
							padding: "5px 9px",
							background: "#0f172a",
							color: "#fbbf24",
							borderRadius: 6,
							fontSize: 9,
							lineHeight: 1.4,
							fontFamily: "ui-monospace, 'SF Mono', monospace",
							fontWeight: 700,
							letterSpacing: "0.06em",
							textTransform: "uppercase",
							cursor: "pointer",
							boxSizing: "border-box",
						}}
						title="Click for the pre-tick triage gate flow"
					>
						<span>⛓ pre-tick triage gate</span>
						<span
							style={{
								color: "#94a3b8",
								fontWeight: 500,
								textTransform: "none",
								letterSpacing: 0,
							}}
						>
							run-tick.ts · runs BEFORE every handler tick
						</span>
						<span
							style={{ marginLeft: "auto", color: "#94a3b8", fontWeight: 500 }}
						>
							expand ↗
						</span>
					</button>

					{stage.inputs.length > 0 ? (
						<div className="artifacts-block">
							<div className="artifacts-label">inputs ← pool</div>
							<div className="artifacts in">
								{stage.inputs.map((i) => (
									<button
										key={i}
										type="button"
										className={`artifact${isArtifactMatch(i) ? " match" : ""}`}
										data-artifact={i}
										onMouseEnter={() => matchArtifact(i, i)}
										onMouseLeave={() => matchArtifact(null, null)}
										onClick={() =>
											setModal({ kind: "artifact", artifactKey: i })
										}
										title={i}
									>
										{i}
									</button>
								))}
							</div>
						</div>
					) : (
						<div className="artifacts-block">
							<div className="artifacts-label">implicit input · seed</div>
							<div className="artifacts in">
								<span
									className="artifact"
									title="The first stage has no prior-stage inputs."
								>
									<code
										style={{
											fontSize: "9px",
											background: "transparent",
											border: "none",
											padding: 0,
										}}
									>
										intent.md
									</code>{" "}
									(frontmatter + body)
								</span>
							</div>
						</div>
					)}

					<div className="phase" data-phase="elaborate">
						<h3>
							Elaborate
							<button
								type="button"
								className="revisit-chip"
								onClick={() =>
									setModal({ kind: "revisit", stageKey: lower, stageIdx: idx })
								}
							>
								↺ /haiku:revisit
							</button>
						</h3>
						{mStage !== "auto" ? (
							<div className="elab-step">
								<div className="step-label">① conversation</div>
								<div className="elab-conversation">
									<div className="mini-actor">🧑</div>
									<div className="turn-glyph">⇆</div>
									<div className="mini-actor">🤖</div>
									<span className="turns-note">≥ 3 turns · collaborative</span>
								</div>
							</div>
						) : null}
						{(() => {
							const defs = studioContent?.stages?.[lower]?.discoveryDefs ?? {}
							const slugs = Object.keys(defs)
							if (!slugs.length) return null
							return (
								<div className="elab-step">
									<div className="step-label">
										② discovery artifacts{" "}
										<span
											style={{
												textTransform: "none",
												letterSpacing: 0,
												color: "#7c3aed",
												fontWeight: 600,
											}}
										>
											· workflow engine fans out one ↗ subagent per artifact
										</span>
									</div>
									<div className="elab-discovery">
										{slugs.map((s) => {
											const key = `${lower}.${s}`
											return (
												<button
													key={s}
													type="button"
													className={`disc artifact${isArtifactMatch(key) ? " match" : ""}`}
													data-artifact={key}
													onMouseEnter={() => matchArtifact(key, key)}
													onMouseLeave={() => matchArtifact(null, null)}
													onClick={() =>
														setModal({ kind: "artifact", artifactKey: key })
													}
													title={defs[s]?.path}
												>
													{s}{" "}
													<span style={{ color: "#7c3aed", fontWeight: 700 }}>
														↗
													</span>
												</button>
											)
										})}
									</div>
								</div>
							)
						})()}
						<div className="elab-step">
							<div className="step-label">
								③ units decomposed (work breakdown · DAG)
							</div>
							<div className="units">
								{stage.units.map((u) => (
									<button
										key={u.id}
										type="button"
										className="unit clickable"
										onClick={() =>
											setModal({
												kind: "unit",
												stageName: stage.name,
												unitId: u.id,
												model: u.model,
											})
										}
										title={`${u.id} · model: ${u.model}`}
									>
										{u.id}
										<span className="model-badge">{u.model}</span>
									</button>
								))}
							</div>
						</div>
						<div className="elab-step">
							<div className="step-label">④ validation</div>
							<div className="elab-validate">
								{[
									"dag-acyclic",
									"unit-naming",
									"unit-types",
									"inputs-exist",
								].map((k) => (
									<button
										key={k}
										type="button"
										className="check"
										onClick={() =>
											setModal({ kind: "validation", validationKey: k })
										}
									>
										✓ {k.replace("-", " ")}
									</button>
								))}
								{mStage !== "auto" ? (
									<button
										type="button"
										className="check"
										onClick={() =>
											setModal({
												kind: "validation",
												validationKey: "turns-min",
											})
										}
									>
										✓ turns ≥ 3
									</button>
								) : null}
							</div>
						</div>
					</div>

					<div className="phase-arrow">↓</div>

					<div className="gate-wrap" style={{ paddingLeft: 0, marginTop: 22 }}>
						{(() => {
							const p = payloadFor(stage, idx, mStage, "elab-to-prereview")
							return (
								<>
									<button
										type="button"
										className="call-chip gate-pill"
										onClick={() =>
											p &&
											setModal({
												kind: "payload",
												payload: {
													stage: stage.name,
													key: "elab-to-prereview",
													...p,
												},
											})
										}
										title={p ? `${p.action} — ${p.summary}` : ""}
									>
										haiku_run_next
									</button>
									<div
										className="nested-gate"
										style={{
											borderColor: "#0d9488",
											background: "#ecfdf5",
											cursor: "default",
										}}
									>
										<div className="ng-head">
											<span className="ng-caption" style={{ color: "#0f766e" }}>
												↳ inside this call · returns <code>pre_review</code>{" "}
												action
											</span>
											<span className="ig-type" style={{ color: "#0f766e" }}>
												dispatch reviewers
											</span>
											<span className="ig-ctx">runs in ALL modes</span>
										</div>
										<div
											style={{
												marginTop: 4,
												fontSize: 10,
												color: "#065f46",
												lineHeight: 1.45,
											}}
										>
											Conditional review agents audit every{" "}
											<code>unit-NN-*.md</code> file — artifacts don't exist
											yet, so reviewers audit the <em>plan</em>. Findings block
											advance; resolution is a spec edit.{" "}
											<strong>Auto mode does not skip this</strong> — only the
											human spec gate is gated by autopilot.
										</div>
									</div>
								</>
							)
						})()}
					</div>

					<div className="phase-arrow">↓</div>

					{isAutoGate ? (
						<div
							className="gate-wrap"
							style={{ paddingLeft: 0, marginTop: 22 }}
						>
							{(() => {
								const p = payloadFor(stage, idx, mStage, "prereview-to-gate")
								return (
									<>
										<button
											type="button"
											className="call-chip gate-pill"
											onClick={() =>
												p &&
												setModal({
													kind: "payload",
													payload: {
														stage: stage.name,
														key: "prereview-to-gate",
														...p,
													},
												})
											}
											title={p ? `${p.action} — ${p.summary}` : ""}
										>
											haiku_run_next
										</button>
										<div
											className="nested-gate"
											style={{
												borderColor: "#d97706",
												background: "#fef3c7",
												cursor: "default",
											}}
										>
											<div className="ng-head">
												<span
													className="ng-caption"
													style={{ color: "#92400e" }}
												>
													↳ inside this call · auto-advances · no review UI
												</span>
												<span className="ig-type" style={{ color: "#92400e" }}>
													auto
												</span>
												<span className="ig-ctx">advance_phase</span>
											</div>
											<div
												style={{
													marginTop: 4,
													fontSize: 10,
													color: "#92400e",
													lineHeight: 1.45,
												}}
											>
												<code>review: auto</code> — no gate review, advances
												directly to <code>execute</code>.
											</div>
										</div>
									</>
								)
							})()}
						</div>
					) : (
						<div
							className="gate-wrap"
							style={{ paddingLeft: 0, marginTop: 22 }}
						>
							{(() => {
								const p = payloadFor(stage, idx, mStage, "elab-to-gate")
								return (
									<>
										<button
											type="button"
											className="call-chip gate-pill"
											onClick={() =>
												p &&
												setModal({
													kind: "payload",
													payload: {
														stage: stage.name,
														key: "elab-to-gate",
														...p,
													},
												})
											}
											title={p ? `${p.action} — ${p.summary}` : ""}
										>
											haiku_run_next
										</button>
										{/* biome-ignore lint/a11y/useSemanticElements: contains block-level children (ng-head, ng-branch-row) illegal inside a real <button> per HTML5 phrasing-content rules */}
										<div
											className="nested-gate"
											role="button"
											tabIndex={0}
											onClick={() =>
												setModal({
													kind: "gateDetail",
													detailKey: "specs_gate_review",
												})
											}
											onKeyDown={(e) => {
												if (e.key === "Enter" || e.key === " ") {
													e.preventDefault()
													setModal({
														kind: "gateDetail",
														detailKey: "specs_gate_review",
													})
												}
											}}
											style={{ cursor: "pointer" }}
											title="Click for the full specs_gate_review flow"
										>
											<div className="ng-head">
												<span className="ng-caption">
													↳ inside this call · opens{" "}
													<code>specs_gate_review</code> (blocking)
												</span>
												<span className="ig-type">ask</span>
												<span className="ig-ctx">
													{isFirst ? "intent_review" : "elaborate_to_execute"}
												</span>
											</div>
											<div className="ng-branch-row">
												<span className="ng-branch reject-branch">
													↑ reject → <strong>feedback_dispatch</strong>
												</span>
												<span className="ng-branch approve-branch">
													↓ approve → execute
												</span>
											</div>
										</div>
									</>
								)
							})()}
						</div>
					)}

					<div className="phase-arrow">↓</div>

					<div className="phase" data-phase="execute">
						<h3>Execute</h3>
						<div className="bolt-explainer">
							<span className="be-chip">bolt</span>
							<span className="be-text">
								one full <strong>hat rotation</strong> for a unit · starts at{" "}
								<code>1</code> · hat rejection (↻) rewinds one hat AND
								increments bolt · hard max <strong>5</strong> per unit
							</span>
						</div>
						<div className="execute-body">
							{stage.waves.map((w, wi) => (
								<Fragment key={w.label}>
									{wi > 0 ? (
										<div className="wave-divider">
											{callPill(
												stage,
												idx,
												mStage,
												"wave-to-wave",
												{
													from: String(wi),
													to: String(wi + 1),
													units: w.units,
												},
												"mini",
											)}
										</div>
									) : null}
									<div className="wave">
										<span className="wave-label">{w.label}</span>
										<div style={{ gridColumn: 2, minWidth: 0 }}>
											<div className="wave-atomicity">
												↗ parent spawns{" "}
												{w.units.length === 1
													? "this subagent"
													: `all ${w.units.length} subagents`}{" "}
												in one response
											</div>
											<div className="cylinders">
												{w.units.map((uid) => {
													const unit = stage.units.find(
														(x) => x.id === uid,
													) ?? { id: uid, model: "" }
													return (
														<div key={uid} className="cylinder">
															<span className="cyl-label">
																{unit.id}
																{unit.model ? (
																	<span style={{ color: "#6b7280" }}>
																		{" "}
																		· {unit.model}
																	</span>
																) : null}
															</span>
															<button
																type="button"
																className="cyl-bolt"
																onClick={() =>
																	setModal({
																		kind: "schema",
																		schemaKey: "unit",
																	})
																}
															>
																bolt 1
															</button>
															<div className="cyl-body">
																{stage.hats.map((h, hi) => (
																	<Fragment key={h}>
																		{/* biome-ignore lint/a11y/useSemanticElements: contains block-level children (ng-head, ng-branch-row) illegal inside a real <button> per HTML5 phrasing-content rules */}
																		<div
																			role="button"
																			tabIndex={0}
																			className="hat clickable"
																			onClick={() =>
																				setModal({
																					kind: "hat",
																					stageKey: lower,
																					hatName: h,
																				})
																			}
																			onKeyDown={(e) => {
																				if (
																					e.key === "Enter" ||
																					e.key === " "
																				) {
																					e.preventDefault()
																					setModal({
																						kind: "hat",
																						stageKey: lower,
																						hatName: h,
																					})
																				}
																			}}
																		>
																			{shortHat(h)}
																			<button
																				type="button"
																				className="subagent-badge"
																				onClick={(e) => {
																					e.stopPropagation()
																					setModal({
																						kind: "subagent",
																						stageKey: lower,
																						hatName: h,
																					})
																				}}
																			>
																				↗
																			</button>
																		</div>
																		{hi < stage.hats.length - 1 ? (
																			<div className="hat-arrow-wrap">
																				<button
																					type="button"
																					className="call-mini-hat call-mini"
																					onClick={() => {
																						const next = stage.hats[hi + 1]
																						const p = payloadFor(
																							stage,
																							idx,
																							mStage,
																							"hat-to-hat",
																							{
																								from: h,
																								to: next,
																								unit: unit.id,
																							},
																						)
																						if (p)
																							setModal({
																								kind: "payload",
																								payload: {
																									stage: stage.name,
																									key: "hat-to-hat",
																									...p,
																								},
																							})
																					}}
																				>
																					↻
																				</button>
																				<svg
																					className="back-arc"
																					viewBox="0 0 18 52"
																					aria-hidden="true"
																				>
																					<path d="M 2 48 L 10 48 Q 15 48 15 43 L 15 11 Q 15 6 10 6 L 4 6" />
																					<path
																						className="head"
																						d="M 2 6 l 6 -3 l 0 6 z"
																					/>
																				</svg>
																				<span className="bolt-tick">⚡+1</span>
																			</div>
																		) : null}
																	</Fragment>
																))}
															</div>
														</div>
													)
												})}
											</div>
										</div>
									</div>
								</Fragment>
							))}
						</div>
					</div>

					<div className="phase-arrow">↓</div>

					<div
						className="gate-wrap self-loop"
						style={{ paddingLeft: 0, marginTop: 22 }}
					>
						{(() => {
							const p = payloadFor(stage, idx, mStage, "execute-to-review")
							return (
								<>
									<button
										type="button"
										className="call-chip gate-pill"
										onClick={() =>
											p &&
											setModal({
												kind: "payload",
												payload: {
													stage: stage.name,
													key: "execute-to-review",
													...p,
												},
											})
										}
										title={p ? `${p.action} — ${p.summary}` : ""}
									>
										haiku_run_next
									</button>
									{/* biome-ignore lint/a11y/useSemanticElements: contains block-level children (ng-head, ng-branch-row) illegal inside a real <button> per HTML5 phrasing-content rules */}
									<div
										className="nested-gate"
										role="button"
										tabIndex={0}
										onClick={() =>
											setModal({
												kind: "gateDetail",
												detailKey: "quality_gates",
											})
										}
										onKeyDown={(e) => {
											if (e.key === "Enter" || e.key === " ") {
												e.preventDefault()
												setModal({
													kind: "gateDetail",
													detailKey: "quality_gates",
												})
											}
										}}
										style={{ cursor: "pointer" }}
										title="Click for the full quality_gates flow"
									>
										<div className="ng-head">
											<span className="ng-caption">
												↳ inside this call · runs 🧪 <code>quality_gates</code>
											</span>
											<span className="ig-type">hard</span>
											<span className="ig-ctx">tests · lint · typecheck</span>
										</div>
										<div className="ng-branch-row">
											<span className="ng-branch reject-branch">
												↑ fail → fix in place, retry
											</span>
											<span className="ng-branch approve-branch">
												↓ pass → review agents
											</span>
										</div>
									</div>
								</>
							)
						})()}
					</div>

					<div className="phase-arrow">↓</div>

					<div className="phase" data-phase="review">
						<h3>Review</h3>
						<div className="agents">
							{stage.reviewAgents.map((a) => (
								<button
									key={a}
									type="button"
									className="agent clickable"
									onClick={() =>
										setModal({
											kind: "reviewAgent",
											stageKey: lower,
											agentName: a,
										})
									}
								>
									{a}
								</button>
							))}
						</div>
						<div
							className="agents-caption"
							style={{
								marginTop: 8,
								textAlign: "left",
								display: "flex",
								alignItems: "center",
								gap: 6,
							}}
						>
							{callPill(stage, idx, mStage, "review-to-gate", {}, "mini")}
							all agents approve → <code>advance_phase</code> to gate
						</div>
					</div>

					<div className="phase-arrow">↓</div>

					<div
						className="phase"
						data-phase="fix-loop"
						style={{ borderLeft: "3px solid #f59e0b" }}
					>
						<h3>
							Fix-loop{" "}
							<span
								style={{
									fontSize: 10,
									color: "var(--muted)",
									fontWeight: "normal",
								}}
							>
								(when review surfaces open feedback)
							</span>
						</h3>
						{(() => {
							const fixHats =
								(studioContent?.stages?.[lower]?.frontmatter?.fix_hats as
									| string[]
									| undefined) ?? []
							if (!fixHats.length) {
								return (
									<div
										className="agents-caption"
										style={{
											textAlign: "left",
											fontSize: 11,
											lineHeight: 1.5,
											marginBottom: 6,
										}}
									>
										<strong>
											No <code>fix_hats:</code> declared on STAGE.md
										</strong>{" "}
										— the gate falls back to the legacy{" "}
										<code>feedback_revisit</code> action, which rolls the entire
										stage back to elaborate (vs. running an in-place fix chain
										per-finding).
									</div>
								)
							}
							return (
								<div className="elab-step" style={{ marginTop: 0 }}>
									<div className="step-label">
										fix_hats sequence (per finding · serial)
									</div>
									<div
										style={{
											display: "flex",
											flexWrap: "wrap",
											gap: 4,
											alignItems: "center",
										}}
									>
										{fixHats.map((h, i) => (
											<Fragment key={h}>
												<button
													type="button"
													className="hat clickable"
													style={{
														width: "auto",
														height: "auto",
														padding: "4px 10px",
														fontSize: 10,
													}}
													onClick={() =>
														setModal({
															kind: "hat",
															stageKey: lower,
															hatName: h,
														})
													}
												>
													{h}
												</button>
												{i < fixHats.length - 1 ? (
													<span style={{ color: "var(--muted)", fontSize: 12 }}>
														→
													</span>
												) : null}
											</Fragment>
										))}
									</div>
								</div>
							)
						})()}
						<div
							className="agents-caption"
							style={{
								textAlign: "left",
								fontSize: 11,
								lineHeight: 1.5,
								marginTop: 8,
							}}
						>
							Dispatched directly against the FB file via{" "}
							<code>review_fix</code>. <strong>FB-as-unit:</strong> fixers edit
							the FB body; the flagged unit stays read-only. The chain
							progresses via <code>haiku_feedback_advance_hat</code>; the
							workflow engine auto-closes the FB on the last hat's advance.
						</div>
						<div
							style={{
								marginTop: 8,
								display: "grid",
								gridTemplateColumns: "1fr 1fr",
								gap: 6,
								fontSize: 10,
								lineHeight: 1.4,
							}}
						>
							<div
								style={{
									padding: "5px 8px",
									background: "#fef2f2",
									border: "1px solid var(--reject)",
									borderRadius: 6,
									color: "#7c2d12",
								}}
							>
								<strong>↗ escalate</strong> · per-finding cap{" "}
								<code>MAX_FIX_LOOP_BOLTS = 3</code>; if the chain can't close
								the FB after 3 bolts the orchestrator returns{" "}
								<code>action: escalate</code> with{" "}
								<code>reason: fix_loop_cap_exceeded</code> and the human
								triages.
							</div>
							<div
								style={{
									padding: "5px 8px",
									background: "#eff6ff",
									border: "1px solid #2563eb",
									borderRadius: 6,
									color: "#1e3a8a",
								}}
							>
								<strong>↗ integrate_fix_chains</strong> · when a fix-chain
								worktree's merge back into the stage branch hits conflicts, the
								gate dispatches an <strong>integrator</strong> subagent per
								chain (max <code>MAX_INTEGRATOR_ATTEMPTS = 3</code>; exhaustion
								escalates).
							</div>
						</div>
					</div>

					{stage.outputs.length > 0 ? (
						<div className="artifacts-block">
							<div className="artifacts-label">outputs → pool</div>
							<div className="artifacts out">
								{stage.outputs.map((o) => {
									const key = `${lower}.${o}`
									return (
										<button
											key={o}
											type="button"
											className={`artifact${isArtifactMatch(key) ? " match" : ""}`}
											data-artifact={key}
											onMouseEnter={() => matchArtifact(key, key)}
											onMouseLeave={() => matchArtifact(null, null)}
											onClick={() =>
												setModal({ kind: "artifact", artifactKey: key })
											}
											title={key}
										>
											{o}
										</button>
									)
								})}
							</div>
						</div>
					) : null}
				</section>

				{renderGateColumn(stage, idx, mStage, isAutoGate)}

				{mStage === "discrete" && idx < stages.length - 1 ? (
					<div className="paused-chip">
						<div className="paused-chip-body">
							<div className="paused-icon">⏸</div>
							<div>paused</div>
							<button
								type="button"
								className="call-chip"
								style={{ fontSize: 9, padding: "2px 8px" }}
								onClick={() =>
									setModal({ kind: "skill", skillName: "/haiku:pickup" })
								}
							>
								/haiku:pickup
							</button>
							<div>resumes next stage</div>
						</div>
					</div>
				) : null}
			</Fragment>
		)
	}

	const renderGateColumn = (
		stage: DerivedStage,
		idx: number,
		mStage: ExecutionMode,
		isAutoGate: boolean,
	) => {
		const isLast = idx === stages.length - 1
		const nextStageName = !isLast ? (stages[idx + 1]?.name ?? null) : null
		const stageGate = effectiveGate(stage, mStage)
		const p = payloadFor(stage, idx, mStage, "gate-to-next-stage", {
			isLast,
			nextStageName,
		})
		const onPillClick = () => {
			if (!p) return
			setModal({
				kind: "payload",
				payload: { stage: stage.name, key: "gate-to-next-stage", ...p },
			})
		}
		return (
			<aside className={`gate${isAutoGate ? " gate-auto" : ""}`}>
				<div className="gate-wrap" style={{ paddingLeft: 0, marginTop: 22 }}>
					<button
						type="button"
						className="call-chip gate-pill"
						onClick={onPillClick}
						title={p ? `${p.action} — ${p.summary}` : ""}
					>
						haiku_run_next
					</button>
					{isAutoGate ? (
						<div className="gate-body gate-auto-body">
							<div className="gate-auto-label">⚡ auto</div>
							<div className="gate-auto-sub">
								no review — workflow engine advances
								{isLast ? (
									" · intent_complete"
								) : (
									<>
										{" "}
										to <strong>{nextStageName}</strong>
									</>
								)}
							</div>
						</div>
					) : (
						<div className="gate-body">
							<div className="gate-label">gate</div>
							<div className="gate-type">{stageGate.type}</div>
							<ul className="gate-options">
								{stageGate.options.map((o) => {
									if (o === "external") {
										return (
											<li key={o} className="external">
												<div className="ext-head">
													<span className="team-icon">👥</span>
													<span>
														external
														<br />
														(team / human PR review)
													</span>
												</div>
												<div className="branch-name">
													{branchName(
														stage.name.toLowerCase(),
														mStage === "hybrid" ? "continuous" : mStage,
													)}
												</div>
												<div className="ext-outcomes">
													<span style={{ color: "var(--approve)" }}>
														→ next
													</span>
													<span style={{ color: "var(--reject)" }}>↺ back</span>
												</div>
											</li>
										)
									}
									return (
										<li key={o} className={gateClass(o)}>
											{o}
										</li>
									)
								})}
							</ul>
							{stageGate.options.includes("external") ? (
								<div
									style={{
										marginTop: 6,
										padding: "5px 7px",
										background: "#fff",
										border: "1px dashed var(--external)",
										borderRadius: 6,
										fontSize: 8,
										lineHeight: 1.4,
										color: "#92400e",
										fontFamily: "ui-monospace, 'SF Mono', monospace",
									}}
								>
									<div style={{ fontWeight: 700, marginBottom: 2 }}>
										external reconciliation:
									</div>
									<div>1. branch-merge detection → approved</div>
									<div>
										2. CLI provider probe (gh / glab / etc) → approved ·
										changes_requested · pending
									</div>
									<div>
										3. otherwise →{" "}
										<code
											style={{
												background: "rgba(245,158,11,0.12)",
												padding: "0 2px",
												borderRadius: 2,
												color: "#92400e",
												border: "none",
											}}
										>
											awaiting_external_review
										</code>
									</div>
								</div>
							) : null}
						</div>
					)}
				</div>
			</aside>
		)
	}

	const renderPreIntentCard = () => (
		<section className="pre-intent-card">
			<header>
				<h2>Pre-intent</h2>
				<span className="intent-meta">
					user ↔ agent clarification → <code>intent.md</code>
				</span>
			</header>
			<div
				className="pre-content"
				style={{
					display: "flex",
					flexDirection: "column",
					gap: 0,
					alignItems: "stretch",
				}}
			>
				<button
					type="button"
					className="pre-phase creation-summary"
					onClick={() => setModal({ kind: "intentCreation" })}
					style={{
						cursor: "pointer",
						textAlign: "left",
						border: "1.5px solid #e4a72b",
						background: "#fff",
					}}
				>
					<h3>
						<span>Intent creation</span>
						<span className="cs-skill-chip">/haiku:start</span>
						<span className="open-modal-hint">expand ↗</span>
					</h3>
					<div className="cs-loop">
						<div className="cs-box cs-user">
							<div className="cs-box-head">
								<span className="cs-avatar">🧑</span> you
							</div>
							<div className="cs-box-sample">
								"i want to add billing to the app"
							</div>
						</div>
						<div className="cs-arrows" aria-hidden="true">
							<div className="cs-arrow-top">→</div>
							<div className="cs-arrow-label">≥ 3 turns</div>
							<div className="cs-arrow-bot">←</div>
						</div>
						<div className="cs-box cs-agent">
							<div className="cs-box-head">
								<span className="cs-avatar">🤖</span> agent
							</div>
							<div className="cs-box-sample">
								"what payment provider, plans, currency?"
							</div>
						</div>
					</div>
				</button>
				<div className="phase-arrow">↓</div>
				<div className="gate-wrap" style={{ paddingLeft: 0, marginTop: 22 }}>
					{(() => {
						const stub = stages[0]
						const p = stub
							? payloadFor(stub, 0, "continuous", "preelab-to-stage1")
							: null
						return (
							<>
								<button
									type="button"
									className="call-chip gate-pill"
									onClick={() => {
										if (!p || !stub) return
										setModal({
											kind: "payload",
											payload: {
												stage: stub.name,
												key: "preelab-to-stage1",
												...p,
											},
										})
									}}
									title={p ? `${p.action} — ${p.summary}` : ""}
								>
									haiku_run_next
								</button>
								<div
									className="nested-gate"
									style={{
										borderColor: "#e4a72b",
										background: "#fff",
									}}
								>
									<div className="ng-head">
										<span className="ng-caption" style={{ color: "#92400e" }}>
											↳ inside this call · opens <code>intent_review</code> gate
											(blocking)
										</span>
										<span className="ig-type" style={{ color: "#92400e" }}>
											ask
										</span>
										<span className="ig-ctx">first-tick gate</span>
									</div>
									<div className="ng-branch-row">
										<span className="ng-branch reject-branch">
											↑ request changes → loop creation
										</span>
										<span className="ng-branch approve-branch">
											↓ approve → start_stage
										</span>
									</div>
									<div
										style={{
											marginTop: 6,
											fontSize: 10,
											color: "#92400e",
											lineHeight: 1.45,
										}}
									>
										The user's click <strong>is</strong> the outcome of the{" "}
										<code>haiku_run_next</code> call. On approve: state.json
										created, <code>phase: elaborate</code> set on the first
										stage.
									</div>
								</div>
							</>
						)
					})()}
				</div>
			</div>
		</section>
	)

	const renderPostIntentCard = () => (
		<section className="post-intent-card">
			<header>
				<h2>Post-intent</h2>
				<span className="intent-meta">final gate → delivery · operations</span>
			</header>
			<div className="post-grid">
				<section
					className="post-intent"
					id="intent-completion-review"
					style={{ borderLeft: "3px solid #a855f7" }}
				>
					<header>
						<h2>
							Intent-completion review{" "}
							<span
								style={{
									fontSize: 10,
									fontWeight: 500,
									color: "var(--muted)",
									marginLeft: 6,
									letterSpacing: 0,
									textTransform: "none",
								}}
							>
								· studio-level · default ON
							</span>
						</h2>
						<span className="subtitle-line">
							all stages approved → studio review-agents audit the whole intent
							→ optional fix loop → final gate
						</span>
					</header>
					<div className="post-steps">
						<div className="post-step">
							<div className="step-title">📋 dispatch review-agents</div>
							<div className="step-desc">
								workflow runs{" "}
								<code>plugin/studios/{"{studio}"}/review-agents/*.md</code>{" "}
								against the whole intent. Skipped when no studio review-agents
								are configured —<code> completion_review_skipped: true</code> is
								set on the intent and the gate falls through immediately.
							</div>
						</div>
						<div className="step-arrow">→</div>
						<div className="post-step">
							<div className="step-title">🔁 studio fix loop</div>
							<div className="step-desc">
								if findings exist, dispatch{" "}
								<code>plugin/studios/{"{studio}"}/fix-hats/*.md</code> against
								intent-scope FBs. Caps mirror the per-stage chain (3 bolts;{" "}
								<code>integrate_fix_chains</code> on merge conflicts).
							</div>
						</div>
						<div className="step-arrow">→</div>
						<div className="post-step">
							<div className="step-title">✅ ready for final gate</div>
							<div className="step-desc">
								zero open intent-scope findings → falls through to delivery.
							</div>
						</div>
					</div>
					<div
						style={{
							marginTop: 4,
							padding: "6px 8px",
							background: "#fff",
							border: "1px dashed #a855f7",
							borderRadius: 6,
							fontSize: 10,
							lineHeight: 1.45,
							color: "#581c87",
						}}
					>
						<strong>Opt out per intent:</strong> set{" "}
						<code>intent_completion_review: false</code> on intent.md
						frontmatter to skip this entire layer — the final stage's gate
						becomes terminal.
					</div>
				</section>
				<section className="post-intent" id="delivery">
					<header>
						<h2>
							Delivery{" "}
							<span
								style={{
									fontSize: 10,
									fontWeight: 500,
									color: "var(--muted)",
									marginLeft: 6,
									letterSpacing: 0,
									textTransform: "none",
								}}
							>
								· handled by your CI/CD infra, not H·AI·K·U
							</span>
						</h2>
						<span className="subtitle-line">
							final gate → merged → main → prod
						</span>
					</header>
					<div className="post-steps">
						<div className="post-step gate-step">
							<div className="step-title">🔍 final gate (PR/MR)</div>
							<div className="step-desc">last stage's approve routes here.</div>
						</div>
						<div className="step-arrow">→</div>
						<div className="post-step">
							<div className="step-title">🚀 merge</div>
							<div className="step-desc">
								into <code>main</code>
							</div>
						</div>
						<div className="step-arrow">→</div>
						<div className="post-step">
							<div className="step-title">🧪 CI</div>
							<div className="step-desc">build · lint · tests</div>
						</div>
						<div className="step-arrow">→</div>
						<div className="post-step">
							<div className="step-title">📦 release</div>
							<div className="step-desc">tag · changelog · artifact</div>
						</div>
						<div className="step-arrow">→</div>
						<div className="post-step">
							<div className="step-title">🌐 deploy</div>
							<div className="step-desc">promote to prod</div>
						</div>
					</div>
				</section>
			</div>
		</section>
	)

	if (bundleError) {
		return (
			<div className="haiku-arch-map">
				<div
					role="alert"
					style={{
						margin: "24px",
						padding: "16px 20px",
						background: "#fef2f2",
						border: "1.5px solid #dc2626",
						borderRadius: 10,
						color: "#7c2d12",
						fontFamily: "ui-monospace, 'SF Mono', monospace",
						fontSize: 12,
						lineHeight: 1.5,
					}}
				>
					<div style={{ fontWeight: 700, marginBottom: 6 }}>
						Failed to load <code>/prototype-stage-content.json</code>
					</div>
					<div style={{ marginBottom: 10 }}>{bundleError}</div>
					<button
						type="button"
						onClick={loadBundle}
						style={{
							padding: "4px 12px",
							border: "1.5px solid #7c2d12",
							borderRadius: 6,
							background: "#fff",
							color: "#7c2d12",
							cursor: "pointer",
							fontFamily: "inherit",
							fontSize: 11,
						}}
					>
						Retry
					</button>
				</div>
			</div>
		)
	}

	if (!bundle || !studioContent) {
		return (
			<div
				role="status"
				aria-live="polite"
				style={{
					padding: "24px",
					color: "#6b7280",
					fontFamily: "ui-monospace, 'SF Mono', monospace",
					fontSize: 12,
				}}
			>
				Loading studio content…
			</div>
		)
	}

	return (
		<div ref={mainRef} className="haiku-arch-map">
			<h1>H·AI·K·U Runtime Architecture</h1>
			<p className="subtitle">
				Every actor, every workflow engine tick, every state write — the
				studio's full intent lifecycle on one page.{" "}
				<strong>Hover anything for a tooltip · click for full detail.</strong>
			</p>

			<div
				style={{
					display: "flex",
					justifyContent: "center",
					margin: "0 0 16px",
				}}
			>
				<button
					type="button"
					onClick={() => setModal({ kind: "tickSemantics" })}
					style={{
						all: "unset",
						display: "inline-flex",
						alignItems: "center",
						gap: 10,
						padding: "8px 14px",
						background: "#0f172a",
						color: "#fbbf24",
						borderRadius: 6,
						fontSize: 11,
						fontFamily: "ui-monospace, 'SF Mono', monospace",
						fontWeight: 700,
						letterSpacing: "0.04em",
						textTransform: "uppercase",
						cursor: "pointer",
						boxSizing: "border-box",
					}}
					title="What a tick is, why it matters, and the pre-advance check pipeline"
				>
					<span>⏱ tick semantics</span>
					<span
						style={{
							color: "#94a3b8",
							fontWeight: 500,
							textTransform: "none",
							letterSpacing: 0,
						}}
					>
						haiku_run_next is the agent's only forward-driving verb · click for
						the full contract
					</span>
				</button>
			</div>

			{renderActorsStrip()}

			<div className="controls">
				<label htmlFor="studio-picker">Studio</label>
				<select
					id="studio-picker"
					value={activeStudio}
					onChange={(e) => {
						const next = e.target.value
						if (next === activeStudio) return
						router.push(`/studios/${next}/architecture/`)
					}}
				>
					{studioOptions.map((g) => (
						<optgroup key={g.category} label={g.category}>
							{g.items.map((s) => (
								<option key={s.dir} value={s.dir}>
									{s.dir} ({s.stageCount})
								</option>
							))}
						</optgroup>
					))}
				</select>
				<label htmlFor="mode-continuous">Execution mode</label>
				<div className="mode-group">
					{(["continuous", "discrete", "hybrid", "auto"] as const).map((m) => (
						<Fragment key={m}>
							<input
								type="radio"
								name="mode"
								id={`mode-${m}`}
								value={m}
								checked={mode === m}
								onChange={() => setMode(m)}
							/>
							<label htmlFor={`mode-${m}`}>
								{m === "auto" ? "autopilot" : m}
							</label>
						</Fragment>
					))}
				</div>
				{mode === "hybrid" ? (
					<span className="hybrid-picker">
						continuous_from:
						<select
							value={continuousFrom}
							onChange={(e) => setContinuousFrom(e.target.value)}
						>
							{stages.slice(1).map((s) => (
								<option key={s.key} value={s.name.toLowerCase()}>
									{s.name.toLowerCase()}
								</option>
							))}
						</select>
					</span>
				) : null}
			</div>

			<div className="page">
				<main className="main">
					<div className="card-stack">
						{renderPreIntentCard()}
						<div className="v-arrow" />
						<div className="intent-card">
							<header>
								<h2>Intent</h2>
								<span className="intent-meta">
									<code>.haiku/intents/{"{slug}"}/intent.md</code> · studio:{" "}
									<code>{activeStudio}</code>
								</span>
							</header>
							<div className="studio">
								{stages.map((s, i) => renderStage(s, i))}
							</div>
						</div>
						<div className="v-arrow approve-flow">
							<span className="label">approve → delivery</span>
							<span className="tip" />
						</div>
						{renderPostIntentCard()}
					</div>
				</main>
			</div>

			<ModalRouter
				modal={modal}
				onClose={closeModal}
				studioContent={studioContent}
				stages={stages}
			/>
		</div>
	)
}

function effectiveGate(
	stage: DerivedStage,
	mStage: ExecutionMode,
): { type: string; options: string[] } {
	if (mStage === "discrete")
		return { type: "external (discrete)", options: ["external"] }
	if (mStage === "auto")
		return { type: "auto (autopilot · /haiku:autopilot)", options: ["advance"] }
	return stage.gate
}
