// tools/orchestrator/haiku_dispatch_quality_gates.ts — Run a unit's
// declared quality_gates as the v4 `approvals.quality_gates` actor.
//
// Cursor returns `dispatch_quality_gates { stage, units }` when the
// post-execute approval track reaches the quality_gates role. The
// agent calls this tool; the engine runs each unit's `quality_gates:
// [{name, command, dir?}]` synchronously. On all-pass, stamp
// `approvals.quality_gates = { at: now }` on each unit. On any
// failure, file an FB targeting the unit (origin: `agent`,
// targets.invalidates: ["quality_gates"]) so the cursor reroutes
// through the fix loop.
//
// This replaces the v3 inline last-hat quality_gates check that lived
// inside `advance_hat`. Moving it into an explicit cursor actor:
//   - Surfaces failures as FBs (not opaque errors thrown from
//     advance_hat)
//   - Decouples merge from gate-running — merge fires in the
//     terminal hat advance, gates run as a separate approval
//   - Makes mode-shaping uniform: autopilot still runs gates;
//     continuous + discrete also run them as part of the role list

import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import matter from "gray-matter"
import { buildApprovalRecord } from "../../orchestrator/workflow/sign-slot.js"
import {
	intentDir,
	runInlineQualityGates,
	writeFeedbackFile,
} from "../../state-tools.js"
import { defineTool } from "../define.js"
import { text } from "./_text.js"

type GateFailure = {
	unit: string
	failures: Array<{
		name: string
		command: string
		exit_code: number
		output: string
	}>
}

export default defineTool({
	name: "haiku_dispatch_quality_gates",
	description:
		"Run the declared `quality_gates` for one or more units. On all-pass for a unit, stamps approvals.quality_gates. On any failure, files an FB targeting the unit. Engine-callable from the cursor's dispatch_quality_gates action.",
	inputSchema: {
		type: "object" as const,
		properties: {
			intent: { type: "string" },
			stage: { type: "string" },
			units: { type: "array", items: { type: "string" } },
		},
		required: ["intent", "stage", "units"],
	},
	async handle(args) {
		const intent = args.intent as string
		const stage = args.stage as string
		const units = (args.units as string[]) || []

		const passed: string[] = []
		const failures: GateFailure[] = []

		for (const unit of units) {
			const unitPath = join(
				intentDir(intent),
				"stages",
				stage,
				"units",
				`${unit}.md`,
			)
			if (!existsSync(unitPath)) {
				failures.push({
					unit,
					failures: [
						{
							name: "unit_not_found",
							command: "",
							exit_code: 1,
							output: `Unit file not found at ${unitPath}`,
						},
					],
				})
				continue
			}
			const result = runInlineQualityGates(intent, unitPath)
			if (result === null) {
				// runQualityGates returns null on all-pass.
				stampApproval(unitPath, "quality_gates")
				passed.push(unit)
			} else {
				failures.push({ unit, failures: result.failures })
				// File an FB targeting this unit, invalidating the
				// quality_gates role. The fix loop addresses the gate
				// failure; on its terminal advance, this approval
				// reopens (as null) and the cursor re-dispatches the
				// gates. Closure of the FB clears the invalidation.
				const failureSummary = result.failures
					.map((f) => `- ${f.name}: \`${f.command}\` exited ${f.exit_code}`)
					.join("\n")
				writeFeedbackFile(intent, stage, {
					title: `quality_gates failure on ${unit}`,
					body: `One or more declared quality_gates failed on unit \`${unit}\`:\n\n${failureSummary}\n\nThe fix loop should resolve the failure, then quality_gates re-runs on the next tick.`,
					origin: "agent",
					author: "engine",
					source_ref: `unit:${unit}`,
				})
			}
		}

		return text(
			JSON.stringify(
				{
					passed,
					failures,
					message:
						failures.length === 0
							? `All ${passed.length} unit(s) passed quality_gates. Approvals stamped.`
							: `${failures.length} unit(s) had quality_gate failures — FBs filed. ${passed.length} passed.`,
				},
				null,
				2,
			),
		)
	},
})

/** Stamp `approvals.<role>` on a unit's frontmatter with a witnesses
 *  map. Each declared output gets its sha256 captured at sign time so
 *  the drift sweep can detect later edits to those files. */
function stampApproval(unitPath: string, role: string): void {
	const raw = readFileSync(unitPath, "utf8")
	const parsed = matter(raw)
	const data = parsed.data as Record<string, unknown>
	const approvals = (data.approvals as Record<string, unknown>) ?? {}
	const outputs = Array.isArray(data.outputs) ? (data.outputs as string[]) : []
	const intentDirAbs = unitPath.split("/stages/")[0]
	approvals[role] = buildApprovalRecord(intentDirAbs, outputs)
	data.approvals = approvals
	const out = matter.stringify(parsed.content, data)
	writeFileSync(unitPath, out)
}
