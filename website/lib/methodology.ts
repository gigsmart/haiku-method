import fs from "node:fs"
import path from "node:path"
import matter from "gray-matter"

const methodologyDirectory = path.join(process.cwd(), "content/methodology")

export interface MethodologyPhase {
	slug: string
	title: string
	description: string
	phase_number: number
	color: string
	content: string
}

const validPhases = ["elaboration", "execution", "operation", "reflection"]

export function getMethodologyPhase(slug: string): MethodologyPhase | null {
	if (!validPhases.includes(slug)) {
		return null
	}

	const fullPath = path.join(methodologyDirectory, `${slug}.md`)

	if (!fs.existsSync(fullPath)) {
		return null
	}

	const fileContents = fs.readFileSync(fullPath, "utf8")
	const { data, content } = matter(fileContents)

	return {
		slug,
		title: data.title || slug,
		description: data.description || "",
		phase_number: data.phase_number || 0,
		color: data.color || "teal",
		content,
	}
}

export function getAllMethodologyPhases(): MethodologyPhase[] {
	return validPhases
		.map((slug) => getMethodologyPhase(slug))
		.filter((phase): phase is MethodologyPhase => phase !== null)
		.sort((a, b) => a.phase_number - b.phase_number)
}

export function getMethodologyPhaseSlugs(): string[] {
	return validPhases.filter((slug) => {
		const fullPath = path.join(methodologyDirectory, `${slug}.md`)
		return fs.existsSync(fullPath)
	})
}
