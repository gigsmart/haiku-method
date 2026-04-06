import { getStudiosGrouped } from "@/lib/studios"
import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
	title: "Studios - H\u00b7AI\u00b7K\u00b7U",
	description:
		"Browse H\u00b7AI\u00b7K\u00b7U studios — domain-specific lifecycle templates for software, sales, marketing, compliance, and more.",
}

const categoryColors: Record<string, { border: string; bg: string; text: string }> = {
	Engineering: {
		border: "border-indigo-200 dark:border-indigo-800",
		bg: "bg-indigo-50 dark:bg-indigo-950/30",
		text: "text-indigo-600 dark:text-indigo-400",
	},
	Product: {
		border: "border-violet-200 dark:border-violet-800",
		bg: "bg-violet-50 dark:bg-violet-950/30",
		text: "text-violet-600 dark:text-violet-400",
	},
	"Go-to-Market": {
		border: "border-amber-200 dark:border-amber-800",
		bg: "bg-amber-50 dark:bg-amber-950/30",
		text: "text-amber-600 dark:text-amber-400",
	},
	Operations: {
		border: "border-orange-200 dark:border-orange-800",
		bg: "bg-orange-50 dark:bg-orange-950/30",
		text: "text-orange-600 dark:text-orange-400",
	},
	"Back Office": {
		border: "border-slate-200 dark:border-slate-700",
		bg: "bg-slate-50 dark:bg-slate-950/30",
		text: "text-slate-600 dark:text-slate-400",
	},
	"General Purpose": {
		border: "border-teal-200 dark:border-teal-800",
		bg: "bg-teal-50 dark:bg-teal-950/30",
		text: "text-teal-600 dark:text-teal-400",
	},
}

function titleCase(s: string): string {
	return s
		.split("-")
		.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
		.join(" ")
}

export default function StudiosPage() {
	const groups = getStudiosGrouped()

	return (
		<div>
			{/* Hero */}
			<section className="px-4 py-16 sm:py-24">
				<div className="mx-auto max-w-3xl text-center">
					<h1 className="mb-4 text-4xl font-bold tracking-tight sm:text-5xl">
						Studios
					</h1>
					<p className="text-lg text-stone-600 dark:text-stone-400">
						Studios customize the H·AI·K·U lifecycle for specific domains. Each
						studio defines stages, roles, review modes, and quality gates tailored
						to how work actually flows in that field.
					</p>
				</div>
			</section>

			{/* What is a Studio */}
			<section className="border-y border-stone-200 bg-stone-50 px-4 py-12 dark:border-stone-800 dark:bg-stone-900/50">
				<div className="mx-auto max-w-3xl">
					<h2 className="mb-4 text-2xl font-bold">What is a Studio?</h2>
					<p className="mb-4 text-stone-600 dark:text-stone-400">
						A studio is a domain-specific configuration of the H·AI·K·U lifecycle.
						It defines which stages work moves through, what roles (hats) the AI
						agent adopts at each stage, and what quality gates must pass before work
						advances.
					</p>
					<p className="text-stone-600 dark:text-stone-400">
						H·AI·K·U ships with {Array.from(groups.values()).flat().length} built-in
						studios across engineering, go-to-market, and general-purpose domains.
						You can also{" "}
						<Link
							href="/docs/customization/"
							className="text-teal-600 underline decoration-teal-600/30 hover:decoration-teal-600 dark:text-teal-400"
						>
							create your own
						</Link>
						.
					</p>
				</div>
			</section>

			{/* Studio Cards by Category */}
			<section className="px-4 py-16">
				<div className="mx-auto max-w-5xl space-y-16">
					{Array.from(groups.entries()).map(([category, studios]) => {
						const colors = categoryColors[category] || categoryColors["General Purpose"]

						return (
							<div key={category}>
								<h2 className="mb-6 text-sm font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500">
									{category}
								</h2>
								<div className="grid gap-6 sm:grid-cols-2">
									{studios.map((studio) => (
										<Link
											key={studio.slug}
											href={`/studios/${studio.slug}/`}
											className={`block rounded-xl border ${colors.border} overflow-hidden transition hover:shadow-md`}
										>
											<div className={`${colors.bg} px-6 py-5`}>
												<h3 className="text-xl font-bold text-stone-900 dark:text-stone-100">
													{titleCase(studio.name)}
												</h3>
												<p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
													{studio.description}
												</p>
											</div>
											<div className="bg-white px-6 py-4 dark:bg-stone-950">
												<div className="flex flex-wrap items-center gap-1">
													{studio.stages.map((stage, i) => (
														<span key={stage} className="flex items-center">
															<span
																className={`rounded px-2 py-0.5 text-xs font-medium ${colors.bg} ${colors.text}`}
															>
																{titleCase(stage)}
															</span>
															{i < studio.stages.length - 1 && (
																<svg
																	className="mx-0.5 h-3 w-3 text-stone-300 dark:text-stone-600"
																	fill="none"
																	viewBox="0 0 24 24"
																	stroke="currentColor"
																	aria-hidden="true"
																>
																	<path
																		strokeLinecap="round"
																		strokeLinejoin="round"
																		strokeWidth={2}
																		d="M9 5l7 7-7 7"
																	/>
																</svg>
															)}
														</span>
													))}
												</div>
												<div className="mt-2 flex gap-4 text-xs text-stone-400 dark:text-stone-500">
													<span>{studio.stageDefinitions.reduce((acc, s) => acc + s.hatDefinitions.length, 0)} hats</span>
													<span>{studio.persistence.type} / {studio.persistence.delivery}</span>
												</div>
											</div>
										</Link>
									))}
								</div>
							</div>
						)
					})}
				</div>
			</section>

			{/* Custom Studio CTA */}
			<section className="border-y border-stone-200 bg-stone-50 px-4 py-16 dark:border-stone-800 dark:bg-stone-900/50">
				<div className="mx-auto max-w-3xl text-center">
					<h2 className="mb-4 text-2xl font-bold">Build Your Own</h2>
					<p className="mb-6 text-stone-600 dark:text-stone-400">
						Any domain with structured work can have a studio. Use{" "}
						<code className="rounded bg-stone-200 px-1.5 py-0.5 text-sm dark:bg-stone-800">
							/haiku:scaffold studio &lt;name&gt;
						</code>{" "}
						to generate the directory structure, or see the{" "}
						<Link
							href="/docs/customization/"
							className="text-teal-600 underline decoration-teal-600/30 hover:decoration-teal-600 dark:text-teal-400"
						>
							customization guide
						</Link>
						.
					</p>
				</div>
			</section>
		</div>
	)
}
