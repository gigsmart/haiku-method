import { getChangelog } from "@/lib/changelog"
import type { Metadata } from "next"
import type { ReactNode } from "react"

const GITHUB_REPO = "https://github.com/TheBushidoCollective/ai-dlc"

export const metadata: Metadata = {
	title: "Changelog",
	description:
		"What's new in H·AI·K·U — a complete history of features, fixes, and changes.",
	openGraph: {
		title: "H·AI·K·U Changelog",
		description:
			"What's new in H·AI·K·U — a complete history of features, fixes, and changes.",
	},
}

function formatDate(dateString: string): string {
	const date = new Date(`${dateString}T00:00:00`)
	return date.toLocaleDateString("en-US", {
		year: "numeric",
		month: "long",
		day: "numeric",
	})
}

function sectionTypeColor(type: string): string {
	switch (type.toLowerCase()) {
		case "added":
			return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
		case "fixed":
			return "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400"
		case "changed":
			return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400"
		default:
			return "bg-stone-100 text-stone-800 dark:bg-stone-800 dark:text-stone-400"
	}
}

const linkClasses =
	"text-teal-600 hover:text-teal-800 dark:text-teal-400 dark:hover:text-teal-300 hover:underline"
const commitLinkClasses = `${linkClasses} font-mono text-xs`

function resolveUrl(url: string): string {
	if (url.startsWith("../../commit/")) {
		return `${GITHUB_REPO}/commit/${url.slice("../../commit/".length)}`
	}
	return url
}

function renderChangelogItem(item: string): ReactNode[] {
	const nodes: ReactNode[] = []
	// Combined pattern: markdown links [text](url) OR bare PR/issue refs #123
	const pattern = /\[([^\]]+)\]\(([^)]+)\)|(?<!\w)#(\d+)\b/g
	let lastIndex = 0
	let keyIndex = 0
	let match: RegExpExecArray | null = pattern.exec(item)

	while (match !== null) {
		// Add text before the match
		if (match.index > lastIndex) {
			nodes.push(item.slice(lastIndex, match.index))
		}

		if (match[1] !== undefined && match[2] !== undefined) {
			// Markdown link: [text](url)
			const text = match[1]
			const url = resolveUrl(match[2])
			const isCommit = match[2].includes("commit/")
			nodes.push(
				<a
					key={keyIndex++}
					href={url}
					className={isCommit ? commitLinkClasses : linkClasses}
					target="_blank"
					rel="noopener noreferrer"
				>
					{text}
				</a>,
			)
		} else if (match[3] !== undefined) {
			// Bare PR/issue reference: #123
			const num = match[3]
			nodes.push(
				<a
					key={keyIndex++}
					href={`${GITHUB_REPO}/pull/${num}`}
					className={linkClasses}
					target="_blank"
					rel="noopener noreferrer"
				>
					#{num}
				</a>,
			)
		}

		lastIndex = match.index + match[0].length
		match = pattern.exec(item)
	}

	// Add remaining text
	if (lastIndex < item.length) {
		nodes.push(item.slice(lastIndex))
	}

	return nodes
}

export default function ChangelogPage() {
	const entries = getChangelog()

	return (
		<div className="mx-auto max-w-3xl px-4 py-8 lg:py-12">
			<header className="mb-12">
				<h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
					Changelog
				</h1>
				<p className="mt-2 text-lg text-stone-600 dark:text-stone-400">
					A complete history of features, fixes, and changes in H·AI·K·U (formerly AI-DLC).
				</p>
			</header>

			{entries.length === 0 ? (
				<div className="rounded-lg border border-stone-200 bg-stone-50 p-8 text-center dark:border-stone-800 dark:bg-stone-900">
					<p className="text-stone-600 dark:text-stone-400">
						No changelog entries yet.
					</p>
				</div>
			) : (
				<div className="space-y-12">
					{entries.map((entry) => (
						<section
							key={entry.version}
							id={`v${entry.version}`}
							className="scroll-mt-24"
						>
							<div className="mb-4 flex flex-wrap items-baseline gap-3">
								<a
									href={`#v${entry.version}`}
									className="text-2xl font-bold tracking-tight hover:text-teal-600 dark:hover:text-teal-400"
								>
									v{entry.version}
								</a>
								{/* biome-ignore lint/a11y/useAnchorContent: aria-label provides accessible content */}
								<a
									href={`${GITHUB_REPO}/releases/tag/v${entry.version}`}
									className="inline-flex items-center text-stone-400 hover:text-teal-600 dark:text-stone-500 dark:hover:text-teal-400"
									target="_blank"
									rel="noopener noreferrer"
									title={`View v${entry.version} on GitHub`}
									aria-label={`View v${entry.version} on GitHub`}
								>
									<svg
										className="h-4 w-4"
										fill="currentColor"
										viewBox="0 0 16 16"
										aria-hidden="true"
									>
										<path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
									</svg>
								</a>
								<time className="text-sm text-stone-500 dark:text-stone-500">
									{formatDate(entry.date)}
								</time>
							</div>

							{entry.sections.length > 0 ? (
								<div className="space-y-4">
									{entry.sections.map((section) => (
										<div key={section.type}>
											<span
												className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${sectionTypeColor(section.type)}`}
											>
												{section.type}
											</span>
											<ul className="mt-2 space-y-1">
												{section.items.map((item, index) => (
													<li
														// biome-ignore lint/suspicious/noArrayIndexKey: changelog items have no stable unique ID
														key={index}
														className="flex gap-2 text-stone-700 dark:text-stone-300"
													>
														<span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-stone-400 dark:bg-stone-600" />
														<span>{renderChangelogItem(item)}</span>
													</li>
												))}
											</ul>
										</div>
									))}
								</div>
							) : (
								<p className="text-sm text-stone-500 dark:text-stone-500">
									No notable changes.
								</p>
							)}

							{entry !== entries[entries.length - 1] && (
								<div className="mt-8 border-b border-stone-200 dark:border-stone-800" />
							)}
						</section>
					))}
				</div>
			)}
		</div>
	)
}
