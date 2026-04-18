---
title: Stage-wide token audit and palette reconciliation
type: design
closes:
  - FB-11
  - FB-16
  - FB-18
  - FB-21
  - FB-23
  - FB-29
depends_on: []
inputs:
  - stages/design/DESIGN-BRIEF.md
  - knowledge/DESIGN-TOKENS.md
  - stages/design/artifacts/feedback-card-states.html
  - stages/design/artifacts/comment-to-feedback-flow.html
  - stages/design/artifacts/review-ui-mockup.html
  - stages/design/artifacts/comments-list-with-agent-toggle.html
  - stages/design/artifacts/review-package-structure.html
  - stages/design/artifacts/feedback-inline-desktop.html
  - stages/design/artifacts/review-context-header.html
  - stages/design/artifacts/rollback-reason-banner.html
  - stages/design/artifacts/assessor-summary-card.html
  - stages/design/artifacts/revisit-unit-list.html
  - stages/design/artifacts/feedback-inline-mobile.html
  - stages/design/artifacts/feedback-lifecycle-transitions.html
  - stages/design/artifacts/stage-progress-strip.html
  - stages/design/artifacts/review-flow-with-feedback-assessor.html
  - stages/design/artifacts/annotation-gesture-spec.html
  - stages/design/artifacts/focus-ring-spec.html
  - >-
    stages/design/feedback/11-design-artifacts-use-wrong-tailwind-palette-gray-instead-of.md
  - >-
    stages/design/feedback/16-raw-hex-values-leak-into-artifact-css-despite-token-mandate.md
  - >-
    stages/design/feedback/18-feedback-status-badge-shades-drift-between-design-brief-and.md
  - >-
    stages/design/feedback/21-origin-badge-naming-and-colors-diverge-between-design-brief.md
  - >-
    stages/design/feedback/23-sidebar-width-tokens-inconsistent-across-artifacts.md
  - >-
    stages/design/feedback/29-breakpoint-thresholds-inconsistent-between-design-brief-and.md
outputs:
  - stages/design/token-audit-report.md
  - stages/design/audit-sweep-log.md
  - stages/design/DESIGN-BRIEF.md
  - knowledge/DESIGN-TOKENS.md
quality_gates:
  - >-
    grep -rn 'gray-' stages/design/artifacts/ returns 0 matches (palette sweep
    from gray-* to stone-* complete across all 14 affected files)
  - >-
    grep -rEn '#[0-9a-fA-F]{3,8}\b' stages/design/artifacts/ returns 0 matches
    for color values (all 125 raw hex occurrences replaced with Tailwind classes
    or DESIGN-TOKENS CSS variables)
  - >-
    Status-badge shade pairs reconciled: DESIGN-BRIEF §2 color mapping and §6
    WCAG table both specify the SAME shade pair for
    pending/addressed/closed/rejected, and every artifact uses the same shade
    pair
  - >-
    Origin-badge single-source-of-truth established: DESIGN-BRIEF §2 and
    feedback-card-states.html §4 list IDENTICAL {emoji, label, Tailwind color
    classes} for all 6 origins (adversarial-review, external-pr, external-mr,
    user-visual, user-chat, agent); any new palette colors (rose/violet/sky)
    added to DESIGN-TOKENS.md with measured contrast ratios
  - >-
    Sidebar width canonicalized: DESIGN-BRIEF §4 declares ONE responsive pattern
    (e.g. `w-80 lg:w-96`) and every sidebar container across all artifacts
    matches; `max-w-[1400px]` literal removed or adopted as a named layout token
    in DESIGN-TOKENS.md
  - >-
    Breakpoint set reconciled: DESIGN-BRIEF §4 and feedback-card-states.html §7
    both use the SAME breakpoints (Tailwind-aligned: md=768, lg=1024); every
    artifact that describes breakpoints uses matching thresholds
  - >-
    DESIGN-TOKENS.md updated with an 'audited tokens' section enumerating every
    palette, width, breakpoint, and shade fix applied, with a machine-verifiable
    grep pattern per row
status: active
bolt: 2
hat: designer
started_at: '2026-04-18T03:10:54Z'
hat_started_at: '2026-04-18T03:36:06Z'
iterations:
  - hat: designer
    started_at: '2026-04-18T03:10:54Z'
    completed_at: '2026-04-18T03:31:07Z'
    result: advance
  - hat: design-reviewer
    started_at: '2026-04-18T03:31:07Z'
    completed_at: '2026-04-18T03:36:06Z'
    result: reject
    reason: >-
      Two residual drifts that violate unit-10 gates. FB-18:
      feedback-card-states.html:56 uses `text-stone-600` for rejected while
      DESIGN-BRIEF §2 line 134 + §6 line 613 + all other artifacts (incl. same
      file line 158) use `text-stone-500` — fails "every artifact uses the same
      shade pair". FB-23: feedback-inline-desktop.html:304 wraps the review
      sidebar in `<div class="hidden lg:block w-80 shrink-0">`, missing the
      canonical `lg:w-96` bump declared in DESIGN-BRIEF §4 line 508 — fails
      "every sidebar container uses the canonical responsive width pattern".
      Both are one-line fixes. Cleanup (non-blocking): DESIGN-TOKENS §8.2 line
      595 falsely claims artifacts use `var(--layout-max-width)` — 22 literal
      `max-w-[1400px]` occurrences remain, 0 var refs; soften the §8.2 prose.
      All six grep gates otherwise pass (0 matches). See
      stages/design/artifacts/unit-10-review.md for exact fix strings.
  - hat: designer
    started_at: '2026-04-18T03:36:06Z'
    completed_at: null
    result: null
---
# Stage-wide token audit and palette reconciliation

## Scope

This unit unifies the stage's token surface so development inherits ONE palette, ONE shade map, ONE set of widths, and ONE breakpoint set. Six FB items converge on the same root cause: specs and artifacts drifted over three iterations and now contradict each other.

**FB-to-fix mapping:**

- **FB-11** (gray-* vs stone-*): sweep 14 artifacts enumerated in the feedback item — `feedback-card-states.html`, `comment-to-feedback-flow.html`, `review-ui-mockup.html`, `comments-list-with-agent-toggle.html`, `review-package-structure.html`, `feedback-inline-desktop.html`, `review-context-header.html`, `rollback-reason-banner.html`, `assessor-summary-card.html`, `revisit-unit-list.html`, `feedback-inline-mobile.html`, `feedback-lifecycle-transitions.html`, `stage-progress-strip.html`, `review-flow-with-feedback-assessor.html` — replace every `gray-N` with `stone-N` (same numeric shade).
- **FB-16** (raw hex → tokens): 10 files containing 125 raw hex occurrences, most egregious in `feedback-lifecycle-transitions.html` (arrow-stroke CSS classes with inline `#2563eb`, `#0d9488`, etc.) and `review-flow-with-feedback-assessor.html` (44 hex occurrences). Replace with Tailwind classes where a Tailwind context exists; where SVG attributes require literal values, define CSS custom properties in DESIGN-TOKENS.md and reference them via `var(--token-name)`.
- **FB-18** (badge shade drift 700 vs 800): pick one — recommend `-800` (higher contrast, already implemented in most artifacts) and update DESIGN-BRIEF §2 + §6 WCAG table to match. Update DESIGN-TOKENS.md's status-badge section.
- **FB-21** (origin-badge divergence): pick one design — recommend unit-05's colored pill (rose/violet/sky) for at-a-glance scanning. Update DESIGN-BRIEF §2 to match; add rose/violet/sky to DESIGN-TOKENS.md palette with measured contrast proof; unify emoji choices + labels across brief and artifacts.
- **FB-23** (sidebar widths): declare ONE responsive pattern in DESIGN-BRIEF §4 (`w-80 lg:w-96`), sweep artifacts to match; resolve `max-w-[1400px]` by either adding `--layout-max-width` (or `max-w-screen-2xl`) to DESIGN-TOKENS.md or replacing with a named Tailwind container width across all artifacts.
- **FB-29** (breakpoints): canonicalize on Tailwind-aligned (`md:` = 768px, `lg:` = 1024px). Update `feedback-card-states.html §7` responsive table to match DESIGN-BRIEF §4. Add the 28px-desktop footer-button rule and the mobile stack-to-full-width rule to DESIGN-BRIEF §4 so responsive behavior has one source of truth.

## Approach

The designer hat will:

1. Produce a `DESIGN-TOKENS.md` v2 with an "audited tokens" section listing every reconciled token and a grep pattern to verify.
2. Patch `DESIGN-BRIEF.md` §2, §4, §6 to match the audited tokens.
3. Sweep all affected artifacts with documented replacements (captured in `audit-sweep-log.md` so development can audit or replay the changes).
4. Produce a single `token-audit-report.md` summarizing what changed, which files were touched, and the grep commands that prove compliance.

The design-reviewer hat will re-run each grep command from the completion criteria and confirm zero violations.

The feedback-assessor hat (auto-injected) will independently re-run each `closes:` item's diagnostic (re-count `gray-*` hits, re-count raw hex occurrences, re-check badge-shade consistency between brief and artifacts, re-check origin-badge parity, re-measure sidebar widths, re-check breakpoint thresholds) and either confirm or reject each claim.

## Completion criteria

- [ ] `grep -rn 'gray-' stages/design/artifacts/` returns 0 matches
- [ ] `grep -rEn '#[0-9a-fA-F]{3,8}\b' stages/design/artifacts/` returns 0 matches for color values (SVG `stroke`/`fill` either use Tailwind or reference a CSS variable from DESIGN-TOKENS.md)
- [ ] DESIGN-BRIEF §2 status-badge shade pairs (pending/addressed/closed/rejected) are identical to every artifact's rendering of that badge
- [ ] DESIGN-BRIEF §6 WCAG contrast table rows match the chosen shade pairs
- [ ] DESIGN-BRIEF §2 origin-badge inventory (emoji + label + color classes) is identical to feedback-card-states.html §4 for all 6 origin types
- [ ] DESIGN-TOKENS.md lists rose-*, violet-*, sky-* in the palette section with measured contrast ratios against white and stone-950 backgrounds
- [ ] Every sidebar container in every artifact uses the canonical responsive width pattern
- [ ] `max-w-[1400px]` either removed from all artifacts or added to DESIGN-TOKENS.md as a named layout token referenced uniformly
- [ ] DESIGN-BRIEF §4 breakpoint thresholds (mobile <768, tablet 768–1023, desktop ≥1024) match feedback-card-states.html §7 and every other artifact that describes breakpoints
- [ ] DESIGN-BRIEF §4 documents the 28px-desktop footer-button rule and mobile stack-to-full-width rule
- [ ] `token-audit-report.md` written with grep commands that independently verify each of the above
