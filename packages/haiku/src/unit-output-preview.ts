// unit-output-preview.ts — Per-unit output preview computation for the
// review screen.
//
// The review UI's Units tab expands each unit row to show what the
// unit produced. For every path in the unit's `outputs:` frontmatter,
// we resolve it to disk, classify by extension, and stamp a tunnel
// URL so the SPA can render a hover popover and a click-out link
// without doing per-file fetches.
//
// Markdown bodies inline (frontmatter stripped) for the popover
// preview. HTML inlines its raw text for a sandboxed iframe preview.
// Images stay as URL-only (the SPA renders the thumbnail). Binary /
// unknown-extension files surface as name + size.
//
// Path safety: declared output strings come from agent-authored
// frontmatter that an adversary could craft (`../../.env`,
// `/etc/passwd`, etc.). Each resolved absolute path is verified to
// stay inside the intent dir; anything that escapes is silently
// dropped — same guard used by `parseUnitOutputs` in `parser.ts`.

import { readFile, stat } from "node:fs/promises"
import { basename, relative, resolve } from "node:path"
import matter from "gray-matter"
import { intentRelativeOutputPath } from "./parser.js"
import { buildStageArtifactUrl } from "./stage-artifact-url.js"

/** Inline preview limits. Markdown bodies under this length get
 *  inlined for the hover popover; longer bodies are truncated. The
 *  popover is meant for a glance, not a full read — the click-out link
 *  is the canonical way to inspect the full file. */
const MARKDOWN_PREVIEW_MAX_CHARS = 2000
const HTML_PREVIEW_MAX_CHARS = 2000

const IMAGE_EXTS: ReadonlySet<string> = new Set([
	".png",
	".jpg",
	".jpeg",
	".svg",
	".webp",
	".gif",
	".avif",
])
const HTML_EXTS: ReadonlySet<string> = new Set([".html", ".htm"])

export type UnitOutputPreviewType = "markdown" | "html" | "image" | "file"

export interface UnitOutputPreview {
	/** Intent-relative path declared by the unit (after workspace-prefix strip). */
	path: string
	/** Display name — basename without extension. */
	name: string
	/** Classified type. */
	type: UnitOutputPreviewType
	/** Full URL the SPA navigates to on click. Already includes the
	 *  `/stage-artifacts/:sessionId/*` route prefix; the SPA still adds
	 *  the auth `?t=` query via `withAuthQuery`. */
	url: string
	/** Inline preview body for the hover popover. Set for `markdown`
	 *  (the raw markdown body, frontmatter stripped — caller renders
	 *  via `markdownToSimpleHtml` / DOMPurify) and `html` (the raw
	 *  HTML source, truncated — caller renders via a sandboxed
	 *  iframe). Absent for `image` and `file` types — the SPA renders
	 *  thumbnail / icon from `url` and metadata.
	 *
	 *  Named `previewBody` (not `previewHtml`) because the contents are
	 *  the source body, not pre-sanitized HTML. A future caller who
	 *  injected this verbatim with `dangerouslySetInnerHTML` would
	 *  silently XSS. The current call sites both go through a sanitizer
	 *  / sandbox before rendering. */
	previewBody?: string
	/** Byte size on disk. Surfaced as a hint for binary previews. */
	sizeBytes?: number
	/** False when the declared path didn't resolve to a file on disk —
	 *  the entry still surfaces so the reviewer sees the unit declared
	 *  it, but the click-out 404s and the popover shows a "missing"
	 *  marker. */
	exists: boolean
}

/**
 * Build per-unit output previews for one unit. Returns an empty
 * array when the unit has no `outputs:` frontmatter.
 *
 * Path-safety: drops any declared path that escapes `intentDir`.
 */
export async function buildUnitOutputPreviews(
	intentDir: string,
	sessionId: string,
	declaredOutputs: readonly string[] | undefined,
): Promise<UnitOutputPreview[]> {
	if (!declaredOutputs || declaredOutputs.length === 0) return []
	const intentDirAbs = resolve(intentDir)
	const intentDirAbsSlash = `${intentDirAbs}/`

	const out: UnitOutputPreview[] = []
	for (const declared of declaredOutputs) {
		if (typeof declared !== "string") continue
		const intentRel = intentRelativeOutputPath(declared, intentDir)
		const absPath = resolve(intentDirAbs, intentRel)
		if (absPath !== intentDirAbs && !absPath.startsWith(intentDirAbsSlash)) {
			continue
		}
		const safeRel = relative(intentDirAbs, absPath)
		const file = basename(safeRel)
		const lastDot = file.lastIndexOf(".")
		const ext = lastDot >= 0 ? file.substring(lastDot).toLowerCase() : ""
		const name = file.replace(/\.[^.]+$/, "") || file
		const url = buildStageArtifactUrl(sessionId, safeRel)

		let exists = true
		let sizeBytes: number | undefined
		try {
			const st = await stat(absPath)
			sizeBytes = st.size
			if (!st.isFile()) {
				exists = false
			}
		} catch {
			exists = false
		}

		const base: Omit<UnitOutputPreview, "type"> = {
			path: safeRel,
			name,
			url,
			exists,
			...(sizeBytes !== undefined ? { sizeBytes } : {}),
		}

		if (ext === ".md") {
			let previewBody: string | undefined
			if (exists) {
				try {
					const raw = await readFile(absPath, "utf-8")
					const { content } = matter(raw)
					previewBody = truncate(content, MARKDOWN_PREVIEW_MAX_CHARS)
				} catch {
					// Unreadable — fall through to no preview body.
				}
			}
			out.push({
				...base,
				type: "markdown",
				...(previewBody !== undefined ? { previewBody } : {}),
			})
			continue
		}
		if (HTML_EXTS.has(ext)) {
			let previewBody: string | undefined
			if (exists) {
				try {
					const raw = await readFile(absPath, "utf-8")
					previewBody = truncate(raw, HTML_PREVIEW_MAX_CHARS)
				} catch {
					// Unreadable — fall through to no preview body.
				}
			}
			out.push({
				...base,
				type: "html",
				...(previewBody !== undefined ? { previewBody } : {}),
			})
			continue
		}
		if (IMAGE_EXTS.has(ext)) {
			out.push({ ...base, type: "image" })
			continue
		}
		out.push({ ...base, type: "file" })
	}
	return out
}

function truncate(body: string, maxChars: number): string {
	const trimmed = body.trim()
	if (trimmed.length <= maxChars) return trimmed
	return `${trimmed.slice(0, maxChars).trimEnd()}\n\n…`
}
