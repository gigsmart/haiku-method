/**
 * Parsed-markdown shapes emitted by the MCP backend (`sessions.ts`) and
 * consumed by this SPA. Deliberately not part of the wire contract in
 * `haiku-api` — those schemas use `LooseRecord` for parsed artifacts, because
 * they're internal parser output not external API shape.
 *
 * These live in a sibling file to keep `types.ts` a pure re-export barrel
 * (unit-03 invariant: zero local `export type/interface` in types.ts).
 */

export interface Section {
	heading: string
	level: number
	content: string
	subsections: Section[]
}

export interface UnitFrontmatter {
	status: string
	discipline?: string
	depends_on?: string[]
	wireframe?: string
	stage?: string
	[key: string]: unknown
}

export interface ParsedUnit {
	slug: string
	title: string
	number: number
	frontmatter: UnitFrontmatter
	sections: Section[]
	rawContent?: string
}

export interface IntentFrontmatter {
	status: string
	workflow?: string
	announcements?: string[]
	git?: {
		change_strategy: string
		auto_merge: boolean
		auto_squash: boolean
	}
	[key: string]: unknown
}

export interface ParsedIntent {
	slug: string
	title: string
	frontmatter: IntentFrontmatter
	sections: Section[]
	rawContent?: string
}
