import { useCallback, useEffect, useMemo, useRef, useState } from "react"

/** Same djb2-ish non-cryptographic hash used by useSeenTracker.ts.
 *  Collision risk here is "someone deliberately editing the file to
 *  hash-equal the old version"; in practice, any real change flips it. */
function hashContent(s: string): string {
	let h = 0
	for (let i = 0; i < s.length; i++) {
		h = (h << 5) - h + s.charCodeAt(i)
		h |= 0
	}
	return Math.abs(h).toString(16).padStart(6, "0")
}

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
	/** Kept for API compatibility with the legacy span-wrapping impl.
	 *  Always null in the Custom-Highlight-API impl — highlights live in
	 *  `CSS.highlights`, not the DOM. */
	highlightEl: HTMLElement | null
}

interface Props {
	htmlContent: string
	/** Raw (pre-render) markdown source. Used to compute a content
	 *  hash so persisted inline comments can detect drift when the file
	 *  has changed since the comment was written. Optional — without
	 *  it, every existingAnchor is treated as potentially stale. */
	rawContent?: string
	/** Human-readable label for the artifact (e.g. "Unit: Threat model and
	 *  security hardening"). Stored on the feedback item for display. */
	location?: string
	/** Full relative path to the source artifact file from the repo root
	 *  — e.g. `.haiku/intents/<slug>/stages/<stage>/units/unit-01-*.md`.
	 *  Stored on feedback so an agent can open the source file directly
	 *  and the sidebar can route correctly when the reviewer clicks
	 *  back into the artifact. */
	filePath?: string
	/** Called whenever the comments list changes, so the parent can track them */
	onCommentsChange?: (comments: InlineCommentEntry[]) => void
	/** When provided, Save persists the comment as a real feedback item
	 *  via the server (POST /api/feedback/:intent/:stage) in addition to
	 *  the in-memory comments list. */
	onSaveInline?: (entry: {
		selectedText: string
		comment: string
		paragraph: number
		location: string
		filePath?: string
		commentId: string
		contentSha?: string
	}) => Promise<void>
	/** Previously-persisted inline anchors for this file. InlineComments
	 *  re-locates each in the current DOM on mount and paints it; when
	 *  `content_sha` doesn't match the current hash (or the text isn't
	 *  found at all), the anchor is painted via the "stale" highlight
	 *  layer so reviewers see the drift. */
	existingAnchors?: Array<{
		commentId?: string
		selectedText: string
		paragraph?: number
		contentSha?: string
	}>
	/** An inline_anchor from a persisted feedback item that should be
	 *  scrolled to + flashed when this view mounts. */
	flashAnchor?: {
		commentId?: string
		selectedText: string
		paragraph?: number
	} | null
	onFlashCommentConsumed?: () => void
}

let _commentIdCounter = 0
function nextCommentId(): string {
	return `ic-${++_commentIdCounter}-${Date.now()}`
}

/**
 * InlineComments — select text in the rendered markdown, attach a
 * comment, jump back to it from the sidebar.
 *
 * Uses the **CSS Custom Highlight API** (`CSS.highlights` +
 * `::highlight(...)`) instead of wrapping selections in DOM spans.
 * Highlights are a visual overlay on live `Range` objects — they do
 * not mutate the DOM, so React re-renders and `innerHTML` rewrites
 * can't wipe them, and there's no conflict with the browser's native
 * text selection. Requires a modern Chromium / Safari 17.2+ / Firefox
 * 141+ (we're a Chrome-first surface — a no-Highlight-API fallback
 * would need adding for older Firefox).
 */
export function InlineComments({
	htmlContent,
	rawContent,
	location,
	filePath,
	onCommentsChange,
	onSaveInline,
	existingAnchors,
	flashAnchor,
	onFlashCommentConsumed,
}: Props) {
	const currentContentSha = useMemo(
		() => (rawContent ? hashContent(rawContent) : undefined),
		[rawContent],
	)
	const contentRef = useRef<HTMLDivElement>(null)
	const popoverRef = useRef<HTMLDivElement>(null)
	const containerRef = useRef<HTMLDivElement>(null)

	// Live Range for the currently-active selection (displayed amber
	// while the + button / textarea is up).
	const pendingRangeRef = useRef<Range | null>(null)
	// Live Ranges for saved comments whose `content_sha` matches the
	// current file — the reviewer left this comment on THIS version of
	// the text. Keyed by commentId (or a synthetic key for
	// anchor-only items). Painted via `::highlight(inline-comments-saved)`.
	const savedRangesRef = useRef<Map<string, Range>>(new Map())
	// Live Ranges for saved comments whose content hash doesn't match —
	// the underlying file has changed since the comment was written, so
	// the anchor may no longer point at the intended text. Painted via
	// `::highlight(inline-comments-stale)` in a distinct color.
	const staleRangesRef = useRef<Map<string, Range>>(new Map())
	// Live Range for the one-shot flash when the reviewer clicks a
	// persisted inline feedback card.
	const flashRangeRef = useRef<Range | null>(null)

	const [_comments, setComments] = useState<InlineCommentEntry[]>([])
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

	// Feature-detect once. If the Custom Highlight API is missing we
	// don't silently degrade — the whole selection-UX is undefined.
	// Safari 17.2+, Chrome 105+, Firefox 141+ all have it.
	const hasHighlightApi = useHasHighlightApi()

	const redrawHighlights = useCallback(() => {
		if (!hasHighlightApi) return
		const pending = pendingRangeRef.current
		if (pending) {
			CSS.highlights.set("inline-comments-pending", new Highlight(pending))
		} else {
			CSS.highlights.delete("inline-comments-pending")
		}

		const saved = Array.from(savedRangesRef.current.values()).filter((r) =>
			rangeIsLive(r),
		)
		if (saved.length > 0) {
			CSS.highlights.set("inline-comments-saved", new Highlight(...saved))
		} else {
			CSS.highlights.delete("inline-comments-saved")
		}

		const stale = Array.from(staleRangesRef.current.values()).filter((r) =>
			rangeIsLive(r),
		)
		if (stale.length > 0) {
			CSS.highlights.set("inline-comments-stale", new Highlight(...stale))
		} else {
			CSS.highlights.delete("inline-comments-stale")
		}

		const flash = flashRangeRef.current
		if (flash) {
			CSS.highlights.set("inline-comments-flash", new Highlight(flash))
		} else {
			CSS.highlights.delete("inline-comments-flash")
		}
	}, [hasHighlightApi])

	function getParagraphIndex(node: Node): number {
		const el = node.nodeType === 3 ? node.parentElement : (node as HTMLElement)
		if (!(el && contentRef.current)) return 0
		let block: HTMLElement | null = el
		while (block && block.parentElement !== contentRef.current) {
			block = block.parentElement
		}
		if (!block) return 0
		return Array.from(contentRef.current.children).indexOf(block)
	}

	// Write innerHTML manually (not via `dangerouslySetInnerHTML`). This
	// runs ONLY when the string value changes, not on every render, so
	// ranges pinned against the rendered DOM stay valid.
	//
	// When content does change, every highlight range held a reference
	// to the OLD DOM — those are now dead. Clear everything so we don't
	// paint stale ranges.
	useEffect(() => {
		if (!contentRef.current) return
		contentRef.current.innerHTML = htmlContent
		pendingRangeRef.current = null
		savedRangesRef.current.clear()
		staleRangesRef.current.clear()
		flashRangeRef.current = null
		redrawHighlights()
	}, [htmlContent, redrawHighlights])

	// Re-paint persisted inline-comment anchors when the DOM is fresh
	// (mount + htmlContent change). For each anchor we text-search the
	// rendered body to build a live Range, then bucket it as "saved"
	// (hashes match) or "stale" (hashes diverge or the text doesn't
	// match anymore). Runs after the innerHTML-write effect above so
	// the DOM it walks is the current one.
	// Dedupe by stringified content so periodic feedback re-fetches that
	// produce a fresh array identity but the SAME anchors don't trigger
	// a clear → rebuild cycle (the brief empty-paint between them looks
	// like the highlight "disappearing" a few seconds after it lands).
	const _anchorsKey = useMemo(
		() =>
			JSON.stringify(
				(existingAnchors ?? []).map((a) => [
					a.commentId ?? "",
					a.selectedText,
					a.paragraph ?? -1,
					a.contentSha ?? "",
				]),
			),
		[existingAnchors],
	)

	useEffect(() => {
		if (!contentRef.current) return
		if (!(existingAnchors && existingAnchors.length > 0)) {
			savedRangesRef.current.clear()
			staleRangesRef.current.clear()
			redrawHighlights()
			return
		}
		savedRangesRef.current.clear()
		staleRangesRef.current.clear()
		for (const a of existingAnchors) {
			const range = locateAnchorRange(contentRef.current, {
				commentId: a.commentId,
				selectedText: a.selectedText,
				paragraph: a.paragraph,
			})
			if (!range) continue
			const isStale =
				!currentContentSha ||
				!a.contentSha ||
				a.contentSha !== currentContentSha
			const key =
				a.commentId ??
				`anon-${savedRangesRef.current.size + staleRangesRef.current.size}`
			if (isStale) staleRangesRef.current.set(key, range)
			else savedRangesRef.current.set(key, range)
		}
		redrawHighlights()
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [currentContentSha, redrawHighlights, existingAnchors])

	function evaluateSelection(): void {
		// If there's already a pending selection under review, don't
		// replace it — the reviewer is mid-comment. Clicks inside the
		// popover don't reach here (handled by the handleUp guard).
		if (pendingRangeRef.current) return

		const sel = window.getSelection()
		if (!sel || sel.isCollapsed || !sel.rangeCount) return

		const range = sel.getRangeAt(0)
		if (!contentRef.current?.contains(range.commonAncestorContainer)) return

		const text = sel.toString().trim()
		if (!text) return

		const cloned = range.cloneRange()
		pendingSelectionRef.current = {
			text,
			range: cloned,
			paragraph: getParagraphIndex(range.startContainer),
		}
		pendingRangeRef.current = cloned

		// Compute popover position from the range rect — stable and does
		// not require any DOM wrapping.
		const rect = range.getBoundingClientRect()
		const popoverWidth = 120
		const popoverHeight = 40
		const padding = 8
		let x = rect.left + rect.width / 2 - popoverWidth / 2
		let y = rect.top - popoverHeight - 4
		x = Math.max(
			padding,
			Math.min(x, window.innerWidth - popoverWidth - padding),
		)
		if (y < padding) y = rect.bottom + 4
		setPopoverPos({ x, y })

		// Clear the browser's native selection — our amber overlay owns
		// the visual now, and leaving the native selection up means
		// blue-overlapping-amber until the reviewer clicks elsewhere.
		sel.removeAllRanges()
		redrawHighlights()
	}

	// Document-level mouseup: mouseup isn't always inside contentRef
	// (a drag that ends past the content edge still fires on body).
	// Ignore mouseups inside the popover itself so clicking + Comment
	// doesn't re-evaluate with a now-collapsed selection.
	useEffect(() => {
		function handleUp(e: MouseEvent) {
			const target = e.target as Node
			if (popoverRef.current?.contains(target)) return
			requestAnimationFrame(evaluateSelection)
		}
		document.addEventListener("mouseup", handleUp)
		return () => document.removeEventListener("mouseup", handleUp)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [evaluateSelection])

	function handleShowCommentInput() {
		setPopoverMode("editing")
		setPopoverText("")
		// Reposition for the larger editing textarea so the popover
		// doesn't cover the amber highlight.
		const range = pendingRangeRef.current
		if (range) {
			const rect = range.getBoundingClientRect()
			const editingWidth = 280
			const editingHeight = 160
			const padding = 8
			const roomBelow = window.innerHeight - rect.bottom - padding
			const roomAbove = rect.top - padding
			const placeBelow = roomBelow >= editingHeight || roomBelow >= roomAbove
			const y = placeBelow
				? Math.min(
						rect.bottom + 8,
						window.innerHeight - editingHeight - padding,
					)
				: Math.max(padding, rect.top - editingHeight - 8)
			let x = rect.left + rect.width / 2 - editingWidth / 2
			x = Math.max(
				padding,
				Math.min(x, window.innerWidth - editingWidth - padding),
			)
			setPopoverPos({ x, y })
		}
		setTimeout(() => popoverTextareaRef.current?.focus(), 0)
	}

	async function handleSaveComment() {
		const selData = pendingSelectionRef.current
		if (!selData) return
		const id = nextCommentId()
		const commentText = popoverText.trim()

		// Promote pending → saved. Same Range object, different bucket.
		savedRangesRef.current.set(id, selData.range)
		pendingRangeRef.current = null

		const entry: InlineCommentEntry = {
			selectedText: selData.text,
			comment: commentText,
			paragraph: selData.paragraph,
			location,
			id,
			highlightEl: null,
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
		redrawHighlights()

		if (onSaveInline) {
			try {
				await onSaveInline({
					selectedText: entry.selectedText,
					comment: entry.comment,
					paragraph: entry.paragraph,
					location: location ?? "",
					...(filePath ? { filePath } : {}),
					commentId: id,
					...(currentContentSha ? { contentSha: currentContentSha } : {}),
				})
			} catch (err) {
				console.error("[InlineComments] onSaveInline failed", err)
			}
		}
	}

	function handleCancelComment() {
		pendingRangeRef.current = null
		setPopoverPos(null)
		setPopoverMode("button")
		setPopoverText("")
		pendingSelectionRef.current = null
		redrawHighlights()
	}

	// Close popover on outside clicks (but not when the click is inside
	// the content or the popover itself).
	useEffect(() => {
		function handleDown(e: MouseEvent) {
			const target = e.target as Node
			const inPopover = popoverRef.current?.contains(target)
			const inContent = contentRef.current?.contains(target)
			if (inPopover || inContent) return
			pendingRangeRef.current = null
			setPopoverPos(null)
			setPopoverMode("button")
			setPopoverText("")
			pendingSelectionRef.current = null
			redrawHighlights()
		}
		document.addEventListener("mousedown", handleDown)
		return () => document.removeEventListener("mousedown", handleDown)
	}, [redrawHighlights])

	// Flash-to-anchor: reviewer clicks a persisted inline feedback in
	// the sidebar → StageContent navigates here with an anchor → we
	// text-search the content for `selectedText`, build a Range, scroll
	// to it, paint the `inline-comments-flash` highlight for 1.6s.
	useEffect(() => {
		if (!flashAnchor) return
		const el = contentRef.current
		if (!el) {
			console.warn("[InlineComments flash] no contentRef on mount")
			return
		}
		console.log("[InlineComments flash] anchor received", flashAnchor)

		const range = locateAnchorRange(el, flashAnchor)
		if (!range) {
			console.warn(
				"[InlineComments flash] no match for selectedText in rendered body",
				flashAnchor,
			)
			onFlashCommentConsumed?.()
			return
		}
		console.log("[InlineComments flash] range located, flashing")
		flashRangeRef.current = range
		redrawHighlights()

		// Scroll range into view. Range.scrollIntoView doesn't exist
		// natively, so scroll to the range's bounding rect via a
		// transient element.
		scrollRangeIntoView(range)

		const timer = setTimeout(() => {
			flashRangeRef.current = null
			redrawHighlights()
			onFlashCommentConsumed?.()
		}, 1800)
		return () => clearTimeout(timer)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [flashAnchor, redrawHighlights, onFlashCommentConsumed])

	return (
		<div ref={containerRef} className="relative">
			<div
				ref={contentRef}
				style={{ userSelect: "text" }}
				className="prose prose-sm prose-stone dark:prose-invert max-w-none
          prose-code:bg-stone-100 prose-code:dark:bg-stone-800 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-sm
          prose-pre:bg-stone-100 prose-pre:dark:bg-stone-800 prose-pre:rounded-lg
          prose-table:border-collapse prose-th:border prose-th:border-stone-300 prose-th:dark:border-stone-600 prose-th:px-3 prose-th:py-1.5
          prose-td:border prose-td:border-stone-300 prose-td:dark:border-stone-600 prose-td:px-3 prose-td:py-1.5"
			/>

			{popoverPos && (
				<div
					ref={popoverRef}
					className="fixed z-50 bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-600 rounded-lg shadow-lg"
					style={{ left: popoverPos.x, top: popoverPos.y }}
				>
					{popoverMode === "button" ? (
						<button
							type="button"
							className="px-3 py-1.5 cursor-pointer hover:bg-stone-50 dark:hover:bg-stone-700 transition-colors rounded-lg text-left"
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
									className="px-3 py-1 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-md transition-colors"
								>
									Save
								</button>
							</div>
						</div>
					)}
				</div>
			)}
		</div>
	)
}

function useHasHighlightApi(): boolean {
	const [has] = useState(() => {
		if (typeof window === "undefined") return false
		return (
			typeof (window as unknown as { Highlight?: unknown }).Highlight ===
				"function" &&
			typeof CSS !== "undefined" &&
			typeof (CSS as unknown as { highlights?: unknown }).highlights ===
				"object"
		)
	})
	useEffect(() => {
		if (!has) {
			console.warn(
				"[InlineComments] CSS Custom Highlight API not available — inline comments will not render. Upgrade Chrome / Safari / Firefox.",
			)
		}
	}, [has])
	return has
}

/** Live range: both endpoints are still attached to a document. */
function rangeIsLive(r: Range): boolean {
	return (
		r.startContainer.isConnected === true && r.endContainer.isConnected === true
	)
}

/** Locate a Range matching `anchor.selectedText` inside `root`.
 *  Scoped to `anchor.paragraph` when provided so identical text in
 *  different paragraphs doesn't collide. Returns null if not found. */
function locateAnchorRange(
	root: HTMLElement,
	anchor: {
		commentId?: string
		selectedText: string
		paragraph?: number
	},
): Range | null {
	const paragraphRoot =
		typeof anchor.paragraph === "number"
			? (root.children[anchor.paragraph] as HTMLElement | undefined)
			: null
	const searchRoot = paragraphRoot ?? root
	const walker = document.createTreeWalker(
		searchRoot,
		NodeFilter.SHOW_TEXT,
		null,
	)
	const needle = anchor.selectedText
	let node: Node | null = walker.nextNode()
	while (node) {
		const text = node.nodeValue ?? ""
		const idx = text.indexOf(needle)
		if (idx >= 0) {
			const range = document.createRange()
			range.setStart(node, idx)
			range.setEnd(node, idx + needle.length)
			return range
		}
		node = walker.nextNode()
	}
	// Paragraph-scoped search failed — try the whole body as a
	// defensive fallback (content may have shifted by a paragraph).
	if (paragraphRoot) {
		return locateAnchorRange(root, { ...anchor, paragraph: undefined })
	}
	return null
}

/** Scroll a Range into view by delegating to `range.getBoundingClientRect`
 *  plus `window.scrollTo`, since `Range.scrollIntoView` doesn't exist. */
function scrollRangeIntoView(range: Range): void {
	const rect = range.getBoundingClientRect()
	if (rect.width === 0 && rect.height === 0) return
	const target =
		(range.startContainer.nodeType === 3
			? range.startContainer.parentElement
			: (range.startContainer as HTMLElement)) ?? null
	if (target) {
		target.scrollIntoView({ behavior: "smooth", block: "center" })
	} else {
		window.scrollTo({
			top: window.scrollY + rect.top - window.innerHeight / 2,
			behavior: "smooth",
		})
	}
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
