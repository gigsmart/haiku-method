import { defineConfig } from "vitest/config"

export default defineConfig({
	esbuild: {
		jsx: "automatic",
	},
	test: {
		environment: "jsdom",
		globals: true,
		setupFiles: ["./test/setup.ts"],
		include: ["test/**/*.test.{ts,tsx}"],
		server: {
			deps: {
				// Shared workspace packages ship raw TS/TSX — let vitest transform
				// them with the automatic JSX runtime too.
				inline: [/@haiku\//],
			},
		},
	},
})
