"use client"

import * as Sentry from "@sentry/nextjs"
import { useEffect, useState } from "react"

export default function GlobalError({
	error,
	reset,
}: {
	error: Error & { digest?: string }
	reset: () => void
}) {
	const [showDetails, setShowDetails] = useState(false)

	useEffect(() => {
		Sentry.captureException(error)
	}, [error])

	return (
		<html lang="en">
			<body style={{ margin: 0, fontFamily: "system-ui, -apple-system, sans-serif", backgroundColor: "#fafaf9", color: "#1c1917", display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center" }}>
				<div style={{ maxWidth: "28rem", padding: "1rem", textAlign: "center" }}>
					<h2 style={{ fontSize: "0.875rem", fontWeight: 700, letterSpacing: "0.1em", color: "#0d9488", marginBottom: "0.5rem" }}>
						H·AI·K·U
					</h2>
					<h1 style={{ fontSize: "1.875rem", fontWeight: 700, marginBottom: "0.75rem" }}>
						Something went wrong
					</h1>
					<p style={{ color: "#57534e", marginBottom: "2rem" }}>
						An unexpected error occurred. The error has been reported.
					</p>
					<div style={{ display: "flex", gap: "1rem", justifyContent: "center" }}>
						<button
							onClick={reset}
							style={{ backgroundColor: "#0d9488", color: "white", border: "none", borderRadius: "0.5rem", padding: "0.625rem 1.25rem", fontSize: "0.875rem", fontWeight: 600, cursor: "pointer" }}
						>
							Try Again
						</button>
						<a
							href="/"
							style={{ border: "1px solid #d6d3d1", borderRadius: "0.5rem", padding: "0.625rem 1.25rem", fontSize: "0.875rem", fontWeight: 600, color: "#44403c", textDecoration: "none" }}
						>
							Go Home
						</a>
					</div>
					<div style={{ marginTop: "2rem" }}>
						<button
							onClick={() => setShowDetails(!showDetails)}
							style={{ background: "none", border: "none", fontSize: "0.75rem", color: "#a8a29e", cursor: "pointer" }}
						>
							{showDetails ? "Hide" : "Show"} Error Details
						</button>
						{showDetails && (
							<div style={{ marginTop: "0.75rem", border: "1px solid #e7e5e4", borderRadius: "0.5rem", backgroundColor: "#f5f5f4", padding: "1rem", textAlign: "left" }}>
								<pre style={{ margin: 0, fontFamily: "monospace", fontSize: "0.75rem", color: "#57534e", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
									{error.message}
								</pre>
								{error.digest && (
									<p style={{ marginTop: "0.5rem", fontFamily: "monospace", fontSize: "0.625rem", color: "#a8a29e" }}>
										Digest: {error.digest}
									</p>
								)}
							</div>
						)}
					</div>
				</div>
			</body>
		</html>
	)
}
