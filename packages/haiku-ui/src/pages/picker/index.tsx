/**
 * PickerPageModule — per-route wrapper for /picker/:sessionId.
 *
 * Same shape as DirectionPageModule + QuestionPageModule: useSession
 * fetch + useSessionWebSocket subscription + document-title sync.
 * Wraps SessionShell around PickerPage.
 */

import { useEffect } from "react"
import { useSession, useSessionWebSocket } from "../../hooks/useSession"
import { SessionShell } from "../../shell/SessionShell"
import { PickerPage } from "./PickerPage"

export interface PickerPageModuleProps {
	sessionId: string
}

const KIND_LABELS: Record<string, string> = {
	studio: "Pick studio",
	mode: "Pick mode",
	stage: "Pick stage",
	confirm: "Confirm",
}

export function PickerPageModule({
	sessionId,
}: PickerPageModuleProps): React.ReactElement {
	const { session, loading, error } = useSession(sessionId)
	useSessionWebSocket(sessionId)

	const dynamicTitle =
		session && session.session_type === "picker" && session.title
			? session.title
			: null

	useEffect(() => {
		if (dynamicTitle) document.title = dynamicTitle
	}, [dynamicTitle])

	if (loading) {
		return (
			<SessionShell kind="Picker">
				<div className="flex min-h-[40vh] items-center justify-center">
					<div className="text-center">
						<div className="mb-3 h-8 w-8 mx-auto animate-spin rounded-full border-2 border-stone-300 border-t-teal-500" />
						<p className="text-sm text-stone-600 dark:text-stone-300">
							Loading picker…
						</p>
					</div>
				</div>
			</SessionShell>
		)
	}

	if (error || !session) {
		return (
			<SessionShell kind="Picker">
				<div className="flex min-h-[40vh] items-center justify-center">
					<div className="text-center">
						<p className="text-lg font-semibold text-red-600 dark:text-red-400">
							Session not found
						</p>
						<p className="mt-1 text-sm text-stone-600 dark:text-stone-300">
							{error || "The picker session may have expired."}
						</p>
					</div>
				</div>
			</SessionShell>
		)
	}

	if (session.session_type !== "picker") {
		return (
			<SessionShell kind="Picker">
				<div className="flex min-h-[40vh] items-center justify-center">
					<p className="text-sm text-stone-600 dark:text-stone-300">
						Session type mismatch (expected picker).
					</p>
				</div>
			</SessionShell>
		)
	}

	return (
		<SessionShell
			kind={KIND_LABELS[session.kind] ?? "Picker"}
			title={dynamicTitle ?? undefined}
		>
			<PickerPage session={session} sessionId={sessionId} />
		</SessionShell>
	)
}
