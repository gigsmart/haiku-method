import type { ReactNode } from "react"

type CardCommonProps = {
	children: ReactNode
	className?: string
	id?: string
}

// Discriminated so a landmark `as` value can't compile without `ariaLabelledBy` — an unlabelled landmark hurts AT more than a plain div.
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
