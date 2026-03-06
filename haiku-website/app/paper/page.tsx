import type { Metadata } from "next"
import fs from "fs"
import path from "path"
import { PaperContent } from "./PaperContent"

export const metadata: Metadata = {
	title: "Full Paper",
	description:
		"HAIKU: Human AI Knowledge Unification --- the complete methodology paper.",
}

export default function PaperPage() {
	const paperPath = path.join(process.cwd(), "..", "paper", "haiku-method.md")
	let content = ""

	try {
		const raw = fs.readFileSync(paperPath, "utf-8")
		// Strip frontmatter
		const fmMatch = raw.match(/^---\n[\s\S]*?\n---\n/)
		content = fmMatch ? raw.slice(fmMatch[0].length) : raw
	} catch {
		content = "Paper content not found."
	}

	return (
		<div className="mx-auto max-w-3xl px-4 py-12">
			<div className="mb-8">
				<h1 className="mb-2 text-4xl font-bold">
					HAIKU: Human AI Knowledge Unification
				</h1>
				<p className="text-lg text-stone-500">
					A Universal Framework for Structured Human-AI Collaboration
				</p>
				<p className="mt-2 text-sm text-stone-400">
					The Bushido Collective &middot; 2026
				</p>
			</div>
			<PaperContent content={content} />
		</div>
	)
}
