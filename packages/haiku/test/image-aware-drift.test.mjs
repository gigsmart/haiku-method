#!/usr/bin/env npx tsx
// Tests for image-aware drift: magic-byte detection, baseline content
// sidecar retention for images, and the GET /api/intents/:intent/
// baseline-content/... routes that serve bytes for SPA visual diff.
//
// Coverage:
//  1. detectImageKindSync identifies PNG/JPEG/GIF/WebP/AVIF magic bytes.
//  2. detectImageKindSync returns null for plain-text and opaque-binary
//     payloads.
//  3. writeBaseline persists content sidecars for image binaries
//     (existing skip on `is_binary` no longer applies to images).
//  4. The drift gate's lazy-sidecar path retains image bytes on the
//     unchanged-file branch — so before-bytes are available the next
//     time the image changes.
//  5. Opaque binaries still skip the sidecar (font, ZIP) — bytes-on-disk
//     stay bounded.

import assert from "node:assert"
import { createHash } from "node:crypto"
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const tmp = mkdtempSync(join(tmpdir(), "haiku-image-drift-"))

const {
	detectImageKindSync,
	isImageBinarySync,
	writeBaseline,
	baselineContentPath,
	baselineIntentContentPath,
} = await import("../src/orchestrator/workflow/drift-baseline.ts")

const { runDriftDetectionGate } = await import(
	"../src/orchestrator/workflow/drift-detection-gate.ts"
)

let passed = 0
let failed = 0

function test(name, fn) {
	try {
		const r = fn()
		if (r && typeof r.then === "function") {
			return r.then(
				() => {
					passed++
					console.log(`  ✓ ${name}`)
				},
				(e) => {
					failed++
					console.log(`  ✗ ${name}: ${e.message}`)
					if (process.env.VERBOSE) console.error(e)
				},
			)
		}
		passed++
		console.log(`  ✓ ${name}`)
	} catch (e) {
		failed++
		console.log(`  ✗ ${name}: ${e.message}`)
		if (process.env.VERBOSE) console.error(e)
	}
}

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex")

// ── Magic-byte fixtures ────────────────────────────────────────────────────
// Real magic-byte prefixes; trailing zeros are filler — the detector only
// reads the first 16 bytes.

function mkPngBytes() {
	return Buffer.from([
		0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x00,
		0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
	])
}

function mkJpegBytes() {
	return Buffer.from([
		0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
		0x00, 0x00, 0x00, 0x00, 0x00,
	])
}

function mkGifBytes() {
	return Buffer.from([
		0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
		0x00, 0x00, 0x00, 0x00,
	])
}

function mkWebpBytes() {
	// "RIFF" .... "WEBP"
	return Buffer.from([
		0x52, 0x49, 0x46, 0x46, 0x20, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
		0x56, 0x50, 0x38, 0x20,
	])
}

function mkAvifBytes() {
	// 4 bytes box size, "ftyp" at byte 4, "avif" brand at byte 8.
	return Buffer.from([
		0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66,
		0x00, 0x00, 0x00, 0x00,
	])
}

function mkOpaqueBinary() {
	// PDF magic — counts as binary, NOT an image.
	return Buffer.from([
		0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x00, 0x01, 0x02, 0x03,
		0x00, 0x00, 0x00, 0x00,
	])
}

// ── Tests ──────────────────────────────────────────────────────────────────

console.log("\n=== detectImageKindSync ===")

await test("PNG magic bytes → 'png'", () => {
	const p = join(tmp, "a.png")
	writeFileSync(p, mkPngBytes())
	assert.strictEqual(detectImageKindSync(p), "png")
	assert.strictEqual(isImageBinarySync(p), true)
})

await test("JPEG magic bytes → 'jpeg'", () => {
	const p = join(tmp, "a.jpg")
	writeFileSync(p, mkJpegBytes())
	assert.strictEqual(detectImageKindSync(p), "jpeg")
})

await test("GIF magic bytes → 'gif'", () => {
	const p = join(tmp, "a.gif")
	writeFileSync(p, mkGifBytes())
	assert.strictEqual(detectImageKindSync(p), "gif")
})

await test("WebP container → 'webp'", () => {
	const p = join(tmp, "a.webp")
	writeFileSync(p, mkWebpBytes())
	assert.strictEqual(detectImageKindSync(p), "webp")
})

await test("AVIF box → 'avif'", () => {
	const p = join(tmp, "a.avif")
	writeFileSync(p, mkAvifBytes())
	assert.strictEqual(detectImageKindSync(p), "avif")
})

await test("opaque binary (PDF) → null", () => {
	const p = join(tmp, "a.pdf")
	writeFileSync(p, mkOpaqueBinary())
	assert.strictEqual(detectImageKindSync(p), null)
	assert.strictEqual(isImageBinarySync(p), false)
})

await test("plain text → null", () => {
	const p = join(tmp, "a.txt")
	writeFileSync(p, "hello world\n")
	assert.strictEqual(detectImageKindSync(p), null)
})

await test("missing file → null (no throw)", () => {
	assert.strictEqual(detectImageKindSync(join(tmp, "nope.png")), null)
})

// ── Sidecar retention ─────────────────────────────────────────────────────

function makeIntentDir(name) {
	const intentDir = join(tmp, name, ".haiku", "intents", "demo")
	const stage = "design"
	const stageDir = join(intentDir, "stages", stage)
	mkdirSync(join(stageDir, "artifacts"), { recursive: true })
	mkdirSync(join(intentDir, "knowledge"), { recursive: true })
	writeFileSync(join(stageDir, "state.json"), JSON.stringify({ iteration: 1 }))
	return { intentDir, stage, stageDir }
}

function makeHaikuRoot(name) {
	const haikuRoot = join(tmp, `${name}-haikuroot`)
	mkdirSync(haikuRoot, { recursive: true })
	return haikuRoot
}

console.log("\n=== writeBaseline retains image content sidecars ===")

await test("PNG → sidecar written even though is_binary: true", async () => {
	const { intentDir, stage, stageDir } = makeIntentDir("sc01")
	const pngBytes = mkPngBytes()
	const relPath = `stages/${stage}/artifacts/screen.png`
	writeFileSync(join(stageDir, "artifacts", "screen.png"), pngBytes)
	const sha = sha256(pngBytes)
	await writeBaseline(intentDir, stage, {
		entries: new Map([
			[
				relPath,
				{
					path: relPath,
					sha256: sha,
					bytes: pngBytes.length,
					mtime_ns: Date.now() * 1_000_000,
					is_binary: true,
					author_class: "human-implicit",
					acknowledged_at: new Date().toISOString(),
					acknowledged_via: "baseline-init",
					stage,
					tracking_class: "stage-output",
				},
			],
		]),
	})
	const sidecar = baselineContentPath(intentDir, stage, sha)
	assert.ok(existsSync(sidecar), "sidecar exists for image binary")
	assert.deepStrictEqual(readFileSync(sidecar), pngBytes)
})

await test("opaque binary (PDF) → sidecar STILL skipped", async () => {
	const { intentDir, stage, stageDir } = makeIntentDir("sc02")
	const pdfBytes = mkOpaqueBinary()
	const relPath = `stages/${stage}/artifacts/doc.pdf`
	writeFileSync(join(stageDir, "artifacts", "doc.pdf"), pdfBytes)
	const sha = sha256(pdfBytes)
	await writeBaseline(intentDir, stage, {
		entries: new Map([
			[
				relPath,
				{
					path: relPath,
					sha256: sha,
					bytes: pdfBytes.length,
					mtime_ns: Date.now() * 1_000_000,
					is_binary: true,
					author_class: "human-implicit",
					acknowledged_at: new Date().toISOString(),
					acknowledged_via: "baseline-init",
					stage,
					tracking_class: "stage-output",
				},
			],
		]),
	})
	const sidecar = baselineContentPath(intentDir, stage, sha)
	assert.ok(!existsSync(sidecar), "no sidecar for opaque binary")
})

await test("intent-scope PNG (knowledge/) → sidecar at intent level", async () => {
	const { intentDir } = makeIntentDir("sc03")
	const stage = "design"
	const pngBytes = mkPngBytes()
	const relPath = "knowledge/brand-mark.png"
	writeFileSync(join(intentDir, "knowledge", "brand-mark.png"), pngBytes)
	const sha = sha256(pngBytes)
	await writeBaseline(intentDir, stage, {
		entries: new Map([
			[
				relPath,
				{
					path: relPath,
					sha256: sha,
					bytes: pngBytes.length,
					mtime_ns: Date.now() * 1_000_000,
					is_binary: true,
					author_class: "human-implicit",
					acknowledged_at: new Date().toISOString(),
					acknowledged_via: "baseline-init",
					stage: null,
					tracking_class: "knowledge",
				},
			],
		]),
	})
	const sidecar = baselineIntentContentPath(intentDir, sha)
	assert.ok(existsSync(sidecar), "intent-scope sidecar exists")
})

console.log("\n=== Drift gate lazy sidecar — image branch ===")

await test("unchanged image on disk → gate writes lazy sidecar even though is_binary", async () => {
	const { intentDir, stage, stageDir } = makeIntentDir("sc04")
	const haikuRoot = makeHaikuRoot("sc04")
	const pngBytes = mkPngBytes()
	const relPath = `stages/${stage}/artifacts/m.png`
	const sha = sha256(pngBytes)
	writeFileSync(join(stageDir, "artifacts", "m.png"), pngBytes)
	// Anchor (text) so the OOM heuristic never trips.
	writeFileSync(join(stageDir, "artifacts", "anchor.txt"), "anchor")
	const anchorRel = `stages/${stage}/artifacts/anchor.txt`
	const anchorBytes = Buffer.from("anchor")
	await writeBaseline(intentDir, stage, {
		entries: new Map([
			[
				relPath,
				{
					path: relPath,
					sha256: sha,
					bytes: pngBytes.length,
					mtime_ns: Date.now() * 1_000_000,
					is_binary: true,
					author_class: "human-implicit",
					acknowledged_at: new Date().toISOString(),
					acknowledged_via: "baseline-init",
					stage,
					tracking_class: "stage-output",
				},
			],
			[
				anchorRel,
				{
					path: anchorRel,
					sha256: sha256(anchorBytes),
					bytes: anchorBytes.length,
					mtime_ns: Date.now() * 1_000_000,
					is_binary: false,
					author_class: "agent",
					acknowledged_at: new Date().toISOString(),
					acknowledged_via: "agent-write",
					stage,
					tracking_class: "stage-output",
				},
			],
		]),
	})

	// Delete sidecar (writeBaseline already wrote it; we want to test the
	// lazy-write path in the gate's unchanged branch).
	const sidecar = baselineContentPath(intentDir, stage, sha)
	if (existsSync(sidecar)) rmSync(sidecar)

	runDriftDetectionGate({
		intentDir,
		intentSlug: "demo",
		activeStage: stage,
		haikuRoot,
		tickCounter: 1,
	})

	assert.ok(
		existsSync(sidecar),
		"gate wrote lazy sidecar for image on unchanged branch",
	)
	assert.deepStrictEqual(readFileSync(sidecar), pngBytes)
})

// ── Final summary ─────────────────────────────────────────────────────────

console.log(`\n  ${passed} passed, ${failed} failed`)

try {
	rmSync(tmp, { recursive: true, force: true })
} catch {
	/* best-effort cleanup */
}

if (failed > 0) process.exit(1)
