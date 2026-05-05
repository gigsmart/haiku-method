export interface IntentGit {
	change_strategy: string
	auto_merge: boolean
	auto_squash: boolean
}

export interface IntentFrontmatter {
	title?: string
	studio: string
	mode: string
	active_stage: string
	status: string
	archived?: boolean
	started_at?: string
	completed_at?: string | null
	// Legacy fields
	workflow?: string
	git?: IntentGit
	announcements?: string[]
	passes?: string[]
	active_pass?: string
	iterates_on?: string
	created?: string
	epic?: string
	// Composite intents
	composite?: Array<{ studio: string; stages: string[] }>
	sync?: Array<{ wait: string[]; then: string[] }>
	composite_state?: Record<string, string>
}

export interface UnitFrontmatter {
	name?: string
	type: string
	status: string
	depends_on: string[]
	bolt: number
	hat: string
	model?: string
	applicable_skills?: string[]
	started_at?: string
	completed_at?: string | null
	// Injected by parseAllUnits when unit is in stages/{stage}/units/
	stage?: string
	// Intent-relative paths to artifacts the unit consumed (declared
	// upstream context) and produced (deliverables auto-populated by
	// the workflow engine at advance_hat). Both are read by the review
	// UI to surface per-unit input/output linkouts.
	inputs?: string[]
	outputs?: string[]
	// Legacy fields
	last_updated?: string
	branch?: string
	discipline?: string
	pass?: string
	workflow?: string
	ticket?: string
	wireframe?: string
	design_ref?: string
	deployment?: Record<string, unknown>
	monitoring?: Record<string, unknown>
	operations?: Record<string, unknown>
}

export interface StageState {
	stage: string
	status: string // pending | active | completed
	phase: string // elaborate | execute | review | gate
	started_at?: string
	completed_at?: string | null
	gate_entered_at?: string | null
	gate_outcome?: string | null // advanced | paused | blocked | awaiting
}

// IntentPhase is the fixed taxonomy every studio shares. `step` (on
// IntentCurrentState below) is studio-defined and lives outside this
// type intentionally — different studios have different sub-phase
// granularity.
export type IntentPhase = "elaborate" | "execute" | "review" | "gate"

export interface IntentNextStateHint {
	stage?: string
	phase?: IntentPhase
	step?: string
	blockedOn?: "user-gate" | "external-review" | "feedback-fix" | null
}

// IntentCurrentState is the unified shape every consumer (orchestrator,
// HTTP API, browse SPA) reads to answer "where is this intent right
// now?". Derived fresh from per-stage state.json on every call —
// intent.md.active_stage is treated as a write-only cache for legacy
// shell tooling, never as a read source.
//
// `step` and `nextState` are reserved for follow-up work — when the
// orchestrator action handlers begin writing sub-phase steps to
// state.json, those values will populate here. For now they are
// left undefined; consumers should treat `phase` as the most granular
// reliable signal.
export interface IntentCurrentState {
	studio: string
	stage: string
	phase: IntentPhase | ""
	step?: string
	nextState?: IntentNextStateHint | null
}

export interface DiscoveryFrontmatter {
	intent: string
	created: string
	status: string
}

export interface Section {
	heading: string
	level: number
	content: string
	subsections: Section[]
}

export interface CriterionItem {
	text: string
	checked: boolean
}

export interface ParsedIntent {
	slug: string
	frontmatter: IntentFrontmatter
	title: string
	sections: Section[]
	rawContent: string
}

export interface ParsedUnit {
	slug: string
	number: number
	frontmatter: UnitFrontmatter
	title: string
	sections: Section[]
	rawContent: string
}

export interface ParsedDiscovery {
	frontmatter: DiscoveryFrontmatter
	title: string
	body: string
}

export interface DAGNode {
	id: string
	status: string
}

export interface DAGEdge {
	from: string
	to: string
}

export interface DAGGraph {
	nodes: DAGNode[]
	edges: DAGEdge[]
	adjacency: Map<string, string[]>
	unresolvedDeps?: Array<{ unit: string; dep: string }>
}
