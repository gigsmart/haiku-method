#!/usr/bin/env npx tsx
// Test suite for scope validation primitives: matchesGlob, and by
// extension the stage-scope semantics layered on top (cross-unit
// protection, repo vs intent scope, etc.).
//
// Run: npx tsx test/scope-validation.test.mjs

import assert from "node:assert"
import { matchesGlob } from "../src/state-tools.ts"

let passed = 0
let failed = 0

function test(name, fn) {
  try {
    fn()
    passed++
    console.log(`  \u2713 ${name}`)
  } catch (e) {
    failed++
    console.log(`  \u2717 ${name}: ${e.message}`)
  }
}

console.log("=== matchesGlob: exact paths ===")

test("exact file match", () => {
  assert.ok(matchesGlob("stages/design/artifacts/foo.html", "stages/design/artifacts/foo.html"))
})

test("exact file non-match", () => {
  assert.ok(!matchesGlob("stages/design/artifacts/bar.html", "stages/design/artifacts/foo.html"))
})

test("leading ./ normalized", () => {
  assert.ok(matchesGlob("./stages/design/foo.md", "stages/design/foo.md"))
  assert.ok(matchesGlob("stages/design/foo.md", "./stages/design/foo.md"))
})

console.log("\n=== matchesGlob: directory prefixes ===")

test("trailing / matches files under", () => {
  assert.ok(matchesGlob("stages/design/artifacts/foo.html", "stages/design/artifacts/"))
})

test("bare dir matches files under", () => {
  assert.ok(matchesGlob("stages/design/artifacts/foo.html", "stages/design/artifacts"))
})

test("dir prefix does NOT match sibling", () => {
  assert.ok(!matchesGlob("stages/design/units/foo.md", "stages/design/artifacts"))
})

console.log("\n=== matchesGlob: double-star ===")

test("trailing /** matches immediate children", () => {
  assert.ok(matchesGlob("stages/design/artifacts/foo.html", "stages/design/artifacts/**"))
})

test("trailing /** matches nested descendants", () => {
  assert.ok(matchesGlob("stages/design/artifacts/a/b/foo.html", "stages/design/artifacts/**"))
})

test("trailing /** matches the bare dir too", () => {
  assert.ok(matchesGlob("stages/design/artifacts", "stages/design/artifacts/**"))
})

test("MID-STRING /**/  (regression: NUL placeholder must survive)", () => {
  // This was broken: `.*` from `**` was re-scanned by the `[^/]*` pass
  // turning into `.[^/]*`, which fails to match cross-directory.
  assert.ok(matchesGlob("packages/foo/src/bar.ts", "packages/**/src/*.ts"))
  assert.ok(matchesGlob("packages/a/b/c/src/bar.ts", "packages/**/src/*.ts"))
  assert.ok(!matchesGlob("packages/foo/lib/bar.ts", "packages/**/src/*.ts"))
})

console.log("\n=== matchesGlob: single-star ===")

test("/*.ext matches filenames", () => {
  assert.ok(matchesGlob("stages/design/artifacts/foo.html", "stages/design/artifacts/*.html"))
})

test("/*.ext does NOT cross directories", () => {
  assert.ok(!matchesGlob("stages/design/artifacts/sub/foo.html", "stages/design/artifacts/*.html"))
})

test("/* matches any filename, not nested paths", () => {
  assert.ok(matchesGlob("a/b/foo.txt", "a/b/*"))
  assert.ok(!matchesGlob("a/b/c/foo.txt", "a/b/*"))
})

console.log("\n=== matchesGlob: regex escape safety ===")

test("dots in path are treated as literal, not regex", () => {
  // `foo.html` should NOT match `fooXhtml` via regex dot.
  assert.ok(matchesGlob("foo.html", "foo.html"))
  assert.ok(!matchesGlob("fooXhtml", "foo.html"))
})

test("parens/brackets in paths are escaped", () => {
  assert.ok(matchesGlob("(project)/src", "(project)/src"))
  assert.ok(matchesGlob("foo[1]/bar", "foo[1]/bar"))
})

console.log("\n=== cross-unit protection intent ===")

// The stage scope deliberately whitelists `stages/{stage}/units/{unitBase}.md`
// and NOT the wildcard `stages/{stage}/units/**`. Ensure a cross-unit path
// does not match a single-unit whitelist.

test("unit-04.md whitelist does not match unit-05.md", () => {
  assert.ok(matchesGlob("stages/design/units/unit-04.md", "stages/design/units/unit-04.md"))
  assert.ok(!matchesGlob("stages/design/units/unit-05.md", "stages/design/units/unit-04.md"))
})

test("unit-04 whitelist does not accidentally match via prefix", () => {
  // Regression guard: a naive prefix check would allow `unit-04.md.bak` or
  // `unit-040.md`. Exact match must be exact.
  assert.ok(!matchesGlob("stages/design/units/unit-04.md.bak", "stages/design/units/unit-04.md"))
  assert.ok(!matchesGlob("stages/design/units/unit-040.md", "stages/design/units/unit-04.md"))
})

// ── Summary ────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed\n`)
process.exit(failed > 0 ? 1 : 0)
