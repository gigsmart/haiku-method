import { cleanup, render, screen } from "@testing-library/react"
import { createRef } from "react"
import { afterEach, describe, expect, it } from "vitest"
import { Aside, FooterBar, Header, Main, Nav } from "../landmarks"

afterEach(() => {
	cleanup()
})

describe("Landmark primitives", () => {
	it("<Header> renders as <header role='banner'>", () => {
		render(<Header>h</Header>)
		expect(screen.getByRole("banner")).toBeTruthy()
	})

	it("<Main> renders with id='main-content', role='main', default aria-label", () => {
		render(<Main>body</Main>)
		const main = screen.getByRole("main", { name: "Review content" })
		expect(main.id).toBe("main-content")
		expect(main.getAttribute("tabindex")).toBe("-1")
	})

	it("<Main ariaLabel='custom'> honors the ariaLabel override", () => {
		render(<Main ariaLabel="Focus ring spec gallery">body</Main>)
		expect(
			screen.getByRole("main", { name: "Focus ring spec gallery" }),
		).toBeTruthy()
	})

	it("<Nav> requires and applies aria-label", () => {
		render(<Nav ariaLabel="Stage progress">n</Nav>)
		expect(
			screen.getByRole("navigation", { name: "Stage progress" }),
		).toBeTruthy()
	})

	it("<Aside> renders as complementary landmark with aria-label", () => {
		render(<Aside ariaLabel="Review sidebar">a</Aside>)
		expect(
			screen.getByRole("complementary", { name: "Review sidebar" }),
		).toBeTruthy()
	})

	it("<FooterBar> renders as contentinfo landmark", () => {
		render(<FooterBar>f</FooterBar>)
		expect(screen.getByRole("contentinfo")).toBeTruthy()
	})

	it("all five primitives forward refs to underlying HTMLElement", () => {
		const headerRef = createRef<HTMLElement>()
		const mainRef = createRef<HTMLElement>()
		const asideRef = createRef<HTMLElement>()
		const navRef = createRef<HTMLElement>()
		const footerRef = createRef<HTMLElement>()
		render(
			<>
				<Header ref={headerRef}>h</Header>
				<Nav ariaLabel="nav" ref={navRef}>
					n
				</Nav>
				<Main ref={mainRef}>m</Main>
				<Aside ariaLabel="a" ref={asideRef}>
					a
				</Aside>
				<FooterBar ref={footerRef}>f</FooterBar>
			</>,
		)
		expect(headerRef.current?.tagName).toBe("HEADER")
		expect(navRef.current?.tagName).toBe("NAV")
		expect(mainRef.current?.tagName).toBe("MAIN")
		expect(asideRef.current?.tagName).toBe("ASIDE")
		expect(footerRef.current?.tagName).toBe("FOOTER")
	})
})
