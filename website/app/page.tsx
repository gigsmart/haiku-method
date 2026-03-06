import { getAllBlogPosts } from "@/lib/blog"
import Link from "next/link"

const hats = [
	{
		name: "Planner",
		icon: (
			<svg
				className="h-8 w-8"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				aria-hidden="true"
			>
				<path
					strokeLinecap="round"
					strokeLinejoin="round"
					strokeWidth={1.5}
					d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
				/>
			</svg>
		),
		description: "Design the approach with clear steps and dependencies.",
		color: "text-purple-600 dark:text-purple-400",
		bgColor: "bg-purple-50 dark:bg-purple-950/50",
		borderColor: "border-purple-200 dark:border-purple-900",
	},
	{
		name: "Builder",
		icon: (
			<svg
				className="h-8 w-8"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				aria-hidden="true"
			>
				<path
					strokeLinecap="round"
					strokeLinejoin="round"
					strokeWidth={1.5}
					d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
				/>
			</svg>
		),
		description: "Execute the plan, write code, and build the solution.",
		color: "text-green-600 dark:text-green-400",
		bgColor: "bg-green-50 dark:bg-green-950/50",
		borderColor: "border-green-200 dark:border-green-900",
	},
	{
		name: "Reviewer",
		icon: (
			<svg
				className="h-8 w-8"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				aria-hidden="true"
			>
				<path
					strokeLinecap="round"
					strokeLinejoin="round"
					strokeWidth={1.5}
					d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
				/>
			</svg>
		),
		description: "Validate quality and ensure work meets requirements.",
		color: "text-amber-600 dark:text-amber-400",
		bgColor: "bg-amber-50 dark:bg-amber-950/50",
		borderColor: "border-amber-200 dark:border-amber-900",
	},
]

const differentiators = [
	{
		title: "Structure Without Overhead",
		description:
			"AI-DLC provides just enough structure to keep work focused without adding bureaucratic overhead. Define clear phases, not paperwork.",
		icon: (
			<svg
				className="h-6 w-6"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				aria-hidden="true"
			>
				<path
					strokeLinecap="round"
					strokeLinejoin="round"
					strokeWidth={2}
					d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
				/>
			</svg>
		),
	},
	{
		title: "AI-Native from Day One",
		description:
			"Built specifically for AI-assisted development. Works seamlessly with Claude Code to structure prompts, track context, and maintain quality.",
		icon: (
			<svg
				className="h-6 w-6"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				aria-hidden="true"
			>
				<path
					strokeLinecap="round"
					strokeLinejoin="round"
					strokeWidth={2}
					d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
				/>
			</svg>
		),
	},
	{
		title: "Intentional Context Switching",
		description:
			"Instead of letting context drift, switch \"hats\" deliberately. Both you and your AI understand what mode you're in and what's expected.",
		icon: (
			<svg
				className="h-6 w-6"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				aria-hidden="true"
			>
				<path
					strokeLinecap="round"
					strokeLinejoin="round"
					strokeWidth={2}
					d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
				/>
			</svg>
		),
	},
]

const paths = [
	{
		title: "Learn the Concepts",
		description:
			"Understand the four hats, units of work, and how AI-DLC structures development.",
		href: "/docs/",
		cta: "Read the Docs",
		icon: (
			<svg
				className="h-8 w-8"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				aria-hidden="true"
			>
				<path
					strokeLinecap="round"
					strokeLinejoin="round"
					strokeWidth={1.5}
					d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
				/>
			</svg>
		),
		color: "from-blue-500 to-blue-600",
	},
	{
		title: "Try It Yourself",
		description:
			"Use our interactive tools to explore workflows and find the right mode for your task.",
		href: "/tools/mode-selector/",
		cta: "Launch Mode Selector",
		icon: (
			<svg
				className="h-8 w-8"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				aria-hidden="true"
			>
				<path
					strokeLinecap="round"
					strokeLinejoin="round"
					strokeWidth={1.5}
					d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
				/>
				<path
					strokeLinecap="round"
					strokeLinejoin="round"
					strokeWidth={1.5}
					d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
				/>
			</svg>
		),
		color: "from-purple-500 to-purple-600",
	},
	{
		title: "Implement Now",
		description:
			"Install the Claude Code plugin and start using AI-DLC in your projects today.",
		href: "/docs/installation/",
		cta: "Install Plugin",
		icon: (
			<svg
				className="h-8 w-8"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				aria-hidden="true"
			>
				<path
					strokeLinecap="round"
					strokeLinejoin="round"
					strokeWidth={1.5}
					d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
				/>
			</svg>
		),
		color: "from-green-500 to-green-600",
	},
]

export default function Home() {
	const recentPosts = getAllBlogPosts().slice(0, 3)

	return (
		<div>
			{/* Hero Section */}
			<section className="relative overflow-hidden px-4 py-16 sm:py-24">
				<div className="absolute inset-0 -z-10 bg-[radial-gradient(45%_40%_at_50%_60%,rgba(59,130,246,0.12),transparent)] dark:bg-[radial-gradient(45%_40%_at_50%_60%,rgba(59,130,246,0.08),transparent)]" />
				<div className="mx-auto max-w-6xl">
					<div className="grid items-center gap-12 lg:grid-cols-2">
						{/* Left column - Text */}
						<div>
							<div className="mb-4 inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700 dark:bg-blue-950/50 dark:text-blue-300">
								<span className="relative flex h-2 w-2">
									<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
									<span className="relative inline-flex h-2 w-2 rounded-full bg-blue-500" />
								</span>
								Part of the{" "}
								<a
									href="https://haikumethod.ai"
									target="_blank"
									rel="noopener noreferrer"
									className="underline hover:text-blue-900 dark:hover:text-blue-100"
								>
									HAIKU Method
								</a>
							</div>
							<h1 className="mb-6 text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
								<span className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent dark:from-blue-400 dark:to-purple-400">
									AI-DLC
								</span>
							</h1>
							<p className="mb-4 text-xl text-gray-600 dark:text-gray-400">
								AI-Driven Development Lifecycle
							</p>
							<p className="mb-8 text-lg text-gray-600 dark:text-gray-400">
								AI-DLC is how software teams use the{" "}
								<a
									href="https://haikumethod.ai"
									target="_blank"
									rel="noopener noreferrer"
									className="text-blue-600 hover:underline dark:text-blue-400"
								>
									HAIKU Method
								</a>
								. Structure your work with clear phases, switch contexts
								intentionally, and ship with confidence.
							</p>
							<div className="flex flex-col gap-4 sm:flex-row">
								<Link
									href="/start-here/"
									className="inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 px-6 py-3 font-medium text-white transition hover:from-blue-700 hover:to-purple-700"
								>
									Start Here
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
											d="M13 7l5 5m0 0l-5 5m5-5H6"
										/>
									</svg>
								</Link>
								<Link
									href="/big-picture/"
									className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 px-6 py-3 font-medium transition hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-900"
								>
									View Big Picture
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
											d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
										/>
										<path
											strokeLinecap="round"
											strokeLinejoin="round"
											strokeWidth={2}
											d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
										/>
									</svg>
								</Link>
							</div>
						</div>

						{/* Right column - Big Picture Preview */}
						<div className="relative">
							<Link
								href="/big-picture/"
								className="group block overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-lg transition hover:shadow-xl dark:border-gray-800 dark:bg-gray-900"
							>
								<div className="aspect-[4/3] bg-gradient-to-br from-gray-50 to-gray-100 p-6 dark:from-gray-800 dark:to-gray-900">
									{/* Simplified diagram preview */}
									<div className="flex h-full flex-col items-center justify-center gap-4">
										<div className="flex gap-3">
											<div className="h-12 w-12 rounded-lg bg-blue-100 dark:bg-blue-900/50" />
											<div className="h-12 w-12 rounded-lg bg-purple-100 dark:bg-purple-900/50" />
										</div>
										<div className="h-6 w-24 rounded bg-gray-200 dark:bg-gray-700" />
										<div className="flex gap-3">
											<div className="h-12 w-12 rounded-lg bg-green-100 dark:bg-green-900/50" />
											<div className="h-12 w-12 rounded-lg bg-amber-100 dark:bg-amber-900/50" />
										</div>
									</div>
								</div>
								<div className="flex items-center justify-between border-t border-gray-200 px-6 py-4 dark:border-gray-800">
									<div>
										<p className="font-semibold">Big Picture Diagram</p>
										<p className="text-sm text-gray-500 dark:text-gray-400">
											Interactive methodology overview
										</p>
									</div>
									<svg
										className="h-5 w-5 text-gray-400 transition-transform group-hover:translate-x-1"
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
								</div>
							</Link>
						</div>
					</div>
				</div>
			</section>

			{/* What is AI-DLC Section */}
			<section className="border-y border-gray-200 bg-white px-4 py-16 dark:border-gray-800 dark:bg-gray-950">
				<div className="mx-auto max-w-6xl">
					<div className="mb-12 text-center">
						<h2 className="mb-4 text-3xl font-bold">What is AI-DLC?</h2>
						<p className="mx-auto max-w-2xl text-lg text-gray-600 dark:text-gray-400">
							AI-DLC is a lightweight methodology that brings structure to
							AI-assisted development without slowing you down.
						</p>
					</div>
					<div className="grid gap-8 md:grid-cols-3">
						{differentiators.map((item) => (
							<div
								key={item.title}
								className="rounded-xl border border-gray-200 p-6 transition hover:border-gray-300 dark:border-gray-800 dark:hover:border-gray-700"
							>
								<div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-400">
									{item.icon}
								</div>
								<h3 className="mb-2 text-lg font-semibold">{item.title}</h3>
								<p className="text-gray-600 dark:text-gray-400">
									{item.description}
								</p>
							</div>
						))}
					</div>
				</div>
			</section>

			{/* Three Paths Section */}
			<section className="px-4 py-16">
				<div className="mx-auto max-w-6xl">
					<div className="mb-12 text-center">
						<h2 className="mb-4 text-3xl font-bold">Choose Your Path</h2>
						<p className="mx-auto max-w-2xl text-lg text-gray-600 dark:text-gray-400">
							Whether you want to learn, experiment, or dive right in, there's a
							path for you.
						</p>
					</div>
					<div className="grid gap-6 md:grid-cols-3">
						{paths.map((path) => (
							<Link
								key={path.title}
								href={path.href}
								className="group flex flex-col rounded-xl border border-gray-200 p-6 transition hover:border-gray-300 hover:shadow-lg dark:border-gray-800 dark:hover:border-gray-700"
							>
								<div
									className={`mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br ${path.color} text-white`}
								>
									{path.icon}
								</div>
								<h3 className="mb-2 text-xl font-semibold">{path.title}</h3>
								<p className="mb-4 flex-1 text-gray-600 dark:text-gray-400">
									{path.description}
								</p>
								<span className="inline-flex items-center font-medium text-blue-600 group-hover:text-blue-700 dark:text-blue-400 dark:group-hover:text-blue-300">
									{path.cta}
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
						))}
					</div>
				</div>
			</section>

			{/* Hats Section */}
			<section className="bg-gray-50 px-4 py-16 dark:bg-gray-900/50">
				<div className="mx-auto max-w-6xl">
					<div className="mb-12 text-center">
						<h2 className="mb-4 text-3xl font-bold">Hats Drive Every Phase</h2>
						<p className="mx-auto max-w-2xl text-lg text-gray-600 dark:text-gray-400">
							AI-DLC uses a hat-based approach to separate concerns. The default
							workflow uses three core hats, with specialized hats available for
							security, design, testing, and debugging workflows.
						</p>
					</div>
					<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
						{hats.map((hat) => (
							<div
								key={hat.name}
								className={`rounded-xl border p-5 ${hat.bgColor} ${hat.borderColor}`}
							>
								<div className={`mb-3 ${hat.color}`}>{hat.icon}</div>
								<h3 className="mb-1 text-lg font-semibold">{hat.name}</h3>
								<p className="text-sm text-gray-600 dark:text-gray-400">
									{hat.description}
								</p>
							</div>
						))}
					</div>
					<div className="mt-8 text-center">
						<Link
							href="/docs/hats/"
							className="inline-flex items-center text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
						>
							Learn more about the hats
							<svg
								className="ml-1 h-4 w-4"
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
						</Link>
					</div>
				</div>
			</section>

			{/* Blog Posts Section */}
			{recentPosts.length > 0 && (
				<section className="px-4 py-16">
					<div className="mx-auto max-w-6xl">
						<div className="mb-8 flex items-center justify-between">
							<h2 className="text-2xl font-bold">Latest Updates</h2>
							<Link
								href="/blog/"
								className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
							>
								View all posts
							</Link>
						</div>
						<div className="grid gap-6 md:grid-cols-3">
							{recentPosts.map((post) => (
								<Link
									key={post.slug}
									href={`/blog/${post.slug}/`}
									className="group rounded-xl border border-gray-200 p-6 transition hover:border-gray-300 hover:shadow-md dark:border-gray-800 dark:hover:border-gray-700"
								>
									<time className="text-sm text-gray-500 dark:text-gray-400">
										{new Date(post.date).toLocaleDateString("en-US", {
											year: "numeric",
											month: "long",
											day: "numeric",
										})}
									</time>
									<h3 className="mt-2 text-lg font-semibold group-hover:text-blue-600 dark:group-hover:text-blue-400">
										{post.title}
									</h3>
									{post.description && (
										<p className="mt-2 text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
											{post.description}
										</p>
									)}
								</Link>
							))}
						</div>
					</div>
				</section>
			)}

			{/* CTA Section */}
			<section className="border-t border-gray-200 bg-gradient-to-br from-blue-50 to-purple-50 px-4 py-16 dark:border-gray-800 dark:from-blue-950/30 dark:to-purple-950/30">
				<div className="mx-auto max-w-4xl text-center">
					<h2 className="mb-4 text-3xl font-bold">Ready to get started?</h2>
					<p className="mb-8 text-lg text-gray-600 dark:text-gray-400">
						Install the Claude Code plugin and start using AI-DLC in your
						projects today.
					</p>
					<div className="inline-block rounded-lg bg-gray-900 p-4 text-left font-mono text-sm text-white dark:bg-gray-800">
						<div><code>/plugin marketplace add thebushidocollective/ai-dlc</code></div>
						<div><code>/plugin install ai-dlc@thebushidocollective-ai-dlc --scope project</code></div>
					</div>
					<div className="mt-6">
						<Link
							href="/docs/installation/"
							className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
						>
							View full installation guide
						</Link>
					</div>
				</div>
			</section>
		</div>
	)
}
