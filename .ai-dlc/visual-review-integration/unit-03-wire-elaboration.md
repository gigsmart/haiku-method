---
status: completed
hat: reviewer
last_updated: "2026-03-30T15:05:00Z"
depends_on:
  - unit-02-visual-question-tool
branch: ai-dlc/visual-review-integration/03-wire-elaboration
discipline: backend
pass: ""
workflow: ""
ticket: ""
---

# unit-03-wire-elaboration

## Description

Update the AI-DLC elaboration skill instructions to use the visual review MCP channel at 4 review boundaries instead of terminal-based `AskUserQuestion`. When the `ai-dlc-review` MCP server is available, the elaborate skill should call `ask_user_visual_question` (built in unit-02) to render review decisions in the browser. When the MCP server is not available, fall back gracefully to `AskUserQuestion`.

This unit modifies the skill markdown file `plugin/skills/elaborate/SKILL.md` — instruction text, not code.

See `visual-review-integration/unit-02-visual-question-tool` for the tool schema and channel event format.

## Discipline

backend - Skill instruction modification and MCP tool integration wiring.

## Domain Entities

- **Elaboration Skill** — The `plugin/skills/elaborate/SKILL.md` markdown file containing step-by-step instructions that Claude Code follows during elaboration.
- **Review Boundary** — A point in the elaboration flow where the user reviews and approves/rejects an artifact. Four are targeted for visual review.
- **MCP Tool Availability** — Whether the `ask_user_visual_question` tool is available in the current session (depends on MCP server being registered and running).

## Data Sources

- **Elaborate skill** (`plugin/skills/elaborate/SKILL.md`): The main skill file with 17 `AskUserQuestion` occurrences, 4 of which are review boundaries.
- **MCP tool** (`ask_user_visual_question`): The tool built in unit-02 with questions array input and channel event response.
- **Tool discovery**: Claude Code can check tool availability via `ToolSearch` or by attempting to call the tool.

## Technical Specification

### Review Boundaries to Wire

The 4 review boundaries in `elaborate/SKILL.md` that should use visual review:

#### 1. Domain Model Validation (Phase 2.5, after discovery)

**Current (AskUserQuestion):**
```json
{
  "questions": [{
    "question": "Does this domain model accurately capture the system? Are there entities, relationships, or data sources I'm missing?",
    "header": "Domain Model",
    "options": [
      {"label": "Looks accurate", "description": "The domain model captures the system correctly"},
      {"label": "Missing entities", "description": "There are important entities or relationships not listed"},
      {"label": "Wrong relationships", "description": "Some relationships are incorrect"},
      {"label": "Missing data sources", "description": "There are data sources I haven't discovered"}
    ],
    "multiSelect": true
  }]
}
```

**New instruction text to replace the AskUserQuestion block:**

The agent should call the `ask_user_visual_question` MCP tool with the domain model markdown as context and the validation question as the question. If the tool is not available (ToolSearch returns no match), fall back to `AskUserQuestion`.

```
**Present Domain Model for visual review:**

First, check if the visual review MCP tool is available:

Use `ToolSearch` to find `ask_user_visual_question`. If found, call it:

- `context`: The full domain model markdown (Entities, Relationships, Data Sources, Data Gaps sections)
- `questions`: Same as below
- `title`: "Domain Model Review"

If the tool is not available, use `AskUserQuestion` with the same question:

{existing AskUserQuestion JSON}
```

#### 2. Spec Alignment Gate (Phase 5.75)

**Current:** Presents elaboration summary as markdown, then asks "Does this intent and unit breakdown generally align?" via AskUserQuestion.

**New instruction:** Call `ask_user_visual_question` with the full elaboration summary as context and the alignment question. The context should include: intent description, domain model, data sources, and unit breakdown.

#### 3. Per-Unit Review (Phase 6, Step D)

**Current:** Displays full unit spec in a code block, then asks "Does this unit spec give a builder enough detail?" via AskUserQuestion.

**New instruction:** Call `ask_user_visual_question` with the full unit spec markdown as context and the approval question. For frontend/design units with wireframes, also include the wireframe path so the visual review page can embed it.

#### 4. Wireframe Product Review (Phase 6.25, Step 6)

**Current:** Asks user to open wireframes in browser manually, then asks "How do they look?" via AskUserQuestion.

**New instruction:** Call `ask_user_visual_question` with wireframe paths and the review question. The visual review page can embed wireframes directly.

### Modification Pattern

For each review boundary, the skill text should be modified to follow this pattern:

```markdown
**Visual Review (preferred):**

Check if the `ask_user_visual_question` MCP tool is available via `ToolSearch("ask_user_visual_question")`.

If available, call it:
\`\`\`
ask_user_visual_question({
  title: "{Review Title}",
  context: "{markdown content to display}",
  questions: [{
    question: "{question text}",
    header: "{header}",
    options: [{...}, {...}],
    multiSelect: {true/false}
  }]
})
\`\`\`

Parse the channel event response: `content` is a JSON array of `{ question, selected, notes }` objects.

**Fallback (if visual tool not available):**

Use `AskUserQuestion`:
\`\`\`json
{existing AskUserQuestion JSON}
\`\`\`
```

### What NOT to Modify

The remaining ~13 `AskUserQuestion` calls in elaborate/SKILL.md should NOT be changed. These are:

- Phase 0: Existing intent action choice
- Phase 1: Follow-up refinement
- Phase 2: Requirements clarification questions
- Phase 3: Workflow selection
- Phase 4: Success criteria confirmation, NFR questions
- Phase 5.5: Cross-cutting concerns
- Phase 5.8: Git strategy (3 questions)
- Phase 5.9: Announcement formats
- Phase 5.95: Iteration passes
- Phase 7: Handoff decision

These are clarification/navigation questions that work well in the terminal. Only review boundaries (where the user reviews and approves artifacts) benefit from visual rendering.

### Channel Event Response Handling

After calling `ask_user_visual_question`, the agent receives a channel event. The skill instructions should explain how to parse the response:

```markdown
When the channel event arrives with `response_type: "question_answers"` in meta:
1. Parse `content` as JSON to get the answers array
2. Each answer has: `question` (text), `selected` (label array), `notes` (free text)
3. If `selected` includes "Other", the user's free-text input is in `notes`
4. Map the selected labels back to the original option labels to determine the user's choice
```

## Success Criteria

- [ ] Domain Model validation (Phase 2.5) uses `ask_user_visual_question` when available, with domain model as context
- [ ] Spec Alignment Gate (Phase 5.75) uses `ask_user_visual_question` when available, with elaboration summary as context
- [ ] Per-unit review (Phase 6 Step D) uses `ask_user_visual_question` when available, with full unit spec as context
- [ ] Wireframe review (Phase 6.25 Step 6) uses `ask_user_visual_question` when available, with wireframe references
- [ ] All 4 review boundaries gracefully fall back to `AskUserQuestion` when the MCP tool is not available
- [ ] Channel event responses are correctly parsed (JSON content, selected options, free-text notes)
- [ ] The remaining ~13 `AskUserQuestion` calls in elaborate/SKILL.md are NOT modified
- [ ] Skill instructions are clear enough that the agent correctly chooses between visual and terminal

## Risks

- **Skill instruction ambiguity**: If the instructions are unclear about when to use visual vs terminal, the agent may use the wrong one. Mitigation: explicit ToolSearch check with clear if/else fallback pattern.
- **Channel event timing**: The agent must wait for the channel event after calling the visual tool. If it doesn't wait, it may proceed without the user's decision. Mitigation: the tool returns "Waiting for user response..." which signals the agent to wait for the channel event.
- **Large context in tool call**: Passing full unit specs or domain models as the `context` parameter could be very large. Mitigation: the server renders this server-side, so the size is handled by the template, not the browser.

## Boundaries

This unit does NOT handle:
- Fixing markdown rendering (unit-01)
- Implementing the `ask_user_visual_question` MCP tool (unit-02)
- Wiring construction review boundaries (reviewer hat) — only elaboration
- Modifying other skills (construct, execute, etc.)

## Notes

- The `elaborate/SKILL.md` file is a long markdown document (~1500 lines). Edit surgically at the 4 review boundary locations. Do not restructure or reformat the rest of the file.
- The visual review pattern should be additive (add visual path + keep existing AskUserQuestion as fallback), not a replacement. This ensures backward compatibility when the MCP server isn't installed.
- The `ToolSearch("ask_user_visual_question")` check should happen once at the start of each review boundary, not globally at the start of elaboration. This allows the MCP server to be started mid-session.
- For the per-unit review (Phase 6 Step D), the context should include both the unit spec AND the intent title for breadcrumb context.
