import { footerNavigation } from "@/lib/navigation"
import Link from "next/link"

export function Footer() {
	const columns = [
		footerNavigation.getStarted,
		footerNavigation.reference,
		footerNavigation.guides,
		footerNavigation.resources,
	]

	return (
		<footer className="border-t border-gray-200 bg-gray-50 pb-20 dark:border-gray-800 dark:bg-gray-900 md:pb-0">
			<div className="mx-auto max-w-6xl px-4 py-12">
				{/* Main footer content */}
				<div className="grid gap-8 md:grid-cols-2 lg:grid-cols-5">
					{/* Brand column */}
					<div className="lg:col-span-1">
						<Link href="/" className="text-xl font-bold tracking-tight">
							AI-DLC
						</Link>
						<p className="mt-3 text-sm text-gray-600 dark:text-gray-400">
							The software development profile of the{" "}
							<a
								href="https://haikumethod.ai"
								target="_blank"
								rel="noopener noreferrer"
								className="underline hover:text-gray-900 dark:hover:text-white"
							>
								H•AI•K•U Method
							</a>
							.
						</p>
						{/* Social links */}
						<div className="mt-4 flex gap-3">
							<a
								href="https://github.com/thebushidocollective/ai-dlc"
								target="_blank"
								rel="noopener noreferrer"
								className="rounded-lg p-2 text-gray-500 transition hover:bg-gray-200 hover:text-gray-900 dark:hover:bg-gray-800 dark:hover:text-white"
								aria-label="GitHub"
							>
								<svg
									className="h-5 w-5"
									fill="currentColor"
									viewBox="0 0 24 24"
									aria-hidden="true"
								>
									<path
										fillRule="evenodd"
										d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
										clipRule="evenodd"
									/>
								</svg>
							</a>
						</div>
					</div>

					{/* Navigation columns */}
					{columns.map((column) => (
						<div key={column.title}>
							<h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
								{column.title}
							</h3>
							<ul className="space-y-2">
								{column.items.map((item) => {
									const isExternal = item.href.startsWith("http")
									const LinkComponent = isExternal ? "a" : Link

									return (
										<li key={item.href}>
											<LinkComponent
												href={item.href}
												{...(isExternal
													? { target: "_blank", rel: "noopener noreferrer" }
													: {})}
												className="text-sm text-gray-600 transition hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
											>
												{item.title}
												{isExternal && (
													<svg
														className="ml-1 inline-block h-3 w-3 opacity-50"
														fill="none"
														viewBox="0 0 24 24"
														stroke="currentColor"
														aria-hidden="true"
													>
														<path
															strokeLinecap="round"
															strokeLinejoin="round"
															strokeWidth={2}
															d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
														/>
													</svg>
												)}
											</LinkComponent>
										</li>
									)
								})}
							</ul>
						</div>
					))}
				</div>

				{/* Bottom section */}
				<div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-gray-200 pt-8 dark:border-gray-800 md:flex-row">
					<p className="text-sm text-gray-500 dark:text-gray-400">
						&copy; {new Date().getFullYear()} The Bushido Collective. MIT
						License.
					</p>
					<div className="flex flex-wrap items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
						<span>
							Built with{" "}
							<a
								href="https://nextjs.org"
								target="_blank"
								rel="noopener noreferrer"
								className="underline hover:text-gray-900 dark:hover:text-white"
							>
								Next.js
							</a>
						</span>
						<span className="hidden md:inline">&middot;</span>
						<span>
							Powered by{" "}
							<a
								href="https://anthropic.com"
								target="_blank"
								rel="noopener noreferrer"
								className="underline hover:text-gray-900 dark:hover:text-white"
							>
								Claude
							</a>
						</span>
					</div>
				</div>
			</div>
		</footer>
	)
}
