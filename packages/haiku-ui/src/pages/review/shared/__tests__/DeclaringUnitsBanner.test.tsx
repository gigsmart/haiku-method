/**
 * Render tests for DeclaringUnitsBanner — confirms it surfaces the
 * declaring unit slugs from `output_declared_by` and routes clicks
 * through to the parent's `onUnitClick` callback.
 *
 * The banner is the inverse view of the per-unit Outputs subsection:
 * an output viewer can navigate back to the unit(s) that declared
 * the file as a deliverable. Renders nothing when no unit declared
 * the path (catch-all-walked files no unit explicitly owns).
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { DeclaringUnitsBanner } from "../DeclaringUnitsBanner"

afterEach(() => {
	cleanup()
})

describe("DeclaringUnitsBanner", () => {
	it("renders nothing when intentRelativePath is undefined", () => {
		const { container } = render(
			<DeclaringUnitsBanner
				intentRelativePath={undefined}
				declaredBy={{ "product/foo.md": ["unit-04-acceptance"] }}
			/>,
		)
		expect(container.firstChild).toBeNull()
	})

	it("renders nothing when declaredBy map is undefined", () => {
		const { container } = render(
			<DeclaringUnitsBanner
				intentRelativePath="product/foo.md"
				declaredBy={undefined}
			/>,
		)
		expect(container.firstChild).toBeNull()
	})

	it("renders nothing when no unit declared the path", () => {
		const { container } = render(
			<DeclaringUnitsBanner
				intentRelativePath="product/foo.md"
				declaredBy={{ "other/file.md": ["unit-01-other"] }}
			/>,
		)
		expect(container.firstChild).toBeNull()
	})

	it("renders nothing when the path's unit list is empty", () => {
		const { container } = render(
			<DeclaringUnitsBanner
				intentRelativePath="product/foo.md"
				declaredBy={{ "product/foo.md": [] }}
			/>,
		)
		expect(container.firstChild).toBeNull()
	})

	it("renders one badge per declaring unit", () => {
		render(
			<DeclaringUnitsBanner
				intentRelativePath="product/foo.md"
				declaredBy={{
					"product/foo.md": ["unit-04-acceptance", "unit-05-coverage"],
				}}
			/>,
		)
		expect(screen.getByText("unit-04-acceptance")).toBeTruthy()
		expect(screen.getByText("unit-05-coverage")).toBeTruthy()
	})

	it("renders badges as buttons when onUnitClick is provided", () => {
		const onUnitClick = vi.fn()
		render(
			<DeclaringUnitsBanner
				intentRelativePath="product/foo.md"
				declaredBy={{ "product/foo.md": ["unit-04-acceptance"] }}
				onUnitClick={onUnitClick}
			/>,
		)
		const button = screen.getByRole("button", { name: "unit-04-acceptance" })
		fireEvent.click(button)
		expect(onUnitClick).toHaveBeenCalledWith("unit-04-acceptance")
	})

	it("renders badges as static text when onUnitClick is omitted", () => {
		render(
			<DeclaringUnitsBanner
				intentRelativePath="product/foo.md"
				declaredBy={{ "product/foo.md": ["unit-04-acceptance"] }}
			/>,
		)
		expect(
			screen.queryByRole("button", { name: "unit-04-acceptance" }),
		).toBeNull()
		expect(screen.getByText("unit-04-acceptance")).toBeTruthy()
	})
})
