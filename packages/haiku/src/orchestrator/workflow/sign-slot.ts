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

/** sha256 of the entire file contents (binary-safe). Used for output
 *  witnesses (PNGs, JSON, etc — files without frontmatter). */
export function fileSha256(absolutePath: string): string {
	if (!existsSync(absolutePath)) return ""
	const buf = readFileSync(absolutePath)
	return createHash("sha256").update(buf).digest("hex")
}

/** Build the witnesses map for an approvals slot: { <relPath>: <sha256> }
 *  for every declared output that exists on disk at sign time. Outputs
 *  the unit declares but doesn't produce yet are simply omitted from
 *  the map (the sweep will treat their later appearance as drift on
 *  the unit owner's part — by then the slot should be re-signed). */
export function buildOutputWitnesses(
	intentDir: string,
	outputs: string[],
): Record<string, string> {
	const map: Record<string, string> = {}
	for (const out of outputs) {
		const abs = join(intentDir, out)
		const sha = fileSha256(abs)
		if (sha) map[out] = sha
	}
	return map
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
