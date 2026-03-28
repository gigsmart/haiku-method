# Builder Reference

Companion to the Builder hat. Loaded on-demand for design implementation guidance and detailed procedures.

## Design Implementation Guidance

When working with designs from design tools (Figma, Sketch, Adobe XD, etc.):

- **Download assets when possible.** Use design tool APIs or MCP tools to export images, icons, and SVGs for analysis rather than relying on visual inspection alone.
- **Match colors to named tokens, not raw values.** When extracting colors from designs, do NOT guess hex codes. Instead, match them to the project's existing color system — brand colors, design tokens, CSS custom properties, theme variables, or framework-level color names (e.g., `--color-primary`, `theme.colors.brand.500`, `text-blue-600`). Search the codebase for the color system first.
- **Legacy tools requiring browser inspection**: If you must use Chrome/browser to inspect a design tool that lacks API access, take extra care with color extraction. Cross-reference every color against the project's defined palette. If a color doesn't match any existing token, flag it — don't invent a new one.
- **Distinguish design annotations from UI elements.** Designers often annotate mockups with callouts, arrows, measurement labels, sticky notes, and text blocks that describe UX behavior or implementation details. These annotations are **guidance for you, not part of the design to implement.** Look for: redline measurements, numbered callouts, text outside the frame/artboard, comment threads, and annotation layers. Treat them as implementation instructions — extract and follow the guidance, but do not render them as UI elements.

## Visual Fidelity Feedback

When the reviewer issues REQUEST CHANGES with visual fidelity findings, use this process to resolve them:

### Reading the Comparison Report

1. Open `.ai-dlc/{intent}/screenshots/{unit}/comparison-report.md`
2. Check the `verdict:` field in frontmatter — FAIL means high-severity issues exist
3. Read the **High Severity** section first — these are blocking

### Understanding Findings

Each finding includes:

- **category** — What aspect failed (layout, color, typography, states, responsive, flow)
- **severity** — high (blocking), medium (should fix), low (suggestion)
- **reference_detail** — What the design reference shows
- **actual_detail** — What your built output shows
- **suggestion** — How to fix it

### Comparing Screenshots

- Reference screenshots: `.ai-dlc/{intent}/screenshots/{unit}/ref-*.png` — the design intent
- Built screenshots: `.ai-dlc/{intent}/screenshots/{unit}/*.png` (without ref- prefix) — what you produced
- Use the Read tool to view both images side by side and understand the gap
- Focus on the specific `location` mentioned in each finding

### Fixing Visual Issues

1. Fix all high-severity findings first
2. Address medium-severity findings if straightforward
3. Low-severity findings are optional suggestions
4. After fixing, the visual gate will re-run automatically on the next review cycle
5. Do NOT modify reference screenshots — they represent the design intent

### Fidelity Awareness

The fidelity level determines what counts as a failure:

- **high** — Colors, typography, spacing, and layout must closely match
- **medium** — Structural similarity required; minor styling differences are acceptable
- **low** — Only structure and layout matter; colors and typography will differ (wireframe reference)

If a finding seems incorrect given the fidelity level, note it in your commit message for the reviewer.

## Provider Sync Details

- If a `ticket` field exists in the current unit's frontmatter, **SHOULD** update the ticket status to **In Progress** using the ticketing provider's MCP tools
- If the unit is completed successfully, **SHOULD** update the ticket to **Done**
- If the unit is blocked, **SHOULD** flag the ticket as **Blocked** and add the blocker description as a comment
- If MCP tools are unavailable, skip silently — never block building on ticket updates
