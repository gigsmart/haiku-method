"use client"

interface PlaybackControlsProps {
	isPlaying: boolean
	currentStep: number
	totalSteps: number
	onPlayPause: () => void
	onStepBack: () => void
	onStepForward: () => void
	onReset: () => void
}

export function PlaybackControls({
	isPlaying,
	currentStep,
	totalSteps,
	onPlayPause,
	onStepBack,
	onStepForward,
	onReset,
}: PlaybackControlsProps) {
	return (
		<div className="flex items-center justify-center gap-4 p-4 bg-stone-50 dark:bg-stone-900/50 rounded-xl">
			{/* Reset button */}
			<button
				type="button"
				onClick={onReset}
				className="p-2 rounded-lg hover:bg-stone-200 dark:hover:bg-stone-700 transition-colors"
				aria-label="Reset"
			>
				<svg
					className="w-5 h-5 text-stone-600 dark:text-stone-400"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					aria-hidden="true"
				>
					<path
						strokeLinecap="round"
						strokeLinejoin="round"
						strokeWidth={2}
						d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
					/>
				</svg>
			</button>

			{/* Step back button */}
			<button
				type="button"
				onClick={onStepBack}
				disabled={currentStep === 0}
				className="p-2 rounded-lg hover:bg-stone-200 dark:hover:bg-stone-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
				aria-label="Previous step"
			>
				<svg
					className="w-5 h-5 text-stone-600 dark:text-stone-400"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					aria-hidden="true"
				>
					<path
						strokeLinecap="round"
						strokeLinejoin="round"
						strokeWidth={2}
						d="M12.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0019 16V8a1 1 0 00-1.6-.8l-5.333 4zM4.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0011 16V8a1 1 0 00-1.6-.8l-5.334 4z"
					/>
				</svg>
			</button>

			{/* Play/Pause button */}
			<button
				type="button"
				onClick={onPlayPause}
				className="p-3 rounded-full bg-stone-900 dark:bg-white text-white dark:text-stone-900 hover:bg-stone-700 dark:hover:bg-stone-200 transition-colors"
				aria-label={isPlaying ? "Pause" : "Play"}
			>
				{isPlaying ? (
					<svg
						className="w-6 h-6"
						fill="currentColor"
						viewBox="0 0 24 24"
						aria-hidden="true"
					>
						<path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
					</svg>
				) : (
					<svg
						className="w-6 h-6"
						fill="currentColor"
						viewBox="0 0 24 24"
						aria-hidden="true"
					>
						<path d="M8 5v14l11-7z" />
					</svg>
				)}
			</button>

			{/* Step forward button */}
			<button
				type="button"
				onClick={onStepForward}
				disabled={currentStep >= totalSteps - 1}
				className="p-2 rounded-lg hover:bg-stone-200 dark:hover:bg-stone-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
				aria-label="Next step"
			>
				<svg
					className="w-5 h-5 text-stone-600 dark:text-stone-400"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					aria-hidden="true"
				>
					<path
						strokeLinecap="round"
						strokeLinejoin="round"
						strokeWidth={2}
						d="M11.933 12.8a1 1 0 000-1.6L6.6 7.2A1 1 0 005 8v8a1 1 0 001.6.8l5.333-4zM19.933 12.8a1 1 0 000-1.6l-5.333-4A1 1 0 0013 8v8a1 1 0 001.6.8l5.333-4z"
					/>
				</svg>
			</button>

			{/* Step indicator */}
			<div className="ml-4 px-3 py-1 bg-stone-200 dark:bg-stone-700 rounded-full text-sm font-medium text-stone-700 dark:text-stone-300">
				Step {currentStep + 1} of {totalSteps}
			</div>
		</div>
	)
}
