"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { handleOAuthCallback } from "@/lib/browse/auth"

export function CallbackClient({ provider }: { provider: string }) {
	const [status, setStatus] = useState<"processing" | "success" | "error">("processing")
	const [error, setError] = useState("")
	const [returnPath, setReturnPath] = useState("/browse/")

	useEffect(() => {
		async function process() {
			const result = await handleOAuthCallback(provider)
			setReturnPath(result.returnPath)

			if (result.success) {
				setStatus("success")
				setTimeout(() => {
					window.location.href = result.returnPath
				}, 1000)
			} else {
				setStatus("error")
				setError(result.error || "Authentication failed")
			}
		}

		process()
	}, [provider])

	return (
		<div className="mx-auto max-w-md px-4 py-20 text-center">
			{status === "processing" && (
				<>
					<div className="mb-4">
						<svg className="mx-auto h-12 w-12 animate-spin text-teal-500" fill="none" viewBox="0 0 24 24">
							<circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
							<path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
						</svg>
					</div>
					<h1 className="text-xl font-bold">Completing authentication...</h1>
				</>
			)}

			{status === "success" && (
				<>
					<div className="mb-4 text-green-500">
						<svg className="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
						</svg>
					</div>
					<h1 className="mb-2 text-xl font-bold">Authenticated</h1>
					<p className="text-stone-500">Redirecting...</p>
				</>
			)}

			{status === "error" && (
				<>
					<div className="mb-4 text-red-500">
						<svg className="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
						</svg>
					</div>
					<h1 className="mb-2 text-xl font-bold">Authentication Failed</h1>
					<p className="mb-4 text-sm text-red-600 dark:text-red-400">{error}</p>
					<div className="flex justify-center gap-3">
						<Link
							href={returnPath}
							className="rounded-lg border border-stone-300 px-4 py-2 text-sm text-stone-700 hover:bg-stone-50 dark:border-stone-700 dark:text-stone-300"
						>
							Try again
						</Link>
						<Link
							href="/browse/"
							className="rounded-lg bg-teal-600 px-4 py-2 text-sm text-white hover:bg-teal-700"
						>
							Back to Browse
						</Link>
					</div>
				</>
			)}
		</div>
	)
}
