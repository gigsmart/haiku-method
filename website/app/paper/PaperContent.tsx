"use client"

import type { PaperHeading } from "@/lib/papers"
import { diffLines, diffWords } from "diff"
import Link from "next/link"
import { useCallback, useEffect, useRef, useState } from "react"
import type { Components } from "react-markdown"
import ReactMarkdown from "react-markdown"
import rehypeHighlight from "rehype-highlight"
import rehypeRaw from "rehype-raw"
import rehypeSlug from "rehype-slug"
import remarkGfm from "remark-gfm"
import { Mermaid } from "../components/Mermaid"
import { usePaperChanges } from "../components/PaperChangesContext"

interface SectionChange {
	section: string
	originalSection?: string
	isNew: boolean
	isRemoved?: boolean
	renamedFrom?: string
	linesAdded: number
	linesRemoved: number
}

interface PaperContentProps {
	content: string
	toc: PaperHeading[]
	initialSectionChanges?: SectionChange[]
}

/**
 * Copy to clipboard button for code blocks
 */
function CopyButton({ code }: { code: string }) {
	const [copied, setCopied] = useState(false)

	const handleCopy = async () => {
		await navigator.clipboard.writeText(code)
		setCopied(true)
		setTimeout(() => setCopied(false), 2000)
	}

	return (
		<button
			type="button"
			onClick={handleCopy}
			className="rounded bg-gray-700 px-2 py-0.5 text-xs text-gray-400 transition-colors hover:bg-gray-600 hover:text-white"
			aria-label="Copy code to clipboard"
		>
			{copied ? "Copied!" : "Copy"}
		</button>
	)
}

/**
 * Extract text content from code block children
 */
function extractCodeText(children: React.ReactNode): string {
	if (typeof children === "string") return children
	if (Array.isArray(children)) {
		return children.map(extractCodeText).join("")
	}
	if (children && typeof children === "object" && "props" in children) {
		return extractCodeText(
			(children as React.ReactElement<{ children?: React.ReactNode }>).props
				.children,
		)
	}
	return ""
}

function normalizeSection(name: string): string {
	return name
		.toLowerCase()
		.replace(/[^\p{L}\p{N}\s]/gu, "")
		.trim()
}

function getSectionBadge(
	headingText: string,
	sectionChanges: SectionChange[],
): "new" | "updated" | null {
	const normalized = normalizeSection(headingText)

	for (const change of sectionChanges) {
		const normalizedSection = normalizeSection(change.section)
		if (
			normalized === normalizedSection ||
			normalizedSection.includes(normalized) ||
			normalized.includes(normalizedSection)
		) {
			return change.isNew ? "new" : "updated"
		}
	}
	return null
}

function SectionBadge({ type }: { type: "new" | "updated" }) {
	return (
		<span
			className={`rounded-full px-2 py-0.5 text-xs font-bold uppercase ${
				type === "new"
					? "bg-green-500 text-white"
					: "bg-yellow-400 text-yellow-900"
			}`}
		>
			{type}
		</span>
	)
}

interface MermaidBlock {
	content: string
	placeholder: string
}

interface ExtractedContent {
	text: string
	mermaidBlocks: MermaidBlock[]
}

/**
 * Extract mermaid code blocks and replace with placeholders
 */
function extractMermaidBlocks(content: string): ExtractedContent {
	const mermaidRegex = /```mermaid\n([\s\S]*?)```/g
	const blocks: MermaidBlock[] = []
	let index = 0

	const text = content.replace(mermaidRegex, (_, mermaidContent) => {
		const placeholder = `MERMAID_PLACEHOLDER_${index}`
		blocks.push({ content: mermaidContent.trim(), placeholder })
		index++
		return `\n\n<div data-mermaid-index="${index - 1}"></div>\n\n`
	})

	return { text, mermaidBlocks: blocks }
}

interface MermaidDiff {
	type: "unchanged" | "added" | "removed" | "modified"
	current?: string
	previous?: string
}

/**
 * Compare mermaid blocks between versions
 */
function compareMermaidBlocks(
	currentBlocks: MermaidBlock[],
	previousBlocks: MermaidBlock[],
): Map<number, MermaidDiff> {
	const diffs = new Map<number, MermaidDiff>()
	const maxLen = Math.max(currentBlocks.length, previousBlocks.length)

	for (let i = 0; i < maxLen; i++) {
		const current = currentBlocks[i]
		const previous = previousBlocks[i]

		if (current && previous) {
			if (current.content === previous.content) {
				diffs.set(i, { type: "unchanged", current: current.content })
			} else {
				diffs.set(i, {
					type: "modified",
					current: current.content,
					previous: previous.content,
				})
			}
		} else if (current && !previous) {
			diffs.set(i, { type: "added", current: current.content })
		} else if (!current && previous) {
			diffs.set(i, { type: "removed", previous: previous.content })
		}
	}

	return diffs
}

/**
 * Check if content should use block diff (code blocks, tables)
 */
function shouldUseBlockDiff(content: string): boolean {
	const trimmed = content.trim()
	if (trimmed.startsWith("```") || trimmed.startsWith("    ")) {
		return true
	}
	if (trimmed.includes("|") && trimmed.includes("---")) {
		return true
	}
	if (/^\s*\|/.test(trimmed)) {
		return true
	}
	return false
}

/**
 * Escape HTML special characters in text for inline diffs
 */
function escapeHtml(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
}

/**
 * Apply word-level diff within a block, preserving markdown structure
 */
function wordDiffBlock(oldText: string, newText: string): string {
	const words = diffWords(oldText, newText)
	let result = ""

	for (const part of words) {
		if (part.added) {
			result += `<ins class="diff-added">${escapeHtml(part.value)}</ins>`
		} else if (part.removed) {
			result += `<del class="diff-removed">${escapeHtml(part.value)}</del>`
		} else {
			result += part.value
		}
	}

	return result
}

/**
 * Build markdown content with hybrid diff strategy
 */
function buildDiffMarkdown(
	currentContent: string,
	previousContent: string,
): { markdown: string; mermaidDiffs: Map<number, MermaidDiff> } {
	const currentExtracted = extractMermaidBlocks(currentContent)
	const previousExtracted = extractMermaidBlocks(previousContent)

	const mermaidDiffs = compareMermaidBlocks(
		currentExtracted.mermaidBlocks,
		previousExtracted.mermaidBlocks,
	)

	const lineDiff = diffLines(previousExtracted.text, currentExtracted.text)
	let result = ""
	let i = 0

	while (i < lineDiff.length) {
		const part = lineDiff[i]

		if (!part.value) {
			i++
			continue
		}

		const hasMermaidPlaceholder = part.value.includes("data-mermaid-index=")

		if (!part.added && !part.removed) {
			result += part.value
			i++
		} else if (part.removed && lineDiff[i + 1]?.added) {
			const removed = part.value
			const added = lineDiff[i + 1].value

			if (shouldUseBlockDiff(removed) || shouldUseBlockDiff(added)) {
				result += `<div class="diff-removed-block">\n\n${removed}\n</div>\n\n`
				result += `<div class="diff-added-block">\n\n${added}\n</div>\n\n`
			} else if (
				hasMermaidPlaceholder ||
				added.includes("data-mermaid-index=")
			) {
				result += added
			} else {
				result += wordDiffBlock(removed, added)
			}
			i += 2
		} else if (part.added) {
			if (hasMermaidPlaceholder) {
				result += part.value
			} else if (shouldUseBlockDiff(part.value)) {
				result += `<div class="diff-added-block">\n\n${part.value}\n</div>\n\n`
			} else {
				result += `<div class="diff-added-block">\n\n${part.value}\n</div>\n\n`
			}
			i++
		} else if (part.removed) {
			if (hasMermaidPlaceholder) {
				i++
				continue
			}
			if (shouldUseBlockDiff(part.value)) {
				result += `<div class="diff-removed-block">\n\n${part.value}\n</div>\n\n`
			} else {
				result += `<div class="diff-removed-block">\n\n${part.value}\n</div>\n\n`
			}
			i++
		} else {
			i++
		}
	}

	return { markdown: result, mermaidDiffs }
}

/**
 * Component to render a mermaid diagram with diff status
 */
function MermaidDiffBlock({ diff }: { diff: MermaidDiff }) {
	if (diff.type === "unchanged" && diff.current) {
		return <Mermaid chart={diff.current} />
	}

	if (diff.type === "added" && diff.current) {
		return (
			<div className="my-4 rounded-r border-l-4 border-green-500 bg-green-50 p-4 pl-4 dark:bg-green-900/20">
				<div className="mb-2 text-xs font-medium text-green-600 dark:text-green-400">
					New Diagram
				</div>
				<Mermaid chart={diff.current} />
			</div>
		)
	}

	if (diff.type === "removed" && diff.previous) {
		return (
			<div className="my-4 rounded-r border-l-4 border-red-500 bg-red-50 p-4 pl-4 opacity-60 dark:bg-red-900/20">
				<div className="mb-2 text-xs font-medium text-red-600 dark:text-red-400">
					Removed Diagram
				</div>
				<Mermaid chart={diff.previous} />
			</div>
		)
	}

	if (diff.type === "modified" && diff.current && diff.previous) {
		return (
			<div className="my-4 space-y-4">
				<div className="rounded-r border-l-4 border-red-500 bg-red-50 p-4 pl-4 opacity-60 dark:bg-red-900/20">
					<div className="mb-2 text-xs font-medium text-red-600 dark:text-red-400">
						Previous Diagram
					</div>
					<Mermaid chart={diff.previous} />
				</div>
				<div className="rounded-r border-l-4 border-green-500 bg-green-50 p-4 pl-4 dark:bg-green-900/20">
					<div className="mb-2 text-xs font-medium text-green-600 dark:text-green-400">
						Updated Diagram
					</div>
					<Mermaid chart={diff.current} />
				</div>
			</div>
		)
	}

	return null
}

function TOCItem({
	heading,
	activeId,
	depth = 0,
}: {
	heading: PaperHeading
	activeId: string
	depth?: number
}) {
	const isActive = activeId === heading.id
	const paddingLeft = depth * 12

	const handleClick = (e: React.MouseEvent) => {
		e.preventDefault()
		const el = document.getElementById(heading.id)
		if (el) {
			// Temporarily disable smooth scroll to prevent interference
			const html = document.documentElement
			const prevBehavior = html.style.scrollBehavior
			html.style.scrollBehavior = "auto"

			el.scrollIntoView({ block: "start" })

			// Update URL hash without triggering scroll
			window.history.pushState(null, "", `#${heading.id}`)

			// Restore smooth scroll after a tick
			requestAnimationFrame(() => {
				html.style.scrollBehavior = prevBehavior
			})
		}
	}

	return (
		<li>
			<button
				type="button"
				onClick={handleClick}
				className={`block w-full truncate py-1 text-left text-sm ${
					isActive
						? "font-medium text-blue-600 dark:text-blue-400"
						: "text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
				}`}
				style={{ paddingLeft: `${paddingLeft}px` }}
			>
				{heading.text}
			</button>
			{heading.children.length > 0 && (
				<ul>
					{heading.children.map((child) => (
						<TOCItem
							key={child.id}
							heading={child}
							activeId={activeId}
							depth={depth + 1}
						/>
					))}
				</ul>
			)}
		</li>
	)
}

export function PaperContent({
	content,
	toc,
	initialSectionChanges = [],
}: PaperContentProps) {
	const [activeId, setActiveId] = useState<string>("")

	const {
		sectionChanges,
		showChanges,
		compareContent,
		compareVersion,
		isLoadingCompare,
	} = usePaperChanges()

	// Use context sectionChanges if available, otherwise fall back to initial
	const changes =
		sectionChanges.length > 0 ? sectionChanges : initialSectionChanges

	// Flatten TOC for scroll spy
	const flattenTOC = useCallback((headings: PaperHeading[]): string[] => {
		const result: string[] = []
		for (const heading of headings) {
			result.push(heading.id)
			result.push(...flattenTOC(heading.children))
		}
		return result
	}, [])

	// Use a ref to track active ID without causing re-renders during observation
	const activeIdRef = useRef<string>("")

	useEffect(() => {
		const headingIds = flattenTOC(toc)
		const headingElements: HTMLElement[] = []

		// Collect all heading elements
		for (const id of headingIds) {
			const el = document.getElementById(id)
			if (el) headingElements.push(el)
		}

		if (headingElements.length === 0) return

		// Set initial active heading based on URL hash
		if (window.location.hash) {
			const hashId = window.location.hash.slice(1)
			activeIdRef.current = hashId
			setActiveId(hashId)
		}

		// Use IntersectionObserver for stable detection
		const observer = new IntersectionObserver(
			(entries) => {
				// Find entries that are entering the viewport from the top
				for (const entry of entries) {
					if (entry.isIntersecting) {
						const id = entry.target.id
						if (id && id !== activeIdRef.current) {
							activeIdRef.current = id
							setActiveId(id)
						}
						break // Only track the first intersecting heading
					}
				}
			},
			{
				// Trigger when heading crosses a line 100px from the top
				rootMargin: "-100px 0px -80% 0px",
				threshold: 0,
			},
		)

		for (const el of headingElements) {
			observer.observe(el)
		}

		return () => {
			observer.disconnect()
		}
	}, [toc, flattenTOC])

	// Create heading components that add badges (only when showChanges is true)
	const createHeading = (level: 2 | 3 | 4) => {
		const HeadingComponent = ({
			children,
			...props
		}: React.HTMLAttributes<HTMLHeadingElement> & {
			children?: React.ReactNode
		}) => {
			const headingText =
				typeof children === "string"
					? children
					: Array.isArray(children)
						? children.filter((c) => typeof c === "string").join("")
						: ""

			const badge = showChanges ? getSectionBadge(headingText, changes) : null
			const Tag = `h${level}` as const

			// Use flex layout for proper badge alignment
			if (badge) {
				return (
					<Tag {...props} className="flex items-center gap-3">
						<span>{children}</span>
						<SectionBadge type={badge} />
					</Tag>
				)
			}

			return <Tag {...props}>{children}</Tag>
		}
		return HeadingComponent
	}

	const markdownComponents: Components = {
		h2: createHeading(2),
		h3: createHeading(3),
		h4: createHeading(4),
		pre(props) {
			const { children, ...rest } = props
			const child = children as
				| React.ReactElement<{ className?: string; children?: React.ReactNode }>
				| undefined
			const isMermaid =
				child?.props?.className?.includes("language-mermaid") ||
				child?.type === Mermaid

			if (isMermaid) {
				return <>{children}</>
			}

			// Extract language from className
			const className = child?.props?.className || ""
			const langMatch = /language-(\w+)/.exec(className)
			const language = langMatch ? langMatch[1] : ""

			// Extract code text for copy button
			const codeText = extractCodeText(child?.props?.children)

			return (
				<div className="group not-prose relative my-4 overflow-hidden rounded-lg border border-gray-700/50 shadow-xl">
					{/* Title bar */}
					<div className="flex items-center justify-between border-b border-gray-600/50 bg-[#1e293b] px-4 py-2 shadow-sm">
						<div className="flex items-center gap-2">
							{/* macOS-style dots */}
							<div className="flex gap-1.5">
								<span className="h-3 w-3 rounded-full bg-[#ff5f56] shadow-sm" />
								<span className="h-3 w-3 rounded-full bg-[#ffbd2e] shadow-sm" />
								<span className="h-3 w-3 rounded-full bg-[#27c93f] shadow-sm" />
							</div>
							{language && (
								<span className="ml-3 font-mono text-xs text-gray-400">
									{language}
								</span>
							)}
						</div>
						<CopyButton code={codeText} />
					</div>
					{/* Code content */}
					<pre
						{...rest}
						className="!m-0 overflow-x-auto !bg-[#0d1117] p-4 text-sm leading-relaxed"
						style={{ margin: 0, background: "#0d1117" }}
					>
						{children}
					</pre>
				</div>
			)
		},
		code(props) {
			const { children, className, ...rest } = props
			const match = /language-(\w+)/.exec(className || "")
			const language = match ? match[1] : ""

			if (language === "mermaid") {
				return <Mermaid chart={String(children).replace(/\n$/, "")} />
			}

			return (
				<code className={className} {...rest}>
					{children}
				</code>
			)
		},
		a: ({ href, children, ...props }) => {
			// Check if this is an internal link to the interactive tools
			if (
				href?.startsWith("/tools/") ||
				href?.startsWith("/big-picture/") ||
				href?.startsWith("/workflows/")
			) {
				return (
					<Link
						href={href}
						className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
						{...props}
					>
						{children}
						<svg
							className="h-3 w-3"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							aria-hidden="true"
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={2}
								d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
							/>
						</svg>
					</Link>
				)
			}
			return (
				<a href={href} {...props}>
					{children}
				</a>
			)
		},
		blockquote: ({ children, ...props }) => (
			<blockquote
				className="border-l-4 border-blue-500 bg-blue-50 pl-4 text-gray-700 dark:bg-blue-950/30 dark:text-gray-300"
				{...props}
			>
				{children}
			</blockquote>
		),
		table: ({ children, ...props }) => (
			<div className="overflow-x-auto">
				<table {...props}>{children}</table>
			</div>
		),
	}

	// Show loading state while fetching compare content
	if (isLoadingCompare) {
		return (
			<div className="flex gap-8">
				<aside className="hidden w-64 shrink-0 lg:block">
					<nav className="sticky top-24 max-h-[calc(100vh-8rem)] overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-900">
						<h2 className="mb-3 font-semibold text-gray-900 dark:text-white">
							Table of Contents
						</h2>
						<ul className="space-y-1">
							{toc.map((heading) => (
								<TOCItem key={heading.id} heading={heading} activeId={activeId} />
							))}
						</ul>
					</nav>
				</aside>
				<article className="prose prose-gray dark:prose-invert min-w-0 flex-1">
					<div className="animate-pulse space-y-4">
						<div className="h-6 w-3/4 rounded bg-gray-200 dark:bg-gray-700" />
						<div className="h-4 w-full rounded bg-gray-200 dark:bg-gray-700" />
						<div className="h-4 w-5/6 rounded bg-gray-200 dark:bg-gray-700" />
						<div className="h-4 w-full rounded bg-gray-200 dark:bg-gray-700" />
					</div>
				</article>
			</div>
		)
	}

	// Show inline word-level diff when comparing versions
	if (compareVersion && compareContent) {
		const { markdown: diffMarkdown, mermaidDiffs } = buildDiffMarkdown(
			content,
			compareContent,
		)

		// Create diff-specific components - no badges needed since diff shows changes
		const diffComponents: Components = {
			...markdownComponents,
			// Use default headings in diff mode (no badges)
			h2: ({ children, ...props }) => <h2 {...props}>{children}</h2>,
			h3: ({ children, ...props }) => <h3 {...props}>{children}</h3>,
			h4: ({ children, ...props }) => <h4 {...props}>{children}</h4>,
			// Override div to handle mermaid placeholders
			div(props) {
				const mermaidIndex = (props as { "data-mermaid-index"?: string })[
					"data-mermaid-index"
				]
				if (mermaidIndex !== undefined) {
					const index = Number.parseInt(mermaidIndex, 10)
					const diff = mermaidDiffs.get(index)
					if (diff) {
						return <MermaidDiffBlock diff={diff} />
					}
					return null
				}
				// Default div behavior
				return <div {...props} />
			},
		}

		return (
			<div className="flex gap-8">
				{/* TOC Sidebar - desktop only */}
				<aside className="hidden w-64 shrink-0 lg:block">
					<nav className="sticky top-24 max-h-[calc(100vh-8rem)] overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-900">
						<h2 className="mb-3 font-semibold text-gray-900 dark:text-white">
							Table of Contents
						</h2>
						<ul className="space-y-1">
							{toc.map((heading) => (
								<TOCItem key={heading.id} heading={heading} activeId={activeId} />
							))}
						</ul>
						<div className="mt-4 border-t border-gray-200 pt-4 dark:border-gray-700">
							<Link
								href="/glossary"
								className="text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
							>
								View Glossary
							</Link>
						</div>
					</nav>
				</aside>

				{/* Main content */}
				<div className="min-w-0 flex-1">
					<div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-900/20">
						<div className="flex items-center gap-4 text-sm">
							<span className="flex items-center gap-2">
								<ins className="diff-added no-underline">added text</ins>
							</span>
							<span className="flex items-center gap-2">
								<del className="diff-removed">removed text</del>
							</span>
						</div>
					</div>
					<article className="prose prose-lg dark:prose-invert prose-headings:scroll-mt-20 prose-a:text-blue-600 dark:prose-a:text-blue-400 max-w-none">
						<ReactMarkdown
							remarkPlugins={[remarkGfm]}
							rehypePlugins={[rehypeRaw, rehypeSlug, rehypeHighlight]}
							components={diffComponents}
						>
							{diffMarkdown}
						</ReactMarkdown>
					</article>
				</div>
			</div>
		)
	}

	// Normal markdown rendering
	return (
		<div className="flex gap-8">
			{/* TOC Sidebar - desktop only */}
			<aside className="hidden w-64 shrink-0 lg:block">
				<nav className="sticky top-24 max-h-[calc(100vh-8rem)] overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-900">
					<h2 className="mb-3 font-semibold text-gray-900 dark:text-white">
						Table of Contents
					</h2>
					<ul className="space-y-1">
						{toc.map((heading) => (
							<TOCItem key={heading.id} heading={heading} activeId={activeId} />
						))}
					</ul>
					<div className="mt-4 border-t border-gray-200 pt-4 dark:border-gray-700">
						<Link
							href="/glossary"
							className="text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
						>
							View Glossary
						</Link>
					</div>
				</nav>
			</aside>

			{/* Main content */}
			<article className="prose prose-gray dark:prose-invert prose-headings:scroll-mt-20 prose-a:text-blue-600 dark:prose-a:text-blue-400 min-w-0 flex-1">
				<ReactMarkdown
					remarkPlugins={[remarkGfm]}
					rehypePlugins={[rehypeRaw, rehypeSlug, rehypeHighlight]}
					components={markdownComponents}
				>
					{content}
				</ReactMarkdown>

				{/* See it in action callout */}
				<div className="mt-12 rounded-lg border border-blue-200 bg-blue-50 p-6 dark:border-blue-900 dark:bg-blue-950/30">
					<h3 className="mb-4 text-lg font-semibold text-blue-900 dark:text-blue-100">
						See AI-DLC in Action
					</h3>
					<p className="mb-4 text-blue-800 dark:text-blue-200">
						Explore the interactive tools to understand and apply the AI-DLC
						methodology:
					</p>
					<ul className="space-y-2">
						<li>
							<Link
								href="/big-picture"
								className="text-blue-700 underline hover:text-blue-900 dark:text-blue-300 dark:hover:text-blue-100"
							>
								Big Picture Diagram
							</Link>{" "}
							- Visual overview of all concepts and their relationships
						</li>
						<li>
							<Link
								href="/workflows"
								className="text-blue-700 underline hover:text-blue-900 dark:text-blue-300 dark:hover:text-blue-100"
							>
								Workflow Visualizer
							</Link>{" "}
							- Step through hat-based workflows interactively
						</li>
						<li>
							<Link
								href="/tools/mode-selector"
								className="text-blue-700 underline hover:text-blue-900 dark:text-blue-300 dark:hover:text-blue-100"
							>
								Mode Selector Tool
							</Link>{" "}
							- Find the right operating mode for your task
						</li>
						<li>
							<Link
								href="/glossary"
								className="text-blue-700 underline hover:text-blue-900 dark:text-blue-300 dark:hover:text-blue-100"
							>
								Glossary
							</Link>{" "}
							- Quick reference for all AI-DLC terminology
						</li>
					</ul>
				</div>
			</article>
		</div>
	)
}
