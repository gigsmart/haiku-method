/**
 * SessionEndedOverlay — full-viewport terminal state shown when the
 * review SPA's WebSocket is closed by the server (MCP process exited,
 * the tunnel dropped, or the user revoked the review session).
 *
 * Browsers only honor `window.close()` on tabs opened via
 * `window.open()` from a script. Review sessions open in the OS
 * browser from a URL the MCP printed, so `window.close()` is a no-op
 * for us. We try it once as a best-effort, then surface a clear
 * "safe to close" state with the OS-appropriate keyboard shortcut —
 * no fake countdown that promises a close we can't deliver.
 */

import { useEffect, useState } from "react"

export interface SessionEndedOverlayProps {
	/** Optional reason shown under the headline (e.g. "Review server stopped"). */
	reason?: string
}

function closeShortcut(): string {
	if (typeof navigator === "undefined") return "Ctrl+W"
	return /Mac|iPhone|iPad/i.test(navigator.userAgent) ? "⌘W" : "Ctrl+W"
}

export function SessionEndedOverlay({
	reason,
}: SessionEndedOverlayProps): React.ReactElement {
	const [tried, setTried] = useState(false)

	useEffect(() => {
		if (tried) return
		setTried(true)
		try {
			window.close()
		} catch {
			/* Browser blocked the close — expected on tabs we didn't open. */
		}
	}, [tried])

	const shortcut = closeShortcut()

	return (
		<div
			role="dialog"
			aria-modal="true"
			aria-label="Session ended"
			className="fixed inset-0 z-[100] flex items-center justify-center bg-stone-900/90 backdrop-blur-sm text-stone-100 p-6"
		>
			<div className="max-w-md w-full rounded-lg bg-stone-800 border border-stone-700 p-6 shadow-2xl space-y-4 text-center">
				<div>
					<h1 className="text-lg font-semibold">Session ended</h1>
					<p className="mt-1 text-sm text-stone-300">
						{reason ?? "The review server closed the connection."}
					</p>
				</div>
				<p className="text-sm text-stone-300">
					Close this tab when you're ready —{" "}
					<kbd className="inline-block px-1.5 py-0.5 text-[11px] font-mono rounded border border-stone-600 bg-stone-900 text-stone-100">
						{shortcut}
					</kbd>
					.
				</p>
			</div>
		</div>
	)
}
