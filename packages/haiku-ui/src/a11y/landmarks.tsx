/**
 * Landmark primitives — canonical ARIA landmark elements per
 * `stages/design/artifacts/aria-landmark-spec.md §1–§2`.
 *
 * Mapping (capitalized JSX vs lowercase HTML is deliberate — no collision):
 *   <Header>    -> <header role="banner">
 *   <Nav>       -> <nav aria-label={ariaLabel}>
 *   <Main>      -> <main id="main-content" role="main" aria-label={...}>
 *                  id="main-content" is hard-coded (skip-link target, spec §1 row 3).
 *   <Aside>     -> <aside role="complementary" aria-label={ariaLabel}>
 *   <FooterBar> -> <footer role="contentinfo">
 *                  Named FooterBar (not Footer) to leave `Footer` available for a
 *                  future non-landmark footer fragment. Conservative naming.
 *
 * Every primitive forwards its ref to the underlying HTMLElement so downstream
 * units (e.g., skip-link consumers moving focus to <Main>) can call `.focus()`.
 */

import { forwardRef, type HTMLAttributes, type ReactNode } from "react"

// ── <Header> ───────────────────────────────────────────────────────────────

export type HeaderProps = HTMLAttributes<HTMLElement>

export const Header = forwardRef<HTMLElement, HeaderProps>(function Header(
	{ children, ...rest },
	ref,
) {
	return (
		// biome-ignore lint/a11y/noInteractiveElementToNoninteractiveRole: explicit role="banner" per aria-landmark-spec.md §1 row 1 (belt-and-suspenders, IE11 fallback).
		<header {...rest} ref={ref} role="banner">
			{children}
		</header>
	)
})

// ── <Nav> ──────────────────────────────────────────────────────────────────

export interface NavProps
	extends Omit<HTMLAttributes<HTMLElement>, "aria-label"> {
	/** Required accessible name. Typical: "Stage progress". */
	ariaLabel: string
	children?: ReactNode
}

export const Nav = forwardRef<HTMLElement, NavProps>(function Nav(
	{ ariaLabel, children, ...rest },
	ref,
) {
	return (
		<nav {...rest} ref={ref} aria-label={ariaLabel}>
			{children}
		</nav>
	)
})

// ── <Main> ─────────────────────────────────────────────────────────────────

export interface MainProps extends Omit<HTMLAttributes<HTMLElement>, "id"> {
	/**
	 * Optional aria-label override. Default: "Review content" per
	 * aria-landmark-spec.md §1 row 3. Artifact galleries pass their own
	 * (e.g. "Focus ring spec gallery").
	 */
	ariaLabel?: string
}

export const Main = forwardRef<HTMLElement, MainProps>(function Main(
	{ ariaLabel = "Review content", children, ...rest },
	ref,
) {
	return (
		<main
			{...rest}
			ref={ref}
			id="main-content"
			// biome-ignore lint/a11y/noRedundantRoles: explicit role="main" per aria-landmark-spec.md §1 row 3 (IE11 fallback, belt-and-suspenders).
			role="main"
			aria-label={ariaLabel}
			tabIndex={-1}
		>
			{children}
		</main>
	)
})

// ── <Aside> ────────────────────────────────────────────────────────────────

export interface AsideProps
	extends Omit<HTMLAttributes<HTMLElement>, "aria-label"> {
	/** Required accessible name. Typical: "Review sidebar". */
	ariaLabel: string
	children?: ReactNode
}

export const Aside = forwardRef<HTMLElement, AsideProps>(function Aside(
	{ ariaLabel, children, ...rest },
	ref,
) {
	return (
		<aside
			{...rest}
			ref={ref}
			// biome-ignore lint/a11y/noRedundantRoles: explicit role="complementary" per aria-landmark-spec.md §1 row 4 (spec: "MUST NOT be <div>", explicit role clarifies).
			role="complementary"
			aria-label={ariaLabel}
		>
			{children}
		</aside>
	)
})

// ── <FooterBar> ────────────────────────────────────────────────────────────

export type FooterBarProps = HTMLAttributes<HTMLElement>

export const FooterBar = forwardRef<HTMLElement, FooterBarProps>(
	function FooterBar({ children, ...rest }, ref) {
		return (
			<footer {...rest} ref={ref} role="contentinfo">
				{children}
			</footer>
		)
	},
)
