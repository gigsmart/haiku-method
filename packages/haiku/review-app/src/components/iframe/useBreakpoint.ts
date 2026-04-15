import { useEffect, useRef, useState } from "react"

export type Breakpoint = "narrow" | "medium" | "wide"

/**
 * Returns the current iframe breakpoint driven by ResizeObserver on the
 * given element ref. Does NOT read window.innerWidth.
 *
 * Thresholds (from DESIGN-TOKENS.md):
 *   narrow : width <= 480px
 *   medium : 481–768px
 *   wide   : >= 769px
 */
export function useBreakpoint(
	ref: React.RefObject<HTMLElement | null>,
): Breakpoint {
	const [bp, setBp] = useState<Breakpoint>("narrow")

	useEffect(() => {
		const el = ref.current
		if (!el) return

		function classify(width: number): Breakpoint {
			if (width <= 480) return "narrow"
			if (width <= 768) return "medium"
			return "wide"
		}

		// Set immediately from current size
		setBp(classify(el.getBoundingClientRect().width))

		const obs = new ResizeObserver((entries) => {
			const width = entries[0]?.contentRect.width ?? 0
			setBp(classify(width))
		})
		obs.observe(el)
		return () => obs.disconnect()
	}, [ref])

	return bp
}
