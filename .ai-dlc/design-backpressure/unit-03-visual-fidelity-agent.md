---
status: in_progress
last_updated: ""
depends_on:
  - unit-01-screenshot-infrastructure
  - unit-02-design-ref-resolver
branch: ai-dlc/design-backpressure/03-visual-fidelity-agent
discipline: backend
pass: ""
workflow: ""
ticket: ""
---

# unit-03-visual-fidelity-agent

## Description
Implement the Visual Fidelity review delegation agent that integrates into the reviewer hat. This agent captures screenshots of built output, resolves design references, performs AI vision comparison, and produces structured findings that integrate into the reviewer's existing `REVIEW COMPLETE` marker. When visual fidelity fails, the reviewer issues `REQUEST CHANGES` with specific visual feedback that loops back to the builder.

## Discipline
backend - This unit will be executed by backend-focused agents.

## Domain Entities
- **ComparisonReport** — The primary output of this unit. Contains verdict (pass/fail), fidelity score, and categorized findings. Written to `.ai-dlc/{intent-slug}/screenshots/{unit-slug}/comparison-report.md`.
- **VisualFinding** — Individual discrepancies within a ComparisonReport. Categories: layout, color, typography, states, responsive, flow. Severity: high (blocks approval), medium (should fix), low (suggestion).
- **ReviewerHat** — This unit modifies the reviewer hat's documentation and delegation agent list to include Visual Fidelity.

## Data Sources
- **Screenshots** (filesystem) — Built output screenshots captured by unit-01's infrastructure, stored in `.ai-dlc/{intent-slug}/screenshots/{unit-slug}/`
- **Design references** (filesystem) — Reference screenshots produced by unit-02's resolver, stored alongside built screenshots with `ref-` prefix
- **manifest.json** (filesystem) — Screenshot metadata from capture infrastructure (unit-01), lists available screenshots and breakpoints
- **AI vision** — Claude vision capabilities receive paired images (built + reference) for subjective comparison
- **Unit frontmatter** (filesystem) — Determines whether visual gate applies (auto-detection of UI-producing units)

## Technical Specification

### 1. Visual Gate Activation (Auto-Detection)
Create `plugin/lib/detect-visual-gate.sh` to determine whether a unit should trigger visual fidelity review:

**Heuristic (any match activates the gate):**
- Unit has `discipline: frontend` or `discipline: design`
- Unit has `design_ref:` field in frontmatter
- Unit has `wireframe:` field in frontmatter
- Unit's changed files include common UI file extensions: `.tsx`, `.jsx`, `.vue`, `.svelte`, `.html`, `.css`, `.scss`
- Unit spec mentions UI-related terms: "page", "view", "screen", "component", "layout", "dashboard", "form"

**Input:** `--unit-file <path>` `--changed-files <file-list>`
**Output:** `VISUAL_GATE=true|false` to stdout

### 2. Vision Comparison Prompt Template
Create `plugin/lib/vision-comparison-prompt.md` — the structured prompt sent to Claude vision alongside the screenshot pair:

```markdown
You are a visual fidelity reviewer comparing a built UI output against its design reference.

## Fidelity Level: {fidelity}
{Fidelity-specific instructions:}
- **high**: Expect close visual match. Compare colors (exact token match), typography (sizes, weights, families), spacing (margins, padding), layout (grid alignment, element positioning), and interactive states.
- **medium**: Expect structural similarity. Allow intentional changes from the follow-up scope. Compare layout structure, navigation flow, and key UI elements. Minor color/spacing differences are acceptable if structural intent is preserved.
- **low**: Expect structural/layout match ONLY. The reference is a gray/white wireframe — colors, fonts, and styling WILL differ. Compare: element positioning, hierarchy, content structure, navigation flow, information architecture. Ignore: colors, typography, visual polish, icons, images.

## What to Evaluate
For each breakpoint, analyze:
1. **Layout & Structure** — Is the element hierarchy correct? Are sections positioned as designed? Is the grid/flex layout matching?
2. **Colors** (skip for low fidelity) — Do colors match design tokens? Are contrast ratios maintained?
3. **Typography** (skip for low fidelity) — Are font sizes, weights, and families correct?
4. **Interactive States** — Are hover, focus, active, disabled, and error states present and correct?
5. **Responsive Behavior** — Does the layout adapt correctly across breakpoints? Are elements properly stacked/reflowed?
6. **UX Flow** — Does the navigation structure match? Are user journey paths correct?

## Output Format
Return a JSON array of findings:
```json
[
  {
    "category": "layout|color|typography|states|responsive|flow",
    "severity": "high|medium|low",
    "description": "What the discrepancy is",
    "location": "Where in the UI (e.g., 'header navigation', 'main content area', 'footer')",
    "reference_detail": "What the design reference shows",
    "actual_detail": "What the built output shows",
    "suggestion": "How to fix this"
  }
]
```

If the built output matches the design reference within the fidelity tolerance, return an empty array `[]`.

## Verdict
- **PASS**: Zero high-severity findings
- **FAIL**: One or more high-severity findings
```

### 3. Comparison Orchestration Script
Create `plugin/lib/run-visual-comparison.sh` — the main orchestration that ties capture, reference resolution, and vision comparison together:

**Input:** `--intent-slug <slug>` `--unit-slug <slug>` `--intent-dir <path>` `--base-url <url>` (optional, for web capture)

**Flow:**
1. Run detect-visual-gate.sh — if gate is inactive, exit 0 with "VISUAL_GATE=false"
2. Run resolve-design-ref.sh (unit-02) to get reference info (type, fidelity, views)
3. Generate reference screenshots using capture-screenshots.sh (unit-01) with `--prefix ref-`
4. Capture built output screenshots using capture-screenshots.sh (unit-01)
5. For each breakpoint × view pair:
   a. Read the built screenshot and reference screenshot as images
   b. Load the vision comparison prompt template, inject fidelity level
   c. Send both images + prompt to Claude vision via the Read tool (which supports image files)
   d. Parse the JSON findings from the response
6. Aggregate findings across all breakpoints/views
7. Determine verdict: PASS if zero high-severity findings, FAIL otherwise
8. Write comparison report to `.ai-dlc/{intent-slug}/screenshots/{unit-slug}/comparison-report.md`
9. Exit with code reflecting verdict (0 for PASS, 1 for FAIL)

**Output:** comparison-report.md:
```markdown
---
verdict: pass|fail
fidelity: high|medium|low
reference_type: external|iteration|wireframe
breakpoints_compared: 3
findings_count: {count}
high_severity: {count}
medium_severity: {count}
low_severity: {count}
---

# Visual Fidelity Report: {unit-slug}

## Summary
Verdict: **{PASS|FAIL}**
Reference: {type} ({fidelity} fidelity)
Breakpoints: mobile (375px), tablet (768px), desktop (1280px)

## Findings

### High Severity (blocking)
{numbered list or "None"}

### Medium Severity (should fix)
{numbered list or "None"}

### Low Severity (suggestions)
{numbered list or "None"}
```

### 4. Reviewer Hat Integration
Modify `plugin/hats/reviewer.md` to include the Visual Fidelity delegation agent:

**Add to the reviewer's agent team (Step 4 area):**

| Agent | Focus | Activation |
|-------|-------|------------|
| **Visual Fidelity** | Design reference comparison via AI vision | Units that produce user-visible output (detect-visual-gate.sh returns true) |

**Add to reviewer delegation process:**
- After spawning other review agents, also spawn Visual Fidelity agent if the unit triggers the visual gate
- Visual Fidelity agent runs `run-visual-comparison.sh` and returns the comparison report
- Reviewer consolidates visual findings with other agent results
- Visual high-severity findings are treated as blocking (same as other high-confidence issues)

**Add to REVIEW COMPLETE structured marker:**
```markdown
**Visual Fidelity:** {PASS|FAIL|N/A} — {findings_count} findings ({high} high, {medium} medium, {low} low)
```

**Hard gate behavior:**
- If visual gate is active and comparison fails → reviewer MUST issue `Decision: REQUEST CHANGES`
- If visual gate is active but capture fails (Playwright error, dev server down, etc.) → reviewer MUST issue `Decision: REQUEST CHANGES` with infrastructure failure details
- The visual gate is never silently skipped when it should be active

### 5. Builder Feedback Integration
When the reviewer issues REQUEST CHANGES with visual findings, ensure the builder receives actionable feedback:

**Modify `plugin/hats/builder.md` or `plugin/hats/builder-reference.md`:**
- Add guidance for handling visual fidelity feedback:
  - Read the comparison-report.md to understand what visual differences were found
  - Focus on high-severity findings first
  - Use the `reference_detail` and `actual_detail` fields to understand what's expected vs what exists
  - The `suggestion` field provides specific fix guidance
  - After fixing, the visual gate will re-run on the next review cycle

**Add to builder's "Use backpressure as guidance" section:**
```markdown
You MUST treat visual fidelity failures as implementation guidance:
- Read `.ai-dlc/{intent}/screenshots/{unit}/comparison-report.md` for specific visual differences
- High-severity findings are blocking — fix them before re-submitting
- Reference screenshots at `.ai-dlc/{intent}/screenshots/{unit}/ref-*.png` show the design intent
- Built screenshots at `.ai-dlc/{intent}/screenshots/{unit}/*.png` show what you produced
- Compare them to understand the gap
```

## Success Criteria
- [ ] `detect-visual-gate.sh` correctly identifies units that produce user-visible output using the defined heuristic
- [ ] Vision comparison prompt template exists with fidelity-aware instructions for high, medium, and low references
- [ ] `run-visual-comparison.sh` orchestrates end-to-end: gate detection → reference resolution → capture → vision comparison → report
- [ ] Comparison report written with YAML frontmatter (verdict, fidelity, counts) and categorized findings
- [ ] Reviewer hat documentation updated with Visual Fidelity delegation agent entry and activation criteria
- [ ] `REVIEW COMPLETE` structured marker includes Visual Fidelity line
- [ ] Visual failures result in `Decision: REQUEST CHANGES` with visual feedback — never silently skipped
- [ ] Builder documentation updated with guidance for handling visual fidelity feedback
- [ ] Infrastructure failures (capture failure, dev server down) also result in review failure, not silent skip

## Risks
- **Vision model subjectivity**: AI vision analysis is inherently subjective — may flag acceptable differences or miss real issues. Mitigation: the fidelity level adjusts tolerance, and the comparison prompt is carefully structured. Low-severity findings don't block.
- **Context window size**: Sending multiple screenshot pairs per review may consume significant context. Mitigation: process breakpoints sequentially rather than all at once. Summarize findings between breakpoints.
- **False positives at low fidelity**: Wireframe comparisons may flag every color/font difference. Mitigation: the prompt explicitly instructs the model to skip color/typography checks for low-fidelity references.
- **CI/CD headless capture**: Playwright may not work in all CI environments. Mitigation: this is a hard failure (by design) — teams must ensure their CI supports Playwright or use the manual capture provider.

## Boundaries
This unit does NOT handle:
- Screenshot capture mechanics — delegates to unit-01's infrastructure
- Design reference resolution — delegates to unit-02's resolver
- Backpressure documentation — unit-04 covers that
- New capture providers — follow-up intents

This unit OWNS the vision comparison logic, reviewer integration, builder feedback, and the gate enforcement behavior.

## Notes
- The vision comparison uses Claude's native image understanding — no external visual regression tool needed
- The Read tool can read image files (PNG, JPG) and present them visually, which is how the vision comparison works in practice
- The comparison prompt is the most critical artifact in this unit — it determines what gets flagged and what passes. Iterate on it carefully.
- Consider adding a `--dry-run` mode to `run-visual-comparison.sh` that captures screenshots but skips the vision comparison (useful for debugging capture issues)
- The reviewer-reference.md anti-rationalization table should be extended: "The wireframes are too different to compare" → "The fidelity level adjusts tolerance. If wireframes are the only reference, compare structure, not pixels."
