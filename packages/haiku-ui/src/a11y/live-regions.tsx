/**
 * Live-region shell + announce helpers per
 * `stages/design/artifacts/aria-live-sequencing-spec.md §1–§3`.
 *
 * Two regions, mounted once at the app shell via <LiveRegionShell>:
 *   - #feedback-live-polite   role="status" aria-live="polite"  aria-atomic="true"
 *   - #feedback-live-assertive role="alert" aria-live="assertive" aria-atomic="true"
 *
 * Polite: in-flight + success announcements.
 * Assertive: failure + rollback announcements. Separate node so the polite
 * "marking..." text is not overwritten before the reader has finished.
 *
 * announce(severity, message) / useAnnounce() are thin setters. They clear
 * textContent before writing so identical messages still re-announce (AT
 * swallow duplicate textContent writes otherwise — aria-live-sequencing
 * spec §5). Synchronous write; no requestAnimationFrame — keeps tests
 * deterministic (see unit-05 tactical plan risk §7).
 *
 * If the shell is not yet mounted, announce() is a no-op (will not throw).
 */

import { useCallback } from "react"

export type Severity = "polite" | "assertive"

export const POLITE_REGION_ID = "feedback-live-polite"
export const ASSERTIVE_REGION_ID = "feedback-live-assertive"

export interface LiveRegionProps {
	id: string
	politeness: Severity
	className?: string
}

export function LiveRegion({
	id,
	politeness,
	className,
}: LiveRegionProps): React.ReactElement {
	const role = politeness === "polite" ? "status" : "alert"
	return (
		<div
			id={id}
			role={role}
			aria-live={politeness}
			aria-atomic="true"
			className={className ?? "sr-only"}
		/>
	)
}

/**
 * Mounts both canonical live regions. Drop once at the app shell per
 * aria-landmark-spec.md §1 DOM order. No props — single responsibility.
 */
export function LiveRegionShell(): React.ReactElement {
	return (
		<>
			<LiveRegion id={POLITE_REGION_ID} politeness="polite" />
			<LiveRegion id={ASSERTIVE_REGION_ID} politeness="assertive" />
		</>
	)
}

/**
 * Imperative announcement helper. Safe to call outside React (e.g. from
 * fetch resolvers). No-op when the shell is not mounted.
 */
export function announce(severity: Severity, message: string): void {
	if (typeof document === "undefined") return
	const id = severity === "polite" ? POLITE_REGION_ID : ASSERTIVE_REGION_ID
	const el = document.getElementById(id)
	if (!el) return
	// Clear-then-set forces AT to re-announce identical messages.
	el.textContent = ""
	el.textContent = message
}

/**
 * Hook variant that returns a stable memoized reference to announce().
 * Prefer calling announce() directly in non-render contexts; use this hook
 * inside components where you want a stable callback identity.
 */
export function useAnnounce(): (severity: Severity, message: string) => void {
	return useCallback((severity: Severity, message: string) => {
		announce(severity, message)
	}, [])
}
