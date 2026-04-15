import { useState } from "react"

interface Props {
	errorCode: string
	sessionId: string
	onRetry: () => Promise<void>
}

/**
 * Capability-negotiation failure error card.
 * Shown when App.callServerTool throws NEGOTIATION_FAILED.
 * Offers retry with escalation on repeated failure.
 */
export function NegotiationErrorScreen({
	errorCode,
	sessionId,
	onRetry,
}: Props) {
	const [retrying, setRetrying] = useState(false)
	const [retryFailed, setRetryFailed] = useState(false)
	const [copied, setCopied] = useState(false)

	async function handleRetry() {
		setRetrying(true)
		try {
			await onRetry()
			// success — parent will unmount this component
		} catch {
			setRetrying(false)
			setRetryFailed(true)
		}
	}

	async function handleCopy() {
		try {
			await navigator.clipboard.writeText(sessionId)
			setCopied(true)
			setTimeout(() => setCopied(false), 2000)
		} catch {
			// clipboard blocked — user can manually select the text below
		}
	}

	return (
		<div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
			<div
				role="alert"
				aria-live="assertive"
				aria-atomic="true"
				className="w-full max-w-sm bg-stone-900 border border-red-700 rounded-xl p-5 flex flex-col gap-4"
			>
				{/* Icon */}
				<div className="flex justify-center">
					<div
						className="w-12 h-12 rounded-full bg-red-950/40 flex items-center justify-center"
						aria-hidden="true"
					>
						<svg
							className="w-6 h-6 text-red-400"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							aria-hidden="true"
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={2}
								d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
							/>
						</svg>
					</div>
				</div>

				{/* Heading + body */}
				<div className="text-center">
					<h2 className="text-base font-semibold text-stone-100 mb-1">
						Connection Failed
					</h2>
					<p className="text-sm text-stone-300">
						The host bridge could not negotiate a review session.
					</p>
				</div>

				{/* Error code */}
				<div className="bg-stone-950 border border-stone-800 rounded-lg px-3 py-2 text-center">
					<code className="text-xs font-mono text-red-400">{errorCode}</code>
				</div>

				{/* Retry button */}
				<button
					type="button"
					onClick={handleRetry}
					disabled={retrying}
					className="min-h-[44px] w-full px-4 py-2.5 rounded-lg text-sm font-semibold text-stone-50 bg-red-600 hover:bg-red-500 active:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-400 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
				>
					{retrying ? (
						<span className="flex items-center justify-center gap-2">
							<span
								className="w-4 h-4 border-2 border-stone-400 border-t-stone-50 rounded-full animate-spin"
								aria-hidden="true"
							/>
							Retrying…
						</span>
					) : retryFailed ? (
						"Retry failed — try again"
					) : (
						"Retry"
					)}
				</button>

				{/* Escalation panel — revealed after retry failure */}
				{retryFailed && (
					<div className="bg-stone-950 border border-stone-700 rounded-lg p-3 flex flex-col gap-2">
						<p className="text-xs text-stone-400">
							Copy the session ID to report this issue:
						</p>
						<div className="flex gap-2">
							<input
								type="text"
								readOnly
								value={sessionId}
								aria-label="Session ID for bug report"
								className="flex-1 bg-stone-900 border border-stone-700 rounded px-2 py-1 text-xs font-mono text-stone-300 focus:outline-none focus:ring-1 focus:ring-stone-500 min-h-[44px]"
							/>
							<button
								type="button"
								onClick={handleCopy}
								className="min-h-[44px] min-w-[44px] px-3 text-xs font-medium text-stone-300 bg-stone-800 hover:bg-stone-700 rounded transition-colors"
								aria-label="Copy session ID"
							>
								{copied ? "Copied" : "Copy"}
							</button>
						</div>
					</div>
				)}
			</div>
		</div>
	)
}
