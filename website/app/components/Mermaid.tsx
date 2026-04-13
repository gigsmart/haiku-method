"use client"

import mermaid from "mermaid"
import { useEffect, useRef, useState } from "react"
import { canRenderAsFlow } from "./mermaid-flow/detect"
import { MermaidFlow } from "./MermaidFlow"

interface MermaidProps {
	chart: string
	height?: number
}

/**
 * Convert a light color to a darker version for dark mode
 * Preserves hue but reduces lightness significantly
 */
function darkenColorForDarkMode(hexColor: string): string {
	// Remove # if present
	const hex = hexColor.replace("#", "")
	if (hex.length !== 6) return hexColor

	// Parse RGB
	const r = Number.parseInt(hex.substring(0, 2), 16)
	const g = Number.parseInt(hex.substring(2, 4), 16)
	const b = Number.parseInt(hex.substring(4, 6), 16)

	// Convert to HSL
	const rNorm = r / 255
	const gNorm = g / 255
	const bNorm = b / 255

	const max = Math.max(rNorm, gNorm, bNorm)
	const min = Math.min(rNorm, gNorm, bNorm)
	const l = (max + min) / 2

	// Only darken if it's a light color (lightness > 0.7)
	if (l < 0.7) return hexColor

	let h = 0
	let s = 0

	if (max !== min) {
		const d = max - min
		s = l > 0.5 ? d / (2 - max - min) : d / (max + min)

		switch (max) {
			case rNorm:
				h = ((gNorm - bNorm) / d + (gNorm < bNorm ? 6 : 0)) / 6
				break
			case gNorm:
				h = ((bNorm - rNorm) / d + 2) / 6
				break
			case bNorm:
				h = ((rNorm - gNorm) / d + 4) / 6
				break
		}
	}

	// Darken: reduce lightness to 0.25-0.35 range for dark mode
	const newL = 0.3 + (l - 0.7) * 0.2
	// Significantly boost saturation for better color visibility in dark mode
	const newS = Math.min(s * 2.5 + 0.3, 0.9)

	// Convert back to RGB
	const hueToRgb = (p: number, q: number, t: number) => {
		let tNorm = t
		if (tNorm < 0) tNorm += 1
		if (tNorm > 1) tNorm -= 1
		if (tNorm < 1 / 6) return p + (q - p) * 6 * tNorm
		if (tNorm < 1 / 2) return q
		if (tNorm < 2 / 3) return p + (q - p) * (2 / 3 - tNorm) * 6
		return p
	}

	let newR: number
	let newG: number
	let newB: number

	if (newS === 0) {
		newR = newG = newB = newL
	} else {
		const q = newL < 0.5 ? newL * (1 + newS) : newL + newS - newL * newS
		const p = 2 * newL - q
		newR = hueToRgb(p, q, h + 1 / 3)
		newG = hueToRgb(p, q, h)
		newB = hueToRgb(p, q, h - 1 / 3)
	}

	const toHex = (n: number) =>
		Math.round(n * 255)
			.toString(16)
			.padStart(2, "0")

	return `#${toHex(newR)}${toHex(newG)}${toHex(newB)}`
}

export function Mermaid({ chart, height }: MermaidProps) {
	if (canRenderAsFlow(chart)) {
		return <MermaidFlow chart={chart} height={height} />
	}
	return <MermaidSvg chart={chart} />
}

function MermaidSvg({ chart }: { chart: string }) {
	const containerRef = useRef<HTMLDivElement>(null)
	const [svg, setSvg] = useState<string>("")
	const [error, setError] = useState<string | null>(null)
	const [isDark, setIsDark] = useState<boolean | null>(null)

	// Detect dark mode
	useEffect(() => {
		const checkDarkMode = () => {
			const isDarkMode = document.documentElement.classList.contains("dark")
			setIsDark(isDarkMode)
		}

		// Initial check
		checkDarkMode()

		// Watch for theme changes
		const observer = new MutationObserver(checkDarkMode)
		observer.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ["class"],
		})

		return () => observer.disconnect()
	}, [])

	useEffect(() => {
		if (!chart || isDark === null) return

		// Re-initialize mermaid each time to pick up theme changes
		mermaid.initialize({
			startOnLoad: false,
			theme: "base",
			themeVariables: isDark
				? {
						primaryColor: "transparent",
						primaryTextColor: "#f3f4f6",
						primaryBorderColor: "#ffffff",
						lineColor: "#ffffff",
						secondaryColor: "transparent",
						tertiaryColor: "transparent",
						background: "transparent",
						mainBkg: "transparent",
						secondBkg: "transparent",
						tertiaryBkg: "transparent",
						nodeBorder: "#ffffff",
						nodeTextColor: "#f3f4f6",
						clusterBkg: "transparent",
						clusterBorder: "#ffffff",
						titleColor: "#f3f4f6",
						edgeLabelBackground: "transparent",
						textColor: "#f3f4f6",
						fontSize: "16px",
						border1: "#ffffff",
						border2: "#ffffff",
						arrowheadColor: "#ffffff",
					}
				: {
						primaryColor: "transparent",
						primaryTextColor: "#171717",
						primaryBorderColor: "#2563eb",
						lineColor: "#6b7280",
						secondaryColor: "transparent",
						tertiaryColor: "transparent",
						background: "transparent",
						mainBkg: "transparent",
						secondBkg: "transparent",
						tertiaryBkg: "transparent",
						nodeBorder: "#2563eb",
						titleColor: "#171717",
						clusterBkg: "transparent",
						clusterBorder: "#2563eb",
						edgeLabelBackground: "transparent",
						textColor: "#171717",
						fontSize: "16px",
					},
			flowchart: {
				useMaxWidth: true,
				htmlLabels: true,
				curve: "basis",
			},
			sequence: {
				useMaxWidth: true,
				wrap: true,
			},
		})

		// Render the diagram
		const renderDiagram = async () => {
			try {
				const id = `mermaid-${Math.random().toString(36).substring(2, 11)}`
				const { svg } = await mermaid.render(id, chart)
				setSvg(svg)
				setError(null)
			} catch (err) {
				console.error("Mermaid rendering error:", err)
				setError(
					err instanceof Error ? err.message : "Failed to render diagram",
				)
			}
		}

		renderDiagram()
	}, [chart, isDark])

	// Post-process SVG: darken fills in dark mode and add edge label backgrounds
	useEffect(() => {
		if (!containerRef.current || !svg) return

		const svgElement = containerRef.current.querySelector("svg")
		if (!svgElement) return

		requestAnimationFrame(() => {
			if (isDark) {
				const lineColor = "#ffffff"

				// Darken light fills
				const elementsWithFill = svgElement.querySelectorAll("[style*='fill']")
				for (const el of elementsWithFill) {
					const style = el.getAttribute("style")
					if (!style) continue

					const fillMatch = style.match(/fill:\s*(#[0-9a-fA-F]{6})/)
					if (fillMatch) {
						const originalColor = fillMatch[1]
						const darkenedColor = darkenColorForDarkMode(originalColor)
						if (darkenedColor !== originalColor) {
							el.setAttribute(
								"style",
								style.replace(originalColor, darkenedColor),
							)
						}
					}
				}

				// Also check fill attributes directly
				const elementsWithFillAttr = svgElement.querySelectorAll("[fill]")
				for (const el of elementsWithFillAttr) {
					const fill = el.getAttribute("fill")
					if (fill?.startsWith("#") && fill.length === 7) {
						const darkenedColor = darkenColorForDarkMode(fill)
						if (darkenedColor !== fill) {
							el.setAttribute("fill", darkenedColor)
						}
					}
				}

				// Fix stroke colors
				const elementsWithStroke = svgElement.querySelectorAll(
					"[stroke], [style*='stroke']",
				)
				for (const el of elementsWithStroke) {
					const stroke = el.getAttribute("stroke")
					if (stroke) {
						const lowerStroke = stroke.toLowerCase()
						if (
							lowerStroke === "#ccc" ||
							lowerStroke === "#cccccc" ||
							lowerStroke === "#ddd" ||
							lowerStroke === "#dddddd" ||
							lowerStroke === "#eee" ||
							lowerStroke === "#eeeeee" ||
							lowerStroke === "#fff" ||
							lowerStroke === "#ffffff" ||
							lowerStroke === "#999" ||
							lowerStroke === "#999999" ||
							lowerStroke === "gray" ||
							lowerStroke === "grey"
						) {
							el.setAttribute("stroke", lineColor)
						}
					}
				}

				// Ensure cluster/subgraph titles are visible
				const clusterLabels = svgElement.querySelectorAll(
					".cluster-label, .cluster text, [class*='cluster'] text",
				)
				for (const el of clusterLabels) {
					el.setAttribute("fill", "#f3f4f6")
				}
			}

			// Add colored backgrounds to edge labels
			const edgeLabels = svgElement.querySelectorAll(".edgeLabel")
			for (const labelGroup of edgeLabels) {
				const textElement = labelGroup.querySelector("text")
				if (!textElement || !(textElement instanceof SVGTextElement)) return

				const labelText = textElement.textContent?.trim()
				let bgColor = ""
				let textColor = "#ffffff"

				if (labelText === "No") {
					bgColor = "#ef4444"
					textColor = "#ffffff"
				} else if (labelText === "Yes") {
					bgColor = "#22c55e"
					textColor = "#ffffff"
				} else if (labelText === "Blocked") {
					bgColor = "#f59e0b"
					textColor = "#000000"
				}

				if (bgColor) {
					try {
						const bbox = textElement.getBBox()
						const padding = 4

						const rect = document.createElementNS(
							"http://www.w3.org/2000/svg",
							"rect",
						)
						rect.setAttribute("x", String(bbox.x - padding))
						rect.setAttribute("y", String(bbox.y - padding))
						rect.setAttribute("width", String(bbox.width + padding * 2))
						rect.setAttribute("height", String(bbox.height + padding * 2))
						rect.setAttribute("fill", bgColor)
						rect.setAttribute("rx", "3")

						labelGroup.insertBefore(rect, textElement)

						textElement.setAttribute("fill", textColor)
						textElement.style.fill = textColor
					} catch (err) {
						console.error("Error adding label background:", err)
					}
				}
			}
		})
	}, [svg, isDark])

	// Don't render anything until we've detected the theme
	if (isDark === null) {
		return null
	}

	if (error) {
		return (
			<div className="my-6 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
				<p className="text-sm text-red-800 dark:text-red-200">
					<strong>Diagram Error:</strong> {error}
				</p>
				<pre className="mt-2 overflow-x-auto text-xs text-red-700 dark:text-red-300">
					{chart}
				</pre>
			</div>
		)
	}

	return (
		<div className="not-prose my-6 max-w-full">
			<div
				ref={containerRef}
				className="flex justify-center"
				style={{ background: "transparent", maxWidth: "100%" }}
				// biome-ignore lint/security/noDangerouslySetInnerHtml: Mermaid generates safe SVG
				dangerouslySetInnerHTML={{ __html: svg }}
			/>
		</div>
	)
}
