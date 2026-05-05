/**
 * ImageDiffPreview — render coverage for the visual-diff preview that
 * surfaces inside DriftAssessmentsView's expanded row when an
 * AssessmentRecord carries an image-pathed finding.
 *
 * Coverage:
 *   1. Renders before/after thumbnails for an image-pathed finding with
 *      both before and after SHAs.
 *   2. URL shape: stage-scoped findings route through the
 *      `/baseline-content/stage/:stage/:sha` segment; intent-scope
 *      findings (stage === null) route through `/baseline-content/intent/:sha`.
 *   3. Finding without before/after SHA → renders "Preview not available"
 *      for the missing side.
 *   4. Non-image-pathed findings do NOT trigger an ImageDiffPreview render
 *      (no `data-testid="image-diff-preview"` in the DOM).
 *   5. Multiple image findings → multiple previews.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import {
	type AssessmentRecord,
	DriftAssessmentsView,
} from "../DriftAssessmentsView"

afterEach(() => {
	cleanup()
})

function expandFirstRow(): void {
	const btns = screen.getAllByText(/View diff and rationale/i)
	fireEvent.click(btns[0])
}

function _expandAllRows(): void {
	const btns = screen.getAllByText(/View diff and rationale/i)
	for (const b of btns) fireEvent.click(b)
}

function makeRecord(
	overrides: Partial<AssessmentRecord> = {},
): AssessmentRecord {
	return {
		id: "DA-01",
		paths: ["stages/design/artifacts/hero.png"],
		change_kind: "modified",
		outcome: "ignore",
		created_at: new Date().toISOString(),
		rationale_excerpt: "designer dropped a new hero",
		agent_rationale: "no impact on units; accept",
		diff_unified: "",
		findings: [
			{
				path: "stages/design/artifacts/hero.png",
				stage: "design",
				change_kind: "modified",
				is_binary: true,
				before_sha256: "a".repeat(64),
				after_sha256: "b".repeat(64),
			},
		],
		...overrides,
	}
}

describe("ImageDiffPreview", () => {
	it("renders before/after thumbnails for an image-pathed finding", () => {
		render(
			<DriftAssessmentsView intentSlug="demo" assessments={[makeRecord()]} />,
		)
		expandFirstRow()
		const preview = screen.getByTestId("image-diff-preview")
		expect(preview).toBeTruthy()
		const imgs = preview.querySelectorAll("img")
		expect(imgs.length).toBe(2)
		expect((imgs[0] as HTMLImageElement).src).toMatch(
			/\/api\/intents\/demo\/baseline-content\/stage\/design\/a{64}$/,
		)
		expect((imgs[1] as HTMLImageElement).src).toMatch(
			/\/api\/intents\/demo\/baseline-content\/stage\/design\/b{64}$/,
		)
	})

	it("intent-scope finding (stage=null) routes through /intent/ path", () => {
		const r = makeRecord({
			paths: ["knowledge/brand-mark.png"],
			findings: [
				{
					path: "knowledge/brand-mark.png",
					stage: null,
					change_kind: "modified",
					is_binary: true,
					before_sha256: "c".repeat(64),
					after_sha256: "d".repeat(64),
				},
			],
		})
		render(<DriftAssessmentsView intentSlug="demo" assessments={[r]} />)
		expandFirstRow()
		const imgs = screen
			.getByTestId("image-diff-preview")
			.querySelectorAll("img")
		expect((imgs[0] as HTMLImageElement).src).toMatch(
			/\/api\/intents\/demo\/baseline-content\/intent\/c{64}$/,
		)
		expect((imgs[1] as HTMLImageElement).src).toMatch(
			/\/api\/intents\/demo\/baseline-content\/intent\/d{64}$/,
		)
	})

	it("finding without before SHA → 'Preview not available' on the before side", () => {
		const r = makeRecord({
			findings: [
				{
					path: "stages/design/artifacts/hero.png",
					stage: "design",
					change_kind: "modified",
					is_binary: true,
					before_sha256: null,
					after_sha256: "b".repeat(64),
				},
			],
		})
		render(<DriftAssessmentsView intentSlug="demo" assessments={[r]} />)
		expandFirstRow()
		const preview = screen.getByTestId("image-diff-preview")
		// One <img> for after, plus the placeholder for before.
		expect(preview.querySelectorAll("img").length).toBe(1)
		expect(preview.textContent ?? "").toMatch(/Preview not available/i)
	})

	it("does not render ImageDiffPreview when no image-pathed findings", () => {
		const r = makeRecord({
			paths: ["stages/design/artifacts/spec.md"],
			findings: [
				{
					path: "stages/design/artifacts/spec.md",
					stage: "design",
					change_kind: "modified",
					is_binary: false,
					before_sha256: "e".repeat(64),
					after_sha256: "f".repeat(64),
				},
			],
			diff_unified: "@@ -1 +1 @@\n-old\n+new\n",
		})
		render(<DriftAssessmentsView intentSlug="demo" assessments={[r]} />)
		expandFirstRow()
		expect(screen.queryByTestId("image-diff-preview")).toBeNull()
	})

	it("multiple image findings → multiple previews", () => {
		const r = makeRecord({
			findings: [
				{
					path: "stages/design/artifacts/a.png",
					stage: "design",
					change_kind: "modified",
					is_binary: true,
					before_sha256: "1".repeat(64),
					after_sha256: "2".repeat(64),
				},
				{
					path: "stages/design/artifacts/b.jpg",
					stage: "design",
					change_kind: "modified",
					is_binary: true,
					before_sha256: "3".repeat(64),
					after_sha256: "4".repeat(64),
				},
			],
		})
		render(<DriftAssessmentsView intentSlug="demo" assessments={[r]} />)
		expandFirstRow()
		expect(screen.getAllByTestId("image-diff-preview").length).toBe(2)
	})

	it("img onError (404 from extension/bytes mismatch) → swaps to fallback text", () => {
		render(
			<DriftAssessmentsView intentSlug="demo" assessments={[makeRecord()]} />,
		)
		expandFirstRow()
		const preview = screen.getByTestId("image-diff-preview")
		const imgs = preview.querySelectorAll("img")
		expect(imgs.length).toBe(2)
		// Simulate the route returning 404 — e.g. a PDF renamed to .png
		// where the engine's magic-byte sniff refused to retain a sidecar.
		fireEvent.error(imgs[0])
		fireEvent.error(imgs[1])
		expect(preview.querySelectorAll("img").length).toBe(0)
		expect(preview.textContent ?? "").toMatch(/Preview not available/i)
	})
})
