import { fileURLToPath } from "node:url"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vitest/config"

const rootDir = fileURLToPath(new URL(".", import.meta.url))

export default defineConfig({
	plugins: [react()],
	root: rootDir,
	test: {
		environment: "jsdom",
		globals: false,
		setupFiles: [fileURLToPath(new URL("./tests/setup.ts", import.meta.url))],
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
