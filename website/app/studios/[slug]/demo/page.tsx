import { getDemoConfig, listExamples, loadExampleArtifacts } from "@/lib/demo"
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

/** Pre-load all example configs + artifacts at build time */
function loadAllExamples(slug: string) {
	const examples = listExamples(slug)
	const loaded: Record<string, { artifacts: Record<string, string> | null }> = {}
	for (const name of examples) {
		loaded[name] = {
			artifacts: loadExampleArtifacts(slug, name),
		}
	}
	return { examples, loaded }
}

export default async function StudioDemoPage({ params }: Props) {
	const { slug } = await params
	const studio = getStudioBySlug(slug)
	if (!studio) notFound()

	const { examples, loaded } = loadAllExamples(slug)
	const defaultExample = examples[0] || null
	const config = await getDemoConfig(slug, defaultExample || undefined)
	if (!config) notFound()

	// Pre-load configs for all examples
	const exampleConfigs: Record<string, unknown> = {}
	for (const name of examples) {
		const c = await getDemoConfig(slug, name)
		if (c) exampleConfigs[name] = c
	}

	return (
		<DemoClient
			config={config}
			artifacts={defaultExample ? loaded[defaultExample]?.artifacts ?? null : null}
			examples={examples}
			exampleConfigs={exampleConfigs as Record<string, typeof config>}
			exampleArtifacts={Object.fromEntries(
				examples.map((name) => [name, loaded[name]?.artifacts ?? null]),
			)}
		/>
	)
}
