"use client"

import Link from "next/link"

interface MegaMenuPreviewProps {
	title: string
	description: string
	href: string
	image?: string
	onItemClick?: () => void
}

export function MegaMenuPreview({
	title,
	description,
	href,
	onItemClick,
}: MegaMenuPreviewProps) {
	return (
		<Link
			href={href}
			onClick={onItemClick}
			className="group flex flex-col rounded-xl bg-gradient-to-br from-blue-50 to-purple-50 p-5 transition hover:from-blue-100 hover:to-purple-100 dark:from-blue-950/50 dark:to-purple-950/50 dark:hover:from-blue-950 dark:hover:to-purple-950"
		>
			<div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-purple-500 text-white">
				<svg
					className="h-5 w-5"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					aria-hidden="true"
				>
					<path
						strokeLinecap="round"
						strokeLinejoin="round"
						strokeWidth={2}
						d="M13 10V3L4 14h7v7l9-11h-7z"
					/>
				</svg>
			</div>
			<h4 className="mb-1 font-semibold text-gray-900 dark:text-white">
				{title}
			</h4>
			<p className="mb-3 flex-1 text-sm text-gray-600 dark:text-gray-400">
				{description}
			</p>
			<span className="inline-flex items-center text-sm font-medium text-blue-600 group-hover:text-blue-700 dark:text-blue-400 dark:group-hover:text-blue-300">
				Get started
				<svg
					className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-1"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					aria-hidden="true"
				>
					<path
						strokeLinecap="round"
						strokeLinejoin="round"
						strokeWidth={2}
						d="M13 7l5 5m0 0l-5 5m5-5H6"
					/>
				</svg>
			</span>
		</Link>
	)
}
