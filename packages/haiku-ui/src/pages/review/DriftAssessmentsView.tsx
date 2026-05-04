/** biome-ignore-all lint/a11y/noNoninteractiveTabindex: assessment-list rows are keyboard-focusable per features/drift-assessment-visibility.feature + DESIGN-BRIEF Screen 3 §"Accessibility requirements" — the row's interactive children (badge link + expand toggle) are individually focusable, but the spec also requires the row itself to receive focus so a screen-reader user can hear the full record summary as one announcement when arrow-keying through the list. */
/**
 * DriftAssessmentsView — full route at
 * `/review/{intentSlug}/drift-assessments`. Lists ManualChangeAssessment
 * records most-recent-first via `GET /api/intents/{intentSlug}/assessments`
 * (DESIGN-BRIEF Screen 3 + `features/drift-assessment-visibility.feature`).
 *
 * Each row renders:
 *   - file path(s)
 *   - change_kind (modified / added / deleted / replaced)
 *   - outcome badge (via `OutcomeBadge`)
 *   - created_at (relative time)
 *   - rationale excerpt
 *
 * Click reveals the full `diff_unified` and full `agent_rationale` in an
 * expandable panel (native `<details>`).
 *
 * States covered:
 *   - happy path: list rendered most-recent-first
 *   - empty state: "No out-of-band changes have been detected yet"
 *   - corrupted record: row with "Record could not be parsed" warning,
 *     remaining records still render
 *   - linked feedback: `surface-as-feedback` outcome badge is a link to
 *     the FB detail route (`/review/{intent}/feedback/{linkedFeedbackId}`)
 *   - revisit lifecycle: pending-revisit → revisit-invoked → resolved
 *
 * The component is intentionally pure-data — it accepts an array of
 * `Assessment | CorruptAssessment` items rather than fetching itself, so
 * tests can inject deterministic input and the production wiring (router
 * + ApiClient) can hand the same shape via a loader. Empty + corrupt
 * are explicitly representable in the input shape.
 *
 * Token discipline: every color reference is either a Tailwind palette
 * utility on stone/teal/amber/rose/etc. or the OutcomeBadge atom
 * (which itself uses `bg-[var(--color-…)]`). No raw hex.
 */

import { useState } from "react"
import {
	type AssessmentOutcome,
	OutcomeBadge,
	type RevisitState,
} from "../../atoms/OutcomeBadge"

/** A single per-file finding inside an Assessment record. The wire
 *  shape comes from `runDriftDetectionGate`'s `DriftFinding` and is
 *  carried through `haiku_classify_drift` into the on-disk DA-NN.json.
 *  We only declare the fields the assessment view consumes. */
export interface AssessmentFinding {
	path: string
	stage?: string | null
	change_kind?: string
	is_binary?: boolean
	before_sha256?: string | null
	after_sha256?: string | null
}

export interface AssessmentRecord {
	/** Identifier of the form `DA-NN`. Drives row keys + the "Resolved /
	 *  Pending revisit / Revisit invoked" lifecycle copy. */
	id: string
	/** Files affected — single-element array for most records, multi-file
	 *  when the human's tick touched several at once. */
	paths: string[]
	change_kind: "modified" | "added" | "deleted" | "replaced"
	outcome: AssessmentOutcome
	/** ISO-8601 timestamp. */
	created_at: string
	/** Short prose summary; the full text is in `agent_rationale`. */
	rationale_excerpt: string
	/** Full agent reasoning revealed when the row is expanded. */
	agent_rationale: string
	/** Unified diff payload. Empty string for binary changes. */
	diff_unified: string
	/** Per-file findings carried from `runDriftDetectionGate`. Drives
	 *  image-aware before/after preview rendering when a path's
	 *  extension matches a known image kind. Optional because the older
	 *  AssessmentRecord shape didn't expose this — older records on disk
	 *  read fine without it. */
	findings?: AssessmentFinding[]
	/** Set when outcome === "surface-as-feedback". */
	linked_feedback_id?: string
	/** Set when outcome === "trigger-revisit" — drives the revisit-state
	 *  badge transition (pending-revisit → revisit-invoked → resolved). */
	revisit_invoked_at?: string | null
	/** Set when the linked PendingMarker has been cleared (revisit
	 *  completed). When set, the SPA renders the "Resolved" badge. */
	pending_marker_cleared_at?: string | null
}

const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|avif|svg)$/i

/** Path-extension heuristic — extension is unreliable on disk (a `.png`
 *  may be a JPEG), but for routing decisions in the SPA the extension
 *  is what tells us "render an `<img>` here." The engine separately
 *  validates the actual bytes via magic-byte sniff before retaining
 *  the sidecar; this check just gates the rendering path. */
function isImagePath(path: string): boolean {
	return IMAGE_EXT_RE.test(path)
}

/** Build the URL to a baseline-content sidecar for a given finding's
 *  before- or after-side. Stage-scoped findings route through the
 *  `stage` segment; intent-scope findings (stage === null) route
 *  through `intent`. */
function baselineContentUrl(
	intentSlug: string,
	finding: AssessmentFinding,
	side: "before" | "after",
): string | null {
	const sha = side === "before" ? finding.before_sha256 : finding.after_sha256
	if (!sha) return null
	const intent = encodeURIComponent(intentSlug)
	if (finding.stage === null || finding.stage === undefined) {
		return `/api/intents/${intent}/baseline-content/intent/${sha}`
	}
	return `/api/intents/${intent}/baseline-content/stage/${encodeURIComponent(finding.stage)}/${sha}`
}

export interface CorruptAssessment {
	/** Filesystem path to the unreadable record — surfaced in the warning
	 *  copy so the user can find the file on disk if they want to inspect
	 *  it manually. */
	id: string
	error: "parse-error"
	/** Optional — the raw read error from the loader. */
	message?: string
}

export type AssessmentEntry = AssessmentRecord | CorruptAssessment

function isCorrupt(entry: AssessmentEntry): entry is CorruptAssessment {
	return (entry as CorruptAssessment).error === "parse-error"
}

function formatRelative(iso: string, now: number = Date.now()): string {
	const then = new Date(iso).getTime()
	if (!Number.isFinite(then)) return ""
	const diff = Math.max(0, now - then)
	const mins = Math.round(diff / 60_000)
	if (mins < 1) return "just now"
	if (mins < 60) return `${mins}m ago`
	const hours = Math.round(mins / 60)
	if (hours < 24) return `${hours}h ago`
	const days = Math.round(hours / 24)
	return `${days}d ago`
}

function revisitStateOf(record: AssessmentRecord): RevisitState {
	if (record.pending_marker_cleared_at) return "resolved"
	if (record.revisit_invoked_at) return "revisit-invoked"
	return "pending-revisit"
}

function feedbackHref(intentSlug: string, fbId: string): string {
	return `/review/${intentSlug}/feedback/${fbId}`
}

/** Build a deep link into the DriftAssessmentsView filtered to a specific
 *  tick. The tick id is opaque to this layer — the host wires whatever
 *  identifier the assessments API returns (commonly `?tick=<sha-or-iso>`).
 *  Surfaces in the chat-summary integration so the user can jump from the
 *  in-chat summary into the same filtered list.
 */
export function driftAssessmentsTickHref(
	intentSlug: string,
	tickId: string,
): string {
	return `/review/${intentSlug}/drift-assessments?tick=${encodeURIComponent(tickId)}`
}

/**
 * Format an autopilot-tick chat summary line. The full feature scenarios
 * cover three shapes:
 *
 *   - mixed: "12 changes detected: 9 ignored, 2 inline-fix, 1 surface-as-feedback"
 *   - ignore-only: "3 minor changes ignored across 3 ticks"  (caller marks
 *     `ticks` > 1 to switch wording)
 *   - single: "1 change classified as inline-fix"
 *
 * The component returns the bare summary string. The caller is responsible
 * for appending the deep-link affordance to the surface (chat bubble owns
 * the markup).
 */
export interface AssessmentSummaryInput {
	ignore: number
	"inline-fix": number
	"surface-as-feedback": number
	"trigger-revisit": number
}

export function formatAssessmentSummary(
	counts: AssessmentSummaryInput,
	options: { ticks?: number } = {},
): string {
	const total =
		counts.ignore +
		counts["inline-fix"] +
		counts["surface-as-feedback"] +
		counts["trigger-revisit"]
	if (total === 0) return ""

	const ticks = options.ticks ?? 1
	const ignoreOnly =
		counts["inline-fix"] === 0 &&
		counts["surface-as-feedback"] === 0 &&
		counts["trigger-revisit"] === 0
	if (ignoreOnly && ticks > 1) {
		return `${total} minor ${total === 1 ? "change" : "changes"} ignored across ${ticks} ticks`
	}

	if (total === 1) {
		const outcome = (
			Object.keys(counts) as Array<keyof AssessmentSummaryInput>
		).find((k) => counts[k] === 1)
		return `1 change classified as ${outcome}`
	}

	const parts: string[] = []
	if (counts.ignore > 0) parts.push(`${counts.ignore} ignored`)
	if (counts["inline-fix"] > 0) parts.push(`${counts["inline-fix"]} inline-fix`)
	if (counts["surface-as-feedback"] > 0)
		parts.push(`${counts["surface-as-feedback"]} surface-as-feedback`)
	if (counts["trigger-revisit"] > 0)
		parts.push(`${counts["trigger-revisit"]} trigger-revisit`)
	return `${total} changes detected: ${parts.join(", ")}`
}

export interface DriftAssessmentsViewProps {
	intentSlug: string
	/** Records, in any order — the view sorts most-recent-first internally
	 *  using `created_at`. Corrupted entries float to wherever the host
	 *  loader places them; their warning row renders in place. */
	assessments: AssessmentEntry[]
	/** Optional — when supplied, a "Surfaced as FB-NN" badge invokes this
	 *  instead of letting the browser navigate. Used by client-side routers
	 *  (TanStack Router) to keep navigation in-app. */
	onNavigateToFeedback?: (intentSlug: string, fbId: string) => void
}

export function DriftAssessmentsView({
	intentSlug,
	assessments,
	onNavigateToFeedback,
}: DriftAssessmentsViewProps): React.ReactElement {
	const sorted = [...assessments].sort((a, b) => {
		const at = isCorrupt(a) ? 0 : new Date(a.created_at).getTime()
		const bt = isCorrupt(b) ? 0 : new Date(b.created_at).getTime()
		return bt - at
	})

	const validCount = sorted.filter((entry) => !isCorrupt(entry)).length

	return (
		<section
			data-testid="drift-assessments-view"
			aria-labelledby="drift-assessments-heading"
			className="px-6 lg:px-10 py-6 max-w-[var(--content-max)] mx-auto w-full space-y-4"
		>
			<header>
				<h1
					id="drift-assessments-heading"
					className="text-2xl font-bold text-stone-900 dark:text-stone-100"
				>
					Drift assessments
				</h1>
				<p className="text-sm text-stone-600 dark:text-stone-300 mt-1">
					Out-of-band file changes the agent has classified for{" "}
					<span className="font-mono text-stone-700 dark:text-stone-200">
						{intentSlug}
					</span>
					.
				</p>
			</header>
			{sorted.length === 0 ? (
				<EmptyState />
			) : (
				<ol data-testid="drift-assessments-list" className="space-y-2">
					{sorted.map((entry) =>
						isCorrupt(entry) ? (
							<CorruptRow key={entry.id} entry={entry} />
						) : (
							<AssessmentRow
								key={entry.id}
								record={entry}
								intentSlug={intentSlug}
								onNavigateToFeedback={onNavigateToFeedback}
							/>
						),
					)}
				</ol>
			)}
			{validCount > 0 && (
				<p className="text-xs text-stone-500 dark:text-stone-400">
					{validCount} {validCount === 1 ? "record" : "records"}
				</p>
			)}
		</section>
	)
}

function EmptyState(): React.ReactElement {
	return (
		<div
			data-testid="drift-assessments-empty"
			className="rounded-lg border border-dashed border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 p-8 text-center"
		>
			<p className="text-sm font-medium text-stone-700 dark:text-stone-200">
				No out-of-band changes have been detected yet.
			</p>
			<p className="text-xs text-stone-500 dark:text-stone-400 mt-1">
				When a file is modified outside the agent loop, the next workflow tick
				will classify it and the assessment will appear here.
			</p>
		</div>
	)
}

function CorruptRow({
	entry,
}: {
	entry: CorruptAssessment
}): React.ReactElement {
	return (
		<li
			data-testid="drift-assessment-corrupt"
			className="rounded-lg border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30 px-4 py-3"
		>
			<p className="text-sm font-semibold text-rose-800 dark:text-rose-200">
				Record could not be parsed
			</p>
			<p className="text-xs text-rose-700 dark:text-rose-300 mt-0.5">
				<span className="font-mono">{entry.id}</span>
				{entry.message ? ` — ${entry.message}` : ""}
			</p>
		</li>
	)
}

// Fallback covers null url + 404 (extension/bytes mismatch swallowed by
// magic-byte sniff) so neither path leaves a broken-image icon.
function ImageOrFallback({
	url,
	alt,
}: {
	url: string | null
	alt: string
}): React.ReactElement {
	const [failed, setFailed] = useState(false)
	if (!url || failed) {
		return (
			<p className="text-xs italic text-stone-500 dark:text-stone-400">
				Preview not available.
			</p>
		)
	}
	return (
		<img
			src={url}
			alt={alt}
			onError={() => setFailed(true)}
			className="block w-full h-auto rounded-md border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800"
		/>
	)
}

/** Render before/after thumbnails for an image-pathed finding. Uses
 *  the baseline-content route for both sides — the engine writes the
 *  after-sha sidecar at finding-emission time so the SPA can render
 *  immediately, before the agent classifies. Falls back to "preview
 *  not available" text when either side returns 404 (extension-vs-
 *  bytes mismatch, deleted file, or engine from a pre-image version). */
function ImageDiffPreview({
	intentSlug,
	finding,
}: {
	intentSlug: string
	finding: AssessmentFinding
}): React.ReactElement {
	const beforeUrl = baselineContentUrl(intentSlug, finding, "before")
	const afterUrl = baselineContentUrl(intentSlug, finding, "after")
	return (
		<div data-testid="image-diff-preview">
			<p className="text-xs font-bold uppercase tracking-widest text-stone-500 dark:text-stone-400 mb-1">
				Visual diff —{" "}
				<code className="font-mono normal-case text-stone-600 dark:text-stone-300">
					{finding.path}
				</code>
			</p>
			<div className="grid grid-cols-2 gap-3">
				<figure className="space-y-1">
					<figcaption className="text-xs font-medium uppercase tracking-wider text-stone-500 dark:text-stone-400">
						Before
					</figcaption>
					<ImageOrFallback url={beforeUrl} alt={`Before: ${finding.path}`} />
				</figure>
				<figure className="space-y-1">
					<figcaption className="text-xs font-medium uppercase tracking-wider text-stone-500 dark:text-stone-400">
						After
					</figcaption>
					<ImageOrFallback url={afterUrl} alt={`After: ${finding.path}`} />
				</figure>
			</div>
		</div>
	)
}

function AssessmentRow({
	record,
	intentSlug,
	onNavigateToFeedback,
}: {
	record: AssessmentRecord
	intentSlug: string
	onNavigateToFeedback?: (intentSlug: string, fbId: string) => void
}): React.ReactElement {
	const [expanded, setExpanded] = useState(false)

	const revisitState =
		record.outcome === "trigger-revisit" ? revisitStateOf(record) : undefined

	const href =
		record.outcome === "surface-as-feedback" && record.linked_feedback_id
			? feedbackHref(intentSlug, record.linked_feedback_id)
			: undefined

	const onBadgeClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
		if (
			!onNavigateToFeedback ||
			record.outcome !== "surface-as-feedback" ||
			!record.linked_feedback_id
		) {
			return
		}
		e.preventDefault()
		onNavigateToFeedback(intentSlug, record.linked_feedback_id)
	}

	return (
		<li
			data-testid="drift-assessment-row"
			data-record-id={record.id}
			tabIndex={0}
			className="rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 p-4 shadow-sm hover:shadow-md transition-shadow duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-stone-900"
		>
			<div className="flex items-start gap-3">
				<div className="flex-1 min-w-0">
					<div className="flex items-center gap-2 flex-wrap">
						<OutcomeBadge
							outcome={record.outcome}
							linkedFeedbackId={record.linked_feedback_id}
							revisitState={revisitState}
							href={href}
							onClick={onBadgeClick}
						/>
						<span className="text-xs font-medium uppercase tracking-wider text-stone-500 dark:text-stone-400">
							{record.change_kind}
						</span>
						<span className="text-xs tabular-nums text-stone-500 dark:text-stone-400">
							{formatRelative(record.created_at)}
						</span>
					</div>
					<ul className="mt-2 space-y-0.5">
						{record.paths.map((p) => (
							<li
								key={p}
								className="font-mono text-xs text-stone-700 dark:text-stone-200 truncate"
								title={p}
							>
								<bdi>{p}</bdi>
							</li>
						))}
					</ul>
					<p className="mt-2 text-sm text-stone-700 dark:text-stone-200">
						{record.rationale_excerpt}
					</p>
				</div>
			</div>
			<button
				type="button"
				onClick={() => setExpanded((v) => !v)}
				aria-expanded={expanded}
				aria-controls={`drift-assessment-detail-${record.id}`}
				className="mt-3 text-xs font-medium text-teal-700 dark:text-teal-400 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-stone-900 rounded"
			>
				{expanded ? "Hide details" : "View diff and rationale"}
			</button>
			{expanded && (
				<div
					id={`drift-assessment-detail-${record.id}`}
					className="mt-3 space-y-3"
				>
					<div>
						<p className="text-xs font-bold uppercase tracking-widest text-stone-500 dark:text-stone-400 mb-1">
							Agent rationale
						</p>
						<p className="text-sm text-stone-700 dark:text-stone-200 whitespace-pre-wrap">
							{record.agent_rationale}
						</p>
					</div>
					{record.diff_unified ? (
						<div>
							<p className="text-xs font-bold uppercase tracking-widest text-stone-500 dark:text-stone-400 mb-1">
								Unified diff
							</p>
							<pre className="text-xs font-mono bg-stone-100 dark:bg-stone-800 rounded-lg p-3 overflow-x-auto text-stone-800 dark:text-stone-100">
								<code>{record.diff_unified}</code>
							</pre>
						</div>
					) : null}
					{(record.findings ?? [])
						.filter((f) => isImagePath(f.path))
						.map((f) => (
							<ImageDiffPreview
								key={f.path}
								intentSlug={intentSlug}
								finding={f}
							/>
						))}
					{!record.diff_unified &&
						!(record.findings ?? []).some((f) => isImagePath(f.path)) && (
							<p className="text-xs italic text-stone-500 dark:text-stone-400">
								No textual diff (binary or replaced artifact).
							</p>
						)}
				</div>
			)}
		</li>
	)
}
