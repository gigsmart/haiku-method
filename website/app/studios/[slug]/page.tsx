import { getAllStudios, getStudioBySlug } from "@/lib/studios"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import ReactMarkdown from "react-markdown"
import rehypeSlug from "rehype-slug"
import remarkGfm from "remark-gfm"

interface Props {
	params: Promise<{ slug: string }>
}

export async function generateStaticParams() {
	const studios = getAllStudios()
	return studios.map((s) => ({ slug: s.slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { slug } = await params
	const studio = getStudioBySlug(slug)
	if (!studio) return { title: "Not Found" }
	return {
		title: `${titleCase(studio.name)} Studio - H\u00b7AI\u00b7K\u00b7U`,
		description: studio.description,
	}
}

function titleCase(s: string): string {
	return s
		.split("-")
		.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
		.join(" ")
}

const reviewBadge: Record<string, { label: string; color: string }> = {
	auto: { label: "Auto", color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
	ask: { label: "Ask", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
	external: { label: "External", color: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400" },
	"external, ask": { label: "External / Ask", color: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400" },
	await: { label: "Await", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
}

export default async function StudioDetailPage({ params }: Props) {
	const { slug } = await params
	const studio = getStudioBySlug(slug)
	if (!studio) notFound()

	return (
		<div className="mx-auto max-w-5xl px-4 py-8 lg:py-12">
			{/* Breadcrumb */}
			<nav className="mb-6 text-sm text-stone-500 dark:text-stone-400">
				<Link href="/studios/" className="hover:text-stone-900 dark:hover:text-white">
					Studios
				</Link>
				<span className="mx-2">/</span>
				<span className="text-stone-900 dark:text-white">{titleCase(studio.name)}</span>
			</nav>

			{/* Header */}
			<header className="mb-10">
				<div className="mb-2 text-xs font-medium uppercase tracking-wider text-stone-400">
					{studio.category}
				</div>
				<h1 className="mb-3 text-4xl font-bold tracking-tight">
					{titleCase(studio.name)} Studio
				</h1>
				<p className="text-lg text-stone-600 dark:text-stone-400">
					{studio.description}
				</p>
				<div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-stone-500 dark:text-stone-400">
					<span>
						<strong className="text-stone-700 dark:text-stone-300">{studio.stages.length}</strong> stages
					</span>
					<span>
						<strong className="text-stone-700 dark:text-stone-300">
							{studio.stageDefinitions.reduce((acc, s) => acc + s.hatDefinitions.length, 0)}
						</strong>{" "}
						hats
					</span>
					<span>
						<strong className="text-stone-700 dark:text-stone-300">
							{studio.stageDefinitions.reduce((acc, s) => acc + s.reviewAgentDefinitions.length, 0)}
						</strong>{" "}
						review agents
					</span>
					<span>
						Persistence: <strong className="text-stone-700 dark:text-stone-300">{studio.persistence.type}</strong>
					</span>
					<span>
						Delivery: <strong className="text-stone-700 dark:text-stone-300">{studio.persistence.delivery}</strong>
					</span>
				</div>
				<div className="mt-6">
					<a
						href={slug === "software" ? "/haiku-demo.html" : `/haiku-demo-${slug}.html`}
						target="_blank"
						rel="noopener noreferrer"
						className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600"
					>
						<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
						</svg>
						Simulate a Session
					</a>
				</div>
			</header>

			{/* Pipeline Visualization */}
			<section className="mb-12">
				<h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-stone-400">
					Stage Pipeline
				</h2>
				<div className="flex flex-wrap items-center gap-1">
					{studio.stageDefinitions.map((stage, i) => {
						const badge = reviewBadge[stage.review] || reviewBadge.ask
						return (
							<div key={stage.name} className="flex items-center">
								<Link
									href={`/studios/${slug}/${stage.name}/`}
									className="group rounded-lg border border-stone-200 bg-white px-4 py-3 transition hover:border-teal-300 hover:shadow-sm dark:border-stone-700 dark:bg-stone-900 dark:hover:border-teal-700"
								>
									<div className="text-sm font-semibold text-stone-900 group-hover:text-teal-600 dark:text-stone-100 dark:group-hover:text-teal-400">
										{titleCase(stage.name)}
									</div>
									<div className="mt-1 flex items-center gap-2">
										<span className="text-xs text-stone-400">
											{stage.hats.length} hat{stage.hats.length !== 1 ? "s" : ""}
										</span>
										{stage.reviewAgentDefinitions.length > 0 && (
											<span className="text-xs text-teal-500 dark:text-teal-400">
												{stage.reviewAgentDefinitions.length} agent{stage.reviewAgentDefinitions.length !== 1 ? "s" : ""}
											</span>
										)}
										<span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${badge.color}`}>
											{badge.label}
										</span>
									</div>
								</Link>
								{i < studio.stageDefinitions.length - 1 && (
									<svg
										className="mx-1 h-4 w-4 flex-shrink-0 text-stone-300 dark:text-stone-600"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
										aria-hidden="true"
									>
										<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
									</svg>
								)}
							</div>
						)
					})}
				</div>
			</section>

			{/* Stage Details */}
			<section className="space-y-8">
				<h2 className="text-sm font-semibold uppercase tracking-wider text-stone-400">
					Stage Details
				</h2>
				{studio.stageDefinitions.map((stage) => {
					const badge = reviewBadge[stage.review] || reviewBadge.ask
					return (
						<div
							key={stage.name}
							id={stage.name}
							className="rounded-xl border border-stone-200 dark:border-stone-700"
						>
							<div className="border-b border-stone-200 px-6 py-4 dark:border-stone-700">
								<div className="flex items-center gap-3">
									<Link
										href={`/studios/${slug}/${stage.name}/`}
										className="text-xl font-bold text-stone-900 hover:text-teal-600 dark:text-stone-100 dark:hover:text-teal-400"
									>
										{titleCase(stage.name)}
									</Link>
									<span className={`rounded px-2 py-0.5 text-xs font-medium ${badge.color}`}>
										{badge.label} review
									</span>
								</div>
								<p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
									{stage.description}
								</p>
							</div>

							{/* Hats */}
							<div className="px-6 py-4">
								<h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-stone-400">
									Hats
								</h4>
								<div className="grid gap-3 sm:grid-cols-2">
									{stage.hatDefinitions.map((hat) => {
										// Extract focus line from content
										const focusMatch = hat.content.match(/\*\*Focus:\*\*\s*(.+?)(?:\n|$)/)
										const focus = focusMatch ? focusMatch[1].trim() : ""
										return (
											<div
												key={hat.name}
												className="rounded-lg border border-stone-100 bg-stone-50 px-4 py-3 dark:border-stone-800 dark:bg-stone-900/50"
											>
												<div className="text-sm font-semibold text-stone-900 dark:text-stone-100">
													{titleCase(hat.name)}
												</div>
												{focus && (
													<p className="mt-1 text-xs text-stone-500 dark:text-stone-400 line-clamp-2">
														{focus}
													</p>
												)}
											</div>
										)
									})}
								</div>
							</div>

							{/* Review Agents */}
							{(stage.reviewAgentDefinitions.length > 0 || stage.reviewAgentsInclude.length > 0) && (
								<div className="border-t border-stone-100 px-6 py-4 dark:border-stone-800">
									<h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-stone-400">
										Review Agents
									</h4>
									<div className="grid gap-3 sm:grid-cols-2">
										{stage.reviewAgentDefinitions.map((agent) => {
											const mandateMatch = agent.content.match(/\*\*Mandate:\*\*\s*(.+?)(?:\n|$)/)
											const mandate = mandateMatch ? mandateMatch[1].trim() : ""
											return (
												<div
													key={agent.name}
													className="rounded-lg border border-teal-100 bg-teal-50/50 px-4 py-3 dark:border-teal-900/50 dark:bg-teal-900/20"
												>
													<div className="text-sm font-semibold text-stone-900 dark:text-stone-100">
														{titleCase(agent.name)}
													</div>
													{mandate && (
														<p className="mt-1 text-xs text-stone-500 dark:text-stone-400 line-clamp-2">
															{mandate}
														</p>
													)}
												</div>
											)
										})}
										{stage.reviewAgentsInclude.map((inc) =>
											inc.agents.map((agentName) => (
												<div
													key={`${inc.stage}-${agentName}`}
													className="rounded-lg border border-stone-100 border-dashed bg-stone-50/50 px-4 py-3 dark:border-stone-800 dark:bg-stone-900/30"
												>
													<div className="text-sm font-semibold text-stone-600 dark:text-stone-300">
														{titleCase(agentName)}
													</div>
													<p className="mt-1 text-xs text-stone-400">
														from {titleCase(inc.stage)} stage
													</p>
												</div>
											)),
										)}
									</div>
								</div>
							)}

							{/* Inputs */}
							{stage.inputs.length > 0 && (
								<div className="border-t border-stone-100 px-6 py-3 dark:border-stone-800">
									<span className="text-xs text-stone-400">
										Requires:{" "}
										{stage.inputs.map((inp, i) => (
											<span key={`${inp.stage}-${inp.output}`}>
												{i > 0 && ", "}
												<span className="font-medium text-stone-600 dark:text-stone-300">
													{inp.output}
												</span>
												<span className="text-stone-400"> from {titleCase(inp.stage)}</span>
											</span>
										))}
									</span>
								</div>
							)}
						</div>
					)
				})}
			</section>

			{/* Studio Body Content */}
			{studio.content && (
				<section className="mt-12">
					<div className="prose prose-gray dark:prose-invert max-w-none">
						<ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSlug]}>
							{studio.content}
						</ReactMarkdown>
					</div>
				</section>
			)}

			{/* Navigation */}
			<footer className="mt-12 flex items-center justify-between border-t border-stone-200 pt-8 dark:border-stone-800">
				<Link
					href="/studios/"
					className="text-sm text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-white"
				>
					&larr; All Studios
				</Link>
				<Link
					href="/docs/customization/"
					className="text-sm text-teal-600 hover:text-teal-700 dark:text-teal-400 dark:hover:text-teal-300"
				>
					Customize this studio &rarr;
				</Link>
			</footer>
		</div>
	)
}
