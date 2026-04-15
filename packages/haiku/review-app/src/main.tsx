import * as Sentry from "@sentry/react"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "./index.css"
import { App } from "./App"

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

// Apply dark mode based on system preference or stored preference
function applyTheme() {
	const KEY = "haiku-review-theme"
	const stored = localStorage.getItem(KEY)
	if (
		stored === "dark" ||
		(!stored && window.matchMedia("(prefers-color-scheme: dark)").matches)
	) {
		document.documentElement.classList.add("dark")
	} else {
		document.documentElement.classList.remove("dark")
	}
}

applyTheme()
window
	.matchMedia("(prefers-color-scheme: dark)")
	.addEventListener("change", applyTheme)

const root = document.getElementById("root")
if (!root) throw new Error("Missing #root mount point")
createRoot(root).render(
	<StrictMode>
		<App />
	</StrictMode>,
)
