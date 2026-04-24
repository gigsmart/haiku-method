---
title: >-
  Sidebar width breakpoint inconsistent — brief §1/§3 still uses lg:w-96 after
  unit-16 canonicalized xl:w-96
status: closed
origin: adversarial-review
author: consistency
author_type: agent
created_at: '2026-04-20T20:18:29Z'
iteration: 0
visit: 0
source_ref: null
closed_by: 'fix-loop:FB-03:bolt-1'
bolt: 1
upstream_stage: null
---

## Problem

DESIGN-BRIEF §4 (lines 662–674) declares the canonical breakpoint as **unit-16 final**:

> The desktop cutover is **1280px** (Tailwind `xl`). The sidebar uses the canonical pair `w-80 xl:w-96` — 320px below `xl`, 384px at `xl` and above. `lg:` (1024px) is an intermediate breakpoint used for layout transitions only; the width change sits at `xl:`.

Three other sites in the same document (and DESIGN-TOKENS) still carry the pre-unit-16 `lg:w-96` pair:

1. DESIGN-BRIEF line 38 — "Design Language Reference" lists the sidebar layout as `w-80 lg:w-96 shrink-0 sticky top-16 ...` — this is stated as a "non-negotiable" pattern for every new component, yet contradicts §4's canonical rule.
2. DESIGN-BRIEF line 74 — layout ASCII: `Sidebar (w-80/w-96)` — ambiguous, doesn't specify the breakpoint.
3. DESIGN-TOKENS.md line 101 (§1.3 Spacing Tokens): `Sidebar width | w-80 lg:w-96` — directly contradicts brief §4.
4. DESIGN-TOKENS.md line 456 (§2.5 Panel Shell): `w-80 lg:w-96 shrink-0 sticky top-16 h-[calc(100vh-4rem)]` — same issue.

## Impact

Three concrete code-ready copy-paste sources (`Design Language Reference`, DESIGN-TOKENS §1.3 Spacing Tokens row, DESIGN-TOKENS §2.5 Panel Shell) ship `lg:w-96`, while the one place that declares the "canonical breakpoint note" says `xl:w-96`. An implementer will copy the token from the spacing table, land `lg:w-96`, and the breakpoint gate (if any) fails — or worse, ships with the wrong cutover silently.

## Fix

Update all four sites to `w-80 xl:w-96`:
- DESIGN-BRIEF.md:38 (Design Language Reference Sidebar layout)
- DESIGN-BRIEF.md:74 (layout ASCII — change to `Sidebar (w-80 → xl:w-96)` or similar)
- DESIGN-TOKENS.md:101 (Spacing Tokens table row)
- DESIGN-TOKENS.md:456 (§2.5 Panel Shell)

Cross-check: any artifact HTML that hardcodes `lg:w-96` on the sidebar container. (Not scanned in this review; flag for unit-16 audit.)

## Files
- `.haiku/intents/universal-feedback-model-and-review-recovery/stages/design/DESIGN-BRIEF.md:38, 74`
- `.haiku/intents/universal-feedback-model-and-review-recovery/knowledge/DESIGN-TOKENS.md:101, 456`
- Canonical rule: `.haiku/intents/universal-feedback-model-and-review-recovery/stages/design/DESIGN-BRIEF.md:662-674`
