// state/shared.ts — Tiny helpers shared by every state subsystem.
//
// These used to live in the middle of state-tools.ts, but as the file
// got carved into per-domain modules (repair, feedback, paths, scope,
// iterations, etc.) every one of those modules ended up needing the same
// 4–5 helpers. Lifting them here breaks the circular-import shape that
// would otherwise form between state-tools.ts and the new modules.

import { execFileSync } from "node:child_process"
import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs"
import { join } from "node:path"
import {
	dedupeFrontmatterKeys,
	isDuplicateKeyError,
} from "@haiku/shared/frontmatter"
import matter from "gray-matter"
import { reportError } from "../sentry.js"

// ── Environment detection ──────────────────────────────────────────────────

/** Cached flag: are we in a git repository? Detected once at startup. */
let _isGitRepo: boolean | null = null

export function isGitRepo(): boolean {
	if (_isGitRepo !== null) return _isGitRepo
	try {
		execFileSync("git", ["rev-parse", "--git-dir"], {
			encoding: "utf8",
			stdio: "pipe",
		})
		_isGitRepo = true
	} catch {
		_isGitRepo = false
	}
	return _isGitRepo
}

/** Reset the cached git-repo detection. Intended for tests that change cwd
 *  between different repos (real git / non-git / different real git). Not
 *  called in production — the process runs with a single cwd. */
export function _resetIsGitRepoForTests(): void {
	_isGitRepo = null
}

/** Pin isGitRepo to a specific value. Combined with setHaikuRootForTests,
 *  this gives tests full isolation when exercising side-effecting workflow
 *  handlers (workflowStartStage, workflowGateAsk, etc.) against a tmpdir
 *  fixture: the handler thinks there's no git, skips every branch/merge
 *  operation, but still writes state.json + emits the action. */
export function setIsGitRepoForTests(value: boolean | null): void {
	_isGitRepo = value
}

// ── Path resolution ────────────────────────────────────────────────────────

/** Test-only override for findHaikuRoot. Set via setHaikuRootForTests
 *  before exercising workflow handlers (or any code path that calls
 *  workflowStartStage / workflowGateAsk / etc.) with a tmpdir intent fixture.
 *  Without this, side-effecting handlers find the parent repo's
 *  .haiku/ and pollute it with stray branches and stage-state files. */
let _haikuRootOverride: string | null = null

/** Pin findHaikuRoot to a specific path (typically a tmpdir's
 *  `<root>/.haiku`). Pass null to clear. Tests must call this before
 *  triggering workflow handlers and clear it in cleanup. */
export function setHaikuRootForTests(path: string | null): void {
	_haikuRootOverride = path
}

export function findHaikuRoot(): string {
	if (_haikuRootOverride) return _haikuRootOverride
	// Walk up from cwd looking for .haiku/
	let dir = process.cwd()
	for (let i = 0; i < 20; i++) {
		if (existsSync(join(dir, ".haiku"))) return join(dir, ".haiku")
		const parent = join(dir, "..")
		if (parent === dir) break
		dir = parent
	}
	throw new Error("No .haiku/ directory found")
}

export function intentDir(slug: string): string {
	return join(findHaikuRoot(), "intents", slug)
}

export function stageDir(slug: string, stage: string): string {
	return join(intentDir(slug), "stages", stage)
}

export function unitPath(slug: string, stage: string, unit: string): string {
	const name = unit.endsWith(".md") ? unit : `${unit}.md`
	const dir = join(stageDir(slug, stage), "units")
	const exact = join(dir, name)
	if (existsSync(exact)) return exact
	// Width-flexible numeric-prefix lookup. Migration path for intents
	// authored with 2-digit padding (`unit-01-foo.md`) when the agent
	// passes 3-digit (`unit-001-foo`) or vice versa.
	const m = name.match(/^unit-(\d+)-(.+)\.md$/)
	if (!m) return exact
	const targetNum = Number.parseInt(m[1], 10)
	const targetSlug = m[2]
	if (!existsSync(dir)) return exact
	const matches = readdirSync(dir).filter((f) => {
		const fm = f.match(/^unit-(\d+)-(.+)\.md$/)
		if (!fm) return false
		return Number.parseInt(fm[1], 10) === targetNum && fm[2] === targetSlug
	})
	if (matches.length === 1) return join(dir, matches[0])
	return exact
}

export function stageStatePath(slug: string, stage: string): string {
	return join(stageDir(slug, stage), "state.json")
}

/**
 * Minimal glob matcher. Accepts:
 *   - exact path: "stages/design/artifacts/foo.html"
 *   - directory path (prefix match): "stages/design/artifacts/" or "stages/design/artifacts"
 *   - single-star glob: "stages/design/artifacts/*.html"
 *   - double-star glob: trailing or mid-string (e.g. packages\/&#42;&#42;\/src)
 *
 * Exported for direct testing (no stable API guarantee).
 */
export function matchesGlob(candidate: string, pattern: string): boolean {
	const c = candidate.replace(/^\.\//, "")
	const p = pattern.replace(/^\.\//, "")
	if (c === p) return true
	// Directory prefix: pattern ends with / or /** or is a plain dir
	if (p.endsWith("/**")) {
		const prefix = p.slice(0, -3)
		return c === prefix || c.startsWith(`${prefix}/`)
	}
	if (p.endsWith("/")) {
		return c.startsWith(p)
	}
	// Plain dir (no trailing slash, no star): treat as prefix if candidate is under it
	if (!p.includes("*") && c.startsWith(`${p}/`)) return true
	// Star wildcards: convert to regex. Use a NUL placeholder for `**` so
	// the subsequent single-`*` expansion doesn't re-expand the `.*`.
	if (p.includes("*")) {
		const esc = p.replace(/[.+?^${}()|[\]\\]/g, "\\$&")
		const doubleStar = /\*\*/g
		// biome-ignore lint/suspicious/noControlCharactersInRegex: \x00 sentinel restored after escaping single *
		const sentinel = /\x00/g
		const regex = new RegExp(
			`^${esc
				.replace(doubleStar, "\x00")
				.replace(/\*/g, "[^/]*")
				.replace(sentinel, ".*")}$`,
		)
		return regex.test(c)
	}
	return false
}

// ── JSON helpers ───────────────────────────────────────────────────────────

export function readJson(path: string): Record<string, unknown> {
	if (!existsSync(path)) return {}
	return JSON.parse(readFileSync(path, "utf8"))
}

export function writeJson(path: string, data: Record<string, unknown>): void {
	mkdirSync(join(path, ".."), { recursive: true })
	writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`)
}

/** ISO-8601 timestamp without millisecond precision. The trailing `.NNNZ`
 *  is stripped so persisted timestamps stay readable in feedback files,
 *  state.json, and intent frontmatter. */
export function timestamp(): string {
	return new Date().toISOString().replace(/\.\d{3}Z$/, "Z")
}

// ── Frontmatter parsing ────────────────────────────────────────────────────

export function normalizeDates(
	data: Record<string, unknown>,
): Record<string, unknown> {
	const result = { ...data }
	for (const key in result) {
		if (result[key] instanceof Date) {
			result[key] = (result[key] as Date).toISOString().split("T")[0]
		}
	}
	return result
}

export function parseFrontmatter(raw: string): {
	data: Record<string, unknown>
	body: string
} {
	// Auto-recover from duplicate top-level YAML keys by keeping the last
	// occurrence and reparsing. haiku_repair separately flags these files so
	// they get rewritten on disk; this keeps the workflow running in the meantime.
	const tryParse = (text: string) => {
		const { data, content } = matter(text)
		return {
			data: normalizeDates(data as Record<string, unknown>),
			body: content.trim(),
		}
	}
	try {
		return tryParse(raw)
	} catch (err) {
		if (!isDuplicateKeyError(err)) throw err
		const { text, removed } = dedupeFrontmatterKeys(raw)
		if (removed.length === 0) throw err
		// Report the recovery so we can see which files are drifting and how often
		// — the file is still live with deduped values until haiku_repair rewrites it.
		reportError(err, {
			context: "parseFrontmatter:dedup-recovery",
			removed_keys: removed,
		})
		return tryParse(text)
	}
}
