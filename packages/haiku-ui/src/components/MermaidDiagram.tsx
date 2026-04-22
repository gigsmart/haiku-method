import { useEffect, useMemo, useRef, useState } from "react"
import { MermaidFlow } from "./MermaidFlow"
import { canRenderAsFlow } from "./mermaid-flow/detect"

interface Props {
	definition: string
}

export function MermaidDiagram({ definition }: Props) {
	const isFlow = useMemo(() => canRenderAsFlow(definition), [definition])
	if (isFlow) {
		return (
			<MermaidFlow
				chart={definition}
				fallback={<MermaidSvgDiagram definition={definition} />}
			/>
		)
	}
	return <MermaidSvgDiagram definition={definition} />
}

function MermaidSvgDiagram({ definition }: Props) {
	const ref = useRef<HTMLDivElement>(null)
	const [error, setError] = useState<string | null>(null)
	const [loading, setLoading] = useState(true)

	useEffect(() => {
		if (!(ref.current && definition.trim())) return

		// Load mermaid from CDN dynamically — too large to bundle.
		// Pin an exact version and attach Subresource Integrity (SRI) +
		// crossOrigin so the browser rejects any tampered CDN payload.
		// To rotate:
		//   1. Bump MERMAID_VERSION to the intended release.
		//   2. Regenerate the SRI digest:
		//      curl -s "https://cdn.jsdelivr.net/npm/mermaid@<version>/dist/mermaid.min.js" \
		//        | openssl dgst -sha384 -binary | openssl base64 -A
		//   3. Paste the output after `sha384-` in MERMAID_SRI.
		const MERMAID_VERSION = "11.4.1"
		const MERMAID_SRI =
			"sha384-rbtjAdnIQE/aQJGEgXrVUlMibdfTSa4PQju4HDhN3sR2PmaKFzhEafuePsl9H/9I"
		const script = document.createElement("script")
		script.src = `https://cdn.jsdelivr.net/npm/mermaid@${MERMAID_VERSION}/dist/mermaid.min.js`
		script.integrity = MERMAID_SRI
		script.crossOrigin = "anonymous"
		script.onload = () => {
			const mermaid = (
				window as unknown as {
					mermaid: {
						initialize: (c: unknown) => void
						render: (id: string, def: string) => Promise<{ svg: string }>
					}
				}
			).mermaid
			mermaid.initialize({
				startOnLoad: false,
				// Explicit strict mode: never rely on upstream defaults for
				// security-sensitive configuration across Mermaid upgrades.
				securityLevel: "strict",
				theme: "dark",
				themeVariables: {
					primaryColor: "#0d9488", // audit-allow: mermaid themeVariables take raw hex
					primaryTextColor: "#f5f5f4", // audit-allow: mermaid themeVariables take raw hex
					primaryBorderColor: "#44403c", // audit-allow: mermaid themeVariables take raw hex
					lineColor: "#78716c", // audit-allow: mermaid themeVariables take raw hex
					secondaryColor: "#292524", // audit-allow: mermaid themeVariables take raw hex
					tertiaryColor: "#1c1917", // audit-allow: mermaid themeVariables take raw hex
				},
			})
			mermaid
				.render(`mermaid-${Date.now()}`, definition)
				.then(({ svg }) => {
					// audit-allow: mermaid returns pre-sanitized SVG; no user-supplied HTML
					if (ref.current) ref.current.innerHTML = svg
					setLoading(false)
				})
				.catch((err) => {
					setError(String(err))
					setLoading(false)
				})
		}
		script.onerror = () => {
			setError("Failed to load Mermaid renderer")
			setLoading(false)
		}
		document.head.appendChild(script)

		return () => {
			script.remove()
		}
	}, [definition])

	if (error) {
		return (
			<pre className="text-xs text-red-400 whitespace-pre-wrap p-3 rounded-lg bg-stone-900">
				{error}
			</pre>
		)
	}

	return (
		<div className="overflow-x-auto p-4">
			{loading && <div className="h-20 animate-pulse rounded bg-stone-800" />}
			<div ref={ref} className="[&_svg]:max-w-full [&_svg]:h-auto" />
		</div>
	)
}
