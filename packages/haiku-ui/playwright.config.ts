/**
 * Playwright config — scoped to `tests/review-page.spec.ts` only.
 *
 * Setup (one-time, per unit-07 tactical plan §10):
 *   npm install --workspace haiku-ui --save-dev @playwright/test@^1.58.2
 *   npx playwright install chromium
 *
 * Baseline regeneration (after intentional visual changes):
 *   npx playwright test --config=packages/haiku-ui/playwright.config.ts --update-snapshots
 *
 * Run (assumes baselines are committed):
 *   npx playwright test --config=packages/haiku-ui/playwright.config.ts
 *
 * Vitest skips this file via `vitest.config.ts` `exclude` guard. Running
 * it as a Vitest spec would fail because `@playwright/test`'s `test`
 * function throws outside the Playwright runner.
 */

import { defineConfig, devices } from "@playwright/test"

export default defineConfig({
	testDir: "./tests",
	testMatch: /review-page\.spec\.ts$/,
	snapshotDir: "./tests/__snapshots__",
	// Match the unit spec's ≤ 0.5% per-URL screenshot diff requirement.
	expect: {
		toHaveScreenshot: { maxDiffPixelRatio: 0.005 },
	},
	use: {
		baseURL: "http://localhost:5173",
	},
	webServer: {
		command: "npm run dev",
		port: 5173,
		reuseExistingServer: true,
		cwd: __dirname,
	},
	projects: [
		{
			name: "desktop",
			use: {
				...devices["Desktop Chrome"],
				viewport: { width: 1440, height: 900 },
			},
		},
		{
			name: "mobile",
			use: {
				...devices["Desktop Chrome"],
				viewport: { width: 390, height: 844 },
			},
		},
	],
})
