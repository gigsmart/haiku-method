export type BridgeStatus = "connected" | "reconnecting" | "error"

interface Props {
	status: BridgeStatus
	onRetry?: () => void
}

/**
 * Status pill showing the MCP Apps host-bridge connection state.
 * Uses aria-live="polite" for connected/reconnecting transitions
 * and aria-live="assertive" for error state.
 */
export function HostBridgeStatus({ status, onRetry }: Props) {
	const isError = status === "error"

	return (
		<output
			aria-live={isError ? "assertive" : "polite"}
			aria-atomic="true"
			className="flex items-center"
		>
			{status === "connected" && (
				<span className="flex items-center gap-1.5 text-xs text-teal-400">
					<span
						className="inline-block w-1.5 h-1.5 rounded-full bg-teal-500"
						aria-hidden="true"
					/>
					Connected
				</span>
			)}

			{status === "reconnecting" && (
				<span className="flex items-center gap-1.5 text-xs text-amber-400">
					<span
						className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"
						aria-hidden="true"
					/>
					Reconnecting
				</span>
			)}

			{status === "error" && (
				<button
					type="button"
					onClick={onRetry}
					className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 transition-colors min-h-[44px] min-w-[44px] px-2"
					aria-label="Connection error — click to retry"
				>
					<span
						className="inline-block w-1.5 h-1.5 rounded-full bg-red-500"
						aria-hidden="true"
					/>
					Error · retry
				</button>
			)}
		</output>
	)
}
