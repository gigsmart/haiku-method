/**
 * useFeedbackListKeyboardNav — arrow-key roving focus for FeedbackList.
 *
 * Works on both the plain (non-virtualized) and virtualized branches. The
 * listener attaches to the *container*, not per item, so a keystroke that
 * happens to unmount the previously-focused row (virtualized branch; row
 * scrolls out of the window) still fires on the container and advances the
 * focus target correctly.
 *
 * Flow per ArrowDown / ArrowUp:
 *   1. Compute `nextIndex` (clamped to [0, itemCount - 1]).
 *   2. Call `scrollToIndex(nextIndex)` if provided — virtualized branch mounts
 *      the target row.
 *   3. In `requestAnimationFrame` (runs after react-window commits the new
 *      window), focus `itemRefs.current[nextIndex]`.
 *
 * Enter simulates a click on the currently-focused row (toggles expand).
 */

import { useCallback, useEffect, useRef, useState } from "react"

export interface UseFeedbackListKeyboardNavOptions {
	itemCount: number
	containerRef: React.RefObject<HTMLElement | null>
	itemRefs: React.MutableRefObject<Array<HTMLElement | null>>
	/** For virtualized lists — called before re-focus so the target mounts. */
	scrollToIndex?: (index: number) => void
	/** Initial focus index. Defaults to 0. */
	initialIndex?: number
}

export interface FeedbackListKeyboardNavHandle {
	focusedIndex: number
	setFocusedIndex: (index: number) => void
}

function raf(cb: () => void): void {
	// Use a microtask-like next-tick — we want the focus call to run AFTER
	// the React commit that scheduled it, but not hold until a browser paint
	// (which jsdom never produces). `queueMicrotask` runs after the current
	// event-loop task (the keydown handler) completes, which is after React
	// has flushed state-driven re-renders. `setTimeout(cb, 0)` is the
	// fallback for environments without queueMicrotask.
	if (typeof queueMicrotask === "function") {
		queueMicrotask(cb)
		return
	}
	setTimeout(cb, 0)
}

export function useFeedbackListKeyboardNav({
	itemCount,
	containerRef,
	itemRefs,
	scrollToIndex,
	initialIndex = 0,
}: UseFeedbackListKeyboardNavOptions): FeedbackListKeyboardNavHandle {
	const [focusedIndex, setFocusedIndexState] = useState<number>(initialIndex)
	// Track the latest focusedIndex in a ref so the keydown handler (bound
	// once) always sees the fresh value without re-binding on every render.
	const focusedIndexRef = useRef<number>(initialIndex)
	focusedIndexRef.current = focusedIndex

	const setFocusedIndex = useCallback((index: number) => {
		setFocusedIndexState(index)
		focusedIndexRef.current = index
	}, [])

	useEffect(() => {
		const containerNode = containerRef.current
		if (!containerNode) return

		// Resolve the focused index from the DOM rather than trusting the
		// hook-local state — user-driven focus (clicking on an item, tab
		// focus, tests calling .focus() imperatively) does not flow through
		// setFocusedIndex. We snap to whichever item currently has focus
		// inside the container, falling back to focusedIndexRef.
		const resolveCurrentIndex = (): number => {
			const active = document.activeElement
			if (active && containerNode.contains(active)) {
				for (let i = 0; i < itemRefs.current.length; i++) {
					if (itemRefs.current[i] === active) return i
				}
			}
			return focusedIndexRef.current
		}

		function move(delta: number): void {
			if (itemCount === 0) return
			const current = resolveCurrentIndex()
			const next = Math.max(0, Math.min(itemCount - 1, current + delta))
			if (next === current) return
			focusedIndexRef.current = next
			setFocusedIndexState(next)
			if (scrollToIndex) scrollToIndex(next)
			raf(() => {
				const node = itemRefs.current[next]
				if (node) node.focus()
			})
		}

		function onKeyDown(event: KeyboardEvent): void {
			if (event.key === "ArrowDown") {
				event.preventDefault()
				move(1)
				return
			}
			if (event.key === "ArrowUp") {
				event.preventDefault()
				move(-1)
				return
			}
			if (event.key === "Enter") {
				const current = resolveCurrentIndex()
				const node = itemRefs.current[current]
				if (node) {
					event.preventDefault()
					node.click()
				}
			}
		}

		containerNode.addEventListener("keydown", onKeyDown)
		return () => {
			containerNode.removeEventListener("keydown", onKeyDown)
		}
	}, [containerRef, itemCount, itemRefs, scrollToIndex])

	return { focusedIndex, setFocusedIndex }
}
