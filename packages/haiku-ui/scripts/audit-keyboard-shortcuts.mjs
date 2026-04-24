#!/usr/bin/env node
import fs from "node:fs"
/**
 * audit-keyboard-shortcuts.mjs — reconciles the canonical HTML map at
 * `.haiku/intents/.../stages/design/artifacts/keyboard-shortcut-map.html` with
 * `packages/haiku-ui/src/a11y/keyboard.ts KEYBOARD_SHORTCUT_REGISTRY`.
 *
 * Rules:
 *   - Every `aria-keyshortcuts="<chord>"` binding in the HTML must have a
 *     matching registry entry keyed on the chord (`aria` field).
 *   - Every `KEYBOARD_SHORTCUT_REGISTRY[i].aria` must appear as an
 *     `aria-keyshortcuts=` attribute somewhere in the HTML.
 *   - The HTML's `…` placeholder chord is a documentation stand-in for
 *     the "any key in input" exception — ignored by the audit.
 *
 * Exit codes:
 *   0 — HTML and registry are in parity
 *   1 — orphan HTML row OR orphan registry entry
 *   2 — filesystem error / registry parse error
 */
import { readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const PACKAGE_DIR = path.resolve(SCRIPT_DIR, "..")
const REPO_ROOT = path.resolve(PACKAGE_DIR, "../..")
const REGISTRY_TS = path.join(PACKAGE_DIR, "src", "a11y", "keyboard.ts")
const REPORTS_DIR = path.join(PACKAGE_DIR, "reports")

// Resolve the HTML via glob-walk inside the intent directory so the audit
// works regardless of which intent slug is current. Stage-wide audit runs
// against the active intent's copy of the artifact.
async function findShortcutMap() {
	const haikuDir = path.join(REPO_ROOT, ".haiku", "intents")
	if (!fs.existsSync(haikuDir)) return null
	const slugs = fs
		.readdirSync(haikuDir, { withFileTypes: true })
		.filter((d) => d.isDirectory())
		.map((d) => d.name)
	for (const slug of slugs) {
		const candidate = path.join(
			haikuDir,
			slug,
			"stages",
			"design",
			"artifacts",
			"keyboard-shortcut-map.html",
		)
		if (fs.existsSync(candidate)) return candidate
	}
	return null
}

async function main() {
	const htmlPath = await findShortcutMap()
	if (!htmlPath) {
		console.error(
			"audit-keyboard-shortcuts · keyboard-shortcut-map.html not found under .haiku/intents/*/stages/design/artifacts/. Skip.",
		)
		process.exit(0)
	}
	const html = await readFile(htmlPath, "utf8")
	const ts = await readFile(REGISTRY_TS, "utf8")

	// Extract every unique `aria-keyshortcuts="..."` attribute value from the
	// HTML map. Ignore the `…` placeholder row.
	const htmlChords = new Set()
	for (const m of html.matchAll(/aria-keyshortcuts="([^"]+)"/g)) {
		const chord = m[1]
		if (chord === "…") continue
		htmlChords.add(chord)
	}

	// Registry-only allowlist: chords documented in the registry for
	// completeness but deliberately omitted from the HTML map because they
	// are native browser behavior (no app handler intercepts them outside
	// focus traps). The registry comment on each entry explains the
	// rationale; the audit records the chord here to avoid a false-positive
	// orphan-registry failure.
	const REGISTRY_ONLY_ALLOWLIST = new Set(["Tab"])

	// Extract every `aria:` field from the registry. The registry file is
	// hand-authored and contains one `aria: "<chord>",` per entry.
	const registryChords = new Set()
	for (const m of ts.matchAll(/aria:\s*"([^"]+)"/g)) {
		registryChords.add(m[1])
	}

	const orphanHtml = [...htmlChords].filter((c) => !registryChords.has(c))
	const orphanRegistry = [...registryChords].filter(
		(c) => !htmlChords.has(c) && !REGISTRY_ONLY_ALLOWLIST.has(c),
	)

	await fs.promises.mkdir(REPORTS_DIR, { recursive: true })
	await fs.promises.writeFile(
		path.join(REPORTS_DIR, "keyboard-shortcuts.json"),
		`${JSON.stringify(
			{
				htmlChords: [...htmlChords],
				registryChords: [...registryChords],
				orphanHtml,
				orphanRegistry,
			},
			null,
			2,
		)}\n`,
	)

	console.log(
		`audit-keyboard-shortcuts · ${htmlChords.size} HTML chords · ${registryChords.size} registry chords · ${orphanHtml.length} orphan-HTML · ${orphanRegistry.length} orphan-registry`,
	)
	console.log(
		`  report: ${path.relative(process.cwd(), path.join(REPORTS_DIR, "keyboard-shortcuts.json"))}`,
	)

	if (orphanHtml.length + orphanRegistry.length > 0) {
		for (const c of orphanHtml) {
			console.error(
				`  FAIL orphan HTML row "${c}" — present in keyboard-shortcut-map.html but missing from KEYBOARD_SHORTCUT_REGISTRY`,
			)
		}
		for (const c of orphanRegistry) {
			console.error(
				`  FAIL orphan registry entry "${c}" — present in KEYBOARD_SHORTCUT_REGISTRY but missing from keyboard-shortcut-map.html`,
			)
		}
		process.exit(1)
	}
	process.exit(0)
}

main().catch((err) => {
	console.error(err)
	process.exit(2)
})
