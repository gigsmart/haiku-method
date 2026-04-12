import type { MDXComponents } from "mdx/types"
import Link from "next/link"
import type { HTMLAttributes, ReactNode } from "react"
import { ExpandableDiagram } from "./ExpandableDiagram"
import { Mermaid } from "./Mermaid"

interface CalloutProps {
	tone?: "info" | "good" | "warn" | "bad"
	title?: string
	children: ReactNode
}

function Callout({ tone = "info", title, children }: CalloutProps) {
	const tones = {
		info: "border-l-blue-500 bg-blue-50 dark:bg-blue-950/30",
		good: "border-l-green-500 bg-green-50 dark:bg-green-950/30",
		warn: "border-l-amber-500 bg-amber-50 dark:bg-amber-950/30",
		bad: "border-l-red-500 bg-red-50 dark:bg-red-950/30",
	}
	return (
		<aside
			className={`not-prose my-8 rounded-r-lg border-l-4 px-6 py-4 ${tones[tone]}`}
		>
			{title ? (
				<div className="mb-2 font-mono text-xs font-semibold uppercase tracking-wider text-stone-700 dark:text-stone-300">
					{title}
				</div>
			) : null}
			<div className="text-stone-700 dark:text-stone-200">{children}</div>
		</aside>
	)
}

interface CardProps {
	title?: string
	eyebrow?: string
	accent?: "good" | "bad" | "info"
	children: ReactNode
}

function Card({ title, eyebrow, accent = "info", children }: CardProps) {
	const accents = {
		info: "border-t-blue-500",
		good: "border-t-green-500",
		bad: "border-t-red-500",
	}
	return (
		<div
			className={`rounded-lg border border-stone-200 border-t-4 bg-white p-6 dark:border-stone-800 dark:bg-stone-900 ${accents[accent]}`}
		>
			{eyebrow ? (
				<div className="mb-1 font-mono text-xs uppercase tracking-wider text-stone-500 dark:text-stone-400">
					{eyebrow}
				</div>
			) : null}
			{title ? (
				<h3 className="mb-3 text-lg font-semibold text-stone-900 dark:text-white">
					{title}
				</h3>
			) : null}
			<div className="text-sm text-stone-700 dark:text-stone-300 [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:pl-5 [&_li]:my-1">
				{children}
			</div>
		</div>
	)
}

function Grid({ children }: { children: ReactNode }) {
	return (
		<div className="not-prose my-8 grid gap-4 sm:grid-cols-2">{children}</div>
	)
}

function KeyPoints({
	title,
	children,
}: {
	title?: string
	children: ReactNode
}) {
	return (
		<div className="not-prose my-10 rounded-xl border border-stone-200 bg-stone-50 p-6 dark:border-stone-800 dark:bg-stone-900/50">
			{title ? (
				<div className="mb-3 font-mono text-xs font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400">
					{title}
				</div>
			) : null}
			<div className="text-stone-700 dark:text-stone-200 [&_ol]:my-0 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:my-2 [&_strong]:text-stone-900 dark:[&_strong]:text-white">
				{children}
			</div>
		</div>
	)
}

function Pill({ children }: { children: ReactNode }) {
	return (
		<span className="inline-block rounded-full border border-stone-300 bg-stone-100 px-2.5 py-0.5 font-mono text-[11px] text-stone-700 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-300">
			{children}
		</span>
	)
}

/**
 * Base MDX components — maps standard markdown elements to prose-styled
 * Tailwind output plus exposes custom components by name.
 */
export const mdxComponents: MDXComponents = {
	a: ({ href, children, ...rest }: HTMLAttributes<HTMLAnchorElement> & { href?: string }) => {
		if (href?.startsWith("/")) {
			return (
				<Link href={href} className="text-blue-600 underline underline-offset-2 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300">
					{children}
				</Link>
			)
		}
		const isExternal = /^(https?:)?\/\//.test(href ?? "")
		return (
			<a
				href={href}
				target={isExternal ? "_blank" : undefined}
				rel={isExternal ? "noopener noreferrer" : undefined}
				className="text-blue-600 underline underline-offset-2 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
				{...rest}
			>
				{children}
			</a>
		)
	},
	// Intercept fenced code blocks tagged ```mermaid and render as diagram
	pre: ({ children, ...rest }: HTMLAttributes<HTMLPreElement>) => {
		const child = (children as {
			props?: { className?: string; children?: string }
		})?.props
		const className = child?.className || ""
		const isMermaid = className.includes("language-mermaid")
		if (isMermaid && typeof child?.children === "string") {
			return <ExpandableDiagram chart={child.children.replace(/\n$/, "")} />
		}
		return <pre {...rest}>{children}</pre>
	},
	// Custom components available by name in MDX
	ExpandableDiagram,
	Mermaid,
	Callout,
	Card,
	Grid,
	KeyPoints,
	Pill,
}
