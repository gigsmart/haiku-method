/** Shown after the browser fails to auto-close the tab */
export function SubmitSuccess({ message }: { message: string }) {
	return (
		<div className="flex min-h-[40vh] items-center justify-center">
			<div className="text-center">
				<div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
					<svg
						className="h-8 w-8 text-green-600 dark:text-green-400"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						aria-hidden="true"
					>
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth={2}
							d="M5 13l4 4L19 7"
						/>
					</svg>
				</div>
				<p className="text-lg font-semibold text-green-800 dark:text-green-200">
					{message}
				</p>
				<p className="mt-1 text-sm text-stone-500">You can close this tab.</p>
			</div>
		</div>
	)
}
