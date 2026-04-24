/**
 * Controllable matchMedia stub for useReducedMotion tests.
 *
 * The project's global `tests/setup.ts` installs a read-only matchMedia stub
 * that always returns `matches: false`. This helper shadows that stub for the
 * duration of a test so the `change` event can be emitted to drive
 * `useReducedMotion` reactivity assertions.
 *
 * Usage:
 *   let restore: () => void
 *   beforeEach(() => {
 *     const stub = installMatchMediaStub({ "(prefers-reduced-motion: reduce)": false })
 *     restore = stub.restore
 *     emitChange = stub.emitChange
 *   })
 *   afterEach(() => restore())
 */

type QueryState = Record<string, boolean>
type Listener = (event: MediaQueryListEvent) => void

export interface MatchMediaStubHandle {
	/**
	 * Emit a `change` event for `query`, updating its stored `matches` value
	 * and firing any subscribed listeners with the new MediaQueryListEvent.
	 */
	emitChange: (query: string, matches: boolean) => void
	/** Restore the prior `window.matchMedia` (typically the global jsdom stub). */
	restore: () => void
}

export function installMatchMediaStub(
	initial: QueryState,
): MatchMediaStubHandle {
	const state: QueryState = { ...initial }
	const listeners = new Map<string, Set<Listener>>()

	function getListenerSet(query: string): Set<Listener> {
		let set = listeners.get(query)
		if (!set) {
			set = new Set()
			listeners.set(query, set)
		}
		return set
	}

	function buildMql(query: string): MediaQueryList {
		const mql = {
			matches: state[query] ?? false,
			media: query,
			onchange: null as
				| ((this: MediaQueryList, ev: MediaQueryListEvent) => unknown)
				| null,
			addListener(cb: Listener) {
				getListenerSet(query).add(cb)
			},
			removeListener(cb: Listener) {
				getListenerSet(query).delete(cb)
			},
			addEventListener(_type: string, cb: EventListenerOrEventListenerObject) {
				if (typeof cb === "function") getListenerSet(query).add(cb as Listener)
			},
			removeEventListener(
				_type: string,
				cb: EventListenerOrEventListenerObject,
			) {
				if (typeof cb === "function")
					getListenerSet(query).delete(cb as Listener)
			},
			dispatchEvent() {
				return true
			},
		} satisfies MediaQueryList
		return mql
	}

	const priorMatchMedia = window.matchMedia
	Object.defineProperty(window, "matchMedia", {
		writable: true,
		configurable: true,
		value: (query: string): MediaQueryList => buildMql(query),
	})

	function emitChange(query: string, matches: boolean): void {
		state[query] = matches
		const set = listeners.get(query)
		if (!set) return
		const event = {
			matches,
			media: query,
		} as unknown as MediaQueryListEvent
		for (const cb of set) cb(event)
	}

	function restore(): void {
		Object.defineProperty(window, "matchMedia", {
			writable: true,
			configurable: true,
			value: priorMatchMedia,
		})
		listeners.clear()
	}

	return { emitChange, restore }
}
