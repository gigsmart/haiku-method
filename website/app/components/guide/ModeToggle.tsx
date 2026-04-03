"use client"

interface ModeToggleProps {
	mode: "story" | "reference"
	onChange: (mode: "story" | "reference") => void
}

export function ModeToggle({ mode, onChange }: ModeToggleProps) {
	return (
		<div className="inline-flex gap-0 rounded-full border border-stone-200 bg-stone-50 p-1 dark:border-stone-700 dark:bg-stone-900">
			<button
				type="button"
				onClick={() => onChange("story")}
				className={`rounded-full px-5 py-2 text-sm font-semibold transition-all ${
					mode === "story"
						? "bg-gradient-to-r from-blue-500 to-amber-400 text-white shadow-sm"
						: "text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100"
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
						: "text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100"
				}`}
			>
				Full Reference
			</button>
		</div>
	)
}
