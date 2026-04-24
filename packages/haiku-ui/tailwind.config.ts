/**
 * Tailwind v4 reads color/spacing/radius/shadow/typography tokens from the
 * `@theme` block in `src/index.css`. This config is the thin shell that
 * controls the things CSS-first config can't: content scanning and the
 * runtime-interpolated class safelist.
 *
 * Canonical token surface: `knowledge/DESIGN-TOKENS.md`.
 */
import type { Config } from "tailwindcss"

const config: Config = {
	content: ["./index.html", "./src/**/*.{ts,tsx}"],
	darkMode: "class",
	safelist: [
		// Feedback status pairs (DESIGN-TOKENS §2.1 — interpolated via
		// feedbackStatusColors[status] lookups; Tailwind's static-class scanner
		// cannot see these, so enumerate explicitly).
		{
			pattern:
				/^(bg|text|border)-(amber|blue|green|stone)-(50|100|200|300|400|500|600|700|800|900)(\/(15|20|25|30|40|50|60))?$/,
		},
		{
			pattern:
				/^dark:(bg|text|border)-(amber|blue|green|stone)-(200|300|400|500|600|700|800|900|950)(\/(15|20|25|30|40|50))?$/,
		},
		// Origin badge pairs (DESIGN-TOKENS §2.2)
		{
			pattern:
				/^(bg|text|border)-(rose|violet|sky|teal|indigo|purple|cyan)-(100|200|300|400|500|600|700|800|900)(\/(30|40))?$/,
		},
		{
			pattern:
				/^dark:(bg|text|border)-(rose|violet|sky|teal|indigo|purple|cyan)-(200|300|400|700|800|900)(\/(30|40))?$/,
		},
		// Status-aware card left borders (DESIGN-TOKENS §2.3)
		"border-l-[3px]",
		{ pattern: /^border-l-(amber|blue|green|stone)-(400|500)$/ },
		{ pattern: /^dark:border-l-(amber|blue|green|stone)-(400|500)$/ },
		// Visit-counter tier pairs (DESIGN-TOKENS §2.4)
		"bg-stone-200",
		"text-stone-600",
		"dark:bg-stone-700",
		"dark:text-stone-300",
		"bg-amber-200",
		"text-amber-800",
		"dark:bg-amber-900/40",
		"dark:text-amber-300",
		"bg-red-200",
		"text-red-800",
		"dark:bg-red-900/40",
		"dark:text-red-300",
	],
	theme: {
		extend: {
			// Empty — tokens live in src/index.css @theme blocks (Tailwind v4
			// native). This extend is an escape hatch for the rare v3-style
			// plugin that requires JS config.
		},
	},
}

export default config
