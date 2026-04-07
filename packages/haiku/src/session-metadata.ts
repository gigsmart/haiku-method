// session-metadata.ts — H·AI·K·U session metadata persistence
//
// The MCP server receives a `state_file` path from the pre_tool_use hook.
// It writes current state there after mutations. The SessionStart hook
// reads it for instant context recovery.
//
// The MCP never resolves session IDs or config dirs — that's the hook's job.
// All operations are non-fatal.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"

export interface HaikuSessionMetadata {
	intent: string
	studio: string
	active_stage: string
	phase: string
	active_unit: string | null
	hat: string | null
	bolt: number | null
	stage_description: string
	stage_unit_types: string[]
	updated_at: string
}

/** Write metadata to the given state file path. Non-fatal. */
export function writeHaikuMetadata(stateFile: string, data: HaikuSessionMetadata): void {
	try {
		mkdirSync(dirname(stateFile), { recursive: true })
		writeFileSync(stateFile, JSON.stringify(data, null, 2) + "\n")
	} catch { /* non-fatal — never crash the MCP */ }
}

/** Read metadata from the given state file path. Returns null on any error. */
export function readHaikuMetadata(stateFile: string): HaikuSessionMetadata | null {
	try {
		if (!existsSync(stateFile)) return null
		return JSON.parse(readFileSync(stateFile, "utf8")) as HaikuSessionMetadata
	} catch { /* non-fatal */ }
	return null
}
