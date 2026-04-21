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
		exclude: ["node_modules/**", "dist/**"],
	},
})
