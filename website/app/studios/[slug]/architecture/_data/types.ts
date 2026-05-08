// Shared types for the architecture map data layer.

export interface StudioContentFile {
	content: string | null
	frontmatter: Record<string, unknown>
	body: string
	path: string
}

export interface StudioContentStage {
	frontmatter: Record<string, unknown>
	stageMd: string | null
	stagePath: string
	hats: Record<string, StudioContentFile>
	reviewAgents: Record<string, StudioContentFile>
	discoveryDefs: Record<string, StudioContentFile>
	outputDefs: Record<string, StudioContentFile>
}

export interface StudioContentPreIntent {
	slug: string
	title: string
	studio: string
	related: string[]
	turns: Array<{ role: "user" | "agent"; text: string }>
	seed: string
	preIntentPath: string
	intentPath: string | null
}

export interface StudioContentEntry {
	dir: string
	frontmatter: Record<string, unknown>
	studioMd: string | null
	studioPath: string
	stagesOrder: string[]
	reflections: Record<string, StudioContentFile>
	operations: Record<string, StudioContentFile>
	templates: Record<string, StudioContentFile>
	examples: Record<string, StudioContentFile>
	preIntents: Record<string, StudioContentPreIntent>
	stages: Record<string, StudioContentStage>
}

export interface StudioContentBundle {
	defaultStudio: string
	studioList: Array<{
		dir: string
		slug: string
		name: string
		description: string
		category: string
		stageCount: number
	}>
	studios: Record<string, StudioContentEntry>
}

export type ExecutionMode = "continuous" | "discrete" | "hybrid" | "auto"

export interface StageGate {
	label: string
	type: string
	options: string[]
}

export interface StageUnit {
	id: string
	model: string
}

export interface StageWave {
	label: string
	units: string[]
}

export interface DerivedStage {
	key: string
	name: string
	reviewLabel: string
	hats: string[]
	waves: StageWave[]
	units: StageUnit[]
	reviewAgents: string[]
	inputs: string[]
	outputs: string[]
	gate: { type: string; options: string[] }
}

export type ModalKind =
	| { kind: "actor"; actorKey: string }
	| { kind: "hook"; hookName: string }
	| { kind: "payload"; payload: PayloadModalData }
	| { kind: "stageMd"; stageKey: string }
	| { kind: "hat"; stageKey: string; hatName: string }
	| { kind: "reviewAgent"; stageKey: string; agentName: string }
	| { kind: "subagent"; stageKey: string; hatName: string }
	| { kind: "schema"; schemaKey: string }
	| { kind: "validation"; validationKey: string }
	| { kind: "revisit"; stageKey: string; stageIdx: number }
	| { kind: "gateDetail"; detailKey: string }
	| { kind: "tool"; toolName: string; contextKey?: string }
	| { kind: "skill"; skillName: string }
	| {
			kind: "aux"
			auxKind: "reflections" | "operations" | "templates"
			name: string
	  }
	| { kind: "unit"; stageName: string; unitId: string; model: string }
	| { kind: "artifact"; artifactKey: string }
	| { kind: "intentCreation" }
	| { kind: "cursorTracks" }
	| { kind: "tickSemantics" }

export interface PayloadModalData {
	stage: string
	key: string
	action: string
	summary: string
	payload: unknown
	validations: string[]
	writes?: Array<{ path: string; change: string }>
	injection?: Array<{ hook: string; target: string; what: string }>
	instructions: string
}
