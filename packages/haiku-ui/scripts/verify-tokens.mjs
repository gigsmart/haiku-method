#!/usr/bin/env node
/**
 * verify-tokens.mjs — asserts parity between the canonical token declarations
 * in knowledge/DESIGN-TOKENS.md and the implementation surface in
 * packages/haiku-ui/src/index.css + packages/haiku-ui/tailwind.config.ts.
 *
 * Tokens covered:
 *   §1.5 Border / Radius pattern names (spot-check that the canonical rounded-xl
 *        / rounded-lg / rounded-md / rounded-full atoms remain reachable via
 *        tailwindcss defaults — no theme override needed).
 *   §2.1 Feedback status foreground/background pairs (semantic aliases must
 *        appear in the index.css @theme block as --color-feedback-*).
 *   §2.2 Origin badge pairs (--color-origin-*).
 *   §2.5 Canonical container tokens (--sidebar-width, --sidebar-width-xl,
 *        --content-max) — must appear in :root, value-exact.
 *   §2.4 Visit-counter tier tokens — must appear in tailwind.config.ts safelist.
 *
 * Exits 0 iff every required token is present with the expected value.
 * Exits 1 and prints a TOKEN MISMATCH line per failure.
 * Exits 2 on config/file-read error.
 */
import { existsSync, readdirSync, statSync } from "node:fs"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const PACKAGE_DIR = path.resolve(SCRIPT_DIR, "..")
const REPO_ROOT = path.resolve(PACKAGE_DIR, "../..")
const INDEX_CSS = path.join(PACKAGE_DIR, "src/index.css")
const TAILWIND_CONFIG = path.join(PACKAGE_DIR, "tailwind.config.ts")

function resolveDesignTokensPath() {
	if (process.env.HAIKU_INTENT_DIR) {
		return path.join(process.env.HAIKU_INTENT_DIR, "knowledge/DESIGN-TOKENS.md")
	}
	// Prefer the unit-worktree's own intent dir — the worktree lives under
	// `.haiku/worktrees/<intent>/<unit>/`, and that intent's knowledge/
	// DESIGN-TOKENS.md is the canonical source for this unit. The CWD (or the
	// PACKAGE_DIR path) contains that intent slug as a parent directory.
	const candidates = [PACKAGE_DIR, process.cwd()]
	for (const startDir of candidates) {
		const match = startDir.match(/\.haiku\/worktrees\/([^/]+)\/[^/]+/)
		if (match) {
			// Walk upward from the start dir to find the unit worktree root,
			// then read its own `.haiku/intents/<intent>/knowledge/DESIGN-TOKENS.md`.
			const intent = match[1]
			let cur = startDir
			for (let i = 0; i < 12; i += 1) {
				const candidate = path.join(
					cur,
					".haiku/intents",
					intent,
					"knowledge/DESIGN-TOKENS.md",
				)
				if (existsSync(candidate)) return candidate
				const parent = path.dirname(cur)
				if (parent === cur) break
				cur = parent
			}
		}
	}
	// Fallback: walk upward from the script looking for any
	// `.haiku/intents/<intent>/knowledge/DESIGN-TOKENS.md`, preferring the one
	// whose parent dir name literally appears in the walk path.
	let cur = PACKAGE_DIR
	for (let i = 0; i < 12; i += 1) {
		const candidateRoot = path.join(cur, ".haiku/intents")
		try {
			if (existsSync(candidateRoot)) {
				const intents = readdirSync(candidateRoot).filter((f) => {
					const full = path.join(candidateRoot, f)
					try {
						return statSync(full).isDirectory()
					} catch {
						return false
					}
				})
				// Prefer an intent whose slug appears in the PACKAGE_DIR path.
				const preferred = intents.find((intent) =>
					PACKAGE_DIR.includes(`/${intent}/`),
				)
				const ordered = preferred
					? [preferred, ...intents.filter((i) => i !== preferred)]
					: intents
				for (const intent of ordered) {
					const p = path.join(
						candidateRoot,
						intent,
						"knowledge/DESIGN-TOKENS.md",
					)
					if (existsSync(p)) return p
				}
			}
		} catch {}
		const parent = path.dirname(cur)
		if (parent === cur) break
		cur = parent
	}
	return null
}

async function readFileOrNull(p) {
	try {
		return await readFile(p, "utf8")
	} catch {
		return null
	}
}

const mismatches = []

function fail(section, token, expected, found) {
	mismatches.push(
		`TOKEN MISMATCH: ${section}.${token} — expected ${JSON.stringify(expected)}, found ${JSON.stringify(found)}`,
	)
}

function expectInIndexCss(css, rule, label) {
	// Accept the rule as a literal substring so whitespace/semicolons don't matter.
	if (!css.includes(rule)) {
		fail("index.css", label, rule, "<missing>")
	}
}

function expectRootVar(css, name, expectedValue) {
	const re = new RegExp(`${name}\\s*:\\s*([^;]+);`)
	const match = css.match(re)
	if (!match) {
		fail(":root", name, expectedValue, "<missing>")
		return
	}
	const got = match[1].trim()
	if (got !== expectedValue) {
		fail(":root", name, expectedValue, got)
	}
}

function expectSafelistContains(config, needle) {
	if (!config.includes(needle)) {
		fail("tailwind.config.safelist", needle, needle, "<missing>")
	}
}

async function main() {
	const designPath = resolveDesignTokensPath()
	if (!designPath) {
		console.error(
			"verify-tokens: could not resolve knowledge/DESIGN-TOKENS.md — set HAIKU_INTENT_DIR or run from within a unit worktree.",
		)
		process.exit(2)
	}

	const design = await readFileOrNull(designPath)
	const css = await readFileOrNull(INDEX_CSS)
	const config = await readFileOrNull(TAILWIND_CONFIG)
	if (!design || !css || !config) {
		console.error(
			`verify-tokens: missing file — design=${!!design} css=${!!css} config=${!!config}`,
		)
		process.exit(2)
	}

	// §2.5 Container tokens (canonical, value-exact).
	expectRootVar(css, "--sidebar-width", "20rem")
	expectRootVar(css, "--sidebar-width-xl", "24rem")
	expectRootVar(css, "--content-max", "1400px")

	// §2.1 Feedback semantic aliases — verify the @theme block declares all four.
	const feedbackAliases = [
		"--color-feedback-pending-fg",
		"--color-feedback-pending-bg",
		"--color-feedback-addressed-fg",
		"--color-feedback-addressed-bg",
		"--color-feedback-closed-fg",
		"--color-feedback-closed-bg",
		"--color-feedback-rejected-fg",
		"--color-feedback-rejected-bg",
	]
	for (const alias of feedbackAliases) {
		if (!css.includes(alias)) {
			fail("@theme §2.1", alias, "present", "<missing>")
		}
	}

	// §2.2 Origin semantic aliases.
	const originAliases = [
		"--color-origin-adversarial-fg",
		"--color-origin-adversarial-bg",
		"--color-origin-external-fg",
		"--color-origin-external-bg",
		"--color-origin-user-fg",
		"--color-origin-user-bg",
		"--color-origin-agent-fg",
		"--color-origin-agent-bg",
	]
	for (const alias of originAliases) {
		if (!css.includes(alias)) {
			fail("@theme §2.2", alias, "present", "<missing>")
		}
	}

	// §5 Animation: feedback-status-change keyframes + reduced-motion fallback.
	expectInIndexCss(
		css,
		"@keyframes feedback-status-change",
		"feedback-status-change keyframes",
	)
	expectInIndexCss(
		css,
		".feedback-status-changed",
		"feedback-status-changed class",
	)
	// reduced-motion fallback MUST exist inside a @media block.
	if (
		!/prefers-reduced-motion[^\n]*\n[\s\S]*?\.feedback-status-changed[\s\S]*?animation:\s*none/.test(
			css,
		)
	) {
		fail(
			"@media (prefers-reduced-motion)",
			".feedback-status-changed",
			"animation: none fallback",
			"<missing>",
		)
	}

	// §2.4 Visit-counter tier tokens — ensure tailwind.config safelist includes them
	// so Tailwind won't tree-shake these runtime-interpolated classes.
	const visitTokens = [
		"bg-stone-200",
		"text-stone-600",
		"dark:bg-stone-700",
		"dark:text-stone-300",
		"bg-amber-200",
		"text-amber-800",
		"dark:bg-amber-900/40",
		"dark:text-amber-300",
		"bg-red-200",
		"text-red-800",
		"dark:bg-red-900/40",
		"dark:text-red-300",
	]
	for (const tok of visitTokens) {
		expectSafelistContains(config, tok)
	}

	// Safelist patterns for feedback/origin runtime-interpolated color pairs.
	const requiredSafelistPatterns = [
		"amber|blue|green|stone",
		"rose|violet|sky|teal|indigo|purple|cyan",
		"border-l-[3px]",
	]
	for (const pat of requiredSafelistPatterns) {
		if (!config.includes(pat)) {
			fail("tailwind.config.safelist.pattern", pat, pat, "<missing>")
		}
	}

	// §1.5 + §1.6 — spot-check the canonical class atoms are referenced in design doc.
	// (These are pure Tailwind utilities; presence in the design doc is enough, no
	// override needed in @theme.)
	const atoms = ["rounded-xl", "rounded-lg", "rounded-full", "shadow-sm"]
	for (const atom of atoms) {
		if (!design.includes(atom)) {
			fail("DESIGN-TOKENS §1.5/§1.6", atom, atom, "<missing in doc>")
		}
	}

	// Summary
	if (mismatches.length === 0) {
		const totalChecks =
			3 + // container vars
			feedbackAliases.length +
			originAliases.length +
			2 + // keyframes + class
			1 + // reduced-motion fallback
			visitTokens.length +
			requiredSafelistPatterns.length +
			atoms.length
		console.log(
			`verify-tokens · OK · ${totalChecks} token checks · 0 mismatches`,
		)
		console.log(`  DESIGN-TOKENS.md: ${path.relative(REPO_ROOT, designPath)}`)
		console.log(`  index.css:        ${path.relative(REPO_ROOT, INDEX_CSS)}`)
		console.log(
			`  tailwind config:  ${path.relative(REPO_ROOT, TAILWIND_CONFIG)}`,
		)
		process.exit(0)
	}

	for (const m of mismatches) console.error(m)
	console.error(`\nverify-tokens · FAIL · ${mismatches.length} mismatch(es)`)
	process.exit(1)
}

main().catch((err) => {
	console.error(err)
	process.exit(2)
})
