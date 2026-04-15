---
name: unit-02-design-ref-resolver
status: completed
depends_on: []
bolt: 0
hat: ''
started_at: null
completed_at: null
---


# unit-02-design-ref-resolver

## Description
Implement the design reference resolution logic that determines which design reference to use for a given unit's visual fidelity comparison. Supports a priority hierarchy of reference sources (external designs > previous iteration screenshots > elaboration wireframes), introduces the `design_ref:` frontmatter field for units, and produces reference screenshots ready for AI vision comparison.

## Discipline
backend - This unit will be executed by backend-focused agents.

## Domain Entities
- **DesignReference** — This unit implements the full lifecycle of this entity: detection, resolution, and screenshot generation. A DesignReference has a `type` (external, iteration, wireframe), a `path` (source file/URL), and a `fidelity` level (high for external, medium for iteration, low for wireframe).
- **Screenshot** — This unit produces reference screenshots (prefixed `ref-`) by invoking the capture infrastructure from unit-01.

## Data Sources
- **Unit frontmatter** (filesystem) — The `design_ref:` field (new, introduced by this unit) and existing `wireframe:` field determine reference source.
- **Intent frontmatter** (filesystem) — The `iterates_on:` field identifies previous intents whose screenshots serve as iteration references.
- **Previous intent screenshots** (filesystem/git) — Screenshots from prior intent at `.ai-dlc/{previous-slug}/screenshots/{unit-slug}/` or on the previous intent's git branch.
- **External design files** (filesystem) — Images, Figma exports, or design provider artifacts stored at paths referenced by `design_ref:`.
- **Design provider MCP** — If a design provider is configured, can fetch design assets via MCP tools.

## Technical Specification

### 1. Unit Frontmatter: `design_ref:` Field
Add support for a new optional frontmatter field in unit files:

```yaml
design_ref: "path/to/design-file.png"           # Local file path
design_ref: "figma://file-id/node-id"            # Figma reference (requires design provider)
design_ref: ".ai-dlc/{intent}/designs/screen.png" # Relative to repo root
```

When present, this field takes highest priority. When absent, the resolver falls through the hierarchy.

### 2. Resolution Logic
Create `plugin/lib/resolve-design-ref.sh` that determines the design reference for a unit:

**Input:** `--intent-slug <slug>` `--unit-slug <slug>` `--intent-dir <path>`

**Resolution priority (first match wins):**

1. **External design (`design_ref:` field):**
   - Parse unit frontmatter for `design_ref:` value
   - If it's a local path: verify file exists, determine type (image or HTML)
   - If it's a provider URI (e.g., `figma://`): use design provider MCP to download/export the asset to `.ai-dlc/{intent}/designs/`
   - Set `type=external`, `fidelity=high`

2. **Previous iteration screenshots (`iterates_on` context):**
   - Parse intent frontmatter for `iterates_on:` value
   - If set: look for screenshots from the previous intent that correspond to this unit's views
   - Search at `.ai-dlc/{previous-slug}/screenshots/` (filesystem first, then git branch fallback)
   - Match by view name or unit slug similarity (previous intent may have different unit slugs but equivalent views)
   - Set `type=iteration`, `fidelity=medium`

3. **Elaboration wireframes (`wireframe:` field):**
   - Parse unit frontmatter for existing `wireframe:` value
   - If set: locate the HTML wireframe file at the specified path
   - Set `type=wireframe`, `fidelity=low`

4. **No reference found:**
   - Return error with message: "No design reference found for unit {slug}. Add a `design_ref:` field to unit frontmatter, ensure `iterates_on` has prior screenshots, or generate wireframes during elaboration."
   - This is a hard failure — the visual gate cannot run without a reference.

**Output:** JSON to stdout:
```json
{
  "type": "external|iteration|wireframe",
  "fidelity": "high|medium|low",
  "source_path": "/path/to/source/file",
  "source_format": "png|jpg|html",
  "views": ["home", "dashboard", "settings"]
}
```

### 3. Reference Screenshot Generation
After resolving the reference source, generate reference screenshots using unit-01's capture infrastructure:

- **For image files (PNG, JPG):** Use manual capture provider to copy them with `ref-` prefix. If the image doesn't match any breakpoint, use it as-is for all breakpoints (the vision model handles size differences).
- **For HTML files (wireframes):** Use Playwright capture provider in `--static` mode with `--prefix ref-` to render at each breakpoint.
- **For Figma exports:** Download as PNG via design provider MCP, then use manual capture provider.

Store reference screenshots alongside built screenshots:
```
.ai-dlc/{intent-slug}/screenshots/{unit-slug}/
  ├── ref-mobile-{view}.png
  ├── ref-tablet-{view}.png
  └── ref-desktop-{view}.png
```

### 4. View Discovery
The resolver needs to know which views/pages to compare. Extract view information from:
- Unit spec's Technical Specification section (look for route paths, page names, screen names)
- The `wireframe:` field filename (e.g., `unit-02-dashboard-wireframe.html` → view "dashboard")
- The `design_ref:` path (if it's a directory, each file is a view)
- Explicit `views:` frontmatter field (optional, for units with multiple views):
  ```yaml
  views:
    - name: home
      route: /
    - name: dashboard
      route: /dashboard
  ```

### 5. Fidelity-Aware Comparison Hints
The resolver's output includes the `fidelity` level so downstream vision comparison (unit-03) can adjust its tolerance:
- **high** (external designs): Expect close visual match — colors, typography, spacing, layout should align
- **medium** (iteration screenshots): Expect structural similarity but allow intentional changes from the follow-up scope
- **low** (wireframes): Expect structural/layout match only — colors, fonts, and styling will differ significantly (wireframes are gray/white)

## Success Criteria
- [x] `plugin/lib/resolve-design-ref.sh` resolves design references using the 3-level priority hierarchy
- [x] Unit frontmatter `design_ref:` field is supported and takes highest priority
- [x] Previous iteration screenshots are found via `iterates_on` with filesystem and git branch fallback
- [x] Wireframe HTML files are correctly identified as lowest-priority reference
- [x] Reference screenshots are generated using unit-01's capture infrastructure with `ref-` prefix
- [x] Resolver outputs JSON with type, fidelity, source path, and view list
- [x] Hard failure (non-zero exit) when no reference can be resolved for a UI-producing unit
- [x] Fidelity level is included in output for downstream tolerance adjustment

## Risks
- **View matching across iterations**: Previous intent may use different unit slugs or view names. Mitigation: match by view name similarity (fuzzy match), fall through to wireframe if no match found.
- **Figma export reliability**: Design provider MCP may not be configured or may fail. Mitigation: fall through to next priority level. Only fail hard if ALL levels fail.
- **Large design files**: Figma exports or high-res screenshots may be very large. Mitigation: resize to reasonable dimensions (max 2560px wide) before storing as references.

## Boundaries
This unit does NOT handle:
- Screenshot capture mechanics — uses unit-01's capture infrastructure
- AI vision comparison — unit-03 consumes this unit's output
- Reviewer hat integration — unit-03 wires everything together
- Documentation — unit-04 covers that

This unit ONLY resolves which reference to use, generates reference screenshots, and outputs structured metadata.

## Notes
- The `design_ref:` field is optional — most units will rely on wireframes or iteration screenshots. External design linking is for projects with dedicated design teams.
- The `views:` frontmatter field is also optional — the resolver should infer views from available data when possible.
- Consider caching resolved references to avoid re-resolving on every review cycle (reference rarely changes within an intent).
- The fidelity level is critical for unit-03's vision prompt — comparing a gray wireframe pixel-for-pixel against a styled app would always fail. The fidelity hint prevents this.
