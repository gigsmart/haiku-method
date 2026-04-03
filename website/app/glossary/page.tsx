import {
	extractGlossaryTerms,
	getGlossaryIndex,
	groupTermsByLetter,
} from "@/lib/glossary"
import type { Metadata } from "next"
import { GlossaryContent } from "./GlossaryContent"

export const metadata: Metadata = {
	title: "Glossary",
	description:
		"Complete glossary of AI-DLC terminology - Intent, Pass, Unit, Bolt, HITL, OHOTL, AHOTL, Backpressure, and more.",
	openGraph: {
		title: "AI-DLC Glossary",
		description:
			"Quick reference for all AI-DLC methodology terms and concepts.",
	},
}

export default function GlossaryPage() {
	const terms = extractGlossaryTerms()
	const index = getGlossaryIndex(terms)
	const groupedTerms = groupTermsByLetter(terms)

	return (
		<div className="mx-auto max-w-4xl px-4 py-8">
			{/* Header */}
			<div className="mb-8">
				<h1 className="text-3xl font-bold text-gray-900 dark:text-white md:text-4xl">
					AI-DLC Glossary
				</h1>
				<p className="mt-2 text-lg text-gray-600 dark:text-gray-400">
					Quick reference for all AI-DLC terminology and concepts.
				</p>
			</div>

			{/* Pass data to client component */}
			<GlossaryContent
				terms={terms}
				index={index}
				groupedTerms={groupedTerms}
			/>
		</div>
	)
}
