import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { getMethodologyPhase, getAllMethodologyPhases } from "@/lib/methodology"
import { remark } from "remark"
import remarkGfm from "remark-gfm"
import html from "remark-html"

interface PhasePageProps {
	params: Promise<{ phase: string }>
}

const phaseColors: Record<string, { bg: string; text: string; border: string; badge: string }> = {
	teal: {
		bg: "bg-teal-50 dark:bg-teal-950/30",
		text: "text-teal-700 dark:text-teal-300",
		border: "border-teal-200 dark:border-teal-800",
		badge: "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200",
	},
	indigo: {
		bg: "bg-indigo-50 dark:bg-indigo-950/30",
		text: "text-indigo-700 dark:text-indigo-300",
		border: "border-indigo-200 dark:border-indigo-800",
		badge: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200",
	},
	amber: {
		bg: "bg-amber-50 dark:bg-amber-950/30",
		text: "text-amber-700 dark:text-amber-300",
		border: "border-amber-200 dark:border-amber-800",
		badge: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
	},
	rose: {
		bg: "bg-rose-50 dark:bg-rose-950/30",
		text: "text-rose-700 dark:text-rose-300",
		border: "border-rose-200 dark:border-rose-800",
		badge: "bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200",
	},
}

export async function generateStaticParams() {
	return getAllMethodologyPhases().map((phase) => ({
		phase: phase.slug,
	}))
}

export async function generateMetadata({ params }: PhasePageProps): Promise<Metadata> {
	const { phase: slug } = await params
	const phase = getMethodologyPhase(slug)
	if (!phase) return { title: "Not Found" }

	return {
		title: phase.title,
		description: phase.description,
	}
}

export default async function PhasePage({ params }: PhasePageProps) {
	const { phase: slug } = await params
	const phase = getMethodologyPhase(slug)
	if (!phase) notFound()

	const allPhases = getAllMethodologyPhases()
	const currentIndex = allPhases.findIndex((p) => p.slug === slug)
	const prevPhase = currentIndex > 0 ? allPhases[currentIndex - 1] : null
	const nextPhase = currentIndex < allPhases.length - 1 ? allPhases[currentIndex + 1] : null

	const colors = phaseColors[phase.color] || phaseColors.teal

	const processedContent = await remark().use(remarkGfm).use(html).process(phase.content)
	const contentHtml = processedContent.toString()

	return (
		<div>
			{/* Header */}
			<section className={`border-b ${colors.border} ${colors.bg} px-4 py-16`}>
				<div className="mx-auto max-w-3xl">
					<Link
						href="/methodology/"
						className="mb-4 inline-flex items-center gap-1 text-sm text-stone-500 transition hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200"
					>
						<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
						</svg>
						Methodology
					</Link>
					<div className="mb-4">
						<span className={`inline-block rounded-full px-3 py-1 text-xs font-semibold ${colors.badge}`}>
							Phase {phase.phase_number} of 4
						</span>
					</div>
					<h1 className={`mb-3 text-4xl font-bold tracking-tight ${colors.text}`}>
						{phase.title}
					</h1>
					<p className="text-lg text-stone-600 dark:text-stone-400">
						{phase.description}
					</p>
				</div>
			</section>

			{/* Content */}
			<section className="px-4 py-12">
				<div className="mx-auto max-w-3xl">
					<div
						className="prose prose-stone dark:prose-invert prose-headings:font-semibold prose-h2:text-2xl prose-h2:mt-10 prose-h2:mb-4 prose-h3:text-lg prose-h3:mt-6 prose-p:leading-relaxed"
						dangerouslySetInnerHTML={{ __html: contentHtml }}
					/>
				</div>
			</section>

			{/* Navigation */}
			<section className="border-t border-stone-200 px-4 py-8 dark:border-stone-800">
				<div className="mx-auto flex max-w-3xl items-center justify-between">
					{prevPhase ? (
						<Link
							href={`/methodology/${prevPhase.slug}/`}
							className="flex items-center gap-2 text-sm font-medium text-stone-600 transition hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100"
						>
							<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
								<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
							</svg>
							{prevPhase.title}
						</Link>
					) : (
						<div />
					)}
					{nextPhase ? (
						<Link
							href={`/methodology/${nextPhase.slug}/`}
							className="flex items-center gap-2 text-sm font-medium text-stone-600 transition hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100"
						>
							{nextPhase.title}
							<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
								<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
							</svg>
						</Link>
					) : (
						<Link
							href="/methodology/"
							className="flex items-center gap-2 text-sm font-medium text-stone-600 transition hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100"
						>
							Back to Methodology
							<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
								<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
							</svg>
						</Link>
					)}
				</div>
			</section>
		</div>
	)
}
