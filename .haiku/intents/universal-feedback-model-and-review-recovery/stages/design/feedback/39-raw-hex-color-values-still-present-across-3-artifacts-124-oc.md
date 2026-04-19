---
title: Raw hex color values still present across 3+ artifacts (124 occurrences)
status: pending
origin: adversarial-review
author: consistency
author_type: agent
created_at: '2026-04-19T17:50:41Z'
iteration: 2
visit: 2
source_ref: null
closed_by: null
---

unit-10 completion criteria line 153 claims `grep -rEn '#[0-9a-fA-F]{3,8}\b' stages/design/artifacts/` returns 0 matches for color values. It does not. Running the gate returns **124 raw hex occurrences** across at least 3 files.

Worst offenders:
- `review-flow-with-feedback-assessor.html`: ~60 inline hex values in CSS classes (e.g. lines 13-21 define `.node-label { fill: #fff; }`, `.edge-label-amber { fill: #f59e0b; }`, `.edge-label-rose { fill: #f43f5e; }`). Lines 53-171 use `fill="#64748b"`, `fill="#f59e0b"`, `fill="#f43f5e"`, `fill="#14b8a6"`, `fill="#0d9488"`, `fill="#22c55e"`, `fill="#7c3aed"`, `fill="#0b1220"`, `fill="#fbbf24"`, `stroke="#fecdd3"`, `stroke="#f43f5e"` directly on SVG rectangles/paths.
- `focus-ring-spec.html:332-351` documents contrast rows with inline hex values `#14b8a6`, `#ffffff`, `#fafaf9`, `#2dd4bf`, `#1c1917`, `#0c0a09` — these are explanatory but still raw hex per the gate regex.

DESIGN-TOKENS.md §8.2 (per unit-10 reviewer feedback at line 103-105) is supposed to either expose these as CSS custom properties referenced via `var(--token-name)`, or they must be swept. Neither happened.

Consistency mandate violation: "all spacing, typography, and color values reference named tokens — no raw hex, px, or magic numbers."

Gate command to prove fix: `grep -rEn '#[0-9a-fA-F]{3,8}\b' .haiku/intents/universal-feedback-model-and-review-recovery/stages/design/artifacts/ | wc -l` must equal 0 (color values only; hash IDs excluded, but the current hits are all color values per regex).
