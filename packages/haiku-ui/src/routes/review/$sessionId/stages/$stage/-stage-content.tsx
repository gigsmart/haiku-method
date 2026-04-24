/**
 * StageContent — shared wrapper that mounts `<StageReview>` with tab +
 * detail controlled by the URL. Each leaf route under
 * `stages/$stage/*` picks what to pass based on its own params; this
 * module centralises the navigate-on-change side of the binding.
 *
 * Falls through to `<ArtifactsPane>` for unit-scoped reviews (the
 * session carries a `review_type === "unit"` target) — same fallback
 * the pre-router `StageScopedContent` applied.
 */

import { useNavigate } from "@tanstack/react-router"
import { useCallback, useEffect } from "react"
import { useFeedbackContext } from "../../../../../hooks/FeedbackContext"
import { ArtifactsPane } from "../../../../../pages/review/ArtifactsPane"
import type {
	ReviewDetailKind,
	ReviewTab,
} from "../../../../../pages/review/shared/stage-tabs"
import { StageReview } from "../../../../../pages/review/stage/StageReview"
import { useReviewContext } from "../../-context"

export function StageContent({
	stage,
	tab,
	detail,
}: {
	stage: string
	tab: ReviewTab | undefined
	detail: { kind: ReviewDetailKind; name: string } | null
}): React.ReactElement {
	const {
		session,
		sessionId,
		wsRef,
		highlightFeedbackId,
		setHighlightFeedbackId,
		pendingFlashAnchor,
		setPendingFlashAnchor,
		inlineComments,
		setInlineComments,
		pins,
		setPins,
		getAnnotations,
	} = useReviewContext()
	const navigate = useNavigate()

	const intentSlug = session.intent_slug ?? session.intent?.slug ?? null
	const { items: stageFeedback, createFeedback: hookCreateFeedback } =
		useFeedbackContext()

	const handleTabChange = useCallback(
		(next: ReviewTab | undefined) => {
			if (!next || next === "overview") {
				navigate({
					to: "/review/$sessionId/stages/$stage",
					params: { sessionId, stage },
				})
			} else {
				navigate({
					to: "/review/$sessionId/stages/$stage/$tab",
					params: { sessionId, stage, tab: next },
				})
			}
		},
		[navigate, sessionId, stage],
	)

	const handleDetailChange = useCallback(
		(next: { kind: ReviewDetailKind; name: string } | null) => {
			if (next) {
				navigate({
					to: "/review/$sessionId/stages/$stage/$kind/$name",
					params: {
						sessionId,
						stage,
						kind: next.kind,
						name: next.name,
					},
				})
			} else if (tab && tab !== "overview") {
				navigate({
					to: "/review/$sessionId/stages/$stage/$tab",
					params: { sessionId, stage, tab },
				})
			} else {
				navigate({
					to: "/review/$sessionId/stages/$stage",
					params: { sessionId, stage },
				})
			}
		},
		[navigate, sessionId, stage, tab],
	)

	const isUnitReview = session.review_type === "unit" && !!session.target
	if (isUnitReview) {
		return (
			<ArtifactsPane
				session={session}
				sessionId={sessionId}
				getAnnotations={getAnnotations}
				wsRef={wsRef}
				onInlineCommentsChange={setInlineComments}
				onPinsChange={setPins}
			/>
		)
	}

	// `inlineComments` and `pins` are consumed by the sidebar composer
	// via `getAnnotations()`; StageReview itself only needs the setters
	// so detail views can push drafts up.
	void inlineComments
	void pins

	const handleSubmitAnnotation = useCallback(
		async (
			artifactName: string,
			comment: string,
			screenshotDataUrl: string,
		) => {
			if (!intentSlug) {
				throw new Error("Cannot submit annotation without an intent slug")
			}
			// Title is the artifact + first few words of the comment so the
			// feedback list shows something scannable without opening it.
			const firstLine =
				comment.trim().split("\n")[0]?.slice(0, 80) || "Annotation"
			const title = `${artifactName}: ${firstLine}`.slice(0, 200)
			// Route through the hook so it refetches the list on success —
			// without this the new item would only appear after a manual
			// reload.
			await hookCreateFeedback({
				title,
				body: comment.trim(),
				origin: "user-visual",
				source_ref: artifactName,
				attachment_data_url: screenshotDataUrl,
			})
		},
		[hookCreateFeedback, intentSlug],
	)

	const handleSaveInline = useCallback(
		async (entry: {
			selectedText: string
			comment: string
			paragraph: number
			location: string
			filePath?: string
			commentId: string
			contentSha?: string
		}) => {
			if (!intentSlug) {
				throw new Error("Cannot save inline comment without an intent slug")
			}
			const firstCommentLine =
				entry.comment.trim().split("\n")[0]?.slice(0, 80) || "Inline comment"
			const title = `${entry.location}: ${firstCommentLine}`.slice(0, 200)
			const quotedSelection = entry.selectedText
				.split("\n")
				.map((line) => `> ${line}`)
				.join("\n")
			const body = `${quotedSelection}\n\n${entry.comment.trim() || "(no comment)"}`
			await hookCreateFeedback({
				title,
				body,
				origin: "user-chat",
				source_ref: entry.filePath ?? entry.location,
				inline_anchor: {
					selected_text: entry.selectedText,
					paragraph: entry.paragraph,
					location: entry.location,
					comment_id: entry.commentId,
					...(entry.filePath ? { file_path: entry.filePath } : {}),
					...(entry.contentSha ? { content_sha: entry.contentSha } : {}),
				},
			})
		},
		[hookCreateFeedback, intentSlug],
	)

	// When the sidebar fires a feedback click AND the clicked feedback
	// has an `inline_anchor`, route the user to the matching artifact
	// detail URL and stash the comment_id in context so
	// InlineComments can scroll+flash the target span on mount.
	//
	// Non-inline feedback keeps going through the existing
	// `UnitsTab`/`ArtifactsTab` highlight-request effect (which navigates
	// via `onOpenDetail` inside the list tabs).
	useEffect(() => {
		if (!highlightFeedbackId) return
		console.log(
			"[StageContent nav] highlightFeedbackId fired",
			highlightFeedbackId,
		)
		const item = stageFeedback.find(
			(f) =>
				(f as unknown as { feedback_id?: string }).feedback_id ===
				highlightFeedbackId,
		) as unknown as {
			feedback_id?: string
			inline_anchor?: {
				file_path?: string
				comment_id?: string
				selected_text: string
				paragraph: number
			}
		}
		if (!item) {
			console.warn(
				"[StageContent nav] no feedback item found for id",
				highlightFeedbackId,
				"(total loaded:",
				stageFeedback.length,
				")",
			)
			return
		}
		const anchor = item.inline_anchor
		if (!anchor) {
			console.log(
				"[StageContent nav] feedback has no inline_anchor — letting existing list-tab highlight effect handle it",
			)
			return
		}
		if (!anchor.file_path) {
			console.warn(
				"[StageContent nav] inline_anchor present but file_path missing — can't route",
				anchor,
			)
			return
		}
		console.log("[StageContent nav] inline_anchor found", anchor)

		// Parse kind + name from `.haiku/intents/<slug>/stages/<stage>/units/<name>.md`
		// (or the `artifacts` / `outputs` variant).
		const stageMatch = anchor.file_path.match(
			/\/stages\/[^/]+\/(units|artifacts|outputs)\/(.+?)(?:\.md)?$/,
		)
		if (!stageMatch) {
			console.warn(
				"[StageContent nav] file_path didn't match expected stage layout",
				anchor.file_path,
			)
			return
		}
		const folder = stageMatch[1]
		const nameWithExt = stageMatch[2]
		const nameNoExt = nameWithExt.replace(/\.md$/, "")
		const kind: ReviewDetailKind =
			folder === "units"
				? "units"
				: folder === "artifacts"
					? "knowledge"
					: "outputs"
		const artifactParam = folder === "units" ? nameNoExt : nameWithExt

		setPendingFlashAnchor({
			selectedText: anchor.selected_text,
			paragraph: anchor.paragraph,
			...(anchor.comment_id ? { commentId: anchor.comment_id } : {}),
		})
		console.log("[StageContent nav] navigating to", {
			sessionId,
			stage,
			kind,
			name: artifactParam,
		})
		navigate({
			to: "/review/$sessionId/stages/$stage/$kind/$name",
			params: {
				sessionId,
				stage,
				kind,
				name: artifactParam,
			},
		})
		setHighlightFeedbackId(null)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [
		highlightFeedbackId,
		stageFeedback,
		sessionId,
		stage,
		setPendingFlashAnchor,
		setHighlightFeedbackId,
		navigate,
	])

	return (
		<StageReview
			session={session}
			sessionId={sessionId}
			intentSlug={intentSlug}
			stageName={stage}
			feedback={stageFeedback}
			onHighlightRequestId={highlightFeedbackId}
			onHighlightConsumed={() => setHighlightFeedbackId(null)}
			flashAnchor={pendingFlashAnchor}
			onFlashCommentConsumed={() => setPendingFlashAnchor(null)}
			tab={tab}
			onTabChange={handleTabChange}
			detail={detail}
			onDetailChange={handleDetailChange}
			onInlineCommentsChange={setInlineComments}
			onSaveInline={handleSaveInline}
			onSubmitAnnotation={handleSubmitAnnotation}
		/>
	)
}
