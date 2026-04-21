/**
 * DirectionPage — canonical implementation for /direction/:sessionId.
 *
 * Structure per unit-14 spec:
 *   - Card grid of design archetypes as native <input type="radio"> inside
 *     <label>, wrapped in <fieldset role="radiogroup" aria-labelledby="…">.
 *   - Each card renders a small sandboxed <iframe srcDoc> preview. The
 *     "View Full Size" trigger sits as a sibling of the radio label to avoid
 *     nested-interactive a11y violations.
 *   - Parameter sliders use the canonical `<Input>` primitive from unit-04.
 *   - Optional comment textarea (local state only — TODO: include once the
 *     DirectionSelectRequest schema carries comment/annotations).
 *   - Submit posts { archetype, parameters } via ApiClient.submitDirection.
 */

import type { DirectionSessionPayload } from "haiku-api"
import { useCallback, useEffect, useMemo, useState } from "react"
import { focusRingClass, touchTargetClass, useAnnounce } from "../../a11y"
import { useApiClient } from "../../api/context"
import { Card, SectionHeading } from "../../components/Card"
import { Input } from "../../components/primitives"
import { SubmitSuccess } from "../../components/SubmitSuccess"
import { tryCloseTab } from "../../hooks/useSession"

interface Props {
	session: DirectionSessionPayload
	sessionId: string
	wsRef?: React.RefObject<WebSocket | null>
}

export function DirectionPage({
	session,
	sessionId,
	wsRef: _wsRef,
}: Props): React.ReactElement {
	const client = useApiClient()
	const announce = useAnnounce()

	const archetypes = useMemo(() => session.archetypes ?? [], [session.archetypes])
	const parameters = useMemo(() => session.parameters ?? [], [session.parameters])

	const [selectedArchetype, setSelectedArchetype] = useState<string>(
		archetypes[0]?.name ?? "",
	)
	const [paramValues, setParamValues] = useState<Record<string, number>>(() => {
		const base: Record<string, number> = {}
		for (const p of parameters) base[p.name] = p.default
		if (archetypes[0]) {
			for (const [k, v] of Object.entries(archetypes[0].default_parameters)) {
				base[k] = v
			}
		}
		return base
	})
	const [comment, setComment] = useState("")
	const [submitting, setSubmitting] = useState(false)
	const [errorMessage, setErrorMessage] = useState<string | null>(null)
	const [done, setDone] = useState(false)
	const [previewArchetype, setPreviewArchetype] = useState<string | null>(null)

	const selectArchetype = useCallback(
		(name: string) => {
			setSelectedArchetype(name)
			const arch = archetypes.find((a) => a.name === name)
			if (arch) {
				setParamValues((prev) => ({ ...prev, ...arch.default_parameters }))
			}
		},
		[archetypes],
	)

	function setParam(name: string, value: number) {
		setParamValues((prev) => ({ ...prev, [name]: value }))
	}

	function handleRadiogroupKeyDown(e: React.KeyboardEvent<HTMLFieldSetElement>) {
		if (archetypes.length === 0) return
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
				// Move focus to the newly-selected radio for proper radiogroup UX.
				const next = document.getElementById(radioIdFor(target))
				next?.focus()
			}
		}
	}

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault()
		if (!selectedArchetype || submitting) return
		setSubmitting(true)
		setErrorMessage(null)
		try {
			// TODO(haiku-api-contract): include `comment` + `annotations` in
			// DirectionSelectRequest once the haiku-api schema is extended. The
			// comment is collected in local state above but is NOT sent on the
			// wire — the schema currently accepts only { archetype, parameters }.
			await client.submitDirection(sessionId, {
				archetype: selectedArchetype,
				parameters: paramValues,
			})
			announce("polite", "Direction selected")
			setDone(true)
			tryCloseTab({
				url: `/direction/${sessionId}/select`,
				body: { archetype: selectedArchetype, parameters: paramValues, comment },
			})
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
		return () => document.removeEventListener("keydown", onKey)
	}, [previewArchetype])

	if (done) {
		return <SubmitSuccess message={`Direction selected: ${selectedArchetype}`} />
	}

	const legendId = "direction-prompt-title"
	const commentId = "direction-comment"

	return (
		<form onSubmit={handleSubmit} noValidate>
			<Card>
				<fieldset
					role="radiogroup"
					aria-labelledby={legendId}
					onKeyDown={handleRadiogroupKeyDown}
					className="border-0 p-0 m-0"
				>
					<legend
						id={legendId}
						className="text-lg font-semibold mb-3 text-stone-900 dark:text-stone-100"
					>
						{session.title || "Design Direction"}
					</legend>
					<p className="text-sm text-stone-600 dark:text-stone-300 mb-4">
						Select an archetype, tune the parameters, then submit.
					</p>

					<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
						{archetypes.map((arch) => {
							const selected = arch.name === selectedArchetype
							const radioId = radioIdFor(arch.name)
							return (
								<div key={arch.name} className="relative">
									<label
										htmlFor={radioId}
										className={`group relative block w-full cursor-pointer rounded-xl border-2 p-4 text-left transition-colors ${
											selected
												? "border-teal-600 dark:border-teal-400 bg-teal-50 dark:bg-teal-900/20"
												: "border-stone-200 dark:border-stone-700 hover:border-stone-400 dark:hover:border-stone-500"
										}`}
									>
										<div className="flex items-center gap-2 mb-2">
											<input
												id={radioId}
												type="radio"
												name="direction"
												value={arch.name}
												checked={selected}
												aria-checked={selected}
												onChange={() => selectArchetype(arch.name)}
												disabled={submitting}
												className={`w-4 h-4 text-teal-600 ${focusRingClass}`}
											/>
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
										onClick={() => setPreviewArchetype(arch.name)}
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
			</Card>

			{parameters.length > 0 && (
				<Card>
					<SectionHeading>Parameters</SectionHeading>
					<div className="space-y-5">
						{parameters.map((p) => {
							const inputId = `param-${p.name}`
							return (
								<div key={p.name}>
									<div className="flex items-center justify-between mb-1">
										<label
											htmlFor={inputId}
											className="text-sm font-medium text-stone-900 dark:text-stone-100"
										>
											{p.label}
										</label>
										<output
											htmlFor={inputId}
											className="text-sm font-mono text-teal-700 dark:text-teal-300"
										>
											{paramValues[p.name] ?? p.default}
										</output>
									</div>
									<p className="text-xs text-stone-600 dark:text-stone-300 mb-2">
										{p.description}
									</p>
									<div className="flex items-center gap-3">
										<span className="text-xs text-stone-600 dark:text-stone-300 w-16 text-right shrink-0">
											{p.labels.low}
										</span>
										<Input
											id={inputId}
											name={p.name}
											type="range"
											min={p.min}
											max={p.max}
											step={p.step}
											value={paramValues[p.name] ?? p.default}
											onChange={(e) =>
												setParam(
													p.name,
													Number.parseFloat(
														(e.target as HTMLInputElement).value,
													),
												)
											}
											disabled={submitting}
											aria-label={p.label}
											className="flex-1 accent-teal-600 dark:accent-teal-400"
										/>
										<span className="text-xs text-stone-600 dark:text-stone-300 w-16 shrink-0">
											{p.labels.high}
										</span>
									</div>
								</div>
							)
						})}
					</div>
				</Card>
			)}

			<Card>
				<label
					htmlFor={commentId}
					className="block text-sm font-medium text-stone-900 dark:text-stone-100 mb-2"
				>
					Optional comment
				</label>
				<textarea
					id={commentId}
					className={`w-full p-3 border border-stone-300 dark:border-stone-600 rounded-lg bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 resize-y text-sm ${focusRingClass}`}
					rows={3}
					placeholder="Anything else worth noting about this direction..."
					value={comment}
					onChange={(e) => setComment(e.target.value)}
					disabled={submitting}
				/>
			</Card>

			<button
				type="submit"
				disabled={submitting || !selectedArchetype}
				aria-disabled={submitting || !selectedArchetype}
				className={`w-full px-6 py-3 bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-lg transition-colors ${focusRingClass} disabled:bg-green-300 disabled:text-green-800 dark:disabled:bg-green-900/40 dark:disabled:text-green-200 disabled:cursor-not-allowed ${touchTargetClass}`}
			>
				{submitting ? "Submitting..." : "Choose This Direction"}
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

// ── Preview dialog (full-size iframe) ───────────────────────────────────────

function PreviewDialog({
	archetype,
	onClose,
}: {
	archetype: { name: string; preview_html: string } | null
	onClose: () => void
}): React.ReactElement | null {
	if (!archetype) return null
	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: modal dialog backdrop; click-to-close is a standard modal affordance alongside the close button and Escape handler
		// biome-ignore lint/a11y/useKeyWithClickEvents: keyboard dismissal is handled at document level via the Escape handler in the parent component
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
			onClick={onClose}
			role="dialog"
			aria-modal="true"
			aria-label={`Full size preview: ${archetype.name}`}
		>
			{/* biome-ignore lint/a11y/noStaticElementInteractions: inner container traps click events so they don't close the modal */}
			{/* biome-ignore lint/a11y/useKeyWithClickEvents: stopPropagation suppresses backdrop close on inner clicks; not a user affordance */}
			<div
				className="relative bg-white dark:bg-stone-900 rounded-xl shadow-2xl"
				style={{ width: "90vw", height: "90vh" }}
				onClick={(e) => e.stopPropagation()}
			>
				<div className="flex items-center justify-between px-4 py-3 border-b border-stone-200 dark:border-stone-700">
					<h3 className="font-semibold text-stone-900 dark:text-stone-100">
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
