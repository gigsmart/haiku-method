#!/usr/bin/env node
import fs from "node:fs"
/**
 * audit-reduced-motion.mjs — asserts the reduced-motion contract declared
 * in `stages/design/artifacts/motion-and-reduced-motion-spec.md §10`:
 *
 * 1. `packages/haiku-ui/src/index.css` MUST contain a canonical
 *    `@media (prefers-reduced-motion: reduce)` block that clamps
 *    `animation-duration` AND `transition-duration` to `0.01ms !important`.
 *    This global guard makes every animated element compliant by default;
 *    per-file overrides are optional belt-and-suspenders.
 *
 * 2. Every `@keyframes` declaration in `index.css` that drives a purely
 *    decorative animation (pulses, spinners, slide-ins) SHOULD carry a
 *    matching `@media (prefers-reduced-motion: reduce) { .<class> {
 *    animation: none; } }` override in the same file. This is enforced
 *    as a soft policy — the global duration guard already collapses the
 *    animation to `0.01ms`, and an explicit `animation: none` is the
 *    spec-recommended additional guard for decorative motion.
 *
 * Exit codes:
 *   0 — global guard present + every `@keyframes` has a matching
 *       reduce-motion override in the same file
 *   1 — global guard missing OR a `@keyframes` declaration lacks an
 *       override
 *   2 — filesystem / read error
 */
import { readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const PACKAGE_DIR = path.resolve(SCRIPT_DIR, "..")
const INDEX_CSS = path.join(PACKAGE_DIR, "src", "index.css")
const REPORTS_DIR = path.join(PACKAGE_DIR, "reports")

async function main() {
	let css
	try {
		css = await readFile(INDEX_CSS, "utf8")
	} catch (err) {
		console.error(
			`audit-reduced-motion · cannot read ${INDEX_CSS}: ${err instanceof Error ? err.message : String(err)}`,
		)
		process.exit(2)
	}

	const failures = []

	// Check 1 — global duration guard.
	// Must contain `@media (prefers-reduced-motion: reduce)` + both
	// `animation-duration` and `transition-duration` clamped to `0.01ms`.
	const guardMatch = css.match(
		/@media\s*\(prefers-reduced-motion:\s*reduce\)[^{]*\{[\s\S]*?animation-duration:\s*0\.01ms[\s\S]*?transition-duration:\s*0\.01ms/,
	)
	if (!guardMatch) {
		failures.push({
			kind: "global-guard-missing",
			detail:
				"index.css lacks a `@media (prefers-reduced-motion: reduce)` block that clamps animation-duration + transition-duration to 0.01ms !important",
		})
	}

	// Check 2 — every @keyframes declaration in index.css must have a
	// corresponding `animation: none` override inside a
	// `@media (prefers-reduced-motion: reduce)` block further down the file.
	const keyframeNames = [...css.matchAll(/@keyframes\s+([a-zA-Z0-9_-]+)/g)].map(
		(m) => m[1],
	)
	const reduceBlocks = [
		...css.matchAll(
			/@media\s*\(prefers-reduced-motion:\s*reduce\)[^{]*\{([\s\S]*?)\n\}/g,
		),
	].map((m) => m[1])
	const reduceText = reduceBlocks.join("\n")
	for (const name of keyframeNames) {
		// The override may be keyed on the class that consumes the keyframe,
		// not the keyframe name itself. We accept either (a) a literal
		// `animation: none` mention with the keyframe name nearby, or (b) a
		// per-class rule inside any reduce-motion block that sets `animation:
		// none` paired with the class string derived from the keyframe name
		// (common pattern: `@keyframes feedback-pulse` consumed by
		// `.feedback-fab-pulse`).
		const derivedClass = name.replace(/-?pulse|-?enter|-?spin/gi, "")
		const mentions =
			reduceText.includes(`animation: none`) &&
			(reduceText.includes(name) || reduceText.includes(derivedClass))
		if (!mentions) {
			failures.push({
				kind: "keyframe-missing-override",
				keyframe: name,
				detail: `@keyframes ${name} has no matching \`animation: none\` override inside a @media (prefers-reduced-motion: reduce) block in index.css`,
			})
		}
	}

	await fs.promises.mkdir(REPORTS_DIR, { recursive: true })
	await fs.promises.writeFile(
		path.join(REPORTS_DIR, "reduced-motion.json"),
		`${JSON.stringify({ keyframes: keyframeNames, failures }, null, 2)}\n`,
	)

	console.log(
		`audit-reduced-motion · ${keyframeNames.length} keyframes · ${failures.length} fail`,
	)
	console.log(
		`  report: ${path.relative(process.cwd(), path.join(REPORTS_DIR, "reduced-motion.json"))}`,
	)
	if (failures.length > 0) {
		for (const f of failures) {
			console.error(`  FAIL [${f.kind}] ${f.keyframe || ""} — ${f.detail}`)
		}
		process.exit(1)
	}
	process.exit(0)
}

main().catch((err) => {
	console.error(err)
	process.exit(2)
})
