// session-metadata.ts — H·AI·K·U session metadata persistence
//
// The MCP server receives a `state_file` path from the pre_tool_use hook.
// It writes current state there after mutations. The SessionStart hook
// reads it for instant context recovery.
//
// The MCP never resolves session IDs or config dirs — that's the hook's job.
// All operations are non-fatal.

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

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

/** Append an event to the session's haiku.jsonl log. Non-fatal. */
export function logSessionEvent(stateFile: string, event: Record<string, unknown>): void {
	try {
		const jsonlPath = stateFile.replace(/\.json$/, ".jsonl")
		mkdirSync(dirname(jsonlPath), { recursive: true })
		const entry = { ...event, ts: new Date().toISOString() }
		appendFileSync(jsonlPath, JSON.stringify(entry) + "\n")
	} catch { /* non-fatal */ }
}

/** Check if this session already has an active intent. Returns the slug or null. */
export function getSessionIntent(stateFile: string): string | null {
	const metadata = readHaikuMetadata(stateFile)
	return metadata?.intent || null
}
