---
intent: design-direction-system
created: 2026-03-31T22:03:00Z
status: active
---

# Discovery Log: Design Direction System

Elaboration findings persisted during Phase 2.5 domain discovery.
Builders: read section headers for an overview, then dive into specific sections as needed.

## MCP Server Architecture

### Tool Registration Pattern

The MCP server (`plugin/mcp-server/src/server.ts`) registers three tools:

1. **`open_review`** -- Opens a visual review page in the browser for intent/unit review. Uses `createSession()` to track state, renders HTML via `renderReviewPage()`, serves it on a local HTTP server, and opens the browser.

2. **`get_review_status`** -- Polls session status. Returns session state including decision/feedback (for review sessions) or answers (for question sessions).

3. **`ask_user_visual_question`** -- The key tool for the design direction picker. Accepts:
   - `questions[]`: Array of `{ question, header?, options[], multiSelect? }`
   - `context`: Optional markdown rendered above questions
   - `title`: Optional page title
   Creates a `QuestionSession`, renders HTML via `renderQuestionPage()`, opens browser.

### Session Model

Two session types defined in `plugin/mcp-server/src/sessions.ts`:

- **`ReviewSession`**: `session_type: "review"`, tracks `intent_dir`, `review_type`, `target`, `decision`, `feedback`. Status: `pending | approved | changes_requested`.
- **`QuestionSession`**: `session_type: "question"`, tracks `title`, `questions[]`, `context`, `answers[]`. Status: `pending | answered`.

Both stored in an in-memory `Map<string, Session>` with 30-minute TTL and 100-session cap. Session IDs are `crypto.randomUUID()`.

### HTTP Routes (`plugin/mcp-server/src/http.ts`)

| Route | Method | Handler |
|-------|--------|---------|
| `/review/:sessionId` | GET | Serves review HTML |
| `/review/:sessionId/decide` | POST | Submits review decision |
| `/mockups/:sessionId/:path` | GET | Serves mockup files from intent dir |
| `/wireframe/:sessionId/:path` | GET | Serves wireframe files |
| `/question/:sessionId` | GET | Serves question form HTML |
| `/question/:sessionId/answer` | POST | Submits question answers |

### Answer Flow

1. Agent calls `ask_user_visual_question` MCP tool
2. Server creates QuestionSession, renders HTML, opens browser
3. User fills form and submits via `POST /question/:sessionId/answer`
4. Server updates session status to `"answered"`, stores `QuestionAnswer[]`
5. Server pushes a channel notification via `mcpServer.notification()` with `method: "notifications/claude/channel"` -- this pushes answers back to the Claude session asynchronously
6. Agent polls `get_review_status` to read answers: `{ question, selectedOptions[], otherText? }`

### Template Architecture

Templates use server-side HTML rendering (no React/framework):

- **`layout.ts`**: `renderLayout(title, bodyContent, dataJson)` -- Full HTML shell with Tailwind CDN (3.4.17, SRI hash), Mermaid CDN, dark mode toggle (system/dark/light), skip-nav accessibility
- **`components.ts`**: Reusable components -- `renderTabs()` (ARIA tablist with arrow-key nav), `renderBadge()`, `renderCriteriaChecklist()`, `renderDecisionForm()`, `renderBreadcrumb()`, `renderMarkdownBlock()`, `renderMockupEmbeds()`, `card()`, `sectionHeading()`
- **`styles.ts`**: Tailwind config extension with status colors, `statusColors` mapping for badges
- **`question-form.ts`**: `renderQuestionPage()` -- Renders radio/checkbox questions with "Other" textarea, form submit handler, POST to `/question/:sessionId/answer`

**Key pattern for new templates**: Use `renderLayout()` for the shell, compose body with `card()`, `sectionHeading()`, and custom HTML. Use Tailwind classes throughout. Include client-side JS in a `<script>` block within the body content.

### Limitations of Current Question Form

The current `ask_user_visual_question` tool supports:
- Radio buttons (single select) or checkboxes (multi-select)
- "Other" free-text field per question
- Markdown context block above questions

It does NOT support:
- Visual previews (images, color swatches, styled cards)
- Sliders or range inputs
- Interactive parameter adjustment
- Multi-step flows or conditional questions
- Side-by-side comparison views

**The design direction picker will need a new template type** -- the existing question form is too simple for visual comparison of design archetypes with tunable parameters.

## Current Design System

### Designer Hat (`plugin/hats/designer.md`)

The Designer hat is a construction-phase hat that:
1. Surveys available design resources (component libraries, design systems, Storybook, brand guidelines)
2. Understands the design problem from unit specs
3. Explores 2-3+ design alternatives
4. Presents options with trade-offs to user
5. Refines selected design with responsive behavior, interaction states
6. Verifies state coverage (empty, loading, error, responsive)
7. Writes a `design-spec.md` structured document
8. Finalizes with user approval

Key conventions:
- Colors referenced by named tokens only (no raw hex)
- All interaction states required: default, hover, focus, active, disabled, error, loading, empty
- Responsive breakpoints required
- Wireframes saved to `.ai-dlc/{intent}/mockups/`
- Design manifest at `.ai-dlc/{intent}/designs/design-manifest.md`
- Uses `elaborate-wireframes` skill for visual wireframe generation

### Wireframe System (`plugin/skills/elaborate/subskills/wireframes/SKILL.md`)

Wireframes are:
- Self-contained HTML files (no JS, no external deps)
- Gray/white low-fidelity aesthetic -- NO brand colors, custom fonts, or styling
- Fixed 300px screen cards in a `.flow` container with `.arrow` elements between screens
- CSS classes: `.screen`, `.screen-header`, `.screen-body`, `.field` (dashed borders), `.btn-primary`/`.btn-secondary`, `.note` (yellow callout), `.copy-note` (orange annotation), `.placeholder`
- Written to `.ai-dlc/{intent}/mockups/unit-NN-{slug}-wireframe.html`
- Unit frontmatter updated with `wireframe:` field pointing to the file

**Critical gap**: Current wireframes are always gray boxes -- they carry no design direction. This is exactly the problem the design direction system solves. The chosen design direction should flow into wireframe generation to produce *styled* wireframes rather than generic gray ones.

### Design Provider (`plugin/providers/design.md`)

Minimal built-in instructions:
- During elaboration: pull existing designs, reference in unit specs
- During building: reference design specs for implementation
- During review: cross-reference against design specs

Provider type currently only supports `figma`. The design provider is loaded via `load_providers()` in config.sh and the type is checked during wireframe brief generation (`DESIGN_TYPE`).

## Elaboration Integration Points

### Phase Flow (where design direction fits)

The elaboration skill proceeds through these phases:

| Phase | Description | Design Direction Relevance |
|-------|-------------|---------------------------|
| 0 | Pre-check, maturity detection | `detect_project_maturity()` determines greenfield/early/established |
| 0.5 | Detect iteration intent | N/A |
| 1 | Gather intent | User describes what they want |
| 2 | Clarify requirements | Q&A about specifics |
| 2.25 | Create worktree + init discovery | Discovery scratchpad created |
| 2.5 | Domain discovery (delegated subagent) | Explores codebase, detects design systems |
| 2.5+ | Domain model validation | User confirms domain model |
| 3 | Workflow selection | Hat sequence chosen |
| 4 | Success criteria | Design criteria defined here |
| 5 | Decompose into units | Design units created with `discipline: design` |
| 5.5 | Cross-cutting concern analysis | Design system as cross-cutting concern |
| 5.6 | Spec flow analysis | |
| 5.75 | Spec alignment gate | Overall direction confirmed |
| 5.8 | Git strategy | |
| 5.9 | Completion announcements | |
| 5.95 | Iteration passes | Design pass configured here if multi-pass |
| 6 | Write AI-DLC artifacts | Unit files written |
| **6.25** | **Generate wireframes (delegated)** | **Wireframes currently gray -- should be styled** |
| 6.5/6.75 | Ticketing sync | |
| 7 | Spec review | |
| 8 | Handoff | |

### Recommended Insertion Point

**Between Phase 2.5 (Domain Discovery) and Phase 3 (Workflow Selection)** -- call it **Phase 2.75: Design Direction** or similar.

Rationale:
- By Phase 2.5 completion, project maturity is known and the domain model is built
- The design direction needs to be chosen BEFORE unit decomposition (Phase 5) because design units reference the chosen direction
- The design direction needs to be chosen BEFORE wireframe generation (Phase 6.25) because wireframes should reflect the direction
- This aligns with the intent's principle: "design belongs in elaboration (forethought)"

### How Context Flows to Wireframes

1. Elaborate skill writes a **wireframes brief** at `.ai-dlc/{INTENT_SLUG}/.briefs/elaborate-wireframes.md` (Phase 6.25, Step 3)
2. Brief contains: `intent_slug`, `worktree_path`, `intent_title`, `design_provider_type`, frontend/design unit specs, "Design Context" from discovery.md, domain model
3. The `elaborate-wireframes` subagent reads the brief, generates HTML wireframes per unit
4. **The brief's "Design Context" section is the injection point** -- a design blueprint written to discovery.md or a dedicated artifact would flow through this section into wireframe generation

### Design Blueprint Artifact

The intent specifies writing a "design blueprint" to the repo. Recommended location: `.ai-dlc/{intent-slug}/design-blueprint.md`. This artifact would contain:
- Chosen archetype name
- Tuned parameter values (density, expressiveness, shape language, color mood)
- Concrete CSS tokens/variables derived from the direction
- Layout guidelines (grid system, spacing scale)
- Typography rules
- Component styling guidelines

This blueprint would be:
1. Referenced in the wireframes brief "Design Context" section
2. Referenced in design unit specs under "Constraints" and "Design Tokens Reference"
3. Consumed by the Designer hat (Step 1: survey design resources)
4. Consumed by the Builder hat for frontend implementation

## Component Library Detection

### Current Detection in Designer Hat

The Designer hat's Step 1 ("Survey available design resources") checks for:
- Component library or design system (Storybook MCP, design tokens, UI framework docs)
- Existing patterns in codebase (reusable components, layout conventions)
- Brand guidelines or style guides

This is manual/AI-driven -- no automated detection function exists.

### Detection Opportunities in Discovery

The `elaborate-discover` skill performs brownfield codebase mapping that includes:
- Stack identification (languages, frameworks, build tools, package managers)
- Architecture mapping (modules, entry points, dependencies)
- Conventions detection (naming, file org, test patterns)

**For component library detection, the discovery subagent could look for**:
- `package.json` dependencies: `@mui/material`, `@chakra-ui/react`, `@radix-ui/*`, `shadcn`, `@mantine/core`, `tailwindcss`, `bootstrap`, `antd`
- Design token files: `tokens.json`, `design-tokens.css`, `theme.ts`, `tailwind.config.*`
- Storybook presence: `.storybook/` directory
- Component directories: `components/`, `ui/`, `design-system/`
- CSS framework config: `tailwind.config.ts`, `postcss.config.*`

### Provider-Based Detection

The design provider system (`providers.design.type`) currently only supports `figma`. If a Figma provider is configured, the discovery subagent spawns a design analysis subagent to extract component hierarchies, design tokens, and interactions from Figma files.

## Project Maturity Detection

### `detect_project_maturity()` in `plugin/lib/config.sh`

Returns one of: `greenfield`, `early`, `established`.

**Heuristics (full repos)**:
- `greenfield`: commit count <= 3
- `early`: commit count <= 20 AND source files <= 5 (otherwise greenfield if source files <= 5)
- `established`: commit count > 20

**Heuristics (shallow clones)** -- commit count unreliable, use source file count only:
- `greenfield`: source files <= 5
- `early`: source files <= 20
- `established`: source files > 20

**Source file counting**: Uses `git ls-files` and excludes scaffolding: `*.md`, `*.json`, `*.yml`, `*.yaml`, `*.lock`, `*.toml`, `LICENSE*`, `Dockerfile*`, `.github/*`, `.gitlab-ci*`, `.circleci/*`, `.ai-dlc/*`.

**Integration with design direction**: The intent says design direction only activates for greenfield projects. The `project_maturity` value is:
1. Detected in Phase 0 (Step 1b) of the elaborate skill
2. Written into the discovery brief frontmatter as `project_maturity`
3. Used by the discovery subagent to gate exploration behavior

The design direction phase should check `project_maturity` and:
- **greenfield**: Full design direction picker experience
- **early**: Offer direction picker but note existing patterns may exist
- **established**: Skip design direction entirely -- respect existing design system. Detect and document existing patterns instead.

## Key Technical Decisions

### 1. New MCP Tool vs. Extending `ask_user_visual_question`

**Recommendation: New dedicated MCP tool** (`open_design_direction_picker` or similar).

Rationale:
- The design direction picker needs visual previews, sliders, side-by-side comparison -- far beyond radio buttons
- The `ask_user_visual_question` pattern is good for simple Q&A; the design picker is a rich interactive experience
- A dedicated tool can have a purpose-built schema (archetypes, parameters, preview rendering)
- Follows the existing pattern: `open_review` is a specialized visual tool alongside the generic `ask_user_visual_question`

### 2. New Template File

Create `plugin/mcp-server/src/templates/design-direction.ts` with a `renderDesignDirectionPage()` function. Follow existing patterns:
- Use `renderLayout()` for the HTML shell
- Use Tailwind CDN classes for styling
- Use `card()` and `sectionHeading()` from components.ts
- Client-side JS for interactivity (parameter sliders, archetype selection)
- POST results back to a new route (e.g., `/design-direction/:sessionId/choose`)

### 3. New Session Type

Add a `DesignDirectionSession` to `sessions.ts`:
```typescript
interface DesignDirectionSession {
  session_type: "design_direction";
  session_id: string;
  intent_slug: string;
  archetypes: DesignArchetype[];
  parameters: DesignParameter[];
  status: "pending" | "chosen";
  chosen_archetype: string;
  chosen_parameters: Record<string, number>;
  html: string;
}
```

### 4. New HTTP Route

Add to `http.ts`:
- `GET /design-direction/:sessionId` -- Serves the picker page
- `POST /design-direction/:sessionId/choose` -- Submits chosen direction + parameters

### 5. Design Blueprint Artifact Format

Write to `.ai-dlc/{intent-slug}/design-blueprint.md`:
```markdown
---
archetype: brutalist
parameters:
  density: 0.7
  expressiveness: 0.8
  shape_language: 0.2
  color_mood: cool
---
# Design Blueprint: {Intent Title}

## Archetype: Brutalist
{Description of the chosen archetype and its characteristics}

## Visual Parameters
- **Density**: 0.7 (compact but not cramped)
- **Expressiveness**: 0.8 (highly opinionated)
- **Shape Language**: 0.2 (sharp, geometric)
- **Color Mood**: Cool

## CSS Variables / Design Tokens
{Concrete values derived from archetype + parameters}

## Layout Guidelines
{Grid system, spacing scale, breakpoints}

## Typography
{Type scale, font stack, heading styles}

## Component Guidelines
{How common components should look in this direction}
```

### 6. Wireframe Integration

Modify the wireframes brief (Phase 6.25, Step 3) to include the design blueprint:
- Add `design_blueprint_path:` to the wireframes brief frontmatter
- The `elaborate-wireframes` subagent reads the blueprint and applies the direction's CSS tokens to wireframe styling
- Wireframes shift from gray-only to direction-aware (using the archetype's shape language, density, and mood while remaining low-fidelity)

### 7. Elaborate Skill Modifications

The elaborate skill (`plugin/skills/elaborate/SKILL.md`) needs a new phase:
- **Phase 2.75: Design Direction** (between Domain Discovery completion and Workflow Selection)
- Gate on `project_maturity === "greenfield"` (or optionally `"early"`)
- If greenfield: invoke the MCP tool to open the design direction picker
- Write chosen direction to `design-blueprint.md`
- Reference blueprint in subsequent phases (unit specs, wireframe brief)

### 8. Settings Schema Extension

Add to `plugin/schemas/settings.schema.json`:
```json
"design_direction": {
  "type": "boolean",
  "default": true,
  "description": "Enable design direction picker for greenfield projects during elaboration. When false, wireframes use the default gray-box style."
}
```

## Quality Gate Candidates

### From Existing Codebase Tooling

The AI-DLC plugin project itself has quality gates defined in its development setup:

| Gate | Source | Command |
|------|--------|---------|
| Tests | `package.json` (bun.lock present) | `bun test` |
| Lint | Biome config | `bun run lint` or `biome check` |
| Typecheck | TypeScript config | `bun run typecheck` or `tsc --noEmit` |
| Build | MCP server build | `bun run build` |

### Design Direction Quality Gates

For the design direction system itself, potential quality gates:
1. **Blueprint exists gate**: If `project_maturity === "greenfield"` and `design_direction` setting is enabled, check that `design-blueprint.md` exists before wireframe generation proceeds
2. **Blueprint validity gate**: Check that the blueprint's YAML frontmatter has required fields (`archetype`, `parameters`)
3. **Wireframe style consistency gate**: During review, the reviewer checks that wireframes reflect the chosen direction (visual approval -- not automatable)

### Review Agent Candidates

The settings schema already supports `design_system: boolean` review agent. This could be extended to verify design blueprint compliance during construction.
