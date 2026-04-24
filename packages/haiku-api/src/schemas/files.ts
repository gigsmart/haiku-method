/**
 * File-serving endpoints — consolidated `/files/:sessionId/*path`, plus the
 * legacy-alias endpoints that share a path-parameter shape:
 *   - /mockups/:sessionId/:path
 *   - /wireframe/:sessionId/:path
 *   - /stage-artifacts/:sessionId/:path
 *   - /question-image/:sessionId/:index
 *
 * These responses are raw byte streams (images, pdfs, html), so only the
 * request parameter shape is schematized here.
 */

import { z } from "zod"

// Adversarial patterns — rejected at the schema boundary. These mirror the
// unit-01 spec's declared fixture list; every addition here MUST be covered
// by a round-trip test in test/schemas.test.mjs.
//   Fixture list (unit-01-extract-haiku-api-package.md:109):
//     ['../', '%2e%2e%2f', '/etc/passwd', 'foo\x00.png', '\..\', '.', '', 'a\0b']
const ENCODED_TRAVERSAL_RE = /%(?:00|2e|2f|5c)/i // null, dot, slash, backslash
const WINDOWS_DRIVE_RE = /^[A-Za-z]:/

function isSafeRelativePath(p: string): boolean {
	if (p.includes("\x00")) return false // null byte
	if (ENCODED_TRAVERSAL_RE.test(p)) return false // %00/%2e/%2f/%5c
	if (p.startsWith("/")) return false // absolute POSIX
	if (p.startsWith("\\")) return false // absolute Windows-style
	if (WINDOWS_DRIVE_RE.test(p)) return false // C:\ etc.
	if (p === ".") return false // bare dot (degenerate)
	const segments = p.split(/[\\/]+/)
	if (segments.some((seg) => seg === "..")) return false // parent traversal
	return true
}

export const FileServeParamsSchema = z
	.object({
		sessionId: z
			.string()
			.min(1)
			.describe("Session ID (UUID issued by sessions.createSession)"),
		path: z
			.string()
			.min(1)
			.refine(isSafeRelativePath, {
				message:
					"path must be a safe relative path — no '..' segments, absolute paths, null bytes, or URL-encoded variants (%00, %2e, %2f, %5c)",
			})
			.describe("Relative path under the session's serving root"),
	})
	.describe("Path parameters for /files/:sessionId/*path and aliases")
export type FileServeParams = z.infer<typeof FileServeParamsSchema>

export const QuestionImageParamsSchema = z
	.object({
		sessionId: z.string().min(1),
		index: z
			.number()
			.int()
			.nonnegative()
			.describe("Zero-based image index within the question session"),
	})
	.describe("Path parameters for /question-image/:sessionId/:index")
export type QuestionImageParams = z.infer<typeof QuestionImageParamsSchema>
