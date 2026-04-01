---
status: completed
last_updated: "2026-04-01T13:34:23Z"
depends_on: [unit-02-knowledge-synthesis, unit-03-direction-picker-mcp, unit-04-archetype-library]
branch: ai-dlc/design-direction-system/05-elaboration-integration
discipline: backend
pass: ""
workflow: ""
ticket: ""
design_ref: ""
views: []
hat: ""
---

# unit-05-elaboration-integration

## Description
Integrate the design direction system and knowledge layer into the elaboration flow. This unit adds Phase 2.75 (Design Direction) to the elaborate skill, triggers knowledge synthesis on first elaboration, passes the design blueprint to the wireframe skill for styled wireframes, and loads knowledge artifacts for context during clarification and discovery.

## Discipline
backend - This unit will be executed by backend-focused agents.

## Domain Entities
- **ElaborateSkill**: The existing `plugin/skills/elaborate/SKILL.md` that gets a new phase
- **ElaborateWireframesSkill**: The existing `plugin/skills/elaborate/subskills/wireframes/SKILL.md` that gets blueprint awareness
- **DesignBlueprint**: The `.ai-dlc/{slug}/design-blueprint.md` artifact from unit-04
- **KnowledgeArtifact**: Persistent knowledge files from `.ai-dlc/knowledge/`

## Data Sources
- **`plugin/skills/elaborate/SKILL.md`**: The main elaboration skill to modify
- **`plugin/skills/elaborate/subskills/wireframes/SKILL.md`**: The wireframe generation skill to modify
- **`plugin/lib/knowledge.sh`** (unit-01): Knowledge read/write API
- **`plugin/lib/config.sh`**: `detect_project_maturity()` for greenfield gating
- **MCP server** (unit-03): `pick_design_direction` tool
- **`plugin/mcp-server/src/archetypes.ts`** (unit-04): Archetype and parameter definitions

## Technical Specification

### 1. New Phases 2.3 and 2.75: Knowledge Bootstrap & Design Direction

Split the knowledge and design direction work into two phases to avoid overlap with domain discovery:

- **Phase 2.3** (before discovery): Knowledge Bootstrap — synthesize knowledge artifacts from existing code so discovery can build on them
- **Phase 2.75** (after discovery): Design Direction — present the visual picker for greenfield projects

This ordering ensures: (1) knowledge synthesis scans the codebase first, (2) domain discovery can reference synthesized knowledge, and (3) design direction happens after the domain model is understood.

Insert Phase 2.3 between Phase 2.25 (worktree creation) and Phase 2.5 (domain discovery) in `plugin/skills/elaborate/SKILL.md`.

**Phase 2.3: Knowledge Bootstrap**

```markdown
## Phase 2.3: Knowledge Bootstrap

### Step 1: Check project maturity and existing knowledge

```bash
source "${CLAUDE_PLUGIN_ROOT}/lib/config.sh"
source "${CLAUDE_PLUGIN_ROOT}/lib/knowledge.sh"
PROJECT_MATURITY=$(detect_project_maturity)
HAS_DESIGN_KNOWLEDGE=$(dlc_knowledge_exists "design" && echo "true" || echo "false")
KNOWLEDGE_COUNT=$(dlc_knowledge_list | wc -l | tr -d ' ')
```

### Step 2: Knowledge Synthesis (first elaboration or missing knowledge)

**Gate:** Only invoke the full synthesis subagent if `KNOWLEDGE_COUNT` is 0 AND `PROJECT_MATURITY` is `early` or `established` (there's actually code to scan). For greenfield projects with no code, skip the subagent and write inline scaffold artifacts instead (empty sections with "greenfield — will be populated as the project grows" notes). This avoids wasting a subagent invocation on an empty codebase.

If synthesis is needed:
1. Write knowledge synthesis brief to `.ai-dlc/{intent-slug}/.briefs/knowledge-synthesize.md`
2. Invoke the knowledge synthesis subagent:
   ```
   Agent({
     subagent_type: "general-purpose",
     description: "knowledge-synthesize: {INTENT_SLUG}",
     prompt: "Read the skill definition at plugin/skills/elaborate/subskills/knowledge-synthesize/SKILL.md first, then execute it with the brief file at .ai-dlc/{INTENT_SLUG}/.briefs/knowledge-synthesize.md as input."
   })
   ```
3. Read results from `.ai-dlc/{intent-slug}/.briefs/knowledge-synthesize-results.md`
4. Commit synthesized knowledge artifacts

**CRITICAL — DO NOT STOP HERE.** Knowledge synthesis is just one step. Domain discovery (Phase 2.5) follows and can now build on the synthesized knowledge.
```

Insert Phase 2.75 between Phase 2.5 (Domain Discovery completion) and Phase 3 (Workflow Selection).

**Phase 2.75: Design Direction**

```markdown
## Phase 2.75: Design Direction

### Step 1: Check design knowledge

```bash
source "${CLAUDE_PLUGIN_ROOT}/lib/knowledge.sh"
HAS_DESIGN_KNOWLEDGE=$(dlc_knowledge_exists "design" && echo "true" || echo "false")
```

### Step 2: Design Direction (greenfield only)

**Gate:** Only activate if `PROJECT_MATURITY` is `greenfield` or `early` AND `HAS_DESIGN_KNOWLEDGE` is `false`.

If both conditions are met:

**Visual Picker Path (preferred):**

Check if the `pick_design_direction` MCP tool is available:
```
ToolSearch("pick_design_direction")
```

If available:
1. Load archetype and parameter data (import from archetypes module or read from a JSON config)
2. Call `pick_design_direction` with archetypes and parameters
3. Poll `get_review_status` until status is `"answered"`
4. Read the selection: `{ archetype, parameters }`
5. Generate design blueprint: call `dlc_generate_design_blueprint()`
6. Seed knowledge: blueprint content → `knowledge/design.md`
7. Commit:
   ```bash
   git add .ai-dlc/${INTENT_SLUG}/design-blueprint.md .ai-dlc/knowledge/design.md
   git commit -m "elaborate(${INTENT_SLUG}): set design direction — {archetype name}"
   ```

**Terminal Fallback Path:**

If MCP tool is not available:
1. Use `AskUserQuestion` to present archetype options:
   ```json
   {
     "questions": [{
       "question": "Choose a design direction for this project:",
       "header": "Archetype",
       "options": [
         {"label": "Brutalist", "description": "High contrast, raw borders, asymmetric grids, monospace type"},
         {"label": "Editorial", "description": "Magazine layouts, strong typography, generous whitespace"},
         {"label": "Dense / Utilitarian", "description": "Packed information, minimal chrome, keyboard-first"},
         {"label": "Playful / Warm", "description": "Rounded corners, vibrant colors, playful personality"}
       ],
       "multiSelect": false
     }]
   }
   ```
2. Use default parameters for the chosen archetype (no slider tuning in terminal mode)
3. Generate blueprint and seed knowledge as above

**Skip condition:** If `PROJECT_MATURITY` is NOT `greenfield`, or if `HAS_DESIGN_KNOWLEDGE` is already `true`, skip the design direction picker entirely. The existing `knowledge/design.md` (from prior intent or from synthesis) is already available.

### Step 4: Load knowledge context for remaining phases

After knowledge bootstrap and optional design direction:

```bash
# Load domain and product knowledge for use in remaining elaboration phases
DOMAIN_KNOWLEDGE=$(dlc_knowledge_read "domain" 2>/dev/null || echo "")
PRODUCT_KNOWLEDGE=$(dlc_knowledge_read "product" 2>/dev/null || echo "")
```

If domain knowledge exists, pass it to Phase 3 (Workflow Selection) and Phase 5 (Decomposition) as additional context. This enriches unit specs with domain vocabulary and business rules already captured in knowledge artifacts.

**Autonomous mode behavior:** In autonomous mode, the design direction phase auto-selects **Editorial** with default parameters (the most conventional and broadly appropriate archetype). Knowledge synthesis runs silently. The autonomous default can be overridden via `default_archetype` in `.ai-dlc/settings.yml`.
```

### 2. Knowledge-Aware Discovery (Phase 2.5 update)

Update Phase 2.5 (Domain Discovery) in the elaborate skill to include existing knowledge artifacts in the discovery brief:

In the discovery brief template, add a new section:

```markdown
## Existing Project Knowledge

{For each knowledge artifact that exists, include its content.
This allows the discovery subagent to avoid re-discovering what's
already known and focus on new areas.}

### knowledge/design.md
{content if exists}

### knowledge/architecture.md
{content if exists}

### knowledge/domain.md
{content if exists}
```

This is a small addition to the brief template — it enriches discovery with existing knowledge so the subagent doesn't duplicate work.

### 3. Styled Wireframes (elaborate-wireframes skill update)

Update `plugin/skills/elaborate/subskills/wireframes/SKILL.md` to produce styled wireframes when a design blueprint exists.

**Changes to the wireframe brief:**

Add a new frontmatter field:
```yaml
design_blueprint_path: .ai-dlc/{intent-slug}/design-blueprint.md  # or empty if no blueprint
```

**Changes to wireframe generation (Step 4):**

When `design_blueprint_path` is non-empty:
1. Read the design blueprint
2. Replace the hardcoded gray-box CSS with blueprint CSS tokens:
   - Replace `#888` button backgrounds with `var(--color-primary)` or the blueprint's primary color
   - Replace `#e8e8e8` header backgrounds with the blueprint's surface color
   - Replace `system-ui, sans-serif` font with the blueprint's font families
   - Replace `border-radius: 0` with the blueprint's border-radius
   - Apply the blueprint's spacing scale instead of hardcoded px values
   - Apply the blueprint's shadow values
3. Apply layout guidelines:
   - If blueprint says "asymmetric grids" → use unequal column widths
   - If blueprint says "card-based" → wrap content in bordered/shadowed cards
   - If blueprint says "data tables" → present lists as tables, not cards
4. The wireframe should still be recognizably low-fidelity (no photos, no real brand assets) but carry the spatial personality and visual rhythm of the chosen archetype

**When `design_blueprint_path` is empty:** Produce standard gray-box wireframes (current behavior, unchanged).

**CSS Token Injection:**

Add a `<style>` block at the top of the wireframe HTML that defines the blueprint's CSS custom properties:

```html
<style>
  :root {
    --color-primary: {from blueprint};
    --color-secondary: {from blueprint};
    --color-accent: {from blueprint};
    --color-surface: {from blueprint};
    --color-border: {from blueprint};
    --font-family-heading: {from blueprint};
    --font-family-body: {from blueprint};
    --border-radius: {from blueprint};
    --spacing-unit: {from blueprint};
    /* ... all tokens from blueprint */
  }
</style>
```

Then reference these variables in the wireframe's component styles instead of hardcoded values.

### 4. Wireframe Brief Update

Update the wireframes brief template (written in Phase 6.25 Step 3 of the elaborate skill) to include the `design_blueprint_path` field:

```markdown
---
intent_slug: {INTENT_SLUG}
worktree_path: {absolute path}
intent_title: {Intent Title}
design_provider_type: {DESIGN_TYPE or empty}
design_blueprint_path: {path to design-blueprint.md or empty}
---
```

## Success Criteria
- [ ] Phase 2.75 is inserted between Phase 2.5 and Phase 3 in the elaborate skill
- [ ] Knowledge synthesis triggers automatically on first elaboration when no knowledge artifacts exist
- [ ] Design direction picker activates for greenfield projects without existing design knowledge
- [ ] Design direction picker is skipped for brownfield/established projects
- [ ] MCP visual picker is used when available, terminal fallback when not
- [ ] Selected direction produces both `design-blueprint.md` and seeds `knowledge/design.md`
- [ ] Discovery brief includes existing knowledge artifacts for enriched exploration
- [ ] Wireframe brief includes `design_blueprint_path` field
- [ ] Wireframe skill reads blueprint and produces styled wireframes with archetype CSS tokens
- [ ] Styled wireframes use the blueprint's fonts, colors, spacing, and border-radius instead of gray defaults
- [ ] Styled wireframes still look low-fidelity (no photos/brand assets) but carry the archetype's spatial personality
- [ ] When no blueprint exists, wireframes produce standard gray-box output (backwards compatible)
- [ ] Domain and product knowledge are loaded and available for Phase 3+ context
- [ ] Autonomous mode auto-selects Editorial archetype with defaults (configurable via settings)
- [ ] When design_blueprint_path is set in the wireframe brief frontmatter, the wireframe skill reads and applies it; when empty or missing, gray-box behavior is preserved (end-to-end integration test)

## Risks
- **Phase ordering complexity**: Inserting Phase 2.75 into an already complex elaboration flow could create subtle ordering issues. Mitigation: The phase has clear entry/exit conditions and only runs when both gates (greenfield AND no existing knowledge) are met.
- **Wireframe CSS conflicts**: Injecting blueprint tokens into the existing wireframe CSS could break the layout if tokens conflict with hardcoded values. Mitigation: Use CSS custom properties consistently — the wireframe template references `var(--token)` and the blueprint provides the values. Hardcoded fallbacks for missing tokens.
- **Knowledge synthesis blocking**: If synthesis takes a long time, it could stall elaboration. Mitigation: Run synthesis as a subagent (already delegated) and set a reasonable scope (sample files, don't read everything).

## Boundaries
This unit does NOT handle:
- Knowledge directory API (unit-01)
- Knowledge synthesis logic (unit-02)
- MCP tool, session, routes (unit-03)
- Archetype definitions and blueprint generation (unit-04)
- Teaching hats to read knowledge (unit-06)

This unit ONLY handles the integration: wiring the direction picker into elaboration, triggering synthesis, and passing blueprints to wireframes.

## Notes
- Phase 2.75 gates on TWO conditions: `PROJECT_MATURITY === greenfield` AND `HAS_DESIGN_KNOWLEDGE === false`. Both must be true for the picker to activate. This prevents the picker from appearing on every elaboration.
- The wireframe changes should be backwards-compatible — if no blueprint exists, the old gray-box behavior is preserved
- Keep the elaborate skill changes surgical — add the new phase and the brief field, don't refactor surrounding phases
- The terminal fallback is a first-class path, not an afterthought — it should produce the same blueprint and knowledge artifacts as the visual picker
