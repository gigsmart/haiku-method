import { readFileSync } from "node:fs"
import { resolve } from "node:path"

/** CSS tokens for a design archetype */
export interface DesignTokens {
	color_primary: string
	color_background: string
	color_accent: string
	color_text: string
	color_muted: string
	font_heading: string
	font_body: string
	font_size_base: string
	line_height: string
	border_radius: string
	border_width: string
	border_color: string
	shadow: string
	spacing_unit: string
	spacing_section: string
}

/** Default parameter values for an archetype */
export interface DesignDefaultParameters {
	density: number
	expressiveness: number
	shape_language: number
	color_mood: number
}

/** A design archetype definition */
export interface DesignArchetypeData {
	id: string
	name: string
	description: string
	tokens: DesignTokens
	layout_guidelines: string
	typography_guidelines: string
	component_guidelines: string
	default_parameters: DesignDefaultParameters
	preview_html: string
}

/** A tunable design parameter definition */
export interface DesignParameterData {
	id: string
	name: string
	description: string
	min: number
	max: number
	step: number
	low_label: string
	high_label: string
}

/** The full archetype data file shape */
interface ArchetypeDataFile {
	archetypes: DesignArchetypeData[]
	parameters: DesignParameterData[]
}

// Resolve the JSON data file relative to this module's location.
// At runtime (Bun), import.meta.dir gives us the src/ directory,
// so we go up two levels to reach plugin/, then into data/.
const DATA_PATH = resolve(
	(import.meta as unknown as Record<string, string>).dir ?? new URL(".", import.meta.url).pathname,
	"..",
	"..",
	"data",
	"archetypes.json",
)

let _cache: ArchetypeDataFile | null = null

/**
 * Load archetype data from the canonical JSON file.
 * Results are cached after the first call.
 */
export function loadArchetypeData(): ArchetypeDataFile {
	if (_cache) return _cache
	const raw = readFileSync(DATA_PATH, "utf-8")
	_cache = JSON.parse(raw) as ArchetypeDataFile
	return _cache
}

/**
 * Get all archetype definitions.
 */
export function getArchetypes(): DesignArchetypeData[] {
	return loadArchetypeData().archetypes
}

/**
 * Get a single archetype by ID, or undefined if not found.
 */
export function getArchetype(id: string): DesignArchetypeData | undefined {
	return loadArchetypeData().archetypes.find((a) => a.id === id)
}

/**
 * Get all parameter definitions.
 */
export function getParameters(): DesignParameterData[] {
	return loadArchetypeData().parameters
}
