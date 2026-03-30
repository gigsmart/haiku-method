import fs from "node:fs"
import path from "node:path"
import matter from "gray-matter"

const docsDirectory = path.join(process.cwd(), "content/docs")

export interface DocPage {
	slug: string
	title: string
	description?: string
	content: string
	order?: number
}

export interface NavItem {
	title: string
	href: string
	items?: NavItem[]
}

export interface NavSection {
	title: string
	items: NavItem[]
}

export function getDocSlugs(): string[] {
	if (!fs.existsSync(docsDirectory)) {
		return []
	}

	return fs
		.readdirSync(docsDirectory)
		.filter((file) => file.endsWith(".md"))
		.map((file) => file.replace(/\.md$/, ""))
}

export function getDocBySlug(slug: string): DocPage | null {
	const fullPath = path.join(docsDirectory, `${slug}.md`)

	if (!fs.existsSync(fullPath)) {
		return null
	}

	const fileContents = fs.readFileSync(fullPath, "utf8")
	const { data, content } = matter(fileContents)

	return {
		slug,
		title: data.title || slug,
		description: data.description,
		content,
		order: data.order,
	}
}

export function getAllDocs(): DocPage[] {
	const slugs = getDocSlugs()
	const docs = slugs
		.map((slug) => getDocBySlug(slug))
		.filter((doc): doc is DocPage => doc !== null)

	// Sort by order if specified, then by title
	return docs.sort((a, b) => {
		if (a.order !== undefined && b.order !== undefined) {
			return a.order - b.order
		}
		if (a.order !== undefined) return -1
		if (b.order !== undefined) return 1
		return a.title.localeCompare(b.title)
	})
}

// Define which docs belong to which section — organized around the toolkit groups
const sectionDefinitions: { title: string; slugs: string[] }[] = [
	{
		title: "Getting Started",
		slugs: ["installation", "quick-start", "checklist-first-intent"],
	},
	{
		title: "Core Concepts",
		slugs: ["hats", "workflows", "concepts"],
	},
	{
		title: "Before You Build",
		slugs: ["providers", "stack-config", "cowork"],
	},
	{
		title: "While You Build",
		slugs: ["index"],
	},
	{
		title: "After You Build",
		slugs: ["operations-guide", "operation-schema"],
	},
	{
		title: "Role Guides",
		slugs: [
			"guide-developer",
			"guide-designer",
			"guide-tech-lead",
			"guide-manager",
			"guide-ai",
		],
	},
	{
		title: "Adoption",
		slugs: [
			"adoption-roadmap",
			"checklist-team-onboarding",
			"assessment",
		],
	},
	{
		title: "Examples",
		slugs: ["example-feature", "example-bugfix"],
	},
	{
		title: "Community",
		slugs: ["community"],
	},
]

export function getDocsNavigation(): NavSection[] {
	const docs = getAllDocs()
	const docsBySlug = new Map(docs.map((doc) => [doc.slug, doc]))

	const sections: NavSection[] = []

	for (const section of sectionDefinitions) {
		const items: NavItem[] = []
		for (const slug of section.slugs) {
			const doc = docsBySlug.get(slug)
			if (doc) {
				items.push({
					title: doc.title,
					href: `/docs/${doc.slug}/`,
				})
				docsBySlug.delete(slug)
			}
		}
		if (items.length > 0) {
			sections.push({
				title: section.title,
				items,
			})
		}
	}

	// Add any remaining docs to an "Other" section
	const remainingDocs = Array.from(docsBySlug.values())
	if (remainingDocs.length > 0) {
		sections.push({
			title: "Other",
			items: remainingDocs.map((doc) => ({
				title: doc.title,
				href: `/docs/${doc.slug}/`,
			})),
		})
	}

	return sections
}

// Keep the old function for backward compatibility
export function getDocsNavigationFlat(): NavItem[] {
	const docs = getAllDocs()

	return [
		{
			title: "Getting Started",
			href: "/docs/",
			items: docs.map((doc) => ({
				title: doc.title,
				href: `/docs/${doc.slug}/`,
			})),
		},
	]
}
