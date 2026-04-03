"use client"

import type { GlossaryTerm } from "@/lib/glossary"
import Link from "next/link"
import { useMemo, useState } from "react"

/**
 * Get paper section anchor for a glossary term
 * Maps terms to their relevant paper sections
 * (Inlined here to avoid importing server-side code)
 */
function getTermPaperAnchor(term: string): string | null {
	const termMappings: Record<string, string> = {
		Backpressure: "backpressure-over-prescription",
		Bolt: "bolt",
		"Completion Criteria": "completion-criteria",
		"Completion Promise": "autonomous-bolt-ahotl",
		"Context Budget": "context-is-abundant-use-it-wisely",
		HITL: "three-operating-modes-hitl-ohotl-and-ahotl",
		AHOTL: "three-operating-modes-hitl-ohotl-and-ahotl",
		OHOTL: "three-operating-modes-hitl-ohotl-and-ahotl",
		Integrator: "bolt",
		Intent: "intent",
		"Memory Provider": "memory-providers-expand-knowledge",
		"Mob Elaboration": "mob-elaboration-ritual",
		"Mob Construction": "mob-construction-ritual",
		"Quality Gate": "backpressure-over-prescription",
		"Ralph Wiggum Pattern": "implementing-autonomous-bolts",
		Unit: "unit",
		"Unit DAG": "unit",
	}

	return termMappings[term] || null
}

interface GlossaryContentProps {
	terms: GlossaryTerm[]
	index: string[]
	groupedTerms: Record<string, GlossaryTerm[]>
}

export function GlossaryContent({
	terms,
	index,
	groupedTerms,
}: GlossaryContentProps) {
	const [searchQuery, setSearchQuery] = useState("")

	// Filter terms based on search query
	const filteredTerms = useMemo(() => {
		if (!searchQuery.trim()) {
			return null // Return null to indicate no filtering
		}

		const lowerQuery = searchQuery.toLowerCase()
		return terms.filter(
			(term) =>
				term.term.toLowerCase().includes(lowerQuery) ||
				term.definition.toLowerCase().includes(lowerQuery),
		)
	}, [terms, searchQuery])

	// Group filtered terms by letter if searching
	const displayGroups = useMemo(() => {
		if (!filteredTerms) {
			return groupedTerms
		}

		const groups: Record<string, GlossaryTerm[]> = {}
		for (const term of filteredTerms) {
			const firstLetter = term.term[0].toUpperCase()
			if (!groups[firstLetter]) {
				groups[firstLetter] = []
			}
			groups[firstLetter].push(term)
		}
		return groups
	}, [filteredTerms, groupedTerms])

	const displayIndex = useMemo(() => {
		if (!filteredTerms) {
			return index
		}
		return Object.keys(displayGroups).sort()
	}, [filteredTerms, index, displayGroups])

	return (
		<>
			{/* Search */}
			<div className="mb-6">
				<div className="relative">
					<input
						type="text"
						placeholder="Search terms..."
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
						className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 pl-10 text-gray-900 transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
					/>
					<svg
						className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						aria-hidden="true"
					>
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth={2}
							d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
						/>
					</svg>
					{searchQuery && (
						<button
							type="button"
							onClick={() => setSearchQuery("")}
							className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
							aria-label="Clear search"
						>
							<svg
								className="h-5 w-5"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
								aria-hidden="true"
							>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={2}
									d="M6 18L18 6M6 6l12 12"
								/>
							</svg>
						</button>
					)}
				</div>
				{filteredTerms && (
					<p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
						{filteredTerms.length} term{filteredTerms.length !== 1 ? "s" : ""}{" "}
						found
					</p>
				)}
			</div>

			{/* Alphabetical index */}
			<nav className="mb-8 flex flex-wrap gap-2">
				{index.map((letter) => {
					const hasTerms = displayIndex.includes(letter)
					return (
						<a
							key={letter}
							href={hasTerms ? `#letter-${letter}` : undefined}
							className={`flex h-10 w-10 items-center justify-center rounded-lg text-sm font-medium transition ${
								hasTerms
									? "bg-gray-100 text-gray-900 hover:bg-gray-200 dark:bg-gray-800 dark:text-white dark:hover:bg-gray-700"
									: "cursor-default bg-gray-50 text-gray-300 dark:bg-gray-900 dark:text-gray-700"
							}`}
						>
							{letter}
						</a>
					)
				})}
			</nav>

			{/* Terms by letter */}
			{displayIndex.length === 0 ? (
				<p className="py-12 text-center text-gray-500 dark:text-gray-400">
					No terms found matching &quot;{searchQuery}&quot;
				</p>
			) : (
				<div className="space-y-8">
					{displayIndex.map((letter) => (
						<section key={letter} id={`letter-${letter}`}>
							<h2 className="sticky top-16 z-10 mb-4 border-b border-gray-200 bg-white pb-2 text-2xl font-bold text-gray-900 dark:border-gray-800 dark:bg-gray-950 dark:text-white">
								{letter}
							</h2>
							<dl className="space-y-4">
								{displayGroups[letter].map((term) => {
									const paperAnchor = getTermPaperAnchor(term.term)
									return (
										<div
											key={term.slug}
											id={term.slug}
											className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900"
										>
											<dt className="flex items-center justify-between">
												<span className="text-lg font-semibold text-gray-900 dark:text-white">
													{term.term}
												</span>
												{paperAnchor && (
													<Link
														href={`/paper/#${paperAnchor}`}
														className="text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
													>
														See in paper
													</Link>
												)}
											</dt>
											<dd className="mt-2 text-gray-600 dark:text-gray-400">
												{term.definition}
											</dd>
										</div>
									)
								})}
							</dl>
						</section>
					))}
				</div>
			)}

			{/* Back to paper link */}
			<div className="mt-12 border-t border-gray-200 pt-8 dark:border-gray-800">
				<Link
					href="/paper/"
					className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
				>
					<svg
						className="h-4 w-4"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						aria-hidden="true"
					>
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth={2}
							d="M10 19l-7-7m0 0l7-7m-7 7h18"
						/>
					</svg>
					Read the full AI-DLC paper
				</Link>
			</div>
		</>
	)
}
