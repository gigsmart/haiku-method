import react from "@vitejs/plugin-react"
import { defineConfig } from "vitest/config"

export default defineConfig({
	plugins: [react()],
	test: {
		environment: "jsdom",
		globals: false,
		setupFiles: ["./tests/setup.ts"],
		include: [
			"tests/**/*.test.ts",
			"tests/**/*.test.tsx",
			"tests/**/*.spec.ts",
			"tests/**/*.spec.tsx",
			"src/**/*.test.ts",
			"src/**/*.test.tsx",
			"src/**/*.spec.ts",
			"src/**/*.spec.tsx",
		],
		// Playwright specs are NOT Vitest specs — their `test` import
		// throws outside the Playwright runner. Explicitly exclude any
		// Playwright spec under `tests/`. See unit-07 tactical plan §I.
		exclude: ["node_modules/**", "dist/**", "tests/review-page.spec.ts"],
	},
})
