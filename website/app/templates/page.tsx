import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
	title: "Templates - AI-DLC",
	description:
		"Downloadable templates for AI-DLC intents, units, and settings.",
}

const templates = [
	{
		name: "Intent Template",
		filename: "intent-template.md",
		description:
			"Template for creating AI-DLC intent files. Includes sections for description, business context, completion criteria, and unit breakdown.",
		downloadUrl: "/templates/intent-template.md",
	},
	{
		name: "Unit Template",
		filename: "unit-template.md",
		description:
			"Template for creating unit files. Includes frontmatter for status and dependencies, completion criteria sections, and progress tracking.",
		downloadUrl: "/templates/unit-template.md",
	},
	{
		name: "Settings Template",
		filename: "settings-template.yml",
		description:
			"Configuration template for customizing AI-DLC behavior in your project. Includes workflow selection, operating modes, and quality gate commands.",
		downloadUrl: "/templates/settings-template.yml",
	},
]

const examples = [
	{
		name: "Example Intent",
		filename: "intent.md",
		description:
			"Complete example of an AI-DLC intent for a user authentication system. Shows how to structure a real-world intent.",
		downloadUrl: "/templates/ai-dlc-example/intent.md",
	},
	{
		name: "Example Unit",
		filename: "unit-01-registration.md",
		description:
			"Example of a completed unit file for user registration. Shows proper completion criteria, quality gates, and progress logging.",
		downloadUrl: "/templates/ai-dlc-example/unit-01-registration.md",
	},
]

function DownloadCard({
	name,
	filename,
	description,
	downloadUrl,
}: {
	name: string
	filename: string
	description: string
	downloadUrl: string
}) {
	return (
		<div className="rounded-lg border border-stone-200 bg-white p-6 transition hover:border-stone-300 dark:border-stone-800 dark:bg-stone-900 dark:hover:border-stone-700">
			<div className="mb-2 flex items-start justify-between">
				<h3 className="text-lg font-semibold">{name}</h3>
				<span className="rounded bg-stone-100 px-2 py-1 font-mono text-xs text-stone-600 dark:bg-stone-800 dark:text-stone-400">
					{filename}
				</span>
			</div>
			<p className="mb-4 text-sm text-stone-600 dark:text-stone-400">
				{description}
			</p>
			<a
				href={downloadUrl}
				download
				className="inline-flex items-center gap-2 rounded-md bg-teal-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-teal-700 dark:bg-teal-500 dark:hover:bg-teal-600"
			>
				<svg
					className="h-4 w-4"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					aria-hidden="true"
				>
					<path
						strokeLinecap="round"
						strokeLinejoin="round"
						strokeWidth={2}
						d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
					/>
				</svg>
				Download
			</a>
		</div>
	)
}

export default function TemplatesPage() {
	return (
		<div className="mx-auto max-w-4xl px-4 py-12">
			<h1 className="mb-4 text-4xl font-bold tracking-tight">Templates</h1>
			<p className="mb-8 text-lg text-stone-600 dark:text-stone-400">
				Downloadable templates to help you get started with AI-DLC. Use these as
				starting points for your own intents and units.
			</p>

			<section className="mb-12">
				<h2 className="mb-6 text-2xl font-bold">Templates</h2>
				<div className="grid gap-6 md:grid-cols-2">
					{templates.map((template) => (
						<DownloadCard key={template.filename} {...template} />
					))}
				</div>
			</section>

			<section className="mb-12">
				<h2 className="mb-6 text-2xl font-bold">Examples</h2>
				<p className="mb-6 text-stone-600 dark:text-stone-400">
					Real-world examples showing how to structure intents and units for a
					user authentication system.
				</p>
				<div className="grid gap-6 md:grid-cols-2">
					{examples.map((example) => (
						<DownloadCard key={example.filename} {...example} />
					))}
				</div>
			</section>

			<section className="rounded-lg border border-stone-200 bg-stone-50 p-6 dark:border-stone-800 dark:bg-stone-900">
				<h2 className="mb-4 text-xl font-bold">Quick Setup</h2>
				<p className="mb-4 text-stone-600 dark:text-stone-400">
					Create your <code>.ai-dlc/</code> directory and download templates
					with these commands:
				</p>
				<div className="overflow-x-auto rounded-lg bg-stone-900 p-4 font-mono text-sm text-stone-100 dark:bg-stone-950">
					<pre>{`# Create directory
mkdir -p .ai-dlc

# Download templates
curl -o .ai-dlc/intent.md https://ai-dlc.dev/templates/intent-template.md
curl -o .ai-dlc/unit-01.md https://ai-dlc.dev/templates/unit-template.md
curl -o .ai-dlc/settings.yml https://ai-dlc.dev/templates/settings-template.yml`}</pre>
				</div>
			</section>

			<section className="mt-12">
				<h2 className="mb-4 text-xl font-bold">Next Steps</h2>
				<ul className="space-y-2 text-stone-600 dark:text-stone-400">
					<li>
						<Link
							href="/docs/quick-start/"
							className="text-teal-600 hover:underline dark:text-teal-400"
						>
							Quick Start Guide
						</Link>{" "}
						- Get up and running with AI-DLC
					</li>
					<li>
						<Link
							href="/docs/checklist-first-intent/"
							className="text-teal-600 hover:underline dark:text-teal-400"
						>
							First Intent Checklist
						</Link>{" "}
						- Step-by-step guide for your first intent
					</li>
					<li>
						<Link
							href="/docs/concepts/"
							className="text-teal-600 hover:underline dark:text-teal-400"
						>
							Core Concepts
						</Link>{" "}
						- Understand the fundamentals
					</li>
				</ul>
			</section>
		</div>
	)
}
