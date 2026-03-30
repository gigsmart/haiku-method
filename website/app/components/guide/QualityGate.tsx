"use client"

import { motion } from "framer-motion"

export function Tollbooth() {
	return (
		<motion.div
			initial={{ opacity: 0, y: 20 }}
			whileInView={{ opacity: 1, y: 0 }}
			viewport={{ once: true, margin: "-40px" }}
			transition={{ duration: 0.5 }}
			className="my-8 rounded-2xl border-2 border-cyan-400/20 bg-white p-8 text-center dark:bg-gray-900"
		>
			<div className="mb-6 text-lg font-bold text-cyan-400">
				&#x1F6A7; Quality Checkpoint &#x1F6A7;
			</div>
			<p className="mb-4 text-xs text-gray-500 dark:text-gray-400">
				Enforced by <code className="text-amber-500">quality-gate.sh</code> on every Stop — the agent cannot bypass these.
			</p>

			{/* Pass lanes — gate names come from quality_gates: frontmatter, these are illustrative examples */}
			<div className="mb-6 grid gap-4 sm:grid-cols-3">
				<TollLane
					icon="&#x2705;"
					label="tests"
					desc="All pass"
					variant="pass"
				/>
				<TollLane
					icon="&#x2705;"
					label="build"
					desc="No errors"
					variant="pass"
				/>
				<TollLane
					icon="&#x2705;"
					label="lint"
					desc="No violations"
					variant="pass"
				/>
			</div>

			<div className="flex items-center justify-center gap-3 border-t border-gray-200 pt-5 font-semibold text-green-500 dark:border-gray-700">
				&#x2192; Gate opens -- proceed to the next hat
			</div>

			{/* Fail lanes */}
			<div className="mt-5 grid gap-4 sm:grid-cols-3">
				<TollLane
					icon="&#x274C;"
					label="tests"
					desc="Failures!"
					variant="fail"
				/>
				<TollLane icon="&#x274C;" label="build" desc="Errors!" variant="fail" />
				<TollLane
					icon="&#x274C;"
					label="lint"
					desc="Issues!"
					variant="fail"
				/>
			</div>

			<div className="mt-4 flex items-center justify-center gap-3 border-t border-gray-200 pt-5 font-semibold text-rose-500 dark:border-gray-700">
				&#x2190; Go back and fix -- cannot advance
			</div>
		</motion.div>
	)
}

function TollLane({
	icon,
	label,
	desc,
	variant,
}: { icon: string; label: string; desc: string; variant: "pass" | "fail" }) {
	const styles = {
		pass: "bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-800",
		fail: "bg-rose-50 border-rose-200 dark:bg-rose-950/20 dark:border-rose-800",
	}

	return (
		<div className={`rounded-lg border p-4 ${styles[variant]}`}>
			<div className="mb-1 text-2xl">{icon}</div>
			<div className="text-sm font-semibold text-gray-800 dark:text-gray-200">
				{label}
			</div>
			<div className="text-xs text-gray-500 dark:text-gray-400">{desc}</div>
		</div>
	)
}

export function GateCards() {
	return (
		<motion.div
			initial={{ opacity: 0, y: 20 }}
			whileInView={{ opacity: 1, y: 0 }}
			viewport={{ once: true, margin: "-40px" }}
			transition={{ duration: 0.5 }}
			className="mt-3 grid gap-3 sm:grid-cols-3"
		>
			<GateCard
				num={1}
				title="Plan Gate"
				desc="Planner must save a complete implementation plan before the Builder can start."
				quote="No building without a blueprint."
			/>
			<GateCard
				num={2}
				title="Quality Gate"
				desc="Harness-enforced: quality_gates: in frontmatter are executed by quality-gate.sh on every Stop. The agent cannot advance until all gates pass."
				quote="No review of broken code."
			/>
			<GateCard
				num={3}
				title="Criteria Gate"
				desc="Every success criterion verified with concrete evidence before marking the unit done."
				quote="No shipping without proof."
			/>
		</motion.div>
	)
}

function GateCard({
	num,
	title,
	desc,
	quote,
}: { num: number; title: string; desc: string; quote: string }) {
	return (
		<div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
			<h4 className="mb-1.5 text-sm font-bold text-cyan-400">
				{num}. {title}
			</h4>
			<p className="mb-1.5 text-xs text-gray-500 dark:text-gray-400">{desc}</p>
			<p className="text-xs italic text-gray-400 dark:text-gray-500">
				&ldquo;{quote}&rdquo;
			</p>
		</div>
	)
}

/**
 * QualityGateLifecycle — shows the three-phase lifecycle of quality gates:
 * 1. Detected automatically during /elaborate (tooling discovery)
 * 2. Written to intent.md frontmatter (with optional unit-level additions)
 * 3. Enforced by quality-gate.sh on every Stop during construction
 */
export function QualityGateLifecycle() {
	return (
		<motion.div
			initial={{ opacity: 0, y: 20 }}
			whileInView={{ opacity: 1, y: 0 }}
			viewport={{ once: true, margin: "-40px" }}
			transition={{ duration: 0.5 }}
			className="my-6 space-y-4"
		>
			{/* Phase 1: Detection */}
			<div className="rounded-xl border border-violet-200 bg-violet-50/40 p-5 dark:border-violet-800 dark:bg-violet-950/10">
				<div className="mb-3 flex items-center gap-2">
					<span className="rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-bold text-violet-600 dark:bg-violet-900/40 dark:text-violet-300">
						Phase 1
					</span>
					<span className="text-sm font-bold text-violet-600 dark:text-violet-300">
						Auto-Detected During <code className="font-mono">/elaborate</code>
					</span>
				</div>
				<p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
					The <code className="text-amber-500">elaborate-discover</code> skill
					scans your repository for tooling and proposes the right quality gate
					commands. You confirm or customize them.
				</p>
				<div className="grid gap-2 sm:grid-cols-2">
					{[
						{
							file: "package.json",
							gates: "npm test, npm run typecheck, npm run lint",
							variant: "green",
						},
						{
							file: "bun.lockb / bun.lock",
							gates: "bun test (overrides npm)",
							variant: "amber",
						},
						{ file: "go.mod", gates: "go test ./..., go vet ./...", variant: "cyan" },
						{ file: "pyproject.toml", gates: "pytest, mypy .", variant: "blue" },
						{ file: "Cargo.toml", gates: "cargo test, cargo clippy", variant: "orange" },
						{ file: "Makefile", gates: "make test (if target exists)", variant: "gray" },
					].map((row) => (
						<div
							key={row.file}
							className="flex items-start gap-2 rounded-lg border border-gray-200 bg-white p-2.5 dark:border-gray-700 dark:bg-gray-900"
						>
							<code className="mt-0.5 shrink-0 text-[0.65rem] font-bold text-amber-500">
								{row.file}
							</code>
							<span className="text-[0.65rem] text-gray-400 dark:text-gray-500">
								→ {row.gates}
							</span>
						</div>
					))}
				</div>
			</div>

			{/* Arrow */}
			<div className="flex justify-center text-gray-300 dark:text-gray-700 text-xl">↓</div>

			{/* Phase 2: Written to Frontmatter */}
			<div className="rounded-xl border border-cyan-200 bg-cyan-50/40 p-5 dark:border-cyan-800 dark:bg-cyan-950/10">
				<div className="mb-3 flex items-center gap-2">
					<span className="rounded-full bg-cyan-100 px-2.5 py-0.5 text-xs font-bold text-cyan-600 dark:bg-cyan-900/40 dark:text-cyan-300">
						Phase 2
					</span>
					<span className="text-sm font-bold text-cyan-600 dark:text-cyan-300">
						Written to Intent &amp; Unit Frontmatter
					</span>
				</div>
				<p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
					Confirmed gates are saved to <code className="text-amber-500">intent.md</code>. Builders can add unit-specific gates during construction — but never remove existing ones (the ratchet rule).
				</p>
				<div className="grid gap-3 sm:grid-cols-2">
					<div>
						<div className="mb-1.5 text-[0.65rem] font-bold uppercase tracking-wider text-cyan-500">
							intent.md (intent-level defaults)
						</div>
						<pre className="overflow-x-auto rounded-lg bg-gray-900 p-3 text-[0.65rem] leading-relaxed text-green-400">
{`---
title: Add auth middleware
quality_gates:
  - name: tests
    command: npm test
  - name: typecheck
    command: npm run typecheck
  - name: lint
    command: npm run lint
---`}
						</pre>
					</div>
					<div>
						<div className="mb-1.5 text-[0.65rem] font-bold uppercase tracking-wider text-amber-500">
							unit-01-auth-middleware.md (unit additions)
						</div>
						<pre className="overflow-x-auto rounded-lg bg-gray-900 p-3 text-[0.65rem] leading-relaxed text-green-400">
{`---
title: Implement JWT validation
quality_gates:
  - name: auth-integration
    command: npm test -- --grep auth
---`}
						</pre>
						<p className="mt-2 text-[0.65rem] text-gray-400 dark:text-gray-500">
							Intent gates + unit gates are merged additively. All run on every Stop during this unit.
						</p>
					</div>
				</div>
			</div>

			{/* Arrow */}
			<div className="flex justify-center text-gray-300 dark:text-gray-700 text-xl">↓</div>

			{/* Phase 3: Enforcement */}
			<div className="rounded-xl border border-rose-200 bg-rose-50/40 p-5 dark:border-rose-800 dark:bg-rose-950/10">
				<div className="mb-3 flex items-center gap-2">
					<span className="rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-bold text-rose-600 dark:bg-rose-900/40 dark:text-rose-300">
						Phase 3
					</span>
					<span className="text-sm font-bold text-rose-600 dark:text-rose-300">
						Enforced on Every Stop During Construction
					</span>
				</div>
				<p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
					Whenever a Builder, Implementer, or Refactorer tries to stop,{" "}
					<code className="text-amber-500">quality-gate.sh</code> fires synchronously.
					It reads <code className="text-amber-500">quality_gates:</code> from intent
					and unit frontmatter, runs each command, and blocks the stop if any fail.
				</p>
				<div className="rounded-lg bg-gray-900 p-4 font-mono text-[0.65rem] leading-relaxed">
					<div className="mb-2 text-gray-500"># Agent tries to stop after a coding session</div>
					<div className="text-gray-300">quality-gate.sh fires (synchronous Stop hook)</div>
					<div className="mt-2 text-gray-500">&nbsp;&nbsp;# Reads intent.md + unit frontmatter gates</div>
					<div className="mt-1">
						<span className="text-gray-400">&nbsp;&nbsp;Running: </span>
						<span className="text-amber-400">npm test</span>
						<span className="ml-3 text-green-400">✓ PASS</span>
					</div>
					<div className="mt-1">
						<span className="text-gray-400">&nbsp;&nbsp;Running: </span>
						<span className="text-amber-400">npm run typecheck</span>
						<span className="ml-3 text-rose-400">✗ FAIL — 3 type errors</span>
					</div>
					<div className="mt-3 rounded border border-rose-800 bg-rose-950/40 px-3 py-2">
						<span className="text-rose-400 font-bold">BLOCKED</span>
						<span className="text-gray-400"> — agent cannot stop. Must fix type errors first.</span>
					</div>
					<div className="mt-3 text-gray-500"># After fixing type errors and retrying:</div>
					<div className="mt-1">
						<span className="text-gray-400">&nbsp;&nbsp;Running: </span>
						<span className="text-amber-400">npm test</span>
						<span className="ml-3 text-green-400">✓ PASS</span>
					</div>
					<div className="mt-1">
						<span className="text-gray-400">&nbsp;&nbsp;Running: </span>
						<span className="text-amber-400">npm run typecheck</span>
						<span className="ml-3 text-green-400">✓ PASS</span>
					</div>
					<div className="mt-3 rounded border border-green-800 bg-green-950/40 px-3 py-2">
						<span className="text-green-400 font-bold">ALLOWED</span>
						<span className="text-gray-400"> — all gates pass. Agent stops cleanly.</span>
					</div>
				</div>
				<p className="mt-3 text-[0.65rem] text-gray-400 dark:text-gray-500">
					Planner, Reviewer, and Designer hats skip gate enforcement — they&apos;re not writing code.
					Only building hats (Builder, Implementer, Refactorer) are enforced.
				</p>
			</div>
		</motion.div>
	)
}
