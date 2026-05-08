// orchestrator/workflow/sign-slot.ts — Sign-time witness stamping.
//
// When a review/approval/discovery role signs a unit (or intent.md),
// we stamp not just `at: <ISO>` but also a content hash of the
// witnessed body. The drift sweep later compares "what's there now"
// against "what was signed" — a pure sha256 compare, no git
// dependency.
//
// Why hash the BODY (not the whole file)? The unit's frontmatter is
// workflow-managed: every hat advance, every iteration append, every
// review/approval stamp mutates the fm. If we hashed the whole file,
// every engine FM mutation would trip drift on its own previously-
// signed reviews. By hashing just the post-frontmatter body, we
// decouple "what the human/agent wrote" from "what the workflow
// engine bookkeeps."
//
// For approvals (output drift), we witness declared output paths,
// not the unit body. Those files are agent-authored and
// frontmatter-free, so we hash the whole file. The witnesses map
// keys by relative path; values are sha256.

import { createHash } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import matter from "gray-matter"

/** sha256 of just the post-frontmatter body of a markdown file.
 *  Empty string when the file doesn't exist (rare edge case where the
 *  signing happens before the body is written; the sweep treats an
 *  empty hash as "no witness" and will not flag drift). */
export function bodySha256(absolutePath: string): string {
	if (!existsSync(absolutePath)) return ""
	const raw = readFileSync(absolutePath, "utf8")
	let body = raw
	try {
		const parsed = matter(raw)
		body = parsed.content
	} catch {
		// Malformed frontmatter — fall back to whole-file hash so we
		// still detect drift, just less precisely.
		body = raw
	}
	return createHash("sha256").update(body, "utf8").digest("hex")
}

/** sha256 of the entire file contents (binary-safe). Used internally
 *  for binary outputs; callers should prefer `outputSha256` which picks
 *  body-vs-binary hashing per file extension. */
export function fileSha256(absolutePath: string): string {
	if (!existsSync(absolutePath)) return ""
	const buf = readFileSync(absolutePath)
	return createHash("sha256").update(buf).digest("hex")
}

/** Extensions whose drift signal should ignore frontmatter — only the
 *  content body matters. Adding an extension here means the drift sweep
 *  treats engine FM mutations (stage rebinding, signed_at restamps, hat
 *  bumps, etc.) as no-op for that file type, only flagging real
 *  human / agent prose changes. */
const TEXT_BODY_EXTENSIONS: ReadonlySet<string> = new Set([
	".md",
	".markdown",
	".mdx",
	".txt",
	".rst",
	".adoc",
])

/** Pick the right sha strategy for a declared output:
 *    - markdown / text-with-FM extensions → body hash (strips FM)
 *    - everything else (images, PDFs, JSON, etc.) → full-file binary
 *      hash
 *
 *  Drift is about content drift, not state drift. The cursor tracks
 *  workflow state (FM mutations) independently of the witness; mixing
 *  them into the witness was the noise that scared reviewers in v3 +
 *  early v4 sessions. Stripping FM from text outputs aligns the
 *  witness with what humans actually changed. */
export function outputSha256(absolutePath: string): string {
	if (!existsSync(absolutePath)) return ""
	const ext = absolutePath.slice(absolutePath.lastIndexOf(".")).toLowerCase()
	if (TEXT_BODY_EXTENSIONS.has(ext)) {
		return bodySha256(absolutePath)
	}
	return fileSha256(absolutePath)
}

/** Build the witnesses map for an approvals slot: { <relPath>: <sha256> }
 *  for every declared output that exists on disk at sign time. Outputs
 *  the unit declares but doesn't produce yet are simply omitted from
 *  the map (the sweep will treat their later appearance as drift on
 *  the unit owner's part — by then the slot should be re-signed).
 *
 *  Uses `outputSha256` so markdown / text outputs are body-hashed (FM
 *  stripped) and binary outputs get full-file hashes. The drift sweep
 *  uses the same picker, so sign-time and check-time hashes line up
 *  per-file regardless of whether the engine has touched the FM since.
 */
export function buildOutputWitnesses(
	intentDir: string,
	outputs: string[],
	repoRoot?: string,
): Record<string, string> {
	const map: Record<string, string> = {}
	// Output paths come in two shapes (mirrors drift-sweep.ts):
	//   - `stages/...` → intent-relative, joined against intentDir
	//   - everything else → repo-relative, joined against repoRoot
	// Falling back to intentDir for repo-relative paths produces a
	// witness for `<intentDir>/src/components/Button.tsx` (which never
	// exists). At drift-check time the file-not-found path silently
	// skips, so the most important artifact (real code) loses its
	// drift signal entirely.
	const root = repoRoot ?? deriveRepoRootFromIntentDir(intentDir)
	for (const out of outputs) {
		const abs = out.startsWith("stages/")
			? join(intentDir, out)
			: join(root, out)
		const sha = outputSha256(abs)
		if (sha) map[out] = sha
	}
	return map
}

/** Derive repo root from a given intent dir path. The on-disk layout is
 *  `<repoRoot>/.haiku/intents/<slug>/`, so peel off three segments. */
function deriveRepoRootFromIntentDir(intentDir: string): string {
	// `dirname` walks up: <slug> → intents → .haiku → <repoRoot>
	return join(intentDir, "..", "..", "..")
}

/** Build a signed-review record: stamps the unit-body hash so any
 *  later body change trips drift. */
export function buildReviewRecord(unitPath: string): {
	at: string
	body_sha256: string
} {
	return {
		at: new Date().toISOString(),
		body_sha256: bodySha256(unitPath),
	}
}

/** Build a signed-approval record: stamps a witnesses map so any later
 *  edit to a declared output trips drift. */
export function buildApprovalRecord(
	intentDir: string,
	outputs: string[],
): {
	at: string
	witnesses: Record<string, string>
} {
	return {
		at: new Date().toISOString(),
		witnesses: buildOutputWitnesses(intentDir, outputs),
	}
}
