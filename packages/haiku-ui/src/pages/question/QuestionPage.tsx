/** biome-ignore-all lint/a11y/noStaticElementInteractions: carousel region arrow-key navigation per ARIA Authoring Practices §carousel; role on a <div> is intentional */
/** biome-ignore-all lint/a11y/useSemanticElements: unit-14 spec requires role="region" + aria-roledescription="carousel"; a <section> duplicates landmarks */
/** biome-ignore-all lint/a11y/noNoninteractiveTabindex: carousel region MUST be keyboard-focusable to satisfy the unit-14 arrow-key navigation criterion */
/** biome-ignore-all lint/a11y/useAriaPropsSupportedByRole: ARIA Authoring Practices §carousel authorizes aria-roledescription="slide" on the slide wrapper without a role; aria-current="true" is the slide-status hook */
/** biome-ignore-all lint/suspicious/noArrayIndexKey: carousel slide list is fixed per-render; index IS the stable key */
/**
 * QuestionPage — canonical implementation for /question/:sessionId.
 *
 * Structure per unit-14 spec:
 *   - Optional context block (markdown).
 *   - Image carousel when multiple images; single <img> otherwise.
 *   - Response form discriminated on question shape:
 *       options.length > 0  -> <fieldset><legend><input type="radio" /></fieldset>
 *       options.length === 0 -> <textarea> with explicit htmlFor/id label association.
 *   - On submit success announces "Answer submitted" via the global polite live region.
 *
 * Design references:
 *   - aria-landmark-spec.md §1 (landmarks already owned by <ShellLayout>).
 *   - aria-live-sequencing-spec.md §2 (useAnnounce wraps #feedback-live-polite).
 *   - focus-ring-spec.html §1 (focusRingClass on every interactive element).
 */

import { MarkdownViewer } from "@haiku/shared"
import { paths, type QuestionDef, type QuestionSessionPayload } from "haiku-api"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { focusRingClass, touchTargetClass, useAnnounce } from "../../a11y"
import { useApiClient } from "../../api/context"
import { Card, SectionHeading } from "../../components/Card"
import { SubmitSuccess } from "../../components/SubmitSuccess"
import { tryCloseTab } from "../../lib/tryCloseTab"

interface Props {
	session: QuestionSessionPayload
	sessionId: string
	wsRef?: React.RefObject<WebSocket | null>
}

interface AnswerState {
	selectedOption: string | null
	otherText: string
	freeText: string
}

function isFreeText(q: QuestionDef): boolean {
	return !q.options || q.options.length === 0
}

export function QuestionPage({
	session,
	sessionId,
	wsRef: _wsRef,
}: Props): React.ReactElement {
	const client = useApiClient()
	const announce = useAnnounce()

	const questions = session.questions ?? []
	const context = session.context ?? ""
	const imageUrls = session.image_urls ?? []

	const [answers, setAnswers] = useState<AnswerState[]>(() =>
		questions.map(() => ({
			selectedOption: null,
			otherText: "",
			freeText: "",
		})),
	)
	const [submitting, setSubmitting] = useState(false)
	const [errorMessage, setErrorMessage] = useState<string | null>(null)
	const [done, setDone] = useState(false)

	const updateAnswer = useCallback(
		(index: number, patch: Partial<AnswerState>) => {
			setAnswers((prev) =>
				prev.map((a, i) => (i === index ? { ...a, ...patch } : a)),
			)
		},
		[],
	)

	// Submit enabled only when every free-text question has non-empty content.
	// Multi-choice questions allow an unselected state — this matches the spec's
	// "submit enabled only when non-empty" criterion for the free-text variant.
	const canSubmit = useMemo(() => {
		if (questions.length === 0) return false
		return questions.every((q, i) => {
			const a = answers[i]
			if (!a) return false
			if (isFreeText(q)) {
				return a.freeText.trim().length > 0
			}
			return true
		})
	}, [answers, questions])

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault()
		if (!canSubmit || submitting) return
		setSubmitting(true)
		setErrorMessage(null)

		const requestAnswers = questions.map((q, i) => {
			const a = answers[i] ?? {
				selectedOption: null,
				otherText: "",
				freeText: "",
			}
			if (isFreeText(q)) {
				return {
					question: q.question,
					selectedOptions: [],
					otherText: a.freeText.trim() || undefined,
				}
			}
			return {
				question: q.question,
				selectedOptions: a.selectedOption ? [a.selectedOption] : [],
				otherText: undefined,
			}
		})

		try {
			await client.submitAnswer(sessionId, { answers: requestAnswers })
			announce("polite", "Answer submitted")
			setDone(true)
			tryCloseTab({
				url: paths.questionAnswer(sessionId),
				body: { answers: requestAnswers },
			})
		} catch (err) {
			const message =
				err instanceof Error ? err.message : "Failed to submit answer"
			setErrorMessage(message)
			announce("assertive", `Submission failed: ${message}`)
			setSubmitting(false)
		}
	}

	if (done) {
		return <SubmitSuccess message="Answer submitted!" />
	}

	return (
		<>
			{context && (
				<Card>
					<SectionHeading>Context</SectionHeading>
					<MarkdownViewer id="question-context">{context}</MarkdownViewer>
				</Card>
			)}

			{imageUrls.length >= 2 ? (
				<QuestionCarousel images={imageUrls} />
			) : imageUrls.length === 1 ? (
				<Card>
					<img
						src={imageUrls[0]}
						alt="Question reference"
						className="w-full rounded-lg border border-stone-200 dark:border-stone-700"
					/>
				</Card>
			) : null}

			<form onSubmit={handleSubmit} noValidate>
				{questions.map((q, qIdx) => {
					const a = answers[qIdx]
					if (!a) return null
					return isFreeText(q) ? (
						<FreeTextQuestion
							key={qIdx}
							index={qIdx}
							def={q}
							value={a.freeText}
							onChange={(v) => updateAnswer(qIdx, { freeText: v })}
							disabled={submitting}
						/>
					) : (
						<MultiChoiceQuestion
							key={qIdx}
							index={qIdx}
							def={q}
							value={a.selectedOption}
							onChange={(v) => updateAnswer(qIdx, { selectedOption: v })}
							disabled={submitting}
						/>
					)
				})}

				<button
					type="submit"
					disabled={!canSubmit || submitting}
					aria-disabled={!canSubmit || submitting}
					className={`w-full px-6 py-3 bg-teal-700 hover:bg-teal-800 text-white font-semibold rounded-lg transition-colors ${focusRingClass} disabled:bg-green-300 disabled:text-green-800 dark:disabled:bg-green-900/40 dark:disabled:text-green-200 disabled:cursor-not-allowed ${touchTargetClass}`}
				>
					{submitting ? "Submitting..." : "Submit Answer"}
				</button>

				{errorMessage && (
					<div
						role="alert"
						className="mt-4 p-4 rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-200"
					>
						<p className="font-semibold">{errorMessage}</p>
					</div>
				)}
			</form>
		</>
	)
}

// ── Carousel ────────────────────────────────────────────────────────────────

function QuestionCarousel({
	images,
}: {
	images: string[]
}): React.ReactElement {
	const [active, setActive] = useState(0)
	const regionRef = useRef<HTMLDivElement | null>(null)
	const announce = useAnnounce()

	useEffect(() => {
		if (active >= images.length) {
			setActive(0)
		}
	}, [active, images.length])

	// Announce slide change via the global polite live region ONLY on user
	// action. Per ARIA APG §carousel + FB-73, the slide-count message must not
	// live inside an always-mounted aria-live span (which re-fires on every
	// React render) and must not duplicate the `aria-current` announcement on
	// the slide itself. `announce()` writes to #feedback-live-polite outside
	// the rotating content and fires exactly once per user-initiated step.
	const go = useCallback(
		(delta: number) => {
			setActive((prev) => {
				const next = (prev + delta + images.length) % images.length
				announce("polite", `Image ${next + 1} of ${images.length}`)
				return next
			})
		},
		[images.length, announce],
	)

	function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
		if (e.key === "ArrowRight") {
			e.preventDefault()
			go(1)
		} else if (e.key === "ArrowLeft") {
			e.preventDefault()
			go(-1)
		}
	}

	return (
		<Card>
			<SectionHeading>Reference images</SectionHeading>
			<CarouselRegion
				regionRef={regionRef}
				onKeyDown={handleKeyDown}
				images={images}
				active={active}
				onPrev={() => go(-1)}
				onNext={() => go(1)}
			/>
		</Card>
	)
}

// ── Carousel region (extracted so biome-ignore attaches to the <div role="region">) ──

interface CarouselRegionProps {
	regionRef: React.RefObject<HTMLDivElement | null>
	onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void
	images: string[]
	active: number
	onPrev: () => void
	onNext: () => void
}

function CarouselRegion({
	regionRef,
	onKeyDown,
	images,
	active,
	onPrev,
	onNext,
}: CarouselRegionProps): React.ReactElement {
	// Per FB-73, Prev/Next controls live INSIDE the role="region" container
	// so a keyboard user who reaches the region also reaches the controls,
	// and so SRs describing the carousel find the rotation controls within.
	return (
		<div
			ref={regionRef}
			role="region"
			aria-roledescription="carousel"
			aria-label="Question images"
			tabIndex={0}
			onKeyDown={onKeyDown}
			className={`relative rounded-lg outline-none ${focusRingClass}`}
		>
			<div className="relative">
				{images.map((url, i) => (
					<CarouselSlide
						key={`${i}-${url}`}
						url={url}
						index={i}
						total={images.length}
						isActive={i === active}
					/>
				))}
			</div>

			<div className="mt-3 flex items-center justify-between">
				<button
					type="button"
					onClick={onPrev}
					aria-label="Previous image"
					className={`px-3 py-2 rounded-lg border border-stone-300 dark:border-stone-600 text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors ${focusRingClass} ${touchTargetClass}`}
				>
					&larr;
				</button>
				<span className="text-sm text-stone-700 dark:text-stone-200">
					Image {active + 1} of {images.length}
				</span>
				<button
					type="button"
					onClick={onNext}
					aria-label="Next image"
					className={`px-3 py-2 rounded-lg border border-stone-300 dark:border-stone-600 text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors ${focusRingClass} ${touchTargetClass}`}
				>
					&rarr;
				</button>
			</div>
		</div>
	)
}

interface CarouselSlideProps {
	url: string
	index: number
	total: number
	isActive: boolean
}

function CarouselSlide({
	url,
	index,
	total,
	isActive,
}: CarouselSlideProps): React.ReactElement {
	// Inactive slides are hidden via display:none (`.hidden`) AND
	// `aria-hidden="true"` — some SRs buffer display:none content differently,
	// so the explicit aria-hidden keeps SR behavior consistent (FB-73).
	return (
		<div
			aria-roledescription="slide"
			aria-label={`Image ${index + 1} of ${total}`}
			aria-current={isActive ? "true" : undefined}
			aria-hidden={isActive ? undefined : "true"}
			className={isActive ? "block" : "hidden"}
		>
			<img
				src={url}
				alt={`Reference ${index + 1} of ${total}`}
				className="w-full rounded-lg border border-stone-200 dark:border-stone-700"
			/>
		</div>
	)
}

// ── Multi-choice (single-select radio) ──────────────────────────────────────

interface MultiChoiceProps {
	index: number
	def: QuestionDef
	value: string | null
	onChange: (v: string) => void
	disabled: boolean
}

function MultiChoiceQuestion({
	index,
	def,
	value,
	onChange,
	disabled,
}: MultiChoiceProps): React.ReactElement {
	const name = `q-${index}-options`
	const legendId = `q-${index}-legend`
	return (
		<Card>
			<fieldset aria-labelledby={legendId}>
				<legend
					id={legendId}
					className="text-base font-semibold mb-2 text-stone-900 dark:text-stone-100"
				>
					<MarkdownViewer id={`q-${index}-question`}>
						{def.question}
					</MarkdownViewer>
				</legend>
				{def.header && (
					<div className="text-sm text-stone-600 dark:text-stone-300 mb-3">
						<MarkdownViewer id={`q-${index}-header`}>
							{def.header}
						</MarkdownViewer>
					</div>
				)}
				<div className="space-y-2">
					{def.options.map((option, oIdx) => {
						const optionId = `q-${index}-opt-${oIdx}`
						const checked = value === option
						return (
							<label
								key={option}
								htmlFor={optionId}
								className={`flex items-center gap-3 p-2 rounded-lg hover:bg-stone-50 dark:hover:bg-stone-800 cursor-pointer transition-colors ${touchTargetClass}`}
							>
								<input
									id={optionId}
									type="radio"
									name={name}
									value={option}
									checked={checked}
									aria-checked={checked}
									onChange={() => onChange(option)}
									disabled={disabled}
									className={`w-4 h-4 text-teal-600 ${focusRingClass}`}
								/>
								<span className="text-stone-700 dark:text-stone-200">
									{option}
								</span>
							</label>
						)
					})}
				</div>
			</fieldset>
		</Card>
	)
}

// ── Free-text (textarea with explicit label:for) ────────────────────────────

interface FreeTextProps {
	index: number
	def: QuestionDef
	value: string
	onChange: (v: string) => void
	disabled: boolean
}

function FreeTextQuestion({
	index,
	def,
	value,
	onChange,
	disabled,
}: FreeTextProps): React.ReactElement {
	const textareaId = `q-${index}-textarea`
	return (
		<Card>
			<div className="mb-2">
				<label
					htmlFor={textareaId}
					className="block text-base font-semibold text-stone-900 dark:text-stone-100"
				>
					<MarkdownViewer id={`q-${index}-question`}>
						{def.question}
					</MarkdownViewer>
				</label>
				{def.header && (
					<div className="text-sm text-stone-600 dark:text-stone-300 mt-1">
						<MarkdownViewer id={`q-${index}-header`}>
							{def.header}
						</MarkdownViewer>
					</div>
				)}
			</div>
			<textarea
				id={textareaId}
				className={`w-full p-3 border border-stone-300 dark:border-stone-600 rounded-lg bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 resize-y text-sm ${focusRingClass}`}
				rows={5}
				placeholder="Type your answer here..."
				value={value}
				onChange={(e) => onChange(e.target.value)}
				disabled={disabled}
			/>
		</Card>
	)
}
