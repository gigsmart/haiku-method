import fs from "node:fs"
import path from "node:path"
import matter from "gray-matter"
import { getFileContributorNames } from "./git-contributors"

const papersDirectory = path.join(process.cwd(), "content/papers")

export interface PaperHeading {
	id: string
	text: string
	level: number
	children: PaperHeading[]
}

export interface Paper {
	slug: string
	title: string
	subtitle?: string
	description?: string
	date: string
	authors?: string[]
	tags?: string[]
	content: string
}

/**
 * Generate a slug from heading text (matches rehype-slug/github-slugger behavior)
 * github-slugger does NOT collapse multiple hyphens, so "Phases & Rituals" becomes "phases--rituals"
 */
function slugify(text: string): string {
	return text
		.toLowerCase()
		.trim()
		.replace(/[^\w\s-]/g, "") // Remove non-word chars except spaces and hyphens
		.replace(/\s+/g, "-") // Replace spaces with hyphens
		// Note: Do NOT collapse multiple hyphens - github-slugger preserves them
}

/**
 * Extract headings from markdown content to build table of contents
 * Handles duplicate headings by appending -1, -2, etc. (matching rehype-slug behavior)
 */
export function extractHeadings(content: string): PaperHeading[] {
	const headingRegex = /^(#{2,4})\s+(.+)$/gm
	const headings: PaperHeading[] = []
	const stack: PaperHeading[] = []
	const seenIds = new Map<string, number>()

	let match: RegExpExecArray | null
	while (true) {
		match = headingRegex.exec(content)
		if (match === null) break
		const level = match[1].length
		const text = match[2].trim()
		const baseId = slugify(text)

		// Handle duplicate IDs (matching rehype-slug behavior)
		let id = baseId
		const count = seenIds.get(baseId) || 0
		if (count > 0) {
			id = `${baseId}-${count}`
		}
		seenIds.set(baseId, count + 1)

		const heading: PaperHeading = {
			id,
			text,
			level,
			children: [],
		}

		// Find the right parent based on level
		while (stack.length > 0 && stack[stack.length - 1].level >= level) {
			stack.pop()
		}

		if (stack.length === 0) {
			headings.push(heading)
		} else {
			stack[stack.length - 1].children.push(heading)
		}

		stack.push(heading)
	}

	return headings
}

/**
 * Get all paper slugs
 */
export function getPaperSlugs(): string[] {
	if (!fs.existsSync(papersDirectory)) {
		return []
	}

	return fs
		.readdirSync(papersDirectory)
		.filter((file) => file.endsWith(".md"))
		.map((file) => file.replace(/\.md$/, ""))
}

/**
 * Get a paper by its slug
 */
export function getPaperBySlug(slug: string): Paper | null {
	const fullPath = path.join(papersDirectory, `${slug}.md`)

	if (!fs.existsSync(fullPath)) {
		return null
	}

	const fileContents = fs.readFileSync(fullPath, "utf8")
	const { data, content } = matter(fileContents)

	// Get authors from git history, sorted by number of contributions
	const gitAuthors = getFileContributorNames(fullPath)
	// Fall back to frontmatter authors if no git history
	const authors = gitAuthors.length > 0 ? gitAuthors : data.authors || []

	// Strip duplicate title and subtitle from content
	let processedContent = content
	const lines = content.split("\n")
	let startIndex = 0

	// Skip leading empty lines
	while (startIndex < lines.length && lines[startIndex].trim() === "") {
		startIndex++
	}

	// Check if first non-empty line is an H1 heading
	if (startIndex < lines.length && lines[startIndex].startsWith("# ")) {
		startIndex++ // Skip the H1

		// Skip any empty lines after H1
		while (startIndex < lines.length && lines[startIndex].trim() === "") {
			startIndex++
		}

		// Check if next line is an H2 heading (subtitle)
		if (startIndex < lines.length && lines[startIndex].startsWith("## ")) {
			startIndex++ // Skip the H2

			// Skip any empty lines after H2
			while (startIndex < lines.length && lines[startIndex].trim() === "") {
				startIndex++
			}

			// Check if next line is a horizontal rule
			if (startIndex < lines.length && lines[startIndex].trim() === "---") {
				startIndex++ // Skip the horizontal rule
			}
		}

		processedContent = lines.slice(startIndex).join("\n")
	}

	return {
		slug,
		title: data.title || slug,
		subtitle: data.subtitle,
		description: data.description,
		date: data.date || new Date().toISOString(),
		authors,
		tags: data.tags,
		content: processedContent,
	}
}

/**
 * Get all papers sorted by date
 */
export function getAllPapers(): Paper[] {
	const slugs = getPaperSlugs()
	const papers = slugs
		.map((slug) => getPaperBySlug(slug))
		.filter((paper): paper is Paper => paper !== null)

	// Sort by date, newest first
	return papers.sort(
		(a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
	)
}

/**
 * Get the AI-DLC paper (main paper)
 */
export function getMainPaper(): Paper | null {
	return getPaperBySlug("ai-dlc-2026")
}

/**
 * Get the table of contents for a paper
 */
export function getPaperTOC(paper: Paper): PaperHeading[] {
	return extractHeadings(paper.content)
}
