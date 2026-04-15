import { useState } from "react"

const RECOVERY_TEXT = "Please generate a new review link"

interface Props {
	errorCode: string
}

/**
 * Session-expired error card.
 * The JWT-derived session has become stale.
 * Offers copy-to-clipboard of a recovery phrase.
 * No window.open, no browser-tab assumptions.
 */
export function SessionExpiredScreen({ errorCode }: Props) {
	const [copied, setCopied] = useState(false)
	const [showTextarea, setShowTextarea] = useState(false)

	async function handleCopy() {
		try {
			await navigator.clipboard.writeText(RECOVERY_TEXT)
			setCopied(true)
			setTimeout(() => setCopied(false), 2000)
		} catch {
			// Clipboard blocked — reveal textarea for manual copy
			setShowTextarea(true)
		}
	}

	return (
		<div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
			<div
				role="alert"
				aria-live="assertive"
				aria-atomic="true"
				className="w-full max-w-sm bg-stone-900 border border-stone-800 rounded-xl p-5 flex flex-col gap-4"
			>
				{/* Icon */}
				<div className="flex justify-center">
					<div
						className="w-12 h-12 rounded-full bg-stone-800 flex items-center justify-center"
						aria-hidden="true"
					>
						<svg
							className="w-6 h-6 text-stone-400"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							aria-hidden="true"
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={2}
								d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
							/>
						</svg>
					</div>
				</div>

				<div className="text-center">
					<h2 className="text-base font-semibold text-stone-100 mb-1">
						Session Expired
					</h2>
					<p className="text-sm text-stone-300">
						This review session has expired. Ask Claude Code to generate a new
						review link.
					</p>
				</div>

				{/* Error code */}
				<div className="bg-stone-950 border border-stone-800 rounded-lg px-3 py-2 text-center">
					<code className="text-xs font-mono text-stone-400">{errorCode}</code>
				</div>

				{/* Recovery action */}
				<div className="flex flex-col gap-2">
					<p className="text-xs text-stone-500">
						Copy this message to send to Claude Code:
					</p>
					{showTextarea ? (
						<textarea
							readOnly
							value={RECOVERY_TEXT}
							aria-label="Recovery phrase — select to copy"
							rows={2}
							className="w-full bg-stone-950 border border-stone-700 rounded px-2 py-1.5 text-sm text-stone-300 font-medium resize-none focus:outline-none focus:ring-1 focus:ring-stone-500"
						/>
					) : (
						<button
							type="button"
							onClick={handleCopy}
							className="min-h-[44px] w-full px-4 py-2.5 rounded-lg text-sm font-semibold text-stone-100 bg-stone-700 hover:bg-stone-600 active:bg-stone-800 focus:outline-none focus:ring-2 focus:ring-stone-500 transition-colors"
						>
							{copied
								? "Copied!"
								: "\u{1F4CB} Copy \u201CPlease generate a new review link\u201D"}
						</button>
					)}
				</div>
			</div>
		</div>
	)
}
