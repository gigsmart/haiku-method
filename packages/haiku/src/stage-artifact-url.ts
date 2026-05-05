// stage-artifact-url.ts — One source of truth for the URL that points
// at a tracked file inside an intent dir, served via the
// `/stage-artifacts/:sessionId/*` route in `http/file-serve.ts`.
//
// Callers pass an intent-dir-relative path (e.g. `stages/design/artifacts/foo.md`,
// `product/ACCEPTANCE-CRITERIA.md`, `knowledge/DISCOVERY.md`). Anything
// the file-serve route accepts is fair game — the route does its own
// path-safety check.
//
// The function strips a leading `/` so paths like `/foo.md` and
// `foo.md` produce the same URL. It does NOT add the auth `?t=` query
// — that lives in the UI layer (`api/auth.ts`'s `withAuthQuery`) so
// only views that need the auth wrapper pay for it.

/**
 * Build the URL the SPA uses to fetch a tracked file. The result is
 * the path the `/stage-artifacts/:sessionId/*` route expects — without
 * the auth query string.
 */
export function buildStageArtifactUrl(
	sessionId: string,
	intentRelativePath: string,
): string {
	const cleaned = intentRelativePath.replace(/^\/+/, "")
	return `/stage-artifacts/${sessionId}/${cleaned}`
}
