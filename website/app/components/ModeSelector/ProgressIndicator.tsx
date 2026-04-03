"use client"

interface ProgressIndicatorProps {
	current: number
	total: number
}

export function ProgressIndicator({ current, total }: ProgressIndicatorProps) {
	const percentage = Math.round((current / total) * 100)

	return (
		<div className="mb-8">
			<div className="mb-2 flex items-center justify-between text-sm text-gray-600 dark:text-gray-400">
				<span>
					Question {current} of {total}
				</span>
				<span>{percentage}% complete</span>
			</div>
			<div className="h-2 w-full rounded-full bg-gray-200 dark:bg-gray-700">
				<div
					className="h-2 rounded-full bg-gradient-to-r from-blue-600 to-purple-600 transition-all duration-300"
					style={{ width: `${percentage}%` }}
				/>
			</div>
			<div className="mt-2 flex justify-between">
				{Array.from({ length: total }, (_, i) => (
					<div
						// biome-ignore lint/suspicious/noArrayIndexKey: static array with fixed length
						key={i}
						className={`h-2 w-2 rounded-full transition-colors ${
							i < current
								? "bg-blue-600 dark:bg-blue-400"
								: "bg-gray-300 dark:bg-gray-600"
						}`}
					/>
				))}
			</div>
		</div>
	)
}
