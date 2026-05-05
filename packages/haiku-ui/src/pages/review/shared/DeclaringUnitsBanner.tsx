/**
 * DeclaringUnitsBanner — small horizontal strip rendered above an
 * output's content body. Lists the unit slug(s) that declared the
 * current artifact's path in their `outputs:` frontmatter, each as a
 * click-through link the parent component uses to open that unit's
 * focused view.
 *
 * The map (intent-relative path → unit slugs) is computed server-side
 * by `buildOutputDeclaredBy` and lands on the session payload as
 * `output_declared_by`. Lookup is by intent-relative path; callers
 * pass that path directly.
 *
 * Renders nothing when no unit declared the path (e.g. files surfaced
 * by the catch-all walk that no unit explicitly owns).
 */

interface DeclaringUnitsBannerProps {
	/** Intent-dir-relative path of the output being viewed. Keys into
	 *  the `output_declared_by` map. */
	intentRelativePath: string | undefined
	/** The session-payload map: path → unit slugs. Optional — when
	 *  undefined, the banner renders nothing. */
	declaredBy: Record<string, string[]> | undefined
	/** Click handler for a declaring-unit badge. The parent decides
	 *  what "open this unit" means (StageReview opens the unit detail
	 *  view; IntentReview switches tab + expands the row). When
	 *  omitted, badges render as static text. */
	onUnitClick?: (unitSlug: string) => void
}

export function DeclaringUnitsBanner({
	intentRelativePath,
	declaredBy,
	onUnitClick,
}: DeclaringUnitsBannerProps): React.ReactElement | null {
	if (!intentRelativePath || !declaredBy) return null
	const units = declaredBy[intentRelativePath]
	if (!units || units.length === 0) return null

	return (
		<div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-violet-200 bg-violet-50 px-3 py-2 text-xs dark:border-violet-800 dark:bg-violet-900/30">
			<span className="font-semibold uppercase tracking-wider text-violet-700 dark:text-violet-300">
				Declared by
			</span>
			<ul className="flex flex-wrap items-center gap-1.5 m-0 p-0 list-none">
				{units.map((unitSlug) => (
					<li key={unitSlug}>
						{onUnitClick ? (
							<button
								type="button"
								onClick={() => onUnitClick(unitSlug)}
								className="inline-flex items-center rounded border border-violet-300 bg-white px-2 py-0.5 font-mono text-violet-700 transition-colors hover:bg-violet-100 dark:border-violet-700 dark:bg-stone-900 dark:text-violet-200 dark:hover:bg-violet-900/40"
							>
								{unitSlug}
							</button>
						) : (
							<span className="inline-flex items-center rounded border border-violet-300 bg-white px-2 py-0.5 font-mono text-violet-700 dark:border-violet-700 dark:bg-stone-900 dark:text-violet-200">
								{unitSlug}
							</span>
						)}
					</li>
				))}
			</ul>
		</div>
	)
}
