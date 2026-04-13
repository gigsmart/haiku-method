import { useEffect, useRef, useState } from "react"
import { canRenderAsFlow } from "./mermaid-flow/detect"
import { MermaidFlow } from "./MermaidFlow"

interface Props {
  definition: string
}

export function MermaidDiagram({ definition }: Props) {
  if (canRenderAsFlow(definition)) {
    return <MermaidFlow chart={definition} />
  }
  return <MermaidSvgDiagram definition={definition} />
}

function MermaidSvgDiagram({ definition }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!ref.current || !definition.trim()) return

    // Load mermaid from CDN dynamically — too large to bundle
    const script = document.createElement("script")
    script.src = "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"
    script.onload = () => {
      const mermaid = (window as unknown as { mermaid: { initialize: (c: unknown) => void; render: (id: string, def: string) => Promise<{ svg: string }> } }).mermaid
      mermaid.initialize({
        startOnLoad: false,
        theme: "dark",
        themeVariables: {
          primaryColor: "#0d9488",
          primaryTextColor: "#f5f5f4",
          primaryBorderColor: "#44403c",
          lineColor: "#78716c",
          secondaryColor: "#292524",
          tertiaryColor: "#1c1917",
        },
      })
      mermaid
        .render(`mermaid-${Date.now()}`, definition)
        .then(({ svg }) => {
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

    return () => { script.remove() }
  }, [definition])

  if (error) {
    return <pre className="text-xs text-red-400 whitespace-pre-wrap p-3 rounded-lg bg-stone-900">{error}</pre>
  }

  return (
    <div className="overflow-x-auto p-4">
      {loading && <div className="h-20 animate-pulse rounded bg-stone-800" />}
      <div ref={ref} className="[&_svg]:max-w-full [&_svg]:h-auto" />
    </div>
  )
}
