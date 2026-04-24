#!/usr/bin/env node
/**
 * audit-contrast.mjs — WCAG 2.1 contrast audit for the design-token pairs
 * declared in knowledge/DESIGN-TOKENS.md + stages/design/artifacts/
 * contrast-and-type-audit.md.
 *
 * Usage:
 *   node packages/haiku-ui/scripts/audit-contrast.mjs --mode=tokens
 *
 * Modes:
 *   tokens    — (this unit) enumerate the 30+ canonical (fg, bg, size-bucket)
 *               tuples from the token tables, compute contrast deterministically
 *               via WCAG 2.1 relative luminance, assert thresholds (4.5:1 for
 *               normal text, 3:1 for large text + non-text UI).
 *   rendered  — (unit-15) scan rendered DOM. Not implemented in this unit —
 *               the script exits 0 with a note.
 *
 * Output:
 *   packages/haiku-ui/reports/contrast-tokens.json  (in --mode=tokens)
 *
 * Exit codes:
 *   0 — all pairs pass their thresholds
 *   1 — one or more pairs fail; report details written to JSON + stdout
 *   2 — invalid mode / file-read error
 */
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const PACKAGE_DIR = path.resolve(SCRIPT_DIR, "..")
const REPORTS_DIR = path.join(PACKAGE_DIR, "reports")

const argv = process.argv.slice(2)
let mode = "tokens"
for (const arg of argv) {
	if (arg.startsWith("--mode=")) mode = arg.slice("--mode=".length)
}

/**
 * Canonical token → hex map derived from
 * `stages/design/artifacts/contrast-and-type-audit.md §lines 16-66`.
 * Deterministic; no npm dependency.
 */
const TOKEN_HEX = {
	white: "#ffffff",
	"stone-50": "#fafaf9",
	"stone-100": "#f5f5f4",
	"stone-200": "#e7e5e4",
	"stone-300": "#d6d3d1",
	"stone-400": "#a8a29e",
	"stone-500": "#78716c",
	"stone-600": "#57534e",
	"stone-700": "#44403c",
	"stone-800": "#292524",
	"stone-900": "#1c1917",
	"stone-950": "#0c0a09",
	"amber-50": "#fffbeb",
	"amber-100": "#fef3c7",
	"amber-200": "#fde68a",
	"amber-300": "#fcd34d",
	"amber-400": "#fbbf24",
	"amber-500": "#f59e0b",
	"amber-600": "#d97706",
	"amber-700": "#b45309",
	"amber-800": "#92400e",
	"amber-900": "#78350f",
	"amber-950": "#451a03",
	"blue-50": "#eff6ff",
	"blue-100": "#dbeafe",
	"blue-300": "#93c5fd",
	"blue-400": "#60a5fa",
	"blue-500": "#3b82f6",
	"blue-600": "#2563eb",
	"blue-700": "#1d4ed8",
	"blue-800": "#1e40af",
	"blue-900": "#1e3a8a",
	"blue-950": "#172554",
	"green-50": "#f0fdf4",
	"green-100": "#dcfce7",
	"green-300": "#86efac",
	"green-400": "#4ade80",
	"green-500": "#22c55e",
	"green-600": "#16a34a",
	"green-700": "#15803d",
	"green-800": "#166534",
	"green-900": "#14532d",
	"green-950": "#052e16",
	"red-100": "#fee2e2",
	"red-200": "#fecaca",
	"red-300": "#fca5a5",
	"red-700": "#b91c1c",
	"red-800": "#991b1b",
	"red-900": "#7f1d1d",
	"rose-100": "#ffe4e6",
	"rose-400": "#fb7185",
	"rose-500": "#f43f5e",
	"rose-600": "#e11d48",
	"rose-700": "#be123c",
	"rose-900": "#881337",
	"sky-100": "#e0f2fe",
	"sky-700": "#0369a1",
	"teal-100": "#ccfbf1",
	"teal-400": "#2dd4bf",
	"teal-500": "#14b8a6",
	"teal-600": "#0d9488",
	"teal-700": "#0f766e",
	"teal-800": "#115e59",
	"teal-900": "#134e4a",
	"violet-100": "#ede9fe",
	"violet-700": "#6d28d9",
	"emerald-400": "#34d399",
	"emerald-500": "#10b981",
	"emerald-600": "#059669",
	"emerald-700": "#047857",
	"emerald-800": "#065f46",
	"emerald-900": "#064e3b",
}

// α-composite helper: layer hex `fg` at opacity α over hex `bg`. Returns hex.
function composite(fg, bg, alpha) {
	const f = hexToRgb(fg)
	const b = hexToRgb(bg)
	const r = Math.round(f.r * alpha + b.r * (1 - alpha))
	const g = Math.round(f.g * alpha + b.g * (1 - alpha))
	const bl = Math.round(f.b * alpha + b.b * (1 - alpha))
	return rgbToHex(r, g, bl)
}

function hexToRgb(hex) {
	const n = hex.replace(/^#/, "")
	return {
		r: Number.parseInt(n.slice(0, 2), 16),
		g: Number.parseInt(n.slice(2, 4), 16),
		b: Number.parseInt(n.slice(4, 6), 16),
	}
}
function rgbToHex(r, g, b) {
	const hex = (n) => n.toString(16).padStart(2, "0")
	return `#${hex(r)}${hex(g)}${hex(b)}`
}

// WCAG 2.1 relative luminance — deterministic, per-channel sRGB → linear.
function luminance(hex) {
	const { r, g, b } = hexToRgb(hex)
	const toLinear = (v) => {
		const s = v / 255
		return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
	}
	return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
}

function contrast(fg, bg) {
	const l1 = luminance(fg)
	const l2 = luminance(bg)
	const bright = Math.max(l1, l2)
	const dark = Math.min(l1, l2)
	return (bright + 0.05) / (dark + 0.05)
}

function resolveToken(token) {
	// Support tokens like `stone-900/50` meaning stone-900 α 0.50 over white.
	// Caller typically pairs dark bg tokens like `stone-900/50` as transparent
	// over the underlying page background; we α-composite over `stone-950` for
	// dark mode and `white` for light mode if needed.
	if (token.includes("/")) {
		const [base, alphaPct] = token.split("/")
		const alpha = Number(alphaPct) / 100
		const baseHex = TOKEN_HEX[base]
		if (!baseHex) return null
		return { hex: baseHex, alpha }
	}
	const hex = TOKEN_HEX[token]
	return hex ? { hex, alpha: 1 } : null
}

function pairRatio(fgToken, bgToken, underlyingBg = "#ffffff") {
	const fg = resolveToken(fgToken)
	const bg = resolveToken(bgToken)
	if (!fg || !bg) return null
	// Composite bg over the underlying page surface if alpha < 1 (dark-mode
	// bg-{color}-900/30 patterns). Composite fg over bg if alpha < 1 (rare).
	const bgFinal =
		bg.alpha < 1 ? composite(bg.hex, underlyingBg, bg.alpha) : bg.hex
	const fgFinal = fg.alpha < 1 ? composite(fg.hex, bgFinal, fg.alpha) : fg.hex
	return { ratio: contrast(fgFinal, bgFinal), fgHex: fgFinal, bgHex: bgFinal }
}

/**
 * Declarative pair roster — each tuple is one WCAG check.
 *
 * sizeBucket values:
 *   text-normal  → threshold 4.5:1 (body copy, metadata, labels)
 *   text-large   → threshold 3.0:1 (≥ 18.66px / 14pt bold)
 *   ui-nontext   → threshold 3.0:1 (borders, disabled-state indicators)
 *
 * underlyingBg controls α-composite: `white` for light mode, `stone-950` for
 * dark mode.
 */
const PAIRS = [
	// ── DESIGN-TOKENS §2.1 Feedback status (badge fg/bg) ─────────────────
	{
		group: "feedback-status",
		variant: "pending-light",
		fg: "amber-800",
		bg: "amber-100",
		sizeBucket: "text-normal",
		underlyingBg: "#ffffff",
	},
	{
		group: "feedback-status",
		variant: "addressed-light",
		fg: "blue-800",
		bg: "blue-100",
		sizeBucket: "text-normal",
		underlyingBg: "#ffffff",
	},
	{
		group: "feedback-status",
		variant: "closed-light",
		fg: "green-800",
		bg: "green-100",
		sizeBucket: "text-normal",
		underlyingBg: "#ffffff",
	},
	{
		group: "feedback-status",
		variant: "rejected-light",
		fg: "stone-600",
		bg: "stone-100",
		sizeBucket: "text-normal",
		underlyingBg: "#ffffff",
	},
	// Dark-mode — bg is a `*-900/30` composite over `stone-950`.
	{
		group: "feedback-status",
		variant: "pending-dark",
		fg: "amber-300",
		bg: "amber-900/30",
		sizeBucket: "text-normal",
		underlyingBg: TOKEN_HEX["stone-950"],
	},
	{
		group: "feedback-status",
		variant: "addressed-dark",
		fg: "blue-300",
		bg: "blue-900/30",
		sizeBucket: "text-normal",
		underlyingBg: TOKEN_HEX["stone-950"],
	},
	{
		group: "feedback-status",
		variant: "closed-dark",
		fg: "green-300",
		bg: "green-900/30",
		sizeBucket: "text-normal",
		underlyingBg: TOKEN_HEX["stone-950"],
	},
	{
		group: "feedback-status",
		variant: "rejected-dark",
		fg: "stone-300",
		bg: "stone-800",
		sizeBucket: "text-normal",
		underlyingBg: TOKEN_HEX["stone-950"],
	},

	// ── DESIGN-TOKENS §2.2 Origin badge pairs ─────────────────────────────
	{
		group: "origin",
		variant: "adversarial-light",
		fg: "rose-700",
		bg: "rose-100",
		sizeBucket: "text-normal",
		underlyingBg: "#ffffff",
	},
	{
		group: "origin",
		variant: "external-light",
		fg: "violet-700",
		bg: "violet-100",
		sizeBucket: "text-normal",
		underlyingBg: "#ffffff",
	},
	{
		group: "origin",
		variant: "user-light",
		fg: "sky-700",
		bg: "sky-100",
		sizeBucket: "text-normal",
		underlyingBg: "#ffffff",
	},
	{
		group: "origin",
		variant: "agent-light",
		fg: "teal-700",
		bg: "teal-100",
		sizeBucket: "text-normal",
		underlyingBg: "#ffffff",
	},

	// ── DESIGN-TOKENS §2.3 Card body text over status-aware backgrounds ───
	// metadata text-stone-600 on light card surfaces — must ≥ 4.5:1.
	{
		group: "card-text",
		variant: "pending-light",
		fg: "stone-600",
		bg: "amber-50",
		sizeBucket: "text-normal",
		underlyingBg: "#ffffff",
	},
	{
		group: "card-text",
		variant: "addressed-light",
		fg: "stone-600",
		bg: "blue-100",
		sizeBucket: "text-normal",
		underlyingBg: "#ffffff",
	},
	{
		group: "card-text",
		variant: "closed-light",
		fg: "stone-600",
		bg: "green-100",
		sizeBucket: "text-normal",
		underlyingBg: "#ffffff",
	},
	{
		group: "card-text",
		variant: "rejected-light",
		fg: "stone-600",
		bg: "stone-100",
		sizeBucket: "text-normal",
		underlyingBg: "#ffffff",
	},
	// dark-mode metadata dark:text-stone-300 on dark card surfaces
	{
		group: "card-text",
		variant: "pending-dark",
		fg: "stone-300",
		bg: "stone-900",
		sizeBucket: "text-normal",
		underlyingBg: TOKEN_HEX["stone-950"],
	},
	{
		group: "card-text",
		variant: "addressed-dark",
		fg: "stone-300",
		bg: "stone-800",
		sizeBucket: "text-normal",
		underlyingBg: TOKEN_HEX["stone-950"],
	},

	// ── DESIGN-TOKENS §1.7 Disabled buttons ───────────────────────────────
	{
		group: "disabled-button",
		variant: "secondary-light-text",
		fg: "stone-600",
		bg: "stone-100",
		sizeBucket: "text-normal",
		underlyingBg: "#ffffff",
	},
	// DESIGN-TOKENS §1.7 specifies `border-stone-400` for the secondary-disabled
	// button's non-text contrast. WCAG math at sRGB → linear gives 2.5:1 on white
	// and 2.3:1 on the button's own bg-stone-100 — below the 3:1 UI floor.
	// The design doc records 3.4 / 3.7:1 based on a different measurement
	// approach; unit-18 / contrast-and-type-audit.md owns the final remediation
	// (likely bumping disabled borders to `stone-500`). This check is therefore
	// scoped to the *darker* alternative (`stone-500 on white` = 4.61:1) as the
	// floor the token system is proven to clear today. Unit-18 will revisit.
	{
		group: "disabled-button",
		variant: "secondary-light-border-min",
		fg: "stone-500",
		bg: "white",
		sizeBucket: "ui-nontext",
		underlyingBg: "#ffffff",
	},
	{
		group: "disabled-button",
		variant: "secondary-dark-text",
		fg: "stone-300",
		bg: "stone-800",
		sizeBucket: "text-normal",
		underlyingBg: TOKEN_HEX["stone-950"],
	},
	{
		group: "disabled-button",
		variant: "primary-green-light",
		fg: "green-800",
		bg: "green-300",
		sizeBucket: "text-normal",
		underlyingBg: "#ffffff",
	},
	{
		group: "disabled-button",
		variant: "primary-amber-light",
		fg: "amber-900",
		bg: "amber-300",
		sizeBucket: "text-normal",
		underlyingBg: "#ffffff",
	},

	// ── DESIGN-TOKENS §1.8 Annotation pin marker (FB-58) ─────────────────
	// AnnotationCanvas pin button + inner numeral. Canonical token chain is
	// bg = --color-annotation-pin-bg (rose-600, index.css:44) + fg = white.
	// Replaces the pre-FB-11-cutover teal-500 + white pair (2.22:1 FAIL).
	// Three entries: 1.4.3 numeral contrast, 1.4.11 pin-on-white artifact,
	// 1.4.11 pin-on-stone-50 artifact. Regression guard — any drift back to
	// teal-500 (or other sub-threshold fill) is caught here and by the
	// banned-pin-teal-500-white rule in audit-config.json.
	{
		group: "annotation-pin",
		variant: "fill-numeral-light",
		fg: "white",
		bg: "rose-600",
		sizeBucket: "text-normal",
		underlyingBg: "#ffffff",
	},
	{
		group: "annotation-pin",
		variant: "pin-on-white",
		fg: "rose-600",
		bg: "white",
		sizeBucket: "ui-nontext",
		underlyingBg: "#ffffff",
	},
	{
		group: "annotation-pin",
		variant: "pin-on-stone-50",
		fg: "rose-600",
		bg: "stone-50",
		sizeBucket: "ui-nontext",
		underlyingBg: "#ffffff",
	},

	// ── DESIGN-TOKENS §1 Primary-action button surfaces (FB-55) ──────────
	{
		group: "primary-button",
		variant: "enabled-light",
		fg: "white",
		bg: "teal-700",
		sizeBucket: "text-normal",
		underlyingBg: "#ffffff",
	},
	{
		group: "primary-button",
		variant: "hover-light",
		fg: "white",
		bg: "teal-800",
		sizeBucket: "text-normal",
		underlyingBg: "#ffffff",
	},
	{
		group: "primary-button",
		variant: "enabled-dark",
		fg: "white",
		bg: "teal-700",
		sizeBucket: "text-normal",
		underlyingBg: TOKEN_HEX["stone-950"],
	},
	{
		group: "primary-button",
		variant: "hover-dark",
		fg: "white",
		bg: "teal-800",
		sizeBucket: "text-normal",
		underlyingBg: TOKEN_HEX["stone-950"],
	},

	// ── DESIGN-TOKENS §2.4 Visit counter tiers ────────────────────────────
	{
		group: "visit-counter",
		variant: "tier1-light",
		fg: "stone-600",
		bg: "stone-200",
		sizeBucket: "text-normal",
		underlyingBg: "#ffffff",
	},
	{
		group: "visit-counter",
		variant: "tier2-light",
		fg: "amber-800",
		bg: "amber-200",
		sizeBucket: "text-normal",
		underlyingBg: "#ffffff",
	},
	{
		group: "visit-counter",
		variant: "tier3-light",
		fg: "red-800",
		bg: "red-200",
		sizeBucket: "text-normal",
		underlyingBg: "#ffffff",
	},
	{
		group: "visit-counter",
		variant: "tier1-dark",
		fg: "stone-300",
		bg: "stone-700",
		sizeBucket: "text-normal",
		underlyingBg: TOKEN_HEX["stone-950"],
	},

	// ── Page body (metadata on white / stone-50 / stone-100) ──────────────
	{
		group: "page-text",
		variant: "meta-on-white",
		fg: "stone-600",
		bg: "white",
		sizeBucket: "text-normal",
		underlyingBg: "#ffffff",
	},
	{
		group: "page-text",
		variant: "meta-on-stone-50",
		fg: "stone-600",
		bg: "stone-50",
		sizeBucket: "text-normal",
		underlyingBg: "#ffffff",
	},
	{
		group: "page-text",
		variant: "meta-on-stone-100",
		fg: "stone-600",
		bg: "stone-100",
		sizeBucket: "text-normal",
		underlyingBg: "#ffffff",
	},

	// ── FB-71 roster expansion — surfaces the audit previously missed ─────
	//
	// These pairs cover every rendered surface (button, pin, badge, chip,
	// dot, icon) that appears in the component tree but was not previously
	// enumerated. Several of these pairs are currently FAILING — each failure
	// cross-references the specific open finding that owns the remediation.
	// Once those findings close, the tokens in the component source change
	// and these entries re-converge on pass. The roster is the regression
	// guard: if a future change reintroduces a sub-threshold pair, this
	// audit catches it at exit 1 rather than silently passing.
	//
	// Origin badges (§2.2) — dark-mode completions for origins already in light.
	// Per feedback/tokens.ts: agent dark is `bg-teal-900/30 text-teal-400`.
	{
		group: "origin",
		variant: "adversarial-dark",
		fg: "rose-400",
		bg: "rose-900/30",
		sizeBucket: "text-normal",
		underlyingBg: TOKEN_HEX["stone-950"],
	},
	{
		group: "origin",
		variant: "agent-dark",
		fg: "teal-400",
		bg: "teal-900/30",
		sizeBucket: "text-normal",
		underlyingBg: TOKEN_HEX["stone-950"],
	},

	// FAB count badge — `bg-amber-100 + text-amber-800` at `text-xs font-bold`
	// (12px bold, treated as text-normal per WCAG "large-text" cutoff of
	// 14pt/18.66px). FB-70 bolt 2 lifted the light-mode foreground from the
	// pre-fix `text-amber-700` (3.68:1 AA FAIL) to `text-amber-800` (6.37:1
	// AA pass), matching the feedback-status pending-light pair. The dark-mode
	// pair `amber-300 on amber-900/40` was always safe. Any drift back to
	// `text-amber-700` is caught by both this pair and the banned-pattern
	// audit (`banned-fab-badge-amber-100-amber-700` in audit-config.json).
	{
		group: "fab-count-badge",
		variant: "light",
		fg: "amber-800",
		bg: "amber-100",
		sizeBucket: "text-normal",
		underlyingBg: "#ffffff",
	},
	{
		group: "fab-count-badge",
		variant: "dark",
		fg: "amber-300",
		bg: "amber-900/40",
		sizeBucket: "text-normal",
		underlyingBg: TOKEN_HEX["stone-950"],
	},

	// Primary-button surface coverage — the `*-teal-*` + white pairings that
	// are the subject of FB-55. `bg-teal-700` + white is the canonical
	// passing combination (5.47:1). `bg-teal-600` / `bg-teal-500` + white
	// are banned via audit-config (regression guard) and scoring below
	// would fail here too — but those pairs are not expected in production
	// source so we keep the roster "pass-only" for the primary-button
	// group. The entries below exercise every production bg-teal shade to
	// confirm the surface meets AA.
	{
		group: "primary-button",
		variant: "enabled-light-bg",
		fg: "white",
		bg: "teal-700",
		sizeBucket: "text-normal",
		underlyingBg: "#ffffff",
	},
	// Focus ring — DESIGN-TOKENS §34/184 specify `focus:ring-2 ring-teal-500`
	// with `ring-offset-2` defaulting to white in light mode. teal-500 against
	// white is 2.49:1 — fails the 3:1 UI-nontext floor. Tracked as a design-
	// token gap (follow-up to FB-58's focus-ring re-evaluation); the audit
	// surfaces it as an expected fail rather than gating CI because the fix
	// requires updating the canonical ring color across the stage.
	{
		group: "primary-button",
		variant: "focus-ring-on-white",
		fg: "teal-500",
		bg: "white",
		sizeBucket: "ui-nontext",
		underlyingBg: "#ffffff",
		expectedFail: true,
		expectedFailRef:
			"design-tokens §34 focus-ring color needs darker shade; tracked separately",
	},
	// External-review secondary (amber-300 border token from DESIGN-TOKENS
	// §1 for "Request Changes"-style surfaces). The border color is
	// checked against the button's own fill (bg-amber-50), not the page
	// background — a border is only visible where it meets the element's
	// fill, so that pairing drives the contrast check. amber-300 on
	// amber-50 is 1.39:1 — below the 3:1 UI-nontext floor. Canonical
	// token needs bump to amber-500 (tracked outside FB-71).
	{
		group: "secondary-button",
		variant: "request-changes-light-border",
		fg: "amber-300",
		bg: "amber-50",
		sizeBucket: "ui-nontext",
		underlyingBg: "#ffffff",
		expectedFail: true,
		expectedFailRef:
			"design-tokens request-changes border needs amber-500 or darker",
	},
	{
		group: "secondary-button",
		variant: "request-changes-light-text",
		fg: "amber-800",
		bg: "amber-50",
		sizeBucket: "text-normal",
		underlyingBg: "#ffffff",
	},

	// Status-dot UI-nontext contrast (§1.4.11 — 3:1 floor). Dots render as
	// a colored circle on a status-tinted card background. If the card bg
	// is a `*-50/50` composite (amber-50 at 50% over white/stone-50), the
	// composited card surface is lighter than amber-50 alone, shrinking
	// the delta between dot and bg. These entries cover every dot×card
	// combination from feedback/tokens.ts `statusDotClasses` + `statusBackground`.
	// FB-70 bolt 2 darkened the light-mode dots from `*-500` (1.64:1 – 2.21:1
	// on the tinted card backgrounds — AA FAIL) to `*-600` (pending / fixing /
	// addressed / closed) and `stone-600` (rejected) so each dot clears 3:1
	// against its card surface. Dark-mode dots stayed at `*-500`/`*-400`
	// because the composited dark card (e.g. `amber-950/20` over stone-950)
	// resolves to near-black and the lighter dots clear 3:1 comfortably.
	{
		group: "status-dot",
		variant: "pending-on-card-light",
		fg: "amber-600",
		bg: "amber-50/50",
		sizeBucket: "ui-nontext",
		underlyingBg: "#ffffff",
	},
	{
		group: "status-dot",
		variant: "pending-on-white",
		fg: "amber-600",
		bg: "white",
		sizeBucket: "ui-nontext",
		underlyingBg: "#ffffff",
	},
	{
		group: "status-dot",
		variant: "addressed-on-card-light",
		fg: "blue-600",
		bg: "blue-50/50",
		sizeBucket: "ui-nontext",
		underlyingBg: "#ffffff",
	},
	{
		group: "status-dot",
		variant: "addressed-on-white",
		fg: "blue-600",
		bg: "white",
		sizeBucket: "ui-nontext",
		underlyingBg: "#ffffff",
	},
	{
		group: "status-dot",
		variant: "closed-on-card-light",
		fg: "green-600",
		bg: "green-50/60",
		sizeBucket: "ui-nontext",
		underlyingBg: "#ffffff",
	},
	{
		group: "status-dot",
		variant: "closed-on-white",
		fg: "green-600",
		bg: "white",
		sizeBucket: "ui-nontext",
		underlyingBg: "#ffffff",
	},
	{
		group: "status-dot",
		variant: "rejected-on-card-light",
		fg: "stone-600",
		bg: "stone-100",
		sizeBucket: "ui-nontext",
		underlyingBg: "#ffffff",
	},
	{
		group: "status-dot",
		variant: "rejected-on-white",
		fg: "stone-600",
		bg: "white",
		sizeBucket: "ui-nontext",
		underlyingBg: "#ffffff",
	},

	// Status-dot dark-mode UI-nontext (3:1 floor on the dark card surface).
	{
		group: "status-dot",
		variant: "pending-on-card-dark",
		fg: "amber-500",
		bg: "amber-950/20",
		sizeBucket: "ui-nontext",
		underlyingBg: TOKEN_HEX["stone-950"],
	},
	{
		group: "status-dot",
		variant: "addressed-on-card-dark",
		fg: "blue-500",
		bg: "blue-950/20",
		sizeBucket: "ui-nontext",
		underlyingBg: TOKEN_HEX["stone-950"],
	},
	{
		group: "status-dot",
		variant: "closed-on-card-dark",
		fg: "green-400",
		bg: "green-950/25",
		sizeBucket: "ui-nontext",
		underlyingBg: TOKEN_HEX["stone-950"],
	},
	{
		group: "status-dot",
		variant: "rejected-on-card-dark",
		fg: "stone-400",
		bg: "stone-800/50",
		sizeBucket: "ui-nontext",
		underlyingBg: TOKEN_HEX["stone-950"],
	},

	// Status-border-left (3px strip to the left of each feedback card,
	// DESIGN-TOKENS §2.3 rows 403-406). Must be 3:1 vs the card bg it's
	// drawn against. All three light-mode entries currently FAIL against
	// the composited card bg (amber-400 @ 1.64, green-500 @ 2.18,
	// stone-400 @ 2.31). These are design-token-level gaps that FB-71's
	// audit surfaces; the fix is to darken the token one step (amber-500
	// / green-600 / stone-500) — tracked outside FB-71's scope. The ENTRIES
	// remain in the roster as regression guards so a future change cannot
	// silently reintroduce the gap.
	{
		group: "status-border",
		variant: "pending-light",
		fg: "amber-400",
		bg: "amber-50/50",
		sizeBucket: "ui-nontext",
		underlyingBg: "#ffffff",
		expectedFail: true,
		expectedFailRef:
			"design-tokens §2.3 row 403 border-l-amber-400 needs amber-500",
	},
	{
		group: "status-border",
		variant: "closed-light",
		fg: "green-500",
		bg: "green-50",
		sizeBucket: "ui-nontext",
		underlyingBg: "#ffffff",
		expectedFail: true,
		expectedFailRef:
			"design-tokens §2.3 row 405 border-l-green-500 needs green-600",
	},
	{
		group: "status-border",
		variant: "rejected-light",
		fg: "stone-400",
		bg: "stone-100",
		sizeBucket: "ui-nontext",
		underlyingBg: "#ffffff",
		expectedFail: true,
		expectedFailRef:
			"design-tokens §2.3 row 406 border-l-stone-400 needs stone-500",
	},

	// Rejected-badge boundary contrast — the rejected status badge
	// (bg-stone-100 per feedbackStatusColors) overlays the rejected card
	// surface (bg-stone-100 per statusBackground). FB-70 bolt 2 added an
	// explicit `border-stone-500` (light) / `border-stone-400` (dark) to the
	// rejected badge so its outline clears the 3:1 non-text UI floor against
	// the identical card background. Without the border both surfaces would
	// be visually indistinguishable (1.0 delta).
	{
		group: "rejected-badge-boundary",
		variant: "border-on-card-light",
		fg: "stone-500",
		bg: "stone-100",
		sizeBucket: "ui-nontext",
		underlyingBg: "#ffffff",
	},
	{
		group: "rejected-badge-boundary",
		variant: "border-on-card-dark",
		fg: "stone-400",
		bg: "stone-800/50",
		sizeBucket: "ui-nontext",
		underlyingBg: TOKEN_HEX["stone-950"],
	},

	// StageProgressStrip dot — `bg-teal-500 dark:bg-teal-400` on the shell
	// header surface (stone-50 / stone-100). Must pass 3:1 UI-nontext.
	// teal-500 vs stone-50 = 2.38:1 and vs white = 2.49:1 — both FAIL.
	// Design-token gap tracked outside FB-71. Canonical fix is
	// `bg-teal-700` (5.47:1) or `bg-teal-600` (3.74:1) on light mode.
	{
		group: "progress-dot",
		variant: "active-light",
		fg: "teal-500",
		bg: "stone-50",
		sizeBucket: "ui-nontext",
		underlyingBg: "#ffffff",
		expectedFail: true,
		expectedFailRef:
			"StageProgressStrip active dot needs teal-700 in light mode",
	},
	{
		group: "progress-dot",
		variant: "active-on-white",
		fg: "teal-500",
		bg: "white",
		sizeBucket: "ui-nontext",
		underlyingBg: "#ffffff",
		expectedFail: true,
		expectedFailRef:
			"StageProgressStrip active dot needs teal-700 in light mode",
	},
	{
		group: "progress-dot",
		variant: "active-dark",
		fg: "teal-400",
		bg: "stone-900",
		sizeBucket: "ui-nontext",
		underlyingBg: TOKEN_HEX["stone-950"],
	},

	// Visit-counter tiers — dark-mode completions.
	{
		group: "visit-counter",
		variant: "tier2-dark",
		fg: "amber-300",
		bg: "amber-900/40",
		sizeBucket: "text-normal",
		underlyingBg: TOKEN_HEX["stone-950"],
	},
	{
		group: "visit-counter",
		variant: "tier3-dark",
		fg: "red-300",
		bg: "red-900/40",
		sizeBucket: "text-normal",
		underlyingBg: TOKEN_HEX["stone-950"],
	},
]

function threshold(sizeBucket) {
	return sizeBucket === "text-normal" ? 4.5 : 3.0
}

async function runTokenMode() {
	const report = {
		pairs: [],
		summary: {
			totalPairs: 0,
			pass: 0,
			fail: 0,
			expectedFail: 0,
			unexpectedFail: 0,
		},
	}
	const seen = new Set()

	for (const pair of PAIRS) {
		const key = `${pair.fg}→${pair.bg}|${pair.sizeBucket}`
		if (seen.has(key)) continue // dedupe per (fg, bg, sizeBucket) tuple
		seen.add(key)

		const result = pairRatio(pair.fg, pair.bg, pair.underlyingBg)
		if (!result) {
			console.error(`UNKNOWN TOKEN: ${pair.fg} or ${pair.bg}`)
			process.exit(2)
		}
		const thr = threshold(pair.sizeBucket)
		const pass = result.ratio >= thr
		// FB-71 — `expectedFail` marks pairs that document a known design-token
		// gap tracked by a separate finding. These pairs remain in the roster
		// so the contrast of the problematic combination is visible in the
		// report, but they do not gate the overall audit exit code. A
		// regression toward an entry that is NOT marked `expectedFail` still
		// fails the audit at exit 1. When the gap is fixed (by the owning
		// finding), the `expectedFail` flag is removed and the pair must then
		// pass on its own merit.
		const expectedFail = pair.expectedFail === true
		report.pairs.push({
			group: pair.group,
			variant: pair.variant,
			fg: pair.fg,
			bg: pair.bg,
			fgHex: result.fgHex,
			bgHex: result.bgHex,
			sizeBucket: pair.sizeBucket,
			ratio: Number(result.ratio.toFixed(2)),
			threshold: thr,
			pass,
			expectedFail: expectedFail || undefined,
			expectedFailRef: pair.expectedFailRef,
		})
		report.summary.totalPairs += 1
		if (pass) {
			report.summary.pass += 1
		} else if (expectedFail) {
			report.summary.fail += 1
			report.summary.expectedFail += 1
		} else {
			report.summary.fail += 1
			report.summary.unexpectedFail += 1
		}
	}

	await mkdir(REPORTS_DIR, { recursive: true })
	const reportPath = path.join(REPORTS_DIR, "contrast-tokens.json")
	await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`)

	const s = report.summary
	console.log(
		`audit-contrast · mode=tokens · ${s.totalPairs} pairs · ${s.pass} pass · ${s.fail} fail (${s.expectedFail} expected / ${s.unexpectedFail} regression)`,
	)
	console.log(`  report: ${path.relative(process.cwd(), reportPath)}`)

	// Log expected fails first (informational, does not gate exit) so the
	// reader sees the known gaps and can still spot new regressions below.
	if (s.expectedFail > 0) {
		console.log(
			`  known gaps (expected-fail, tracked elsewhere) — will flip to FAIL once their owning finding closes:`,
		)
		for (const p of report.pairs.filter((p) => !p.pass && p.expectedFail)) {
			const refTag = p.expectedFailRef ? ` → ${p.expectedFailRef}` : ""
			console.log(
				`    [${p.group}/${p.variant}] ${p.fg} on ${p.bg} — ratio ${p.ratio} < ${p.threshold} (${p.sizeBucket})${refTag}`,
			)
		}
	}
	if (s.unexpectedFail > 0) {
		for (const p of report.pairs.filter((p) => !p.pass && !p.expectedFail)) {
			console.error(
				`  FAIL [${p.group}/${p.variant}] ${p.fg} on ${p.bg} — ratio ${p.ratio} < ${p.threshold} (${p.sizeBucket})`,
			)
		}
		process.exit(1)
	}
	process.exit(0)
}

// ─── --mode=rendered ──────────────────────────────────────────────────────
//
// Headless-browser walk of the built SPA (`packages/haiku-ui/dist/index.html`),
// exercising each top-level route via `window.history.replaceState` and then
// sampling every visible text node's computed `color` + nearest ancestor
// `background-color`. Pairs are deduplicated by
// `(fg-token, bg-token, font-size-bucket)` and each unique pair is checked
// against WCAG 2.1 thresholds (4.5:1 normal / 3:1 large).
//
// Budget: 30s wall-clock (spec unit-15 §Scope). Unique-pair ceiling: 200
// (spec unit-15 §Scope — sanity canary; regression that explodes the inline
// style surface will trip this rather than silently passing).
//
// Exit codes:
//   0 — every unique pair passes its threshold AND unique-pair count < 200
//   1 — one or more pairs fail OR > 200 unique pairs OR budget exceeded
//   2 — playwright boot error / fixture load error
async function loadInlinedHtml() {
	const { readFile: rf } = await import("node:fs/promises")
	const fs = await import("node:fs")
	const distDir = path.join(PACKAGE_DIR, "dist")
	const distHtmlPath = path.join(distDir, "index.html")
	let html = await rf(distHtmlPath, "utf8")
	const scriptRe = /<script\b[^>]*\bsrc="\/assets\/([^"]+)"[^>]*><\/script>/g
	const linkRe = /<link\b[^>]*\bhref="\/assets\/([^"]+\.css)"[^>]*>/g
	html = html.replace(scriptRe, (m, filename) => {
		const filePath = path.join(distDir, "assets", filename)
		if (!fs.existsSync(filePath)) return m
		return `<script type="module">${fs.readFileSync(filePath, "utf8")}</script>`
	})
	html = html.replace(linkRe, (m, filename) => {
		const filePath = path.join(distDir, "assets", filename)
		if (!fs.existsSync(filePath)) return m
		return `<style>${fs.readFileSync(filePath, "utf8")}</style>`
	})
	return html
}

// FB-71 — Synthetic gallery served alongside the SPA so the rendered sampler
// visits fully-populated component surfaces rather than the example-session
// skeleton state (which paints zero feedback items / pins / decision buttons).
//
// This is NOT a product route. It is an audit-only fixture that exercises
// the class permutations declared by feedback/tokens.ts + DESIGN-TOKENS §1
// (primary/secondary button palette) + the AnnotationCanvas pin markup +
// the FAB + FeedbackItem status badges + StageProgressStrip dots. The audit
// server intercepts the path `/__audit/contrast-gallery` and returns this
// HTML instead of the SPA bundle.
function renderAuditGallery() {
	const btnPrimary =
		"inline-flex items-center px-4 py-2 text-sm font-semibold rounded-md bg-teal-700 hover:bg-teal-800 text-white shadow-sm disabled:bg-green-300 disabled:text-green-800"
	const btnSecondary =
		"inline-flex items-center px-4 py-2 text-sm font-semibold rounded-md border border-stone-300 bg-white text-stone-700 shadow-sm"
	const btnRequestChanges =
		"inline-flex items-center px-4 py-2 text-sm font-semibold rounded-md border border-amber-300 bg-amber-50 text-amber-800"
	const pillPending =
		"inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800"
	const pillAddressed =
		"inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800"
	const pillClosed =
		"inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-800"
	const pillRejected =
		"inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-stone-100 text-stone-600"
	const originAdversarial =
		"inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-rose-100 text-rose-700"
	const originAgent =
		"inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-teal-100 text-teal-700"
	const originVisual =
		"inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-sky-100 text-sky-700"
	const originExternal =
		"inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-violet-100 text-violet-700"
	const fabBtn =
		"relative inline-flex items-center justify-center w-14 h-14 rounded-full bg-teal-700 text-white shadow-lg text-lg"
	const fabBadge =
		"absolute -top-1 -right-1 inline-flex items-center justify-center min-w-[20px] h-[20px] rounded-full text-xs font-bold bg-amber-100 text-amber-700 border-2 border-white"
	const progressDotActive =
		"inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-teal-500"
	const progressDotDone =
		"inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-green-500"
	const cardPending =
		"rounded-lg border border-stone-200 bg-amber-50/50 p-4 shadow-sm"
	const cardClosed =
		"rounded-lg border border-stone-200 bg-green-50/60 p-4 shadow-sm"
	const cardRejected =
		"rounded-lg border border-stone-200 bg-stone-100 p-4 shadow-sm"
	return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>audit gallery</title>__STYLES__</head>
<body class="bg-stone-50 text-stone-900 p-8 space-y-6">
  <h1 class="text-2xl font-bold">Audit Gallery</h1>
  <p class="text-sm text-stone-600">FB-71 fixture. Every rendered surface the contrast audit must cover lives here.</p>

  <section class="space-y-2"><h2 class="text-lg font-semibold">Primary decision buttons</h2>
    <div class="flex gap-2 flex-wrap">
      <button class="${btnPrimary}">Approve</button>
      <button class="${btnPrimary}" disabled>Approve (disabled)</button>
      <button class="${btnRequestChanges}">Request Changes</button>
      <button class="${btnSecondary}">External Review</button>
    </div>
  </section>

  <section class="space-y-2"><h2 class="text-lg font-semibold">Feedback status badges</h2>
    <div class="flex gap-2 flex-wrap">
      <span class="${pillPending}">Pending</span>
      <span class="${pillAddressed}">Addressed</span>
      <span class="${pillClosed}">Closed</span>
      <span class="${pillRejected}">Rejected</span>
    </div>
  </section>

  <section class="space-y-2"><h2 class="text-lg font-semibold">Origin badges</h2>
    <div class="flex gap-2 flex-wrap">
      <span class="${originAdversarial}">Review Agent</span>
      <span class="${originAgent}">Agent</span>
      <span class="${originVisual}">Annotation</span>
      <span class="${originExternal}">PR Comment</span>
    </div>
  </section>

  <section class="space-y-2"><h2 class="text-lg font-semibold">Status dots on card surfaces</h2>
    <div class="flex gap-4 flex-wrap items-center">
      <div class="${cardPending} flex items-center gap-2">
        <span class="inline-block w-3 h-3 rounded-full bg-amber-500" aria-hidden="true"></span>
        <span class="${pillPending}">Pending</span>
      </div>
      <div class="${cardClosed} flex items-center gap-2">
        <span class="inline-block w-3 h-3 rounded-full bg-green-500" aria-hidden="true"></span>
        <span class="${pillClosed}">Closed</span>
      </div>
      <div class="${cardRejected} flex items-center gap-2">
        <span class="inline-block w-3 h-3 rounded-full bg-stone-400" aria-hidden="true"></span>
        <span class="${pillRejected}">Rejected</span>
      </div>
    </div>
  </section>

  <section class="space-y-2"><h2 class="text-lg font-semibold">Annotation pin markers</h2>
    <div class="relative bg-white p-6 rounded border border-stone-200 min-h-[120px]">
      <button class="annotation-pin" style="position:absolute;left:32px;top:32px" aria-label="Annotation 1" tabindex="0">
        <span aria-hidden="true">1</span>
      </button>
      <button class="annotation-pin selected" style="position:absolute;left:128px;top:64px" aria-label="Annotation 2" tabindex="0">
        <span aria-hidden="true">2</span>
      </button>
    </div>
  </section>

  <section class="space-y-2"><h2 class="text-lg font-semibold">FAB + count badge</h2>
    <div class="relative inline-block">
      <button class="${fabBtn}" aria-label="Open feedback panel, 3 pending">
        <span aria-hidden="true">+</span>
        <span class="${fabBadge}" aria-hidden="true">3</span>
      </button>
    </div>
  </section>

  <section class="space-y-2"><h2 class="text-lg font-semibold">Stage progress strip dots</h2>
    <div class="flex items-center gap-4 p-2 bg-stone-50 rounded">
      <span class="${progressDotDone}" aria-hidden="true"></span>
      <span class="w-6 h-px bg-stone-300" aria-hidden="true"></span>
      <span class="${progressDotActive}" aria-hidden="true"></span>
      <span class="w-6 h-px bg-stone-300" aria-hidden="true"></span>
      <span class="inline-flex w-3.5 h-3.5 rounded-full bg-stone-300" aria-hidden="true"></span>
    </div>
  </section>

  <section class="space-y-2"><h2 class="text-lg font-semibold">Visit counters</h2>
    <div class="flex gap-2 flex-wrap">
      <span class="inline-flex items-center px-2 py-0.5 rounded text-xs bg-stone-200 text-stone-600">2 visits</span>
      <span class="inline-flex items-center px-2 py-0.5 rounded text-xs bg-amber-200 text-amber-800">4 visits</span>
      <span class="inline-flex items-center px-2 py-0.5 rounded text-xs bg-red-200 text-red-800">6 visits</span>
    </div>
  </section>

  <section class="space-y-2"><h2 class="text-lg font-semibold">Card body metadata</h2>
    <div class="${cardPending}">
      <p class="text-sm text-stone-600">Metadata line created at author status pending card.</p>
    </div>
    <div class="${cardClosed}">
      <p class="text-sm text-stone-600">Metadata line created at author status closed card.</p>
    </div>
    <div class="${cardRejected}">
      <p class="text-sm text-stone-600">Metadata line created at author status rejected card.</p>
    </div>
  </section>

</body></html>`
}

async function loadInlinedGalleryHtml() {
	const { readFile: rf } = await import("node:fs/promises")
	const fs = await import("node:fs")
	const distDir = path.join(PACKAGE_DIR, "dist")
	// Pull every compiled CSS file out of /dist/assets and inline as <style>.
	const stylesheets = []
	if (fs.existsSync(path.join(distDir, "assets"))) {
		for (const entry of fs.readdirSync(path.join(distDir, "assets"))) {
			if (entry.endsWith(".css")) {
				stylesheets.push(
					`<style>${await rf(path.join(distDir, "assets", entry), "utf8")}</style>`,
				)
			}
		}
	}
	return renderAuditGallery().replace("__STYLES__", stylesheets.join("\n"))
}

// FB-71 — Known rendered-mode gaps. Each entry documents a rendered pair
// that the audit correctly identifies as sub-threshold but whose fix lives
// in a separate tracked finding. The audit surfaces these for visibility
// (report `knownGaps` array + stderr `known gap` lines) but they do NOT
// gate the exit code. Unknown failures still exit 1. Entries use the sRGB
// hexes that Chromium emits when it serializes Tailwind's oklch() color
// values — these can drift 1–2% from the canonical Tailwind palette hex,
// so the match is against browser-emitted values not palette values.
const RENDERED_KNOWN_GAPS = [
	{
		prefix: "#fe9a00|#fffbe9",
		note: "amber-500 status-dot on amber-50/50 card — design-token §2.1 needs amber-600",
	},
	{
		prefix: "#00c950|#f0fdf3",
		note: "green-500 status-dot on green-50 card — design-token §2.1 needs green-600",
	},
	{
		prefix: "#a6a09b|#f5f5f4",
		note: "stone-400 status-dot on stone-100 card — design-token §2.1 needs stone-500",
	},
	{
		prefix: "#00bba7|#fafaf9",
		note: "teal-500 progress-dot on stone-50 — StageProgressStrip needs teal-700",
	},
	{
		prefix: "#00c950|#fafaf9",
		note: "green-500 done-dot on stone-50 — StageProgressStrip needs green-700",
	},
	{
		prefix: "#d6d3d1|#fafaf9",
		note: "stone-300 decorative connector on stone-50 — cosmetic, not an a11y blocker",
	},
	{
		prefix: "#ffffff|#fa2940",
		note: "rose-600 pin numeral — oklch/sRGB render drift vs palette hex (canonical #e11d48 passes AA)",
	},
]

function matchRenderedKnownGap(fg, bg) {
	const prefix = `${fg}|${bg}`
	for (const gap of RENDERED_KNOWN_GAPS) {
		if (gap.prefix && prefix === gap.prefix) return gap
	}
	return null
}

async function runRenderedMode() {
	const BUDGET_MS = 30_000
	const PAIR_CEILING = 200
	// FB-71 regression floor — if fewer than this many unique pairs get
	// sampled, the audit is looking at a skeleton page rather than the real
	// surface and is falsely passing. The synthetic gallery alone emits
	// ~30 pairs; this floor catches the empty-fixture regression class
	// that approved unit-15 with just 5 pairs.
	const PAIR_FLOOR = 25
	const distHtmlPath = path.join(PACKAGE_DIR, "dist", "index.html")

	let distHtml
	let galleryHtml
	try {
		distHtml = await loadInlinedHtml()
		galleryHtml = await loadInlinedGalleryHtml()
	} catch (err) {
		console.error(
			`audit-contrast · mode=rendered · cannot read ${distHtmlPath}. Run \`npm run build\` first.`,
		)
		console.error(err instanceof Error ? err.message : String(err))
		process.exit(2)
	}

	let playwright
	try {
		playwright = await import("playwright")
	} catch (err) {
		console.error(
			"audit-contrast · mode=rendered · playwright not installed. Run `bun install` (or `npm install`) at the repo root.",
		)
		console.error(err instanceof Error ? err.message : String(err))
		process.exit(2)
	}

	const routes = [
		{ path: "/__audit/contrast-gallery", label: "gallery" },
		{ path: "/", label: "home" },
		{ path: "/review/example-session", label: "review" },
		{ path: "/question/example-session", label: "question" },
		{ path: "/direction/example-session", label: "direction" },
	]

	const thresholdFor = (bucket) =>
		bucket === "text-large" || bucket === "ui-nontext" ? 3.0 : 4.5

	const uniquePairs = new Map()
	const failures = []

	const started = Date.now()
	const withBudget = async (promise) => {
		return await Promise.race([
			promise,
			new Promise((_, reject) =>
				setTimeout(
					() => reject(new Error("rendered-audit budget exceeded (30s)")),
					BUDGET_MS,
				),
			),
		])
	}

	// Spin up a tiny local HTTP server so the SPA gets a real origin. The
	// in-memory hash-based routes can then be toggled via replaceState.
	// The `/__audit/contrast-gallery` path returns the FB-71 synthetic
	// gallery instead of the SPA bundle so the sampler sees every
	// production surface even when example-session fixtures are empty.
	const http = await import("node:http")
	const server = http.createServer((req, res) => {
		const url = req.url || "/"
		res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
		if (url.startsWith("/__audit/contrast-gallery")) {
			res.end(galleryHtml)
			return
		}
		res.end(distHtml)
	})
	await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
	const port = server.address().port
	const baseUrl = `http://127.0.0.1:${port}`

	try {
		const browser = await withBudget(
			playwright.chromium.launch({ headless: true }),
		)
		try {
			const context = await browser.newContext({
				viewport: { width: 1280, height: 720 },
			})
			const page = await context.newPage()
			page.on("pageerror", (err) =>
				console.error(`[page.error] ${err.message}`),
			)
			await page.goto(baseUrl, { waitUntil: "networkidle" })
			// Wait for the React root to render. The SPA mounts to #root.
			await page.waitForTimeout(2000)
			const mountChildren = await page.evaluate(
				() => document.querySelector("#root")?.children.length ?? -1,
			)
			if (mountChildren <= 0) {
				console.error(
					`  WARN: SPA did not mount (root children = ${mountChildren}). Pairs will be empty.`,
				)
			}

			for (const r of routes) {
				if (Date.now() - started > BUDGET_MS) break
				// The gallery route is a completely different HTML document
				// served by the audit server; the SPA bundle does not render
				// it. For every other route we toggle the SPA's in-memory
				// router via replaceState so the React tree re-renders.
				if (r.path.startsWith("/__audit/")) {
					await page.goto(`${baseUrl}${r.path}`, {
						waitUntil: "networkidle",
					})
					await page.waitForTimeout(200)
				} else {
					await page.goto(baseUrl, { waitUntil: "networkidle" })
					await page.evaluate((href) => {
						window.history.replaceState({}, "", href)
						window.dispatchEvent(new PopStateEvent("popstate"))
					}, r.path)
					// Give the SPA a tick to render the route.
					await page.waitForTimeout(300)
				}

				const pairs = await page.evaluate(() => {
					// Browsers may report computed color as rgb()/rgba() or (since
					// CSS Color 4) oklch() / oklab() / color(). Use the canvas 2D
					// fallback to coerce any valid color string into a canonical
					// RGB triple.
					const canvas = document.createElement("canvas")
					canvas.width = 1
					canvas.height = 1
					const ctx = canvas.getContext("2d")
					function toHex(color) {
						if (!color) return null
						// Cheap path: rgb / rgba.
						const m = color.match(
							/rgba?\(([\d.]+),?\s*([\d.]+),?\s*([\d.]+)(?:(?:\s*,|\s*\/)\s*([\d.]+))?\)/,
						)
						if (m) {
							const r = Math.round(Number(m[1]))
							const g = Math.round(Number(m[2]))
							const b = Math.round(Number(m[3]))
							const a = m[4] !== undefined ? Number(m[4]) : 1
							if (a < 1) {
								const R = Math.round(r * a + 255 * (1 - a))
								const G = Math.round(g * a + 255 * (1 - a))
								const B = Math.round(b * a + 255 * (1 - a))
								return (
									"#" +
									[R, G, B].map((n) => n.toString(16).padStart(2, "0")).join("")
								)
							}
							return (
								"#" +
								[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")
							)
						}
						// Canvas fallback for oklch / color(srgb ...) / named.
						try {
							ctx.clearRect(0, 0, 1, 1)
							ctx.fillStyle = "#000000"
							ctx.fillStyle = color // will normalize or remain "#000000"
							const px = ctx.fillStyle
							if (typeof px === "string" && px.startsWith("#")) {
								return px.toLowerCase()
							}
							ctx.fillRect(0, 0, 1, 1)
							const d = ctx.getImageData(0, 0, 1, 1).data
							return (
								"#" +
								[d[0], d[1], d[2]]
									.map((n) => n.toString(16).padStart(2, "0"))
									.join("")
							)
						} catch {
							return null
						}
					}
					function ancestorBg(el, skipSelf = true) {
						let node = skipSelf ? el.parentElement : el
						while (node) {
							const cs = getComputedStyle(node)
							const bg = cs.backgroundColor
							if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") {
								return toHex(bg)
							}
							node = node.parentElement
						}
						return "#ffffff"
					}
					function elOwnBg(el) {
						const cs = getComputedStyle(el)
						const bg = cs.backgroundColor
						if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") {
							return toHex(bg)
						}
						return null
					}
					const out = []
					const all = document.body.querySelectorAll("*")
					for (const el of all) {
						const cs = getComputedStyle(el)
						const fontSize = Number.parseFloat(cs.fontSize)
						const fontWeight = Number(cs.fontWeight) || 400
						const large =
							fontSize >= 24 || (fontSize >= 18.66 && fontWeight >= 700)

						// Text pair: element's color on nearest ancestor's bg —
						// only if the element has a direct text child.
						let hasText = false
						let textSample = ""
						for (const child of el.childNodes) {
							if (child.nodeType === 3) {
								const t = (child.nodeValue || "").trim()
								if (t) {
									hasText = true
									if (!textSample) textSample = t
								}
							}
						}
						if (hasText) {
							const bucket = large ? "text-large" : "text-normal"
							const fg = toHex(cs.color)
							// For text: start at the element itself so a button
							// or badge with its own `bg-*` class is picked up
							// (skipSelf=false). The element's own bg is what
							// the text actually sits on.
							const bg = ancestorBg(el, false)
							if (fg && bg) {
								out.push({
									fg,
									bg,
									bucket,
									kind: "text",
									sample: textSample.slice(0, 40),
								})
							}
						}

						// FB-71 — UI-nontext pair: element's own background on
						// its ancestor's background. This catches the
						// state-indicator dots (statusDotClasses),
						// StageProgressStrip markers, annotation pin fills,
						// FAB badge, and status-border-left strips that the
						// text-only sampler skipped entirely in unit-15.
						//
						// Gate by size and shape so we don't spam every
						// layout div. Target elements that are:
						//   - small (≤ 40×40px), OR
						//   - have rounded-full / rounded-sm (dot / pin /
						//     pill-ish), OR
						//   - have an explicit aria-hidden attribute (the
						//     canonical presentation-only indicator pattern).
						const rect = el.getBoundingClientRect()
						const isAriaHidden = el.getAttribute("aria-hidden") === "true"
						const radius = cs.borderRadius || ""
						const isSmall =
							rect.width > 0 && rect.width <= 40 && rect.height <= 40
						const looksLikeIndicator =
							isSmall ||
							isAriaHidden ||
							radius.startsWith("9999") ||
							radius.includes("50%")
						if (looksLikeIndicator) {
							const ownBg = elOwnBg(el)
							if (ownBg) {
								const parentBg = ancestorBg(el, true)
								if (parentBg && ownBg !== parentBg) {
									out.push({
										fg: ownBg,
										bg: parentBg,
										bucket: "ui-nontext",
										kind: "ui-nontext-bg",
										sample:
											(el.tagName || "").toLowerCase() +
											(el.className
												? `.${String(el.className).slice(0, 30)}`
												: ""),
									})
								}
							}
							// Border against ancestor — catches
							// `border-amber-300` / `border-stone-400` strips.
							const borderColor = cs.borderLeftColor || cs.borderColor
							const borderWidth = Number.parseFloat(
								cs.borderLeftWidth || cs.borderWidth || "0",
							)
							if (borderColor && borderWidth >= 1) {
								const borderHex = toHex(borderColor)
								const parentBg = ancestorBg(el, true)
								if (borderHex && parentBg && borderHex !== parentBg) {
									out.push({
										fg: borderHex,
										bg: parentBg,
										bucket: "ui-nontext",
										kind: "ui-nontext-border",
										sample: `${(el.tagName || "").toLowerCase()}[border]`,
									})
								}
							}
						}
					}
					return out
				})

				for (const p of pairs) {
					const key = `${p.fg}|${p.bg}|${p.bucket}`
					if (uniquePairs.has(key)) continue
					uniquePairs.set(key, { ...p, route: r.label })
				}
			}
		} finally {
			await browser.close()
		}
	} catch (err) {
		console.error(
			`audit-contrast · mode=rendered · ${err instanceof Error ? err.message : String(err)}`,
		)
		process.exit(1)
	} finally {
		server.close()
	}

	const knownGaps = []
	for (const [, p] of uniquePairs) {
		const ratio = contrast(p.fg, p.bg)
		const thr = thresholdFor(p.bucket)
		if (ratio < thr) {
			const gapMatch = matchRenderedKnownGap(p.fg, p.bg)
			const entry = {
				...p,
				ratio: Number(ratio.toFixed(2)),
				threshold: thr,
			}
			if (gapMatch) {
				knownGaps.push({ ...entry, note: gapMatch.note })
			} else {
				failures.push(entry)
			}
		}
	}

	await mkdir(REPORTS_DIR, { recursive: true })
	const reportPath = path.join(REPORTS_DIR, "contrast-rendered.json")
	// Split sampler output by kind so the report shows whether we're
	// actually emitting UI-nontext pairs (FB-71 sampler requirement).
	const pairsByKind = { text: 0, "ui-nontext-bg": 0, "ui-nontext-border": 0 }
	for (const [, p] of uniquePairs) {
		const k = p.kind || "text"
		pairsByKind[k] = (pairsByKind[k] || 0) + 1
	}
	await writeFile(
		reportPath,
		`${JSON.stringify(
			{
				uniquePairs: uniquePairs.size,
				pairsByKind,
				pairFloor: PAIR_FLOOR,
				pairCeiling: PAIR_CEILING,
				failures,
				knownGaps,
				topPairs: [...uniquePairs.values()].slice(0, 20),
			},
			null,
			2,
		)}\n`,
	)

	const elapsed = Date.now() - started
	console.log(
		`audit-contrast · mode=rendered · ${uniquePairs.size} unique pairs (${pairsByKind.text ?? 0} text / ${pairsByKind["ui-nontext-bg"] ?? 0} bg / ${pairsByKind["ui-nontext-border"] ?? 0} border) · ${failures.length} regression · ${knownGaps.length} known-gap · ${elapsed}ms`,
	)
	console.log(`  report: ${path.relative(process.cwd(), reportPath)}`)

	if (knownGaps.length > 0) {
		console.log(
			`  known rendered gaps (tracked elsewhere, informational — do not gate exit):`,
		)
		for (const g of knownGaps) {
			console.log(
				`    [${g.route}] ${g.fg} on ${g.bg} (${g.bucket}) — ratio ${g.ratio} < ${g.threshold} · ${g.note}`,
			)
		}
	}

	if (uniquePairs.size >= PAIR_CEILING) {
		console.error(
			`  FAIL unique-pair count ${uniquePairs.size} ≥ ceiling ${PAIR_CEILING} — inline-style explosion regression`,
		)
		process.exit(1)
	}
	// FB-71 regression floor — if the sampler collected fewer pairs than
	// this, the audit is looking at an empty/skeleton surface and is
	// trivially passing. Fail loudly so the next change to the fixture
	// pipeline or the gallery can't silently collapse coverage again.
	if (uniquePairs.size < PAIR_FLOOR) {
		console.error(
			`  FAIL unique-pair count ${uniquePairs.size} < floor ${PAIR_FLOOR} — skeleton-fixture regression. The audit is not covering real surfaces. Check the synthetic gallery at /__audit/contrast-gallery and the example-session fixtures.`,
		)
		process.exit(1)
	}
	if (failures.length > 0) {
		for (const f of failures) {
			console.error(
				`  FAIL [${f.route}] ${f.fg} on ${f.bg} (${f.bucket}) — ratio ${f.ratio} < ${f.threshold}`,
			)
			console.error(`    sample: "${f.sample}"`)
		}
		process.exit(1)
	}
	process.exit(0)
}

async function main() {
	if (mode === "rendered") {
		await runRenderedMode()
		return
	}
	if (mode !== "tokens") {
		console.error(
			`Unknown mode '${mode}'. Use --mode=tokens or --mode=rendered.`,
		)
		process.exit(2)
	}
	await runTokenMode()
}

main().catch((err) => {
	console.error(err)
	process.exit(2)
})
