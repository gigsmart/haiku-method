/**
 * tryCloseTab — best-effort UX side-effect helper that fires a last-ditch
 * `navigator.sendBeacon` and then calls `window.close()` on a short delay.
 *
 * This is NOT an API call and intentionally lives outside the typed
 * `ApiClient` surface. Callers MUST supply concrete URLs built via
 * `paths.*` from `haiku-api` — no hand-formatted path literals.
 *
 * `window.close()` is a no-op for tabs the script did not open, so callers
 * MUST NOT gate their success UI on this helper returning.
 */
export function tryCloseTab(beacon?: { url: string; body: unknown }) {
	setTimeout(() => {
		if (beacon && navigator.sendBeacon) {
			navigator.sendBeacon(
				beacon.url,
				new Blob([JSON.stringify(beacon.body)], { type: "application/json" }),
			)
		}
		window.close()
	}, 200)
}
