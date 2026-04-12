---
name: unit-05-visual-review-integration
type: backend
status: completed
inputs: ["knowledge/DISCOVERY.md"]
depends_on: []
bolt: 0
hat: ""
started_at: 2026-04-01T20:10:38Z
completed_at: 2026-04-01T20:10:38Z
---


# unit-05-visual-review-integration

## Description
Integrate design provider artifacts with the visual review pipeline. Implement two review modes: (1) present-for-review when creating designs from scratch — the provider artifact is presented via `ask_user_visual_question` for approval, and (2) auto-compare when `design_ref` exists — the built output is compared against the design reference and the user is only prompted when differences exceed a threshold. Both modes use the existing `ask_user_visual_question` MCP tool for presenting visual questions to users.

## Discipline
backend - This unit will be executed by backend-focused agents.

## Domain Entities
- **DesignArtifact**: The provider-native design file or URI that serves as the reference for comparison
- **DesignProvider**: Used to determine export capabilities for generating comparison screenshots

## Data Sources
- **run-visual-comparison.sh** (`plugin/lib/run-visual-comparison.sh`): Orchestrates the visual comparison pipeline — gate detection, reference resolution, built output capture, screenshot pairing, comparison context generation. This is the primary file to modify.
- **detect-visual-gate.sh** (`plugin/lib/detect-visual-gate.sh`): 5-point heuristic for detecting whether visual comparison should run. May need updating to recognize provider-native design files.
- **server.ts** (`plugin/mcp-server/src/server.ts`): The MCP server exposes `ask_user_visual_question` and `open_review`. May need new tools or updates for provider artifact presentation.
- **reviewer.md** (`plugin/hats/reviewer.md`): The reviewer hat loads comparison context and performs visual fidelity analysis. Needs awareness of provider artifacts.

## Technical Specification

### 1. Mode A: Present-for-Review (New Designs)

When a design is created from scratch (no prior `design_ref` to compare against), the review flow is:

1. **Detect provider artifact**: Check if unit has a provider-native `design_ref` (e.g., `.op`, `.pen`, `canva://...`)
2. **Export to PNG**: If the artifact is not already PNG, use the resolution pipeline from unit-02 to export it
3. **Present via `ask_user_visual_question`**: Call the MCP tool with:
   - `title`: "Design Review: unit-{NN}-{slug}"
   - `context`: The design spec text (from `design-spec.md` or unit description) plus the PNG image path
   - `questions`: Single question asking "Does this design match the intent? Review layout, flow, and visual structure."
   - `options`: ["Approved", "Needs revision", "Reject"]
4. **Handle response**:
   - "Approved": Mark design as accepted, proceed
   - "Needs revision": Feed user's `otherText` feedback back to the designer hat for iteration
   - "Reject": Discard artifact, fall back to text-based spec

### 2. Mode B: Auto-Compare (Design Reference Exists)

When a `design_ref` exists (either from elaboration wireframes or a previous iteration), the review flow is:

1. **Resolve design reference**: Use `resolve-design-ref.sh` (updated in unit-02) to get a PNG of the reference
2. **Capture built output**: Use the existing screenshot capture pipeline to get a PNG of the built implementation
3. **Generate comparison context**: Write `comparison-context.json` with both `ref_path` and `built_path`
4. **AI vision comparison**: The reviewer hat already loads comparison context and uses vision to compare — this works unchanged
5. **Threshold-based user prompt**: If the reviewer finds significant differences (high-severity findings), present both images via `ask_user_visual_question`:
   - `context`: Side-by-side comparison markdown showing what differs
   - `questions`: "The built output differs from the design reference in these areas: {findings}. Is this acceptable?"
   - `options`: ["Accept differences", "Fix required", "Update design ref"]
6. **Handle response**:
   - "Accept differences": Proceed, no changes needed
   - "Fix required": Feed findings back to builder for correction
   - "Update design ref": Take a screenshot of the current built output, save it as the new reference PNG at `{screenshots_dir}/ref-{unit_slug}.png`, and update the unit frontmatter `design_ref` to point to this screenshot. If the unit previously had a provider URI, replace it with the local screenshot path.

### 3. Visual Gate Enhancement (`plugin/lib/detect-visual-gate.sh`)

Extend the 5-point heuristic to recognize provider-native design files:

- **Existing signals**: discipline=frontend/design, has design_ref, has wireframe, changed UI files, spec mentions UI terms
- **New signal**: Unit has a provider-native `design_ref` (file extension is .op, .pen, .excalidraw, or URI scheme matches a known provider) — this should increase the visual gate score

### 4. Comparison Pipeline Enhancement (`plugin/lib/run-visual-comparison.sh`)

Update the pipeline to handle provider artifacts:

**Reference resolution step**: Currently calls `resolve-design-ref.sh` which returns a local file path. With unit-02's changes, it may return a JSON object with `needs_agent_export: true`. The pipeline needs to handle this:
- If `needs_agent_export` is false: use the `ref_path` directly (existing behavior)
- If `needs_agent_export` is true: read the `export_instructions` file and include it in the comparison context as a "TODO for agent" — the reviewer agent will execute the export before comparison

**Fidelity awareness**: Provider-native design refs should default to `high` fidelity (colors, spacing, typography must match closely), not `low` fidelity like HTML wireframes. The comparison context should carry the fidelity level so the reviewer adjusts tolerance accordingly.

### 5. MCP Server Enhancement (`plugin/mcp-server/src/server.ts`)

The `ask_user_visual_question` tool may need enhancements for presenting design comparisons:
- Support embedding two images side-by-side (reference vs built) in the HTML template
- Support linking to provider-native design URLs (e.g., Canva design link for interactive review)
- Support displaying comparison reports alongside the images

If the existing tool already handles arbitrary HTML context, these enhancements may be minimal — just ensure the HTML templates support image comparison layouts.

### 6. Reviewer Hat Update (`plugin/hats/reviewer.md`)

Add provider-awareness to the reviewer's visual fidelity gate:

- When `comparison-context.json` includes a `provider` field, note it in the review
- When `needs_agent_export` is true, execute the export instructions before comparison
- When fidelity is `high` (provider-native design ref), apply stricter comparison tolerances
- When presenting findings via `ask_user_visual_question`, include the provider type in the context

## Success Criteria
- [x] Mode A (present-for-review) works: new designs from providers are exported to PNG and presented via `ask_user_visual_question`
- [x] Mode B (auto-compare) works: built output is compared against provider design references with threshold-based user prompting
- [x] Provider-native design files (.op, .pen, .excalidraw) increase the visual gate score
- [x] Comparison pipeline handles `needs_agent_export` flag from resolve-design-ref
- [x] Provider design refs default to `high` fidelity in comparison context
- [x] `ask_user_visual_question` presents comparison results with sufficient context for user decision
- [x] "Update design ref" response updates the unit's `design_ref` frontmatter
- [x] When no provider artifacts exist, the existing visual review pipeline works unchanged

## Risks
- **PNG export quality**: Exported PNGs may not perfectly represent the provider-native design (color space differences, font rendering, resolution). Mitigation: use high DPI export settings; document known rendering differences per provider.
- **User fatigue from comparison prompts**: Auto-compare mode could prompt users too frequently if thresholds are too sensitive. Mitigation: only prompt on high-severity findings; low/medium findings are logged but don't trigger a prompt.
- **MCP tool availability during review**: The reviewer agent needs access to provider export tools for `needs_agent_export` resolution. Mitigation: if export tools aren't available, skip the visual comparison and log a warning.

## Boundaries
This unit does NOT handle: provider config/detection (unit-01), URI resolution implementation (unit-02), elaboration wireframe generation (unit-03), designer hat design creation (unit-04), or provider schemas (unit-06). It modifies the visual review and comparison pipeline, including minimal MCP server (`server.ts`) changes needed for comparison presentation.

## Notes
- The `ask_user_visual_question` MCP tool is the existing mechanism for presenting visual questions. This unit builds on it rather than creating a new review tool.
- The reviewer hat already has a Visual Fidelity quality gate. This unit extends that gate's reference resolution and comparison logic, not the gate detection itself.
- Side-by-side comparison in `ask_user_visual_question` could use a simple HTML template with two `<img>` tags or a diff overlay. The exact presentation can be refined during building.
