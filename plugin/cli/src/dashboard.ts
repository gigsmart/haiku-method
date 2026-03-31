#!/usr/bin/env bun

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { generateSite } from "./generator.js";

const { values } = parseArgs({
  options: {
    input: { type: "string", short: "i", default: ".ai-dlc/" },
    output: { type: "string", short: "o", default: ".ai-dlc/dashboard/" },
    title: { type: "string", short: "t", default: "AI-DLC Dashboard" },
    help: { type: "boolean", short: "h", default: false },
  },
  strict: true,
});

if (values.help) {
  console.log(`
ai-dlc-dashboard - Generate a static HTML dashboard from .ai-dlc/ data

Usage:
  ai-dlc-dashboard [options]

Options:
  -i, --input <dir>    Input directory (default: .ai-dlc/)
  -o, --output <dir>   Output directory (default: .ai-dlc/dashboard/)
  -t, --title <title>  Dashboard title (default: "AI-DLC Dashboard")
  -h, --help           Show this help message
`);
  process.exit(0);
}

const inputDir = resolve(values.input!);
const outputDir = resolve(values.output!);
const title = values.title!;

if (!existsSync(inputDir)) {
  console.error(`Error: Input directory not found: ${inputDir}`);
  process.exit(1);
}

console.log(`Generating dashboard...`);
console.log(`  Input:  ${inputDir}`);
console.log(`  Output: ${outputDir}`);

const start = performance.now();
const result = await generateSite(inputDir, outputDir, title);
const elapsed = ((performance.now() - start) / 1000).toFixed(2);

console.log(`\nDone in ${elapsed}s`);
console.log(`  ${result.totalIntents} intent(s)`);
console.log(`  ${result.totalUnits} unit(s)`);
console.log(`  ${result.totalPages} page(s) generated`);
console.log(`\nOpen ${outputDir}/index.html in your browser to view.`);
