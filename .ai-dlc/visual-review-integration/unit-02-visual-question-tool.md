---
status: completed
hat: reviewer
last_updated: "2026-03-30T14:55:00Z"
depends_on:
  - unit-01-fix-rendering
branch: ai-dlc/visual-review-integration/02-visual-question-tool
discipline: backend
pass: ""
workflow: ""
ticket: ""
---

# unit-02-visual-question-tool

## Description

Add an `ask_user_visual_question` MCP tool to the existing AI-DLC review server. This tool is a full visual replacement for Claude Code's `AskUserQuestion` — it renders questions with options as a rich HTML page in the browser and pushes the user's answers back as a channel event. It uses the same MCP server, HTTP server, session store, and channel notification infrastructure built in the visual-review intent.

See `visual-review/unit-02-mcp-channel-server` for the existing server architecture this builds on.

## Discipline

backend - MCP tool implementation, HTML template, HTTP route, channel event handling.

## Domain Entities

- **VisualQuestion** — The tool input: an array of questions (each with question text, header, options array, multiSelect flag), plus optional context markdown to display above the questions.
- **QuestionSession** — A session created when the tool is called. Stores: session_id, questions data, context markdown, pre-rendered HTML, user's answers (populated when they submit).
- **QuestionAnswer** — The user's response to a single question: selected option label(s) and optional free-text notes.

## Data Sources

- **Existing MCP server** (`plugin/mcp-server/src/server.ts`): Server class with `claude/channel` capability, tool list/call handlers. The new tool registers alongside `open_review` and `get_review_status`.
- **Existing HTTP server** (`plugin/mcp-server/src/http.ts`): Bun HTTP server on port 8789. Needs new routes for question pages.
- **Existing session store** (`plugin/mcp-server/src/sessions.ts`): In-memory Map-based sessions. Needs extension for question sessions.
- **Existing templates** (`plugin/mcp-server/src/templates/`): Reusable components (layout shell, card, sectionHeading, tabs). The question form is a new template.
- **Shared parser** (`plugin/shared/src/markdown.ts`): `markdownToHtml()` for rendering context markdown (uses server-side rendering from unit-01 fix).

## Technical Specification

### 1. Tool Registration (`plugin/mcp-server/src/server.ts`)

Add `ask_user_visual_question` to the tool list handler and call handler:

**Input schema (mirrors AskUserQuestion):**
```json
{
  "type": "object",
  "properties": {
    "questions": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "question": { "type": "string", "description": "The question text" },
          "header": { "type": "string", "description": "Short label (max 12 chars)" },
          "options": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "label": { "type": "string" },
                "description": { "type": "string" }
              },
              "required": ["label", "description"]
            }
          },
          "multiSelect": { "type": "boolean", "default": false }
        },
        "required": ["question", "header", "options", "multiSelect"]
      },
      "description": "1-4 questions to ask the user"
    },
    "context": {
      "type": "string",
      "description": "Optional markdown content to display above the questions (e.g., a domain model, unit spec summary)"
    },
    "title": {
      "type": "string",
      "description": "Page title (defaults to first question's header)"
    }
  },
  "required": ["questions"]
}
```

**Tool call handler behavior:**
1. Parse and validate input
2. Create a QuestionSession (new session type or extend existing)
3. Render HTML question page using new template
4. Store HTML in session
5. Start HTTP server (idempotent)
6. Open browser to `http://127.0.0.1:{port}/question/{session_id}`
7. Return text: "Visual question opened. Waiting for user response..."

### 2. Session Extension (`plugin/mcp-server/src/sessions.ts`)

Extend the session types to support question sessions:

```typescript
interface QuestionOption {
  label: string;
  description: string;
}

interface QuestionDef {
  question: string;
  header: string;
  options: QuestionOption[];
  multiSelect: boolean;
}

interface QuestionAnswer {
  question: string;
  selected: string[];  // label(s) of selected option(s), or ["Other"] if free text
  notes: string;       // free-text input (always available)
}

interface QuestionSession {
  session_id: string;
  session_type: "question";
  questions: QuestionDef[];
  context: string;
  title: string;
  status: "pending" | "answered";
  answers: QuestionAnswer[];
  html: string;
}
```

The existing `ReviewSession` and `QuestionSession` can share the session Map by adding a `session_type` discriminator field. Or use a union type.

### 3. HTTP Routes (`plugin/mcp-server/src/http.ts`)

Add new routes:

- `GET /question/:sessionId` — Serves the rendered HTML question page
- `POST /question/:sessionId/answer` — Receives the user's answers

**POST body:**
```json
{
  "answers": [
    { "question": "Which workflow?", "selected": ["default"], "notes": "" },
    { "question": "Additional context?", "selected": ["Other"], "notes": "I want to add..." }
  ]
}
```

**POST handler behavior:**
1. Validate session exists and is pending
2. Store answers in session
3. Update status to "answered"
4. Push channel event:
   ```typescript
   await mcp.notification({
     method: "notifications/claude/channel",
     params: {
       content: JSON.stringify(answers),
       meta: {
         response_type: "question_answers",
         session_id: sessionId,
         question_count: answers.length.toString(),
       },
     },
   });
   ```
5. Return `{ ok: true }`

### 4. Question Form Template (`plugin/mcp-server/src/templates/question-form.ts`)

New template file that renders the question page:

```typescript
export function renderQuestionPage(
  title: string,
  context: string,
  questions: QuestionDef[],
  sessionId: string,
): string
```

**Layout:**
- Uses `renderLayout()` from `layout.ts` for the full HTML shell
- Optional context block at top: rendered via `markdownToHtml()` (server-side, from unit-01 fix) inside a card component
- For each question:
  - Header chip/tag badge
  - Question text as heading
  - Options as radio buttons (single-select) or checkboxes (multi-select)
  - Each option shows label and description
  - "Other" option at bottom with textarea (always present, same as AskUserQuestion)
- Submit button at bottom

**Interaction:**
- Single-select: clicking a radio deselects others
- Multi-select: checkboxes allow multiple selections
- "Other" checkbox/radio: when selected, reveals textarea for free-text input
- Submit: collects all answers, POSTs to `/question/:sessionId/answer`
- After submit: show confirmation message, suggest closing tab

**Accessibility:**
- Radio buttons in `<fieldset>` with `<legend>` (the question text)
- Checkboxes in `<fieldset>` with `<legend>`
- All inputs have `<label>` elements
- Submit button has clear `aria-label`
- Focus management: first question's first option gets focus on page load
- Keyboard navigation: Tab between questions, arrow keys within option groups

### 5. Channel Event Schema

The channel event for question answers uses `content` for the serialized answers and `meta` for routing:

```typescript
{
  method: "notifications/claude/channel",
  params: {
    content: JSON.stringify(answers),  // QuestionAnswer[]
    meta: {
      response_type: "question_answers",
      session_id: sessionId,
      question_count: String(answers.length),
    },
  },
}
```

The receiving agent (Claude Code) parses `content` as JSON to get the structured answers. The `response_type: "question_answers"` discriminator distinguishes this from review decisions (which have `decision` in meta).

## Success Criteria

- [ ] `ask_user_visual_question` tool appears in the MCP tool list alongside `open_review` and `get_review_status`
- [ ] Tool accepts questions array with options, multiSelect, and header fields
- [ ] Tool accepts optional context markdown
- [ ] HTML question page renders with radio buttons for single-select and checkboxes for multi-select
- [ ] "Other" option with textarea is always available for each question
- [ ] Submitting answers POSTs to `/question/:sessionId/answer` and pushes channel event
- [ ] Channel event content contains serialized QuestionAnswer array
- [ ] Channel event meta includes `response_type: "question_answers"` discriminator
- [ ] Question page is keyboard-navigable with proper ARIA labels and fieldsets
- [ ] Question page loads in under 500ms on localhost
- [ ] Existing `open_review` and `get_review_status` tools continue to work unchanged

## Risks

- **Channel event parsing**: The agent receiving the channel event must parse the JSON answers correctly. If the content is malformed or the agent doesn't expect JSON, it may fail. Mitigation: include `response_type` in meta so the agent knows to parse content as JSON.
- **Session type collision**: Adding a new session type to the existing Map could cause type confusion. Mitigation: use a discriminator field (`session_type`) or separate Maps.
- **Browser auto-close**: After submitting, `window.close()` may not work if the browser doesn't allow JS to close windows it didn't open. Mitigation: show "You can close this tab" fallback text (same pattern as existing decision form).

## Boundaries

This unit does NOT handle:
- Fixing markdown rendering bugs (unit-01)
- Modifying elaboration skill instructions to use this tool (unit-03)
- Changing the existing `open_review` tool behavior
- Adding new review types or review page layouts

## Notes

- The tool input schema is designed to mirror `AskUserQuestion` exactly so that callers can switch between them with minimal code changes.
- The `context` parameter is optional — when provided, it renders markdown above the questions (e.g., showing a domain model summary for the "Does this domain model look correct?" question).
- The channel event `content` field is a JSON string, not plain text. This is a design decision to carry structured data through the channel. The `response_type: "question_answers"` in meta signals the format.
- Reuse existing components: `renderLayout()`, `card()`, `sectionHeading()`, `renderMarkdownBlock()` (now fixed in unit-01).
