/**
 * ReviewPageModule — per-route wrapper for /review/:sessionId.
 *
 * Shell (unit-06) dispatches to this module; the module owns the `useSession`
 * fetch + `useSessionWebSocket` subscription + document-title sync, and hands
 * a concrete session to the existing `<ReviewPage>` component.
 *
 * Note on "lazy-loaded modules" phrasing in the unit spec: each page-type
 * lives in its own module file (code organization). Runtime chunk splitting
 * is explicitly disabled by `vite.config.ts` (`inlineDynamicImports: true`),
 * so we use plain `import` rather than `React.lazy`. A future unit that
 * wants runtime splitting must flip the vite config first. See unit-06
 * tactical plan risk §4.
 */

import type { ReviewSessionPayload } from "haiku-api"
import { useEffect } from "react"
import { ReviewPage, type ReviewPageSessionData } from "./ReviewPage"
import { useSession, useSessionWebSocket } from "../../hooks/useSession"
import { usePageTitle } from "../../shell/PageTitleContext"

// Cast narrowed review session to the SPA-local view that expresses the
// parsed-markdown fields with their concrete types. haiku-api intentionally
// leaves those fields as LooseRecord (opaque); the SPA knows the shapes.
function asReviewPageSession(
	session: ReviewSessionPayload,
): ReviewPageSessionData {
	return session as unknown as ReviewPageSessionData
}

export interface ReviewPageModuleProps {
	sessionId: string
}

export function ReviewPageModule({
	sessionId,
}: ReviewPageModuleProps): React.ReactElement {
	const { session, loading, error } = useSession(sessionId)
	const wsRef = useSessionWebSocket(sessionId)
	const dynamicTitle =
		session && session.session_type === "review" && session.intent?.title
			? `Review: ${session.intent.title}`
			: null
	usePageTitle(dynamicTitle)

	useEffect(() => {
		if (dynamicTitle) document.title = dynamicTitle
	}, [dynamicTitle])

	if (loading) return <LoadingState message="Loading session..." />
	if (error || !session) return <ErrorState error={error} />

	if (session.session_type !== "review") {
		return <ErrorState error="Session type mismatch (expected review)." />
	}

	return (
		<ReviewPage
			session={asReviewPageSession(session)}
			sessionId={sessionId}
			wsRef={wsRef}
		/>
	)
}

function LoadingState({ message }: { message: string }) {
	return (
		<div className="flex min-h-[60vh] items-center justify-center">
			<div className="text-center">
				<div className="mb-3 h-8 w-8 mx-auto animate-spin rounded-full border-2 border-stone-300 border-t-teal-500" />
				<p className="text-sm text-stone-600 dark:text-stone-300">{message}</p>
			</div>
		</div>
	)
}

function ErrorState({ error }: { error: string | null }) {
	return (
		<div className="flex min-h-[60vh] items-center justify-center">
			<div className="text-center">
				<p className="text-lg font-semibold text-red-600 dark:text-red-400">
					Session not found
				</p>
				<p className="mt-1 text-sm text-stone-600 dark:text-stone-300">
					{error || "The session may have expired."}
				</p>
			</div>
		</div>
	)
}
