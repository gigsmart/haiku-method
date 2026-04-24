/**
 * ArtifactAnnotator — draw-on-image annotation widget for stage-review
 * artifacts (HTML wireframes + raster images).
 *
 * Two modes, toggled via the bottom-right pencil FAB:
 *   - Off (default): the overlay is pointer-transparent. The reviewer
 *     can click buttons, scroll, and interact with the mockup like a
 *     normal user.
 *   - On: the overlay captures pointer events. The reviewer drags to
 *     draw strokes; on the first stroke a comment popover opens.
 *
 * Submit flow:
 *   1. Reviewer types a comment.
 *   2. We capture the current tab's rendered pixels via
 *      `navigator.mediaDevices.getDisplayMedia({ preferCurrentTab })`.
 *      Browsers only expose true post-paint pixel data through this
 *      API — DOM-cloning libraries like html-to-image can't see
 *      runtime-JIT CSS (Tailwind CDN) or cross-origin iframe
 *      content, so their output drifts from what the user actually
 *      saw. getDisplayMedia reads the compositor directly, so the
 *      capture is pixel-perfect and an AI reviewer can reason about
 *      it without us trying to reconstruct styles.
 *   3. A single video frame is drawn to a 2D canvas, cropped to the
 *      wrapper's bounding rect, and the reviewer's strokes are
 *      overlaid via canvas paths. Export as PNG, attach to feedback.
 *   4. If the reviewer denies the share permission we fall back to a
 *      vector-SVG attachment (strokes only) so the feedback still
 *      lands — the AI reviewer just loses the visual context in
 *      that session. The permission prompt is one-time per tab.
 *
 * Pen-only tool by design — shape tools, colour, undo are follow-ups.
 */

import { useCallback, useRef, useState } from "react"

// Rose-600 is the annotation red in DESIGN-TOKENS; the canvas 2D
// strokeStyle accepts raw hex, so we allowlist it here rather than
// thread a CSS variable through the capture path.
const ANNOTATION_STROKE = "#e11d48" // audit-allow: canvas 2D strokeStyle takes raw hex (rose-600)
const ANNOTATION_STROKE_WIDTH = 3

interface Point {
	x: number
	y: number
}

interface Stroke {
	id: string
	points: Point[]
}

export interface ArtifactAnnotatorProps {
	/** Visible label for the comment popover (artifact filename). */
	artifactName: string
	/** Caller renders the artifact itself (iframe/img/etc) via this
	 *  children slot. The annotator overlays a pointer-capturing SVG
	 *  on top; the SVG alone is what we persist on submit. */
	children: React.ReactNode
	/** Fires after the reviewer enters a comment + submits a stroke.
	 *  `attachmentDataUrl` is a `data:image/svg+xml;base64,...` URL
	 *  holding the strokes as a standalone SVG sized to the wrapper
	 *  viewport. Returns a promise the annotator awaits before
	 *  clearing its overlay, so callers can surface network errors
	 *  inline. */
	onSubmit: (comment: string, attachmentDataUrl: string) => Promise<void>
}

export function ArtifactAnnotator({
	artifactName,
	children,
	onSubmit,
}: ArtifactAnnotatorProps): React.ReactElement {
	const wrapperRef = useRef<HTMLDivElement>(null)
	const svgRef = useRef<SVGSVGElement>(null)
	// Refs for the floating comment popover + FAB — we hide both for
	// a frame during capture so `getDisplayMedia` doesn't include our
	// own UI chrome in the screenshot handed to the AI reviewer.
	const popoverRef = useRef<HTMLDivElement>(null)
	const fabRef = useRef<HTMLButtonElement>(null)
	const [strokes, setStrokes] = useState<Stroke[]>([])
	const [drafting, setDrafting] = useState<Stroke | null>(null)
	const [comment, setComment] = useState("")
	const [submitting, setSubmitting] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [annotating, setAnnotating] = useState(false)

	const hasAnnotation = strokes.length > 0 || drafting !== null

	const toLocal = useCallback(
		(event: React.PointerEvent<SVGSVGElement>): Point => {
			const svg = svgRef.current
			if (!svg) return { x: 0, y: 0 }
			const rect = svg.getBoundingClientRect()
			return {
				x: event.clientX - rect.left,
				y: event.clientY - rect.top,
			}
		},
		[],
	)

	const startStroke = useCallback(
		(event: React.PointerEvent<SVGSVGElement>) => {
			event.preventDefault()
			svgRef.current?.setPointerCapture(event.pointerId)
			setDrafting({
				id: `s-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
				points: [toLocal(event)],
			})
		},
		[toLocal],
	)

	const extendStroke = useCallback(
		(event: React.PointerEvent<SVGSVGElement>) => {
			if (!drafting) return
			setDrafting({
				...drafting,
				points: [...drafting.points, toLocal(event)],
			})
		},
		[drafting, toLocal],
	)

	const finishStroke = useCallback(
		(event: React.PointerEvent<SVGSVGElement>) => {
			if (!drafting) return
			svgRef.current?.releasePointerCapture(event.pointerId)
			setStrokes((prev) => [...prev, drafting])
			setDrafting(null)
		},
		[drafting],
	)

	/** Clear the current annotation + comment buffer. `exitMode` toggles
	 *  whether we also leave annotation mode entirely — the Cancel
	 *  button wants exit; a successful submit wants to stay in mode so
	 *  the reviewer can immediately draw the next annotation without
	 *  reopening the FAB. */
	const clearAll = useCallback((exitMode = true) => {
		setStrokes([])
		setDrafting(null)
		setComment("")
		setError(null)
		if (exitMode) setAnnotating(false)
	}, [])

	const handleSubmit = useCallback(async () => {
		const wrapper = wrapperRef.current
		if (!wrapper) return
		const trimmed = comment.trim()
		if (!trimmed) {
			setError("Comment required")
			return
		}
		setSubmitting(true)
		setError(null)
		try {
			const rect = wrapper.getBoundingClientRect()
			const width = Math.max(1, Math.round(rect.width))
			const height = Math.max(1, Math.round(rect.height))
			const dataUrl = await captureAnnotatedArtifact({
				wrapper,
				rect,
				width,
				height,
				strokes,
				artifactName,
				hideDuringCapture: [popoverRef.current, fabRef.current].filter(
					Boolean,
				) as HTMLElement[],
			})
			await onSubmit(trimmed, dataUrl)
			// Stay in annotation mode — reviewers typically want to
			// drop several annotations in a single pass. They can exit
			// via the FAB when done.
			clearAll(false)
		} catch (err) {
			const message =
				err instanceof Error ? err.message : "Failed to submit annotation"
			setError(message)
		} finally {
			setSubmitting(false)
		}
	}, [artifactName, comment, onSubmit, strokes, clearAll])

	const activeStrokes = drafting ? [...strokes, drafting] : strokes

	return (
		<div className="space-y-3">
			{annotating && (
				<div
					role="status"
					aria-live="polite"
					className="flex items-center justify-between gap-2 flex-wrap text-xs px-3 py-2 rounded-md border border-teal-300 dark:border-teal-700 bg-teal-50 dark:bg-teal-900/30 text-teal-800 dark:text-teal-200"
				>
					<span>
						<span className="font-semibold">Annotation mode.</span> Drag to draw
						on the preview, then add a comment.
					</span>
					{hasAnnotation && (
						<button
							type="button"
							onClick={() => clearAll(false)}
							className="px-2 py-0.5 rounded border border-teal-400 dark:border-teal-600 text-teal-800 dark:text-teal-200 hover:bg-teal-100 dark:hover:bg-teal-900/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-stone-900"
						>
							Clear
						</button>
					)}
				</div>
			)}
			<div
				ref={wrapperRef}
				className="relative rounded-md overflow-hidden border border-stone-200 dark:border-stone-800 bg-white"
			>
				{children}
				<svg
					ref={svgRef}
					className={`absolute inset-0 w-full h-full ${annotating ? "cursor-crosshair" : "pointer-events-none"}`}
					onPointerDown={annotating ? startStroke : undefined}
					onPointerMove={annotating ? extendStroke : undefined}
					onPointerUp={annotating ? finishStroke : undefined}
					onPointerCancel={annotating ? finishStroke : undefined}
					aria-label={
						annotating ? "Draw annotations on this artifact" : undefined
					}
					aria-hidden={annotating ? undefined : "true"}
				>
					<title>Annotation overlay</title>
					{activeStrokes.map((s) => (
						<polyline
							key={s.id}
							points={s.points.map((p) => `${p.x},${p.y}`).join(" ")}
							fill="none"
							stroke="var(--color-annotation-pin-bg)"
							strokeWidth={3}
							strokeLinejoin="round"
							strokeLinecap="round"
						/>
					))}
				</svg>
			</div>
			{/*
			 * Floating FAB — toggles annotation mode. Rendered via
			 * `position: fixed` so it stays docked to the viewport
			 * bottom-right even as the reviewer scrolls through a long
			 * mockup. Hidden while the comment popover is open so the
			 * two don't stack on top of each other.
			 */}
			{!hasAnnotation && (
				<button
					ref={fabRef}
					type="button"
					onClick={() => setAnnotating((on) => !on)}
					aria-pressed={annotating}
					aria-label={
						annotating ? "Exit annotation mode" : "Enter annotation mode"
					}
					className={`fixed bottom-4 right-4 z-40 inline-flex items-center justify-center rounded-full shadow-lg w-12 h-12 border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-stone-900 ${
						annotating
							? "bg-teal-700 hover:bg-teal-800 border-teal-800 text-white"
							: "bg-white dark:bg-stone-900 border-stone-300 dark:border-stone-600 text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800"
					}`}
				>
					{/* Pencil glyph — single SVG path, no external dep. */}
					<svg
						aria-hidden="true"
						viewBox="0 0 24 24"
						width="22"
						height="22"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
						strokeLinejoin="round"
					>
						<path d="M12 20h9" />
						<path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
					</svg>
				</button>
			)}
			{hasAnnotation && (
				<>
					{/*
					 * Invisible spacer so the floating popover never covers the
					 * tail of the preview — matches the popover's own height so
					 * the page scrolls cleanly all the way to the end with the
					 * popover docked at the viewport bottom.
					 */}
					<div aria-hidden="true" className="h-48" />
					<div
						ref={popoverRef}
						role="dialog"
						aria-label={`Comment on ${artifactName}`}
						className="fixed bottom-4 right-4 left-4 sm:left-auto z-50 w-auto sm:w-[420px] max-w-[calc(100vw-2rem)] rounded-lg border-2 border-teal-400 dark:border-teal-700 bg-white dark:bg-stone-900 shadow-2xl p-3 space-y-2"
					>
						<label
							htmlFor={`annot-comment-${artifactName}`}
							className="block text-xs font-semibold text-stone-700 dark:text-stone-200"
						>
							Comment on <span className="font-mono">{artifactName}</span>
						</label>
						<textarea
							id={`annot-comment-${artifactName}`}
							value={comment}
							onChange={(e) => {
								setComment(e.target.value)
								if (error) setError(null)
							}}
							rows={3}
							placeholder="What's wrong / what should change here?"
							className="w-full text-sm p-2 rounded border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 focus:ring-2 focus:ring-teal-500 focus:outline-none resize-y"
						/>
						{error && (
							<p className="text-xs text-red-600 dark:text-red-400">{error}</p>
						)}
						<div className="flex items-center gap-2 justify-end">
							<button
								type="button"
								onClick={() => clearAll(true)}
								disabled={submitting}
								aria-disabled={submitting || undefined}
								className="px-3 py-1.5 rounded-md border border-stone-300 dark:border-stone-600 text-xs font-semibold text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 disabled:bg-stone-100 disabled:text-stone-600 disabled:border-stone-400 dark:disabled:bg-stone-800 dark:disabled:text-stone-300 dark:disabled:border-stone-500 disabled:cursor-not-allowed"
							>
								Cancel
							</button>
							<button
								type="button"
								onClick={handleSubmit}
								disabled={submitting || !comment.trim()}
								aria-disabled={submitting || !comment.trim() || undefined}
								className="px-3 py-1.5 rounded-md bg-teal-700 hover:bg-teal-800 text-xs font-semibold text-white disabled:bg-stone-200 disabled:text-stone-600 dark:disabled:bg-stone-700 dark:disabled:text-stone-300 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-stone-900"
							>
								{submitting ? "Submitting…" : "Submit feedback"}
							</button>
						</div>
					</div>
				</>
			)}
		</div>
	)
}

/** Render strokes into an off-screen SVG and serialise it as a data URL.
 *  Used as the fallback path when tab-capture permission is denied. */
function strokesToSvgDataUrl(args: {
	width: number
	height: number
	strokes: Stroke[]
	artifactName: string
}): string {
	const polylines = args.strokes
		.map((s) => {
			const pts = s.points
				.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`)
				.join(" ")
			return `<polyline points="${pts}" fill="none" stroke="${ANNOTATION_STROKE}" stroke-width="${ANNOTATION_STROKE_WIDTH}" stroke-linejoin="round" stroke-linecap="round"/>`
		})
		.join("")
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${args.width} ${args.height}" width="${args.width}" height="${args.height}"><title>Annotation strokes for ${args.artifactName}</title>${polylines}</svg>`
	return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`
}

/** Paint `strokes` onto an existing canvas context in the coordinate
 *  space the reviewer drew in. */
function paintStrokes(
	ctx: CanvasRenderingContext2D,
	strokes: Stroke[],
	scaleX: number,
	scaleY: number,
): void {
	ctx.strokeStyle = ANNOTATION_STROKE
	ctx.lineWidth = ANNOTATION_STROKE_WIDTH * Math.max(scaleX, scaleY)
	ctx.lineJoin = "round"
	ctx.lineCap = "round"
	strokes.forEach((s) => {
		if (s.points.length === 0) return
		ctx.beginPath()
		s.points.forEach((p, i) => {
			const x = p.x * scaleX
			const y = p.y * scaleY
			if (i === 0) ctx.moveTo(x, y)
			else ctx.lineTo(x, y)
		})
		ctx.stroke()
	})
}

/** Hide the passed elements for the duration of `fn`, restoring the
 *  original `visibility` inline style afterwards. Used to pull our own
 *  UI chrome (the comment popover, the annotation FAB) out of the
 *  captured frame without affecting layout — `visibility: hidden`
 *  leaves the element's box in place so the wrapper's bounding rect
 *  doesn't shift mid-capture. */
async function withElementsHidden<T>(
	elements: HTMLElement[],
	fn: () => Promise<T>,
): Promise<T> {
	const restorers = elements.map((el) => {
		const prev = el.style.visibility
		el.style.visibility = "hidden"
		return () => {
			el.style.visibility = prev
		}
	})
	// One rAF lets the browser flush the visibility change to the
	// compositor before we read the next video frame. Two rAFs give
	// getDisplayMedia's producer time to publish the updated frame
	// on platforms where the pipeline is 1-frame delayed.
	await new Promise<void>((resolve) => {
		requestAnimationFrame(() => {
			requestAnimationFrame(() => resolve())
		})
	})
	try {
		return await fn()
	} finally {
		restorers.forEach((r) => {
			r()
		})
	}
}

/** Capture the visible artifact region via `getDisplayMedia`, composite
 *  the reviewer's strokes on top, and return a PNG data URL. Throws if
 *  the browser lacks the API or the user rejects the permission — the
 *  caller is expected to catch and fall back. */
async function captureViaDisplayMedia(args: {
	rect: DOMRect
	width: number
	height: number
	strokes: Stroke[]
	hideDuringCapture: HTMLElement[]
}): Promise<string> {
	if (!navigator.mediaDevices?.getDisplayMedia) {
		throw new Error("getDisplayMedia not supported")
	}
	const stream = await navigator.mediaDevices.getDisplayMedia({
		video: {
			// Hint the browser to surface the current tab first so the
			// reviewer just has to click "Share" on a single option.
			// Not all browsers honor the hint but it's additive.
			// biome-ignore lint/suspicious/noExplicitAny: `preferCurrentTab` is a Chrome/Edge hint not yet in lib.dom.
			...({ displaySurface: "browser" } as any),
		},
		audio: false,
		// biome-ignore lint/suspicious/noExplicitAny: `preferCurrentTab` hint is browser-specific, not in the DisplayMediaStreamOptions type yet.
		...({ preferCurrentTab: true } as any),
	})
	try {
		const video = document.createElement("video")
		video.srcObject = stream
		video.muted = true
		await video.play()
		// Wait for the first painted frame so `videoWidth`/`videoHeight`
		// report the live dimensions of the captured surface.
		if (video.videoWidth === 0) {
			await new Promise<void>((resolve, reject) => {
				const onReady = () => {
					video.removeEventListener("loadedmetadata", onReady)
					video.removeEventListener("error", onErr)
					resolve()
				}
				const onErr = () => {
					video.removeEventListener("loadedmetadata", onReady)
					video.removeEventListener("error", onErr)
					reject(new Error("video load failed"))
				}
				video.addEventListener("loadedmetadata", onReady, { once: true })
				video.addEventListener("error", onErr, { once: true })
			})
		}

		// Output canvas holds the cropped artifact + stroke overlay at
		// the original device-pixel resolution so exported PNGs don't
		// look blurry when the AI reviewer zooms.
		const canvas = document.createElement("canvas")
		const ctx = canvas.getContext("2d")
		if (!ctx) throw new Error("2D canvas context unavailable")

		return await withElementsHidden(args.hideDuringCapture, async () => {
			// Map the wrapper's client-rect into the video-frame's
			// pixel space AFTER hiding chrome, so if hiding the
			// popover caused a reflow (shouldn't — `visibility:
			// hidden` preserves layout — but belt-and-suspenders) the
			// coordinates stay accurate.
			const viewportW = window.innerWidth
			const viewportH = window.innerHeight
			const scaleX = video.videoWidth / viewportW
			const scaleY = video.videoHeight / viewportH
			const cropX = Math.max(0, args.rect.left * scaleX)
			const cropY = Math.max(0, args.rect.top * scaleY)
			const cropW = Math.min(video.videoWidth - cropX, args.rect.width * scaleX)
			const cropH = Math.min(
				video.videoHeight - cropY,
				args.rect.height * scaleY,
			)
			canvas.width = Math.round(cropW)
			canvas.height = Math.round(cropH)
			ctx.drawImage(
				video,
				cropX,
				cropY,
				cropW,
				cropH,
				0,
				0,
				canvas.width,
				canvas.height,
			)
			// Overlay strokes. Reviewer coordinates are in wrapper-local
			// CSS pixels; scale them to the cropped canvas's pixel space.
			const overlayScaleX = canvas.width / args.width
			const overlayScaleY = canvas.height / args.height
			paintStrokes(ctx, args.strokes, overlayScaleX, overlayScaleY)
			return canvas.toDataURL("image/png")
		})
	} finally {
		stream.getTracks().forEach((t) => {
			t.stop()
		})
	}
}

/** Orchestrate capture: try tab capture first, fall back to
 *  strokes-only SVG on permission denial / missing API. */
async function captureAnnotatedArtifact(args: {
	wrapper: HTMLElement
	rect: DOMRect
	width: number
	height: number
	strokes: Stroke[]
	artifactName: string
	hideDuringCapture: HTMLElement[]
}): Promise<string> {
	try {
		return await captureViaDisplayMedia({
			rect: args.rect,
			width: args.width,
			height: args.height,
			strokes: args.strokes,
			hideDuringCapture: args.hideDuringCapture,
		})
	} catch (err) {
		// NotAllowedError = user denied / dismissed prompt. Anything
		// else is either an older browser or a platform issue — either
		// way, graceful degradation to vector strokes beats a hard
		// error that loses the reviewer's typed comment.
		console.warn(
			"[annotator] tab capture unavailable, falling back to SVG:",
			err instanceof Error ? err.message : err,
		)
		return strokesToSvgDataUrl({
			width: args.width,
			height: args.height,
			strokes: args.strokes,
			artifactName: args.artifactName,
		})
	}
}
