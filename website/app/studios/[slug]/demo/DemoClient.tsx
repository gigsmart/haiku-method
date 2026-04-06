"use client"

import { useEffect, useRef } from "react"

interface Props {
	slug: string
	studioName: string
	stages: string[]
}

export function DemoClient({ slug, studioName, stages }: Props) {
	const iframeRef = useRef<HTMLIFrameElement>(null)

	useEffect(() => {
		// Build the demo URL — the shell is at /haiku-demo.html with ?studio= param
		// For software, the shell has built-in steps; for others, it loads /demos/{slug}.js
		const src = slug === "software"
			? "/haiku-demo.html"
			: `/haiku-demo.html?studio=${encodeURIComponent(slug)}`

		if (iframeRef.current) {
			iframeRef.current.src = src
		}
	}, [slug])

	return (
		<div className="fixed inset-0 z-50 bg-[#0c0a09]">
			<iframe
				ref={iframeRef}
				title={`${studioName} studio demo`}
				className="h-full w-full border-0"
				allow="fullscreen"
			/>
		</div>
	)
}
