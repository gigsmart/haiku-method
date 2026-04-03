---
description: (Internal) Autonomous wireframe generation for AI-DLC elaboration frontend and design units
context: fork
agent: general-purpose
user-invocable: false
allowed-tools:
  - Read
  - Write
  - Glob
  - Grep
  - Bash
  # MCP read-only tool patterns
  - "mcp__*__read*"
  - "mcp__*__get*"
  - "mcp__*__list*"
  - "mcp__*__search*"
  - "mcp__*__query*"
  - "mcp__*__ask*"
  - "mcp__*__resolve*"
  - "mcp__*__fetch*"
  - "mcp__*__lookup*"
  - "mcp__*__analyze*"
  - "mcp__*__describe*"
  - "mcp__*__explain*"
  - "mcp__*__memory"
  # MCP design provider tools (scoped to known design providers)
  - "mcp__*canva*__*"
  - "mcp__*pencil*__*"
  - "mcp__*openpencil*__*"
  - "mcp__*penpot*__*"
  - "mcp__*excalidraw*__*"
  - "mcp__*figma*__*"
  # ToolSearch for provider tool discovery
  - ToolSearch
---

# Elaborate: Wireframe Generation

Autonomous wireframe generation for AI-DLC elaboration frontend and design units. This skill runs as a forked subagent — it reads a brief file from disk, generates low-fidelity HTML wireframes, and writes results to disk.

**You have NO access to `AskUserQuestion`.** All work is fully autonomous. The main elaboration skill will present wireframes to product for review.

---

## Step 1: Read Brief

Read the brief file passed as the first argument. The brief is at the path provided (e.g., `.ai-dlc/{intent-slug}/.briefs/elaborate-wireframes.md`).

Parse YAML frontmatter:

```yaml
intent_slug: my-feature
worktree_path: /path/to/.ai-dlc/worktrees/my-feature
intent_title: My Feature Title
design_provider_type: figma  # or empty
design_provider_capabilities: {"generate":true,"inspect":false,...}  # JSON or empty
design_provider_mcp_hint: mcp__*canva*  # MCP tool glob pattern or empty
design_blueprint_path: .ai-dlc/my-feature/design-blueprint.md  # or empty if no blueprint
```

The markdown body contains:
- **Frontend & Design Units**: List of frontend and design units with their file paths, descriptions, domain entities, and technical specs
- **Design Context**: Design analysis findings from discovery.md (if any)
- **Domain Model Reference**: Abbreviated domain model for context

**Change directory to the worktree** before any file operations:

```bash
cd "{worktree_path}"
```

**If no frontend or design units are listed in the brief**, write results with `status: skipped` and exit immediately.

---

## Step 2: Check Design Provider Context

Read `design_provider_type` from the brief frontmatter.

If a design provider is configured (e.g., Figma):
- Reference component names from the design system in HTML comments (e.g., `<!-- DS: ButtonPrimary -->`)
- Maintain low-fidelity wireframe aesthetic — do NOT import actual design system styles

If design mockups exist in the Design Context section:
- **Distinguish annotations from design elements** — designers annotate mockups with callouts, arrows, measurement labels, and descriptive text that describe UX behavior and implementation detail
- Extract this guidance into wireframe flow notes
- Do not render annotations as wireframe elements

---

## Step 2.5: Provider Wireframe Dispatch

Read `design_provider_type`, `design_provider_capabilities`, and `design_provider_mcp_hint` from the brief frontmatter.

**Decision logic:**

1. If `design_provider_type` is empty → set `USE_PROVIDER=false`, skip to Step 3
2. Parse `design_provider_capabilities` JSON; check if `generate` is `true` → if `false`, set `USE_PROVIDER=false`, skip to Step 3
3. Use `ToolSearch` with the `design_provider_mcp_hint` pattern to verify MCP tools are actually available in this subagent context
4. If tools NOT found → log warning ("Provider {type} configured but MCP tools not available, falling back to HTML"), set `USE_PROVIDER=false`, skip to Step 3
5. If tools found → set `USE_PROVIDER=true` and `PROVIDER_TYPE={design_provider_type}`

**When `USE_PROVIDER=true`, for each frontend/design unit:**

### A. Generate via Provider

Dispatch based on `PROVIDER_TYPE`:

**Canva:**
1. Use `ToolSearch` to find `mcp__*Canva*generate*` or `mcp__*Canva*create*`
2. Call the generate-design tool with wireframe requirements derived from the unit description and design context
3. Save the returned design ID; set `NATIVE_REF=canva://{design_id}`
4. Export PNG: call the export-design tool with format=png
5. Save PNG to `.ai-dlc/{intent-slug}/mockups/unit-{NN}-{slug}-wireframe.png`

**OpenPencil:**
1. Use `ToolSearch` to find `mcp__openpencil__design_skeleton`
2. Call `design_skeleton` to create the initial wireframe structure
3. Call `design_content` to populate content from unit spec
4. Call `design_refine` for iteration
5. Export: call `export_nodes` with format=png
6. Save PNG to mockups/, set `NATIVE_REF=openpencil://{document_id}`

**Pencil:**
1. Use `ToolSearch` to find `mcp__pencil__batch_design`
2. Call `batch_design` to create wireframe elements
3. Export: call `export_nodes` with format=png
4. Save PNG to mockups/, set `NATIVE_REF=pencil://{document_id}`

**For providers with `generate: false` (Figma, Penpot, Excalidraw):**
These providers don't have generate capability — the decision logic in step 2 already skips them. They fall through to HTML wireframe generation.

### B. Save Provider Artifacts

For each unit where provider generation succeeded:

1. Create designs directory: `mkdir -p .ai-dlc/{intent-slug}/designs/`
2. Save native artifact reference: for OpenPencil use `.ai-dlc/{intent-slug}/designs/unit-{NN}-{slug}-wireframe.op`, for Pencil use `.ai-dlc/{intent-slug}/designs/unit-{NN}-{slug}-wireframe.pen`; for Canva, the design ID is a cloud reference — store as URI in the unit frontmatter directly (e.g., `design_ref: canva://{design_id}`) rather than a local file
3. Save PNG export to `.ai-dlc/{intent-slug}/mockups/unit-{NN}-{slug}-wireframe.png`
4. Track per-unit results: `PROVIDER_SUCCEEDED[unit]=true`, `NATIVE_REFS[unit]={native ref path or URI}`

### C. Error Handling

If provider generation fails for any unit:

1. Log the error: "Provider {type} failed for unit-{NN}-{slug}: {error}. Falling back to HTML."
2. Set `PROVIDER_SUCCEEDED[unit]=false` — this unit will get HTML-only wireframe treatment in Step 4
3. Continue with remaining units — do not abort the entire batch

---

## Step 3: Create Mockups Directory

```bash
INTENT_SLUG="{intent_slug from brief}"
mkdir -p ".ai-dlc/${INTENT_SLUG}/mockups"
```

---

## Step 3.5: Load Design Blueprint (if available)

Read `design_blueprint_path` from the brief frontmatter. If this field is non-empty and the file exists:

1. Read the design blueprint file
2. Extract CSS token values from the blueprint's YAML frontmatter and body. The blueprint contains values such as `color_primary`, `color_background`, `color_accent`, `font_heading`, `font_body`, `border_radius`, `border_width`, `spacing_unit`, `spacing_section`, `shadow`, and `line_height`.
3. Also read the `layout_guidelines`, `typography_guidelines`, and `component_guidelines` from the blueprint body — these inform spatial decisions in Step 4.

**If `design_blueprint_path` is empty or the file does not exist**, set `HAS_BLUEPRINT=false` and proceed to Step 4 with standard gray-box styling.

Store the extracted token values for use in Step 4. For example:

```
HAS_BLUEPRINT=true
BP_COLOR_PRIMARY="#1a1a1a"           (from blueprint)
BP_COLOR_BACKGROUND="#f8f7f4"        (from blueprint)
BP_COLOR_ACCENT="#c5a572"            (from blueprint)
BP_COLOR_TEXT="#1a1a1a"              (from blueprint)
BP_COLOR_MUTED="#8a8580"             (from blueprint)
BP_FONT_HEADING="Georgia, serif"     (from blueprint)
BP_FONT_BODY="-apple-system, ..."    (from blueprint)
BP_BORDER_RADIUS="2px"              (from blueprint)
BP_BORDER_WIDTH="1px"               (from blueprint)
BP_BORDER_COLOR="#d4cfc7"            (from blueprint)
BP_SHADOW="0 1px 3px rgba(0,0,0,0.06)" (from blueprint)
BP_SPACING_UNIT="12px"              (from blueprint)
BP_SPACING_SECTION="72px"           (from blueprint)
BP_LINE_HEIGHT="1.7"                (from blueprint)
BP_FONT_SIZE_BASE="17px"            (from blueprint)
BP_LAYOUT_GUIDELINES="..."          (from blueprint body)
BP_TYPOGRAPHY_GUIDELINES="..."      (from blueprint body)
BP_COMPONENT_GUIDELINES="..."       (from blueprint body)
```

---

## Step 4: Generate Wireframe HTML Per Frontend or Design Unit

**This step runs for ALL units regardless of provider status.** HTML wireframes serve as:
- **Primary output** for units without a provider (or where the provider failed) — same behavior as before
- **Supplementary output** for units where the provider succeeded — provides a universal browser-viewable version alongside the native artifact

For each frontend or design unit from the brief, create a self-contained HTML file at:
`.ai-dlc/{intent-slug}/mockups/unit-{NN}-{slug}-wireframe.html`

Where `{NN}` is the zero-padded unit number and `{slug}` is the unit filename slug.

### Wireframe Style Reference

Use **one of two style modes** depending on whether a design blueprint is available:

#### Mode A: Styled Wireframes (when `HAS_BLUEPRINT=true`)

When a design blueprint exists, wireframes should carry the archetype's spatial personality while remaining recognizably low-fidelity. Use CSS custom properties populated from the blueprint tokens. The wireframe should NOT look production-ready — no photos, no real brand assets, no high-fidelity polish — but it should communicate the chosen archetype's rhythm, spacing, typography, and color temperature.

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Wireframe: {Unit Title}</title>
<style>
  /* === DESIGN BLUEPRINT TOKENS === */
  :root {
    --color-primary: {BP_COLOR_PRIMARY};
    --color-background: {BP_COLOR_BACKGROUND};
    --color-accent: {BP_COLOR_ACCENT};
    --color-text: {BP_COLOR_TEXT};
    --color-muted: {BP_COLOR_MUTED};
    --font-heading: {BP_FONT_HEADING};
    --font-body: {BP_FONT_BODY};
    --font-size-base: {BP_FONT_SIZE_BASE};
    --line-height: {BP_LINE_HEIGHT};
    --border-radius: {BP_BORDER_RADIUS};
    --border-width: {BP_BORDER_WIDTH};
    --border-color: {BP_BORDER_COLOR};
    --shadow: {BP_SHADOW};
    --spacing-unit: {BP_SPACING_UNIT};
    --spacing-section: {BP_SPACING_SECTION};
  }

  /* === BASE === */
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: var(--font-body);
    background: var(--color-background);
    color: var(--color-text);
    font-size: var(--font-size-base);
    line-height: var(--line-height);
    padding: var(--spacing-section) 20px;
  }
  h1 { text-align: center; font-family: var(--font-heading); font-size: 18px; color: var(--color-muted); margin-bottom: 8px; }
  .subtitle { text-align: center; font-size: 13px; color: var(--color-muted); margin-bottom: var(--spacing-section); }

  /* === LAYOUT === */
  .flow { display: flex; gap: calc(var(--spacing-unit) * 3); justify-content: center; align-items: flex-start; flex-wrap: wrap; }
  .arrow { display: flex; align-items: center; font-size: 28px; color: var(--color-muted); padding-top: 160px; }

  /* === SCREEN CARDS === */
  .screen {
    width: 300px;
    background: var(--color-background);
    border: var(--border-width) solid var(--border-color);
    border-radius: var(--border-radius);
    overflow: hidden;
    box-shadow: var(--shadow);
  }
  .screen-header {
    background: color-mix(in srgb, var(--color-background) 85%, var(--color-text));
    padding: var(--spacing-unit) calc(var(--spacing-unit) + 4px);
    font-family: var(--font-heading);
    font-size: 11px; font-weight: 600;
    color: var(--color-muted); text-transform: uppercase; letter-spacing: 0.5px;
    border-bottom: var(--border-width) solid var(--border-color);
  }
  .screen-body { padding: calc(var(--spacing-unit) * 2) calc(var(--spacing-unit) + 8px); }
  .screen-title { font-family: var(--font-heading); font-size: 20px; font-weight: 700; margin-bottom: 6px; }
  .screen-desc { font-size: 13px; color: var(--color-muted); margin-bottom: calc(var(--spacing-unit) * 2); line-height: var(--line-height); }

  /* === FORM FIELDS === */
  .field {
    border: var(--border-width) dashed var(--border-color);
    border-radius: var(--border-radius);
    padding: var(--spacing-unit) calc(var(--spacing-unit) + 2px);
    margin-bottom: var(--spacing-unit);
    font-size: 14px; color: var(--color-muted);
  }
  .field.filled { border-style: solid; color: var(--color-text); }

  /* === BUTTONS === */
  .btn {
    width: 100%; padding: calc(var(--spacing-unit) + 2px);
    border-radius: var(--border-radius);
    border: var(--border-width) solid transparent;
    font-family: var(--font-body);
    font-size: 15px; font-weight: 600; cursor: default; margin-bottom: 8px; text-align: center;
  }
  .btn-primary { background: var(--color-primary); color: var(--color-background); }
  .btn-secondary { background: color-mix(in srgb, var(--color-background) 90%, var(--color-text)); color: var(--color-muted); }
  .btn-text { background: none; color: var(--color-muted); font-size: 13px; }

  /* === DIVIDERS === */
  .divider { text-align: center; font-size: 12px; color: var(--color-muted); margin: calc(var(--spacing-unit) + 4px) 0; position: relative; }
  .divider::before, .divider::after {
    content: ''; position: absolute; top: 50%; width: 40%; height: 1px; background: var(--border-color);
  }
  .divider::before { left: 0; }
  .divider::after { right: 0; }

  /* === PLACEHOLDER ELEMENTS === */
  .placeholder { background: color-mix(in srgb, var(--color-background) 80%, var(--color-text)); border-radius: var(--border-radius); height: 40px; margin-bottom: var(--spacing-unit); }
  .placeholder.tall { height: 120px; }
  .placeholder.avatar { width: 36px; height: 36px; border-radius: 50%; display: inline-block; }

  /* === FLOW NOTES (yellow callout) === */
  .note {
    background: #fffde7; border: 1px solid #fff176; border-radius: var(--border-radius);
    padding: 10px 12px; font-size: 12px; color: var(--color-muted); margin-top: calc(var(--spacing-unit) + 4px); line-height: 1.4;
  }
  .note strong { color: var(--color-text); }

  /* === COPY REVIEW ANNOTATIONS (orange) === */
  .copy-note { font-size: 11px; color: #e65100; font-style: italic; margin-top: 4px; }

  /* === LIST/CARD ITEMS === */
  .card {
    border: var(--border-width) solid var(--border-color);
    border-radius: var(--border-radius);
    padding: var(--spacing-unit) calc(var(--spacing-unit) + 2px);
    margin-bottom: 8px; display: flex; align-items: center; gap: var(--spacing-unit);
    box-shadow: var(--shadow);
  }
</style>
</head>
<body>

<h1>{Intent Title}</h1>
<p class="subtitle">Wireframe &mdash; Unit: {Unit Title} &mdash; AI-DLC Elaboration Artifact</p>

<div class="flow">
  <!-- Build screens here -->
</div>

</body>
</html>
```

**Layout adaptation based on blueprint guidelines:**
- If the blueprint's `layout_guidelines` mention "asymmetric grids" — use unequal column widths in multi-column layouts
- If the blueprint mentions "card-based" — wrap content groups in bordered/shadowed `.card` elements
- If the blueprint mentions "data tables" — present tabular data as `<table>` elements, not cards
- If the blueprint mentions "generous whitespace" — increase spacing between sections
- If the blueprint mentions "dense" or "compact" — reduce spacing, use smaller fonts

**Typography adaptation:**
- Apply `--font-heading` to all headings and screen headers
- Apply `--font-body` to body text, form fields, and buttons
- Follow `typography_guidelines` for font weight, letter-spacing, and text-transform decisions

**Component adaptation:**
- Follow `component_guidelines` for button styles, card borders, form input treatments, and navigation patterns
- The wireframe should still use placeholder content (no real data) but structure components according to the archetype's personality

#### Mode B: Standard Gray-Box Wireframes (when `HAS_BLUEPRINT=false`)

When no design blueprint exists, use the standard gray/white low-fidelity aesthetic with no brand colors, no custom fonts, and no JavaScript:

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Wireframe: {Unit Title}</title>
<style>
  /* === BASE === */
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: system-ui, sans-serif; background: #f5f5f5; color: #333; padding: 40px 20px; }
  h1 { text-align: center; font-size: 18px; color: #666; margin-bottom: 8px; }
  .subtitle { text-align: center; font-size: 13px; color: #999; margin-bottom: 40px; }

  /* === LAYOUT === */
  .flow { display: flex; gap: 32px; justify-content: center; align-items: flex-start; flex-wrap: wrap; }
  .arrow { display: flex; align-items: center; font-size: 28px; color: #bbb; padding-top: 160px; }

  /* === SCREEN CARDS === */
  .screen { width: 300px; background: #fff; border: 2px solid #ddd; border-radius: 12px; overflow: hidden; }
  .screen-header {
    background: #e8e8e8; padding: 12px 16px; font-size: 11px; font-weight: 600;
    color: #888; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #ddd;
  }
  .screen-body { padding: 24px 20px; }
  .screen-title { font-size: 20px; font-weight: 700; margin-bottom: 6px; }
  .screen-desc { font-size: 13px; color: #888; margin-bottom: 24px; line-height: 1.4; }

  /* === FORM FIELDS (dashed borders) === */
  .field { border: 2px dashed #ccc; border-radius: 8px; padding: 12px 14px; margin-bottom: 12px; font-size: 14px; color: #aaa; }
  .field.filled { border-style: solid; color: #333; }

  /* === BUTTONS === */
  .btn {
    width: 100%; padding: 14px; border-radius: 8px; border: none;
    font-size: 15px; font-weight: 600; cursor: default; margin-bottom: 8px; text-align: center;
  }
  .btn-primary { background: #888; color: #fff; }
  .btn-secondary { background: #f0f0f0; color: #666; }
  .btn-text { background: none; color: #666; font-size: 13px; }

  /* === DIVIDERS === */
  .divider { text-align: center; font-size: 12px; color: #bbb; margin: 16px 0; position: relative; }
  .divider::before, .divider::after {
    content: ''; position: absolute; top: 50%; width: 40%; height: 1px; background: #e0e0e0;
  }
  .divider::before { left: 0; }
  .divider::after { right: 0; }

  /* === PLACEHOLDER ELEMENTS === */
  .placeholder { background: #e0e0e0; border-radius: 8px; height: 40px; margin-bottom: 12px; }
  .placeholder.tall { height: 120px; }
  .placeholder.avatar { width: 36px; height: 36px; border-radius: 50%; display: inline-block; }

  /* === FLOW NOTES (yellow callout) === */
  .note {
    background: #fffde7; border: 1px solid #fff176; border-radius: 6px;
    padding: 10px 12px; font-size: 12px; color: #666; margin-top: 16px; line-height: 1.4;
  }
  .note strong { color: #333; }

  /* === COPY REVIEW ANNOTATIONS (orange) === */
  .copy-note { font-size: 11px; color: #e65100; font-style: italic; margin-top: 4px; }

  /* === LIST/CARD ITEMS === */
  .card {
    border: 2px solid #e0e0e0; border-radius: 8px; padding: 12px 14px;
    margin-bottom: 8px; display: flex; align-items: center; gap: 12px;
  }
</style>
</head>
<body>

<h1>{Intent Title}</h1>
<p class="subtitle">Wireframe &mdash; Unit: {Unit Title} &mdash; AI-DLC Elaboration Artifact</p>

<div class="flow">
  <!-- Build screens here -->
</div>

</body>
</html>
```

### What to Include

- **Screens**: One `.screen` card per distinct view or state described in the unit. Use `.screen-header` for screen identification (e.g., "Screen 1 — Login") and `.screen-body` for content.
- **User flows**: Use `.arrow` elements (`→`) between screens to show navigation flow. Wrap screens and arrows in `.flow` container.
- **Form fields**: Use `.field` with dashed borders for inputs. Use `.field.filled` for pre-filled example states.
- **Buttons**: Use `.btn-primary` for main actions, `.btn-secondary` for alternatives, `.btn-text` for tertiary/link actions. Keep buttons gray (`#888`) — no brand colors.
- **Placeholder copy**: Write realistic placeholder text for all headings, descriptions, labels, and button text. Mark any copy needing product review with `<div class="copy-note">^ Copy: needs product review</div>`.
- **Flow notes**: Use `.note` callouts to explain behavior, transitions, conditional logic, and edge cases (e.g., "Auto-submits when all 6 digits entered").
- **States**: Show key states (empty, filled, error, success) as separate screens or annotate with flow notes.
- **Placeholders**: Use `.placeholder` for images, avatars, or content areas that don't need detail.

### What to Exclude

**In both modes:**
- Icons — describe in text or use unicode characters
- JavaScript — no interactivity, no animations
- Responsive breakpoints — fixed 300px screen cards only
- Photographs, illustrations, or real brand assets
- High-fidelity polish — the wireframe should be recognizably low-fidelity even in styled mode

**In Mode B (gray-box) only:**
- Brand colors — use only grays (#888, #666, #aaa, #ccc, #ddd, #e0e0e0, #f0f0f0, #f5f5f5) and white
- Custom fonts — use only `system-ui, sans-serif`
- Shadows and gradients

**In Mode A (styled) only:**
- The wireframe uses the archetype's fonts, colors, spacing, and border-radius from the blueprint — this is intentional. It should still look low-fidelity (placeholder content, no photos, simplified layouts) but carry the archetype's spatial personality and visual rhythm.

---

## Step 5: Update Unit Frontmatter

For each frontend or design unit that received a wireframe, update its frontmatter. The fields depend on whether a provider generated the wireframe:

**Provider-generated units** (where `PROVIDER_SUCCEEDED[unit]=true`):

```yaml
design_ref: .ai-dlc/{intent-slug}/designs/unit-{NN}-{slug}-wireframe.{ext}  # or canva://{id} for Canva
wireframe: mockups/unit-{NN}-{slug}-wireframe.png
```

`design_ref` points to the provider-native artifact (or provider URI). `wireframe` points to the PNG export for preview.

**HTML-only units** (no provider, or provider failed):

```yaml
wireframe: mockups/unit-{NN}-{slug}-wireframe.html
```

Same as current behavior — no `design_ref` added.

Read the unit file, find the YAML frontmatter block, add or replace the relevant fields, and write the file back.

---

## Step 6: Commit Wireframe Artifacts

```bash
INTENT_SLUG="{intent_slug from brief}"
git add .ai-dlc/${INTENT_SLUG}/mockups/
git add .ai-dlc/${INTENT_SLUG}/designs/
git add .ai-dlc/${INTENT_SLUG}/unit-*.md
git commit -m "elaborate: add wireframes for ${INTENT_SLUG} frontend and design units"
```

---

## Step 7: Write Results

Write the results file to `.ai-dlc/{intent-slug}/.briefs/elaborate-wireframes-results.md`:

**When a provider was used (at least one unit succeeded via provider):**

```markdown
---
status: success
error_message: ""
provider_used: {canva|openpencil|pencil}
---

# Wireframe Generation Results

## Provider

Used: {provider_name} (native generation)
Fallback units: {list of units that fell back to HTML, or "none"}

## Native Artifacts Generated

- `designs/unit-{NN}-{slug}-wireframe.{ext}` — {Unit Title} (provider: {provider_name})

## PNG Exports

- `mockups/unit-{NN}-{slug}-wireframe.png` — {Unit Title}

## HTML Wireframes (supplementary)

- `mockups/unit-{NN}-{slug}-wireframe.html` — {Unit Title} ({N} screens)

## Units Updated

- `unit-{NN}-{slug}.md` — added design_ref + wireframe fields (or wireframe only for HTML fallback units)

## Notes

- {observations, ambiguities, provider-specific notes}
```

**When no provider was used (HTML-only, same as previous behavior):**

```markdown
---
status: success
error_message: ""
provider_used: html
---

# Wireframe Generation Results

## Provider

Used: html (no design provider available)

## HTML Wireframes

- `mockups/unit-{NN}-{slug}-wireframe.html` — {Unit Title} ({N} screens: {state list})

## Units Updated

- `unit-{NN}-{slug}.md` — added wireframe field

## Notes

- {any observations about the wireframes, ambiguities noted, design interpretation decisions}
```

**If no frontend or design units were in the brief:**

```markdown
---
status: skipped
error_message: ""
provider_used: ""
---

# Wireframe Generation Results

No frontend or design units found — wireframe generation skipped.
```

---

## Error Handling

If any critical error occurs:

1. Write the results file with `status: error` and `error_message` describing what went wrong
2. Include any partial results (wireframes generated before the error)
3. Exit — the main elaborate skill will read the error status and handle it
