/**
 * PickerPage — single-select picker for studio / mode / stage / confirm.
 *
 * The engine creates a picker session and blocks on it (runPicker in the
 * server). The agent never sees the URL+await two-step — they call one
 * blocking tool (haiku_run_next, haiku_intent_reset, etc.) and the user
 * lands here. On submit the wire flips status → "answered" and the
 * blocking tool returns.
 *
 * Layout per kind:
 *   - studio:   card grid + stage chain previewed under each card
 *   - mode:     cards with mini-timeline showing where pauses happen
 *   - stage:    simple list (single-stage select for quick mode)
 *   - confirm:  two-button decision (destructive vs cancel)
 */

import type { PickerOption, PickerSessionPayload } from "haiku-api"
import { useCallback, useState } from "react"
import { focusRingClass, touchTargetClass } from "../../a11y"
import { useApiClient } from "../../api/context"
import { Card } from "../../atoms/Card"
import { tryCloseTab } from "../../lib/tryCloseTab"
import { SubmitSuccess } from "../../molecules/SubmitSuccess"

interface Props {
	session: PickerSessionPayload
	sessionId: string
}

interface StudioMeta {
	stages?: string[]
}

/**
 * Pull stage-chain hints out of an option's description. The picker
 * description is plain prose written by the engine, but for studio
 * options we want a visible "stage1 → stage2 → stage3" preview.
 *
 * Convention: descriptions for studios may end with a marker like
 * `[stages: a, b, c]`. If absent, no chain is shown — the description
 * still renders.
 */
function extractStageChain(description: string | undefined): string[] | null {
	if (!description) return null
	const match = description.match(/\[stages?:\s*([^\]]+)\]/i)
	if (!match) return null
	return match[1]
		.split(/[,\s]+/)
		.map((s) => s.trim())
		.filter(Boolean)
}

function stripStageMarker(description: string | undefined): string {
	if (!description) return ""
	return description.replace(/\s*\[stages?:[^\]]+\]\s*$/i, "").trim()
}

/**
 * Render hints for the four kinds. Mode kind gets a tiny timeline
 * showing how often the engine pauses for the user — the visual cue
 * picks up the "cards with mini-timeline" layout the user signed off on
 * during mockup review.
 */
const MODE_TIMELINES: Record<string, ReadonlyArray<"agent" | "human">> = {
	continuous: ["human", "agent", "human", "agent", "human", "agent", "human"],
	discrete: ["human", "agent", "agent", "human", "agent", "agent", "human"],
	autopilot: ["human", "agent", "agent", "agent", "agent", "agent", "human"],
	"discrete-hybrid": ["human", "agent", "human", "agent", "agent", "human"],
	quick: ["human", "agent", "human"],
}

function ModeTimeline({ id }: { id: string }): React.ReactElement | null {
	const timeline = MODE_TIMELINES[id.toLowerCase()]
	if (!timeline) return null
	return (
		<div className="mt-3 flex items-center gap-1" aria-hidden="true">
			{timeline.map((kind, i) => (
				<span
					key={`${id}-${i}`}
					className={
						kind === "human"
							? "h-2 w-2 rounded-full bg-teal-500"
							: "h-2 w-2 rounded-full bg-stone-300 dark:bg-stone-600"
					}
				/>
			))}
			<span className="ml-2 text-xs text-stone-500 dark:text-stone-400">
				<span className="inline-block h-2 w-2 rounded-full bg-teal-500 align-middle" />
				{" pauses for you"}
			</span>
		</div>
	)
}

function StageChain({ stages }: { stages: string[] }): React.ReactElement {
	return (
		<div className="mt-2 flex flex-wrap items-center gap-1 text-xs text-stone-600 dark:text-stone-300">
			{stages.map((stage, i) => (
				<span key={`${stage}-${i}`} className="inline-flex items-center gap-1">
					{i > 0 && (
						<span className="text-stone-500 dark:text-stone-400">→</span>
					)}
					<span className="rounded bg-stone-100 px-1.5 py-0.5 font-mono dark:bg-stone-800">
						{stage}
					</span>
				</span>
			))}
		</div>
	)
}

interface OptionCardProps {
	option: PickerOption
	kind: PickerSessionPayload["kind"]
	selected: boolean
	disabled: boolean
	onSelect: () => void
}

function OptionCard({
	option,
	kind,
	selected,
	disabled,
	onSelect,
}: OptionCardProps): React.ReactElement {
	const stageChain =
		kind === "studio" ? extractStageChain(option.description) : null
	const description =
		kind === "studio"
			? stripStageMarker(option.description)
			: (option.description ?? "")
	const variant =
		kind === "confirm" && option.id !== "cancel" ? "danger" : "default"
	const baseRing = selected
		? "ring-2 ring-teal-500 dark:ring-teal-400"
		: "ring-1 ring-stone-200 dark:ring-stone-700 hover:ring-stone-400 dark:hover:ring-stone-500"
	const dangerTint =
		variant === "danger"
			? "bg-red-50 hover:bg-red-100 dark:bg-red-950/30 dark:hover:bg-red-950/50"
			: "bg-white hover:bg-stone-50 dark:bg-stone-900 dark:hover:bg-stone-800"
	return (
		<button
			type="button"
			disabled={disabled}
			onClick={onSelect}
			aria-pressed={selected}
			className={[
				"text-left rounded-lg p-4 transition-shadow",
				touchTargetClass,
				focusRingClass,
				baseRing,
				dangerTint,
				disabled
					? "cursor-not-allowed bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300"
					: "cursor-pointer",
			].join(" ")}
		>
			<div className="flex items-baseline justify-between gap-3">
				<div className="font-semibold text-stone-900 dark:text-stone-50">
					{option.label}
				</div>
				{selected && (
					<span className="text-xs text-teal-600 dark:text-teal-400">
						selected
					</span>
				)}
			</div>
			{description && (
				<div className="mt-1 text-sm text-stone-600 dark:text-stone-300">
					{description}
				</div>
			)}
			{stageChain && stageChain.length > 0 && <StageChain stages={stageChain} />}
			{kind === "mode" && <ModeTimeline id={option.id} />}
		</button>
	)
}

export function PickerPage({ session, sessionId }: Props): React.ReactElement {
	const client = useApiClient()
	const [selectedId, setSelectedId] = useState<string | null>(
		session.selection?.id ?? null,
	)
	const [urlInput, setUrlInput] = useState<string>(session.selection?.id ?? "")
	const [submitting, setSubmitting] = useState(false)
	const [submitted, setSubmitted] = useState(session.status === "answered")
	const [error, setError] = useState<string | null>(null)

	const handleSubmit = useCallback(
		async (id: string) => {
			if (submitting) return
			setSubmitting(true)
			setError(null)
			try {
				await client.submitPicker(sessionId, { id })
				setSubmitted(true)
				tryCloseTab()
			} catch (err) {
				setError(err instanceof Error ? err.message : String(err))
				setSubmitting(false)
			}
		},
		[client, sessionId, submitting],
	)

	const handleSelect = useCallback(
		(id: string) => {
			if (session.kind === "confirm") {
				// Confirm picker: the click IS the submission — no separate
				// "submit" button. Cancel is destructive-safe; the
				// destructive option (e.g. "Yes, reset") triggers the action
				// immediately.
				setSelectedId(id)
				void handleSubmit(id)
				return
			}
			setSelectedId(id)
		},
		[handleSubmit, session.kind],
	)

	if (submitted) {
		return (
			<SubmitSuccess
				message={`Selection recorded${
					selectedId ? `: ${selectedId}` : ""
				}. The workflow is continuing.`}
			/>
		)
	}

	const gridClass =
		session.kind === "studio" || session.kind === "mode"
			? "grid grid-cols-1 gap-3 sm:grid-cols-2"
			: "flex flex-col gap-2"

	const isUrlInput = session.kind === "url_input"

	return (
		<div className="mx-auto max-w-3xl p-4 sm:p-6">
			<Card>
				<div className="space-y-4">
					<header className="space-y-1">
						<h1 className="text-xl font-bold text-stone-900 dark:text-stone-50">
							{session.title}
						</h1>
						{session.prompt && (
							<p className="text-sm text-stone-600 dark:text-stone-300">
								{session.prompt}
							</p>
						)}
					</header>

					{isUrlInput ? (
						<div className="space-y-2">
							<label
								htmlFor="picker-url-input"
								className="block text-sm font-medium text-stone-700 dark:text-stone-200"
							>
								Review URL
							</label>
							<input
								id="picker-url-input"
								type="url"
								value={urlInput}
								onChange={(e) => setUrlInput(e.target.value)}
								disabled={submitting}
								placeholder="https://github.com/owner/repo/pull/123"
								className={[
									"w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-100",
									focusRingClass,
									"disabled:cursor-not-allowed disabled:bg-stone-100 disabled:text-stone-600 dark:disabled:bg-stone-800 dark:disabled:text-stone-300",
								].join(" ")}
								onKeyDown={(e) => {
									if (
										e.key === "Enter" &&
										urlInput.trim().length > 0 &&
										!submitting
									) {
										void handleSubmit(urlInput.trim())
									}
								}}
							/>
							<p className="text-xs text-stone-500 dark:text-stone-400">
								Paste the full URL where you submitted the work for review (PR,
								MR, ticket, email thread). The engine records it on the intent
								so reviewers can be polled for approval.
							</p>
						</div>
					) : (
						<div className={gridClass}>
							{session.options.map((opt) => (
								<OptionCard
									key={opt.id}
									option={opt}
									kind={session.kind}
									selected={selectedId === opt.id}
									disabled={submitting}
									onSelect={() => handleSelect(opt.id)}
								/>
							))}
						</div>
					)}

					{session.kind !== "confirm" && (
						<div className="flex items-center justify-end gap-2">
							{error && (
								<span className="text-sm text-red-600 dark:text-red-400">
									{error}
								</span>
							)}
							<button
								type="button"
								disabled={
									isUrlInput
										? urlInput.trim().length === 0 || submitting
										: !selectedId || submitting
								}
								onClick={() => {
									if (isUrlInput) {
										if (urlInput.trim().length > 0)
											void handleSubmit(urlInput.trim())
									} else if (selectedId) {
										void handleSubmit(selectedId)
									}
								}}
								className={[
									"rounded-md px-4 py-2 font-medium",
									touchTargetClass,
									focusRingClass,
									(isUrlInput ? urlInput.trim().length > 0 : !!selectedId) &&
									!submitting
										? "bg-teal-700 text-white hover:bg-teal-800"
										: "bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300 cursor-not-allowed",
								].join(" ")}
							>
								{submitting
									? "Submitting…"
									: isUrlInput
										? "Record URL"
										: "Submit selection"}
							</button>
						</div>
					)}

					{session.kind === "confirm" && error && (
						<div className="text-sm text-red-600 dark:text-red-400">{error}</div>
					)}
				</div>
			</Card>
		</div>
	)
}
