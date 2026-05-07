/**
 * FeedbackItem — single feedback row.
 *
 * Root is a disclosure (`role="button" tabIndex=0 aria-expanded`); clicking
 * or pressing Enter / Space toggles expansion. Action buttons inside the
 * expanded body are status-scoped per DESIGN-TOKENS §2.6 canonical verb set
 * (Dismiss / Verify & Close / Reopen) — the banned verbs (Close / Reject /
 * Address / "Re" hyphen "open") are audit-enforced. "Delete" is NOT banned;
 * it is the terminal destructive action surfaced only on closed/rejected
 * items via the optional `onDelete` handler.
 *
 * Focus preservation: when the item's `status` changes (i.e. after an action
 * button fires and the parent updates the item's status), focus returns to
 * the card root. This keeps the keyboard-nav path continuous across a
 * status transition — the action button that handled the click may no
 * longer exist in the new button tree, so sending focus to it would 404.
 *
 * Screen-reader announcement: every status change fires an announcement via
 * `useAnnounce("polite", "Feedback <id> marked as <status>")` per the
 * DESIGN-BRIEF §2 screen-reader table + `aria-live-sequencing-spec.md §5`.
 * Callers own the state update; we own the announcement + focus repair.
 */

import { MarkdownViewer } from "@haiku/shared"
import {
	forwardRef,
	useCallback,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react"
import { focusRingCompactClass, touchTargetClass, useAnnounce } from "../a11y"
import { FeedbackOriginIcon } from "../atoms/FeedbackOriginIcon"
import { FeedbackStatusBadge } from "../atoms/FeedbackStatusBadge"
import type { FeedbackStatus } from "../atoms/feedback-tokens"
import {
	originLabels,
	statusBackground,
	statusBorderLeft,
	visitCounterClasses,
} from "../atoms/feedback-tokens"
import type { FeedbackItemData } from "../types"
import { AttachmentLightbox } from "./AttachmentLightbox"

const RESOLUTION_LABELS: Record<
	"question" | "inline_fix" | "stage_revisit",
	{ label: string; classes: string }
> = {
	question: {
		label: "Question",
		classes:
			"bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300",
	},
	inline_fix: {
		label: "Inline fix",
		classes: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300",
	},
	stage_revisit: {
		label: "Stage revisit",
		classes:
			"bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
	},
}

/**
 * Feedback body content is authored in markdown (review subagents,
 * external PR/MR bodies, user-visual dialog pasting rich text). Render
 * via the same MarkdownViewer the rest of the review UI uses so code
 * blocks, lists, and links come through — not as a wall of text with
 * whitespace-pre-wrap.
 *
 * Click delegation: when the feedback has an attachment (wireframe
 * screenshot + annotation overlay) the markdown body includes an
 * `![annotation](/api/feedback-attachment/...)` block. A click on
 * the rendered `<img>` opens the AttachmentLightbox so the reviewer
 * can see the full-resolution artifact alongside the comment text.
 */
function FeedbackBody({
	title,
	body,
}: {
	title: string
	body: string
}): React.ReactElement {
	const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(
		null,
	)
	const onBodyClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
		const target = e.target as HTMLElement
		if (!(target instanceof HTMLImageElement)) return
		e.preventDefault()
		setLightbox({ src: target.src, alt: target.alt || "Attachment" })
	}, [])
	return (
		<>
			{/* biome-ignore lint/a11y/noStaticElementInteractions: click delegation on the markdown body catches img clicks; each img already has alt text, and the lightbox trigger is accessible via the image's focusable wrapping. */}
			<div
				onClick={onBodyClick}
				onKeyDown={(e) => {
					// Enter on a focused img opens the lightbox too.
					const target = e.target as HTMLElement
					if (!(target instanceof HTMLImageElement)) return
					if (e.key !== "Enter" && e.key !== " ") return
					e.preventDefault()
					setLightbox({ src: target.src, alt: target.alt || "Attachment" })
				}}
				className="feedback-body-attachment-host [&_img]:cursor-zoom-in [&_img]:transition-opacity [&_img:hover]:opacity-90"
			>
				<MarkdownViewer id="feedback-body">{body}</MarkdownViewer>
			</div>
			{lightbox && (
				<AttachmentLightbox
					src={lightbox.src}
					alt={lightbox.alt}
					title={title}
					body={body}
					onClose={() => setLightbox(null)}
				/>
			)}
		</>
	)
}

export interface FeedbackItemProps {
	item: FeedbackItemData
	isExpanded: boolean
	onToggle: () => void
	/** Fired when an action button changes the status. Parent owns persistence. */
	onStatusChange?: (id: string, nextStatus: FeedbackStatus) => void
	/** Optional delete handler — rendered only for closed/rejected items. */
	onDelete?: (id: string) => void
	/** Optional reply handler — when provided the card renders a Reply
	 *  button that opens an inline composer. `closeAsAnswered` flips the
	 *  parent's status to `answered` in the same server write (used for
	 *  the "reply & close" path on question-type feedback). */
	onReply?: (
		id: string,
		body: string,
		closeAsAnswered?: boolean,
	) => Promise<void>
	/** Optional handler for dismissing the closure-reply card. Fired when
	 *  the reviewer clicks "Dismiss" on the agent's "Resolved" panel.
	 *  Parent owns persistence (POST to dismiss-reply endpoint). */
	onDismissClosureReply?: (id: string) => Promise<void>
	/** Server mutation is in flight — show a spinner + disable buttons so
	 *  the user can't double-click through the round trip. The optimistic
	 *  state has already been applied locally; this is a confirmation
	 *  state, not a pre-confirmation state. */
	pending?: boolean
	/** `style` prop from react-window virtualizer (absolute position). */
	style?: React.CSSProperties
	className?: string
}

const ACTION_BUTTON_BASE =
	`${touchTargetClass} inline-flex items-center justify-center text-xs font-medium px-3 py-1 rounded-md transition-colors ` +
	focusRingCompactClass

const DISMISS_CLASSES =
	"bg-stone-100 text-stone-600 hover:bg-stone-200 " +
	"dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700"

const VERIFY_CLOSE_CLASSES =
	"bg-green-50 text-green-700 hover:bg-green-100 " +
	"dark:bg-green-900/20 dark:text-green-300 dark:hover:bg-green-900/40"

const REOPEN_CLASSES =
	"bg-amber-50 text-amber-700 hover:bg-amber-100 " +
	"dark:bg-amber-900/20 dark:text-amber-300 dark:hover:bg-amber-900/40"

const DELETE_CLASSES =
	"text-red-600 hover:bg-red-50 " + "dark:text-red-400 dark:hover:bg-red-900/20"

function statusAnnouncement(id: string, next: FeedbackStatus): string {
	if (next === "rejected") return `Feedback ${id} marked as rejected`
	if (next === "closed") return `Feedback ${id} marked as closed`
	if (next === "pending") return `Feedback ${id} reopened`
	if (next === "addressed") return `Feedback ${id} marked as addressed`
	return `Feedback ${id} status changed`
}

export const FeedbackItem = forwardRef<HTMLDivElement, FeedbackItemProps>(
	function FeedbackItem(
		{
			item,
			isExpanded,
			onToggle,
			onStatusChange,
			onDelete,
			onReply,
			onDismissClosureReply,
			pending,
			style,
			className,
		},
		forwardedRef,
	): React.ReactElement {
		const localCardRef = useRef<HTMLDivElement | null>(null)
		const previousStatusRef = useRef<FeedbackStatus>(item.status)
		const [replyOpen, setReplyOpen] = useState(false)
		const [replyText, setReplyText] = useState("")
		const [replySubmitting, setReplySubmitting] = useState(false)
		const [replyError, setReplyError] = useState<string | null>(null)
		// Tracks whether focus was inside the card at the moment the user
		// clicked an action button. The click handler updates this before
		// React re-renders (which may unmount the focused button) so the
		// layout-effect on status change can decide whether to restore focus
		// to the card root.
		const focusedBeforeChangeRef = useRef<boolean>(false)
		const announce = useAnnounce()

		const setCardRef = useCallback(
			(node: HTMLDivElement | null) => {
				localCardRef.current = node
				if (typeof forwardedRef === "function") {
					forwardedRef(node)
				} else if (forwardedRef) {
					forwardedRef.current = node
				}
			},
			[forwardedRef],
		)

		// Focus preservation + announcement on status change.
		useLayoutEffect(() => {
			const previous = previousStatusRef.current
			if (previous === item.status) return
			previousStatusRef.current = item.status
			const card = localCardRef.current
			if (!card) return
			// If focus was inside the card at the moment the action fired, or
			// is still inside (e.g. expand toggle), restore to the card root.
			// Checking both covers the jsdom case where button removal resets
			// activeElement to <body> before the layout effect runs.
			const hadFocusInside =
				focusedBeforeChangeRef.current || card.contains(document.activeElement)
			focusedBeforeChangeRef.current = false
			if (hadFocusInside) {
				card.focus()
			}
			announce("polite", statusAnnouncement(item.feedback_id, item.status))
		}, [announce, item.feedback_id, item.status])

		const handleKeyDown = useCallback(
			(event: React.KeyboardEvent<HTMLDivElement>) => {
				if (event.key === "Enter" || event.key === " ") {
					event.preventDefault()
					onToggle()
				}
			},
			[onToggle],
		)

		const handleStatusChange = useCallback(
			(next: FeedbackStatus) =>
				(event: React.MouseEvent<HTMLButtonElement>) => {
					event.stopPropagation()
					const card = localCardRef.current
					focusedBeforeChangeRef.current = Boolean(
						card?.contains(document.activeElement),
					)
					if (onStatusChange) onStatusChange(item.feedback_id, next)
				},
			[item.feedback_id, onStatusChange],
		)

		const handleDelete = useCallback(
			(event: React.MouseEvent<HTMLButtonElement>) => {
				event.stopPropagation()
				if (onDelete) onDelete(item.feedback_id)
			},
			[item.feedback_id, onDelete],
		)

		const handleReplySubmit = useCallback(
			async (closeAsAnswered: boolean) => {
				if (!onReply) return
				const body = replyText.trim()
				if (!body) {
					setReplyError("Reply body is required")
					return
				}
				setReplySubmitting(true)
				setReplyError(null)
				try {
					await onReply(item.feedback_id, body, closeAsAnswered)
					setReplyText("")
					setReplyOpen(false)
				} catch (err) {
					setReplyError(
						err instanceof Error ? err.message : "Reply failed to send",
					)
				} finally {
					setReplySubmitting(false)
				}
			},
			[item.feedback_id, onReply, replyText],
		)

		const resolutionBadge = item.resolution
			? (RESOLUTION_LABELS[item.resolution as keyof typeof RESOLUTION_LABELS] ??
				null)
			: null

		const visitPillClass = useMemo(
			() => visitCounterClasses(item.visit),
			[item.visit],
		)

		const rootClasses = [
			"p-2.5 rounded-lg border overflow-hidden min-w-0",
			statusBorderLeft[item.status],
			statusBackground[item.status],
			"hover:border-teal-400 dark:hover:border-teal-500",
			"transition-colors cursor-pointer group",
			focusRingCompactClass,
			className,
		]
			.filter(Boolean)
			.join(" ")

		return (
			// biome-ignore lint/a11y/useSemanticElements: a native <button> cannot wrap the nested action buttons this card contains (invalid HTML). The disclosure pattern here uses role=button on the card root intentionally.
			<div
				ref={setCardRef}
				data-testid="feedback-item"
				data-feedback-id={item.feedback_id}
				data-status={item.status}
				role="button"
				tabIndex={0}
				aria-expanded={isExpanded}
				className={rootClasses}
				style={style}
				onClick={onToggle}
				onKeyDown={handleKeyDown}
			>
				<div className="flex items-center gap-2 mb-1 flex-wrap">
					<FeedbackOriginIcon origin={item.origin} showLabel />
					<FeedbackStatusBadge status={item.status} />
					{item.scope === "intent" && (
						<span
							className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-semibold leading-none bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300"
							title="Intent-scope finding — logged by the studio-level completion review, not tied to a single stage"
						>
							intent
						</span>
					)}
					{resolutionBadge && (
						<span
							className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-semibold leading-none ${resolutionBadge.classes}`}
							role="status"
							aria-label={`Resolution: ${resolutionBadge.label}`}
						>
							{resolutionBadge.label}
						</span>
					)}
					{item.visit > 1 && (
						<span
							className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-bold leading-none ${visitPillClass}`}
							role="img"
							aria-label={`${item.visit} visits`}
						>
							{item.visit}x
						</span>
					)}
					{pending && (
						<span
							className="inline-flex items-center gap-1 text-[11px] font-medium text-stone-600 dark:text-stone-300"
							role="status"
							aria-live="polite"
							aria-label={`Saving feedback ${item.feedback_id}`}
						>
							<span
								className="h-3 w-3 animate-spin rounded-full border-2 border-stone-300 border-t-teal-500"
								aria-hidden="true"
							/>
							Saving…
						</span>
					)}
				</div>
				<p className="text-xs font-medium text-stone-800 dark:text-stone-200 truncate">
					{item.title}
				</p>
				<p className="text-xs text-stone-600 dark:text-stone-300">
					{item.feedback_id} · Visit {item.visit} · {originLabels[item.origin]}
				</p>
				{isExpanded && (
					<div className="mt-2">
						<div className="text-xs text-stone-700 dark:text-stone-300 feedback-markdown prose prose-stone prose-sm dark:prose-invert max-w-none">
							<FeedbackBody title={item.title} body={item.body} />
						</div>
						{item.closed_by && (
							<p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
								Closed by: {item.closed_by}
							</p>
						)}
						<div className="flex gap-1 mt-2 flex-wrap">
							{item.status === "pending" && onStatusChange && (
								<button
									type="button"
									data-action="dismiss"
									onClick={handleStatusChange("rejected")}
									disabled={pending}
									aria-disabled={pending || undefined}
									className={`${ACTION_BUTTON_BASE} ${DISMISS_CLASSES} disabled:cursor-not-allowed`}
									aria-label={`Dismiss feedback ${item.feedback_id}`}
								>
									Dismiss
								</button>
							)}
							{item.status === "addressed" && onStatusChange && (
								<>
									<button
										type="button"
										data-action="verify-close"
										onClick={handleStatusChange("closed")}
										disabled={pending}
										aria-disabled={pending || undefined}
										className={`${ACTION_BUTTON_BASE} ${VERIFY_CLOSE_CLASSES} disabled:cursor-not-allowed`}
										aria-label={`Verify and close feedback ${item.feedback_id}`}
									>
										Verify & Close
									</button>
									<button
										type="button"
										data-action="reopen"
										onClick={handleStatusChange("pending")}
										disabled={pending}
										aria-disabled={pending || undefined}
										className={`${ACTION_BUTTON_BASE} ${REOPEN_CLASSES} disabled:cursor-not-allowed`}
										aria-label={`Reopen feedback ${item.feedback_id}`}
									>
										Reopen
									</button>
								</>
							)}
							{(item.status === "closed" || item.status === "rejected") &&
								onStatusChange && (
									<button
										type="button"
										data-action="reopen"
										onClick={handleStatusChange("pending")}
										disabled={pending}
										aria-disabled={pending || undefined}
										className={`${ACTION_BUTTON_BASE} ${REOPEN_CLASSES} disabled:cursor-not-allowed`}
										aria-label={`Reopen feedback ${item.feedback_id}`}
									>
										Reopen
									</button>
								)}
							{(item.status === "closed" || item.status === "rejected") &&
								onDelete && (
									<button
										type="button"
										data-action="delete"
										onClick={handleDelete}
										disabled={pending}
										aria-disabled={pending || undefined}
										className={`${ACTION_BUTTON_BASE} ${DELETE_CLASSES} disabled:cursor-not-allowed`}
										aria-label={`Delete feedback ${item.feedback_id}`}
									>
										Delete
									</button>
								)}
							{onReply && !replyOpen && item.status !== "closed" && (
								<button
									type="button"
									data-action="reply"
									onClick={(e) => {
										e.stopPropagation()
										setReplyOpen(true)
									}}
									disabled={pending}
									aria-disabled={pending || undefined}
									className={`${ACTION_BUTTON_BASE} bg-indigo-50 text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-900/20 dark:text-indigo-300 dark:hover:bg-indigo-900/40 disabled:cursor-not-allowed`}
									aria-label={`Reply to feedback ${item.feedback_id}`}
								>
									Reply
								</button>
							)}
						</div>
						{/* Closure reply — set by the terminal fix-hat advance.
						    Distinct from generic `replies` because it carries
						    `unread` semantics (filterable in the sidebar) and
						    represents the AGENT's resolution-of-record. */}
						{item.closure_reply && (
							<div
								className={`mt-3 rounded-md border-l-4 ${
									item.closure_reply_unread
										? "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-400 dark:border-emerald-500"
										: "bg-stone-50 dark:bg-stone-800/40 border-stone-300 dark:border-stone-600"
								} p-3`}
								data-testid={`feedback-closure-reply-${item.feedback_id}`}
							>
								<div className="flex items-start justify-between gap-3">
									<div className="flex-1 min-w-0">
										<div className="flex items-center gap-2 mb-1">
											<span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
												Resolved
											</span>
											{item.closure_reply_unread && (
												<span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-emerald-700 text-white">
													new
												</span>
											)}
											{item.closure_reply.at && (
												<time
													dateTime={item.closure_reply.at}
													className="text-[11px] text-stone-500 dark:text-stone-400"
												>
													{item.closure_reply.at
														.slice(0, 16)
														.replace("T", " ")}
												</time>
											)}
										</div>
										<div className="text-xs text-stone-700 dark:text-stone-200 whitespace-pre-wrap [overflow-wrap:anywhere]">
											{item.closure_reply.text}
										</div>
									</div>
									{item.closure_reply_unread && onDismissClosureReply && (
										<button
											type="button"
											onClick={(e) => {
												e.stopPropagation()
												void onDismissClosureReply(item.feedback_id)
											}}
											className={`shrink-0 ${ACTION_BUTTON_BASE} ${DISMISS_CLASSES}`}
										>
											Dismiss
										</button>
									)}
								</div>
							</div>
						)}
						{/* Fix-hat history — surfaces the chain of hats the workflow
						    engine ran against this finding, with per-iteration
						    result + reason + commit. Answers "what did the agent
						    do to address this?" — closure_reply is the agent's
						    plain-language summary; iterations[] is the audit
						    trail behind it. Default-collapsed so it doesn't
						    crowd the resolution callout. */}
						{item.iterations && item.iterations.length > 0 && (
							<details
								className="mt-3 text-xs"
								data-testid={`feedback-iterations-${item.feedback_id}`}
							>
								<summary className="cursor-pointer select-none text-stone-600 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200 font-medium">
									Fix history ({item.iterations.length}{" "}
									{item.iterations.length === 1 ? "step" : "steps"})
								</summary>
								<ol className="mt-2 space-y-1.5 border-l-2 border-stone-200 dark:border-stone-700 pl-3">
									{item.iterations.map((it, idx) => {
										const resultClass =
											it.result === "closed"
												? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
												: it.result === "advanced"
													? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
													: it.result === "reopened"
														? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
														: it.result === "rejected"
															? "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300"
															: "bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300"
										return (
											<li
												// biome-ignore lint/suspicious/noArrayIndexKey: iterations[] is append-only and ordered; the index is the canonical key
												key={`${item.feedback_id}-iter-${idx}`}
												className="text-stone-700 dark:text-stone-200"
											>
												<div className="flex items-center gap-2 flex-wrap">
													<span className="font-mono text-[11px] text-stone-500 dark:text-stone-400">
														bolt {it.bolt}
													</span>
													<span className="font-semibold">{it.hat}</span>
													{it.result && (
														<span
															className={`px-1.5 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wider ${resultClass}`}
														>
															{it.result}
														</span>
													)}
													{it.commit && (
														<code
															className="text-[11px] text-stone-500 dark:text-stone-400 font-mono"
															title={it.commit}
														>
															{it.commit.slice(0, 7)}
														</code>
													)}
												</div>
												{it.reason && (
													<div className="mt-0.5 text-stone-600 dark:text-stone-300 [overflow-wrap:anywhere]">
														{it.reason}
													</div>
												)}
											</li>
										)
									})}
								</ol>
							</details>
						)}
						{/* Replies thread — always visible on expand when the
						    item has any replies, so the conversation reads
						    top-to-bottom without an extra click. */}
						{item.replies && item.replies.length > 0 && (
							<ul
								aria-label={`Replies on ${item.feedback_id}`}
								className="mt-3 space-y-2 border-l-2 border-stone-200 dark:border-stone-700 pl-3"
							>
								{item.replies.map((r) => (
									<li
										key={`${item.feedback_id}-reply-${r.author}-${r.created_at}`}
										className="text-xs"
									>
										<div className="flex items-center gap-2 mb-0.5">
											<span className="font-semibold text-stone-700 dark:text-stone-200">
												{r.author_type === "agent" ? "🤖" : "👤"} {r.author}
											</span>
											{r.created_at && (
												<time
													dateTime={r.created_at}
													className="text-[11px] text-stone-500 dark:text-stone-400"
												>
													{r.created_at.slice(0, 16).replace("T", " ")}
												</time>
											)}
										</div>
										<div className="text-stone-700 dark:text-stone-200 whitespace-pre-wrap [overflow-wrap:anywhere]">
											{r.body}
										</div>
									</li>
								))}
							</ul>
						)}
						{replyOpen && (
							// biome-ignore lint/a11y/noStaticElementInteractions: container stops click propagation so typing inside the textarea doesn't bubble to the card's click-to-expand handler
							// biome-ignore lint/a11y/useKeyWithClickEvents: stop-propagation only, no semantic action; keyboard interactions are on the contained inputs
							<div
								onClick={(e) => e.stopPropagation()}
								className="mt-3 space-y-2 border-l-2 border-indigo-300 dark:border-indigo-700 pl-3"
							>
								<textarea
									value={replyText}
									onChange={(e) => {
										setReplyText(e.target.value)
										if (replyError) setReplyError(null)
									}}
									placeholder="Reply…"
									rows={2}
									disabled={replySubmitting}
									className="w-full text-xs p-2 rounded border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 focus:ring-2 focus:ring-indigo-500 focus:outline-none resize-y disabled:bg-stone-100 disabled:text-stone-500 dark:disabled:bg-stone-800 dark:disabled:text-stone-400 disabled:cursor-not-allowed"
								/>
								{replyError && (
									<p className="text-[11px] text-red-600 dark:text-red-400">
										{replyError}
									</p>
								)}
								<div className="flex items-center gap-2 justify-end flex-wrap">
									<button
										type="button"
										onClick={() => {
											setReplyOpen(false)
											setReplyText("")
											setReplyError(null)
										}}
										disabled={replySubmitting}
										aria-disabled={replySubmitting || undefined}
										className={`${ACTION_BUTTON_BASE} ${DISMISS_CLASSES} disabled:cursor-not-allowed`}
									>
										Cancel
									</button>
									<button
										type="button"
										onClick={() => void handleReplySubmit(false)}
										disabled={replySubmitting || !replyText.trim()}
										aria-disabled={
											replySubmitting || !replyText.trim() || undefined
										}
										className={`${ACTION_BUTTON_BASE} bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-stone-200 disabled:text-stone-600 dark:disabled:bg-stone-700 dark:disabled:text-stone-300 disabled:cursor-not-allowed`}
									>
										{replySubmitting ? "Sending…" : "Reply"}
									</button>
									{item.origin === "user-question" && (
										<button
											type="button"
											onClick={() => void handleReplySubmit(true)}
											disabled={replySubmitting || !replyText.trim()}
											aria-disabled={
												replySubmitting || !replyText.trim() || undefined
											}
											className={`${ACTION_BUTTON_BASE} bg-teal-700 text-white hover:bg-teal-800 disabled:bg-stone-200 disabled:text-stone-600 dark:disabled:bg-stone-700 dark:disabled:text-stone-300 disabled:cursor-not-allowed`}
										>
											Reply & close
										</button>
									)}
								</div>
							</div>
						)}
					</div>
				)}
			</div>
		)
	},
)
