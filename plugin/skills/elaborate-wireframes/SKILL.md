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

## Step 3: Create Mockups Directory

```bash
INTENT_SLUG="{intent_slug from brief}"
mkdir -p ".ai-dlc/${INTENT_SLUG}/mockups"
```

---

## Step 4: Generate Wireframe HTML Per Frontend or Design Unit

For each frontend or design unit from the brief, create a self-contained HTML file at:
`.ai-dlc/{intent-slug}/mockups/unit-{NN}-{slug}-wireframe.html`

Where `{NN}` is the zero-padded unit number and `{slug}` is the unit filename slug.

### Wireframe Style Reference

All wireframes MUST use this exact visual style — a gray/white low-fidelity aesthetic with no brand colors, no custom fonts, and no JavaScript:

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

- Brand colors — use only grays (#888, #666, #aaa, #ccc, #ddd, #e0e0e0, #f0f0f0, #f5f5f5) and white
- Custom fonts — use only `system-ui, sans-serif`
- Icons — describe in text or use unicode characters
- JavaScript — no interactivity, no animations
- Responsive breakpoints — fixed 300px screen cards only
- High-fidelity design — no shadows, gradients, or brand styling

---

## Step 5: Add Wireframe Field to Unit Frontmatter

For each frontend or design unit that received a wireframe, update its frontmatter by adding or replacing the `wireframe:` field:

```yaml
wireframe: mockups/unit-{NN}-{slug}-wireframe.html
```

Read the unit file, find the YAML frontmatter block, add the `wireframe:` field, and write the file back.

---

## Step 6: Commit Wireframe Artifacts

```bash
INTENT_SLUG="{intent_slug from brief}"
git add .ai-dlc/${INTENT_SLUG}/mockups/
git add .ai-dlc/${INTENT_SLUG}/unit-*.md
git commit -m "elaborate: add wireframes for ${INTENT_SLUG} frontend and design units"
```

---

## Step 7: Write Results

Write the results file to `.ai-dlc/{intent-slug}/.briefs/elaborate-wireframes-results.md`:

```markdown
---
status: success
error_message: ""
---

# Wireframe Generation Results

## Wireframes Generated

- `mockups/unit-{NN}-{slug}-wireframe.html` — {Unit Title} ({N} screens: {state list})

## Units Updated

- `unit-{NN}-{slug}.md` — added wireframe field

## Notes

- {any observations about the wireframes, ambiguities noted, design interpretation decisions}
```

If no frontend or design units were in the brief:

```markdown
---
status: skipped
error_message: ""
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
