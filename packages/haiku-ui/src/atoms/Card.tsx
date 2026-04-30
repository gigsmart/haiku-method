import type { ReactNode } from "react"

type CardCommonProps = {
	children: ReactNode
	className?: string
	id?: string
}

/**
 * Discriminated by `as`: when the card is a landmark (`article` / `section`),
 * `ariaLabelledBy` is required (an unlabeled landmark is worse for AT
 * navigation than a plain `<div>`); when it's a plain `<div>`, the prop is
 * forbidden so it can't drift in unnoticed.
 */
type CardProps =
	| (CardCommonProps & { as?: "div"; ariaLabelledBy?: never })
	| (CardCommonProps & {
			as: "article" | "section"
			ariaLabelledBy: string
	  })

export function Card(props: CardProps) {
	const { children, className = "", id } = props
	const Tag = props.as ?? "div"
	const ariaLabelledBy =
		props.as === "article" || props.as === "section"
			? props.ariaLabelledBy
			: undefined
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

/**
 * `default` — the standard card heading (semibold, full text colour).
 * `eyebrow` — small uppercase label used above light prose blocks (e.g.
 * the stage-summary card). Both render real heading elements (`h2`/`h3`),
 * so AT and reader-mode TTS can use them as landmarks.
 */
type SectionHeadingVariant = "default" | "eyebrow"

export function SectionHeading({
	children,
	level = 2,
	id,
	variant = "default",
}: {
	children: ReactNode
	level?: 2 | 3
	id?: string
	variant?: SectionHeadingVariant
}) {
	const Tag = level === 2 ? "h2" : "h3"
	const classes =
		variant === "eyebrow"
			? "text-xs font-bold uppercase tracking-widest text-stone-500 dark:text-stone-500 mb-1.5"
			: `${level === 2 ? "text-lg" : "text-base"} font-semibold mb-3 text-stone-900 dark:text-stone-100`
	return (
		<Tag id={id} className={classes}>
			{children}
		</Tag>
	)
}
