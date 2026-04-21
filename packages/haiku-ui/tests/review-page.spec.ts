/**
 * Review-page visual regression — Playwright spec.
 *
 * This spec boots the Vite dev server (via the `webServer` block in
 * `playwright.config.ts`), loads the review page with a fixture-backed
 * mock ApiClient at 1440x900 and 390x844, and compares against committed
 * PNG baselines under `tests/__snapshots__/`.
 *
 * Baseline capture (one-time):
 *   npx playwright test --config=packages/haiku-ui/playwright.config.ts --update-snapshots
 *
 * Verify (CI + local):
 *   npx playwright test --config=packages/haiku-ui/playwright.config.ts
 *
 * The fixture loader is gated behind `?fixture=review-session-full` +
 * `import.meta.env.DEV`; production builds tree-shake the loader per
 * unit-07 tactical plan §5 + §H.
 *
 * Diff threshold: ≤ 0.5% per-URL, per unit spec completion criterion.
 */

import { expect, test } from "@playwright/test"

const FIXTURE_URL = "/review/test-review-full?fixture=review-session-full"

test.describe("Review page — visual regression", () => {
	test("desktop screenshot", async ({ page }) => {
		await page.setViewportSize({ width: 1440, height: 900 })
		await page.goto(FIXTURE_URL)
		await page.waitForSelector('[data-testid="review-page-ready"]', {
			state: "attached",
			timeout: 10_000,
		})
		await expect(page).toHaveScreenshot("review-page-desktop.png", {
			maxDiffPixelRatio: 0.005,
			fullPage: true,
		})
	})

	test("mobile screenshot", async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 })
		await page.goto(FIXTURE_URL)
		await page.waitForSelector('[data-testid="review-page-ready"]', {
			state: "attached",
			timeout: 10_000,
		})
		await expect(page).toHaveScreenshot("review-page-mobile.png", {
			maxDiffPixelRatio: 0.005,
			fullPage: true,
		})
	})
})
