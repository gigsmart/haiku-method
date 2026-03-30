"use client"

interface ModeToggleProps {
	mode: "story" | "reference"
	onChange: (mode: "story" | "reference") => void
}

export function ModeToggle({ mode, onChange }: ModeToggleProps) {
	return (
		<div className="inline-flex gap-0 rounded-full border border-gray-200 bg-gray-50 p-1 dark:border-gray-700 dark:bg-gray-900">
			<button
				type="button"
				onClick={() => onChange("story")}
				className={`rounded-full px-5 py-2 text-sm font-semibold transition-all ${
					mode === "story"
						? "bg-gradient-to-r from-blue-500 to-amber-400 text-white shadow-sm"
						: "text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
				}`}
			>
				Story Mode
			</button>
			<button
				type="button"
				onClick={() => onChange("reference")}
				className={`rounded-full px-5 py-2 text-sm font-semibold transition-all ${
					mode === "reference"
						? "bg-gradient-to-r from-blue-500 to-amber-400 text-white shadow-sm"
						: "text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
				}`}
			>
				Full Reference
			</button>
		</div>
	)
}
