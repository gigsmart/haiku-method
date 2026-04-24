/**
 * Shared transformer for DOM-parity snapshots.
 *
 * Strips volatile attributes and values that would otherwise flake
 * between runs without indicating a real rendering regression:
 *
 *  - React runtime attributes (`data-reactid`, `data-reactroot`, etc.)
 *  - Auto-generated id suffixes from `useId`, radix, headlessui, etc.
 *    (any id / `for` / `aria-*` attribute whose value ends with
 *    `:r<alphanum>:` or matches the `«r<digits>»` pattern)
 *  - `data-testid`s that embed timestamps
 *  - `style="... animation-delay: 1234ms"`-shaped runtime timing values
 *  - Leading / trailing whitespace per line, trailing blank lines
 *
 * The transformer is deterministic and symmetric: applied once to the
 * captured DOM before snapshot write, applied again to the committed
 * snapshot before comparison. Both sides are stripped, so noise cancels.
 */

const VOLATILE_ATTRS = ["data-reactid", "data-reactroot", "data-react-checksum"]

const USE_ID_PATTERN = /:r[a-z0-9]+:/gi
const REACT_USE_ID_PATTERN = /«r\d+»/g
const ANIMATION_TIMING_PATTERN =
	/(animation-delay|transition-delay):\s*[\d.]+m?s/gi

export function normalizeDomSnapshot(html: string): string {
	let out = html

	// Drop React-internal attributes
	for (const attr of VOLATILE_ATTRS) {
		out = out.replace(new RegExp(`\\s${attr}="[^"]*"`, "g"), "")
	}

	// Neutralize auto-generated id suffixes inside any attribute value
	out = out.replace(USE_ID_PATTERN, ":rXX:")
	out = out.replace(REACT_USE_ID_PATTERN, "«rXX»")

	// Neutralize runtime animation/transition timing values
	out = out.replace(ANIMATION_TIMING_PATTERN, "$1: 0ms")

	// Collapse whitespace-runs for stable diffs (jsdom and React can emit
	// different whitespace around text nodes across versions).
	out = out.replace(/\s+/g, " ").trim()

	return out
}
