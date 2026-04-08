import { footerNavigation } from "@/lib/navigation"
import Link from "next/link"

export function Footer() {
	const columns = [
		footerNavigation.framework,
		footerNavigation.developers,
		footerNavigation.guides,
		footerNavigation.resources,
	]

	return (
		<footer className="border-t border-stone-200 bg-stone-50 pb-20 dark:border-stone-800 dark:bg-stone-900 md:pb-0">
			<div className="mx-auto max-w-6xl px-4 py-12">
				{/* Main footer content */}
				<div className="grid gap-8 md:grid-cols-2 lg:grid-cols-5">
					{/* Brand column */}
					<div className="lg:col-span-1">
						<Link href="/" className="text-xl font-bold tracking-tight">
							H·AI·K·U
						</Link>
						<p className="mt-3 text-sm text-stone-600 dark:text-stone-400">
							Human + AI Knowledge Unification.
						</p>
						<div className="mt-5 space-y-3">
							<div>
								<span className="text-[10px] text-stone-400 dark:text-stone-500 lowercase">born at</span>
								<a href="https://thebushido.co" target="_blank" rel="noopener noreferrer" className="mt-0.5 block">
									<img src="/images/born-at.svg" alt="The Bushido Collective" className="h-[20px] brightness-0 opacity-40 dark:invert dark:opacity-50 hover:opacity-70 transition-opacity" />
								</a>
							</div>
							<div>
								<span className="text-[10px] text-stone-400 dark:text-stone-500 lowercase tracking-wide">maintained by</span>
								<a href="https://gigsmart.com" target="_blank" rel="noopener noreferrer" className="mt-0.5 block">
									<img src="/images/battle-tested-at.svg" alt="GigSmart" className="h-[16px] brightness-0 opacity-40 dark:invert dark:opacity-50 hover:opacity-70 transition-opacity" />
								</a>
							</div>
						</div>
					</div>

					{/* Navigation columns */}
					{columns.map((column) => (
						<div key={column.title}>
							<h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
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
												className="text-sm text-stone-600 transition hover:text-stone-900 dark:text-stone-400 dark:hover:text-white"
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
				<div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-stone-200 pt-8 dark:border-stone-800 md:flex-row">
					<p className="text-sm text-stone-500 dark:text-stone-400">
						&copy; {new Date().getFullYear()} GigSmart, Inc. Apache 2.0
						License.
						{" · "}
						<Link href="/privacy" className="hover:text-stone-900 dark:hover:text-white">Privacy</Link>
						{" · "}
						<Link href="/terms" className="hover:text-stone-900 dark:hover:text-white">Terms</Link>
					</p>
					<a href="https://claude.ai" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-sm text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 transition-colors">
						<span>Powered by</span>
						<img src="/images/claude-logo.svg" alt="Claude" className="h-[14px] brightness-0 opacity-50 dark:invert dark:opacity-60" />
					</a>
				</div>
			</div>
		</footer>
	)
}
