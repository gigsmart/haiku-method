import fs from "node:fs"
import path from "node:path"
import matter from "gray-matter"

const blogDirectory = path.join(process.cwd(), "content/blog")

export type BlogFormat = "md" | "mdx"

export interface BlogPost {
	slug: string
	title: string
	description?: string
	date: string
	author?: string
	category?: string
	tags?: string[]
	content: string
	format: BlogFormat
}

export function getBlogSlugs(): string[] {
	if (!fs.existsSync(blogDirectory)) {
		return []
	}

	const seen = new Set<string>()
	for (const file of fs.readdirSync(blogDirectory)) {
		if (file.endsWith(".mdx")) seen.add(file.replace(/\.mdx$/, ""))
		else if (file.endsWith(".md")) seen.add(file.replace(/\.md$/, ""))
	}
	return [...seen]
}

const postCache = new Map<string, BlogPost | null>()

export function getBlogPostBySlug(slug: string): BlogPost | null {
	// Path traversal protection
	if (slug !== path.basename(slug)) return null

	if (postCache.has(slug)) return postCache.get(slug) ?? null

	// Prefer .mdx over .md if both exist
	const mdxPath = path.join(blogDirectory, `${slug}.mdx`)
	const mdPath = path.join(blogDirectory, `${slug}.md`)

	let fullPath: string
	let format: BlogFormat
	if (fs.existsSync(mdxPath)) {
		fullPath = mdxPath
		format = "mdx"
	} else if (fs.existsSync(mdPath)) {
		fullPath = mdPath
		format = "md"
	} else {
		return null
	}

	const fileContents = fs.readFileSync(fullPath, "utf8")
	const { data, content } = matter(fileContents)

	const tagsRaw = data.tags
	const tags = Array.isArray(tagsRaw)
		? tagsRaw.map((t) => String(t))
		: typeof tagsRaw === "string"
			? tagsRaw.split(",").map((t) => t.trim()).filter(Boolean)
			: undefined

	const post: BlogPost = {
		slug,
		title: data.title || slug,
		description: data.description,
		date: data.date ? String(data.date) : "1970-01-01",
		author: data.author,
		category: data.category,
		tags,
		content,
		format,
	}
	postCache.set(slug, post)
	return post
}

export function getAllBlogPosts(): BlogPost[] {
	const slugs = getBlogSlugs()
	const posts = slugs
		.map((slug) => getBlogPostBySlug(slug))
		.filter((post): post is BlogPost => post !== null)

	// Sort by date, newest first
	return posts.sort(
		(a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
	)
}
