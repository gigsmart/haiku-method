import * as Sentry from "@sentry/react"
import { createRouter, RouterProvider } from "@tanstack/react-router"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { ApiClientProvider } from "./api/context"
import "./index.css"
import { routeTree } from "./routeTree.gen"

// Initialize Sentry — DSN is baked in at build time via Vite's define config
const sentryDsn = import.meta.env.VITE_SENTRY_DSN
if (sentryDsn) {
	Sentry.init({
		dsn: sentryDsn,
		release: import.meta.env.VITE_SENTRY_RELEASE || undefined,
		tracesSampleRate: 0.1,
		replaysSessionSampleRate: 0,
		replaysOnErrorSampleRate: 1.0,
	})
}

// Theme bootstrap lives in two places:
//   - Synchronously in `index.html`'s <head> to prevent FOUC.
//   - Reactively in the root route's mount useEffect (matchMedia listener
//     + React state sync via <ThemeToggle/>).
// Keeping it out of main.tsx avoids a three-way race when the stored value
// and the system preference disagree.

const router = createRouter({
	routeTree,
	// H·AI·K·U's review UI is desktop-only today; default to the URL that
	// the MCP review server opens to when no specific path is given.
	defaultPreload: "intent",
	scrollRestoration: true,
})

declare module "@tanstack/react-router" {
	interface Register {
		router: typeof router
	}
}

const root = document.getElementById("root")
if (!root) throw new Error("Missing #root element — check index.html")
createRoot(root).render(
	<StrictMode>
		<ApiClientProvider>
			<RouterProvider router={router} />
		</ApiClientProvider>
	</StrictMode>,
)
