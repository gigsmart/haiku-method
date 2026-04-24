/**
 * Vitest setup — polyfills DOM APIs missing from jsdom that the SPA
 * exercises on mount (matchMedia via ThemeToggle, ResizeObserver via
 * xyflow/mermaid-flow).
 */

if (typeof window !== "undefined") {
	if (typeof window.matchMedia !== "function") {
		Object.defineProperty(window, "matchMedia", {
			writable: true,
			configurable: true,
			value: (query: string): MediaQueryList => {
				const listeners: Array<(e: MediaQueryListEvent) => void> = []
				const mql: MediaQueryList = {
					matches: false,
					media: query,
					onchange: null,
					addListener: (cb: (e: MediaQueryListEvent) => void) => {
						listeners.push(cb)
					},
					removeListener: (cb: (e: MediaQueryListEvent) => void) => {
						const i = listeners.indexOf(cb)
						if (i >= 0) listeners.splice(i, 1)
					},
					addEventListener: (
						_type: string,
						cb: EventListener | ((e: MediaQueryListEvent) => void),
					) => {
						listeners.push(cb as (e: MediaQueryListEvent) => void)
					},
					removeEventListener: (
						_type: string,
						cb: EventListener | ((e: MediaQueryListEvent) => void),
					) => {
						const i = listeners.indexOf(cb as (e: MediaQueryListEvent) => void)
						if (i >= 0) listeners.splice(i, 1)
					},
					dispatchEvent: (_ev: Event) => true,
				}
				return mql
			},
		})
	}

	if (
		typeof (window as { ResizeObserver?: unknown }).ResizeObserver ===
		"undefined"
	) {
		class ResizeObserverStub {
			observe() {}
			unobserve() {}
			disconnect() {}
		}
		Object.defineProperty(window, "ResizeObserver", {
			writable: true,
			configurable: true,
			value: ResizeObserverStub,
		})
	}
}
