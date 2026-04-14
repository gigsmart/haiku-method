import fs from "node:fs"
import path from "node:path"
import matter from "gray-matter"

const pluginStudiosDir = path.join(process.cwd(), "..", "plugin", "studios")

export interface HatDefinition {
	name: string
	stage: string
	studio: string
	content: string
}

export interface ReviewAgentDefinition {
	name: string
	stage: string
	studio: string
	content: string
}

export interface StageDefinition {
	name: string
	description: string
	hats: string[]
	review: string
	inputs: Array<{ stage: string; output: string; kind: "discovery" | "output" }>
	reviewAgentsInclude: Array<{ stage: string; agents: string[] }>
	content: string
	hatDefinitions: HatDefinition[]
	reviewAgentDefinitions: ReviewAgentDefinition[]
}

export interface StudioDefinition {
	slug: string
	name: string
	description: string
	stages: string[]
	content: string
	stageDefinitions: StageDefinition[]
	category: string
}

// Categorize studios by domain
const categoryLabels: Record<string, string> = {
	engineering: "Engineering",
	"go-to-market": "Go-to-Market",
	operations: "Operations",
	"back-office": "Back Office",
	product: "Product",
	general: "General Purpose",
}

function categorizeStudio(slug: string, rawCategory?: string): string {
	if (rawCategory && categoryLabels[rawCategory]) return categoryLabels[rawCategory]
	if (rawCategory) return rawCategory.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")
	// Legacy fallback for studios without category field
	const engineering = ["software", "data-pipeline", "security-assessment", "documentation"]
	const gtm = ["sales", "marketing", "customer-success"]
	const ops = ["incident-response", "migration", "project-management", "quality-assurance"]
	if (engineering.includes(slug)) return "Engineering"
	if (gtm.includes(slug)) return "Go-to-Market"
	if (ops.includes(slug)) return "Operations"
	return "General Purpose"
}

function parseHat(hatPath: string): HatDefinition | null {
	if (!fs.existsSync(hatPath)) return null
	const raw = fs.readFileSync(hatPath, "utf8")
	const { data, content } = matter(raw)
	return {
		name: data.name || path.basename(hatPath, ".md"),
		stage: data.stage || "",
		studio: data.studio || "",
		content: content.trim(),
	}
}

function parseReviewAgent(agentPath: string): ReviewAgentDefinition | null {
	if (!fs.existsSync(agentPath)) return null
	const raw = fs.readFileSync(agentPath, "utf8")
	const { data, content } = matter(raw)
	return {
		name: data.name || path.basename(agentPath, ".md"),
		stage: data.stage || "",
		studio: data.studio || "",
		content: content.trim(),
	}
}

function parseStage(stageDir: string): StageDefinition | null {
	const stagePath = path.join(stageDir, "STAGE.md")
	if (!fs.existsSync(stagePath)) return null
	const raw = fs.readFileSync(stagePath, "utf8")
	const { data, content } = matter(raw)

	// Parse hats
	const hatsDir = path.join(stageDir, "hats")
	const hatDefinitions: HatDefinition[] = []
	if (fs.existsSync(hatsDir)) {
		const hatFiles = fs.readdirSync(hatsDir).filter((f) => f.endsWith(".md")).sort()
		for (const hatFile of hatFiles) {
			const hat = parseHat(path.join(hatsDir, hatFile))
			if (hat) hatDefinitions.push(hat)
		}
	}

	// Parse review agents
	const reviewAgentsDir = path.join(stageDir, "review-agents")
	const reviewAgentDefinitions: ReviewAgentDefinition[] = []
	if (fs.existsSync(reviewAgentsDir)) {
		const agentFiles = fs.readdirSync(reviewAgentsDir).filter((f) => f.endsWith(".md")).sort()
		for (const agentFile of agentFiles) {
			const agent = parseReviewAgent(path.join(reviewAgentsDir, agentFile))
			if (agent) reviewAgentDefinitions.push(agent)
		}
	}

	return {
		name: data.name || path.basename(stageDir),
		description: data.description || "",
		hats: data.hats || [],
		review: Array.isArray(data.review) ? data.review.join(", ") : data.review || "ask",
		inputs: (data.inputs || []).map((i: { stage: string; output?: string; discovery?: string }) => ({
			stage: i.stage,
			output: i.discovery || i.output || "",
			kind: (i.discovery ? "discovery" : "output") as "discovery" | "output",
		})),
		reviewAgentsInclude: (data["review-agents-include"] || []).map(
			(i: { stage: string; agents: string[] }) => ({
				stage: i.stage,
				agents: i.agents || [],
			}),
		),
		content: content.trim(),
		hatDefinitions,
		reviewAgentDefinitions,
	}
}

function parseStudio(studioDir: string): StudioDefinition | null {
	const studioPath = path.join(studioDir, "STUDIO.md")
	if (!fs.existsSync(studioPath)) return null
	const raw = fs.readFileSync(studioPath, "utf8")
	const { data, content } = matter(raw)
	const slug = path.basename(studioDir)

	// Parse stages in order defined by frontmatter
	const stageNames: string[] = data.stages || []
	const stageDefinitions: StageDefinition[] = []
	for (const stageName of stageNames) {
		const stageDir = path.join(studioDir, "stages", stageName)
		const stage = parseStage(stageDir)
		if (stage) stageDefinitions.push(stage)
	}

	return {
		slug,
		name: data.name || slug,
		description: data.description || "",
		stages: stageNames,
		content: content.trim(),
		stageDefinitions,
		category: categorizeStudio(slug, data.category as string | undefined),
	}
}

export function getAllStudios(): StudioDefinition[] {
	if (!fs.existsSync(pluginStudiosDir)) return []
	const dirs = fs.readdirSync(pluginStudiosDir).filter((d) => {
		const fullPath = path.join(pluginStudiosDir, d)
		return fs.statSync(fullPath).isDirectory()
	})
	return dirs
		.map((d) => parseStudio(path.join(pluginStudiosDir, d)))
		.filter((s): s is StudioDefinition => s !== null)
		.sort((a, b) => {
			const catOrder = ["Engineering", "Product", "Go-to-Market", "Operations", "Back Office", "General Purpose"]
			const catDiff = catOrder.indexOf(a.category) - catOrder.indexOf(b.category)
			if (catDiff !== 0) return catDiff
			return a.name.localeCompare(b.name)
		})
}

export function getStudioBySlug(slug: string): StudioDefinition | null {
	const studioDir = path.join(pluginStudiosDir, slug)
	return parseStudio(studioDir)
}

export function getStudioSlugs(): string[] {
	return getAllStudios().map((s) => s.slug)
}

export function getStudiosGrouped(): Map<string, StudioDefinition[]> {
	const studios = getAllStudios()
	const groups = new Map<string, StudioDefinition[]>()
	for (const studio of studios) {
		const existing = groups.get(studio.category) || []
		existing.push(studio)
		groups.set(studio.category, existing)
	}
	return groups
}
