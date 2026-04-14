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
	started_at?: string
	completed_at?: string | null
	// Injected by parseAllUnits when unit is in stages/{stage}/units/
	stage?: string
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
