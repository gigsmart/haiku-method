import { readFileSync } from "node:fs"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

const pluginVersion = (() => {
	try {
		return JSON.parse(
			readFileSync("../../plugin/.claude-plugin/plugin.json", "utf8"),
		).version
	} catch {
		return "dev"
	}
})()

export default defineConfig({
	plugins: [react(), tailwindcss()],
	define: {
		"import.meta.env.VITE_SENTRY_DSN": JSON.stringify(
			process.env.SENTRY_DSN_REVIEW_SPA || "",
		),
		"import.meta.env.VITE_SENTRY_RELEASE": JSON.stringify(
			`haiku-spa@${pluginVersion}`,
		),
	},
	build: {
		// Inline everything into a single HTML file. Minify via esbuild (Vite
		// default) — external sourcemaps keep stack traces readable even with
		// minification on. Flipping this alone is expected to cut the inlined
		// SPA size by ~40–60% on top of gzip (FB-21).
		minify: "esbuild",
		sourcemap: true,
		cssCodeSplit: false,
		assetsInlineLimit: Number.POSITIVE_INFINITY,
		rollupOptions: {
			output: {
				// Single JS bundle
				manualChunks: undefined,
				inlineDynamicImports: true,
			},
		},
	},
})
