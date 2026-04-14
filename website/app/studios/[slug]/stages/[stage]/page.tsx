import { getAllStudios, getStudioBySlug } from "@/lib/studios"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import ReactMarkdown from "react-markdown"
import rehypeSlug from "rehype-slug"
import remarkGfm from "remark-gfm"

interface Props {
	params: Promise<{ slug: string; stage: string }>
}

export async function generateStaticParams() {
	const studios = getAllStudios()
	const params: Array<{ slug: string; stage: string }> = []
	for (const studio of studios) {
		for (const stage of studio.stageDefinitions) {
			params.push({ slug: studio.slug, stage: stage.name })
		}
	}
	return params
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { slug, stage: stageName } = await params
	const studio = getStudioBySlug(slug)
	const stage = studio?.stageDefinitions.find((s) => s.name === stageName)
	if (!studio || !stage) return { title: "Not Found" }
	return {
		title: `${titleCase(stage.name)} - ${titleCase(studio.name)} Studio - H\u00b7AI\u00b7K\u00b7U`,
		description: stage.description,
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

export default async function StageDetailPage({ params }: Props) {
	const { slug, stage: stageName } = await params
	const studio = getStudioBySlug(slug)
	if (!studio) notFound()

	const stageIndex = studio.stageDefinitions.findIndex((s) => s.name === stageName)
	const stage = studio.stageDefinitions[stageIndex]
	if (!stage) notFound()

	const prevStage = stageIndex > 0 ? studio.stageDefinitions[stageIndex - 1] : null
	const nextStage = stageIndex < studio.stageDefinitions.length - 1 ? studio.stageDefinitions[stageIndex + 1] : null
	const badge = reviewBadge[stage.review] || reviewBadge.ask

	return (
		<div className="mx-auto max-w-4xl px-4 py-8 lg:py-12">
			{/* Breadcrumb */}
			<nav className="mb-6 text-sm text-stone-500 dark:text-stone-400">
				<Link href="/studios/" className="hover:text-stone-900 dark:hover:text-white">
					Studios
				</Link>
				<span className="mx-2">/</span>
				<Link href={`/studios/${slug}/`} className="hover:text-stone-900 dark:hover:text-white">
					{titleCase(studio.name)}
				</Link>
				<span className="mx-2">/</span>
				<span className="text-stone-900 dark:text-white">{titleCase(stage.name)}</span>
			</nav>

			{/* Header */}
			<header className="mb-10">
				<div className="flex items-center gap-3">
					<h1 className="text-4xl font-bold tracking-tight">
						{titleCase(stage.name)}
					</h1>
					<span className={`rounded px-2.5 py-1 text-xs font-medium ${badge.color}`}>
						{badge.label} review
					</span>
				</div>
				<p className="mt-2 text-lg text-stone-600 dark:text-stone-400">
					{stage.description}
				</p>
			</header>

			{/* Quick Facts */}
			<section className="mb-10 grid grid-cols-2 gap-4 sm:grid-cols-5">
				<div className="rounded-lg border border-stone-200 p-4 dark:border-stone-700">
					<div className="text-xs font-medium uppercase tracking-wider text-stone-400">
						Hats
					</div>
					<div className="mt-1 text-2xl font-bold">{stage.hatDefinitions.length}</div>
				</div>
				<div className="rounded-lg border border-stone-200 p-4 dark:border-stone-700">
					<div className="text-xs font-medium uppercase tracking-wider text-stone-400">
						Review Agents
					</div>
					<div className="mt-1 text-2xl font-bold">
						{stage.reviewAgentDefinitions.length}
						{stage.reviewAgentsInclude.length > 0 && (
							<span className="text-sm font-normal text-stone-400">
								{" "}+{stage.reviewAgentsInclude.reduce((acc: number, i: { agents: string[] }) => acc + i.agents.length, 0)}
							</span>
						)}
					</div>
				</div>
				<div className="rounded-lg border border-stone-200 p-4 dark:border-stone-700">
					<div className="text-xs font-medium uppercase tracking-wider text-stone-400">
						Review
					</div>
					<div className="mt-1 text-lg font-semibold">{titleCase(stage.review)}</div>
				</div>
				<div className="rounded-lg border border-stone-200 p-4 dark:border-stone-700">
					<div className="text-xs font-medium uppercase tracking-wider text-stone-400">
						Inputs
					</div>
					<div className="mt-1 text-sm font-medium">
						{stage.inputs.length > 0
							? stage.inputs.map((i) => titleCase(i.stage)).join(", ")
							: "None"}
					</div>
				</div>
			</section>

			{/* Input Dependencies */}
			{stage.inputs.length > 0 && (
				<section className="mb-10">
					<h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-stone-400">
						Dependencies
					</h2>
					<div className="space-y-2">
						{stage.inputs.map((inp) => (
							<div
								key={`${inp.stage}-${inp.output}`}
								className="flex items-center gap-2 rounded-lg border border-stone-200 px-4 py-2 dark:border-stone-700"
							>
								<Link
									href={`/studios/${slug}/stages/${inp.stage}/`}
									className="font-medium text-teal-600 hover:text-teal-700 dark:text-teal-400"
								>
									{titleCase(inp.stage)}
								</Link>
								<svg className="h-4 w-4 text-stone-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
									<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
								</svg>
								<span className="text-sm text-stone-600 dark:text-stone-400">{inp.output}</span>
							</div>
						))}
					</div>
				</section>
			)}

			{/* Hats */}
			<section className="mb-10">
				<h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-stone-400">
					Hat Sequence
				</h2>
				<div className="space-y-6">
					{stage.hatDefinitions.map((hat, i) => (
						<div
							key={hat.name}
							id={hat.name}
							className="rounded-xl border border-stone-200 dark:border-stone-700"
						>
							<div className="border-b border-stone-200 px-6 py-4 dark:border-stone-700">
								<div className="flex items-center gap-3">
									<span className="flex h-6 w-6 items-center justify-center rounded-full bg-stone-100 text-xs font-bold text-stone-600 dark:bg-stone-800 dark:text-stone-300">
										{i + 1}
									</span>
									<h3 className="text-lg font-bold text-stone-900 dark:text-stone-100">
										{titleCase(hat.name)}
									</h3>
								</div>
							</div>
							<div className="px-6 py-4">
								<div className="prose prose-sm prose-gray dark:prose-invert max-w-none">
									<ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSlug]}>
										{hat.content}
									</ReactMarkdown>
								</div>
							</div>
						</div>
					))}
				</div>
			</section>

			{/* Review Agents */}
			{(stage.reviewAgentDefinitions.length > 0 || stage.reviewAgentsInclude.length > 0) && (
				<section className="mb-10">
					<h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-stone-400">
						Review Agents
					</h2>
					<div className="space-y-4">
						{stage.reviewAgentDefinitions.map((agent) => (
							<div
								key={agent.name}
								id={`agent-${agent.name}`}
								className="rounded-xl border border-teal-200 dark:border-teal-800"
							>
								<div className="border-b border-teal-200 px-6 py-3 dark:border-teal-800">
									<h3 className="text-lg font-bold text-stone-900 dark:text-stone-100">
										{titleCase(agent.name)}
									</h3>
								</div>
								<div className="px-6 py-4">
									<div className="prose prose-sm prose-gray dark:prose-invert max-w-none">
										<ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSlug]}>
											{agent.content}
										</ReactMarkdown>
									</div>
								</div>
							</div>
						))}
						{stage.reviewAgentsInclude.length > 0 && (
							<div className="rounded-xl border border-dashed border-stone-300 px-6 py-4 dark:border-stone-600">
								<h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-stone-400">
									Included from other stages
								</h4>
								<div className="flex flex-wrap gap-2">
									{stage.reviewAgentsInclude.flatMap((inc) =>
										inc.agents.map((agentName) => (
											<Link
												key={`${inc.stage}-${agentName}`}
												href={`/studios/${slug}/stages/${inc.stage}/#agent-${agentName}`}
												className="rounded-lg border border-stone-200 px-3 py-1.5 text-sm hover:border-teal-300 dark:border-stone-700 dark:hover:border-teal-700"
											>
												<span className="font-medium">{titleCase(agentName)}</span>
												<span className="ml-1 text-stone-400">from {titleCase(inc.stage)}</span>
											</Link>
										)),
									)}
								</div>
							</div>
						)}
					</div>
				</section>
			)}

			{/* Stage Body Content (criteria guidance, completion signal) */}
			{stage.content && (
				<section className="mb-10">
					<div className="prose prose-gray dark:prose-invert max-w-none">
						<ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSlug]}>
							{stage.content}
						</ReactMarkdown>
					</div>
				</section>
			)}

			{/* Navigation */}
			<footer className="mt-12 flex items-center justify-between border-t border-stone-200 pt-8 dark:border-stone-800">
				{prevStage ? (
					<Link
						href={`/studios/${slug}/stages/${prevStage.name}/`}
						className="text-sm text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-white"
					>
						&larr; {titleCase(prevStage.name)}
					</Link>
				) : (
					<Link
						href={`/studios/${slug}/`}
						className="text-sm text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-white"
					>
						&larr; {titleCase(studio.name)} Overview
					</Link>
				)}
				{nextStage ? (
					<Link
						href={`/studios/${slug}/stages/${nextStage.name}/`}
						className="text-sm text-teal-600 hover:text-teal-700 dark:text-teal-400 dark:hover:text-teal-300"
					>
						{titleCase(nextStage.name)} &rarr;
					</Link>
				) : (
					<Link
						href={`/studios/${slug}/`}
						className="text-sm text-teal-600 hover:text-teal-700 dark:text-teal-400 dark:hover:text-teal-300"
					>
						Back to overview &rarr;
					</Link>
				)}
			</footer>
		</div>
	)
}
