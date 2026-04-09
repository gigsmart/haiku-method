"use client"

import { useState } from "react"
import Link from "next/link"

export default function Error({
	error,
	reset,
}: {
	error: Error & { digest?: string }
	reset: () => void
}) {
	const [showDetails, setShowDetails] = useState(false)

	return (
		<div className="flex min-h-[60vh] flex-col items-center justify-center px-4">
			<div className="mx-auto max-w-md text-center">
				{/* Branding */}
				<h2 className="mb-2 text-sm font-bold tracking-widest text-teal-600 dark:text-teal-400">
					H·AI·K·U
				</h2>

				{/* Error heading */}
				<h1 className="mb-3 text-3xl font-bold tracking-tight text-stone-900 dark:text-stone-100">
					Something went wrong
				</h1>
				<p className="mb-8 text-stone-600 dark:text-stone-400">
					An unexpected error occurred while loading this page.
				</p>

				{/* Actions */}
				<div className="flex items-center justify-center gap-4">
					<button
						onClick={reset}
						className="rounded-lg bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-500"
					>
						Try Again
					</button>
					<Link
						href="/"
						className="rounded-lg border border-stone-300 px-5 py-2.5 text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:bg-stone-50 dark:border-stone-600 dark:text-stone-300 dark:hover:border-stone-500 dark:hover:bg-stone-800"
					>
						Go Home
					</Link>
				</div>

				{/* Collapsible error details */}
				<div className="mt-8">
					<button
						onClick={() => setShowDetails(!showDetails)}
						className="text-xs text-stone-400 transition hover:text-stone-600 dark:hover:text-stone-300"
					>
						{showDetails ? "Hide" : "Show"} Error Details
					</button>
					{showDetails && (
						<div className="mt-3 rounded-lg border border-stone-200 bg-stone-50 p-4 text-left dark:border-stone-700 dark:bg-stone-900">
							<pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-xs text-stone-600 dark:text-stone-400">
								{error.message}
							</pre>
							{error.digest && (
								<p className="mt-2 font-mono text-[10px] text-stone-400">
									Digest: {error.digest}
								</p>
							)}
						</div>
					)}
				</div>
			</div>
		</div>
	)
}
