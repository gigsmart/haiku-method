import fs from "node:fs"
import path from "node:path"
import type { DemoConfig } from "./types"

const pluginStudiosDir = path.join(process.cwd(), "..", "plugin", "studios")

// Legacy step modules for studios without example artifacts
const stepModules: Record<string, () => Promise<{ config: DemoConfig }>> = {
	compliance: () => import("./steps/compliance"),
	"customer-success": () => import("./steps/customer-success"),
	"data-pipeline": () => import("./steps/data-pipeline"),
	documentation: () => import("./steps/documentation"),
	"executive-strategy": () => import("./steps/executive-strategy"),
	finance: () => import("./steps/finance"),
	hr: () => import("./steps/hr"),
	ideation: () => import("./steps/ideation"),
	"incident-response": () => import("./steps/incident-response"),
	legal: () => import("./steps/legal"),
	marketing: () => import("./steps/marketing"),
	migration: () => import("./steps/migration"),
	"product-strategy": () => import("./steps/product-strategy"),
	"project-management": () => import("./steps/project-management"),
	"quality-assurance": () => import("./steps/quality-assurance"),
	sales: () => import("./steps/sales"),
	"security-assessment": () => import("./steps/security-assessment"),
	training: () => import("./steps/training"),
	"vendor-management": () => import("./steps/vendor-management"),
}

/**
 * Find the first example directory for a studio that has a sequence.ts file.
 * Returns the example name or null if no examples exist.
 */
function findExampleName(slug: string): string | null {
	const examples = listExamples(slug)
	return examples.length > 0 ? examples[0] : null
}

/** List all examples for a studio that have a sequence file */
export function listExamples(slug: string): string[] {
	const examplesDir = path.join(pluginStudiosDir, slug, "examples")
	if (!fs.existsSync(examplesDir)) return []
	return fs.readdirSync(examplesDir).filter((d) => {
		const fullPath = path.join(examplesDir, d)
		if (!fs.statSync(fullPath).isDirectory()) return false
		return fs.existsSync(path.join(fullPath, "sequence.ts"))
	})
}

/**
 * Dynamically import the sequence config from an example directory.
 * Uses a known mapping to avoid dynamic path imports that bundlers can't resolve.
 */
const exampleModules: Record<string, () => Promise<{ config: DemoConfig }>> = {
	"software/add-oauth-login": () =>
		import(
			"../../../plugin/studios/software/examples/add-oauth-login/sequence"
		),
}

export async function getDemoConfig(slug: string, example?: string): Promise<DemoConfig | null> {
	// Check for example-driven demo first
	const exampleName = example || findExampleName(slug)
	if (exampleName) {
		const key = `${slug}/${exampleName}`
		const loader = exampleModules[key]
		if (loader) {
			const mod = await loader()
			return mod.config
		}
	}

	// Fall back to legacy step modules
	const loader = stepModules[slug]
	if (!loader) return null
	const mod = await loader()
	return mod.config
}

/**
 * Load all artifact files from an example directory as a flat map
 * of display path -> file content. Used at build time by the server component.
 */
export function loadExampleArtifacts(
	slug: string,
	example?: string,
): Record<string, string> | null {
	const exampleName = example || findExampleName(slug)
	if (!exampleName) return null

	const exampleDir = path.join(pluginStudiosDir, slug, "examples", exampleName)
	const artifacts: Record<string, string> = {}
	const intentPrefix = `.haiku/intents/${exampleName}`

	function walk(dir: string, relativeTo: string) {
		if (!fs.existsSync(dir)) return
		const entries = fs.readdirSync(dir, { withFileTypes: true })
		for (const entry of entries) {
			const fullPath = path.join(dir, entry.name)
			if (entry.name === "sequence.ts") continue
			if (entry.isDirectory()) {
				walk(fullPath, path.join(relativeTo, entry.name))
			} else {
				const displayPath =
					`${intentPrefix}/${relativeTo}/${entry.name}`.replace(/\/\//g, "/")
				try {
					artifacts[displayPath] = fs.readFileSync(fullPath, "utf8")
				} catch {
					// Skip binary files or unreadable files
				}
			}
		}
	}

	walk(exampleDir, "")
	return artifacts
}

export type { DemoConfig } from "./types"
