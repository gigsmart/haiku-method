---
status: completed
last_updated: "2026-04-01T13:24:36Z"
depends_on: [unit-01-knowledge-infrastructure, unit-03-direction-picker-mcp]
branch: ai-dlc/design-direction-system/04-archetype-library
discipline: backend
pass: ""
workflow: ""
ticket: ""
design_ref: ""
views: []
hat: ""
---

# unit-04-archetype-library

## Description
Define the 4 design archetypes and 4 tunable parameters that the design direction picker presents. Each archetype includes CSS tokens, layout guidelines, typography rules, component guidelines, and a preview HTML snippet. Also implement the design blueprint generation function that transforms a chosen archetype + parameter values into a `design-blueprint.md` artifact.

## Discipline
backend - This unit will be executed by backend-focused agents.

## Domain Entities
- **DesignArchetype**: Complete archetype definition with visual identity, tokens, and preview
- **DesignParameter**: Tunable axis with ranges and archetype-specific defaults
- **DesignBlueprint**: Output artifact from archetype + parameters

## Data Sources
- **Unit-03 MCP tool**: The `pick_design_direction` tool's input schema defines the data shape archetypes must conform to
- **`plugin/lib/knowledge.sh`** (from unit-01): `dlc_knowledge_write()` for seeding `design.md`
- **Wireframe skill patterns** (`plugin/skills/elaborate/subskills/wireframes/SKILL.md`): CSS patterns that the blueprint tokens need to replace

## Technical Specification

### 1. Archetype Data Module

Create `plugin/data/archetypes.json` as the **canonical source of truth** for archetype and parameter definitions. This JSON file is readable by both the TypeScript MCP server (imported at build time) and shell functions (parsed with `jq` at runtime).

Then create `plugin/mcp-server/src/archetypes.ts` as a thin TypeScript wrapper that imports and re-exports the JSON data with proper types. The shell blueprint generation function reads the same JSON file via `jq`.

**Why JSON as source of truth:** The MCP tool (TypeScript) serves archetype data to the browser picker, but the blueprint generation function (shell) needs the same archetype data (CSS tokens, layout guidelines, etc.) to produce the blueprint. Storing archetypes in JSON ensures both consumers read identical data without a serialization bridge.

#### Archetype Definitions

Each archetype is a data object conforming to the `pick_design_direction` tool's input schema:

**Brutalist**
```typescript
{
  name: "Brutalist",
  description: "High contrast, raw borders, intentional roughness, asymmetric grids, monospace type",
  default_parameters: { density: 60, expressiveness: 80, shape_language: 10, color_mood: 30 },
  css_tokens: {
    // Colors — high contrast, limited palette
    "--color-primary": "#000000",
    "--color-secondary": "#ffffff",
    "--color-accent": "#ff0000",
    "--color-surface": "#f5f5f5",
    "--color-border": "#000000",

    // Typography — monospace, heavy weights
    "--font-family-heading": "'Courier New', Courier, monospace",
    "--font-family-body": "'Courier New', Courier, monospace",
    "--font-weight-heading": "900",
    "--font-size-base": "14px",
    "--line-height-base": "1.4",

    // Spacing — tight, deliberate
    "--spacing-unit": "8px",
    "--spacing-section": "32px",

    // Shape — sharp, raw
    "--border-radius": "0px",
    "--border-width": "3px",
    "--shadow": "none",
  },
  layout_guidelines: [
    "Use asymmetric grid layouts — avoid perfect 50/50 splits",
    "Full-width sections separated by thick horizontal rules",
    "Content blocks can overlap or break the grid intentionally",
    "Navigation can be unconventional — bottom, side, or inline",
    "Whitespace is used aggressively as a design element, not just padding",
  ],
  typography_rules: [
    "Monospace for all text — headings and body",
    "Heading sizes should be dramatically larger than body (3x+)",
    "UPPERCASE for navigation and labels",
    "Body text is small and dense",
    "Letter-spacing is either very tight or very wide — never default",
  ],
  component_guidelines: [
    "Buttons are rectangular with thick borders, no rounded corners",
    "Form inputs have bottom-border-only or thick full borders",
    "Cards use solid borders, no shadows — content separated by lines",
    "Status indicators use text labels, not colored dots",
    "Links are styled differently from body text — underline, different weight, or color",
  ],
}
```

**Editorial**
```typescript
{
  name: "Editorial",
  description: "Magazine-inspired layouts, strong typography hierarchy, generous whitespace, editorial grid systems",
  default_parameters: { density: 25, expressiveness: 65, shape_language: 40, color_mood: 50 },
  css_tokens: {
    "--color-primary": "#1a1a1a",
    "--color-secondary": "#f8f7f4",
    "--color-accent": "#c5a572",
    "--color-surface": "#ffffff",
    "--color-border": "#e5e5e5",

    "--font-family-heading": "Georgia, 'Times New Roman', serif",
    "--font-family-body": "system-ui, -apple-system, sans-serif",
    "--font-weight-heading": "700",
    "--font-size-base": "17px",
    "--line-height-base": "1.7",

    "--spacing-unit": "8px",
    "--spacing-section": "64px",

    "--border-radius": "2px",
    "--border-width": "1px",
    "--shadow": "0 1px 3px rgba(0,0,0,0.08)",
  },
  layout_guidelines: [
    "Use multi-column editorial grids — asymmetric columns (2/3 + 1/3, 3/5 + 2/5)",
    "Generous vertical spacing between sections (64px+)",
    "Hero sections with large typography and minimal imagery",
    "Pull quotes and callouts break the grid for emphasis",
    "Content width constrained (max-width 720px for reading, wider for data)",
  ],
  typography_rules: [
    "Serif headings, sans-serif body — classic editorial pairing",
    "Dramatic size hierarchy: hero > h1 > h2 > body (each step 1.5x+)",
    "Body text at 17-19px for readability",
    "Subtle use of italic for emphasis, bold sparingly",
    "Drop caps or large first letters for article-style content",
  ],
  component_guidelines: [
    "Cards have minimal borders — separation through whitespace and subtle shadows",
    "Buttons are refined — thin borders or text-only, not chunky",
    "Form inputs are underlined or lightly bordered, plenty of padding",
    "Navigation is horizontal, serif-styled, spaced generously",
    "Images use aspect ratios common in print (4:3, 16:9, golden ratio)",
  ],
}
```

**Dense / Utilitarian**
```typescript
{
  name: "Dense / Utilitarian",
  description: "Dense information display, minimal chrome, keyboard-first, data tables and compact controls",
  default_parameters: { density: 90, expressiveness: 15, shape_language: 20, color_mood: 40 },
  css_tokens: {
    "--color-primary": "#e0e0e0",
    "--color-secondary": "#1e1e1e",
    "--color-accent": "#4fc3f7",
    "--color-surface": "#2a2a2a",
    "--color-border": "#444444",

    "--font-family-heading": "'SF Mono', 'Cascadia Code', 'Fira Code', monospace",
    "--font-family-body": "system-ui, -apple-system, sans-serif",
    "--font-weight-heading": "600",
    "--font-size-base": "13px",
    "--line-height-base": "1.3",

    "--spacing-unit": "4px",
    "--spacing-section": "16px",

    "--border-radius": "3px",
    "--border-width": "1px",
    "--shadow": "none",
  },
  layout_guidelines: [
    "Pack information densely — minimize wasted space",
    "Multi-panel layouts: sidebars, split views, resizable panes",
    "Data tables as primary display — not cards",
    "Collapsible/expandable sections for progressive disclosure",
    "Fixed headers/footers with scrollable content areas",
    "Keyboard shortcuts displayed inline (⌘K, Ctrl+P style)",
  ],
  typography_rules: [
    "Small base font (12-13px), monospace for data/code",
    "Minimal heading hierarchy — use weight and subtle size differences",
    "Truncation with ellipsis for long content in tables",
    "Tabular numbers for data columns (font-variant-numeric: tabular-nums)",
    "Muted colors for secondary text — not size differences",
  ],
  component_guidelines: [
    "Buttons are small, compact — icon buttons where possible",
    "Inputs are compact with minimal padding",
    "Tables are the primary data display — sortable columns, dense rows",
    "Use command palette (⌘K) patterns for navigation",
    "Status indicators are small colored dots or inline badges",
    "Tooltips and keyboard hints on hover",
  ],
}
```

**Playful / Warm**
```typescript
{
  name: "Playful / Warm",
  description: "Rounded corners, vibrant colors, playful micro-interactions, illustrated empty states",
  default_parameters: { density: 40, expressiveness: 90, shape_language: 85, color_mood: 75 },
  css_tokens: {
    "--color-primary": "#6366f1",
    "--color-secondary": "#fef3c7",
    "--color-accent": "#f472b6",
    "--color-surface": "#fffbeb",
    "--color-border": "#e0d5c1",

    "--font-family-heading": "'Inter', system-ui, sans-serif",
    "--font-family-body": "'Inter', system-ui, sans-serif",
    "--font-weight-heading": "800",
    "--font-size-base": "15px",
    "--line-height-base": "1.6",

    "--spacing-unit": "8px",
    "--spacing-section": "48px",

    "--border-radius": "16px",
    "--border-width": "2px",
    "--shadow": "0 4px 12px rgba(0,0,0,0.08)",
  },
  layout_guidelines: [
    "Card-based layouts with generous padding and rounded corners",
    "Centered content with comfortable max-width (960px)",
    "Illustrated empty states — not just 'no data' text",
    "Gradient backgrounds for hero sections and CTAs",
    "Playful asymmetry — offset elements, rotated cards, floating badges",
    "Generous spacing — things breathe, nothing feels cramped",
  ],
  typography_rules: [
    "Sans-serif throughout — rounded, friendly typefaces",
    "Bold headings (700-800 weight) with generous letter-spacing",
    "Body text at 15-16px, comfortable reading",
    "Use of emoji and icons inline with text for personality",
    "Friendly, conversational tone in UI copy",
  ],
  component_guidelines: [
    "Buttons are large and rounded — pill shapes or large radius",
    "Form inputs have rounded borders with inner shadows",
    "Cards are elevated with shadows and large border-radius",
    "Avatar circles and rounded profile elements",
    "Progress indicators use colored fills and animations",
    "Empty states include illustrations or playful messaging",
  ],
}
```

#### Parameter Definitions

```typescript
const parameters: DesignParameterData[] = [
  {
    name: "density",
    label: "Density",
    description: "How much whitespace vs information density",
    min: 0,
    max: 100,
    step: 10,
    default: 50,
    labels: { low: "Airy / Editorial", high: "Packed / Dashboard" },
  },
  {
    name: "expressiveness",
    label: "Expressiveness",
    description: "How much personality the interface shows",
    min: 0,
    max: 100,
    step: 10,
    default: 50,
    labels: { low: "Strictly Functional", high: "Expressive / Opinionated" },
  },
  {
    name: "shape_language",
    label: "Shape Language",
    description: "The geometry of UI elements",
    min: 0,
    max: 100,
    step: 10,
    default: 50,
    labels: { low: "Sharp / Geometric", high: "Rounded / Soft" },
  },
  {
    name: "color_mood",
    label: "Color Mood",
    description: "The emotional temperature of the color palette",
    min: 0,
    max: 100,
    step: 10,
    default: 50,
    labels: { low: "Cool / Monochrome", high: "Warm / Vibrant" },
  },
];
```

### 2. Preview HTML Snippets

Each archetype needs a `preview_html` string — a self-contained HTML snippet (~100-150 lines) that renders a miniature representative interface inside the picker's iframe. The preview should show:

- A navigation bar
- A heading with body text
- A card or data display element
- A button and a form input
- Enough layout to communicate the archetype's spatial personality

Each preview uses only inline styles (no external dependencies) and is self-contained. The styles reflect that archetype's CSS tokens (colors, typography, spacing, shape).

The previews are NOT full mockups — they're impression pieces that communicate the archetype's feel at a glance. Think of them as design mood swatches, not wireframes.

### 3. Design Blueprint Generation

Create a function (in `plugin/lib/knowledge.sh` or a new `plugin/lib/design-blueprint.sh`) that transforms archetype + parameters into a `design-blueprint.md` artifact:

**`dlc_generate_design_blueprint(intent_slug, archetype_name, archetype_data_json, parameters_json)`**

This function:
1. Reads the archetype definition (CSS tokens, layout guidelines, typography, component guidelines)
2. Applies parameter adjustments using these concrete mappings (linear interpolation between endpoints):

   **Density** (0=airy, 100=packed):
   | Parameter Value | `--spacing-unit` | `--spacing-section` | `--font-size-base` | `--line-height-base` |
   |:-:|:-:|:-:|:-:|:-:|
   | 0 | 12px | 80px | 18px | 1.8 |
   | 50 | 8px | 48px | 15px | 1.5 |
   | 100 | 4px | 16px | 12px | 1.2 |

   **Shape Language** (0=sharp, 100=rounded):
   | Parameter Value | `--border-radius` | `--border-width` |
   |:-:|:-:|:-:|
   | 0 | 0px | 3px |
   | 50 | 8px | 2px |
   | 100 | 20px | 1px |

   **Color Mood** (0=cool/monochrome, 100=warm/vibrant):
   - At 0: desaturate all accent/surface colors by 80% (toward grayscale)
   - At 50: use archetype's default colors unchanged
   - At 100: increase saturation by 30% and shift hue +15° toward warm (red/orange)
   - Implementation: convert hex to HSL, adjust S and H, convert back

   **Expressiveness** (0=strict, 100=expressive):
   - This parameter does NOT modify CSS tokens — it modifies the text of the layout and component guidelines:
   - At 0-30: Add guidelines like "Stick to strict grid alignment", "No decorative elements", "Minimal visual hierarchy"
   - At 70-100: Add guidelines like "Break the grid for emphasis", "Use decorative borders and dividers", "Dramatic size contrasts are encouraged"
   - At 40-60: Use the archetype's default guidelines unchanged
3. Writes `.ai-dlc/{intent-slug}/design-blueprint.md` with:

```yaml
---
archetype: Brutalist
parameters:
  density: 70
  expressiveness: 80
  shape_language: 10
  color_mood: 30
generated: 2026-03-31T22:00:00Z
---
```

Body contains the full design direction document:
```markdown
# Design Blueprint: {Archetype Name}

## CSS Tokens
{All CSS custom property definitions, adjusted by parameters}

## Layout Guidelines
{Archetype layout rules, adjusted by density and expressiveness}

## Typography
{Font families, sizes, weights, line heights — adjusted by density}

## Component Guidelines
{Archetype component rules — shape adjusted by shape_language}

## Color Palette
{Full color palette with semantic roles — mood adjusted by color_mood}
```

### 4. Knowledge Seeding

After generating the design blueprint, call `dlc_knowledge_write("design", ...)` to seed `knowledge/design.md` with the blueprint's content (adapted to the knowledge schema format from unit-01). This is the bridge between per-intent blueprints and persistent project knowledge.

## Success Criteria
- [ ] `plugin/mcp-server/src/archetypes.ts` exports 4 archetype definitions with all required fields
- [ ] Each archetype has distinct CSS tokens that produce visually different results (not minor variations)
- [ ] Each archetype has specific layout, typography, and component guidelines that a builder can follow
- [ ] 4 parameter definitions with sensible ranges, steps, and descriptive labels
- [ ] Each archetype defines its own default parameter values that make sense for its personality
- [ ] Preview HTML snippets are self-contained and render a representative interface snippet for each archetype
- [ ] Preview snippets are visually distinct from each other — a user can tell archetypes apart at a glance
- [ ] Blueprint generation function applies parameter adjustments to CSS tokens correctly
- [ ] Density parameter visibly affects spacing and font size in the generated blueprint
- [ ] Shape language parameter visibly affects border-radius values
- [ ] Color mood parameter shifts the color palette temperature
- [ ] Generated `design-blueprint.md` has valid YAML frontmatter and complete markdown body
- [ ] Knowledge seeding correctly populates `knowledge/design.md` from the blueprint
- [ ] Generated CSS token values are syntactically valid CSS custom property values at all parameter extremes (0 and 100 for each parameter)
- [ ] All existing tests pass

## Risks
- **Archetype convergence**: Despite different names, archetypes might produce insufficiently different results if CSS tokens are too similar. Mitigation: Review preview snippets side-by-side and ensure each archetype makes immediately different first impressions — different fonts, different spacing rhythms, different shape language.
- **Parameter math**: Interpolating parameters (e.g., density 70 → spacing 6px) requires numerical transformations that could produce ugly results at extremes. Mitigation: Define parameter-to-token mappings with sensible clamping so extremes still look designed, not broken.
- **Preview HTML maintenance**: 4 separate HTML snippets are a maintenance burden. Mitigation: Keep them simple (~100 lines each) and focused on impression, not completeness.

## Boundaries
This unit does NOT handle:
- The MCP tool, session type, or HTTP routes (that's unit-03)
- Knowledge directory infrastructure (that's unit-01)
- Calling the picker or generating blueprints from the elaboration flow (that's unit-05)
- Updating wireframes to use blueprint tokens (that's unit-05)
- Hat integration (that's unit-06)

This unit ONLY defines archetype data, parameter data, preview HTML, and the blueprint generation function.

## Notes
- The archetypes should feel like they were designed by different design studios, not variations of the same theme
- Preview HTML must be fully self-contained (inline styles only) because they render inside sandboxed iframes
- Parameter-to-token mappings should be linear interpolation with clamped extremes — keep the math simple
- The blueprint format should be human-readable — a developer should be able to open it and understand the design direction without running any tools
