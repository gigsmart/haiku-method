import type { ReactNode } from "react"

interface Props {
	children: ReactNode
	className?: string
	id?: string
	/**
	 * Render the card as a semantic landmark instead of a `<div>`. Set to
	 * `"article"` for the primary readable region of a tab (reader-mode TTS
	 * locks onto `<article>`), or `"section"` for a labelled chunk inside an
	 * article. Pair with `ariaLabelledBy` referencing a `SectionHeading id`.
	 */
	as?: "div" | "article" | "section"
	ariaLabelledBy?: string
}

export function Card({
	children,
	className = "",
	id,
	as = "div",
	ariaLabelledBy,
}: Props) {
	const Tag = as
	return (
		<Tag
			id={id}
			aria-labelledby={ariaLabelledBy}
			className={`bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-700 shadow-sm p-6 mb-6 ${className}`}
		>
			{children}
		</Tag>
	)
}

export function SectionHeading({
	children,
	level = 2,
	id,
}: {
	children: ReactNode
	level?: 2 | 3
	id?: string
}) {
	const Tag = level === 2 ? "h2" : "h3"
	const size = level === 2 ? "text-lg" : "text-base"
	return (
		<Tag
			id={id}
			className={`${size} font-semibold mb-3 text-stone-900 dark:text-stone-100`}
		>
			{children}
		</Tag>
	)
}
