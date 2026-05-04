// tools/orchestrator/index.ts — Registry of per-tool orchestrator
// handlers. Each per-tool file under this directory exports a
// `ToolDef` as its default export. The registry collects them into
// `orchestratorToolHandlers` (Map<name, ToolDef>) so
// `handleOrchestratorTool` can dispatch by name with a single lookup.
//
// The remaining (not-yet-extracted) orchestrator tool cases continue
// to live in orchestrator.ts's if-chain. handleOrchestratorTool
// checks the registry first, falls back to the chain for unmigrated
// tools. As more tools migrate, the chain shrinks toward zero.

import type { ToolDef } from "../types.js"
import haiku_baseline_init from "./haiku_baseline_init.js"
import haiku_classify_drift from "./haiku_classify_drift.js"
import haiku_coverage_acknowledge from "./haiku_coverage_acknowledge.js"
import haiku_human_write from "./haiku_human_write.js"
import haiku_intent_archive from "./haiku_intent_archive.js"
import haiku_intent_create from "./haiku_intent_create.js"
import haiku_intent_reset from "./haiku_intent_reset.js"
import haiku_intent_unarchive from "./haiku_intent_unarchive.js"
import haiku_record_agent_write from "./haiku_record_agent_write.js"
import haiku_run_next from "./haiku_run_next.js"
import haiku_select_studio from "./haiku_select_studio.js"

export const orchestratorToolHandlers: ReadonlyMap<string, ToolDef> = new Map(
	(
		[
			haiku_baseline_init,
			haiku_classify_drift,
			haiku_coverage_acknowledge,
			haiku_human_write,
			haiku_intent_archive,
			haiku_intent_create,
			haiku_intent_reset,
			haiku_intent_unarchive,
			haiku_record_agent_write,
			haiku_run_next,
			haiku_select_studio,
		] satisfies ToolDef[]
	).map((t) => [t.name, t]),
)
