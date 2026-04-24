# Tactical Plan: unit-04 Design token system + token-scoped audit scripts

Owner: planner (bolt 1)
Target: Land the design-token system defined in `knowledge/DESIGN-TOKENS.md` across `packages/haiku-ui/` — (a) Tailwind v4 `@theme` / CSS custom properties, (b) a primitive component layer, (c) canonical container tokens, (d) a grep-driven source migration off the banned pattern set, and (e) three audit scripts (`verify-tokens`, `audit-contrast`, `audit-banned-patterns`) every downstream unit will depend on. Ship vitest + RTL coverage for every primitive.

---

## Context & Prior Art

- **unit-03** already extracted `packages/haiku-ui/` as a standalone workspace (pkg name `haiku-ui`, `type: module`, vitest configured with jsdom, testing-library/react installed, `@tailwindcss/vite` plugin wired, `src/index.css` imports Tailwind v4 via `@import "tailwindcss"` + `@plugin "@tailwindcss/typography"` + a custom `dark` variant). `vitest.config.ts` already globs `tests/**/*.{test,spec}.{ts,tsx}` — this unit extends that to also cover `src/**/__tests__/*.test.tsx` (primitives live under `src/`, not `tests/`, so the include pattern needs widening).
- **DESIGN-TOKENS.md** (canonical source of truth) defines: palette (stone/teal/amber/blue/green/rose/violet/sky scales + specific shades per role), feedback-status colors (§2.1), origin colors (§2.2), status-aware card borders/backgrounds (§2.3), visit-counter tiers (§2.4), panel tokens (§2.5), footer button copy (§2.6 — **Dismiss / Verify & Close / Reopen** are the only permitted verbs; `"Close"`, `"Reject"`, `"Address"`, `"Re-open"` are banned), z-index layers, animation tokens with reduced-motion fallbacks, and the **banned text-on-surface pairs** (§1.1a) + **disabled-opacity ban** (§1.7).
- **contrast-and-type-audit.md** (DESIGN-BRIEF cross-reference) is the authoritative source on which (fg, bg) pairs are AA/AAA vs FAIL, and is cited verbatim by the unit's completion criteria. Key numbers:
  - `text-stone-400` / `text-gray-400` BANNED on light surfaces (white, stone-50, stone-100, amber-50/50, blue-50/50, green-50/30, green-50/60, sky-50) → replace with `text-stone-600` (6.85:1 – 7.14:1).
  - `text-stone-500` BANNED on dark surfaces (`stone-800`, `stone-900`, `stone-950`) → replace with `text-stone-300` (≥ 10:1).
  - `opacity-50|60|70` on card roots / buttons / titles / metadata BANNED repo-wide → replace with explicit disabled token pairs (`bg-stone-100 text-stone-600 border-stone-400` + `aria-disabled="true"`, or green/amber disabled variants in §1.7).
  - `text-[9px]`, `text-[10px]` BANNED on user-facing information → replace with `text-xs` (12px) or `text-[11px] font-semibold/font-bold` only when the container forces compaction.
  - `focus:ring-1` BANNED → `focus-visible:ring-2`.
- **Current `packages/haiku-ui/src/` state** (grep results for banned patterns):
  - `text-[10px]` present in 4 files: `StageProgressStrip.tsx:65`, `FeedbackPanel.tsx:171`, `ReviewPage.tsx:1460`, `ReviewPage.tsx:1514`.
  - `opacity-50` on disabled buttons present in 6 files: `QuestionPage.tsx:295`, `ReviewSidebar.tsx:{404,418,431}`, `DesignPicker.tsx:252`; `opacity-60` on `StageProgressStrip.tsx:55`.
  - `focus:ring-1` present in `ReviewSidebar.tsx:{285,362}` only.
  - `w-80 lg:w-96` (the drift pattern) present in `ReviewCurrentPage.tsx:175`, `ReviewSidebar.tsx:76`, `ReviewPage.tsx:451`.
  - `text-stone-400` / `text-stone-500` appear widely (dozens of hits across every component) — but NOT all are violations. The violations are specifically pairs against `bg-white`, `bg-stone-50`, `bg-stone-100`, `bg-amber-50/50`, `bg-green-50/30|60`, `bg-blue-50/50`, `bg-sky-50`, and (dark mode) `dark:text-stone-500` on `dark:bg-stone-{800,900,950}`. The audit-banned-patterns script MUST encode the pair semantics, not a blanket `text-stone-500` ban.
  - `text-gray-*` returned zero hits — the SPA already lives on the stone scale; no gray-* migration work needed in this codebase (the gray scale is only used by SSR templates in `packages/haiku/`, which are OUT OF SCOPE for this unit per `knowledge/DESIGN-TOKENS.md §3` — SPA vs SSR split).
- **StatusBadge** (`packages/haiku-ui/src/components/StatusBadge.tsx:7`) currently uses `pending: "bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400"` — that pair is 4.40:1 light / ~4.4:1 dark per §1.1a, a **FAIL**. DESIGN-TOKENS §1.2 explicitly requires this to be renamed to `idle` (shared fallback) AND lifted to `text-stone-600` / `dark:text-stone-300`. The shared StatusBadge's `default:` branch keeps back-compat with callers passing the string `"pending"`, but the color tokens AND the canonical key move to `idle`.
- **No FeedbackStatusBadge / FeedbackOriginIcon / primitive components exist yet** in `src/components/`. The primitives layer (`Button`, `Badge`, `Card`, `Chip`, `Divider`, `Input`) is a brand-new directory: `packages/haiku-ui/src/components/primitives/`. The existing `Card.tsx` at `src/components/Card.tsx` is a loose wrapper — leave it in place (its usage sites are downstream-unit concerns) and add the new primitive `Card` at `src/components/primitives/Card.tsx`. Downstream units migrate callers.
- **No `scripts/` directory exists** under `packages/haiku-ui/` yet — this unit creates it from scratch alongside `audit-config.json` and the `reports/` output directory.

## Git-history signal

- `packages/haiku-ui/` is a freshly extracted package (unit-03 merged into development on commit `36fd466a`, bolt 2 APPROVED). History is clean, low-churn, no ongoing refactor to collide with.
- The upstream sibling `packages/haiku/review-app/` (legacy path) was deleted during unit-03 — no parallel-world risk.
- DESIGN-TOKENS.md itself is high-churn (unit-11 / unit-18 / FB-15 edits in the last 48h) — lock the version read at plan time and cite specific section numbers in the verify-tokens parser so a downstream spec bump flags as a parity diff instead of silently drifting.

## Risks & Blockers

1. **Tailwind v4 token surface.** Tailwind v4 replaces `tailwind.config.ts` with CSS-native `@theme` blocks inside `index.css`. The unit spec text says "`packages/haiku-ui/tailwind.config.ts` — extend palette, radii, shadows, spacing, breakpoints, typography per DESIGN-TOKENS §1" — but `packages/haiku-ui/` has no `tailwind.config.ts` today (Tailwind v4 is already installed via `@tailwindcss/vite`, which reads `@theme` from CSS). Two defensible paths:
   - **A.** Author `tailwind.config.ts` in legacy-v3 style and rely on v4's optional config-file compat. Risk: fragile, re-introduces a file Tailwind v4 is actively moving away from.
   - **B.** Encode the tokens as `@theme` blocks inside `src/index.css` (Tailwind v4 native) AND create a thin `tailwind.config.ts` that simply points the `content` allow-list + `safelist` surface (the spec explicitly requires `safelist + content allow-list` to strip banned classes from the generated surface). V4 supports a hybrid: `@theme` in CSS for token definitions, config file for content/safelist. This is the correct modern shape.
   - **Chosen: B.** The builder should treat `tailwind.config.ts` as a minimal shell (`content`, `safelist`, `darkMode: "class"` — though Tailwind v4 already handles this via the `@custom-variant dark` line in `index.css`) and put the token surface into `@theme` blocks in `index.css`. This matches what v4 encourages and still lets `verify-tokens.mjs` read both files. Document the split with a comment in `index.css`.
2. **Container tokens vs Tailwind v4 `@theme --spacing-*`.** The spec requires `--sidebar-width: 20rem`, `--sidebar-width-xl: 24rem`, `--content-max: 1400px` as canonical CSS custom properties — NOT Tailwind-scale spacing tokens. Place them in a `:root { }` block inside `index.css`, NOT in `@theme`. The arbitrary-value classes the spec requires (`w-[var(--sidebar-width)] xl:w-[var(--sidebar-width-xl)]`, `max-w-[var(--content-max)]`) work natively in Tailwind v4 — no config entry needed. Verify-tokens.mjs parses the `:root` block.
3. **safelist coverage.** The `safelist` needs to include every Tailwind class that appears ONLY inside a string-interpolated lookup map (e.g. `feedbackStatusColors[status]` — Tailwind can't see those strings during tree-shaking unless they're either on a static line in a .tsx file or explicitly safelisted). Primary candidates: the status-badge pairs (amber/blue/green/stone × 100/800/900/30/300 × dark:bg/dark:text), origin-badge pairs (rose/violet/sky/teal × 100/700/900/30/400 × light/dark), status-aware card border-left + background pairs (amber/blue/green/stone × 400/500/50/60/100 × light/dark), visit-counter tiers. Enumerate these in `safelist` with `darkMode` patterns.
4. **Scope-violation risk on source migration.** The unit's scope is `packages/haiku-ui/**` only. The grep results above ALL hit files in `packages/haiku-ui/src/components/` — safe. DO NOT touch `packages/haiku/` (SSR templates) or `packages/shared/` — those are explicitly out of scope per the SPA/SSR split in DESIGN-TOKENS §3, and modifications there will trigger `unit_scope_violation` at advance_hat. If a primitive is moved from `packages/shared/`, flag it and route via feedback; do not silently relocate.
5. **vitest include pattern.** `vitest.config.ts` currently only globs `tests/**/*.{test,spec}.{ts,tsx}` — primitives live at `src/components/primitives/__tests__/<name>.test.tsx` per the spec. Options:
   - **A.** Add `"src/**/*.{test,spec}.{ts,tsx}"` to the include array.
   - **B.** Put tests under `tests/primitives/<name>.test.tsx` and re-export from `src/components/primitives/__tests__/` as a re-export shim.
   - **Chosen: A.** Matches the spec's literal path and is the standard React convention. Add `"src/**/*.{test,spec}.{ts,tsx}"` to the `include` array in `vitest.config.ts`.
6. **ReactPortal-in-jsdom gotcha.** Primitive `Card`, `Badge`, `Chip`, `Divider` are static — no portal concerns. `Button` and `Input` may use `React.forwardRef` — RTL handles these transparently, but ensure `@testing-library/jest-dom` isn't imported (it's not in `devDependencies` per `package.json` — use raw `expect(...)` assertions against DOM nodes, NOT `.toBeInTheDocument()`).
7. **audit-banned-patterns false positives.** The pattern `text-stone-400|500 on light bg` needs DOM-pair semantics, not a line-level regex. Implementation: the banned-pair regex matches classNames where both banned-fg AND forbidden-bg tokens co-occur in the same className string literal — use a multiline regex scoped to `className={...}` or `className="..."` blocks. Allow the script to emit a warning (exit 0) on single-occurrence mentions inside test fixtures, comments, or markdown strings. Test-fixture and `**/__snapshots__/**` globs are in the exclusion set.
8. **Knowledge file drift.** The verify-tokens parser must be resilient to markdown-table reformatting. Parse by section header + table structure (§1.1 Color Palette, §1.5 Border & Radius Tokens, §2.1 Feedback Status Colors, §2.2 Origin Badge Colors, §2.3 Feedback Item Card Tokens, etc.). Emit a specific diff line per mismatched token — do not bail on the first error; collect and report all.
9. **WCAG math determinism.** `audit-contrast.mjs` must compute ratios deterministically (relative luminance per WCAG 2.1, not a library pulled from npm — keep the script dependency-free and portable). Use the hex table in `contrast-and-type-audit.md` lines 16-66 as the truth table for hex → token resolution.

## Files to Modify / Create

### A. Token surface (Tailwind config + CSS custom properties)

A1. **`packages/haiku-ui/src/index.css`** (EDIT — extend, don't replace)
   - Keep existing `@import "tailwindcss"`, `@plugin "@tailwindcss/typography"`, `@custom-variant dark`, `.annotation-pin`, `.inline-highlight`, `.comment-entry`, `.margin-comment` blocks (downstream units own those components — don't churn).
   - Add an `@theme { ... }` block declaring color tokens matching DESIGN-TOKENS §1.1 (stone 50-950, teal 100-700, amber 50-900, blue 100-800, green 50-900, red 100-700, rose 100-700, sky 100-700, violet 100-700, indigo 100-700, purple 100-700, cyan 100-800). Use Tailwind v4's `--color-*` namespace. For semantic aliases (`--color-feedback-pending-fg`, `--color-feedback-pending-bg`, etc.) add a second `@theme` layer — v4 allows this.
   - Add a `:root { ... }` block (OUTSIDE `@theme`) with the canonical container vars:
     ```css
     :root {
       --sidebar-width: 20rem;
       --sidebar-width-xl: 24rem;
       --content-max: 1400px;
     }
     ```
   - Add a `@keyframes feedback-status-change` block + `.feedback-status-changed` class per DESIGN-TOKENS §5, AND its `@media (prefers-reduced-motion: reduce)` fallback setting `animation: none`. Apply the same reduced-motion pattern to any other `@keyframes` introduced.
   - The existing `.annotation-pin`, `.inline-highlight`, `.comment-entry`, `.margin-comment` blocks use raw hex (`#e11d48`, `#3b82f6`, `rgba(251,191,36,*)`). DESIGN-TOKENS §1.8 lists these as documented hard-coded annotation colors (not banned — they live in component-owned CSS, not in Tailwind class strings). Leave unchanged for this unit; the downstream annotation-canvas unit (unit-13) owns the token-swap there. Flag in `audit-config.json` as a commented exemption.

A2. **`packages/haiku-ui/tailwind.config.ts`** (NEW — minimal shell)
   ```ts
   import type { Config } from "tailwindcss"
   export default {
     content: ["./index.html", "./src/**/*.{ts,tsx}"],
     darkMode: "class",
     safelist: [
       // Feedback status pairs (string-interpolated at runtime)
       { pattern: /^(bg|text|border)-(amber|blue|green|stone)-(100|200|300|500|600|700|800)$/ },
       { pattern: /^dark:(bg|text|border)-(amber|blue|green|stone)-(200|300|400|500|600|700|800|900)(\/(20|25|30|40|50))?$/ },
       // Origin badge pairs
       { pattern: /^(bg|text|border)-(rose|violet|sky|teal|indigo|purple)-(100|200|400|700|800|900)$/ },
       { pattern: /^dark:(bg|text|border)-(rose|violet|sky|teal|indigo|purple)-(300|400|700|800|900)(\/(30|40))?$/ },
       // Status-aware card left borders
       { pattern: /^border-l-\[3px\]$/ },
       { pattern: /^border-l-(amber|blue|green|stone)-(400|500)$/ },
       { pattern: /^dark:border-l-(amber|blue|green|stone)-(400|500)$/ },
       // Visit-counter tiers
       "bg-stone-200", "text-stone-600", "dark:bg-stone-700", "dark:text-stone-300",
       "bg-amber-200", "text-amber-800", "dark:bg-amber-900/40", "dark:text-amber-300",
       "bg-red-200", "text-red-800", "dark:bg-red-900/40", "dark:text-red-300",
     ],
     theme: {
       extend: {
         // Empty — tokens live in index.css @theme blocks (v4 native).
         // This extend block is a safety hatch for any rare v3-compat need.
       },
     },
   } satisfies Config
   ```
   - **Rationale:** v4 reads `@theme` from CSS for token definitions, but `content` + `safelist` still live in the config file. Keep the config lean; all color/spacing/radius/shadow/typography tokens live in CSS.

### B. Primitive component layer

Each primitive ships with typed variants matching DESIGN-TOKENS §2 and has a corresponding vitest + RTL test.

B1. **`packages/haiku-ui/src/components/primitives/Button.tsx`** (NEW)
   - Props: `variant: "primary" | "secondary" | "danger" | "ghost"`, `size: "sm" | "md" | "lg"`, `disabled?: boolean`, plus standard `ButtonHTMLAttributes<HTMLButtonElement>`.
   - Variant class strings per DESIGN-BRIEF §2 + DESIGN-TOKENS §1.9:
     - `primary`: `bg-teal-600 hover:bg-teal-700 text-white` + size-specific padding.
     - `secondary`: `bg-stone-200 dark:bg-stone-700 hover:bg-stone-300 dark:hover:bg-stone-600 text-stone-700 dark:text-stone-200`.
     - `danger`: `bg-red-600 hover:bg-red-700 text-white`.
     - `ghost`: `bg-transparent hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-300`.
     - Size `sm`: `px-3 py-1.5 text-xs font-medium rounded-md`.
     - Size `md`: `px-4 py-2.5 text-sm font-semibold rounded-lg`.
     - Size `lg`: `px-6 py-3 text-sm font-semibold rounded-lg`.
   - Disabled state: applies **token-based** disabled styles per DESIGN-TOKENS §1.7 — NOT `disabled:opacity-50`. Instead:
     - secondary disabled: `bg-stone-100 text-stone-600 border border-stone-400 cursor-not-allowed dark:bg-stone-800 dark:text-stone-300 dark:border-stone-500`.
     - primary green-variant disabled: `bg-green-300 text-green-800 cursor-not-allowed dark:bg-green-900/40 dark:text-green-200`.
     - primary amber-variant disabled: `bg-amber-300 text-amber-900 cursor-not-allowed dark:bg-amber-900/40 dark:text-amber-200`.
     - Always emits `aria-disabled="true"` in addition to native `disabled`.
   - Focus ring: `focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-stone-900` on every variant.
   - Forward ref to the underlying `<button>`.

B2. **`packages/haiku-ui/src/components/primitives/Badge.tsx`** (NEW)
   - Props: `tone: "neutral" | "success" | "warning" | "info" | "danger"` + optional `size: "sm" | "md"` (default `md`).
   - Base: `inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold`.
   - Tone map:
     - `neutral`: `bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300` (lifted from the banned stone-500 pair per FB-15).
     - `success`: `bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300`.
     - `warning`: `bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300`.
     - `info`: `bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300`.
     - `danger`: `bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400`.
   - Size `sm`: drop to `px-2 py-0 text-[11px] font-bold` (typography-floor exception per DESIGN-TOKENS §1.4 + contrast-and-type-audit §3).

B3. **`packages/haiku-ui/src/components/primitives/Card.tsx`** (NEW — sibling of the existing `src/components/Card.tsx`, DO NOT overwrite)
   - Props: `elevation: "flat" | "raised"` (default `flat`), `padding: "none" | "sm" | "md" | "lg"` (default `md`), `className?: string`, standard HTMLDivAttributes.
   - Base: `rounded-xl border border-stone-200 dark:border-stone-700`.
   - Elevation: `flat` → `bg-white dark:bg-stone-900 shadow-sm`; `raised` → `bg-stone-50/50 dark:bg-stone-800/50 shadow-md`.
   - Padding: `none` → `p-0`; `sm` → `p-3`; `md` → `p-6`; `lg` → `p-8`.

B4. **`packages/haiku-ui/src/components/primitives/Chip.tsx`** (NEW)
   - Props: `tone: "neutral" | "teal" | "muted"` + optional `onRemove?: () => void`.
   - Base: `inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border`.
   - Neutral: `border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-300`.
   - Teal: `border-transparent bg-teal-600 text-white dark:bg-teal-500`.
   - Muted: `border-stone-300 dark:border-stone-600 bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300`.
   - If `onRemove` provided, render a right-side `×` button with `focus-visible:ring-2` and `aria-label="Remove chip"`.

B5. **`packages/haiku-ui/src/components/primitives/Divider.tsx`** (NEW)
   - Props: `orientation: "horizontal" | "vertical"` (default `horizontal`), `className?: string`.
   - Horizontal: `h-px w-full bg-stone-200 dark:bg-stone-700`.
   - Vertical: `w-px h-full bg-stone-200 dark:bg-stone-700`.
   - Carry `role="separator"` and `aria-orientation` attribute.

B6. **`packages/haiku-ui/src/components/primitives/Input.tsx`** (NEW)
   - Props: all `InputHTMLAttributes<HTMLInputElement>` + `invalid?: boolean`.
   - Base: `text-xs p-2 border rounded-lg bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 placeholder:text-stone-500 dark:placeholder:text-stone-400`.
   - Border: `border-stone-300 dark:border-stone-600` when valid, `border-red-500 dark:border-red-400` when `invalid`.
   - Focus: `focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-stone-900 focus-visible:border-teal-500`. When `invalid`: `focus-visible:ring-red-500`.
   - Disabled: `bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400 cursor-not-allowed` + `aria-disabled="true"`.
   - Forward ref to the `<input>`.

B7. **`packages/haiku-ui/src/components/primitives/index.ts`** (NEW) — barrel re-exports `Button`, `Badge`, `Card`, `Chip`, `Divider`, `Input`.

### C. Primitive tests (vitest + RTL)

All under `packages/haiku-ui/src/components/primitives/__tests__/`. Each test file imports the primitive, renders every variant + size + disabled state, and asserts (a) the rendered className substring includes the expected token shards, (b) `aria-disabled="true"` appears when `disabled` is set, (c) `disabled` attribute is present on the native control. NO `@testing-library/jest-dom` imports — raw DOM assertions only (the project uses bare vitest `expect`).

C1. `Button.test.tsx` — covers 4 variants × 3 sizes + disabled state (assert no `opacity-50` in rendered className) + focus-visible ring class present + `aria-disabled` on disabled + ref forwarding.

C2. `Badge.test.tsx` — 5 tones × 2 sizes + contrast pairs (assert neutral uses `text-stone-600` NOT `text-stone-500`).

C3. `Card.test.tsx` — 2 elevations × 4 paddings + children render + className passthrough.

C4. `Chip.test.tsx` — 3 tones + onRemove click handler + remove button has `aria-label="Remove chip"`.

C5. `Divider.test.tsx` — 2 orientations + `role="separator"` + `aria-orientation` attribute.

C6. `Input.test.tsx` — valid vs invalid border class + focus ring variants + disabled state has `aria-disabled` + ref forwarding.

### D. Token-scoped audit scripts

Every script is a standalone `node ESM` module, zero npm dependencies beyond the workspace's own, parses raw strings, exits 0/non-zero.

D1. **`packages/haiku-ui/scripts/verify-tokens.mjs`** (NEW)
   - CLI: `node packages/haiku-ui/scripts/verify-tokens.mjs`.
   - Reads `knowledge/DESIGN-TOKENS.md` (resolve relative to workspace root — walk up until finding `.haiku/intents/` or use `path.resolve(__dirname, "../../../knowledge/DESIGN-TOKENS.md")` — note: in a unit worktree the path is `.haiku/intents/universal-feedback-model-and-review-recovery/knowledge/DESIGN-TOKENS.md`; the script resolves the current intent directory via `process.env.HAIKU_INTENT_DIR` when set, else searches upward from `__dirname`).
   - Parses tables in §1.1, §1.3, §1.5, §1.6, §2.1, §2.2, §2.3. Extracts each `Token → Classes` row.
   - Reads `packages/haiku-ui/tailwind.config.ts` (eval as ESM via dynamic import) and `packages/haiku-ui/src/index.css` (raw string scan for `@theme` blocks + `:root` block).
   - For each declared token, asserts the token value appears in either (a) the Tailwind v4 `@theme` block in `index.css`, (b) the `safelist` in `tailwind.config.ts` (for runtime-interpolated classes), or (c) the `:root` block for container tokens.
   - On mismatch, emits: `TOKEN MISMATCH: <section>.<token> — expected <value>, found <value>` (one per line, do not bail).
   - Exits 0 iff every token is present and matches; exits 1 with a diff summary on any mismatch.

D2. **`packages/haiku-ui/scripts/audit-contrast.mjs`** (NEW — supports `--mode=tokens` flag; `--mode=rendered` reserved for unit-15)
   - CLI: `node packages/haiku-ui/scripts/audit-contrast.mjs --mode=tokens`.
   - Builds a deterministic hex table from `contrast-and-type-audit.md §16-66` (the token-to-hex map).
   - Enumerates default token pairs from DESIGN-TOKENS: feedback-status (4 pairs × light/dark), origin (6 pairs × light/dark), card backgrounds × body text (stone-600 light + stone-300 dark), disabled-button pairs (§1.7). Dedupes by `(fg-token, bg-token, font-size-bucket)` tuple.
   - For each pair, computes WCAG 2.1 relative-luminance contrast via:
     ```js
     function luminance(hex) { /* sRGB → linear → 0.2126 R + 0.7152 G + 0.0722 B */ }
     function contrast(fg, bg) { const l1 = luminance(fg), l2 = luminance(bg); return (Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05); }
     ```
   - Asserts ≥ 4.5:1 for text size `xs`/`sm`/`base` (`text-xs` bucket + `text-sm` bucket + `text-base` bucket), ≥ 3:1 for large text (`text-lg`+) and for non-text UI (borders, disabled-button borders).
   - Outputs a JSON report to `packages/haiku-ui/reports/contrast-tokens.json` with schema `{ pairs: Array<{fg, bg, sizeBucket, ratio, threshold, pass}>, summary: { totalPairs, pass, fail } }`.
   - Exits 0 iff all `pass: true`; exits 1 and prints the failing rows otherwise.

D3. **`packages/haiku-ui/scripts/audit-banned-patterns.mjs`** (NEW — supports `--profile=tokens` and `--profile=stage-wide`)
   - CLI: `node packages/haiku-ui/scripts/audit-banned-patterns.mjs --profile=tokens` (default).
   - Reads `packages/haiku-ui/audit-config.json` (see D4) for the profile's banned-regex array.
   - For each regex entry, walks the file-glob scope (using built-in `node:fs/promises` + a small glob helper or `globby` if added to devDeps), excludes the exclusion globs, runs the regex per-file, and collects hits.
   - Emits per-hit diagnostic: `BANNED: <file>:<line> — <regex.description> — <matched snippet>`.
   - Exits 0 iff every regex has zero hits; exits 1 with a count summary otherwise.

D4. **`packages/haiku-ui/audit-config.json`** (NEW)
   ```json
   {
     "profiles": {
       "tokens": {
         "description": "unit-04 token-scoped banned-pattern audit",
         "rules": [
           {
             "id": "banned-text-small",
             "description": "text-[9px] / text-[10px] banned on user-facing info (WCAG 1.4.4 Resize Text)",
             "pattern": "text-\\[(9|10)px\\]",
             "scope": ["packages/haiku-ui/src/**/*.{ts,tsx,css}"],
             "exclude": ["**/__tests__/**", "**/__snapshots__/**", "**/*.test.{ts,tsx}", "**/*.spec.{ts,tsx}"]
           },
           {
             "id": "banned-text-gray",
             "description": "text-gray-* banned in SPA (use text-stone-* or semantic tokens)",
             "pattern": "text-gray-\\d",
             "scope": ["packages/haiku-ui/src/**/*.{ts,tsx,css}"],
             "exclude": ["**/__tests__/**", "**/__snapshots__/**"]
           },
           {
             "id": "banned-stone-400-on-light",
             "description": "text-stone-400 on light card surface (fails 4.5:1 AA)",
             "pattern": "text-stone-400\\b(?![^\\\"]*dark:)",
             "scope": ["packages/haiku-ui/src/**/*.{ts,tsx}"],
             "exclude": ["**/__tests__/**", "**/__snapshots__/**"]
           },
           {
             "id": "banned-opacity-state",
             "description": "opacity-50|60|70 on interactive/card roots (use token-based disabled per DESIGN-TOKENS §1.7)",
             "pattern": "\\bopacity-(50|60|70)\\b",
             "scope": ["packages/haiku-ui/src/**/*.{ts,tsx}"],
             "exclude": ["**/__tests__/**", "**/__snapshots__/**"]
           },
           {
             "id": "banned-focus-ring-1",
             "description": "focus:ring-1 banned (use focus-visible:ring-2)",
             "pattern": "focus:ring-1\\b",
             "scope": ["packages/haiku-ui/src/**/*.{ts,tsx,css}"],
             "exclude": ["**/__tests__/**", "**/__snapshots__/**"]
           },
           {
             "id": "banned-sidebar-drift",
             "description": "w-80 + (lg|xl):w-96 drift; use canonical --sidebar-width / --sidebar-width-xl",
             "pattern": "w-80\\s+(lg|xl):w-96",
             "scope": ["packages/haiku-ui/src/**/*.{ts,tsx}"],
             "exclude": ["**/__tests__/**", "**/__snapshots__/**"]
           },
           {
             "id": "banned-content-max-literal",
             "description": "max-w-[1400px] literal; use max-w-[var(--content-max)]",
             "pattern": "max-w-\\[1400px\\]",
             "scope": ["packages/haiku-ui/src/**/*.{ts,tsx}"],
             "exclude": ["**/__tests__/**", "**/__snapshots__/**"]
           },
           {
             "id": "banned-button-verb-reject",
             "description": "Reject/Close/Address/Re-open banned as button text (DESIGN-TOKENS §2.6); canonical verbs are Dismiss / Verify & Close / Reopen",
             "pattern": "<[Bb]utton[^>]*>\\s*(Reject|Close|Address|Re-open)\\s*</",
             "scope": ["packages/haiku-ui/src/**/*.{ts,tsx}"],
             "exclude": ["**/__tests__/**", "**/__snapshots__/**"]
           },
           {
             "id": "banned-button-verb-aria",
             "description": "Reject/Close/Address/Re-open banned as aria-label",
             "pattern": "aria-label=[\"'](Reject|Close|Address|Re-open)[\"']",
             "scope": ["packages/haiku-ui/src/**/*.{ts,tsx}"],
             "exclude": ["**/__tests__/**", "**/__snapshots__/**"]
           }
         ]
       },
       "stage-wide": {
         "description": "unit-15 stage-wide audit superset (reserved — unit-15 extends this)",
         "extends": "tokens",
         "rules": []
       }
     }
   }
   ```
   - The `{origin}` JSX sharpened regex and `"Show agent feedback"(?! inline)` regex are reserved for unit-15's stage-wide profile — they cover files (feedback panel, agent toggle) that are downstream-unit concerns, not the token-migration subset. Add them to the `stage-wide` profile's `rules` array as placeholders if needed, but they MUST NOT run in `--profile=tokens`.

### E. Source migration (grep-driven, scope = `packages/haiku-ui/src/**`)

Each migration is a small, atomic commit. Do NOT batch.

E1. **`text-[10px]` → `text-xs` (or `text-[11px] font-semibold/font-bold`)**
   - `StageProgressStrip.tsx:65` — label text is `text-[10px] font-medium`. Lift to `text-[11px] font-semibold` (tight column; `text-xs` may wrap). Acceptable per §1.4 exception.
   - `FeedbackPanel.tsx:171` — visit-counter pill already `text-[10px] font-bold`. Lift to `text-[11px] font-bold` per DESIGN-TOKENS §2.4 (FB-02 explicit remediation).
   - `ReviewPage.tsx:1460` — badge is `text-[10px] font-semibold uppercase tracking-wider`. Lift to `text-[11px] font-semibold`.
   - `ReviewPage.tsx:1514` — same as above. Lift to `text-[11px] font-semibold`.

E2. **`focus:ring-1` → `focus-visible:ring-2`**
   - `ReviewSidebar.tsx:285` — textarea `focus:ring-1 focus:ring-teal-500`. Swap to `focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-stone-900`.
   - `ReviewSidebar.tsx:362` — same swap.

E3. **`opacity-50` on disabled buttons → token-based disabled pattern**
   - `QuestionPage.tsx:295` — `disabled:opacity-50 disabled:cursor-not-allowed` → `disabled:bg-teal-300 disabled:text-white disabled:cursor-not-allowed` (primary teal disabled fallback; not in §1.7's explicit table, so follow the green/amber pattern: lighter bg + full-opacity text). Also add `aria-disabled={!canSubmit}` or wire to the existing disabled condition. Same pattern for `DesignPicker.tsx:252`.
   - `ReviewSidebar.tsx:{404,418,431}` — Approve/RequestChanges buttons each have `disabled:opacity-50 disabled:cursor-not-allowed`. Swap to `disabled:bg-stone-100 disabled:text-stone-600 disabled:border-stone-400 dark:disabled:bg-stone-800 dark:disabled:text-stone-300 dark:disabled:border-stone-500 disabled:cursor-not-allowed`. Add `aria-disabled={disabled}` on each.

E4. **`opacity-60` on StageProgressStrip dot → token swap**
   - `StageProgressStrip.tsx:55` — `opacity-60` on the not-yet-visited dot. Replace the opacity with a muted border-only look: `border-stone-300 dark:border-stone-600` (already present); drop `bg-transparent cursor-not-allowed opacity-60` → `bg-transparent cursor-not-allowed`. The muted state reads correctly without opacity.

E5. **`w-80 lg:w-96` sidebar drift → canonical container vars**
   - `ReviewCurrentPage.tsx:175`, `ReviewSidebar.tsx:76`, `ReviewPage.tsx:451` — replace `w-80 lg:w-96` with `w-[var(--sidebar-width)] xl:w-[var(--sidebar-width-xl)]`.
   - **NOTE on `lg` vs `xl`**: the current code uses `lg:w-96` (breakpoint at 1024px); DESIGN-TOKENS §2.5 and unit spec both say `w-80 xl:w-96` (breakpoint at 1280px). The spec is canonical — migrate to `xl`. Verify no layout regression by running the review-app dev server and eyeballing at 1024–1280px; call out in commit message.

E6. **`text-stone-400`/`text-stone-500` on light surface — pair-aware scan**
   - Do NOT blanket-replace. Scan each hit: if the sibling `bg-*` or the element's ancestor background is a banned surface (white, stone-50, stone-100, amber-50/50, blue-50/50, green-50/30|60, sky-50) per §1.1a, lift the fg to `text-stone-600` and update the dark pair to `dark:text-stone-300` (if present) or add it.
   - Focus on: `DesignPicker.tsx` (multiple `text-stone-500` on white card), `ReviewContextHeader.tsx:28` (`bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400` — the exact banned pair, lift to `bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300`), `ReviewCurrentPage.tsx:97` (table header), plus any table-header or metadata line in `ReviewPage.tsx` / `ReviewSidebar.tsx` landing on `bg-white` or `bg-stone-50`.
   - Keep `text-stone-500` only where it appears over `bg-stone-200` or darker light surfaces (where it passes AA) — document exemptions inline via a code comment `// token-exempt: text-stone-500 on bg-stone-200 = 4.8:1 AA` so the grep audit passes and the rationale is auditable.

E7. **`StatusBadge.tsx` pending → idle rename + contrast fix**
   - Rename the map key `pending` → `idle` AND lift colors to `bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300` per DESIGN-TOKENS §1.2 + §1.2a.
   - Keep a back-compat check in the default branch that accepts `status === "pending"` and routes to the `idle` colors, per §1.2 lines 63-69 — this preserves existing callers passing `"pending"` until a separate unit migrates them.
   - Update the test (if present in `tests/`) to cover both `status="idle"` and `status="pending"` both resolving to the lifted stone-600 pair.

### F. vitest config update

F1. **`packages/haiku-ui/vitest.config.ts`** (EDIT)
   - Add `"src/**/*.{test,spec}.{ts,tsx}"` to the `include` array so `src/components/primitives/__tests__/*.test.tsx` runs. Keep existing `tests/**/*` globs intact.

## Verification Commands (in order)

Run all commands from the unit worktree root: `/Volumes/dev/src/github.com/gigsmart/haiku-method/.claude/worktrees/delegated-swimming-honey/.haiku/worktrees/universal-feedback-model-and-review-recovery/unit-04-design-token-system`.

1. `cd packages/haiku-ui && npx tsc --noEmit`
   — type-check passes, including new primitives and their tests.
2. `cd packages/haiku-ui && npx vitest run`
   — every primitive test passes, existing parity/websocket tests still pass.
3. `node packages/haiku-ui/scripts/verify-tokens.mjs`
   — exits 0, emits parity summary: `OK · N tokens verified · 0 mismatches`.
4. `node packages/haiku-ui/scripts/audit-contrast.mjs --mode=tokens`
   — exits 0, writes `packages/haiku-ui/reports/contrast-tokens.json` with all pairs ≥ threshold.
5. `node packages/haiku-ui/scripts/audit-banned-patterns.mjs --profile=tokens`
   — exits 0, `0 hits` across all 9 rules.
6. Spot-grep verifications (each must return 0 lines):
   - `grep -rE 'text-\[(9|10)px\]' packages/haiku-ui/src --include='*.ts' --include='*.tsx' --include='*.css'`
   - `grep -rE 'focus:ring-1\b' packages/haiku-ui/src`
   - `grep -rE '\bopacity-(50|60|70)\b' packages/haiku-ui/src --include='*.tsx'`
   - `grep -rE 'w-80\s+lg:w-96' packages/haiku-ui/src`
   - `grep -rE 'max-w-\[1400px\]' packages/haiku-ui/src`
7. `cd packages/haiku-ui && npm run build`
   — Vite bundle succeeds; no Tailwind-class not-found warnings; output bundle is well-formed.

## Commit Sequence

Commit after each logical step to keep history bisectable and limit diff blast radius per `unit_scope_violation` protection.

1. `haiku(unit-04/planner): tactical plan` — this file.
2. `haiku(unit-04/builder): index.css @theme + container vars + reduced-motion keyframes`
3. `haiku(unit-04/builder): tailwind.config.ts shell + safelist`
4. `haiku(unit-04/builder): primitives — Button + test`
5. `haiku(unit-04/builder): primitives — Badge + test`
6. `haiku(unit-04/builder): primitives — Card + test`
7. `haiku(unit-04/builder): primitives — Chip + test`
8. `haiku(unit-04/builder): primitives — Divider + test`
9. `haiku(unit-04/builder): primitives — Input + test`
10. `haiku(unit-04/builder): vitest include primitives __tests__`
11. `haiku(unit-04/builder): verify-tokens.mjs script`
12. `haiku(unit-04/builder): audit-contrast.mjs script + reports/`
13. `haiku(unit-04/builder): audit-banned-patterns.mjs + audit-config.json`
14. `haiku(unit-04/builder): migrate text-[10px] → text-[11px] across StageProgressStrip/FeedbackPanel/ReviewPage`
15. `haiku(unit-04/builder): migrate focus:ring-1 → focus-visible:ring-2 in ReviewSidebar`
16. `haiku(unit-04/builder): migrate disabled opacity-50 → token-based disabled pattern`
17. `haiku(unit-04/builder): migrate opacity-60 → muted-border pattern in StageProgressStrip`
18. `haiku(unit-04/builder): migrate w-80 lg:w-96 → w-[var(--sidebar-width)] xl:w-[var(--sidebar-width-xl)]`
19. `haiku(unit-04/builder): pair-aware text-stone-500 → text-stone-600 migration`
20. `haiku(unit-04/builder): StatusBadge pending → idle rename + contrast fix`
21. `haiku(unit-04/builder): final verification — all 7 checks pass`

## Out of Scope — Explicitly NOT This Unit

- `packages/haiku/src/templates/` (SSR templates, gray-*/blue-* palette) — SPA/SSR split per DESIGN-TOKENS §3; token-migration for SSR is not scoped here.
- `packages/shared/` components — separate workspace, downstream concern.
- Component internals beyond the class-string swaps in E1-E7 (e.g. restructuring `ReviewPage.tsx`'s layout, re-architecting `FeedbackPanel.tsx` — these live in unit-08, unit-09, etc.).
- Rendered-DOM contrast audit (`--mode=rendered`) — unit-15.
- `{origin}` JSX regex + `"Show agent feedback"` regex — reserved for unit-15's stage-wide profile (they target downstream feedback-panel code).
- Hard-coded hex in `.annotation-pin` / `.inline-highlight` / `.comment-entry` / `.margin-comment` — deferred to unit-13 (annotation canvas).
- Any changes to `packages/haiku-ui/tests/parity.spec.tsx` — unit-03's contract; leave untouched.

## Anti-pattern Checks (self-audit before advance_hat)

- [ ] Every primitive has a sibling `__tests__/<name>.test.tsx` with variant + disabled coverage.
- [ ] `npx tsc --noEmit` exits 0.
- [ ] All 3 audit scripts exit 0.
- [ ] No `packages/haiku/src/**` or `packages/shared/**` files modified (scope stays inside `packages/haiku-ui/`).
- [ ] No `disabled:opacity-*` in any newly-authored or migrated button in `packages/haiku-ui/src/`.
- [ ] No `focus:ring-1` remaining.
- [ ] No `text-[10px]` / `text-[9px]` remaining in `packages/haiku-ui/src/**/*.{ts,tsx,css}` (exclusions: tests, snapshots).
- [ ] Every `disabled` button carries `aria-disabled="true"` alongside the native attribute.
- [ ] `StatusBadge` pending-key renamed to `idle` with back-compat; colors lifted.
- [ ] Sidebar width drift replaced by `var(--sidebar-width)` / `var(--sidebar-width-xl)` in all 3 sites.

---

## Postscript — 2026-04-21 (FB-18 fix bolt)

Reduced to a single `Input` primitive by FB-18 fix bolt — aspirational primitives (Button/Badge/Card/Chip/Divider) deleted until consumers exist. `Input.tsx` was moved from `packages/haiku-ui/src/components/primitives/Input.tsx` to `packages/haiku-ui/src/components/Input.tsx`; the `primitives/` folder and barrel were dissolved. The only external consumer (`pages/direction/DirectionPage.tsx`) was rewired to import from the new path. Unit-04 deliverables + Scope bullet + completion criterion aligned to the shipped footprint. See feedback file `stages/development/feedback/18-primitives-directory-is-5-6-dead-code-premature-generalizati.md` for rationale. The historical plan body above is preserved verbatim as the record of what bolt 1 intended.
