// prompts/helpers.ts — Shared utilities for prompt handlers

import { existsSync, readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import type { GetPromptResult } from "@modelcontextprotocol/sdk/types.js"
import { resolvePluginRoot } from "../config.js"
import { findHaikuRoot, intentDir, parseFrontmatter } from "../state-tools.js"

// ── Message builders ─────────────────────────────────────────────────────────

export function textMsg(role: "user" | "assistant", text: string) {
	return { role, content: { type: "text" as const, text } }
}

export function singleMessage(text: string): GetPromptResult {
	return { messages: [textMsg("user", text)] }
}

// ── File readers ─────────────────────────────────────────────────────────────

export function readJson(path: string): Record<string, unknown> {
	if (!existsSync(path)) return {}
	try {
		return JSON.parse(readFileSync(path, "utf8"))
	} catch {
		return {}
	}
}

// ── Validation ───────────────────────────────────────────────────────────────

/** Reject identifiers containing path separators or traversal sequences */
export function validateIdentifier(value: string, label: string): string {
	if (/[/\\]|\.\./.test(value)) {
		throw new Error(`Invalid ${label}: "${value}"`)
	}
	return value
}

// ── Studio resolution ────────────────────────────────────────────────────────

/** Studio search paths: project-local first (overrides), then plugin built-in */
export function studioSearchPaths(): string[] {
	const pluginRoot = resolvePluginRoot()
	return [join(process.cwd(), ".haiku", "studios"), join(pluginRoot, "studios")]
}

/** Find active intents from .haiku/intents/ */
export function findActiveIntents(): Array<{
	slug: string
	data: Record<string, unknown>
	body: string
}> {
	try {
		const root = findHaikuRoot()
		const intentsDir = join(root, "intents")
		if (!existsSync(intentsDir)) return []
		const results: Array<{
			slug: string
			data: Record<string, unknown>
			body: string
		}> = []
		for (const d of readdirSync(intentsDir, { withFileTypes: true })) {
			if (!d.isDirectory()) continue
			const file = join(intentsDir, d.name, "intent.md")
			if (!existsSync(file)) continue
			const { data, body } = parseFrontmatter(readFileSync(file, "utf8"))
			if (data.status === "active") {
				results.push({ slug: d.name, data, body })
			}
		}
		return results
	} catch {
		return []
	}
}
