/**
 * Canonical app header — wraps the unit-05 landmark primitive with the
 * review-app's chrome styling and composes brand title, optional
 * active-intent breadcrumb, optional keyboard-shortcut help trigger, and
 * the `<ThemeToggle>`.
 *
 * Scope (unit-06):
 *   - `title`    — always rendered; per-page supplies the string.
 *   - `breadcrumb`, `helpTrigger` — reserved slots; downstream units (stage
 *     progress strip composition, shortcut help modal) fill them. Rendering
 *     is a pass-through when `undefined`.
 *
 * Source of truth:
 *   - Unit-06 scope: "Header.tsx — canonical app header; brand, active-intent
 *     breadcrumb, theme toggle, keyboard-shortcut-help trigger."
 *   - `aria-landmark-spec.md §1 row 1` — the underlying <header role="banner">.
 */

import { Header as HeaderLandmark } from "../a11y"
import { ThemeToggle } from "./ThemeToggle"

export interface HeaderProps {
	title: React.ReactNode
	breadcrumb?: React.ReactNode
	helpTrigger?: React.ReactNode
	className?: string
}

export function Header({
	title,
	breadcrumb,
	helpTrigger,
	className,
}: HeaderProps): React.ReactElement {
	return (
		<HeaderLandmark
			className={
				className ??
				"sticky top-0 z-40 bg-white/80 dark:bg-stone-900/80 backdrop-blur border-b border-stone-200 dark:border-stone-800"
			}
		>
			<div className="max-w-[var(--content-max)] mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center gap-3 justify-between">
				<div className="flex items-center gap-3 min-w-0">
					<h1 className="text-lg font-semibold truncate">{title}</h1>
					{breadcrumb ? (
						<div className="min-w-0 flex items-center gap-2">{breadcrumb}</div>
					) : null}
				</div>
				<div className="flex items-center gap-2 shrink-0">
					{helpTrigger}
					<ThemeToggle />
				</div>
			</div>
		</HeaderLandmark>
	)
}
