#!/usr/bin/env node
// Run all H·AI·K·U MCP test suites
// Usage: node test/run-all.mjs

import { execSync } from "node:child_process"
import { readdirSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const testDir = dirname(fileURLToPath(import.meta.url))
// Exclude state-tools.test.mjs — it tests the haiku-parse CLI binary
// and requires a build step first (npm run build). Run it separately
// with: npm run test:parse
const testFiles = readdirSync(testDir)
  .filter(f => f.endsWith(".test.mjs") && f !== "state-tools.test.mjs")
  .sort()

let totalPassed = 0
let totalFailed = 0
const results = []

for (const file of testFiles) {
  const filePath = join(testDir, file)
  console.log(`\n${"═".repeat(60)}`)
  console.log(`  Running: ${file}`)
  console.log(`${"═".repeat(60)}`)

  try {
    const output = execSync(`npx tsx "${filePath}"`, {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
      cwd: join(testDir, ".."),
      timeout: 60000,
    })
    process.stdout.write(output)

    // Parse pass/fail from output
    const match = output.match(/(\d+) passed, (\d+) failed/)
    if (match) {
      const p = parseInt(match[1], 10)
      const f = parseInt(match[2], 10)
      totalPassed += p
      totalFailed += f
      results.push({ file, passed: p, failed: f, status: f > 0 ? "FAIL" : "PASS" })
    } else {
      results.push({ file, passed: 0, failed: 0, status: "PASS" })
    }
  } catch (e) {
    // Print stdout and stderr from the failing test
    if (e.stdout) process.stdout.write(e.stdout)
    if (e.stderr) process.stderr.write(e.stderr)
    totalFailed++
    results.push({ file, passed: 0, failed: 1, status: "CRASH" })
  }
}

// ── Summary ────────────────────────────────────────────────────────────────

console.log(`\n${"═".repeat(60)}`)
console.log("  SUMMARY")
console.log(`${"═".repeat(60)}`)
console.log("")

const maxLen = Math.max(...results.map(r => r.file.length))
for (const r of results) {
  const icon = r.status === "PASS" ? "✓" : r.status === "CRASH" ? "💥" : "✗"
  console.log(`  ${icon} ${r.file.padEnd(maxLen + 2)} ${r.passed} passed, ${r.failed} failed`)
}

console.log("")
console.log(`  Total: ${totalPassed} passed, ${totalFailed} failed across ${testFiles.length} test files`)
console.log("")

process.exit(totalFailed > 0 ? 1 : 0)
