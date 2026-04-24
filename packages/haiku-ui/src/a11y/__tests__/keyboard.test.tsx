import { cleanup, fireEvent, render } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
	__resetShortcutRegistryForTests,
	KEYBOARD_SHORTCUT_REGISTRY,
	KeyboardShortcutConflict,
	useShortcut,
} from "../keyboard"

afterEach(() => {
	cleanup()
	__resetShortcutRegistryForTests()
})

beforeEach(() => {
	__resetShortcutRegistryForTests()
})

function ShortcutProbe({
	k,
	scope,
	handler,
	guard,
	allowInInput,
}: {
	k: string
	scope: string
	handler: (e: KeyboardEvent) => void
	guard?: () => boolean
	allowInInput?: boolean
}) {
	useShortcut(k, handler, { scope, guard, allowInInput })
	return null
}

describe("KEYBOARD_SHORTCUT_REGISTRY", () => {
	it("covers the canonical chords from keyboard-shortcut-map.html §1", () => {
		const keys = new Set(KEYBOARD_SHORTCUT_REGISTRY.map((b) => b.key))
		for (const expected of [
			"j",
			"k",
			"[",
			"]",
			"g o",
			"g u",
			"g k",
			"g p",
			"Enter",
			"n",
			"a",
			"c",
			"r",
			"/",
			"Escape",
			"?",
		]) {
			expect(keys.has(expected)).toBe(true)
		}
	})
})

describe("useShortcut — conflict detection", () => {
	it("duplicate (key, scope) throws KeyboardShortcutConflict in dev", () => {
		const h1 = vi.fn()
		const h2 = vi.fn()
		// First mount registers cleanly.
		render(<ShortcutProbe k="r" scope="global" handler={h1} />)
		// Second mount at the same (key, scope) must throw.
		expect(() => {
			render(<ShortcutProbe k="r" scope="global" handler={h2} />)
		}).toThrow(KeyboardShortcutConflict)
	})

	it("same key at different scopes coexists (no throw)", () => {
		const h1 = vi.fn()
		const h2 = vi.fn()
		expect(() => {
			render(
				<>
					<ShortcutProbe k="r" scope="global" handler={h1} />
					<ShortcutProbe k="r" scope="dialog" handler={h2} />
				</>,
			)
		}).not.toThrow()
	})
})

describe("useShortcut — input-capture guard", () => {
	it("suppresses the handler when focus is inside an input", () => {
		const handler = vi.fn()
		render(
			<>
				<ShortcutProbe k="a" scope="global" handler={handler} />
				<input data-testid="inp" />
			</>,
		)
		const input = document.querySelector(
			"[data-testid='inp']",
		) as HTMLInputElement
		input.focus()
		fireEvent.keyDown(input, { key: "a" })
		expect(handler).not.toHaveBeenCalled()
	})

	it("allowInInput: true fires the handler even when focus is in an input", () => {
		const handler = vi.fn()
		render(
			<>
				<ShortcutProbe k="a" scope="global" handler={handler} allowInInput />
				<input data-testid="inp" />
			</>,
		)
		const input = document.querySelector(
			"[data-testid='inp']",
		) as HTMLInputElement
		input.focus()
		fireEvent.keyDown(input, { key: "a" })
		expect(handler).toHaveBeenCalledTimes(1)
	})
})

describe("useShortcut — custom guard callback", () => {
	it("skips the handler when guard() returns false", () => {
		const handler = vi.fn()
		render(
			<ShortcutProbe
				k="r"
				scope="global"
				handler={handler}
				guard={() => false}
			/>,
		)
		fireEvent.keyDown(document, { key: "r" })
		expect(handler).not.toHaveBeenCalled()
	})

	it("fires the handler when guard() returns true", () => {
		const handler = vi.fn()
		render(
			<ShortcutProbe
				k="r"
				scope="global"
				handler={handler}
				guard={() => true}
			/>,
		)
		fireEvent.keyDown(document, { key: "r" })
		expect(handler).toHaveBeenCalledTimes(1)
	})
})

describe("useShortcut — modifier-key bypass", () => {
	it("does not fire when Ctrl / Meta / Alt is held", () => {
		const handler = vi.fn()
		render(<ShortcutProbe k="a" scope="global" handler={handler} />)
		fireEvent.keyDown(document, { key: "a", ctrlKey: true })
		fireEvent.keyDown(document, { key: "a", metaKey: true })
		fireEvent.keyDown(document, { key: "a", altKey: true })
		expect(handler).not.toHaveBeenCalled()
	})
})
