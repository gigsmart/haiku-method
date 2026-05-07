/**
 * KnowledgeDropZone — drop-target + click-to-browse affordance for the
 * Knowledge Upload Panel (DESIGN-BRIEF.md Screen 1, unit-11).
 *
 * Pure leaf atom: emits `File[]` via `onFiles` after pre-stage validation.
 * Validation rejections are reported via `onReject` so the parent panel
 * can surface a `text-xs text-rose-600` message + announce them in the
 * polite live region. The zone never owns "staged" state; the parent
 * (KnowledgeUploadPanel) owns it.
 *
 * A11y contract (DESIGN-BRIEF.md Screen 1 §"Accessibility requirements"):
 *   - role="button", tabIndex={0}, aria-label="Upload knowledge file"
 *     (literal string asserted in tests).
 *   - Enter / Space activates the hidden <input type="file" multiple>.
 *   - Drag-over scale (transform) is suppressed under
 *     prefers-reduced-motion (the global CSS guard already clamps it to
 *     0.01ms — we additionally drop the scale class to satisfy
 *     visual-regression / reduced-motion tests asserting on className).
 *
 * Token discipline (DESIGN-TOKENS.md §1.3.4 + §1.4):
 *   - All colors via Tailwind utilities mapped to existing tokens or the
 *     new `--color-upload-affordance-*` tokens added to @theme in
 *     index.css. No raw hex.
 *   - Light + dark pairs for every color utility.
 *   - 44 × 44 minimum touch target via `.touch-target` (the zone itself
 *     is large enough; no augmented hit-area needed).
 */

import {
	type DragEvent,
	type KeyboardEvent,
	useCallback,
	useId,
	useRef,
	useState,
} from "react"
import { touchTargetClass, useReducedMotion } from "../a11y"

export interface KnowledgeDropZoneProps {
	/** Accepted MIME types or extensions (forwarded to `<input accept>`). */
	accept?: string
	/** Maximum bytes per file. Defaults to 10 MiB per Screen 1 spec. */
	maxBytes?: number
	/** Called with files that passed validation. */
	onFiles: (files: File[]) => void
	/**
	 * Called with one entry per rejected file. Parent surfaces the
	 * message as `text-xs text-rose-600` + announces in the polite live
	 * region (DESIGN-BRIEF Path D).
	 */
	onReject?: (rejections: Array<{ file: File; reason: string }>) => void
	disabled?: boolean
	/** Forces the collapsed mobile variant — single full-width "Add files"
	 *  button with no drag affordance (DESIGN-BRIEF Screen 1 §Responsive
	 *  375 px). The panel decides via `useIsMobile()`. */
	collapsedVariant?: boolean
	/** Optional id for the input element. Mostly for tests. */
	inputId?: string
}

const DEFAULT_MAX_BYTES = 10 * 1024 * 1024 // 10 MiB
// Knowledge artifacts are read by the agent (no privilege concern) and
// served back to reviewers through `serveFile`, which downgrades any
// non-allowlisted MIME to `application/octet-stream` +
// `Content-Disposition: attachment` (see http/path-safety.ts) — so an
// upload-time extension allowlist is redundant belt-and-suspenders. Real-
// world cases this used to break: designers exporting `.html` from
// Sketch / Figma, researchers uploading `.docx` / `.xlsx` / `.csv`, etc.
// Default to "*" — accept anything; the size cap is the only real limit.
const DEFAULT_ACCEPT = "*"

function classifyMimeMismatch(file: File, accept: string): string | null {
	if (!accept || accept === "*" || accept === "*/*") return null
	const tokens = accept
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean)
	if (tokens.length === 0) return null
	const name = file.name.toLowerCase()
	const type = file.type.toLowerCase()
	for (const token of tokens) {
		const lower = token.toLowerCase()
		if (lower.startsWith(".")) {
			if (name.endsWith(lower)) return null
		} else if (lower.endsWith("/*")) {
			const prefix = lower.slice(0, lower.length - 1)
			if (type.startsWith(prefix)) return null
		} else if (type === lower) {
			return null
		}
	}
	return `File type not accepted: ${file.name}`
}

function validate(
	files: File[],
	accept: string,
	maxBytes: number,
): { accepted: File[]; rejected: Array<{ file: File; reason: string }> } {
	const accepted: File[] = []
	const rejected: Array<{ file: File; reason: string }> = []
	for (const file of files) {
		if (file.size > maxBytes) {
			rejected.push({
				file,
				reason: `File exceeds size limit: ${file.name}`,
			})
			continue
		}
		const mimeError = classifyMimeMismatch(file, accept)
		if (mimeError) {
			rejected.push({ file, reason: mimeError })
			continue
		}
		accepted.push(file)
	}
	return { accepted, rejected }
}

export function KnowledgeDropZone({
	accept = DEFAULT_ACCEPT,
	maxBytes = DEFAULT_MAX_BYTES,
	onFiles,
	onReject,
	disabled = false,
	collapsedVariant = false,
	inputId,
}: KnowledgeDropZoneProps): React.ReactElement {
	const inputRef = useRef<HTMLInputElement | null>(null)
	const generatedId = useId()
	const id = inputId ?? generatedId
	const [dragOver, setDragOver] = useState(false)
	const reducedMotion = useReducedMotion()

	const handleFiles = useCallback(
		(fileList: FileList | null) => {
			if (!fileList || fileList.length === 0) return
			const arr: File[] = []
			for (let i = 0; i < fileList.length; i += 1) {
				const item = fileList.item(i)
				if (item) arr.push(item)
			}
			const { accepted, rejected } = validate(arr, accept, maxBytes)
			if (rejected.length > 0 && onReject) onReject(rejected)
			if (accepted.length > 0) onFiles(accepted)
		},
		[accept, maxBytes, onFiles, onReject],
	)

	const openPicker = useCallback(() => {
		if (disabled) return
		inputRef.current?.click()
	}, [disabled])

	const onKeyDown = useCallback(
		(event: KeyboardEvent<HTMLDivElement>) => {
			if (disabled) return
			if (event.key === "Enter" || event.key === " ") {
				event.preventDefault()
				openPicker()
			}
		},
		[disabled, openPicker],
	)

	const onDragOver = useCallback(
		(event: DragEvent<HTMLDivElement>) => {
			if (disabled) return
			event.preventDefault()
			setDragOver(true)
		},
		[disabled],
	)

	const onDragLeave = useCallback(() => {
		setDragOver(false)
	}, [])

	const onDrop = useCallback(
		(event: DragEvent<HTMLDivElement>) => {
			if (disabled) return
			event.preventDefault()
			setDragOver(false)
			handleFiles(event.dataTransfer.files)
		},
		[disabled, handleFiles],
	)

	if (collapsedVariant) {
		// 375 px (mobile drawer) — single full-width button, no drag affordance.
		return (
			<>
				<button
					type="button"
					aria-label="Upload knowledge file"
					data-testid="knowledge-drop-zone"
					disabled={disabled}
					onClick={openPicker}
					className={`${touchTargetClass} h-12 w-full rounded-lg border-2 border-dashed border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 text-sm font-medium text-[var(--color-upload-affordance-label-fg)] hover:border-teal-400 hover:bg-teal-50/40 dark:hover:bg-teal-900/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-stone-900 disabled:cursor-not-allowed disabled:bg-stone-100 disabled:text-stone-600 disabled:border-stone-400 dark:disabled:bg-stone-800 dark:disabled:text-stone-300 dark:disabled:border-stone-500`}
				>
					+ Add files
				</button>
				<input
					ref={inputRef}
					id={id}
					type="file"
					multiple
					accept={accept}
					disabled={disabled}
					data-testid="knowledge-drop-zone-input"
					className="sr-only"
					onChange={(event) => {
						handleFiles(event.target.files)
						// Clear the input so re-selecting the same file fires onChange.
						event.target.value = ""
					}}
				/>
			</>
		)
	}

	const stateClasses = disabled
		? "cursor-not-allowed bg-stone-100 dark:bg-stone-800 border-stone-400 dark:border-stone-500 text-stone-600 dark:text-stone-300"
		: dragOver
			? `border-teal-500 bg-[var(--color-upload-affordance-bg-dragover)] ${reducedMotion ? "" : "scale-[1.01]"}`
			: "border-stone-300 dark:border-stone-700 hover:border-teal-400 hover:bg-[var(--color-upload-affordance-bg-hover)]"

	return (
		<>
			{/* biome-ignore lint/a11y/useSemanticElements: DESIGN-BRIEF Screen 1 §"Accessibility requirements" mandates <div role="button"> drop zone (NOT <button>) so HTML5 drag-drop events bubble correctly — a native <button> swallows drag events on most browsers. The literal role="button" is asserted by the unit-11 regression test (SPA-UI-SPECS.md §1.4). */}
			<div
				role="button"
				tabIndex={disabled ? -1 : 0}
				aria-label="Upload knowledge file"
				aria-disabled={disabled || undefined}
				data-testid="knowledge-drop-zone"
				data-dragover={dragOver || undefined}
				data-reduced-motion={reducedMotion || undefined}
				onClick={openPicker}
				onKeyDown={onKeyDown}
				onDragEnter={onDragOver}
				onDragOver={onDragOver}
				onDragLeave={onDragLeave}
				onDrop={onDrop}
				className={`${touchTargetClass} flex min-h-[112px] md:min-h-[128px] flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 text-center text-sm transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-stone-900 ${stateClasses}`}
			>
				<span
					aria-hidden="true"
					className="text-2xl text-[var(--color-upload-affordance-fg)]"
				>
					{dragOver ? "+" : "↑"}
				</span>
				<span className="font-medium text-[var(--color-upload-affordance-label-fg)]">
					{dragOver ? "Drop to stage" : "Drop files here"}
				</span>
				<span className="text-xs text-stone-600 dark:text-stone-300">
					or click to browse
				</span>
				<span className="text-xs text-stone-600 dark:text-stone-300">
					{accept === "*" || accept === "*/*"
						? `any file type · max ${Math.round(maxBytes / (1024 * 1024))} MB each`
						: `${accept.replace(/,/g, "  ")} · max ${Math.round(maxBytes / (1024 * 1024))} MB each`}
				</span>
			</div>
			<input
				ref={inputRef}
				id={id}
				type="file"
				multiple
				accept={accept}
				disabled={disabled}
				data-testid="knowledge-drop-zone-input"
				className="sr-only"
				onChange={(event) => {
					handleFiles(event.target.files)
					event.target.value = ""
				}}
			/>
		</>
	)
}
