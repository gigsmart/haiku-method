/**
 * AnnotationCanvas — non-modal pin-drop + popover overlay for stage artifacts.
 *
 * See `stages/design/artifacts/annotation-popover-states.html` for the visual
 * states this component renders (pin marker 28×28 visual + 44×44 hit area,
 * teal-300 popover 288 px with shadow-2xl + rounded-xl, dashed-teal ghost
 * placeholder, connector line), and unit-13-annotation-canvas.md for the
 * semantic contract (non-modal `role="group"`, single delegated listeners,
 * debounced localStorage persistence, 64 KB oversize cap, schema
 * re-validation, `QuotaExceededError` handling, XSS hardening).
 *
 * Semantic overrides vs the static HTML:
 *   - The static popover markup uses `role="dialog"`; this component overrides
 *     to `role="group"` with `aria-labelledby` + `aria-label="Annotation draft"`
 *     because the real canvas is non-modal — the reviewer must be able to
 *     drag/zoom the artifact while the popover stays anchored.
 *   - Shortcut `N` (new annotation) registers at scope `annotation-canvas` to
 *     avoid collision with the global `c` entry in `keyboard.ts` (R3 in the
 *     unit-13 tactical plan).
 *
 * Listener budget (unit spec line 121, ≤ 3 on the canvas root):
 *   1 delegated `pointerdown` on the root (handles pin activation + empty-area
 *   clicks), 1 delegated `keydown` on the root (arrow-key traversal +
 *   scope-internal Escape/Enter routing), and 1 document-level `keydown`
 *   handler owned by `useShortcut`'s shared listener in `a11y/keyboard.ts`.
 *   The document-level `mousedown` used for outside-click dismissal is
 *   scoped to the popover lifetime and is NOT attached to the canvas root,
 *   so it does not count against the budget.
 */

import {
	type CSSProperties,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react"
import { z } from "zod"
import {
	type FeedbackCreateRequest,
	FeedbackCreateRequestSchema,
	FeedbackAnchorSchema,
} from "haiku-api"
import { useAnnounce, useReducedMotion, useShortcut } from "../../a11y"

// ─── Public types ──────────────────────────────────────────────────────────

/**
 * Runtime pin shape. `state` flips from "draft" (not yet submitted) to
 * "pending" after `onSubmit` resolves — the parent can use the distinction
 * to render the pin in a different color while the server write is in flight.
 */
export interface AnnotationDraftPin {
	id: string
	pageId: string
	x: number // 0..1 — fraction of viewport width
	y: number // 0..1 — fraction of viewport height
	viewportWidth: number
	viewportHeight: number
	title: string
	body: string
	state: "draft" | "pending"
}

export interface AnnotationCanvasProps {
	/** Stable session id used as the localStorage key suffix. */
	sessionId: string
	/** Artifact page id written into each pin's anchor metadata. */
	pageId: string
	/** Pixel dimensions of the artifact the canvas overlays. Used to seed
	 *  `viewportWidth`/`viewportHeight` in the anchor. Optional — falls back
	 *  to the canvas root's `getBoundingClientRect()` at click time. */
	viewportWidth?: number
	viewportHeight?: number
	/** Submit handler. Receives a validated `FeedbackCreateRequest` (with
	 *  anchor block). The caller owns the network round-trip. */
	onSubmit: (payload: FeedbackCreateRequest) => Promise<void>
	/** Child content — typically the artifact the canvas overlays. Rendered
	 *  behind the pin layer via a stacked `<div>`. */
	children?: React.ReactNode
	/** Optional test hook — overrides the `sessionId` field on the
	 *  localStorage value without changing the key used to persist. */
	testMode?: boolean
}

// ─── localStorage payload schema ───────────────────────────────────────────

const AnnotationDraftPinSchema = z.object({
	id: z.string().min(1).max(200),
	pageId: z.string().min(1).max(200),
	x: z.number().min(0).max(1),
	y: z.number().min(0).max(1),
	viewportWidth: z.number().int().positive().max(10000),
	viewportHeight: z.number().int().positive().max(10000),
	title: z.string().max(2000),
	body: z.string().max(20000),
	state: z.union([z.literal("draft"), z.literal("pending")]),
})

const DraftPayloadSchema = z.object({
	sessionId: z.string().min(1).max(200),
	pins: z.array(AnnotationDraftPinSchema),
	savedAt: z.string(),
})

type DraftPayload = z.infer<typeof DraftPayloadSchema>

// ─── Constants ─────────────────────────────────────────────────────────────

const STORAGE_PREFIX = "haiku-ui:annotation-draft:"
const DEBOUNCE_MS = 500
const PAYLOAD_CAP_BYTES = 64 * 1024
const STORAGE_KEY_REGEX = /^haiku-ui:annotation-draft:(.+)$/

function storageKeyFor(sessionId: string): string {
	return `${STORAGE_PREFIX}${sessionId}`
}

function byteLength(str: string): number {
	// UTF-8 byte length approximation via TextEncoder when available; jsdom
	// ships a working TextEncoder polyfill in the current setup.
	if (typeof TextEncoder !== "undefined") {
		return new TextEncoder().encode(str).length
	}
	return str.length
}

function genPinId(): string {
	// Crypto.randomUUID is available in jsdom ≥ 25 and every browser we care
	// about. Fall back to a timestamp+random composite for older paths.
	if (
		typeof crypto !== "undefined" &&
		typeof crypto.randomUUID === "function"
	) {
		return `pin-${crypto.randomUUID()}`
	}
	return `pin-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`
}

// ─── Component ─────────────────────────────────────────────────────────────

export function AnnotationCanvas({
	sessionId,
	pageId,
	viewportWidth: viewportWidthProp,
	viewportHeight: viewportHeightProp,
	onSubmit,
	children,
}: AnnotationCanvasProps): React.ReactElement {
	const rootRef = useRef<HTMLDivElement | null>(null)
	const pinButtonsRef = useRef<Record<string, HTMLButtonElement | null>>({})
	const popoverRef = useRef<HTMLDivElement | null>(null)
	const titleInputRef = useRef<HTMLInputElement | null>(null)

	const announce = useAnnounce()
	const reducedMotion = useReducedMotion()

	const [pins, setPins] = useState<AnnotationDraftPin[]>([])
	const [activePin, setActivePin] = useState<string | null>(null)
	const [focusedPin, setFocusedPin] = useState<string | null>(null)
	const [hasLoadedDraft, setHasLoadedDraft] = useState(false)

	// ─── Draft persistence — boot-time read-back + sweep ────────────────────
	useEffect(() => {
		if (typeof window === "undefined") {
			setHasLoadedDraft(true)
			return
		}
		try {
			// Sweep stale drafts (different sessionId) before reading our own.
			for (let i = localStorage.length - 1; i >= 0; i -= 1) {
				const k = localStorage.key(i)
				if (!k) continue
				const match = k.match(STORAGE_KEY_REGEX)
				if (!match) continue
				const capturedSessionId = match[1]
				if (capturedSessionId !== sessionId) {
					localStorage.removeItem(k)
				}
			}
			// Read-back our own payload.
			const raw = localStorage.getItem(storageKeyFor(sessionId))
			if (raw === null) {
				setHasLoadedDraft(true)
				return
			}
			let parsed: unknown
			try {
				parsed = JSON.parse(raw)
			} catch {
				localStorage.removeItem(storageKeyFor(sessionId))
				setHasLoadedDraft(true)
				return
			}
			const validated = DraftPayloadSchema.safeParse(parsed)
			if (!validated.success) {
				localStorage.removeItem(storageKeyFor(sessionId))
				setHasLoadedDraft(true)
				return
			}
			setPins(validated.data.pins)
		} catch {
			// localStorage throws on private-mode Safari etc. — soft-fail silently.
		} finally {
			setHasLoadedDraft(true)
		}
		// Intentionally depend only on sessionId — this effect is a boot-time
		// sweep + read, not a live subscription.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [sessionId])

	// ─── Draft persistence — debounced write ────────────────────────────────
	// Track the latest payload + the pending timer in refs so the unmount path
	// can flush synchronously without breaking the "10 edits = 1 write" contract.
	const latestPayloadRef = useRef<DraftPayload | null>(null)
	const pendingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

	const persist = useCallback(
		(payload: DraftPayload) => {
			if (typeof window === "undefined") return
			const key = storageKeyFor(sessionId)
			// Preemptive oversize cap: drop oldest pin until we fit. Announces
			// polite; the assertive announcement is reserved for QuotaExceededError.
			let capped = payload
			let serialized = JSON.stringify(capped)
			let dropped = false
			while (
				byteLength(serialized) > PAYLOAD_CAP_BYTES &&
				capped.pins.length > 0
			) {
				capped = { ...capped, pins: capped.pins.slice(1) }
				serialized = JSON.stringify(capped)
				dropped = true
			}
			try {
				localStorage.setItem(key, serialized)
				if (dropped) {
					announce(
						"polite",
						"Draft too large to save locally; oldest annotation dropped",
					)
				}
			} catch (err) {
				if (
					err instanceof DOMException &&
					(err.name === "QuotaExceededError" ||
						// Firefox legacy name
						err.name === "NS_ERROR_DOM_QUOTA_REACHED")
				) {
					announce("assertive", "Draft too large to save locally")
					return
				}
				throw err
			}
		},
		[announce, sessionId],
	)

	useEffect(() => {
		if (!hasLoadedDraft) return
		if (typeof window === "undefined") return
		const payload: DraftPayload = {
			sessionId,
			pins,
			savedAt: new Date().toISOString(),
		}
		latestPayloadRef.current = payload
		// Clear the prior timer and schedule a fresh trailing-edge write.
		if (pendingTimerRef.current !== null) {
			clearTimeout(pendingTimerRef.current)
		}
		pendingTimerRef.current = setTimeout(() => {
			pendingTimerRef.current = null
			const latest = latestPayloadRef.current
			if (latest) persist(latest)
		}, DEBOUNCE_MS)
		return () => {
			// No flush here — the flush happens on the final unmount path below.
			// Component re-runs of this effect (pins change) naturally re-schedule.
		}
	}, [pins, sessionId, hasLoadedDraft, persist])

	// Flush-on-unmount: drain any pending debounced write so the
	// draft-carry-forward contract holds when the parent closes the sheet.
	useEffect(() => {
		return () => {
			if (pendingTimerRef.current !== null) {
				clearTimeout(pendingTimerRef.current)
				pendingTimerRef.current = null
				const latest = latestPayloadRef.current
				if (latest) persist(latest)
			}
		}
	}, [persist])

	// ─── Pre-sorted index for Arrow-key navigation ──────────────────────────
	const pinsKey = useMemo(
		() => pins.map((p) => `${p.id}:${p.x}:${p.y}`).join(","),
		[pins],
	)
	const sortedPinIds = useMemo(() => {
		return [...pins]
			.sort((a, b) => a.y - b.y || a.x - b.x)
			.map((p) => p.id)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [pinsKey])

	const focusPin = useCallback((id: string) => {
		const el = pinButtonsRef.current[id]
		if (el) {
			el.focus()
			setFocusedPin(id)
		}
	}, [])

	const moveFocusBy = useCallback(
		(delta: 1 | -1) => {
			if (sortedPinIds.length === 0) return
			const currentId = focusedPin ?? activePin ?? sortedPinIds[0]
			const idx = sortedPinIds.indexOf(currentId)
			const nextIdx =
				idx < 0
					? delta === 1
						? 0
						: sortedPinIds.length - 1
					: Math.max(0, Math.min(sortedPinIds.length - 1, idx + delta))
			const nextId = sortedPinIds[nextIdx]
			if (nextId) focusPin(nextId)
		},
		[sortedPinIds, focusedPin, activePin, focusPin],
	)

	// ─── Draft creation (pin-drop) ──────────────────────────────────────────
	const createPinAt = useCallback(
		(x: number, y: number, width: number, height: number) => {
			const id = genPinId()
			const nextPin: AnnotationDraftPin = {
				id,
				pageId,
				x: Math.min(1, Math.max(0, x)),
				y: Math.min(1, Math.max(0, y)),
				viewportWidth: Math.max(1, Math.round(width)),
				viewportHeight: Math.max(1, Math.round(height)),
				title: "",
				body: "",
				state: "draft",
			}
			setPins((prev) => [...prev, nextPin])
			setActivePin(id)
			setFocusedPin(id)
			// Focus the popover's title input on next tick so React has mounted
			// the popover DOM.
			queueMicrotask(() => {
				titleInputRef.current?.focus()
			})
			return id
		},
		[pageId],
	)

	const createPinAtCanvasCenter = useCallback(() => {
		const root = rootRef.current
		if (!root) return
		const rect = root.getBoundingClientRect()
		const width =
			viewportWidthProp ??
			(rect.width > 0 ? rect.width : 1024)
		const height =
			viewportHeightProp ??
			(rect.height > 0 ? rect.height : 768)
		createPinAt(0.5, 0.5, width, height)
	}, [createPinAt, viewportHeightProp, viewportWidthProp])

	// ─── Single delegated pointerdown + keydown on the canvas root ──────────
	useEffect(() => {
		const root = rootRef.current
		if (!root) return

		function handlePointerDown(event: PointerEvent): void {
			const target = event.target as HTMLElement | null
			if (!target) return
			// Clicks on a pin button → open its popover.
			const pinEl = target.closest<HTMLElement>("[data-pin-id]")
			if (pinEl) {
				const id = pinEl.getAttribute("data-pin-id")
				if (id) {
					setActivePin(id)
					setFocusedPin(id)
					queueMicrotask(() => titleInputRef.current?.focus())
				}
				return
			}
			// Clicks inside the popover should not trigger a new pin.
			if (popoverRef.current?.contains(target)) return
			// Otherwise: treat as empty-area click → drop a fresh pin.
			const rootEl = rootRef.current
			if (!rootEl) return
			const rect = rootEl.getBoundingClientRect()
			if (rect.width <= 0 || rect.height <= 0) return
			const x = (event.clientX - rect.left) / rect.width
			const y = (event.clientY - rect.top) / rect.height
			const width = viewportWidthProp ?? rect.width
			const height = viewportHeightProp ?? rect.height
			createPinAt(x, y, width, height)
		}

		function handleKeyDown(event: KeyboardEvent): void {
			// Arrow-key focus traversal — scope-internal, NOT routed through
			// useShortcut (arrow keys don't belong in a document-level registry).
			switch (event.key) {
				case "ArrowDown":
				case "ArrowRight":
					event.preventDefault()
					moveFocusBy(1)
					return
				case "ArrowUp":
				case "ArrowLeft":
					event.preventDefault()
					moveFocusBy(-1)
					return
				default:
					return
			}
		}

		root.addEventListener("pointerdown", handlePointerDown)
		root.addEventListener("keydown", handleKeyDown)
		return () => {
			root.removeEventListener("pointerdown", handlePointerDown)
			root.removeEventListener("keydown", handleKeyDown)
		}
	}, [
		createPinAt,
		moveFocusBy,
		viewportHeightProp,
		viewportWidthProp,
	])

	// ─── Shortcuts — N, Escape, Enter ────────────────────────────────────────
	useShortcut(
		"n",
		(event) => {
			// Ignore when focus is inside one of our own inputs (Escape/Enter
			// own those paths; `N` is a canvas-level shortcut).
			event.preventDefault()
			createPinAtCanvasCenter()
		},
		{
			scope: "annotation-canvas",
			guard: () => activePin === null,
		},
	)

	const handleCancel = useCallback(() => {
		if (activePin === null) return
		const returnTarget = activePin
		// Drop the draft pin (but keep any non-draft pins).
		setPins((prev) =>
			prev.filter((p) => !(p.id === returnTarget && p.state === "draft")),
		)
		setActivePin(null)
		// Return focus to the pin (if it survived) or to the canvas root.
		queueMicrotask(() => {
			const btn = pinButtonsRef.current[returnTarget]
			if (btn) {
				btn.focus()
			} else {
				rootRef.current?.focus()
			}
		})
	}, [activePin])

	useShortcut("Escape", () => handleCancel(), {
		scope: "annotation-canvas",
		allowInInput: true,
		guard: () => activePin !== null,
	})

	const currentDraft = activePin
		? (pins.find((p) => p.id === activePin) ?? null)
		: null

	const handleSubmit = useCallback(async () => {
		if (!currentDraft) return
		const titleTrim = currentDraft.title.trim()
		const bodyTrim = currentDraft.body.trim()
		if (titleTrim.length === 0 || bodyTrim.length === 0) return
		const payload: FeedbackCreateRequest = {
			title: titleTrim,
			body: bodyTrim,
			origin: "user-visual",
			anchor: {
				pageId: currentDraft.pageId,
				x: currentDraft.x,
				y: currentDraft.y,
				viewportWidth: currentDraft.viewportWidth,
				viewportHeight: currentDraft.viewportHeight,
			},
		}
		const parsed = FeedbackCreateRequestSchema.safeParse(payload)
		if (!parsed.success) return
		// Belt + suspenders — ensure the anchor block specifically round-trips.
		const anchorCheck = FeedbackAnchorSchema.safeParse(payload.anchor)
		if (!anchorCheck.success) return
		try {
			await onSubmit(parsed.data)
			// Success: drop the submitted pin and clear the popover. Also clear
			// localStorage if this was the last draft.
			const submittedId = currentDraft.id
			setPins((prev) => prev.filter((p) => p.id !== submittedId))
			setActivePin(null)
			if (typeof window !== "undefined") {
				// If no more pins exist, remove the key entirely.
				// (The next persist effect will otherwise rewrite an empty payload.)
				const remaining = pins.filter((p) => p.id !== submittedId)
				if (remaining.length === 0) {
					try {
						localStorage.removeItem(storageKeyFor(sessionId))
					} catch {
						/* soft-fail */
					}
				}
			}
		} catch {
			// Parent is responsible for announcing network errors; the canvas
			// keeps the draft in place so the reviewer can retry.
		}
	}, [currentDraft, onSubmit, pins, sessionId])

	useShortcut(
		"Enter",
		(event) => {
			// Only consume Enter when the popover is open AND focus is in an
			// editable input/textarea within the popover — otherwise Enter is
			// ambient (e.g. the sidebar cross-flash entry).
			if (activePin === null) return
			const target = event.target as HTMLElement | null
			if (!target) return
			if (!popoverRef.current?.contains(target)) return
			// Allow Shift+Enter newline in textarea.
			if (target.tagName === "TEXTAREA" && event.shiftKey) return
			event.preventDefault()
			void handleSubmit()
		},
		{
			scope: "annotation-canvas",
			allowInInput: true,
			guard: () => activePin !== null,
		},
	)

	// ─── Outside-click dismissal for the popover ────────────────────────────
	useEffect(() => {
		if (activePin === null) return
		if (typeof document === "undefined") return
		function handleOutsideClick(event: MouseEvent): void {
			const target = event.target as Node | null
			if (!target) return
			if (popoverRef.current?.contains(target)) return
			// Clicking the anchor pin itself should NOT dismiss.
			const pinBtn = pinButtonsRef.current[activePin ?? ""]
			if (pinBtn?.contains(target)) return
			// Everything else → dismiss. We do not drop the draft (distinguish
			// from explicit Cancel); the pin stays put and the reviewer can
			// re-open it to keep editing.
			setActivePin(null)
		}
		document.addEventListener("mousedown", handleOutsideClick)
		return () => document.removeEventListener("mousedown", handleOutsideClick)
	}, [activePin])

	// ─── Imperative title-focus on popover open ─────────────────────────────
	useEffect(() => {
		if (activePin === null) return
		// Run after paint — React will have mounted the popover.
		const raf = requestAnimationFrame(() => {
			titleInputRef.current?.focus()
		})
		return () => cancelAnimationFrame(raf)
	}, [activePin])

	// ─── Render ──────────────────────────────────────────────────────────────
	const popoverId =
		activePin !== null ? `annotation-popover-${activePin}` : undefined
	const popoverTitleId =
		activePin !== null ? `annotation-popover-${activePin}-title` : undefined

	const animationClass = reducedMotion
		? ""
		: "motion-safe:transition-opacity motion-safe:duration-150"

	return (
		<div
			ref={rootRef}
			role="application"
			aria-label="Annotation canvas"
			className="relative h-full w-full"
			data-testid="annotation-canvas-root"
			tabIndex={0}
		>
			{children}
			{/* Pin layer — explicit tabindex="0" on every pin button.
			    The regression guard `banned-pin-tabindex-negative` greps for
			    tabindex="-1" in this file; do not introduce a negative tabindex. */}
			<div
				className="pointer-events-none absolute inset-0"
				data-testid="annotation-pin-layer"
			>
				{pins.map((pin, index) => {
					const style: CSSProperties = {
						left: `${pin.x * 100}%`,
						top: `${pin.y * 100}%`,
					}
					const humanLabel = pin.title.trim()
						? `Annotation ${index + 1}: ${pin.title.trim()}`
						: `Annotation ${index + 1}`
					return (
						<button
							key={pin.id}
							ref={(el) => {
								pinButtonsRef.current[pin.id] = el
							}}
							type="button"
							tabIndex={0}
							data-pin-id={pin.id}
							data-testid={`annotation-pin-${pin.id}`}
							aria-label={humanLabel}
							aria-describedby={
								activePin === pin.id ? popoverId : undefined
							}
							style={style}
							className={[
								"pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2",
								"flex h-7 w-7 items-center justify-center rounded-full",
								"border-2 border-white bg-teal-500 text-xs font-bold text-white",
								"shadow-lg hover:brightness-110",
								"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-[3px]",
								"dark:border-stone-900",
							].join(" ")}
						>
							<span aria-hidden="true">{index + 1}</span>
							{/* 44×44 hit-area expansion via pseudo spacer (inline-style
							    to avoid a dependency on tailwind-plugin pseudo rules).
							    pointer-events stays on the button, not the pseudo. */}
							<span
								aria-hidden="true"
								style={{
									position: "absolute",
									top: "50%",
									left: "50%",
									width: "44px",
									height: "44px",
									transform: "translate(-50%, -50%)",
									borderRadius: "9999px",
									pointerEvents: "none",
								}}
							/>
						</button>
					)
				})}
			</div>
			{/* Popover — non-modal (role="group", NOT "dialog"). Sibling to the
			    pin layer so it can receive pointer events; positioned relative
			    to the anchor pin via inline coordinates. */}
			{activePin !== null && currentDraft ? (
				<div
					ref={popoverRef}
					id={popoverId}
					role="group"
					aria-labelledby={popoverTitleId}
					aria-label="Annotation draft"
					data-testid="annotation-popover"
					style={{
						left: `${currentDraft.x * 100}%`,
						top: `calc(${currentDraft.y * 100}% + 20px)`,
					}}
					className={[
						"pointer-events-auto absolute z-50 -translate-x-1/2",
						"w-72 rounded-xl border border-teal-300 dark:border-teal-800",
						"bg-white dark:bg-stone-900 shadow-2xl p-3",
						animationClass,
					].join(" ")}
				>
					<h3
						id={popoverTitleId}
						className="text-xs font-bold uppercase tracking-widest text-teal-600 dark:text-teal-400 mb-2"
					>
						Annotation draft
					</h3>
					<label
						className="block text-xs text-stone-700 dark:text-stone-300 mb-1"
						htmlFor={`${popoverId}-title-input`}
					>
						Title
					</label>
					<input
						ref={titleInputRef}
						id={`${popoverId}-title-input`}
						type="text"
						value={currentDraft.title}
						onChange={(event) => {
							const next = event.target.value
							setPins((prev) =>
								prev.map((p) =>
									p.id === currentDraft.id ? { ...p, title: next } : p,
								),
							)
						}}
						placeholder="Summary…"
						aria-required="true"
						maxLength={120}
						className="w-full rounded-md border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-950 px-2 py-1 text-sm text-stone-900 dark:text-stone-100 mb-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2"
					/>
					<label
						className="block text-xs text-stone-700 dark:text-stone-300 mb-1"
						htmlFor={`${popoverId}-body-input`}
					>
						Detail
					</label>
					<textarea
						id={`${popoverId}-body-input`}
						rows={3}
						value={currentDraft.body}
						onChange={(event) => {
							const next = event.target.value
							setPins((prev) =>
								prev.map((p) =>
									p.id === currentDraft.id ? { ...p, body: next } : p,
								),
							)
						}}
						placeholder="What needs attention?"
						className="w-full rounded-md border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-950 px-2 py-1 text-sm text-stone-900 dark:text-stone-100 mb-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2"
					/>
					{/* Body rendered as React text children only (no innerHTML).
					    The XSS regression guard `banned-xss-sinks-annotation-path`
					    prevents future drift. */}
					<p className="text-[11px] text-stone-600 dark:text-stone-400 line-clamp-3 mb-2">
						{currentDraft.body}
					</p>
					<div className="flex items-center justify-between">
						<span className="text-xs text-stone-600 dark:text-stone-400">
							Esc to cancel
						</span>
						<div className="flex gap-1.5">
							<button
								type="button"
								onClick={handleCancel}
								className="rounded-md border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 px-2 py-1 text-xs font-semibold text-stone-700 dark:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2"
							>
								Cancel
							</button>
							<button
								type="button"
								onClick={() => {
									void handleSubmit()
								}}
								disabled={
									!currentDraft.title.trim() || !currentDraft.body.trim()
								}
								aria-disabled={
									!currentDraft.title.trim() || !currentDraft.body.trim()
								}
								className={[
									"rounded-md border px-2 py-1 text-xs font-semibold",
									"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2",
									!currentDraft.title.trim() || !currentDraft.body.trim()
										? "bg-stone-100 text-stone-600 border-stone-400 cursor-not-allowed dark:bg-stone-800 dark:text-stone-500 dark:border-stone-700"
										: "bg-teal-600 text-white border-teal-700 hover:bg-teal-700 dark:bg-teal-500 dark:border-teal-400",
								].join(" ")}
							>
								Create
							</button>
						</div>
					</div>
				</div>
			) : null}
		</div>
	)
}

export default AnnotationCanvas
