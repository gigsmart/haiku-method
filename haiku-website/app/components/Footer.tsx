import Link from "next/link"

export function Footer() {
	return (
		<footer className="border-t border-stone-200 bg-stone-50">
			<div className="mx-auto max-w-5xl px-4 py-12">
				<div className="grid gap-8 md:grid-cols-4">
					<div>
						<Link
							href="/"
							className="text-lg font-semibold text-teal-600"
						>
							HAIKU
						</Link>
						<p className="mt-3 text-sm text-stone-500">
							Human AI Knowledge Unification. A universal framework
							for structured human-AI collaboration.
						</p>
					</div>

					<div>
						<h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-stone-400">
							Framework
						</h3>
						<ul className="space-y-2">
							<li>
								<Link
									href="/methodology"
									className="text-sm text-stone-500 hover:text-stone-900"
								>
									Methodology
								</Link>
							</li>
							<li>
								<Link
									href="/phases/elaboration"
									className="text-sm text-stone-500 hover:text-stone-900"
								>
									Phases
								</Link>
							</li>
							<li>
								<Link
									href="/profiles"
									className="text-sm text-stone-500 hover:text-stone-900"
								>
									Profiles
								</Link>
							</li>
						</ul>
					</div>

					<div>
						<h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-stone-400">
							Resources
						</h3>
						<ul className="space-y-2">
							<li>
								<Link
									href="/getting-started"
									className="text-sm text-stone-500 hover:text-stone-900"
								>
									Getting Started
								</Link>
							</li>
							<li>
								<Link
									href="/paper"
									className="text-sm text-stone-500 hover:text-stone-900"
								>
									Full Paper
								</Link>
							</li>
						</ul>
					</div>

					<div>
						<h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-stone-400">
							Profiles
						</h3>
						<ul className="space-y-2">
							<li>
								<a
									href="https://ai-dlc.dev"
									target="_blank"
									rel="noopener noreferrer"
									className="text-sm text-stone-500 hover:text-stone-900"
								>
									AI-DLC (Software)
								</a>
							</li>
							<li>
								<span className="text-sm text-stone-400">
									SWARM (Marketing)
								</span>
							</li>
						</ul>
					</div>
				</div>

				<div className="mt-12 border-t border-stone-200 pt-8 text-center text-sm text-stone-400">
					&copy; {new Date().getFullYear()} The Bushido Collective. MIT
					License.
				</div>
			</div>
		</footer>
	)
}
