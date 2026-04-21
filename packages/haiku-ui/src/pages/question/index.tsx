/**
 * QuestionPageModule — per-route wrapper for /question/:sessionId.
 *
 * Owns the `useSession` fetch + `useSessionWebSocket` subscription +
 * document-title sync; dispatches to the existing `<QuestionPage>`.
 */

import { useEffect } from "react"
import { useSession, useSessionWebSocket } from "../../hooks/useSession"
import { usePageTitle } from "../../shell/PageTitleContext"
import { QuestionPage } from "./QuestionPage"

export interface QuestionPageModuleProps {
	sessionId: string
}

export function QuestionPageModule({
	sessionId,
}: QuestionPageModuleProps): React.ReactElement {
	const { session, loading, error } = useSession(sessionId)
	const wsRef = useSessionWebSocket(sessionId)
	const dynamicTitle =
		session && session.session_type === "question" && session.title
			? session.title
			: null
	usePageTitle(dynamicTitle)

	useEffect(() => {
		if (dynamicTitle) document.title = dynamicTitle
	}, [dynamicTitle])

	if (loading) {
		return (
			<div className="flex min-h-[60vh] items-center justify-center">
				<div className="text-center">
					<div className="mb-3 h-8 w-8 mx-auto animate-spin rounded-full border-2 border-stone-300 border-t-teal-500" />
					<p className="text-sm text-stone-600 dark:text-stone-300">
						Loading session...
					</p>
				</div>
			</div>
		)
	}

	if (error || !session) {
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

	if (session.session_type !== "question") {
		return (
			<div className="flex min-h-[60vh] items-center justify-center">
				<p className="text-sm text-stone-600 dark:text-stone-300">
					Session type mismatch (expected question).
				</p>
			</div>
		)
	}

	return <QuestionPage session={session} sessionId={sessionId} wsRef={wsRef} />
}
