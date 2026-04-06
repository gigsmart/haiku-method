"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type MiniSearch from "minisearch"
import type { SearchDocument } from "@/lib/browse/search"
import { extractSnippet, highlightMatches } from "@/lib/browse/search"

interface SearchResult {
	id: string
	type: "intent" | "unit" | "knowledge" | "asset"
	title: string
	slug: string
	stage?: string
	studio?: string
	status?: string
	path?: string
	score: number
	snippet: string
}

export interface SearchSelection {
	type: "intent" | "unit" | "knowledge" | "asset"
	slug: string
	stage?: string
	unitName?: string
	path?: string
}

interface Props {
	index: MiniSearch<SearchDocument> | null
	onSelect: (selection: SearchSelection) => void
	query: string
	onQueryChange: (query: string) => void
}

function titleCase(s: string): string {
	return s
		.split("-")
		.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
		.join(" ")
}

const typeBadgeColors: Record<string, string> = {
	intent: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400",
	unit: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
	knowledge: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
	asset: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
}

export function SearchBar({ index, onSelect, query, onQueryChange }: Props) {
	const [results, setResults] = useState<SearchResult[]>([])
	const [isOpen, setIsOpen] = useState(false)
	const [activeIndex, setActiveIndex] = useState(-1)
	const inputRef = useRef<HTMLInputElement>(null)
	const dropdownRef = useRef<HTMLDivElement>(null)
	const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

	const performSearch = useCallback(
		(q: string) => {
			if (!index || !q.trim()) {
				setResults([])
				return
			}
			const raw = index.search(q).slice(0, 20)
			const mapped: SearchResult[] = raw.map((r) => ({
				id: r.id,
				type: r.type as SearchResult["type"],
				title: r.title as string,
				slug: r.slug as string,
				stage: r.stage as string | undefined,
				studio: r.studio as string | undefined,
				status: r.status as string | undefined,
				path: r.path as string | undefined,
				score: r.score,
				snippet: extractSnippet((r.content as string) || "", q),
			}))
			setResults(mapped)
		},
		[index],
	)

	const handleInputChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const value = e.target.value
			onQueryChange(value)
			setIsOpen(true)
			setActiveIndex(-1)
			if (debounceRef.current) clearTimeout(debounceRef.current)
			debounceRef.current = setTimeout(() => performSearch(value), 150)
		},
		[onQueryChange, performSearch],
	)

	// Re-search when index changes (new documents added) and there's an active query
	useEffect(() => {
		if (query.trim() && index) {
			performSearch(query)
		}
	}, [index, query, performSearch])

	const handleSelect = useCallback(
		(result: SearchResult) => {
			const selection: SearchSelection = {
				type: result.type,
				slug: result.slug,
			}
			if (result.type === "unit" && result.stage) {
				selection.stage = result.stage
				selection.unitName = result.title
			}
			if (result.type === "knowledge") {
				selection.stage = result.stage
			}
			if (result.type === "asset" && result.path) {
				selection.path = result.path
			}
			onSelect(selection)
			setIsOpen(false)
			onQueryChange("")
			setResults([])
			inputRef.current?.blur()
		},
		[onSelect, onQueryChange],
	)

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			if (e.key === "Escape") {
				setIsOpen(false)
				inputRef.current?.blur()
				return
			}
			if (e.key === "ArrowDown") {
				e.preventDefault()
				setActiveIndex((prev) => Math.min(prev + 1, results.length - 1))
				return
			}
			if (e.key === "ArrowUp") {
				e.preventDefault()
				setActiveIndex((prev) => Math.max(prev - 1, -1))
				return
			}
			if (e.key === "Enter" && activeIndex >= 0 && activeIndex < results.length) {
				e.preventDefault()
				handleSelect(results[activeIndex])
			}
		},
		[results, activeIndex, handleSelect],
	)

	// Close dropdown when clicking outside
	useEffect(() => {
		const handleClickOutside = (e: MouseEvent) => {
			if (
				dropdownRef.current &&
				!dropdownRef.current.contains(e.target as Node) &&
				inputRef.current &&
				!inputRef.current.contains(e.target as Node)
			) {
				setIsOpen(false)
			}
		}
		document.addEventListener("mousedown", handleClickOutside)
		return () => document.removeEventListener("mousedown", handleClickOutside)
	}, [])

	// Scroll active item into view
	useEffect(() => {
		if (activeIndex >= 0 && dropdownRef.current) {
			const items = dropdownRef.current.querySelectorAll("[data-search-item]")
			items[activeIndex]?.scrollIntoView({ block: "nearest" })
		}
	}, [activeIndex])

	// Group results by type
	const grouped = new Map<string, SearchResult[]>()
	for (const r of results) {
		const group = grouped.get(r.type) || []
		group.push(r)
		grouped.set(r.type, group)
	}
	const typeOrder: SearchResult["type"][] = ["intent", "unit", "knowledge", "asset"]
	const orderedGroups = typeOrder
		.filter((t) => grouped.has(t))
		.map((t) => ({ type: t, items: grouped.get(t)! }))

	// Compute flat index for keyboard navigation
	let flatIndex = 0
	const flatMap = new Map<number, SearchResult>()
	for (const group of orderedGroups) {
		for (const item of group.items) {
			flatMap.set(flatIndex, item)
			flatIndex++
		}
	}

	const typeLabels: Record<string, string> = {
		intent: "Intents",
		unit: "Units",
		knowledge: "Knowledge",
		asset: "Assets",
	}

	return (
		<div className="relative w-full sm:w-72">
			{/* Search Input */}
			<div className="relative">
				<svg
					className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400"
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
				<input
					ref={inputRef}
					type="text"
					value={query}
					onChange={handleInputChange}
					onKeyDown={handleKeyDown}
					onFocus={() => {
						if (query.trim() && results.length > 0) setIsOpen(true)
					}}
					placeholder="Search intents, units, knowledge..."
					className="w-full rounded-lg border border-stone-200 bg-white py-1.5 pl-9 pr-3 text-sm placeholder:text-stone-400 focus:border-teal-500 focus:outline-none dark:border-stone-700 dark:bg-stone-900 dark:placeholder:text-stone-600"
					aria-label="Search"
					aria-expanded={isOpen && results.length > 0}
					aria-haspopup="listbox"
					role="combobox"
					aria-autocomplete="list"
				/>
				{query && (
					<button
						onClick={() => {
							onQueryChange("")
							setResults([])
							setIsOpen(false)
							inputRef.current?.focus()
						}}
						className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-stone-400 hover:text-stone-600 dark:hover:text-stone-300"
						aria-label="Clear search"
					>
						<svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
						</svg>
					</button>
				)}
			</div>

			{/* Results Dropdown */}
			{isOpen && query.trim() && (
				<div
					ref={dropdownRef}
					className="absolute left-0 right-0 z-50 mt-1 max-h-80 overflow-y-auto rounded-lg border border-stone-200 bg-white shadow-lg dark:border-stone-700 dark:bg-stone-900"
					role="listbox"
				>
					{results.length === 0 ? (
						<div className="px-4 py-6 text-center text-sm text-stone-500">
							No results for &ldquo;{query}&rdquo;
						</div>
					) : (
						(() => {
							let itemIdx = 0
							return orderedGroups.map((group) => (
								<div key={group.type}>
									<div className="sticky top-0 border-b border-stone-100 bg-stone-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-stone-400 dark:border-stone-800 dark:bg-stone-800/50">
										{typeLabels[group.type]}
									</div>
									{group.items.map((result) => {
										const idx = itemIdx++
										return (
											<button
												key={result.id}
												data-search-item
												onClick={() => handleSelect(result)}
												onMouseEnter={() => setActiveIndex(idx)}
												className={`flex w-full items-start gap-3 px-3 py-2 text-left transition ${
													idx === activeIndex
														? "bg-teal-50 dark:bg-teal-950"
														: "hover:bg-stone-50 dark:hover:bg-stone-800"
												}`}
												role="option"
												aria-selected={idx === activeIndex}
											>
												<span
													className={`mt-0.5 flex-shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${typeBadgeColors[result.type]}`}
												>
													{result.type}
												</span>
												<div className="min-w-0 flex-1">
													<div className="truncate text-sm font-medium text-stone-900 dark:text-stone-100">
														{highlightMatches(
															result.type === "unit"
																? titleCase(result.title)
																: result.title,
															query,
														).map((part, i) =>
															part.highlighted ? (
																<mark
																	key={i}
																	className="bg-teal-100 text-teal-900 dark:bg-teal-900/50 dark:text-teal-300"
																>
																	{part.text}
																</mark>
															) : (
																<span key={i}>{part.text}</span>
															),
														)}
													</div>
													{(result.stage || result.studio || result.path) && (
														<div className="mt-0.5 flex items-center gap-2 text-xs text-stone-400">
															{result.studio && (
																<span>{titleCase(result.studio)}</span>
															)}
															{result.stage && (
																<span>{titleCase(result.stage)}</span>
															)}
															{result.path && (
																<span className="truncate font-mono">
																	{result.path}
																</span>
															)}
														</div>
													)}
													{result.snippet && (
														<div className="mt-0.5 truncate text-xs text-stone-500 dark:text-stone-400">
															{highlightMatches(result.snippet, query).map(
																(part, i) =>
																	part.highlighted ? (
																		<mark
																			key={i}
																			className="bg-teal-100/50 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400"
																		>
																			{part.text}
																		</mark>
																	) : (
																		<span key={i}>{part.text}</span>
																	),
															)}
														</div>
													)}
												</div>
											</button>
										)
									})}
								</div>
							))
						})()
					)}
				</div>
			)}
		</div>
	)
}
