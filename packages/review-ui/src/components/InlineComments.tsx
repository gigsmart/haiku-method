import { useEffect, useRef, useState } from "react"

export interface InlineComment {
	selectedText: string
	comment: string
	paragraph: number
	/** File or section this comment is in — set by parent component */
	location?: string
	/** Unique identifier for this comment */
	id: string
}

export interface InlineCommentEntry extends InlineComment {
	highlightEl: HTMLElement | null
}

interface Props {
	htmlContent: string
	/** Location context passed to each comment (e.g., "knowledge/DISCOVERY.md" or "Unit 01: Login Screen") */
	location?: string
	/** Called whenever the comments list changes, so the parent can track them */
	onCommentsChange?: (comments: InlineCommentEntry[]) => void
}

let _commentIdCounter = 0
function nextCommentId(): string {
	return `ic-${++_commentIdCounter}-${Date.now()}`
}

export function InlineComments({
	htmlContent,
	location,
	onCommentsChange,
}: Props) {
	const contentRef = useRef<HTMLDivElement>(null)
	const popoverRef = useRef<HTMLDivElement>(null)
	const containerRef = useRef<HTMLDivElement>(null)
	const tooltipRef = useRef<HTMLDivElement>(null)
	const [comments, setComments] = useState<InlineCommentEntry[]>([])
	const [popoverPos, setPopoverPos] = useState<{ x: number; y: number } | null>(
		null,
	)
	const [popoverMode, setPopoverMode] = useState<"button" | "editing">("button")
	const [popoverText, setPopoverText] = useState("")
	const popoverTextareaRef = useRef<HTMLTextAreaElement>(null)
	const pendingSelectionRef = useRef<{
		text: string
		range: Range
		paragraph: number
	} | null>(null)
	const [tooltipState, setTooltipState] = useState<{
		x: number
		y: number
		comment: string
		selectedText: string
	} | null>(null)

	// Keep ref in sync for tooltip event handlers
	const commentsRef = useRef<InlineCommentEntry[]>([])
	commentsRef.current = comments

	function getParagraphIndex(node: Node): number {
		const el = node.nodeType === 3 ? node.parentElement : (node as HTMLElement)
		if (!el || !contentRef.current) return 0
		let block: HTMLElement | null = el
		while (block && block.parentElement !== contentRef.current) {
			block = block.parentElement
		}
		if (!block) return 0
		return Array.from(contentRef.current.children).indexOf(block)
	}

	function handleMouseUp() {
		setTimeout(() => {
			const sel = window.getSelection()
			if (!sel || sel.isCollapsed || !sel.rangeCount) {
				setPopoverPos(null)
				return
			}

			const range = sel.getRangeAt(0)
			if (!contentRef.current?.contains(range.commonAncestorContainer)) {
				setPopoverPos(null)
				return
			}

			const text = sel.toString().trim()
			if (!text) {
				setPopoverPos(null)
				return
			}

			pendingSelectionRef.current = {
				text,
				range: range.cloneRange(),
				paragraph: getParagraphIndex(range.startContainer),
			}

			const rect = range.getBoundingClientRect()
			const containerRect = containerRef.current?.getBoundingClientRect()
			if (containerRect) {
				setPopoverPos({
					x: rect.left + rect.width / 2 - containerRect.left - 40,
					y: rect.top - containerRect.top - 40,
				})
			}
		}, 10)
	}

	function handleShowCommentInput() {
		setPopoverMode("editing")
		setPopoverText("")
		// Focus textarea after render
		setTimeout(() => popoverTextareaRef.current?.focus(), 0)
	}

	function handleSaveComment() {
		const selData = pendingSelectionRef.current
		if (!selData) return

		const id = nextCommentId()
		const commentText = popoverText.trim()

		// Wrap selection in highlight span
		let highlightEl: HTMLElement | null = document.createElement("span")
		highlightEl.className = "inline-highlight"
		highlightEl.setAttribute("role", "mark")
		highlightEl.setAttribute("data-comment-id", id)
		highlightEl.setAttribute(
			"aria-label",
			`Commented text: ${commentText || "(no comment)"}`,
		)

		try {
			selData.range.surroundContents(highlightEl)
		} catch {
			try {
				const fragment = selData.range.extractContents()
				highlightEl.appendChild(fragment)
				selData.range.insertNode(highlightEl)
			} catch {
				highlightEl = null
			}
		}

		const entry: InlineCommentEntry = {
			selectedText: selData.text,
			comment: commentText,
			paragraph: selData.paragraph,
			location,
			id,
			highlightEl,
		}

		setComments((prev) => {
			const next = [...prev, entry]
			onCommentsChange?.(next)
			return next
		})
		setPopoverPos(null)
		setPopoverMode("button")
		setPopoverText("")
		pendingSelectionRef.current = null
	}

	function handleCancelComment() {
		setPopoverPos(null)
		setPopoverMode("button")
		setPopoverText("")
		pendingSelectionRef.current = null
	}

	// Close popover on outside clicks
	useEffect(() => {
		function handleDown(e: MouseEvent) {
			if (
				popoverRef.current &&
				!popoverRef.current.contains(e.target as Node) &&
				contentRef.current &&
				!contentRef.current.contains(e.target as Node)
			) {
				setPopoverPos(null)
				setPopoverMode("button")
				setPopoverText("")
			}
		}
		document.addEventListener("mousedown", handleDown)
		return () => document.removeEventListener("mousedown", handleDown)
	}, [])

	// Tooltip on hover for highlighted text
	useEffect(() => {
		const container = contentRef.current
		if (!container) return

		function handleMouseEnter(e: Event) {
			const target = e.target as HTMLElement
			if (!target.classList.contains("inline-highlight")) return
			const commentId = target.getAttribute("data-comment-id")
			if (!commentId) return
			const comment = commentsRef.current.find((c) => c.id === commentId)
			if (!comment || !comment.comment) return

			const rect = target.getBoundingClientRect()
			const containerRect = containerRef.current?.getBoundingClientRect()
			if (containerRect) {
				setTooltipState({
					x: rect.left + rect.width / 2 - containerRect.left,
					y: rect.top - containerRect.top - 8,
					comment: comment.comment,
					selectedText: comment.selectedText,
				})
			}
		}

		function handleMouseLeave(e: Event) {
			const target = e.target as HTMLElement
			if (target.classList.contains("inline-highlight")) {
				setTooltipState(null)
			}
		}

		container.addEventListener("mouseenter", handleMouseEnter, true)
		container.addEventListener("mouseleave", handleMouseLeave, true)
		return () => {
			container.removeEventListener("mouseenter", handleMouseEnter, true)
			container.removeEventListener("mouseleave", handleMouseLeave, true)
		}
	}, [])

	return (
		<div ref={containerRef} className="relative">
			{/* Content area */}
			<div
				ref={contentRef}
				className="prose prose-sm prose-stone dark:prose-invert max-w-none
          prose-code:bg-stone-100 prose-code:dark:bg-stone-800 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-sm
          prose-pre:bg-stone-100 prose-pre:dark:bg-stone-800 prose-pre:rounded-lg
          prose-table:border-collapse prose-th:border prose-th:border-stone-300 prose-th:dark:border-stone-600 prose-th:px-3 prose-th:py-1.5
          prose-td:border prose-td:border-stone-300 prose-td:dark:border-stone-600 prose-td:px-3 prose-td:py-1.5
          selection:bg-amber-200 dark:selection:bg-amber-700/50"
				onMouseUp={handleMouseUp}
				// biome-ignore lint/security/noDangerouslySetInnerHtml: htmlContent is produced upstream by a trusted remark->html pipeline for markdown rendering; consumers pass controlled content
				dangerouslySetInnerHTML={{ __html: htmlContent }}
			/>

			{/* Floating "Add Comment" popover on text selection */}
			{popoverPos && (
				<div
					ref={popoverRef}
					className="absolute z-50 bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-600 rounded-lg shadow-lg"
					style={{ left: popoverPos.x, top: popoverPos.y }}
				>
					{popoverMode === "button" ? (
						<button
							type="button"
							className="px-3 py-1.5 cursor-pointer hover:bg-stone-50 dark:hover:bg-stone-700 transition-colors rounded-lg"
							aria-label="Add comment on selected text"
							onClick={handleShowCommentInput}
						>
							<span className="text-sm font-medium text-teal-600 dark:text-teal-400">
								+ Comment
							</span>
						</button>
					) : (
						<div className="p-3 w-64">
							<textarea
								ref={popoverTextareaRef}
								className="w-full min-h-[60px] p-2 border border-stone-300 dark:border-stone-600 rounded-md bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 resize-y"
								placeholder="Add your comment..."
								value={popoverText}
								onChange={(e) => setPopoverText(e.target.value)}
								onKeyDown={(e) => {
									if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
										e.preventDefault()
										handleSaveComment()
									}
									if (e.key === "Escape") {
										e.preventDefault()
										handleCancelComment()
									}
								}}
							/>
							<div className="flex justify-end gap-2 mt-2">
								<button
									type="button"
									onClick={handleCancelComment}
									className="px-3 py-1 text-xs font-medium text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-700 rounded-md transition-colors"
								>
									Cancel
								</button>
								<button
									type="button"
									onClick={handleSaveComment}
									className="px-3 py-1 text-xs font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-md transition-colors"
								>
									Save
								</button>
							</div>
						</div>
					)}
				</div>
			)}

			{/* Tooltip on hover over highlighted text */}
			{tooltipState && (
				<div
					ref={tooltipRef}
					className="absolute z-50 max-w-xs px-3 py-2 bg-stone-800 dark:bg-stone-200 text-white dark:text-stone-900 text-xs rounded-lg shadow-lg pointer-events-none"
					style={{
						left: tooltipState.x,
						top: tooltipState.y,
						transform: "translate(-50%, -100%)",
					}}
				>
					<p className="font-medium">{tooltipState.comment}</p>
					<div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-stone-800 dark:border-t-stone-200" />
				</div>
			)}
		</div>
	)
}

/** Get current inline comments for capture */
export function getInlineComments(comments: InlineComment[]): InlineComment[] {
	return comments.map((c) => ({
		selectedText: c.selectedText,
		comment: c.comment,
		paragraph: c.paragraph,
		id: c.id,
	}))
}

/** Scroll to a highlighted comment in the DOM */
export function scrollToInlineComment(id: string) {
	const el = document.querySelector(`[data-comment-id="${id}"]`)
	if (el) {
		el.scrollIntoView({ behavior: "smooth", block: "center" })
		el.classList.add("active")
		setTimeout(() => el.classList.remove("active"), 2000)
	}
}
