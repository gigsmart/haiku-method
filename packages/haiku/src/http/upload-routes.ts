// http/upload-routes.ts — SPA file-upload HTTP endpoints.
//
// Routes:
//   POST /api/intents/:intent/uploads/stage-output
//       Multipart: stage, target_path, file, mode, attribute_to_user
//       → atomic write to stages/{stage}/artifacts/{target_path}
//         (outputs/ alias canonicalised to artifacts/).
//       → action-log entry (author_class "human-via-mcp").
//       → audit-log entry in write-audit.jsonl.
//       → does NOT update baseline.json (next tick's drift gate does).
//
//   POST /api/intents/:intent/uploads/knowledge
//       Multipart: file, target_filename, stage, description, attribute_to_user
//       → atomic write to knowledge/{target_filename} (intent-scope) or
//         stages/{stage}/knowledge/{target_filename} (stage-scope when
//         stage param is non-null).
//       → same log semantics as stage-output.
//
// Security / validation:
//   - Path traversal: target_path must canonicalise to
//     stages/{stage}/artifacts/** (alias outputs/ → artifacts/).
//     Anything else is rejected with bad_target_path (400).
//   - Stage existence: stage must be a known stage directory.
//   - Stage writability: completed/sealed stages return stage_not_writable (403).
//   - File size cap: default 50 MB, env HAIKU_UPLOAD_MAX_BYTES.
//     Streaming enforced BEFORE bytes hit disk.
//   - Intent state: archived/missing → intent_not_found (404).
//   - Locked worktree: intent_locked (423).
//   - Atomic write: stream to tempfile, then rename into place.
//   - Temp-file cleanup: guards delete the tempfile on any rejection.
//
// Hook-bypass invariant (AC-SU2):
//   The SPA endpoint writes directly to disk; the agent's PreToolUse
//   guard-workflow-fields hook does NOT fire for these writes because
//   no MCP tool is involved.
//
// Audit / action-log:
//   Uses appendActionLogEntry (ARCHITECTURE.md §6.2) and
//   appendWriteAudit (MCP-TOOL-CONTRACT.md §8).

import { createHash } from "node:crypto"
import {
	createWriteStream,
	existsSync,
	readFileSync,
	unlinkSync,
} from "node:fs"
import { join, resolve } from "node:path"
import type { MultipartFile } from "@fastify/multipart"
import fastifyMultipart from "@fastify/multipart"
import type { FastifyInstance } from "fastify"
import { appendActionLogEntry } from "../orchestrator/workflow/action-log.js"
import {
	canonicalisePath,
	getCurrentTickCounter,
} from "../orchestrator/workflow/drift-baseline.js"
import {
	appendWriteAudit,
	nextEntryId,
} from "../orchestrator/workflow/write-audit.js"
import { cleanupTempFile, safeMkdirAndRename } from "../state/safe-write.js"
import {
	getIntentScopeTickCounter,
	IntentScopeTickPersistError,
	intentDir,
	isIntentArchived,
	isIntentLocked,
} from "../state-tools.js"
import { emitTelemetry } from "../telemetry.js"
import { requireTunnelAuth, verifyIntentMutationAuth } from "./auth.js"
import { isValidSlug, validateIntent, validateStage } from "./validation.js"

// ── Constants ──────────────────────────────────────────────────────────────

const DEFAULT_UPLOAD_MAX_BYTES = 50 * 1024 * 1024 // 50 MB

/**
 * VULN-REPORT V-07: Upload size hard cap.
 *
 * `HAIKU_UPLOAD_MAX_BYTES` previously had no upper bound. A misconfigured
 * 10 GB env value combined with the synchronous SHA-256 in the drift gate
 * stalls the workflow tick (the gate hashes every uploaded file on every
 * tick to detect drift; a 10 GB hash blocks the tick for minutes).
 *
 * Effective cap = `Math.min(envValue, MAX_UPLOAD_BYTES_HARD_CAP)`.
 * Configurations exceeding the hard cap are clamped silently from the
 * client's perspective (still 413 on overrun) and a `haiku.upload.cap_clamped`
 * telemetry event is emitted so the operator sees the misconfig.
 */
const MAX_UPLOAD_BYTES_HARD_CAP = 50 * 1024 * 1024 // 50 MB

/**
 * VULN-REPORT V-01 / V-02: MIME and extension allowlist for SPA uploads.
 *
 * `serveFile`'s MIME map matches `text/html`, `image/svg+xml`, `text/css`,
 * `application/javascript`, etc., so any uploaded `.html` / `.svg` / `.js` /
 * `.css` file rendered inline becomes a stored-XSS or stylesheet-injection
 * vector under the reviewer's privileged tunnel origin.
 *
 * The fix has two layers:
 *   1. `ALLOWED_MIMES_*` — per-route allowlist of MIME types the server
 *      accepts. Anything else is rejected with 415 BEFORE bytes hit disk.
 *   2. `BLOCKED_EXTENSIONS` — defence-in-depth blocklist of file extensions
 *      that render as scripts (or carry script payloads) regardless of the
 *      claimed MIME. Rejected with 415 even when the MIME is on the
 *      allowlist (covers MIME-spoof attacks like `text/plain`+`.html`).
 *
 * Bolt-3 hardening (closes red-team R-01/R-02/R-03/R-04):
 *   - `.js`, `.css`, `.htc`, `.hta`, `.htaccess` added to BLOCKED_EXTENSIONS:
 *     `serveFile` returns `application/javascript` and `text/css` for these
 *     extensions, so the same threat class V-01/V-02 named (stored XSS in the
 *     tunnel origin) was reachable via these equivalent extensions while only
 *     six were blocked. `.htc` (HTML Components, IE-mode-on-Edge), `.hta`
 *     (HTML Applications), and `.htaccess` (Apache config injection) are
 *     fellow-traveler vectors for the same threat class.
 *   - `application/octet-stream` removed from BOTH allowlists: it is the
 *     default MIME a multipart client uses when no Content-Type is set, which
 *     made the MIME allowlist effectively a no-op for any extension not in
 *     BLOCKED_EXTENSIONS. Treat octet-stream as "unknown — reject" rather than
 *     "binary blob — accept". Legitimate binary uploads (PDFs, images) already
 *     send their real MIME.
 *
 * Defence in depth — the serve-side hardening (CSP, sandbox sub-origin,
 * inverted MIME map) is deferred to follow-up unit-04 work; this unit
 * closes the upload-side primary vector.
 */
const BLOCKED_EXTENSIONS: ReadonlySet<string> = new Set([
	".html",
	".htm",
	".svg",
	".xml",
	".xhtml",
	".mhtml",
	// Bolt 3 — close red-team R-01/R-02 (.js/.css render as script/style under
	// the tunnel origin) and the IE-legacy / Apache-config siblings.
	".js",
	".mjs",
	".cjs",
	".css",
	".htc",
	".hta",
	".htaccess",
])

/** Stage-output uploads — the SPA writes designer mockups, screenshots,
 *  PDFs, and structured data. Markdown is intentionally allowed because
 *  designers attach `.md` notes alongside binary mockups; markdown is
 *  rendered as `text/plain` by `serveFile` so it does not execute.
 *
 *  Bolt 3 — `application/octet-stream` removed (red-team R-03): it is the
 *  multipart default when the client omits Content-Type, which made the
 *  allowlist effectively a no-op. Legitimate binary uploads send their
 *  real MIME (image/png, application/pdf, etc.); octet-stream is rejected. */
const ALLOWED_MIMES_STAGE_OUTPUT: ReadonlySet<string> = new Set([
	"image/png",
	"image/jpeg",
	"image/gif",
	"image/webp",
	"application/pdf",
	"text/plain",
	"text/markdown",
	"application/json",
])

/** Knowledge uploads — same allowlist as stage-output. Knowledge artifacts
 *  are documentation + research material; the same MIME set covers them.
 *  `application/octet-stream` removed in bolt 3 — see stage-output comment. */
const _ALLOWED_MIMES_KNOWLEDGE: ReadonlySet<string> = new Set([
	"image/png",
	"image/jpeg",
	"image/gif",
	"image/webp",
	"application/pdf",
	"text/plain",
	"text/markdown",
	"application/json",
])

/**
 * VULN-REPORT red-team R-04: bounded `attribute_to_user` validator.
 *
 * `attribute_to_user` previously flowed verbatim into `action-log.jsonl` and
 * `write-audit.jsonl`. Any future SPA renderer that displayed those audit
 * fields without escaping would re-emit attacker-controlled HTML into the
 * reviewer's session — a stored XSS via the audit log.
 *
 * Bound the field at upload time to a slug-with-spaces pattern: starts with a
 * word char, followed by 0-127 word chars, hyphens, dots, at-signs, or spaces.
 * This is wide enough to cover real human author IDs (`alice`, `Alice Smith`,
 * `alice.smith@example.com`, `product-owner-2`) but rejects every HTML / JS
 * sigil and every shell metacharacter.
 */
const ATTRIBUTE_TO_USER_PATTERN = /^[\w][\w\-.@ ]{0,127}$/

/** Returns true when the supplied attribution string is safe to write into
 *  `human_author_id` audit fields. */
function isValidAttributeToUser(value: string | undefined): boolean {
	if (typeof value !== "string") return false
	return ATTRIBUTE_TO_USER_PATTERN.test(value)
}

/** Exported for tests so the red-team R-04 bound can be exercised without an
 *  HTTP round trip. */
export { ATTRIBUTE_TO_USER_PATTERN, isValidAttributeToUser }

/** Extract the lowercase extension (including the leading dot) from a
 *  filename. Returns "" when the filename has no extension. */
function fileExtension(filename: string): string {
	const idx = filename.lastIndexOf(".")
	if (idx < 0) return ""
	return filename.slice(idx).toLowerCase()
}

/** Normalise a MIME type by stripping any `; charset=…` parameter and
 *  lowercasing. Returns "" when the value is empty/undefined. */
function normaliseMime(mime: string | undefined): string {
	if (!mime) return ""
	const semi = mime.indexOf(";")
	const head = (semi < 0 ? mime : mime.slice(0, semi)).trim().toLowerCase()
	return head
}

/** True when `filename` ends in an extension that we refuse to accept
 *  regardless of the claimed MIME. Defends against MIME-spoof attacks
 *  where the client sends `text/plain` with a `.html` filename. */
function hasBlockedExtension(filename: string): boolean {
	return BLOCKED_EXTENSIONS.has(fileExtension(filename))
}

/** Exported for tests so the V-07 hard-cap clamp can be asserted without
 *  uploading 50 MiB of payload to verify behavior. */
export function getUploadMaxBytes(): number {
	const raw = process.env.HAIKU_UPLOAD_MAX_BYTES
	let envValue: number
	if (raw === undefined) {
		envValue = DEFAULT_UPLOAD_MAX_BYTES
	} else {
		const parsed = Number.parseInt(raw, 10)
		envValue =
			!Number.isFinite(parsed) || parsed <= 0
				? DEFAULT_UPLOAD_MAX_BYTES
				: parsed
	}
	// V-07: clamp the env value to the hard cap so a misconfigured 10 GB
	// value cannot stall the workflow tick via the sync SHA-256 in the
	// drift gate. Emit a telemetry event when clamping fires so the
	// operator sees the misconfig.
	if (envValue > MAX_UPLOAD_BYTES_HARD_CAP) {
		emitTelemetry("haiku.upload.cap_clamped", {
			env_value: String(envValue),
			hard_cap: String(MAX_UPLOAD_BYTES_HARD_CAP),
		})
		return MAX_UPLOAD_BYTES_HARD_CAP
	}
	return Math.min(envValue, MAX_UPLOAD_BYTES_HARD_CAP)
}

/** Exported for tests — the hard cap that no env value can exceed. */
export const UPLOAD_MAX_BYTES_HARD_CAP = MAX_UPLOAD_BYTES_HARD_CAP

// ── Helpers ────────────────────────────────────────────────────────────────

/** Return true when a stage's state.json marks it as completed/sealed. */
function isStageSealed(intentSlug: string, stage: string): boolean {
	try {
		const stateFile = join(intentDir(intentSlug), "stages", stage, "state.json")
		if (!existsSync(stateFile)) return false
		const raw = readFileSync(stateFile, "utf-8")
		const parsed = JSON.parse(raw) as Record<string, unknown>
		// A stage is writable unless status is "complete" or "sealed".
		const status = parsed.status
		return status === "complete" || status === "sealed"
	} catch {
		return false
	}
}

// Lock + archive checks delegate to the shared `isIntentLocked` /
// `isIntentArchived` helpers in state-tools.ts so SPA upload routes and
// `haiku_human_write` agree on intent state semantics. Both helpers
// parse the frontmatter via gray-matter — no substring checks anywhere
// (V-06). Wrap the slug-based call so the route handlers can keep using
// a slug rather than reaching into intent-dir resolution themselves.

function isIntentArchivedBySlug(intentSlug: string): boolean {
	return isIntentArchived(intentDir(intentSlug))
}

function isIntentLockedBySlug(intentSlug: string): boolean {
	return isIntentLocked(intentDir(intentSlug))
}

/** Stream a Fastify multipart file part into a tempfile on disk.
 *  Returns the tempfile path on success, or throws if the size cap is exceeded.
 *  The caller is responsible for deleting the tempfile on error.
 *
 *  V-04 (TOCTOU): the legacy version did `mkdirSync(destDir, { recursive: true })`
 *  here, which silently followed any planted symlink in the chain — that's
 *  the V-04 SPA mirror. The fix moves all destDir creation into
 *  `safeMkdirAndRename` (called by the caller after the tempfile is fully
 *  streamed), and stages the tempfile in `intentRoot` instead. The
 *  tempfile lives on the same filesystem as the destination (intentRoot
 *  is the worktree root, parent of every stage subtree) so `rename()`
 *  remains POSIX-atomic. */
async function streamToTempfile(
	part: MultipartFile,
	tempStagingDir: string,
	maxBytes: number,
): Promise<{ tmpPath: string; sha256: string; bytes: number }> {
	// Stage the tempfile in `tempStagingDir` (intentRoot from the caller).
	// Caller is responsible for calling safeMkdirAndRename to create the
	// real destDir + atomically rename — this function does NOT create the
	// destination directory (V-04 race fix).
	const tmpPath = join(
		tempStagingDir,
		`.upload-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`,
	)

	const hash = createHash("sha256")
	let bytesWritten = 0

	const ws = createWriteStream(tmpPath)

	// Track whether the writestream has finished closing so the rejection
	// path can wait for the FD to be released before unlinking — otherwise
	// the writestream's async close can recreate the inode after our sync
	// unlink lands, leaving an orphaned tempfile in the artifacts dir.
	const wsClosed = new Promise<void>((resolve) => {
		ws.on("close", () => {
			resolve()
		})
	})

	await new Promise<void>((res, rej) => {
		ws.on("error", rej)
		ws.on("finish", res)
		part.file.on("error", rej)
		part.file.on("data", (chunk: Buffer) => {
			bytesWritten += chunk.length
			if (bytesWritten > maxBytes) {
				// Stop the stream and signal overflow.
				part.file.destroy()
				ws.destroy()
				rej(
					Object.assign(new Error("payload_too_large"), {
						code: "PAYLOAD_TOO_LARGE",
					}),
				)
				return
			}
			hash.update(chunk)
		})
		part.file.on("end", () => {
			ws.end()
		})
		// pipe() would auto-close; manual wiring to get the size check.
		part.file.pipe(ws)
	}).catch(async (err) => {
		// Wait for the writestream's underlying FD to close before unlinking
		// — otherwise the async `close` callback can recreate the file after
		// our sync unlink (race observed in test/upload-routes.test.mjs's
		// "Upload exceeds size cap" assertion that no temp files remain).
		await wsClosed.catch(() => {
			/* best-effort */
		})
		try {
			unlinkSync(tmpPath)
		} catch {
			/* best-effort */
		}
		throw err
	})

	return { tmpPath, sha256: hash.digest("hex"), bytes: bytesWritten }
}

// ── Route registration ─────────────────────────────────────────────────────

export async function registerUploadRoutes(
	instance: FastifyInstance,
): Promise<void> {
	// audit-allow: this file mentions fastify-plugin in commentary only;
	// the wrapper below is an anonymous inner plugin (NOT fastify-plugin)
	// so global hooks (including the V-08 csrfPreHandler) propagate.
	//
	// Wrap the upload routes in an encapsulated child plugin so that
	// @fastify/multipart's content-type parser and request decorators
	// (req.parts, req.isMultipart, etc.) are scoped to this sub-tree
	// and do NOT leak into the parent Fastify instance.
	//
	// @fastify/multipart uses fastify-plugin internally which normally
	// breaks encapsulation, but when wrapped in an anonymous inner plugin
	// (no fastify-plugin call on the wrapper) the scope boundary holds for
	// the addContentTypeParser call — which is what matters to prevent
	// interference with the application/json parser used by feedback routes.
	//
	// Without this wrapper, @fastify/multipart's global registration alters
	// how Fastify surfaces JSON parse errors, causing the setErrorHandler in
	// default-routes.ts to receive them in a form that fails the
	// FST_ERR_CTP_INVALID_JSON / SyntaxError / regex checks → returns plain
	// 'Bad Request' instead of the validation_failed JSON envelope.
	await instance.register(async (scope) => {
		// Register @fastify/multipart inside the scoped plugin.
		// We set limits.fileSize conservatively to the configured cap
		// but do our own byte-counting in streamToTempfile() so tests
		// can exercise the exact 413 path via env var.
		await scope.register(fastifyMultipart, {
			limits: {
				fileSize: getUploadMaxBytes() + 1, // +1 so our code fires first
				files: 1,
			},
		})

		// ── POST /api/intents/:intent/uploads/stage-output ─────────────────────

		scope.post<{ Params: { intent: string } }>(
			"/api/intents/:intent/uploads/stage-output",
			async (req, reply) => {
				if (!requireTunnelAuth(req, reply, null)) return

				const { intent } = req.params
				if (!isValidSlug(intent)) {
					reply.status(400).send({ error: "bad_param", code: "bad_param" })
					return
				}

				// R-01 (cross-session bypass): bind the JWT's `sid` claim to the
				// URL's intent slug. Without this, a tunnel-mode reviewer with a
				// valid JWT for review session S1 (bound to intent A) could POST
				// uploads to intent B and have them attributed there. Mirror the
				// feedback-API surface, which has gated this since FB-30.
				if (!verifyIntentMutationAuth(req, reply, intent)) return

				// Intent existence check.
				if (!validateIntent(intent)) {
					reply
						.status(404)
						.send({ error: "intent_not_found", code: "intent_not_found" })
					return
				}

				// Archived intent check.
				if (isIntentArchivedBySlug(intent)) {
					reply
						.status(404)
						.send({ error: "intent_not_found", code: "intent_not_found" })
					return
				}

				// Worktree locked check.
				if (isIntentLockedBySlug(intent)) {
					reply
						.status(423)
						.send({ error: "intent_locked", code: "intent_locked" })
					return
				}

				const maxBytes = getUploadMaxBytes()

				// Parse multipart fields.
				let stage: string | undefined
				let targetPath: string | undefined
				let mode: string | undefined
				let attributeToUser: string | undefined
				let filePart: MultipartFile | undefined

				try {
					const parts = req.parts()
					for await (const part of parts) {
						if (part.type === "file") {
							filePart = part as MultipartFile
						} else {
							const val = (part as { value: string }).value
							if (part.fieldname === "stage") stage = val
							else if (part.fieldname === "target_path") targetPath = val
							else if (part.fieldname === "mode") mode = val
							else if (part.fieldname === "attribute_to_user")
								attributeToUser = val
						}
					}
				} catch (err) {
					// If we hit a size cap from @fastify/multipart's own limits:
					const code = (err as { code?: string }).code
					if (
						code === "FST_FILES_LIMIT" ||
						code === "LIMIT_FILE_SIZE" ||
						code === "PAYLOAD_TOO_LARGE"
					) {
						reply
							.status(413)
							.send({ error: "payload_too_large", code: "payload_too_large" })
						return
					}
					reply
						.status(500)
						.send({ error: "write_failed", code: "write_failed" })
					return
				}

				// Field validation.
				if (!stage || !targetPath || !mode || !attributeToUser || !filePart) {
					reply.status(400).send({
						error: "bad_param",
						code: "bad_param",
						message:
							"Missing required fields: stage, target_path, mode, attribute_to_user, file",
					})
					return
				}

				// VULN-REPORT red-team R-04: bound `attribute_to_user` to a safe
				// slug-with-spaces pattern. Unvalidated attributions previously
				// flowed verbatim into action-log.jsonl + write-audit.jsonl,
				// creating a stored-XSS sink for any future SPA audit-log viewer.
				if (!isValidAttributeToUser(attributeToUser)) {
					reply.status(400).send({
						error: "bad_attribute_to_user",
						code: "bad_attribute_to_user",
						message:
							"attribute_to_user must match /^[\\w][\\w\\-.@ ]{0,127}$/ — alphanumerics, underscore, hyphen, dot, at-sign, space; max 128 chars; cannot start with a separator.",
						pattern: ATTRIBUTE_TO_USER_PATTERN.source,
					})
					return
				}

				// VULN-REPORT V-02: stored-XSS via stage-output uploads.
				// Reject blocked extensions FIRST (defends against MIME-spoofing
				// where client sends text/plain with a .html filename), then
				// reject unknown MIME types not on the allowlist. We check the
				// uploaded multipart filename AND the target_path so neither
				// alone can sneak a blocked extension through.
				const stageBlockedFromFilename = hasBlockedExtension(filePart.filename)
				const stageBlockedFromTarget = hasBlockedExtension(targetPath)
				if (stageBlockedFromFilename || stageBlockedFromTarget) {
					reply.status(415).send({
						error: "unsupported_media_type",
						code: "unsupported_media_type",
						message: `Files with extensions ${Array.from(BLOCKED_EXTENSIONS).join(", ")} are rejected — they render inline and become a stored-XSS vector. Convert to a non-executable format (PDF, PNG screenshot, plain text) and retry.`,
						blocked_extensions: Array.from(BLOCKED_EXTENSIONS),
					})
					return
				}
				const stageMime = normaliseMime(filePart.mimetype)
				if (!ALLOWED_MIMES_STAGE_OUTPUT.has(stageMime)) {
					reply.status(415).send({
						error: "unsupported_media_type",
						code: "unsupported_media_type",
						message: `MIME type '${stageMime || "<none>"}' is not on the stage-output upload allowlist. Allowed: ${Array.from(ALLOWED_MIMES_STAGE_OUTPUT).sort().join(", ")}.`,
						received_mime: stageMime,
						allowed_mimes: Array.from(ALLOWED_MIMES_STAGE_OUTPUT).sort(),
					})
					return
				}

				if (!["replace", "create", "upsert"].includes(mode)) {
					reply.status(400).send({
						error: "bad_param",
						code: "bad_param",
						message: "mode must be replace, create, or upsert",
					})
					return
				}

				if (!isValidSlug(stage)) {
					reply.status(400).send({ error: "bad_param", code: "bad_param" })
					return
				}

				if (!validateStage(intent, stage)) {
					reply
						.status(403)
						.send({ error: "stage_not_writable", code: "stage_not_writable" })
					return
				}

				// Stage sealed check.
				if (isStageSealed(intent, stage)) {
					reply
						.status(403)
						.send({ error: "stage_not_writable", code: "stage_not_writable" })
					return
				}

				// Path-safety: validate target_path.
				// Must canonicalise to stages/{stage}/artifacts/**
				// The alias outputs/ → artifacts/ is applied per AC-ALIAS3.
				// Reject anything with path separators or traversal.
				const targetPathDecoded = (() => {
					try {
						return decodeURIComponent(targetPath)
					} catch {
						return targetPath
					}
				})()

				// Reject obvious traversal patterns before any filesystem check.
				if (
					targetPathDecoded.includes("..") ||
					targetPathDecoded.includes("\x00") ||
					targetPathDecoded.includes("\\")
				) {
					reply
						.status(400)
						.send({ error: "bad_target_path", code: "bad_target_path" })
					return
				}

				// Normalise the path: strip leading slash, apply alias.
				const targetPathNorm = targetPathDecoded.replace(/^\/+/, "")
				const targetPathCanonical = canonicalisePath(
					`stages/${stage}/${targetPathNorm}`,
				)

				// Must land under stages/{stage}/artifacts/.
				const allowedPrefix = `stages/${stage}/artifacts/`
				if (!targetPathCanonical.startsWith(allowedPrefix)) {
					reply
						.status(400)
						.send({ error: "bad_target_path", code: "bad_target_path" })
					return
				}

				const iDir = intentDir(intent)
				const destAbsPath = join(iDir, targetPathCanonical)
				const destDir = destAbsPath.substring(0, destAbsPath.lastIndexOf("/"))
				// Final traversal check: resolved path must stay inside intentDir/stages/{stage}/artifacts/
				const resolvedDest = resolve(destAbsPath)
				const resolvedAllowed = resolve(join(iDir, allowedPrefix))
				if (!resolvedDest.startsWith(resolvedAllowed)) {
					reply
						.status(400)
						.send({ error: "bad_target_path", code: "bad_target_path" })
					return
				}

				// Mode enforcement.
				const targetExists = existsSync(destAbsPath)
				if (mode === "replace" && !targetExists) {
					reply.status(400).send({
						error: "mode_violation",
						code: "mode_violation",
						message: "mode=replace but target does not exist",
					})
					return
				}
				if (mode === "create" && targetExists) {
					reply
						.status(409)
						.send({ error: "filename_collision", code: "filename_collision" })
					return
				}

				// Stream to tempfile with size check. The tempfile is staged in
				// the intent root (NOT in destDir) so V-04 TOCTOU defence in
				// safeMkdirAndRename can validate the parent chain race-free
				// before the destDir is created.
				let tmpPath: string | null = null
				let sha256: string
				let bytes: number

				try {
					const result = await streamToTempfile(filePart, iDir, maxBytes)
					tmpPath = result.tmpPath
					sha256 = result.sha256
					bytes = result.bytes
				} catch (err) {
					const code = (err as { code?: string }).code
					if (code === "PAYLOAD_TOO_LARGE") {
						reply
							.status(413)
							.send({ error: "payload_too_large", code: "payload_too_large" })
						return
					}
					reply
						.status(500)
						.send({ error: "write_failed", code: "write_failed" })
					return
				}

				// V-04 (Symlink TOCTOU defence): atomic rename via the safe
				// helper. Refuses any pre-existing symlink in the parent chain,
				// creates missing dirs one segment at a time (no `recursive:
				// true` follow-symlink trap), and re-validates the parent's
				// realpath immediately before the rename.
				const safeResult = safeMkdirAndRename(
					iDir,
					destDir,
					tmpPath,
					destAbsPath,
				)
				if (!safeResult.ok) {
					cleanupTempFile(tmpPath)
					tmpPath = null
					const isSymlinkAttack =
						safeResult.code === "parent_chain_contains_symlink" ||
						safeResult.code === "parent_chain_escape"
					if (isSymlinkAttack) {
						reply.status(400).send({
							error: "bad_target_path",
							code: "bad_target_path",
							reason: safeResult.code,
						})
					} else {
						reply
							.status(500)
							.send({ error: "write_failed", code: "write_failed" })
					}
					return
				}
				tmpPath = null // rename succeeded; tempfile is now the dest

				// Stamp action-log entry (author_class: "human-via-mcp").
				// V-03: `attribute_to_user` is a self-reported claim — written
				// to BOTH `claimed_author_id` (canonical) and `human_author_id`
				// (legacy alias) so consumers can use either key during the
				// rename window.
				const tickCounter = getCurrentTickCounter(iDir, stage)
				const entryId = nextEntryId(tickCounter, 1)
				const now = new Date().toISOString()
				const actionEntry = {
					entry_type: "human_write" as const,
					path: targetPathCanonical,
					sha: sha256,
					author_class: "human-via-mcp" as const,
					timestamp: now,
					claimed_author_id: attributeToUser,
					human_author_id: attributeToUser,
					entry_id: entryId,
					tick_counter: tickCounter,
					tick_scope: "stage" as const,
				}
				await appendActionLogEntry(iDir, tickCounter, actionEntry)

				// Append audit-log entry (AC-TA2 / write-audit.jsonl).
				await appendWriteAudit(iDir, {
					timestamp: now,
					entry_id: entryId,
					path: targetPathCanonical,
					sha: sha256,
					author_class: "human-via-mcp",
					claimed_author_id: attributeToUser,
					human_author_id: attributeToUser,
					rationale: null,
					user_instruction_excerpt: null, // SPA uploads have no chat instruction (spec §1)
					tick_counter: tickCounter,
					session_id: null,
					overwrite: targetExists,
					dirs_created: [],
					audit_log_appended: true,
					tick_scope: "stage",
				})

				reply.send({
					ok: true,
					path: targetPathCanonical,
					sha256,
					bytes,
					baseline_updated: false,
					tick_will_observe: true,
				})
			},
		)

		// ── POST /api/intents/:intent/uploads/knowledge ────────────────────────

		scope.post<{ Params: { intent: string } }>(
			"/api/intents/:intent/uploads/knowledge",
			async (req, reply) => {
				if (!requireTunnelAuth(req, reply, null)) return

				const { intent } = req.params
				if (!isValidSlug(intent)) {
					reply.status(400).send({ error: "bad_param", code: "bad_param" })
					return
				}

				// R-01 (cross-session bypass): bind the JWT's `sid` claim to the
				// URL's intent slug. See stage-output route above for narrative.
				if (!verifyIntentMutationAuth(req, reply, intent)) return

				if (!validateIntent(intent)) {
					reply
						.status(404)
						.send({ error: "intent_not_found", code: "intent_not_found" })
					return
				}

				if (isIntentArchivedBySlug(intent)) {
					reply
						.status(404)
						.send({ error: "intent_not_found", code: "intent_not_found" })
					return
				}

				if (isIntentLockedBySlug(intent)) {
					reply
						.status(423)
						.send({ error: "intent_locked", code: "intent_locked" })
					return
				}

				const maxBytes = getUploadMaxBytes()

				// Parse multipart fields.
				let targetFilename: string | undefined
				let stage: string | null = null
				let attributeToUser: string | undefined
				let filePart: MultipartFile | undefined

				try {
					const parts = req.parts()
					for await (const part of parts) {
						if (part.type === "file") {
							filePart = part as MultipartFile
						} else {
							const val = (part as { value: string }).value
							if (part.fieldname === "target_filename") targetFilename = val
							else if (part.fieldname === "stage") stage = val || null
							else if (part.fieldname === "attribute_to_user")
								attributeToUser = val
							// description is optional — accepted but not stored on disk here
						}
					}
				} catch (err) {
					const code = (err as { code?: string }).code
					if (
						code === "FST_FILES_LIMIT" ||
						code === "LIMIT_FILE_SIZE" ||
						code === "PAYLOAD_TOO_LARGE"
					) {
						reply
							.status(413)
							.send({ error: "payload_too_large", code: "payload_too_large" })
						return
					}
					reply
						.status(500)
						.send({ error: "write_failed", code: "write_failed" })
					return
				}

				if (!targetFilename || !attributeToUser || !filePart) {
					reply.status(400).send({
						error: "bad_param",
						code: "bad_param",
						message:
							"Missing required fields: target_filename, attribute_to_user, file",
					})
					return
				}

				// VULN-REPORT red-team R-04: bound `attribute_to_user` (see
				// stage-output handler for rationale).
				if (!isValidAttributeToUser(attributeToUser)) {
					reply.status(400).send({
						error: "bad_attribute_to_user",
						code: "bad_attribute_to_user",
						message:
							"attribute_to_user must match /^[\\w][\\w\\-.@ ]{0,127}$/ — alphanumerics, underscore, hyphen, dot, at-sign, space; max 128 chars; cannot start with a separator.",
						pattern: ATTRIBUTE_TO_USER_PATTERN.source,
					})
					return
				}

				// Knowledge uploads accept ANY file type. The agent reads
				// these via `Read` (no privilege concern), and `serveFile`
				// in http/path-safety.ts downgrades any non-allowlisted
				// MIME to `application/octet-stream` +
				// `Content-Disposition: attachment` before the reviewer's
				// browser sees it — so V-01 (stored-XSS via knowledge
				// HTML) is closed at serve time, not by an upload-side
				// blocklist. The upload allowlist that used to live here
				// rejected legitimate designer / researcher artifacts
				// (Sketch HTML exports, .docx / .xlsx / .csv) and was
				// pure friction. Size cap below is the only meaningful
				// limit.

				// target_filename must be a basename — no path segments.
				const filenameDecoded = (() => {
					try {
						return decodeURIComponent(targetFilename)
					} catch {
						return targetFilename
					}
				})()
				if (
					filenameDecoded.includes("/") ||
					filenameDecoded.includes("\\") ||
					filenameDecoded.includes("..") ||
					filenameDecoded.includes("\x00")
				) {
					reply.status(400).send({
						error: "bad_target_path",
						code: "bad_target_path",
						message: "target_filename must be a basename with no path segments",
					})
					return
				}

				// Validate stage if provided.
				if (stage !== null) {
					if (!isValidSlug(stage)) {
						reply.status(400).send({ error: "bad_param", code: "bad_param" })
						return
					}
					if (!validateStage(intent, stage)) {
						reply
							.status(403)
							.send({ error: "stage_not_writable", code: "stage_not_writable" })
						return
					}
					if (isStageSealed(intent, stage)) {
						reply
							.status(403)
							.send({ error: "stage_not_writable", code: "stage_not_writable" })
						return
					}
				}

				const iDir = intentDir(intent)
				const destRelPath =
					stage !== null
						? `stages/${stage}/knowledge/${filenameDecoded}`
						: `knowledge/${filenameDecoded}`
				const destAbsPath = join(iDir, destRelPath)
				const destDir = destAbsPath.substring(0, destAbsPath.lastIndexOf("/"))

				// filename_collision check (implicit-create semantics).
				const targetExists = existsSync(destAbsPath)
				if (targetExists) {
					reply
						.status(409)
						.send({ error: "filename_collision", code: "filename_collision" })
					return
				}

				// Stream to tempfile (staged in iDir for V-04 TOCTOU safety —
				// see streamToTempfile docs).
				let tmpPath: string | null = null
				let sha256: string
				let bytes: number

				try {
					const result = await streamToTempfile(filePart, iDir, maxBytes)
					tmpPath = result.tmpPath
					sha256 = result.sha256
					bytes = result.bytes
				} catch (err) {
					const code = (err as { code?: string }).code
					if (code === "PAYLOAD_TOO_LARGE") {
						reply
							.status(413)
							.send({ error: "payload_too_large", code: "payload_too_large" })
						return
					}
					reply
						.status(500)
						.send({ error: "write_failed", code: "write_failed" })
					return
				}

				// V-04 (Symlink TOCTOU defence): atomic rename via the safe
				// helper. Same semantics as the stage-output route above.
				const safeResult = safeMkdirAndRename(
					iDir,
					destDir,
					tmpPath,
					destAbsPath,
				)
				if (!safeResult.ok) {
					cleanupTempFile(tmpPath)
					tmpPath = null
					const isSymlinkAttack =
						safeResult.code === "parent_chain_contains_symlink" ||
						safeResult.code === "parent_chain_escape"
					if (isSymlinkAttack) {
						reply.status(400).send({
							error: "bad_target_path",
							code: "bad_target_path",
							reason: safeResult.code,
						})
					} else {
						reply
							.status(500)
							.send({ error: "write_failed", code: "write_failed" })
					}
					return
				}
				tmpPath = null // rename succeeded; tempfile is now the dest

				// Stamp action-log entry.
				// V-05: stage-scoped uploads use that stage's tick (per-stage
				// monotonic counter); intent-scope knowledge (stage === null)
				// uses the deterministic intent-scope counter so two consecutive
				// uploads can't collide on `entry_id` and the drift gate's
				// consumer can union per-stage and intent-scope action-log
				// entries when classifying a tracked file.
				// V-03: `attribute_to_user` is recorded as a CLAIM in
				// `claimed_author_id` (canonical) and mirrored to the legacy
				// `human_author_id` key.
				const isIntentScope = stage === null
				let knowledgeTickCounter: number
				try {
					knowledgeTickCounter = isIntentScope
						? getIntentScopeTickCounter(iDir)
						: getCurrentTickCounter(iDir, stage as string)
				} catch (err) {
					// FB-41: `getIntentScopeTickCounter` now throws
					// `IntentScopeTickPersistError` instead of silently
					// best-efforting. The atomic rename above already landed
					// the upload at `destAbsPath`; if we let the throw
					// propagate, the file stays on disk with no
					// action-log/audit-log entry — the drift gate will then
					// classify it as an out-of-band human modification (the
					// exact failure class V-05 + this entire intent exist to
					// prevent). Roll back the rename so the V-05 invariant
					// holds: either everything (file + counter + entries)
					// lands, or nothing does.
					if (err instanceof IntentScopeTickPersistError) {
						try {
							unlinkSync(destAbsPath)
						} catch {
							// rollback best-effort; file may already be gone
						}
						reply.status(500).send({
							error: "tick_persist_failed",
							code: "tick_persist_failed",
							message: err.message,
						})
						return
					}
					throw err
				}
				const tickScope = isIntentScope ? "intent" : "stage"
				const entryId = nextEntryId(knowledgeTickCounter, 1)
				const now = new Date().toISOString()
				const actionEntry = {
					entry_type: "human_write" as const,
					path: destRelPath,
					sha: sha256,
					author_class: "human-via-mcp" as const,
					timestamp: now,
					claimed_author_id: attributeToUser,
					human_author_id: attributeToUser,
					entry_id: entryId,
					tick_counter: knowledgeTickCounter,
					tick_scope: tickScope as "intent" | "stage",
				}
				await appendActionLogEntry(iDir, knowledgeTickCounter, actionEntry)

				// Append audit-log entry.
				await appendWriteAudit(iDir, {
					timestamp: now,
					entry_id: entryId,
					path: destRelPath,
					sha: sha256,
					author_class: "human-via-mcp",
					claimed_author_id: attributeToUser,
					human_author_id: attributeToUser,
					rationale: null,
					user_instruction_excerpt: null,
					tick_counter: knowledgeTickCounter,
					session_id: null,
					overwrite: false,
					dirs_created: [],
					audit_log_appended: true,
					tick_scope: tickScope as "intent" | "stage",
				})

				reply.send({
					ok: true,
					path: destRelPath,
					sha256,
					bytes,
					baseline_updated: false,
					tick_will_observe: true,
				})
			},
		)
	}) // end of encapsulated scope
}
