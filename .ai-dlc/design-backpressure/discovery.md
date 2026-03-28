---
intent: design-backpressure
created: 2026-03-27
status: active
---

# Discovery Log: Design as Backpressure

Elaboration findings persisted during Phase 2.5 domain discovery.
Builders: read section headers for an overview, then dive into specific sections as needed.

## Codebase Pattern: Reviewer Hat — Two-Stage Verification

The reviewer hat (`plugin/hats/reviewer.md`, 296+ lines) uses a two-stage review:

**Stage 1: Spec Compliance** — Does implementation satisfy unit's completion criteria?
- Per-criterion PASS/FAIL with evidence using Chain-of-Verification (CoVe) pattern
- Stage 1 failures BLOCK approval regardless of Stage 2

**Stage 2: Code Quality** — Is code well-written?
- Findings scored by confidence: High (MUST fix, blocking), Medium (SHOULD fix), Low (MAY fix)

**10-step process** includes Step 4: "Verify criteria satisfaction" which already has design provider integration:
- Cross-references design provider for visual/UX compliance if configured
- Matches colors against **named color tokens** (not raw hex)
- Design annotations treated as implementation guidance, not UI elements

**Review delegation** for non-trivial units spawns specialized agents in parallel:
- Existing agents: Correctness, Security, Performance, Architecture, Test Quality, Code Quality, Accessibility, Responsive, Design System
- **Design System agent** already checks token usage, component conventions, visual consistency — but only at the code level (reading CSS/components), NOT via visual screenshots

**Structured output markers:**
- `## REVIEW COMPLETE` with `Decision: APPROVED` or `Decision: REQUEST CHANGES`
- REQUEST CHANGES includes categorized issues (High/Medium/Low confidence) and Failed Truths
- This structured marker is parsed by the construction loop to determine pass/fail

## Codebase Pattern: Builder Feedback Loop

Builder (`plugin/hats/builder.md`, 256 lines) receives reviewer feedback through:

1. **Reviewer outputs** `Decision: REQUEST CHANGES` with categorized issues
2. **Execute skill** detects rejection, increments `unitStates.{unit}.retries`
3. **If retries < 3:** Spawns new builder teammate with reviewer feedback in prompt
4. **If retries >= 3:** Marks unit as BLOCKED, documents in `blockers.md`

Builder treats all quality gate failures as implementation guidance:
- Test failures = spec violations (not test bugs)
- The same pattern would apply to visual fidelity failures

**Node Repair Operator** for graduated recovery: RETRY → DECOMPOSE → PRUNE → ESCALATE

## Codebase Pattern: Hard Gates in Advance Skill

Three hard gates in `plugin/skills/advance/SKILL.md`:

| Gate | Transition | What It Checks |
|------|-----------|----------------|
| PLAN_APPROVED | Planner → Builder | Plan exists in han keep |
| TESTS_PASS | Builder → Reviewer | `npm test`, `npm run lint`, `npm run typecheck` all pass |
| CRITERIA_MET | Reviewer → Completion | All criteria PASS with evidence in `review-result.json` |

Gates are shell commands that `exit 1` on failure, blocking the `/advance` command.

**Key insight for design backpressure:** The visual fidelity check should integrate into the CRITERIA_MET gate flow — if the reviewer's visual comparison fails, the review result will have `allPass: false`, and the gate blocks advancement naturally.

## Codebase Pattern: Backpressure Theory

From `plugin/skills/backpressure/SKILL.md`:

Backpressure = automated enforcement that blocks progress until quality passes. Creates intrinsic motivation: "If I don't write tests, I'll be blocked."

**Five existing backpressure types:** Test, Type, Lint, Build, Security

**Implementation:** Stop hooks (`han-plugin.yml`) with `if_changed` patterns for smart caching. Hooks run at Stop event, blocking if quality checks fail.

**Design backpressure would be the sixth type** — visual fidelity checking as a blocking quality gate.

## Codebase Pattern: Wireframe System

Elaboration Phase 6.25 generates low-fidelity HTML wireframes via `plugin/skills/elaborate-wireframes/SKILL.md`:

- **Storage:** `.ai-dlc/{intent-slug}/mockups/unit-{NN}-{slug}-wireframe.html`
- **Format:** Self-contained HTML5, no JS, no custom fonts, gray/white only
- **CSS classes:** `.screen`, `.field`, `.btn-primary`, `.placeholder`, `.flow`, `.note`
- **Unit frontmatter:** Updated with `wireframe: mockups/...` reference

**These wireframes serve as the lowest-fidelity design reference** when no external designs exist. The visual backpressure gate would compare built output against these wireframes (or higher-fidelity external designs when available).

## Codebase Pattern: Construction Loop State

State tracked in `iteration.json`:
```json
{
  "hat": "planner|builder|reviewer",
  "currentUnit": "unit-01-feature-name",
  "iteration": 1,
  "workflow": ["planner", "builder", "reviewer"],
  "unitStates": { ... },
  "status": "in_progress|blocked|complete"
}
```

Loop: Execute hat → `/advance` verifies gate → next hat → repeat until unit complete.
Max 50 iterations safety cap. Max 3 retries per unit via `/fail`.

## External Research: Playwright Screenshot Capture

Playwright is NOT currently used in the project. Adding it would be new infrastructure.

**For visual backpressure, Playwright would:**
1. Start dev server (or open static HTML files)
2. Navigate to relevant routes/pages
3. Capture screenshots at breakpoints: mobile (375px), tablet (768px), desktop (1280px)
4. Save screenshots for AI vision comparison

**Website stack:** Next.js 15, React 19, Tailwind 4, static export (`output: "export"`)
**Dev server:** `next dev` on port 3000

**No existing test infrastructure** in the website — Playwright would be the first.

## External Research: AI Vision for Design Comparison

Claude's vision capabilities can analyze screenshots against design references. The approach:

1. **Capture built output** as PNG screenshots via Playwright at multiple breakpoints
2. **Load design reference** — prioritized: external designs > previous iteration > wireframes
3. **Send both images to vision model** with a structured comparison prompt
4. **Receive structured feedback** on visual fidelity covering:
   - Layout & structure (element positioning, hierarchy, spacing, alignment)
   - Colors & typography (token compliance, font sizes, weights)
   - Interactive states (if multiple screenshots capture hover/focus/error)
   - Responsive behavior (comparing across breakpoints)
   - UX flow (navigation, transitions, user journey)
5. **Return pass/fail with specific diffs** for the builder to act on

**Key challenge:** Subjective analysis — the model must understand that wireframes are low-fidelity references, not pixel-perfect targets. The comparison should check structural fidelity and intent, not exact pixel matching.

## Architecture Decision: Integration Point

The visual design gate integrates into the **reviewer hat** as a new review delegation agent ("Visual Fidelity Review Agent") alongside existing agents (Correctness, Security, etc.).

**Flow:**
1. Reviewer identifies unit produces UI output
2. Reviewer spawns Visual Fidelity agent alongside other review agents
3. Visual Fidelity agent:
   a. Resolves design reference (external > previous iteration > wireframe)
   b. Runs Playwright to capture screenshots of built output
   c. Sends screenshots + reference to AI vision for comparison
   d. Returns structured findings (pass/fail with specific visual diffs)
4. Reviewer consolidates visual findings with other agent results
5. If visual fidelity fails → REQUEST CHANGES with visual feedback → builder iterates

**This approach:**
- Requires NO new hard gate (uses existing CRITERIA_MET flow)
- Requires NO new hat (reviewer gains a new capability)
- Follows existing delegation pattern (parallel specialized agents)
- Visual failures communicate to builder same as any reviewer finding

## Architecture Decision: Design Reference Resolution

Priority hierarchy for design references:

| Priority | Source | When Available | Fidelity |
|----------|--------|---------------|----------|
| 1 | External design files | Design provider configured + files linked in unit | Highest |
| 2 | Previous iteration output | `iterates_on` set + prior screenshots exist | High |
| 3 | Elaboration wireframes | Unit has `wireframe:` frontmatter field | Lowest |

**Resolution logic:**
1. Check unit frontmatter for `design_ref:` field (external file path/URL)
2. Check intent `iterates_on` for previous iteration screenshots
3. Fall back to `wireframe:` field in unit frontmatter
4. If none found → skip visual gate for this unit (log warning)

## Architecture Decision: Screenshot Storage

Screenshots captured during review should be stored for:
- Builder feedback (builder needs to see what was captured)
- Historical comparison (tracking visual evolution across bolts)
- Human review (if escalated)

**Proposed storage:** `.ai-dlc/{intent-slug}/screenshots/{unit-slug}/`
- `{breakpoint}-built.png` — screenshot of built output
- `{breakpoint}-reference.png` — the design reference used
- `comparison-report.md` — AI vision analysis results

