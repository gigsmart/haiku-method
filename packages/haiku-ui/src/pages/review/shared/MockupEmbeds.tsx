import type { MockupInfo } from "../../../types"
import { isImageUrl } from "./section-helpers"

/**
 * MockupEmbeds — renders a list of mockups either as inline images
 * (for image URLs) or as sandboxed iframes (for HTML/URL mockups).
 *
 * Used by both `IntentReview` (intent-level mockups) and `UnitReview`
 * (per-unit wireframes). Extracted from the legacy
 * `components/ReviewPage.tsx` monolith as part of the FB-22 split so
 * the leaf views stay under the 400 LOC module budget.
 */
export function MockupEmbeds({ mockups }: { mockups: MockupInfo[] }) {
	return (
		<>
			{mockups.map((m) => (
				<div key={m.url} className="mt-4">
					<div className="flex items-center justify-between mb-2">
						<h4 className="text-sm font-medium text-stone-600 dark:text-stone-400">
							{m.label}
						</h4>
						<a
							href={m.url}
							target="_blank"
							rel="noopener noreferrer"
							className="text-sm text-teal-600 dark:text-teal-400 hover:underline"
						>
							Open in new tab &#8599;
						</a>
					</div>
					{isImageUrl(m.url) ? (
						<img
							src={m.url}
							alt={m.label}
							className="max-w-full h-auto border border-stone-200 dark:border-stone-700 rounded-lg"
						/>
					) : (
						<iframe
							src={m.url}
							sandbox="allow-scripts allow-same-origin"
							className="w-full h-[600px] border border-stone-200 dark:border-stone-700 rounded-lg bg-white"
							title={m.label}
						/>
					)}
				</div>
			))}
		</>
	)
}
