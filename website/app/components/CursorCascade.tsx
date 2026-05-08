type TrackTone = "drift" | "feedback" | "main"

interface Row {
	position: string
	action: string
	human?: boolean
	feedback?: boolean
}

interface Group {
	label?: string
	rows: Row[]
}

interface Track {
	name: string
	tone: TrackTone
	question: string
	groups: Group[]
	footer?: string
}

const TRACKS: Track[] = [
	{
		name: "Drift track",
		tone: "drift",
		question:
			"Did another agent or a human change something we already signed off?",
		groups: [
			{
				rows: [
					{
						position: "Drift Detected",
						action:
							"The agent inspects the change. If it warrants attention, file feedback so the fix loop can address it. If it's cosmetic, clear the drift signal so the cursor resumes forward progress.",
						feedback: true,
					},
				],
			},
		],
	},
	{
		name: "Feedback track",
		tone: "feedback",
		question: "Is open feedback waiting on a fix?",
		groups: [
			{
				rows: [
					{
						position: "Feedback Awaiting Fix-Hat",
						action:
							"Dispatch the next fix-hat against this finding. One hat, one finding, one tick.",
					},
					{
						position: "Feedback Resolved",
						action:
							"Close the feedback record. Forward progress resumes next tick.",
					},
				],
			},
		],
	},
	{
		name: "Main track",
		tone: "main",
		question: "Otherwise — walk forward through the pipeline:",
		groups: [
			{
				label: "Per stage, in order",
				rows: [
					{
						position: "Design Direction Required",
						action: "Present design options. Wait for the user to pick one.",
						human: true,
					},
					{
						position: "Clarifying Questions Pending",
						action: "Ask the user the stage's clarifying questions.",
						human: true,
					},
					{
						position: "Discovery Required",
						action:
							"Run the configured discovery agent on units missing its artifact.",
					},
					{
						position: "Stage Empty",
						action: "Elaborate — write the unit specs this stage will produce.",
					},
					{
						position: "Spec Review Pending",
						action:
							"Dispatch a review-agent to read each unit's spec. They file feedback if anything's off.",
						feedback: true,
					},
					{
						position: "Spec Gate",
						action:
							"Surface the specs to the human reviewer for sign-off. Their feedback is the same shape as anyone else's.",
						human: true,
						feedback: true,
					},
					{
						position: "Units Ready to Execute",
						action:
							"Run the next hat on every unit whose dependencies are clear. Eligible units run as a wave (parallel subagents); the wave is a mechanic, the job is to execute the units.",
					},
					{
						position: "Quality Gates Pending",
						action:
							"Run the engine's automated checks against the produced work — tests, linting, type-checking, anything the unit declared. Pass or fail by exit code. No subagent involved; the engine runs them.",
					},
					{
						position: "Approval Pending",
						action:
							"Dispatch a review-agent to evaluate the produced work. Findings come back as feedback.",
						feedback: true,
					},
					{
						position: "Approval Gate",
						action:
							"Surface the work to the human reviewer for sign-off. They can leave feedback or approve.",
						human: true,
						feedback: true,
					},
					{
						position: "Stage Complete",
						action: "Merge the stage branch into intent main.",
					},
				],
			},
			{
				label: "Once every stage has merged",
				rows: [
					{
						position: "Intent Review Pending",
						action:
							"Walk roles in order: spec, continuity, then the human gate. Each role gets its own tick. Reviewers and the human can both file feedback against the whole intent.",
						human: true,
						feedback: true,
					},
					{
						position: "Intent Reviews Signed",
						action: "Merge the intent into the delivery branch.",
					},
					{
						position: "Sealed",
						action: "Nothing left. The intent is closed.",
					},
				],
			},
		],
		footer:
			"Within a stage, the cursor loops review → execute → approve until the stage merges. Then the next stage starts at the top.",
	},
]

const TONE_STYLES: Record<
	TrackTone,
	{
		stripe: string
		header: string
		title: string
		groupLabel: string
	}
> = {
	drift: {
		stripe: "bg-orange-500",
		header:
			"bg-gradient-to-r from-orange-50 to-transparent dark:from-orange-950/40 dark:to-transparent",
		title: "text-orange-700 dark:text-orange-400",
		groupLabel: "text-orange-700 dark:text-orange-400",
	},
	feedback: {
		stripe: "bg-amber-400",
		header:
			"bg-gradient-to-r from-amber-50 to-transparent dark:from-amber-950/40 dark:to-transparent",
		title: "text-amber-700 dark:text-amber-500",
		groupLabel: "text-amber-700 dark:text-amber-500",
	},
	main: {
		stripe: "bg-green-500",
		header:
			"bg-gradient-to-r from-green-50 to-transparent dark:from-green-950/40 dark:to-transparent",
		title: "text-green-700 dark:text-green-400",
		groupLabel: "text-green-700 dark:text-green-400",
	},
}

function RowCell({ row }: { row: Row }) {
	const containerClass = row.human
		? "rounded-lg border border-fuchsia-200 bg-fuchsia-50/70 px-4 py-3 dark:border-fuchsia-900 dark:bg-fuchsia-950/30"
		: "px-4 py-3"
	return (
		<li className={containerClass}>
			<div className="flex flex-wrap items-center gap-2">
				{row.human ? (
					<span className="inline-flex items-center gap-1 rounded-full bg-fuchsia-600 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-white dark:bg-fuchsia-500">
						<svg
							viewBox="0 0 16 16"
							className="h-2.5 w-2.5"
							fill="currentColor"
							aria-hidden="true"
						>
							<path d="M8 8a3 3 0 100-6 3 3 0 000 6zM2 14a6 6 0 0112 0H2z" />
						</svg>
						Human
					</span>
				) : null}
				<span
					className={`text-base font-semibold ${
						row.human
							? "text-fuchsia-900 dark:text-fuchsia-200"
							: "text-stone-900 dark:text-white"
					}`}
				>
					{row.position}
				</span>
				{row.feedback ? (
					<span className="ml-auto inline-flex items-center gap-1 rounded-full border border-stone-300 bg-stone-50 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-stone-600 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-400">
						<svg
							viewBox="0 0 16 16"
							className="h-2.5 w-2.5"
							fill="currentColor"
							aria-hidden="true"
						>
							<path d="M2 3a1 1 0 011-1h10a1 1 0 011 1v8a1 1 0 01-1 1H6l-3 3v-3H3a1 1 0 01-1-1V3z" />
						</svg>
						Feedback can land here
					</span>
				) : null}
			</div>
			<p className="mt-1.5 text-sm leading-relaxed text-stone-600 dark:text-stone-400">
				{row.action}
			</p>
		</li>
	)
}

export function CursorCascade() {
	return (
		<div className="not-prose my-8 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm dark:border-stone-800 dark:bg-stone-950">
			<div className="border-b border-stone-200 bg-stone-50 px-6 py-4 dark:border-stone-800 dark:bg-stone-900/60">
				<div className="font-mono text-xs uppercase tracking-wider text-stone-500 dark:text-stone-400">
					Cursor priority order
				</div>
				<div className="mt-1 text-base text-stone-700 dark:text-stone-300">
					Each tick, the cursor reports its{" "}
					<span className="font-semibold text-stone-900 dark:text-white">
						position
					</span>{" "}
					and the agent takes the matching{" "}
					<span className="font-semibold text-stone-900 dark:text-white">
						action
					</span>
					. The first track that has something to say wins.
				</div>
			</div>
			<div className="divide-y divide-stone-200 dark:divide-stone-800">
				{TRACKS.map((track) => {
					const t = TONE_STYLES[track.tone]
					return (
						<section key={track.name} className="relative">
							<div
								className={`absolute inset-y-0 left-0 w-1.5 ${t.stripe}`}
								aria-hidden="true"
							/>
							<div className={`px-6 py-4 ${t.header}`}>
								<h3 className={`text-lg font-bold ${t.title}`}>
									{track.name}
								</h3>
								<p className="mt-0.5 text-sm italic text-stone-600 dark:text-stone-400">
									{track.question}
								</p>
							</div>
							<div className="px-6 py-4">
								<div className="flex flex-col gap-5">
									{track.groups.map((group, i) => (
										<div key={group.label ?? i}>
											{group.label ? (
												<div
													className={`mb-3 font-mono text-[11px] font-semibold uppercase tracking-wider ${t.groupLabel}`}
												>
													{group.label}
												</div>
											) : null}
											<ul className="flex flex-col gap-1.5">
												{group.rows.map((row) => (
													<RowCell key={row.position} row={row} />
												))}
											</ul>
										</div>
									))}
								</div>
								{track.footer ? (
									<div className="mt-5 flex items-start gap-2 rounded-md border border-stone-200 bg-stone-50/60 px-3 py-2 text-xs text-stone-600 dark:border-stone-800 dark:bg-stone-900/40 dark:text-stone-400">
										<span aria-hidden="true">↻</span>
										<span>{track.footer}</span>
									</div>
								) : null}
							</div>
						</section>
					)
				})}
			</div>
		</div>
	)
}
