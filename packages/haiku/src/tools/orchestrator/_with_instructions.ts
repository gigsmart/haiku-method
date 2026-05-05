// tools/orchestrator/_with_instructions.ts — Shared response renderer.
//
// Both haiku_run_next and haiku_await_gate finish by stringifying their
// orchestrator action into a JSON block followed by harness-adapted
// instruction prose. The closure used to live inside haiku_run_next as
// `withInstructions(resultObj)`; lifting it here lets haiku_await_gate
// produce the exact same envelope without re-deriving slug/studio
// state.

import { adaptInstructions } from "../../harness-instructions.js"
import {
	buildRunInstructions,
	enrichActionWithPreview,
	type OrchestratorAction,
} from "../../orchestrator.js"
import { intentDir } from "../../state-tools.js"

export function withInstructions(
	slug: string,
	intentStudio: string,
	resultObj: Record<string, unknown>,
): string {
	enrichActionWithPreview(resultObj as OrchestratorAction)
	const instructions = buildRunInstructions(
		slug,
		intentStudio,
		resultObj as OrchestratorAction,
		intentDir(slug),
	)
	const adapted = adaptInstructions(instructions)
	const { tell_user: _tu, next_step: _ns, ...resultForJson } = resultObj
	return `${JSON.stringify(resultForJson, null, 2)}\n\n---\n\n${adapted}`
}
