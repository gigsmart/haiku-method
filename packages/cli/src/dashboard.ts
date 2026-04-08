#!/usr/bin/env bun

import { existsSync } from "node:fs"
import { resolve } from "node:path"
import { parseArgs } from "node:util"
import { generateSite } from "./generator.js"

const { values } = parseArgs({
	options: {
		input: { type: "string", short: "i", default: ".haiku/" },
		output: { type: "string", short: "o", default: ".haiku/dashboard/" },
		title: { type: "string", short: "t", default: "H·AI·K·U Dashboard" },
		help: { type: "boolean", short: "h", default: false },
	},
	strict: true,
})

if (values.help) {
	console.log(`
haiku-dashboard - Generate a static HTML dashboard from .haiku/ data

Usage:
  haiku-dashboard [options]

Options:
  -i, --input <dir>    Input directory (default: .haiku/)
  -o, --output <dir>   Output directory (default: .haiku/dashboard/)
  -t, --title <title>  Dashboard title (default: "H·AI·K·U Dashboard")
  -h, --help           Show this help message
`)
	process.exit(0)
}

const inputDir = resolve(values.input ?? "")
const outputDir = resolve(values.output ?? "")
const title = values.title ?? "H·AI·K·U Dashboard"

if (!existsSync(inputDir)) {
	console.error(`Error: Input directory not found: ${inputDir}`)
	process.exit(1)
}

console.log("Generating dashboard...")
console.log(`  Input:  ${inputDir}`)
console.log(`  Output: ${outputDir}`)

const start = performance.now()
const result = await generateSite(inputDir, outputDir, title)
const elapsed = ((performance.now() - start) / 1000).toFixed(2)

console.log(`\nDone in ${elapsed}s`)
console.log(`  ${result.totalIntents} intent(s)`)
console.log(`  ${result.totalUnits} unit(s)`)
console.log(`  ${result.totalPages} page(s) generated`)
console.log(`\nOpen ${outputDir}/index.html in your browser to view.`)
