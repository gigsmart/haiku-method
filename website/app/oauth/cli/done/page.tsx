// Terminal page of the CLI OAuth flow. The callback has already handed the
// token to the broker's /cli/complete; the polling CLI will pick it up. Nothing
// to do here but tell the human they can close the tab.
export default function CliDonePage() {
	return (
		<div className="mx-auto max-w-md px-4 py-20 text-center">
			<div className="mb-4 text-green-500">
				<svg
					className="mx-auto h-12 w-12"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					role="img"
					aria-label="Success"
				>
					<title>Success</title>
					<path
						strokeLinecap="round"
						strokeLinejoin="round"
						strokeWidth={2}
						d="M5 13l4 4L19 7"
					/>
				</svg>
			</div>
			<h1 className="mb-2 text-xl font-bold">You're signed in</h1>
			<p className="text-stone-500">
				The H·AI·K·U CLI has your authorization. You can close this tab and
				return to your terminal.
			</p>
		</div>
	)
}
