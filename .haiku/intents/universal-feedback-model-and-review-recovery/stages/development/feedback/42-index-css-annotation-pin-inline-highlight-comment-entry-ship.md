---
title: >-
  index.css annotation-pin + inline-highlight + comment-entry ship raw hex +
  rgba magic numbers
status: pending
origin: adversarial-review
author: consistency (from design)
author_type: agent
created_at: '2026-04-21T20:23:54Z'
iteration: 0
visit: 0
source_ref: null
closed_by: null
bolt: 0
upstream_stage: null
---

**Mandate check:** "all spacing, typography, and color values reference named tokens — no raw hex, px, or magic numbers."

`packages/haiku-ui/src/index.css` is the only file the `banned-raw-hex` audit rule in `packages/haiku-ui/audit-config.json:158-167` explicitly **excludes** — a broad "we define tokens here" carve-out. That exception is fine for `@theme { --color-feedback-* }` etc. but it's being used to smuggle **component-level raw colors** into global CSS that never land in a token:

- **Lines 127-145 (.annotation-pin):** `background: #e11d48`, `color: #fff`, `box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3)`, `border: 2px solid #fff`. None of these are tokenized. DESIGN-TOKENS §1.8 line 223 even flags the `#e11d48` as "hardcoded in canvas" — it's now also hardcoded in global CSS. `AnnotationCanvas.tsx:130,478` annotates the canvas-2D hex as `audit-allow: canvas 2D context takes raw hex (rose-600)` — but the CSS render path is not canvas and has no such excuse.

- **Line 159 (.annotation-pin.selected):** `outline: 2px solid #3b82f6`. Raw blue hex that doesn't match any declared token. DESIGN-TOKENS §1.8 line 225 lists this exact hex under "Active comment border" as a hardcoded magic.

- **Lines 165-173 (.inline-highlight):** `background-color: rgba(251, 191, 36, 0.3)` / `rgba(251, 191, 36, 0.5)` / `border-bottom: 2px solid rgba(251, 191, 36, 0.7)`. These are `amber-400` with raw alpha — should route through a `--color-highlight-*` token or Tailwind `bg-amber-400/30`.

- **Lines 195-196 (.comment-entry.active):** `border-color: #3b82f6`, `background-color: rgba(59, 130, 246, 0.05)`. Same blue-500 magic, three lines apart.

- **Lines 251-253 (dialog.feedback-sheet::backdrop):** `background: rgba(0, 0, 0, 0.5)`. Raw backdrop magic — should be `--color-scrim: oklch(0% 0 0 / 0.5)` or similar.

- **Lines 247-249 (dark mode dialog.feedback-sheet):** `background: #1c1917` — this is `stone-900` but pasted as hex instead of referencing the Tailwind stone-900 oklch token already in `@theme`.

- **Lines 302-309 (@keyframes feedback-fab-pulse):** `rgb(13 148 136 / 0.4)` / `rgb(13 148 136 / 0)` — that's `teal-600` pasted as raw rgb instead of `color-mix(in oklch, var(--color-teal-600), transparent 60%)` or a `--color-pulse-ring` token.

**Impact:** a future accent-color swap (teal → another brand color, rose → another error shade) must be hand-patched in index.css — the token table looks authoritative but half the runtime color values bypass it. The audit pretends the file is ok; the reality is it's where all the drift hides.

**Fix:** promote every hex/rgba/rgb literal in index.css to a named CSS custom property in `:root` or `@theme`, then reference it. Remove the blanket `src/index.css` exclusion from `banned-raw-hex` and instead allowlist the specific token-declaration lines with `/* audit-allow: canonical token declaration */` comments.
