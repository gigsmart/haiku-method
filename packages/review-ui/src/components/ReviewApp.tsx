import { useEffect, useState } from "react"
import { ReviewTransportProvider } from "../context"
import { useSession } from "../hooks/useSession"
import type { ReviewTransport } from "../transport"
import { DesignPicker } from "./DesignPicker"
import { QuestionPage } from "./QuestionPage"
import { ReviewPage } from "./ReviewPage"

export interface ReviewAppProps {
	transport: ReviewTransport
	/** Optional chrome (header/footer/sidebars) around the routed content. */
	chrome?: (
		inner: React.ReactNode,
		state: { title: string; isConnected: boolean | null },
	) => React.ReactNode
	/** Override: render your own loading state. */
	renderLoading?: () => React.ReactNode
	/** Override: render your own error state. */
	renderError?: (error: string) => React.ReactNode
}

/**
 * Top-level review UI. Wraps the transport in context and routes to the
 * right page based on session_type. Both the CLI SPA and the website
 * mount this and pass their environment-specific transport.
 */
export function ReviewApp({
	transport,
	chrome,
	renderLoading,
	renderError,
}: ReviewAppProps) {
	const { session, loading, error, isConnected } = useSession(transport)
	const [title, setTitle] = useState("H\u00B7AI\u00B7K\u00B7U Review")

	useEffect(() => {
		if (!session) return
		if (session.session_type === "review" && session.intent?.title) {
			setTitle(`Review: ${session.intent.title}`)
		} else if (session.session_type === "question" && session.title) {
			setTitle(session.title)
		} else if (session.session_type === "design_direction") {
			setTitle(session.title || "Design Direction")
		}
	}, [session])

	if (loading) {
		return renderLoading ? <>{renderLoading()}</> : <DefaultLoading />
	}
	if (error || !session) {
		return renderError ? (
			<>{renderError(error ?? "Session not found")}</>
		) : (
			<DefaultError message={error ?? "The session may have expired."} />
		)
	}

	const sessionId = transport.sessionId

	const content = (
		<>
			{session.session_type === "review" && (
				<ReviewPage session={session} sessionId={sessionId} />
			)}
			{session.session_type === "question" && (
				<QuestionPage session={session} sessionId={sessionId} />
			)}
			{session.session_type === "design_direction" && (
				<DesignPicker session={session} sessionId={sessionId} />
			)}
		</>
	)

	return (
		<ReviewTransportProvider transport={transport}>
			{chrome ? chrome(content, { title, isConnected }) : content}
		</ReviewTransportProvider>
	)
}

function DefaultLoading() {
	return (
		<div className="flex min-h-screen items-center justify-center">
			<div className="text-center">
				<div className="mb-3 h-8 w-8 mx-auto animate-spin rounded-full border-2 border-stone-300 border-t-teal-500" />
				<p className="text-sm text-stone-500">Loading session\u2026</p>
			</div>
		</div>
	)
}

function DefaultError({ message }: { message: string }) {
	return (
		<div className="flex min-h-screen items-center justify-center">
			<div className="text-center">
				<p className="text-lg font-semibold text-red-600 dark:text-red-400">
					Session not found
				</p>
				<p className="mt-1 text-sm text-stone-500">{message}</p>
			</div>
		</div>
	)
}
