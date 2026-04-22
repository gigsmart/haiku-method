/**
 * ReviewPage — full-bleed review shell per canonical design mockup
 * (`stages/design/artifacts/review-ui-mockup.html`).
 *
 * Structure:
 *   <div.h-screen.flex-col>
 *     <header>                        — H·AI·K·U branding + session id + theme toggle
 *     <StageProgressStrip />          — centered stepper with pending badges
 *     <div.flex-1.flex.overflow-hidden>
 *       <FeedbackSidebar />           — LEFT, full-height scroll, composer + actions at bottom
 *       <main.flex-1.overflow-y-auto> — stage banner + artifact cards
 *
 * Mobile (<xl): sidebar collapses into a FAB + Sheet; main fills the
 * viewport.
 *
 * The page owns the full viewport — it does NOT live inside ShellLayout's
 * max-width container. App.tsx renders it directly.
 */

import { useCallback, useRef, useState } from "react"
import { Header as HeaderLandmark, Main } from "../../a11y"
import type { AnnotationPin } from "../../components/AnnotationCanvas"
import {
	FeedbackFloatingButton,
	FeedbackSheet,
} from "../../components/feedback"
import type { InlineCommentEntry } from "../../components/InlineComments"
import { StageProgressStrip } from "../../components/StageProgressStrip"
import { ThemeToggle } from "../../components/ThemeToggle"
import type { ReviewAnnotations } from "../../types"
import { ArtifactsPane } from "./ArtifactsPane"
import { FeedbackPanelBody } from "./FeedbackPanelBody"
import { FeedbackSidebar } from "./FeedbackSidebar"
import { RereviewBanner } from "./shared/RereviewBanner"
import type { ReviewPageSessionData } from "./shared/session-data"
import { useFeedbackSidebarController } from "./useFeedbackSidebarController"
import { useIsMobile } from "./useIsMobile"

export type { ReviewPageSessionData } from "./shared/session-data"

export interface ReviewPageProps {
	session: ReviewPageSessionData
	sessionId: string
	wsRef?: React.RefObject<WebSocket | null>
}

function resolveActiveStage(session: ReviewPageSessionData): string | null {
	const stageStates = session.stage_states ?? {}
	const names = Object.keys(stageStates)
	const active = names.find((s) => stageStates[s]?.status === "active")
	return active ?? names[0] ?? null
}

function resolveGateType(
	gate: string | undefined,
): "ask" | "external" | "auto" {
	if (gate?.includes("external")) return "external"
	if (gate?.includes("ask")) return "ask"
	return "auto"
}

function gateBadgeCopy(
	gate: "ask" | "external" | "auto",
): { label: string; classes: string } {
	switch (gate) {
		case "ask":
			return {
				label: "Local Review",
				classes:
					"bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400",
			}
		case "external":
			return {
				label: "External Review",
				classes:
					"bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400",
			}
		default:
			return {
				label: "Auto Gate",
				classes:
					"bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300",
			}
	}
}

function MobileFeedbackSection({
	intentSlug,
	activeStage,
}: {
	intentSlug: string | null
	activeStage: string | null
}): React.ReactElement {
	const [sheetOpen, setSheetOpen] = useState(false)
	const fabRef = useRef<HTMLButtonElement>(null)
	const controller = useFeedbackSidebarController(intentSlug, activeStage)
	const pendingCount = controller.items.filter(
		(item) => item.status === "pending",
	).length
	return (
		<>
			<FeedbackFloatingButton
				ref={fabRef}
				open={sheetOpen}
				onToggle={() => setSheetOpen((o) => !o)}
				count={pendingCount}
			/>
			<FeedbackSheet
				open={sheetOpen}
				onClose={() => setSheetOpen(false)}
				triggerRef={fabRef}
			>
				<FeedbackPanelBody
					items={controller.items}
					loading={controller.loading}
					error={controller.error}
					onStatusChange={controller.handleStatusChange}
					onDelete={controller.handleDelete}
					onRetry={controller.retry}
				/>
			</FeedbackSheet>
		</>
	)
}

export function ReviewPage({
	session,
	sessionId,
	wsRef,
}: ReviewPageProps): React.ReactElement {
	const intentSlug = session.intent_slug ?? session.intent?.slug ?? null
	const activeStage = resolveActiveStage(session)
	const gateType = resolveGateType(session.gate_type)
	const gateBadge = gateBadgeCopy(gateType)
	const isMobile = useIsMobile()

	const [inlineComments, setInlineComments] = useState<InlineCommentEntry[]>([])
	const [pins, setPins] = useState<AnnotationPin[]>([])

	const getAnnotations = useCallback((): ReviewAnnotations | undefined => {
		const hasAny = pins.length > 0 || inlineComments.length > 0
		if (!hasAny) return undefined
		const annotations: ReviewAnnotations = {}
		if (pins.length > 0) {
			annotations.pins = pins.map((p) => ({
				x: Math.round(p.x * 100) / 100,
				y: Math.round(p.y * 100) / 100,
				text: p.text,
			}))
		}
		if (inlineComments.length > 0) {
			annotations.comments = inlineComments.map((c) => ({
				selectedText: c.selectedText,
				comment: c.comment,
				paragraph: c.paragraph,
			}))
		}
		return annotations
	}, [pins, inlineComments])

	const stageStates = session.stage_states ?? {}
	const stageProgressData = Object.keys(stageStates).map((name) => {
		const state = stageStates[name] as
			| { status?: string; visits?: number; pending_feedback?: number }
			| undefined
		return {
			name,
			status:
				state?.status === "active"
					? "current"
					: (state?.status ?? "pending"),
			visits: state?.visits ?? 0,
			pendingCount: state?.pending_feedback ?? 0,
		}
	})

	const sessionIdShort = sessionId ? sessionId.slice(0, 8) : ""

	return (
		<div
			data-testid="review-page-ready"
			className="h-screen overflow-hidden flex flex-col bg-stone-50 dark:bg-stone-950 text-stone-900 dark:text-stone-100"
		>
			<HeaderLandmark className="shrink-0 z-40 bg-white/80 dark:bg-stone-900/80 backdrop-blur-sm border-b border-stone-200 dark:border-stone-800">
				<div className="px-4 sm:px-6 py-3 flex items-center justify-between border-b border-stone-100 dark:border-stone-800/60">
					<div className="flex items-center gap-3 min-w-0">
						<span className="text-base font-bold tracking-tight text-stone-900 dark:text-stone-100">
							H·AI·K·U
						</span>
						<span className="text-stone-300 dark:text-stone-600">|</span>
						<span className="text-sm font-medium text-stone-500 dark:text-stone-400">
							Review
						</span>
						{sessionIdShort && (
							<>
								<span className="text-stone-300 dark:text-stone-600">·</span>
								<span className="text-[11px] font-mono text-stone-500 dark:text-stone-500">
									session <span>{sessionIdShort}</span>
								</span>
							</>
						)}
					</div>
					<div className="flex items-center gap-2 shrink-0">
						<ThemeToggle />
					</div>
				</div>
				{stageProgressData.length > 0 && (
					<StageProgressStrip
						stages={stageProgressData}
						currentStage={activeStage ?? ""}
					/>
				)}
			</HeaderLandmark>

			<div
				data-testid="review-split"
				className="flex-1 flex flex-col xl:flex-row overflow-hidden"
			>
				{!isMobile && (
					<FeedbackSidebar
						intent={intentSlug}
						stage={activeStage}
						sessionId={sessionId}
						intentTitle={session.intent?.title}
						gateBadge={gateBadge}
						gateType={session.gate_type}
						getAnnotations={getAnnotations}
					/>
				)}
				<Main
					ariaLabel="Review content"
					className="flex-1 min-w-0 overflow-y-auto px-6 lg:px-10 py-6"
				>
					<div
						data-testid="review-stage-banner"
						className="mb-4 flex items-center gap-3 px-4 py-3 rounded-lg border border-teal-200 dark:border-teal-900/60 bg-teal-50 dark:bg-teal-900/20"
					>
						<span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-teal-700 text-white">
							current
						</span>
						<div className="flex-1 min-w-0">
							<p className="text-xs font-bold uppercase tracking-widest text-teal-600 dark:text-teal-400 leading-none">
								Stage
							</p>
							<div className="flex items-center gap-2 mt-1">
								<h1 className="text-base font-bold text-stone-900 dark:text-stone-100 leading-tight capitalize">
									{activeStage ?? "Review"}
								</h1>
								<span
									className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${gateBadge.classes}`}
								>
									{gateBadge.label}
								</span>
							</div>
						</div>
						{session.intent?.title && (
							<p className="hidden sm:block text-xs text-stone-500 dark:text-stone-400 max-w-sm leading-snug">
								{session.intent.title}
							</p>
						)}
					</div>

					{session.previous_review && (
						<RereviewBanner snapshot={session.previous_review} />
					)}
					<ArtifactsPane
						session={session}
						sessionId={sessionId}
						getAnnotations={getAnnotations}
						wsRef={wsRef}
						onInlineCommentsChange={setInlineComments}
						onPinsChange={setPins}
					/>
				</Main>
			</div>

			{isMobile && (
				<MobileFeedbackSection
					intentSlug={intentSlug}
					activeStage={activeStage}
				/>
			)}
		</div>
	)
}
