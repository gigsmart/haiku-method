"use client"

import { useEffect, useState } from "react"
import Link from "next/link"

export default function NotFound() {
	const [redirecting, setRedirecting] = useState(false)

	useEffect(() => {
		const path = window.location.pathname
		if (path.startsWith("/browse/") && path !== "/browse/") {
			setRedirecting(true)
			sessionStorage.setItem("browse-redirect-path", path + window.location.search)
			window.location.replace("/browse/")
		}
	}, [])

	if (redirecting) return null

	return (
		<div className="flex min-h-[60vh] flex-col items-center justify-center px-4">
			<h1 className="mb-2 text-6xl font-bold text-stone-300 dark:text-stone-700">404</h1>
			<p className="mb-6 text-lg text-stone-600 dark:text-stone-400">This page could not be found.</p>
			<Link
				href="/"
				className="rounded-lg bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-500"
			>
				Go Home
			</Link>
		</div>
	)
}
