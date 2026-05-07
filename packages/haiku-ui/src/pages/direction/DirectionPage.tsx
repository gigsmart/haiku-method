/** biome-ignore-all lint/a11y/noNoninteractiveElementToInteractiveRole: archetype card container is a <fieldset role="radiogroup"> per WAI-ARIA radiogroup pattern */
/** biome-ignore-all lint/a11y/noStaticElementInteractions: preview-dialog backdrop click-to-close is a standard modal affordance alongside the close button and Escape handler */
/** biome-ignore-all lint/a11y/useKeyWithClickEvents: keyboard dismissal is handled at document level via the Escape handler in the parent component; the pin-drop overlay's pin placement is keyboard-reachable via the Tab-able pin buttons */
/**
 * DirectionPage — canonical implementation for /direction/:sessionId.
 *
 * Four submission modes:
 *   - `select`     — user picks one archetype as the final direction.
 *                   May add comments + visual pins on the chosen preview.
 *   - `regenerate` — user wants more / different variants. Marks archetypes
 *                   to keep; agent produces fresh variants for the rest.
 *   - `upload`     — designer provided finished designs. Skips archetype
 *                   generation entirely. Only available in intake mode
 *                   (when the picker opens with no archetypes).
 *   - `generate`   — intake-mode signal: user has nothing to upload and
 *                   wants the agent to produce variants. The agent then
 *                   re-opens this picker with archetypes attached.
 *
 * Intake mode (archetypes.length === 0) renders IntakePage instead of
 * the archetype radiogroup — users either upload finished designs or
 * click "Generate variants for me." This avoids burning generation
 * tokens on archetypes the user is going to throw away.
 *
 * Parameter sliders were removed (the legacy tuning model collapsed under
 * the "ask for more variants" flow — iterate on the archetype set instead
 * of tweaking knobs on a single one).
 */

import { type DesignArchetypeData, paths } from "haiku-api"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
	focusRingClass,
	touchTargetClass,
	useAnnounce,
	useFocusTrap,
} from "../../a11y"
import { useApiClient } from "../../api/context"
import { Card, SectionHeading } from "../../atoms/Card"
import { tryCloseTab } from "../../lib/tryCloseTab"
import { SubmitSuccess } from "../../molecules/SubmitSuccess"
import { ArtifactAnnotator } from "../../organisms/ArtifactAnnotator"

/** A single user-submitted annotation pass over the chosen preview.
 *  ArtifactAnnotator captures the rendered iframe via `getDisplayMedia`,
 *  composites the reviewer's strokes on top, and hands us back a PNG
 *  data URL. We collect these alongside the comment so the agent can
 *  see "this is what the user was looking at when they wrote this
 *  feedback" in addition to the freeform direction comment. */
interface PreviewAnnotation {
	comment: string
	screenshot_data_url: string
}

interface Props {
	session: { archetypes?: DesignArchetypeData[]; title?: string }
	sessionId: string
	wsRef?: React.RefObject<WebSocket | null>
}

type Mode = "select" | "regenerate"

export function DirectionPage({
	session,
	sessionId,
	wsRef,
}: Props): React.ReactElement {
	const archetypes = session.archetypes ?? []

	// Intake mode: archetypes empty → user picks between "I have designs to
	// upload" and "Generate variants for me." Skips archetype generation
	// when the user has uploads, which is the whole point of intake-first.
	// Branched at the top before hooks so the two paths each get their own
	// hook order (no rules-of-hooks violation).
	if (archetypes.length === 0) {
		return (
			<IntakePage
				sessionId={sessionId}
				title={session.title || "Design Direction"}
			/>
		)
	}
	return (
		<ArchetypePage session={session} sessionId={sessionId} wsRef={wsRef} />
	)
}

function ArchetypePage({
	session,
	sessionId,
	wsRef: _wsRef,
}: Props): React.ReactElement {
	const client = useApiClient()
	const announce = useAnnounce()

	const archetypes = useMemo(
		() => session.archetypes ?? [],
		[session.archetypes],
	)

	const [mode, setMode] = useState<Mode>("select")
	const [selectedArchetype, setSelectedArchetype] = useState<string>(
		archetypes[0]?.name ?? "",
	)
	const [keptArchetypes, setKeptArchetypes] = useState<Set<string>>(
		() => new Set(),
	)
	const [comment, setComment] = useState("")
	// Annotations submitted via the on-iframe ArtifactAnnotator.
	// Each pass = one comment + one screenshot data URL. Submitting
	// the form ships them all alongside the direction selection.
	const [annotations, setAnnotations] = useState<PreviewAnnotation[]>([])
	const [submitting, setSubmitting] = useState(false)
	const [errorMessage, setErrorMessage] = useState<string | null>(null)
	const [done, setDone] = useState(false)
	const [doneMessage, setDoneMessage] = useState("")
	const [previewArchetype, setPreviewArchetype] = useState<string | null>(null)

	const selectArchetype = useCallback((name: string) => {
		setSelectedArchetype(name)
		// Annotations are scoped to the chosen archetype — switching
		// archetypes drops them rather than mis-attaching them.
		setAnnotations([])
	}, [])

	const handleAnnotationSubmit = useCallback(
		(annotComment: string, screenshotDataUrl: string) => {
			setAnnotations((prev) => [
				...prev,
				{ comment: annotComment, screenshot_data_url: screenshotDataUrl },
			])
			return Promise.resolve()
		},
		[],
	)

	const toggleKeep = useCallback((name: string) => {
		setKeptArchetypes((prev) => {
			const next = new Set(prev)
			if (next.has(name)) next.delete(name)
			else next.add(name)
			return next
		})
	}, [])

	function handleRadiogroupKeyDown(
		e: React.KeyboardEvent<HTMLFieldSetElement>,
	) {
		if (archetypes.length === 0 || mode !== "select") return
		const names = archetypes.map((a) => a.name)
		const idx = names.indexOf(selectedArchetype)
		if (idx < 0) return
		let nextIdx: number | undefined
		if (e.key === "ArrowRight" || e.key === "ArrowDown") {
			nextIdx = (idx + 1) % names.length
		} else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
			nextIdx = (idx - 1 + names.length) % names.length
		}
		if (nextIdx !== undefined) {
			e.preventDefault()
			const target = names[nextIdx]
			if (target) {
				selectArchetype(target)
				const next = document.getElementById(radioIdFor(target))
				next?.focus()
			}
		}
	}

	const canSubmit = useMemo(() => {
		if (submitting) return false
		if (mode === "select") return selectedArchetype.length > 0
		// regenerate is always submittable — even an empty `keep` set is
		// meaningful ("none of these, give me a fresh batch")
		return true
	}, [mode, selectedArchetype, submitting])

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault()
		if (!canSubmit) return
		setSubmitting(true)
		setErrorMessage(null)
		try {
			if (mode === "select") {
				const wireAnnotations =
					annotations.length > 0
						? {
								screenshots: annotations.map((a) => ({
									comment: a.comment,
									screenshot_data_url: a.screenshot_data_url,
								})),
							}
						: undefined
				await client.submitDirection(sessionId, {
					mode: "select",
					archetype: selectedArchetype,
					...(comment ? { comments: comment } : {}),
					...(wireAnnotations ? { annotations: wireAnnotations } : {}),
				})
				announce("polite", "Direction selected")
				setDoneMessage(`Direction selected: ${selectedArchetype}`)
				setDone(true)
				tryCloseTab({
					url: paths.directionSelect(sessionId),
					body: {
						mode: "select",
						archetype: selectedArchetype,
						comments: comment,
						...(wireAnnotations ? { annotations: wireAnnotations } : {}),
					},
				})
			} else {
				const keepArr = Array.from(keptArchetypes)
				await client.submitDirection(sessionId, {
					mode: "regenerate",
					keep: keepArr,
					...(comment ? { comments: comment } : {}),
				})
				announce("polite", "Variant regeneration requested")
				setDoneMessage(
					keepArr.length > 0
						? `Asked for new variants — keeping ${keepArr.length} of ${archetypes.length}`
						: "Asked for a fresh batch of variants",
				)
				setDone(true)
				tryCloseTab({
					url: paths.directionSelect(sessionId),
					body: {
						mode: "regenerate",
						keep: keepArr,
						comments: comment,
					},
				})
			}
		} catch (err) {
			const message =
				err instanceof Error ? err.message : "Failed to submit direction"
			setErrorMessage(message)
			announce("assertive", `Submission failed: ${message}`)
			setSubmitting(false)
		}
	}

	useEffect(() => {
		if (!previewArchetype) return
		function onKey(e: KeyboardEvent) {
			if (e.key === "Escape") setPreviewArchetype(null)
		}
		document.addEventListener("keydown", onKey)
		return () => {
			if (typeof document === "undefined" || !document) return
			document.removeEventListener("keydown", onKey)
		}
	}, [previewArchetype])

	if (done) {
		return <SubmitSuccess message={doneMessage} />
	}

	const legendId = "direction-prompt-title"
	const commentId = "direction-comment"
	const selected = archetypes.find((a) => a.name === selectedArchetype)

	return (
		<form onSubmit={handleSubmit} noValidate>
			<Card>
				<ModeToggle
					mode={mode}
					onChange={(next) => {
						setMode(next)
						setErrorMessage(null)
					}}
					disabled={submitting}
				/>
			</Card>

			<Card>
				<ArchetypeRadiogroup
					mode={mode}
					legendId={legendId}
					title={session.title || "Design Direction"}
					archetypes={archetypes}
					selectedArchetype={selectedArchetype}
					keptArchetypes={keptArchetypes}
					submitting={submitting}
					onSelect={selectArchetype}
					onToggleKeep={toggleKeep}
					onKeyDown={handleRadiogroupKeyDown}
					onPreview={setPreviewArchetype}
				/>
			</Card>

			{mode === "select" && selected && (
				<Card>
					<SectionHeading>{selected.name} preview</SectionHeading>
					<p className="text-sm text-stone-600 dark:text-stone-300 mb-3">
						The preview is interactive by default. Click the pencil FAB
						(bottom-right) to enter annotation mode, draw on the surface, and
						add a comment. Each annotation pass is screenshotted via the
						browser's screen-share permission so the agent sees what you saw —
						same pattern as the review UI.
					</p>
					<ArtifactAnnotator
						artifactName={selected.name}
						onSubmit={handleAnnotationSubmit}
					>
						<iframe
							srcDoc={selected.preview_html}
							sandbox="allow-scripts allow-same-origin"
							title={`Preview: ${selected.name}`}
							aria-label={`Preview: ${selected.name}`}
							className="w-full h-[60vh] border-0 bg-white"
						/>
					</ArtifactAnnotator>
					{annotations.length > 0 && (
						<div className="mt-4 space-y-2">
							<p className="text-xs font-semibold uppercase tracking-wider text-stone-600 dark:text-stone-300">
								Captured annotations ({annotations.length})
							</p>
							<ul className="space-y-2">
								{annotations.map((a, i) => (
									<li
										key={`annot-${a.screenshot_data_url.slice(-32)}-${a.comment.slice(0, 16)}`}
										className="flex items-start gap-3 p-2 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900"
									>
										<img
											src={a.screenshot_data_url}
											alt={`Annotation ${i + 1} thumbnail`}
											className="shrink-0 w-24 h-16 object-cover rounded border border-stone-200 dark:border-stone-700"
										/>
										<div className="flex-1 min-w-0">
											<p className="text-xs text-stone-500 dark:text-stone-400 mb-1">
												Annotation {i + 1}
											</p>
											<p className="text-sm text-stone-800 dark:text-stone-100 break-words">
												{a.comment}
											</p>
										</div>
										<button
											type="button"
											onClick={() =>
												setAnnotations((prev) =>
													prev.filter((_, idx) => idx !== i),
												)
											}
											aria-label={`Remove annotation ${i + 1}`}
											className={`shrink-0 px-2 py-1 text-xs font-semibold rounded-md border border-stone-300 dark:border-stone-600 text-stone-700 dark:text-stone-200 hover:bg-red-50 hover:border-red-300 hover:text-red-700 dark:hover:bg-red-900/20 dark:hover:border-red-700 dark:hover:text-red-300 transition-colors ${focusRingClass}`}
										>
											Remove
										</button>
									</li>
								))}
							</ul>
							<p className="text-xs text-stone-500 dark:text-stone-400">
								These ship with the direction selection so the agent sees
								exactly what you were looking at when you commented.
							</p>
						</div>
					)}
				</Card>
			)}

			<Card>
				<label
					htmlFor={commentId}
					className="block text-sm font-medium text-stone-900 dark:text-stone-100 mb-2"
				>
					{mode === "select"
						? "Optional comment"
						: "What do you want to change? (steers the next batch)"}
				</label>
				<textarea
					id={commentId}
					className={`w-full p-3 border border-stone-300 dark:border-stone-600 rounded-lg bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 resize-y text-sm ${focusRingClass}`}
					rows={3}
					placeholder={
						mode === "select"
							? "Anything else worth noting about this direction..."
							: "More minimal, brighter palette, less text..."
					}
					value={comment}
					onChange={(e) => setComment(e.target.value)}
					disabled={submitting}
				/>
			</Card>

			<button
				type="submit"
				disabled={!canSubmit}
				aria-disabled={!canSubmit}
				className={`w-full px-6 py-3 bg-teal-700 hover:bg-teal-800 text-white font-semibold rounded-lg transition-colors ${focusRingClass} disabled:bg-green-300 disabled:text-green-800 dark:disabled:bg-green-900/40 dark:disabled:text-green-200 disabled:cursor-not-allowed ${touchTargetClass}`}
			>
				{submitting
					? "Submitting..."
					: mode === "select"
						? "Choose This Direction"
						: keptArchetypes.size > 0
							? `Generate more — keep ${keptArchetypes.size}`
							: "Generate a fresh batch"}
			</button>

			{errorMessage && (
				<div
					role="alert"
					className="mt-4 p-4 rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-200"
				>
					<p className="font-semibold">{errorMessage}</p>
				</div>
			)}

			{previewArchetype && (
				<PreviewDialog
					archetype={
						archetypes.find((a) => a.name === previewArchetype) ?? null
					}
					onClose={() => setPreviewArchetype(null)}
				/>
			)}
		</form>
	)
}

function radioIdFor(name: string): string {
	return `direction-radio-${name.replace(/\s+/g, "-").toLowerCase()}`
}

function keepIdFor(name: string): string {
	return `direction-keep-${name.replace(/\s+/g, "-").toLowerCase()}`
}

// ── Mode toggle ────────────────────────────────────────────────────────────

function ModeToggle({
	mode,
	onChange,
	disabled,
}: {
	mode: Mode
	onChange: (next: Mode) => void
	disabled: boolean
}): React.ReactElement {
	return (
		<fieldset className="border-0 p-0 m-0">
			<legend className="text-sm font-medium text-stone-900 dark:text-stone-100 mb-2">
				What do you want to do?
			</legend>
			<div className="flex flex-wrap gap-2">
				<ModeRadio
					value="select"
					label="Pick one of these"
					checked={mode === "select"}
					onChange={onChange}
					disabled={disabled}
				/>
				<ModeRadio
					value="regenerate"
					label="Show me different variants"
					checked={mode === "regenerate"}
					onChange={onChange}
					disabled={disabled}
				/>
			</div>
		</fieldset>
	)
}

function ModeRadio({
	value,
	label,
	checked,
	onChange,
	disabled,
}: {
	value: Mode
	label: string
	checked: boolean
	onChange: (next: Mode) => void
	disabled: boolean
}): React.ReactElement {
	const id = `direction-mode-${value}`
	return (
		<label
			htmlFor={id}
			className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${touchTargetClass} ${
				checked
					? "border-teal-600 dark:border-teal-400 bg-teal-50 dark:bg-teal-900/20"
					: "border-stone-200 dark:border-stone-700 hover:border-stone-400 dark:hover:border-stone-500"
			}`}
		>
			<input
				id={id}
				type="radio"
				name="direction-mode"
				value={value}
				checked={checked}
				aria-checked={checked}
				onChange={() => onChange(value)}
				disabled={disabled}
				className={`w-4 h-4 text-teal-600 ${focusRingClass}`}
			/>
			<span className="text-sm text-stone-900 dark:text-stone-100">
				{label}
			</span>
		</label>
	)
}

// ── Archetype radiogroup ───────────────────────────────────────────────────

interface ArchetypeRadiogroupProps {
	mode: Mode
	legendId: string
	title: string
	archetypes: DesignArchetypeData[]
	selectedArchetype: string
	keptArchetypes: Set<string>
	submitting: boolean
	onSelect: (name: string) => void
	onToggleKeep: (name: string) => void
	onKeyDown: (e: React.KeyboardEvent<HTMLFieldSetElement>) => void
	onPreview: (name: string) => void
}

function ArchetypeRadiogroup({
	mode,
	legendId,
	title,
	archetypes,
	selectedArchetype,
	keptArchetypes,
	submitting,
	onSelect,
	onToggleKeep,
	onKeyDown,
	onPreview,
}: ArchetypeRadiogroupProps): React.ReactElement {
	return (
		<fieldset
			role={mode === "select" ? "radiogroup" : undefined}
			aria-labelledby={legendId}
			onKeyDown={onKeyDown}
			className="border-0 p-0 m-0"
		>
			<legend
				id={legendId}
				className="text-lg font-semibold mb-3 text-stone-900 dark:text-stone-100"
			>
				{title}
			</legend>
			<p className="text-sm text-stone-600 dark:text-stone-300 mb-4">
				{mode === "select"
					? "Select an archetype, drop pins on its preview, then submit."
					: "Tick the ones worth keeping. The agent will replace the rest."}
			</p>

			<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{archetypes.map((arch) => {
					const isSelected = arch.name === selectedArchetype
					const isKept = keptArchetypes.has(arch.name)
					const radioId = radioIdFor(arch.name)
					const keepId = keepIdFor(arch.name)
					const highlighted = mode === "select" ? isSelected : isKept
					return (
						<div key={arch.name} className="relative">
							<label
								htmlFor={mode === "select" ? radioId : keepId}
								className={`group relative block w-full cursor-pointer rounded-xl border-2 p-4 text-left transition-colors ${
									highlighted
										? "border-teal-600 dark:border-teal-400 bg-teal-50 dark:bg-teal-900/20"
										: "border-stone-200 dark:border-stone-700 hover:border-stone-400 dark:hover:border-stone-500"
								}`}
							>
								<div className="flex items-center gap-2 mb-2">
									{mode === "select" ? (
										<input
											id={radioId}
											type="radio"
											name="direction"
											value={arch.name}
											checked={isSelected}
											aria-checked={isSelected}
											onChange={() => onSelect(arch.name)}
											disabled={submitting}
											className={`w-4 h-4 text-teal-600 ${focusRingClass}`}
										/>
									) : (
										<input
											id={keepId}
											type="checkbox"
											name={`direction-keep-${arch.name}`}
											checked={isKept}
											onChange={() => onToggleKeep(arch.name)}
											disabled={submitting}
											className={`w-4 h-4 text-teal-600 ${focusRingClass}`}
										/>
									)}
									<span className="font-semibold text-stone-900 dark:text-stone-100">
										{arch.name}
									</span>
								</div>
								<p className="text-sm text-stone-600 dark:text-stone-300 mb-3">
									{arch.description}
								</p>
								<iframe
									srcDoc={arch.preview_html}
									sandbox=""
									title={`Preview: ${arch.name}`}
									aria-label={`Preview: ${arch.name}`}
									className="w-full h-40 rounded-lg border border-stone-200 dark:border-stone-700 bg-white pointer-events-none"
								/>
							</label>
							<button
								type="button"
								onClick={() => onPreview(arch.name)}
								aria-label={`View full size preview: ${arch.name}`}
								className={`mt-2 text-xs text-teal-700 dark:text-teal-300 underline underline-offset-2 rounded-sm ${focusRingClass}`}
							>
								View full size
							</button>
						</div>
					)
				})}
			</div>
		</fieldset>
	)
}

// ── Preview dialog (full-size iframe) ───────────────────────────────────────

function PreviewDialog({
	archetype,
	onClose,
}: {
	archetype: { name: string; preview_html: string } | null
	onClose: () => void
}): React.ReactElement | null {
	const dialogRef = useRef<HTMLDivElement | null>(null)
	useFocusTrap(dialogRef, archetype !== null)

	if (!archetype) return null
	const titleId = "direction-preview-dialog-title"
	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center">
			<div
				aria-hidden="true"
				className="absolute inset-0 bg-black/60 backdrop-blur-sm"
				onClick={onClose}
			/>
			<div
				ref={dialogRef}
				role="dialog"
				aria-modal="true"
				aria-labelledby={titleId}
				className="relative bg-white dark:bg-stone-900 rounded-xl shadow-2xl"
				style={{ width: "90vw", height: "90vh" }}
			>
				<div className="flex items-center justify-between px-4 py-3 border-b border-stone-200 dark:border-stone-700">
					<h3
						id={titleId}
						className="font-semibold text-stone-900 dark:text-stone-100"
					>
						{archetype.name}
					</h3>
					<button
						type="button"
						onClick={onClose}
						aria-label="Dismiss preview"
						className={`text-stone-600 hover:text-stone-900 dark:text-stone-300 dark:hover:text-stone-100 text-xl leading-none px-2 ${focusRingClass}`}
					>
						&times;
					</button>
				</div>
				<iframe
					srcDoc={archetype.preview_html}
					sandbox=""
					title={`Full preview: ${archetype.name}`}
					className="w-full rounded-b-xl bg-white"
					style={{ height: "calc(90vh - 3rem)" }}
				/>
			</div>
		</div>
	)
}

// ── Intake page (no archetypes yet) ────────────────────────────────────────

interface IntakeFile {
	filename: string
	data_url: string
	caption: string
	preview_url: string
}

const ACCEPTED_INTAKE_MIMES =
	"image/png,image/jpeg,image/webp,image/svg+xml,image/gif,application/pdf"

function readFileAsDataUrl(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader()
		reader.onerror = () => reject(reader.error || new Error("read failed"))
		reader.onload = () => resolve(String(reader.result || ""))
		reader.readAsDataURL(file)
	})
}

function IntakePage({
	sessionId,
	title,
}: {
	sessionId: string
	title: string
}): React.ReactElement {
	const client = useApiClient()
	const announce = useAnnounce()

	const [files, setFiles] = useState<IntakeFile[]>([])
	const [comments, setComments] = useState("")
	const [submitting, setSubmitting] = useState(false)
	const [errorMessage, setErrorMessage] = useState<string | null>(null)
	const [done, setDone] = useState(false)
	const [doneMessage, setDoneMessage] = useState("")
	const [dragActive, setDragActive] = useState(false)
	const fileInputRef = useRef<HTMLInputElement | null>(null)

	const intakeLegendId = "intake-prompt-title"
	const captionsId = "intake-comments"
	const dropzoneLabelId = "intake-dropzone-label"

	const ingestFiles = useCallback(async (incoming: FileList | File[]) => {
		const list = Array.from(incoming)
		if (list.length === 0) return
		const accepted: IntakeFile[] = []
		for (const f of list) {
			// Per-file cap mirrors the wire schema's 1.5 MB data_url limit.
			// Base64 inflates by ~33%, so the raw cap is ~1.1 MB; round to
			// 1.5 MB on the wire side so the picker matches.
			if (f.size > 1_500_000) {
				announce(
					"assertive",
					`File ${f.name} is too large (${(f.size / 1024 / 1024).toFixed(1)} MB > 1.5 MB)`,
				)
				continue
			}
			try {
				const dataUrl = await readFileAsDataUrl(f)
				accepted.push({
					filename: f.name,
					data_url: dataUrl,
					caption: "",
					preview_url: dataUrl,
				})
			} catch (err) {
				announce(
					"assertive",
					`Could not read ${f.name}: ${err instanceof Error ? err.message : String(err)}`,
				)
			}
		}
		if (accepted.length === 0) return
		setFiles((prev) => {
			// Cap the in-memory list at 20 to match the wire schema. Excess
			// files are dropped silently with an announcement; the user can
			// retry after removing some.
			const merged = [...prev, ...accepted]
			if (merged.length > 20) {
				announce(
					"assertive",
					`Only the first 20 files are kept (${merged.length - 20} dropped)`,
				)
				return merged.slice(0, 20)
			}
			return merged
		})
	}, [announce])

	const removeFile = useCallback((idx: number) => {
		setFiles((prev) => prev.filter((_, i) => i !== idx))
	}, [])

	const updateCaption = useCallback((idx: number, caption: string) => {
		setFiles((prev) => prev.map((f, i) => (i === idx ? { ...f, caption } : f)))
	}, [])

	const handleDrop = useCallback(
		(e: React.DragEvent<HTMLLabelElement>) => {
			e.preventDefault()
			setDragActive(false)
			void ingestFiles(e.dataTransfer.files)
		},
		[ingestFiles],
	)

	const handleDragOver = useCallback((e: React.DragEvent<HTMLLabelElement>) => {
		e.preventDefault()
		setDragActive(true)
	}, [])

	const handleDragLeave = useCallback(() => {
		setDragActive(false)
	}, [])

	const handleFileInput = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			if (e.target.files) void ingestFiles(e.target.files)
			// Allow re-selecting the same file after removal
			e.target.value = ""
		},
		[ingestFiles],
	)

	async function submitUploads(e: React.FormEvent) {
		e.preventDefault()
		if (submitting || files.length === 0) return
		setSubmitting(true)
		setErrorMessage(null)
		try {
			const wireFiles = files.map((f) => ({
				filename: f.filename,
				data_url: f.data_url,
				...(f.caption ? { caption: f.caption } : {}),
			}))
			await client.submitDirection(sessionId, {
				mode: "upload",
				files: wireFiles,
				...(comments ? { comments } : {}),
			})
			announce(
				"polite",
				`Uploaded ${files.length} design${files.length === 1 ? "" : "s"}`,
			)
			setDoneMessage(
				`Uploaded ${files.length} design${files.length === 1 ? "" : "s"} as the chosen direction.`,
			)
			setDone(true)
			tryCloseTab({
				url: paths.directionSelect(sessionId),
				body: {
					mode: "upload",
					files: wireFiles,
					comments,
				},
			})
		} catch (err) {
			const message =
				err instanceof Error ? err.message : "Failed to upload designs"
			setErrorMessage(message)
			announce("assertive", `Upload failed: ${message}`)
			setSubmitting(false)
		}
	}

	async function submitGenerate() {
		if (submitting) return
		setSubmitting(true)
		setErrorMessage(null)
		try {
			await client.submitDirection(sessionId, {
				mode: "generate",
				...(comments ? { comments } : {}),
			})
			announce("polite", "Asked the agent to generate variants")
			setDoneMessage(
				"The agent will now generate design variants and re-open the picker.",
			)
			setDone(true)
			tryCloseTab({
				url: paths.directionSelect(sessionId),
				body: {
					mode: "generate",
					comments,
				},
			})
		} catch (err) {
			const message =
				err instanceof Error ? err.message : "Failed to request generation"
			setErrorMessage(message)
			announce("assertive", `Request failed: ${message}`)
			setSubmitting(false)
		}
	}

	if (done) return <SubmitSuccess message={doneMessage} />

	const hasFiles = files.length > 0
	return (
		<form onSubmit={submitUploads} noValidate>
			<Card>
				<div className="mb-4">
					<h2
						id={intakeLegendId}
						className="text-lg font-semibold text-stone-900 dark:text-stone-100"
					>
						{title}
					</h2>
					<p className="text-sm text-stone-600 dark:text-stone-300 mt-2">
						Already have designs? Upload them and the agent will use those as
						the direction. No designs yet? Have the agent generate variants for
						you to choose from.
					</p>
				</div>
			</Card>

			<Card>
				<SectionHeading>I have designs to upload</SectionHeading>
				<p className="text-sm text-stone-600 dark:text-stone-300 mb-3">
					Drop image files (PNG, JPG, WebP, SVG, GIF) or PDFs here. Max 20
					files, 1.5 MB each. Add a caption per file so the agent knows what
					each artefact represents.
				</p>
				<input
					ref={fileInputRef}
					type="file"
					accept={ACCEPTED_INTAKE_MIMES}
					multiple
					onChange={handleFileInput}
					className="sr-only"
					aria-labelledby={dropzoneLabelId}
					id="intake-file-input"
				/>
				<label
					id={dropzoneLabelId}
					htmlFor="intake-file-input"
					onDrop={handleDrop}
					onDragOver={handleDragOver}
					onDragLeave={handleDragLeave}
					className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-xl p-8 cursor-pointer transition-colors ${
						dragActive
							? "border-teal-600 dark:border-teal-400 bg-teal-50 dark:bg-teal-900/20"
							: "border-stone-300 dark:border-stone-600 hover:border-stone-400 dark:hover:border-stone-500"
					} ${focusRingClass}`}
				>
					<span className="text-sm font-medium text-stone-900 dark:text-stone-100">
						{dragActive
							? "Drop to add"
							: "Drag files here, or click to browse"}
					</span>
					<span className="text-xs text-stone-500 dark:text-stone-400">
						{hasFiles
							? `${files.length} of 20 added`
							: "PNG, JPG, WebP, SVG, GIF, or PDF"}
					</span>
				</label>

				{hasFiles && (
					<ul className="mt-4 space-y-3">
						{files.map((f, i) => (
							<li
								key={`intake-${i}-${f.filename}`}
								className="flex items-start gap-3 p-3 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900"
							>
								{f.preview_url.startsWith("data:image/") ? (
									<img
										src={f.preview_url}
										alt={`Preview of ${f.filename}`}
										className="shrink-0 w-20 h-20 object-cover rounded border border-stone-200 dark:border-stone-700 bg-white"
									/>
								) : (
									<div className="shrink-0 w-20 h-20 flex items-center justify-center rounded border border-stone-200 dark:border-stone-700 bg-stone-100 dark:bg-stone-800 text-xs text-stone-600 dark:text-stone-300 uppercase">
										{f.filename.split(".").pop() || "file"}
									</div>
								)}
								<div className="flex-1 min-w-0 space-y-2">
									<p
										className="text-sm font-medium text-stone-900 dark:text-stone-100 truncate"
										title={f.filename}
									>
										{f.filename}
									</p>
									<input
										type="text"
										value={f.caption}
										onChange={(e) => updateCaption(i, e.target.value)}
										placeholder="Caption (e.g. mobile dashboard, logged-in state)"
										disabled={submitting}
										aria-label={`Caption for ${f.filename}`}
										className={`w-full px-3 py-2 text-sm border border-stone-300 dark:border-stone-600 rounded-md bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 ${focusRingClass}`}
									/>
								</div>
								<button
									type="button"
									onClick={() => removeFile(i)}
									aria-label={`Remove ${f.filename}`}
									disabled={submitting}
									className={`shrink-0 px-2 py-1 text-xs font-semibold rounded-md border border-stone-300 dark:border-stone-600 text-stone-700 dark:text-stone-200 hover:bg-red-50 hover:border-red-300 hover:text-red-700 dark:hover:bg-red-900/20 dark:hover:border-red-700 dark:hover:text-red-300 transition-colors ${focusRingClass}`}
								>
									Remove
								</button>
							</li>
						))}
					</ul>
				)}
			</Card>

			<Card>
				<label
					htmlFor={captionsId}
					className="block text-sm font-medium text-stone-900 dark:text-stone-100 mb-2"
				>
					Notes for the agent (optional)
				</label>
				<textarea
					id={captionsId}
					className={`w-full p-3 border border-stone-300 dark:border-stone-600 rounded-lg bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 resize-y text-sm ${focusRingClass}`}
					rows={3}
					placeholder={
						hasFiles
							? "What should the agent honour about these designs..."
							: "Anything to steer the variant generation..."
					}
					value={comments}
					onChange={(e) => setComments(e.target.value)}
					disabled={submitting}
				/>
			</Card>

			<button
				type="submit"
				disabled={!hasFiles || submitting}
				aria-disabled={!hasFiles || submitting}
				className={`w-full px-6 py-3 bg-teal-700 hover:bg-teal-800 text-white font-semibold rounded-lg transition-colors ${focusRingClass} disabled:bg-stone-200 disabled:text-stone-500 dark:disabled:bg-stone-800 dark:disabled:text-stone-500 disabled:cursor-not-allowed ${touchTargetClass}`}
			>
				{submitting
					? "Submitting..."
					: hasFiles
						? `Use these ${files.length} design${files.length === 1 ? "" : "s"} as the direction`
						: "Add files above to upload"}
			</button>

			<div className="my-6 flex items-center gap-3 text-xs uppercase tracking-wider text-stone-500 dark:text-stone-400">
				<span className="flex-1 h-px bg-stone-200 dark:bg-stone-700" />
				<span>or</span>
				<span className="flex-1 h-px bg-stone-200 dark:bg-stone-700" />
			</div>

			<button
				type="button"
				onClick={submitGenerate}
				disabled={submitting}
				aria-disabled={submitting}
				className={`w-full px-6 py-3 bg-white dark:bg-stone-900 hover:bg-stone-50 dark:hover:bg-stone-800 border-2 border-stone-300 dark:border-stone-600 text-stone-900 dark:text-stone-100 font-semibold rounded-lg transition-colors ${focusRingClass} disabled:bg-stone-100 disabled:text-stone-500 dark:disabled:bg-stone-800 dark:disabled:text-stone-500 disabled:cursor-not-allowed ${touchTargetClass}`}
			>
				Generate variants for me instead
			</button>
			<p className="mt-2 text-xs text-stone-500 dark:text-stone-400 text-center">
				The agent will produce 2-3 design archetypes for you to pick from.
			</p>

			{errorMessage && (
				<div
					role="alert"
					className="mt-4 p-4 rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-200"
				>
					<p className="font-semibold">{errorMessage}</p>
				</div>
			)}
		</form>
	)
}
