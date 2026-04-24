#!/usr/bin/env node
/**
 * Compare two bundled HTML files for byte-identical semantic equivalence
 * after stripping lines that naturally change across builds (build
 * timestamps, mtimes, sourcemap hashes, vite internal markers).
 *
 * Usage:
 *   node scripts/compare-bundle.mjs <left.html> <right.html>
 *
 * Exit code:
 *   0 — after stripping volatile lines the files match
 *   1 — they differ; prints up to 20 lines of the first divergence
 *
 * Intended for the unit-03 completion gate: compare the pre-move baseline
 * (stages/development/artifacts/bundle-baseline.html) against the post-move
 * build (packages/haiku-ui/dist/index.html) to prove there is no visual
 * regression.
 */
import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"

const VOLATILE_LINE = /build-timestamp|mtime|sourcemap hash|__vite_\w+/

function stripVolatile(text) {
	return text
		.split("\n")
		.filter((line) => !VOLATILE_LINE.test(line))
		.join("\n")
}

function usage() {
	console.error("usage: compare-bundle.mjs <left.html> <right.html>")
	process.exit(2)
}

const [, , leftPath, rightPath] = process.argv
if (!leftPath || !rightPath) usage()

const leftAbs = resolve(leftPath)
const rightAbs = resolve(rightPath)

if (!existsSync(leftAbs)) {
	console.error(`ERROR: ${leftAbs} does not exist`)
	process.exit(2)
}
if (!existsSync(rightAbs)) {
	console.error(`ERROR: ${rightAbs} does not exist`)
	process.exit(2)
}

const left = stripVolatile(readFileSync(leftAbs, "utf-8"))
const right = stripVolatile(readFileSync(rightAbs, "utf-8"))

if (left === right) {
	console.error(
		`MATCH: ${leftPath} == ${rightPath} (after stripping volatile lines)`,
	)
	process.exit(0)
}

// Find the first diverging line and print up to 20 lines of context.
const leftLines = left.split("\n")
const rightLines = right.split("\n")
const maxLen = Math.max(leftLines.length, rightLines.length)
let firstDiff = -1
for (let i = 0; i < maxLen; i++) {
	if (leftLines[i] !== rightLines[i]) {
		firstDiff = i
		break
	}
}

console.error(
	`DIFF: ${leftPath} != ${rightPath} (${leftLines.length} vs ${rightLines.length} lines, first diff at line ${firstDiff + 1})`,
)
const start = Math.max(0, firstDiff - 2)
const end = Math.min(maxLen, firstDiff + 20)
for (let i = start; i < end; i++) {
	const marker = i === firstDiff ? ">" : " "
	console.error(`${marker} ${i + 1}L ${leftLines[i] ?? "<missing>"}`)
	console.error(`${marker} ${i + 1}R ${rightLines[i] ?? "<missing>"}`)
}
process.exit(1)
