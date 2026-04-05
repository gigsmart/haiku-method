---
description: (Internal) Design direction selection and blueprint generation for H·AI·K·U elaboration
user-invocable: false
---

# Elaborate: Design Direction

Composable sub-skill for selecting a design archetype and generating a design blueprint. Used by single-stage and stage-elaborate mode sub-skills during elaboration.

**This sub-skill runs inline** — it has access to `AskUserQuestion` and the full conversation context from the calling mode sub-skill.

---

## Inputs (from calling context)

The calling mode sub-skill MUST set these variables before invoking this sub-skill:

- `INTENT_SLUG` — the intent slug
- `PROJECT_MATURITY` — `greenfield`, `early`, or `established`
- `AUTONOMOUS_MODE` — `true` or `false`

---

## Step 1: Check Design Knowledge

```bash
source "${CLAUDE_PLUGIN_ROOT}/lib/knowledge.sh"
HAS_DESIGN_KNOWLEDGE=$(hku_knowledge_exists "design" && echo "true" || echo "false")
```

---

## Step 2: Gate Check

**Skip this sub-skill entirely if:**
- `PROJECT_MATURITY` is `established`, OR
- `HAS_DESIGN_KNOWLEDGE` is `true`

If skipped, proceed to Step 5 (Load Knowledge Context) — design knowledge already exists.

---

## Step 3: Select Archetype

### Autonomous Mode

In autonomous mode, skip the picker UI entirely. Auto-select **Editorial** with default parameters (the most conventional and broadly appropriate archetype). This default can be overridden via `default_archetype` in `.haiku/settings.yml`:

```bash
source "${CLAUDE_PLUGIN_ROOT}/lib/config.sh"
DEFAULT_ARCHETYPE=$(get_setting_value "default_archetype" "editorial")
```

Generate the blueprint and seed knowledge using the selected archetype with its default parameters. Skip to Step 4.

### Interactive Mode

Attempt to use the `pick_design_direction` MCP tool. If the tool call fails (tool not found, MCP server disconnected), fall back to the Terminal Fallback Path below.

**Visual Picker Path (preferred):**

Try calling `pick_design_direction` with the archetypes data. If the call succeeds, proceed with polling. If it fails with a tool-not-found error, fall through to the Terminal Fallback Path.

1. Call `pick_design_direction` with the archetypes data. The MCP tool opens a browser-based visual picker showing archetype previews and parameter sliders.
2. Parse the session ID from the response, then poll `get_review_status({session_id})` until `status` is `"answered"`.
3. Read the selection from the result: `{ archetype, parameters }`.
4. Proceed to Step 4 with the selected archetype and parameters.

**Terminal Fallback Path:**

If the `pick_design_direction` MCP tool is NOT available, use `AskUserQuestion` to present archetype options:

```json
{
  "questions": [{
    "question": "Choose a design direction for this project:",
    "header": "Design Direction",
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

Map the selected label to the archetype ID: `Brutalist` → `brutalist`, `Editorial` → `editorial`, `Dense / Utilitarian` → `dense`, `Playful / Warm` → `playful`.

Use the default parameters for the chosen archetype (no slider tuning in terminal mode).

---

## Step 4: Generate Blueprint and Seed Knowledge

Generate the design blueprint:

```bash
source "${CLAUDE_PLUGIN_ROOT}/lib/design-blueprint.sh"
SELECTED_ARCHETYPE="{archetype id from picker}"
SELECTED_PARAMS='{JSON parameters from picker}'
hku_generate_design_blueprint "${INTENT_SLUG}" "${SELECTED_ARCHETYPE}" "${SELECTED_PARAMS}"
```

Seed the design knowledge artifact from the blueprint:

```bash
source "${CLAUDE_PLUGIN_ROOT}/lib/knowledge.sh"

# Read blueprint details
ARCHETYPE_NAME=$(sed -n '/^---$/,/^---$/{ /^archetype_name:/s/^archetype_name: *//p }' ".haiku/intents/${INTENT_SLUG}/design-blueprint.md" 2>/dev/null || sed -n '/^---$/,/^---$/{ /^archetype:/s/^archetype: *//p }' ".haiku/intents/${INTENT_SLUG}/design-blueprint.md" 2>/dev/null || echo "unknown")
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Extract the body (everything after frontmatter) from the blueprint
BLUEPRINT_BODY=$(sed '1,/^---$/d' ".haiku/intents/${INTENT_SLUG}/design-blueprint.md" | sed '1,/^---$/d')

# Write as properly-structured knowledge artifact
hku_knowledge_write "design" "---
type: design
version: 1
created: ${TIMESTAMP}
last_updated: ${TIMESTAMP}
source: direction-picker
confidence: high
project_maturity: greenfield
---

# Design Knowledge

Derived from design direction: ${ARCHETYPE_NAME}

${BLUEPRINT_BODY}"
```

Commit:

```bash
git add .haiku/intents/${INTENT_SLUG}/design-blueprint.md .haiku/knowledge/design.md
git commit -m "elaborate(${INTENT_SLUG}): set design direction — ${SELECTED_ARCHETYPE}"
```

---

## Step 5: Load Knowledge Context

After design direction (or if skipped), load knowledge for remaining phases:

```bash
source "${CLAUDE_PLUGIN_ROOT}/lib/knowledge.sh"
DOMAIN_KNOWLEDGE=$(hku_knowledge_read "domain" 2>/dev/null || echo "")
PRODUCT_KNOWLEDGE=$(hku_knowledge_read "product" 2>/dev/null || echo "")
DESIGN_KNOWLEDGE=$(hku_knowledge_read "design" 2>/dev/null || echo "")
```

If domain or product knowledge exists, carry it forward as additional context for subsequent sub-skills (workflow selection, criteria, decomposition). This enriches unit specs with domain vocabulary and business rules already captured in knowledge artifacts.
