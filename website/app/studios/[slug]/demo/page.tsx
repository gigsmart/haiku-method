import { getAllStudios, getStudioBySlug } from "@/lib/studios"
import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { DemoClient } from "./DemoClient"

interface Props {
	params: Promise<{ slug: string }>
}

export async function generateStaticParams() {
	const studios = getAllStudios()
	return studios.map((s) => ({ slug: s.slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { slug } = await params
	const studio = getStudioBySlug(slug)
	if (!studio) return { title: "Not Found" }
	const name = studio.name
		.split("-")
		.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
		.join(" ")
	return {
		title: `${name} Studio Demo - H\u00b7AI\u00b7K\u00b7U`,
		description: `Interactive simulation of a ${name} studio session showing the full H\u00b7AI\u00b7K\u00b7U lifecycle.`,
	}
}

export default async function StudioDemoPage({ params }: Props) {
	const { slug } = await params
	const studio = getStudioBySlug(slug)
	if (!studio) notFound()

	return (
		<DemoClient
			slug={slug}
			studioName={studio.name}
			stages={studio.stages}
		/>
	)
}
