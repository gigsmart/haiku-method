/**
 * Load the canonical `.touch-target` CSS from the real `packages/haiku-ui/src/index.css`
 * and inject it into the test document.
 *
 * Rationale (FB-40): jsdom does not apply CSS from external imports, only from
 * `<style>` tags present in the document. Previously, tests hand-mirrored the
 * `.touch-target` rule into a `<style>` tag, which meant the assertion
 * "min-height resolves to 44px" was really asserting "jsdom's CSS resolver
 * works" — a regression in `index.css` (e.g. rule deleted, value changed to
 * `1px`) would not break these tests.
 *
 * This helper closes the loop by:
 *
 * 1. Reading the actual `src/index.css` via `readFileSync` at test time.
 * 2. Extracting the `.touch-target { ... }` and
 *    `.touch-target.touch-target--hit-area { ... }` rule bodies from the file.
 * 3. Injecting those real rule bodies into the jsdom document.
 * 4. Exposing the parsed rule map so callers can also assert pure
 *    token-value properties (e.g. "min-height must be 44px in the shipped
 *    CSS") without any layout-engine dependency at all.
 *
 * Consumers MUST treat the returned CSS as authoritative: if `index.css`
 * is edited in a way that breaks the WCAG 2.5.5 contract (e.g. shrinks
 * min-height below 44px, removes the rule, renames the selector), the
 * tests using this helper will fail — that is the point.
 */

import { readFileSync } from "node:fs"
import { join } from "node:path"

/**
 * Absolute path to the canonical index.css. Derived from `__dirname`
 * (`packages/haiku-ui/src/a11y/__tests__`) → four levels up to the
 * package root, then into `src/index.css`.
 */
const INDEX_CSS_PATH = join(__dirname, "..", "..", "index.css")

/** Cached file read — the CSS file doesn't change during a test run. */
let cachedIndexCss: string | null = null

/** Read (and cache) the canonical index.css file contents. */
export function readCanonicalIndexCss(): string {
	if (cachedIndexCss === null) {
		cachedIndexCss = readFileSync(INDEX_CSS_PATH, "utf-8")
	}
	return cachedIndexCss
}

/**
 * Extract the body of a single top-level CSS rule matching `selector` from the
 * given CSS source. Matches the first `<selector> { ... }` occurrence at brace
 * depth 0 (i.e. not nested inside an at-rule like `@media`). Returns the
 * declarations block (without the outer braces).
 *
 * Throws if the selector is not found — this is intentional. A missing rule
 * is a regression that tests must surface loudly.
 */
export function extractCssRuleBody(css: string, selector: string): string {
	// Walk the source, tracking brace depth. When we are at depth 0 and see
	// the selector followed by `{`, capture until the matching `}`.
	const needle = `${selector}`
	let depth = 0
	let i = 0
	while (i < css.length) {
		const ch = css[i]
		if (ch === "{") {
			depth++
			i++
			continue
		}
		if (ch === "}") {
			depth--
			i++
			continue
		}
		if (depth === 0 && css.startsWith(needle, i)) {
			// Make sure this is a full selector match, not a substring —
			// the char before must be start-of-file or whitespace/newline/`}`,
			// and the char after the needle must be whitespace or `{`.
			const before = i === 0 ? "" : css[i - 1]
			const after = css[i + needle.length]
			const boundaryBefore =
				i === 0 ||
				before === "\n" ||
				before === "\r" ||
				before === "\t" ||
				before === " " ||
				before === "}"
			const boundaryAfter =
				after === " " || after === "\t" || after === "\n" || after === "{"
			if (boundaryBefore && boundaryAfter) {
				// Skip past selector + whitespace, expect `{`.
				let j = i + needle.length
				while (j < css.length && css[j] !== "{") j++
				if (css[j] !== "{") {
					throw new Error(
						`extractCssRuleBody: found selector "${selector}" but no opening brace followed`,
					)
				}
				// Capture until matching `}`.
				const bodyStart = j + 1
				let localDepth = 1
				let k = bodyStart
				while (k < css.length && localDepth > 0) {
					if (css[k] === "{") localDepth++
					else if (css[k] === "}") localDepth--
					if (localDepth === 0) break
					k++
				}
				if (localDepth !== 0) {
					throw new Error(
						`extractCssRuleBody: unterminated rule body for selector "${selector}"`,
					)
				}
				return css.slice(bodyStart, k)
			}
		}
		i++
	}
	throw new Error(
		`extractCssRuleBody: selector "${selector}" not found in CSS source`,
	)
}

/**
 * Parse a rule body (declarations block, no braces) into a
 * property → value map. Ignores comments and empty declarations. Values
 * are trimmed. Duplicate properties keep the last value (matches cascade).
 */
export function parseDeclarations(body: string): Record<string, string> {
	// Strip /* ... */ comments.
	const stripped = body.replace(/\/\*[\s\S]*?\*\//g, "")
	const out: Record<string, string> = {}
	for (const decl of stripped.split(";")) {
		const trimmed = decl.trim()
		if (!trimmed) continue
		const colon = trimmed.indexOf(":")
		if (colon < 0) continue
		const prop = trimmed.slice(0, colon).trim()
		const value = trimmed.slice(colon + 1).trim()
		if (prop) out[prop] = value
	}
	return out
}

export interface TouchTargetCanonicalRules {
	/** Full raw CSS string to inject into a `<style>` tag for layout resolution. */
	cssText: string
	/** Declarations for `.touch-target` parsed from index.css. */
	touchTarget: Record<string, string>
	/** Declarations for `.touch-target.touch-target--hit-area`. */
	touchTargetHitArea: Record<string, string>
}

/**
 * Load the canonical `.touch-target` rules from `src/index.css` and return
 * both the raw CSS text (for injection) and parsed declarations (for pure
 * token-value assertions). Exposes the original rule bodies verbatim — no
 * hand-mirroring, no defaults.
 */
export function loadCanonicalTouchTargetRules(): TouchTargetCanonicalRules {
	const css = readCanonicalIndexCss()
	const touchTargetBody = extractCssRuleBody(css, ".touch-target")
	const hitAreaBody = extractCssRuleBody(
		css,
		".touch-target.touch-target--hit-area",
	)
	// We reconstruct the CSS text from the extracted rule bodies so the
	// injected CSS is exactly what the production stylesheet ships —
	// selectors and declarations both pulled from the real file.
	const cssText = [
		`.touch-target {${touchTargetBody}}`,
		`.touch-target.touch-target--hit-area {${hitAreaBody}}`,
	].join("\n")
	return {
		cssText,
		touchTarget: parseDeclarations(touchTargetBody),
		touchTargetHitArea: parseDeclarations(hitAreaBody),
	}
}

/**
 * Inject the canonical `.touch-target` rules loaded from `index.css` into the
 * current jsdom document so `getComputedStyle` resolves `min-height` and
 * `min-width` against the real shipped CSS — not a hand-mirrored copy.
 *
 * Returns the parsed rule map so the caller can also run pure
 * token-value assertions against the real source file.
 */
export function injectCanonicalTouchTargetCss(
	testId = "touch-target-css",
): TouchTargetCanonicalRules {
	const rules = loadCanonicalTouchTargetRules()
	const style = document.createElement("style")
	style.setAttribute("data-test-id", testId)
	style.textContent = rules.cssText
	document.head.appendChild(style)
	return rules
}
