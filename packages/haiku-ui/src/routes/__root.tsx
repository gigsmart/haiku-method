/**
 * Root route — owns the elements that must sit at the very top of the
 * document tree for a11y: the skip-link (first focusable), the routed
 * outlet (contains banner/main/footer per route), and the live-region
 * shell (sr-only polite + assertive regions).
 *
 * Theme bootstrap also lives here so the `prefers-color-scheme` listener
 * attaches exactly once for the app lifetime.
 *
 * DOM order per `stages/design/artifacts/aria-landmark-spec.md §1`:
 *   1. <SkipLink>              — first focusable; target is <Main id="main-content">
 *   2. <Outlet />              — header / main / footer rendered by route file
 *   3. <LiveRegionShell>       — two sr-only live regions (polite + assertive)
 */

import { createRootRoute, Outlet } from "@tanstack/react-router"
import { useEffect } from "react"
import { LiveRegionShell } from "../a11y"
import { SkipLink } from "../components/SkipLink"
import { NotFoundShell } from "../shell/ShellLayout"
import { applyThemePreference, THEME_KEY } from "../theme"

function RootLayout(): React.ReactElement {
	useEffect(() => {
		applyThemePreference()
		const mql = window.matchMedia("(prefers-color-scheme: dark)")
		const onChange = () => {
			if (!window.localStorage.getItem(THEME_KEY)) applyThemePreference()
		}
		mql.addEventListener("change", onChange)
		return () => mql.removeEventListener("change", onChange)
	}, [])
	return (
		<>
			<SkipLink />
			<Outlet />
			<LiveRegionShell />
		</>
	)
}

export const Route = createRootRoute({
	component: RootLayout,
	notFoundComponent: NotFoundShell,
})
