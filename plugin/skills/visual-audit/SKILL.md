---
description: Visual audit of UI implementation using Playwright screenshots compared against design specs
disable-model-invocation: true
user-invocable: true
argument-hint: "[url-or-path]"
---

# Visual Audit

Capture Playwright screenshots of a UI implementation at key breakpoints and compare them against design specs to produce a structured visual audit report.

## Prerequisites

- **Playwright** must be available. If not installed, run:
  ```bash
  npx playwright install chromium
  ```
- A running or serveable URL (or local file path) for the implementation under review.
- Design specs to compare against: wireframes in `.ai-dlc/{intent}/mockups/`, Figma references, or design tokens defined in the project.

---

## Step 1: Capture Screenshots

Take Playwright screenshots at three canonical breakpoints:

| Breakpoint | Viewport | Output |
|------------|----------|--------|
| Mobile | 375 x 812 | `/tmp/audit-mobile.png` |
| Tablet | 768 x 1024 | `/tmp/audit-tablet.png` |
| Desktop | 1440 x 900 | `/tmp/audit-desktop.png` |

```bash
URL="$1"
npx playwright screenshot --viewport-size="375,812" "$URL" /tmp/audit-mobile.png
npx playwright screenshot --viewport-size="768,1024" "$URL" /tmp/audit-tablet.png
npx playwright screenshot --viewport-size="1440,900" "$URL" /tmp/audit-desktop.png
```

If the target is a local file, prefix with `file://` or start a local dev server first.

---

## Step 2: Locate Design Specs

Gather the reference materials for comparison:

1. **Wireframes** — Look for mockup files in `.ai-dlc/{intent}/mockups/` (HTML wireframes, PNGs, or SVGs generated during elaboration).
2. **Figma references** — If a design provider is configured, retrieve exported frames or thumbnails via MCP tools.
3. **Design tokens** — Collect color tokens, typography scales, and spacing scales from the project's design system (CSS custom properties, theme files, Tailwind config, etc.).

If no design specs are found, note this in the report and audit against general best practices only.

---

## Step 3: Run the Six-Pillar Visual Audit

Evaluate the captured screenshots against the design specs across six pillars. For each pillar, assign a score: **PASS**, **WARN**, or **FAIL**.

### Pillar 1: Layout

Does the layout match the spec at each breakpoint?

- Compare structural composition (header, sidebar, content, footer regions) against wireframes.
- Verify element ordering and visual hierarchy.
- Check that grid or flex layout behavior matches the spec.
- **PASS**: Layout matches spec at all three breakpoints.
- **WARN**: Minor deviations that do not break usability (e.g., slightly different max-width).
- **FAIL**: Structural mismatch — missing regions, wrong element order, or broken layout.

### Pillar 2: Typography

Correct fonts, sizes, weights, and line heights?

- Compare heading levels, body text, and caption styles against the design spec.
- Verify font family, font weight, font size, and line height at each breakpoint.
- Check that responsive type scaling is applied where specified.
- **PASS**: All typographic properties match the spec.
- **WARN**: Minor deviations (e.g., line height off by 2px).
- **FAIL**: Wrong font family, missing responsive scaling, or unreadable text.

### Pillar 3: Color

Colors match design tokens? Contrast ratios meet WCAG AA?

- Match colors against the project's **named color tokens** (CSS custom properties, theme variables) — not raw hex values.
- Verify text-on-background contrast meets WCAG AA (4.5:1 for normal text, 3:1 for large text).
- Check interactive element colors (links, buttons) against token definitions.
- **PASS**: All colors use correct tokens and contrast ratios meet AA.
- **WARN**: Colors are correct but contrast is borderline (between 3:1 and 4.5:1 for normal text).
- **FAIL**: Wrong color tokens used or contrast fails AA.

### Pillar 4: Spacing

Margins, padding, and gaps follow the design system scale?

- Verify spacing between elements matches the design system's spacing scale.
- Check component internal padding against spec.
- Confirm consistent gap usage in flex/grid containers.
- **PASS**: Spacing consistently follows the design system scale.
- **WARN**: Minor inconsistencies (e.g., one-off spacing that deviates by one scale step).
- **FAIL**: Spacing is visually broken or significantly deviates from the spec.

### Pillar 5: Interactions

Hover, focus, and active states implemented?

- Verify hover states on interactive elements (buttons, links, cards).
- Check focus indicators for keyboard navigation (visible focus ring).
- Confirm active/pressed states where specified.
- Test disabled states if applicable.
- **PASS**: All specified interaction states are implemented and accessible.
- **WARN**: States exist but are subtle or inconsistent.
- **FAIL**: Missing hover/focus states or focus indicators not visible.

### Pillar 6: Responsiveness

Transitions between breakpoints are smooth?

- Resize between the three breakpoints and check for layout breaks.
- Verify no horizontal overflow or content clipping at intermediate widths.
- Confirm images and media scale appropriately.
- Check that navigation patterns adapt correctly (e.g., hamburger menu on mobile).
- **PASS**: Smooth transitions across all breakpoints with no layout breaks.
- **WARN**: Minor issues at intermediate widths that self-correct at standard breakpoints.
- **FAIL**: Layout breaks, content overflow, or navigation unusable at a breakpoint.

---

## Step 4: Generate Audit Report

Produce a structured report summarizing findings. Write the report to `.ai-dlc/{intent}/visual-audit-report.md` with the following format:

```markdown
# Visual Audit Report

**URL**: {url}
**Date**: {date}
**Intent**: {intent-slug}

## Summary

| Pillar | Score | Notes |
|--------|-------|-------|
| Layout | PASS/WARN/FAIL | Brief summary |
| Typography | PASS/WARN/FAIL | Brief summary |
| Color | PASS/WARN/FAIL | Brief summary |
| Spacing | PASS/WARN/FAIL | Brief summary |
| Interactions | PASS/WARN/FAIL | Brief summary |
| Responsiveness | PASS/WARN/FAIL | Brief summary |

## Detailed Findings

### Layout
{detailed findings with screenshot references}

### Typography
{detailed findings}

### Color
{detailed findings including contrast ratios}

### Spacing
{detailed findings}

### Interactions
{detailed findings}

### Responsiveness
{detailed findings}

## Screenshots

- Mobile (375px): `/tmp/audit-mobile.png`
- Tablet (768px): `/tmp/audit-tablet.png`
- Desktop (1440px): `/tmp/audit-desktop.png`

## Recommendations

{Prioritized list of fixes, grouped by severity}
```

---

## Step 5: Present Results

Display the summary table to the user and highlight any **FAIL** or **WARN** items that need attention. If all pillars pass, confirm that the implementation matches the design spec.
