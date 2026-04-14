import { getAllStudios, getStudioBySlug } from "@/lib/studios"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

interface Props {
	params: Promise<{ slug: string }>
}

export async function generateStaticParams() {
	return getAllStudios().map((s) => ({ slug: s.slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { slug } = await params
	const studio = getStudioBySlug(slug)
	if (!studio) return { title: "Not Found" }
	return {
		title: `${titleCase(studio.name)} Architecture · H·AI·K·U`,
		description: `Interactive runtime-architecture map for the ${studio.name} studio.`,
	}
}

function titleCase(s: string): string {
	return s
		.split("-")
		.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
		.join(" ")
}

export default async function StudioArchitecturePage({ params }: Props) {
	const { slug } = await params
	const studio = getStudioBySlug(slug)
	if (!studio) notFound()

	return (
		<>
			<nav className="flex flex-wrap items-center gap-2 border-b border-stone-200 bg-white px-4 py-2 text-sm dark:border-stone-700 dark:bg-stone-900">
				<Link href="/studios/" className="text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-white">
					Studios
				</Link>
				<span className="text-stone-300 dark:text-stone-600">/</span>
				<Link
					href={`/studios/${slug}/`}
					className="text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-white"
				>
					{titleCase(studio.name)}
				</Link>
				<span className="text-stone-300 dark:text-stone-600">/</span>
				<span className="font-semibold text-stone-900 dark:text-white">Architecture</span>
			</nav>
			<iframe
				src={`/prototype-stage-flow.html?studio=${slug}`}
				title={`${titleCase(studio.name)} architecture`}
				className="block w-full border-0 h-[calc(100svh-8rem)]"
			/>
		</>
	)
}
