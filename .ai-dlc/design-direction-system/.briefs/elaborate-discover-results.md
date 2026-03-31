---
status: success
error_message: ""
---

# Discovery Results

## Domain Model Summary

### Entities

- **DesignArchetype**: A named design direction template (e.g., Brutalist, Editorial, Dense/Utilitarian, Playful/Warm) -- Fields: name, description, cssTokens, layoutGuidelines, typographyRules, componentGuidelines, previewHtml
- **DesignParameter**: A tunable axis of visual variation -- Fields: name, description, min, max, default, type (slider | enum)
- **DesignBlueprint**: The output artifact capturing chosen direction -- Fields: archetype, parameters, cssVariables, layoutGuidelines, typography, componentGuidelines
- **QuestionSession**: Existing MCP session type for user interaction -- Fields: session_id, questions, answers, status
- **DesignDirectionSession**: New session type for the picker -- Fields: session_id, intent_slug, archetypes, parameters, chosen_archetype, chosen_parameters, status
- **WireframeBrief**: Brief passed to wireframe subagent -- Fields: intent_slug, worktree_path, intent_title, design_provider_type, design_blueprint_path (new), unit specs, design context
- **ProjectMaturity**: Detected project lifecycle stage -- Values: greenfield, early, established

### Relationships

- DesignArchetype has many DesignParameters (each archetype defines default parameter values)
- DesignBlueprint belongs to one DesignArchetype (chosen by user)
- DesignBlueprint contains tuned DesignParameter values
- DesignBlueprint flows into WireframeBrief (via design_blueprint_path field)
- DesignDirectionSession produces one DesignBlueprint
- ProjectMaturity gates whether DesignDirectionSession is created (greenfield only)

### Data Sources

- **MCP Server sessions** (in-memory Map): Session state for the design direction picker
- **Project maturity detection** (config.sh `detect_project_maturity()`): Determines if direction picker activates
- **Design provider config** (settings.yml `providers.design`): Existing design tools (Figma)
- **Component library detection** (package.json, config files): Detect existing design systems in brownfield projects
- **Intent artifacts** (`.ai-dlc/{slug}/`): design-blueprint.md output, wireframe briefs

### Data Gaps

- No existing archetype definitions -- must be created from scratch as template data
- No slider/range input component in MCP templates -- must be built
- No visual preview rendering for archetypes -- must define preview HTML per archetype
- No mechanism to inject design tokens into wireframe CSS -- the wireframe skill uses hardcoded gray styles

## Key Findings

- The MCP server already has a robust tool registration, session management, and browser-based UI pattern. The design direction picker should follow this pattern: new tool, new session type, new template, new HTTP routes.
- The `ask_user_visual_question` tool is too limited for the design direction picker (radio buttons only). A new dedicated tool is needed.
- The elaborate skill's phase structure has a natural insertion point between Phase 2.5 (Domain Discovery) and Phase 3 (Workflow Selection) -- the design direction phase would be Phase 2.75.
- The wireframe system currently produces gray-box wireframes with hardcoded CSS. The design blueprint's tokens need to be injected into the wireframe brief and consumed by the wireframe subagent to produce styled wireframes.
- Project maturity detection (`detect_project_maturity()`) returns greenfield/early/established based on commit count and source file count. This is the gate for activating the design direction picker.
- The design provider system only supports Figma currently. Brownfield projects with existing design systems should be detected via package.json dependencies and config files, not just the design provider.
- Template architecture is server-side HTML with Tailwind CDN -- no build step needed for new templates, but all CSS must use Tailwind utility classes.

## Open Questions

- Should "early" maturity projects get the direction picker, or strictly greenfield only? The intent says greenfield, but early projects (few commits, little code) may also benefit.
- How detailed should archetype CSS tokens be? Full design system (dozens of variables) vs. minimal set (5-10 key tokens)?
- Should the design direction picker support custom archetypes (user-defined) or only the four predefined ones?
- How should the design blueprint interact with the iteration passes system? If passes include a "design" pass, does the design direction feed into that pass's elaboration cycle?

## Mockups Generated

None -- discovery phase only. The design direction picker UI will be designed during elaboration.
