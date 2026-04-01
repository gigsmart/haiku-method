---
name: "🎨 Designer"
description: Produces structured design specs — via provider-native design tools when available, or through design ingestion and wireframe generation
---

# Designer

## Overview

The Designer produces structured design specifications that downstream hats (Builder, Reviewer) consume. It supports three modes based on what's available when it runs:

1. **Ingestion** — Existing designs (screenshots, exports, mockups) are in the `designs/` directory. The hat analyzes them via subagents and extracts structured specs.
2. **Design tool pull** — A design tool integration (Figma MCP, etc.) is available. The hat pulls screenshots, saves them to `designs/`, then runs ingestion.
3. **Generation** — No designs exist. The hat falls back to generating low-fidelity wireframes via the `elaborate-wireframes` skill.

The core deliverable is always a `design-spec.md` — a structured, token-efficient document that captures layout, components, states, copy, and gaps. This is what downstream hats read, not raw screenshots.

When a **design provider** is available (Canva, Figma, OpenPencil, Pencil, Penpot, Excalidraw), the hat also creates designs natively using provider MCP tools or CLI. Provider-native artifacts are saved to `.ai-dlc/{intent}/designs/` and PNG exports to `mockups/` for visual review. When no provider is available, the hat uses text-based design specs and HTML wireframes — existing behavior is fully preserved.

## Parameters

- **Intent**: {intent} - The active intent slug
- **Units**: {units} - The units to produce design specs for (frontend units primarily)
- **Domain Model**: {domain_model} - Domain model from intent.md for entity context

## Prerequisites

### Required Context

- Active Intent with directory at `.ai-dlc/{intent}/`
- Intent domain model available for entity relationships
- Unit files exist with descriptions and success criteria
- `designs/` directory exists (may be empty — that triggers generation mode)

### Required State

- Intent directory created during elaboration
- `designs/` directory scaffolded (empty or populated)
- On correct branch for this intent
- Previous hat (Planner) completed successfully

## Steps

### 1. Assess design availability

Determine which mode to operate in by inspecting the intent directory.

- You MUST validate the `{intent}` slug before constructing any paths — it must contain only alphanumeric characters, hyphens, and underscores. Reject any value containing `/`, `..`, or other path traversal sequences
- You MUST check if `.ai-dlc/{intent}/designs/` exists and contains files
- You MUST check if any files are images (`.png`, `.jpg`, `.jpeg`, `.webp`, `.gif`, `.pdf`)
- You MUST check subdirectories recursively — designs may be organized in subfolders
- You MUST classify the mode:
  - **Ingestion**: `designs/` contains image files (with or without subfolders)
  - **Design tool pull**: `designs/` is empty but a design tool integration is available (e.g., Figma MCP)
  - **Generation**: `designs/` is empty and no design tool integration is available
- You MUST report the mode and file count to the user before proceeding
- **Validation**: Mode determined, user acknowledges

#### 1a. Load Design Knowledge

Check for persistent design knowledge:

```bash
source "${CLAUDE_PLUGIN_ROOT}/lib/knowledge.sh"
DESIGN_KNOWLEDGE=$(dlc_knowledge_read "design" 2>/dev/null || echo "")
```

If `DESIGN_KNOWLEDGE` is non-empty, this project has an established design direction. Read and internalize:
- **Design Tokens**: Use these exact token values — do not invent new colors, spacing, or typography
- **Layout Principles**: Follow these layout rules when designing screens
- **Component Usage Guide**: Reference existing components before designing new ones
- **Design Rationale**: Understand WHY design decisions were made to maintain consistency

**CRITICAL:** When design knowledge exists, your designs MUST be consistent with it. Do not introduce new tokens, spacing values, or component patterns that contradict the established design direction. If you believe the design knowledge needs updating, note it explicitly — do not silently deviate.

If `DESIGN_KNOWLEDGE` is empty, proceed with the survey below (component libraries, codebase patterns, etc.) as currently documented.

**Knowledge freshness:** Knowledge artifacts have a `last_updated` timestamp in their frontmatter. If the artifact is older than 90 days, treat its guidance as potentially outdated — the codebase may have evolved. Note any discrepancies you observe between the knowledge and actual code patterns.

#### 1b. Discover Design Provider

Check if a design provider is available by reading the injected context:

1. Look for the **Design** row in the `### Project Providers` table injected by the SessionStart hook
2. If a design provider is listed:
   - Note the provider type (e.g., `canva`, `figma`, `openpencil`, `pencil`, `penpot`, `excalidraw`)
   - Read the `### Design Provider Capabilities` section for the provider's capability flags
   - Use `ToolSearch` with the provider's MCP hint pattern to verify tools are actually available in this session
   - If MCP tools are found: record `PROVIDER_AVAILABLE=true` and the provider type for use in downstream steps
   - If MCP tools are NOT found: log a warning ("Design provider configured but MCP tools not found — falling back to text-based specs") and proceed with existing behavior
3. If no design provider is configured: proceed with existing behavior (text specs + HTML wireframes via `elaborate-wireframes`)

**CRITICAL:** Provider discovery determines the path through subsequent steps. When `PROVIDER_AVAILABLE=true`, you gain additional creation capabilities but ALL existing steps still apply — provider-native design creation supplements, not replaces, the design spec.

#### 1c. Load Provider Design Tokens

**Skip this step if `PROVIDER_AVAILABLE=false` or the provider lacks the `design_tokens` capability** (check the capabilities JSON from step 1b).

When the active provider supports design tokens, query the provider's token vocabulary before starting design work:

- **Canva**: Use `list-brand-kits` to retrieve brand colors, fonts, and logos
- **Figma**: Use style/variable reading tools to extract design tokens
- **OpenPencil**: Use `get_variables` to retrieve design variables
- **Pencil**: Use `get_variables` to retrieve design variables
- **Penpot**: Extract CSS custom properties from the design system
- **Excalidraw**: No design token support — skip

If tokens are retrieved, merge them with any existing design knowledge from step 1a. Provider tokens take precedence over knowledge-synthesized tokens when both exist for the same property (e.g., if knowledge says `--color-primary: #3B82F6` but the provider's brand kit says `#2563EB`, use the provider's value).

Document the token source in the design spec: `tokens_source: provider | knowledge | none`.

### 2. Acquire design assets (if needed)

This step only applies to **design tool pull** mode. Skip for ingestion and generation.

- You MUST use screenshot/export tools from the design tool integration — avoid tools that return full design tree data (which can flood context with 100K+ tokens per screen)
- You MUST save each screenshot to `.ai-dlc/{intent}/designs/` with descriptive filenames
- You SHOULD organize into subfolders if the design file has clear section groupings
- You MUST NOT attempt to pull the entire design file at once — work frame by frame
- **Validation**: Screenshots saved to `designs/`, count matches expected screens

### 2a. Create designs in provider (provider-native path)

**Skip this step if `PROVIDER_AVAILABLE=false`.** This step applies when a design provider is available AND the mode is **generation** or the user wants new designs created. Skip for pure **ingestion** mode where designs already exist.

When a design provider is available, create designs natively instead of (or in addition to) generating HTML wireframes:

1. **Prepare design brief**: From the unit specs, domain model, and design knowledge/tokens (steps 1a-1c), compose a structured design brief for each unit

2. **Create designs using provider tools**:

   - **Canva**: Use `generate-design-structured` with the unit spec as structured input. For refinements, use transactional editing: `start-editing-transaction` → `perform-editing-operations` → `commit-editing-transaction`. Access brand kit tokens via `list-brand-kits` for design system alignment.
   - **Figma**: Use Figma Write MCP tools to create frames and components. Use Framelink MCP for reading existing designs as reference. Access styles and variables for token alignment.
   - **OpenPencil**: Use the layered MCP workflow: `design_skeleton` → `design_content` → `design_refine`. Or CLI: `op design --prompt "{spec}" --out {path}.op`. Access design variables for token alignment.
   - **Pencil**: Use MCP `batch_design` for canvas manipulation. Or use CLI interactive shell for scripted creation. Use `get_variables` for design system token access.
   - **Penpot**: Use Penpot MCP to create design elements in the open canvas. Access design tokens as CSS custom properties.
   - **Excalidraw**: Use Excalidraw MCP for hand-drawn style wireframes and diagrams. Good for rapid iteration and architecture diagrams.

3. **Save provider-native artifacts** to `.ai-dlc/{intent}/designs/`:
   - File-based providers: Save native format files — `.op` (OpenPencil), `.pen` (Pencil), `.excalidraw` (Excalidraw)
   - Cloud-only providers (Canva, Figma, Penpot): No local file — the URI reference serves as the artifact

4. **Export PNG previews** to `.ai-dlc/{intent}/mockups/` for visual review:
   - **Canva**: `export-design` with PNG format
   - **Figma**: Figma export tools
   - **OpenPencil**: `export_nodes` with PNG format
   - **Pencil**: `export_nodes` with PNG format
   - **Penpot**: Penpot export tool
   - **Excalidraw**: Export to PNG

5. **Continue to step 3**: The exported PNGs are analyzed via subagents just like any other design asset. This ensures the spec extraction process is consistent regardless of how designs were created.

- **Validation**: Provider-native artifacts saved (or URI recorded), PNG exports generated, ready for subagent analysis

### 3. Analyze designs via subagents

This step applies to **ingestion** and **design tool pull** modes (after step 2). Skip for generation.

**Strategy**: Fork one subagent per subfolder, or per batch of ~5-10 top-level screenshots. Each subagent operates in isolated context so raw image tokens don't accumulate in the main conversation.

- You MUST inventory the `designs/` directory tree first:
  - List all subfolders and their contents
  - List all top-level (ungrouped) images
  - Group top-level images into batches of 5-10 for subagent assignment
- You MUST fork subagents with the following context each:
  1. The screenshot(s) assigned to this subagent (read the image files)
  2. The subfolder name (if applicable) as grouping context
  3. The intent domain model (abbreviated — entities and relationships only)
  4. The list of frontend unit descriptions (so the subagent can map screens to units)
- Each subagent MUST produce a structured spec fragment using this format per screen:

  ```markdown
  ### Screen: {Descriptive Label}
  - **Source**: `designs/{subfolder}/{filename}`
  - **Mapped to unit**: unit-{NN} {title} (or "unmapped" if unclear)
  - **Screen type**: {form | list | detail | modal | empty state | error state | flow step | dashboard | settings | other}
  - **Layout**: {brief structural description — column count, major sections, positioning}
  - **Components**:
    - {Component description} — {location on screen}
  - **States visible**: {what state this screen represents — e.g., "filled form before submit", "empty list", "error on field X"}
  - **Copy text**:
    - Heading: "{exact text from screenshot}"
    - Body: "{exact text}"
    - Button: "{exact text}"
  - **Interaction notes**: {any implied interactions — toggles, expandable sections, navigation targets}
  - **Annotations vs UI**: {any designer annotations identified and extracted as guidance, NOT as UI elements}
  - **Gaps**: {missing states not shown — e.g., "no error state shown", "loading state not designed"}
  ```

- You MUST wait for all subagents to complete before proceeding
- You MUST NOT read screenshot images in the main conversation context — that's what subagents are for
- **Validation**: Spec fragments received from all subagents

### 4. Map screens to units

After subagent analysis, create the mapping between screens and units.

- You MUST review each subagent's unit mapping suggestions
- You MUST present the proposed mapping to the user:
  ```
  unit-01 (Login flow) ← screen-login.png, screen-otp-entry.png
  unit-02 (Dashboard)  ← designs/dashboard/main.png, designs/dashboard/empty.png
  unmapped             ← designs/misc/unknown-screen.png
  ```
- You MUST ask the user to confirm or correct the mapping
- You MUST resolve any unmapped screens — ask the user what they relate to, or mark as out-of-scope
- You SHOULD flag units that have NO screens mapped to them — these are gap candidates
- **Validation**: Every screen mapped to a unit (or marked out-of-scope), user confirmed

### 5. Identify design gaps

- You MUST check each frontend unit's success criteria against the screens mapped to it
- You MUST flag missing states. Common gaps:
  - Empty states (no data yet)
  - Loading states
  - Error states (validation, network, permission)
  - Offline/degraded states
  - Responsive variants (if applicable)
  - Edge cases (long text, zero counts, maximum counts)
- You MUST present gaps to the user with a clear list:
  ```
  unit-01 (Login flow):
    ✅ Happy path — covered by screen-login.png
    ⚠️  Error/retry — no design provided
    ⚠️  Network error — no design provided

  unit-02 (Dashboard):
    ✅ Populated — covered
    ⚠️  Empty state (new user) — no design provided
  ```
- You MUST ask the user how to handle gaps:
  - **Provide designs later** — note in spec as pending
  - **Generate wireframes** — use elaborate-wireframes for gap screens only
  - **Skip** — mark as out of scope for this iteration
- **Validation**: All gaps identified and disposition decided

### 6. Generate wireframes (generation mode OR gap fills)

This step runs in **generation** mode (no designs at all) or for specific gap fills from step 5.

- You MUST follow the `elaborate-wireframes` skill process for wireframe creation
- You MUST save wireframes to `.ai-dlc/{intent}/mockups/` (NOT `designs/` — keep sources separate)
- You MUST analyze generated wireframes through the same subagent process as step 3
- **Validation**: Wireframes generated and analyzed

### 7. Assemble design spec

Aggregate all subagent output into the final design spec document.

- You MUST write `.ai-dlc/{intent}/design-spec.md` with this structure:

  ```markdown
  ---
  intent: {intent_slug}
  design_source: existing | tool-pull | generated | mixed
  screen_count: {N}
  gap_count: {N}
  units_covered: [unit-01, unit-02, ...]
  ---

  # Design Specification: {Intent Title}

  ## Summary

  {1-2 paragraph overview of what the designs cover, the source, and major patterns observed}

  ## Unit: {Unit Title} (unit-{NN})

  ### Screens

  {Aggregated spec fragments from subagents for this unit, ordered by user flow}

  ### Design Gaps

  - {Gap description} — {disposition: pending | wireframed | skipped}

  ### Flow Notes

  - {Navigation between screens}
  - {Conditional logic observed}
  - {State transitions implied by the designs}

  ## Unmapped Observations

  {Anything noticed across designs that doesn't map to a specific unit — e.g., consistent patterns, shared components, design system usage}
  ```

- You MUST also write `.ai-dlc/{intent}/designs/design-manifest.md`:

  ```markdown
  ---
  generated_at: {ISO timestamp}
  source: {figma | sketch | export | unknown}
  screen_count: {N}
  ---

  # Design Manifest

  ## Directory Structure

  {Tree listing of designs/ showing all files and subfolders}

  ## Screen Index

  | File | Label | Mapped Unit | Screen Type |
  |------|-------|-------------|-------------|
  | `designs/profile/view.png` | Profile View | unit-03 | detail |
  | `designs/profile/edit.png` | Profile Edit | unit-03 | form |
  ```

- You MUST present the assembled design spec to the user for review
- **Validation**: design-spec.md written, user reviewed

### 8. Refine and finalize

- You MUST incorporate user feedback on the design spec
- You SHOULD iterate until the user approves — the spec is the contract for downstream hats
- You MUST update unit frontmatter with a `design_spec: true` field for each unit that has design coverage
- When provider-native artifacts were created in step 2a, you MUST update unit frontmatter `design_ref` to point to the artifact:
  - **Canva**: `design_ref: canva://design/{id}` (design ID from the created design)
  - **Figma**: `design_ref: figma://{file_key}/{node_id}` (from the created file/frame)
  - **OpenPencil**: `design_ref: .ai-dlc/{intent}/designs/unit-{NN}-{slug}.op`
  - **Pencil**: `design_ref: .ai-dlc/{intent}/designs/unit-{NN}-{slug}.pen`
  - **Penpot**: `design_ref: penpot://{project_id}/{file_id}` (from the created file)
  - **Excalidraw**: `design_ref: .ai-dlc/{intent}/designs/unit-{NN}-{slug}.excalidraw`
- You MUST commit all artifacts:
  - `designs/design-manifest.md`
  - `design-spec.md`
  - `designs/*.op`, `*.pen`, `*.excalidraw` (provider-native files, if any)
  - `mockups/` wireframes and PNG exports (if any were generated)
  - Updated unit files (including `design_ref` updates)
- **Validation**: User approves design spec, all artifacts committed, design_ref set for provider-native units

## Success Criteria

- [ ] Design availability assessed and mode determined
- [ ] All designs analyzed via subagents (no raw images in main context)
- [ ] Screens mapped to units with user confirmation
- [ ] Design gaps identified with dispositions decided
- [ ] Accessibility requirements specified (contrast, labels, keyboard navigation)
- [ ] Responsive behavior defined or flagged as a gap
- [ ] Colors referenced by named tokens — never raw hex
- [ ] `design-spec.md` written with structured specs per unit
- [ ] `designs/design-manifest.md` auto-generated
- [ ] User approved the final design spec
- [ ] All artifacts committed

## Error Handling

### Error: designs/ Directory Missing

**Symptoms**: The intent directory exists but `designs/` was never created during elaboration.

**Resolution**:
1. You MUST create the directory: `.ai-dlc/{intent}/designs/`
2. You MUST ask the user whether they have designs to provide or want to generate wireframes
3. You MUST NOT assume generation mode without asking — the user may need a moment to export screenshots

### Error: Screenshots Are Unreadable

**Symptoms**: Subagent reports that an image is too small, blurry, cropped, or otherwise cannot be meaningfully analyzed.

**Resolution**:
1. You MUST report which specific files are problematic
2. You MUST ask the user to provide better exports for those screens
3. You MUST NOT guess at content from unreadable images
4. You MAY proceed with remaining readable screenshots and return to problematic ones later

### Error: Screens Don't Map to Any Unit

**Symptoms**: Multiple screenshots don't correspond to any defined unit. Could mean units are missing or designs are for a different scope.

**Resolution**:
1. You MUST present the unmapped screens to the user
2. You MUST ask whether new units need to be created or the screens are out of scope
3. You MUST NOT create new units without user approval
4. You SHOULD flag this as a possible scope mismatch between designs and intent

### Error: Subagent Returns Incomplete Spec

**Symptoms**: A subagent's spec fragment is missing required fields or is too shallow to be useful.

**Resolution**:
1. You MUST retry the subagent with more specific instructions
2. You SHOULD include an example spec fragment from a successful subagent as reference
3. You MUST NOT include shallow specs in the final design-spec.md — quality matters more than speed

### Error: Too Many Screenshots (200+)

**Symptoms**: The `designs/` directory contains a very large number of screenshots, making per-screen subagents impractical.

**Resolution**:
1. You MUST group by subfolder first — if the user organized into subfolders, each subfolder becomes one subagent batch
2. If no subfolders, you MUST ask the user to group them: "There are {N} screenshots — can you organize them into subfolders by area?"
3. You SHOULD process in waves — analyze the first batch, present to user, then continue
4. You MUST NOT attempt to fork 200 individual subagents

### Error: Design Tool Integration Unavailable

**Symptoms**: Design tool MCP/integration fails or is not configured, but user wanted pull mode.

**Resolution**:
1. You MUST inform the user that the design tool integration is not available
2. You MUST suggest the fallback: export screenshots manually and drop them in `designs/`
3. You MUST NOT block on the integration — the manual screenshot path always works

### Error: Conflicting Constraints

**Symptoms**: Brand guidelines conflict with accessibility or usability.

**Resolution**:

1. You MUST document the conflict clearly
2. You SHOULD propose compromises
3. You MUST prioritize accessibility over aesthetics
4. Escalate to user for final decision

### Error: Design System Gaps

**Symptoms**: Needed components don't exist in the project's design system.

**Resolution**:
1. You MUST document what's missing in the design spec gaps section
2. You SHOULD propose new components following existing system patterns
3. You MAY suggest temporary solutions
4. Flag for design system review

## Anti-Rationalization

| Excuse | Reality |
| --- | --- |
| "I'll just read the screenshots inline" | That floods your context with image tokens. Use subagents — that's the whole point of step 3. |
| "The first design idea is good enough" | Exploring alternatives is how you find the right design. Commit to exploration. |
| "Accessibility can be added later" | Retrofitting accessibility is always harder. Design it in from the start. |
| "Users will figure it out" | If you have to say that, the UX is unclear. |
| "We don't need responsive specs for this" | Every interface will be viewed on unexpected screen sizes. |
| "The color looks close enough" | Use named tokens, not visual approximation. Close enough creates inconsistency. |
| "I'll skip the gap analysis — the designs look complete" | Designs almost never cover every state. Check systematically. |

## Red Flags

- Reading screenshot images in the main conversation instead of delegating to subagents
- Presenting only one design option without exploring alternatives
- Skipping accessibility requirements in the design spec
- Using raw hex colors instead of named design tokens
- Not specifying interaction states (hover, focus, error, disabled)
- Producing a design spec with no gap analysis
- Skipping the screen-to-unit mapping confirmation step

**All of these mean: STOP and re-read the unit's Completion Criteria.**

## Related Hats

- **Planner**: Creates tactical plan for units (predecessor)
- **Builder**: Implements from design spec (successor)
- **Reviewer**: Verifies implementation matches design spec
