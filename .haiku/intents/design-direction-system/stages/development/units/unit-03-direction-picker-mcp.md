---
name: unit-03-direction-picker-mcp
type: backend
status: completed
inputs: ["knowledge/DISCOVERY.md"]
depends_on: [unit-01-knowledge-infrastructure]
bolt: 0
hat: ""
started_at: 2026-04-01T13:12:22Z
completed_at: 2026-04-01T13:12:22Z
---


# unit-03-direction-picker-mcp

## Description
Add a `pick_design_direction` tool to the MCP server that opens a browser-based visual picker for choosing a design direction. The picker displays design archetype previews with tunable parameter controls (sliders), collects the user's selections, and returns them to the Claude session. Also implement a terminal fallback via `AskUserQuestion` for when the MCP server is unavailable.

## Discipline
backend - This unit will be executed by backend-focused agents.

## Domain Entities
- **DesignDirectionSession**: New session type in the MCP server — extends the session store with archetype/parameter state
- **DesignArchetype**: Archetype data structure consumed by the picker template (name, description, previewHtml, defaultParameters)
- **DesignParameter**: Parameter data structure consumed by slider controls (name, label, min, max, step, default)

## Data Sources
- **MCP Server codebase** (`plugin/mcp-server/src/`): Server registration, session management, HTTP routing, template patterns
- **Existing templates** (`plugin/mcp-server/src/templates/`): `question-form.ts`, `layout.ts`, `components.ts` — patterns to follow
- **`plugin/mcp-server/src/sessions.ts`**: Session types and store management

## Technical Specification

### 1. New Session Type: `DesignDirectionSession`

In `plugin/mcp-server/src/sessions.ts`, add a new discriminated union member:

```typescript
interface DesignDirectionSession {
  session_type: "design_direction";
  session_id: string;
  intent_slug: string;
  archetypes: DesignArchetypeData[];  // archetype definitions passed from caller
  parameters: DesignParameterData[];  // parameter definitions passed from caller
  status: "pending" | "answered";
  selection: {
    archetype: string;       // chosen archetype name
    parameters: Record<string, number>;  // parameter name → value
  } | null;
  html: string;
}
// NOTE: Do NOT add a created_at field. Session creation timestamps are tracked
// externally in the sessionCreatedAt Map. Follow the existing createSession()
// and createQuestionSession() patterns for registration in both the sessions
// map and sessionCreatedAt map.
```

Add `DesignDirectionSession` to the session union type and add corresponding create/update/get functions following the existing `createQuestionSession` pattern.

### 2. New MCP Tool: `pick_design_direction`

In `plugin/mcp-server/src/server.ts`, register a new tool:

**Tool name:** `pick_design_direction`

**Input schema:**
```typescript
{
  intent_slug: string;       // the intent this direction is for
  archetypes: Array<{
    name: string;            // e.g., "Brutalist"
    description: string;     // one-line description
    preview_html: string;    // HTML snippet showing representative layout
    default_parameters: Record<string, number>;  // archetype-specific defaults
  }>;
  parameters: Array<{
    name: string;            // e.g., "density"
    label: string;           // e.g., "Density"
    description: string;     // e.g., "How much whitespace vs information density"
    min: number;             // e.g., 0
    max: number;             // e.g., 100
    step: number;            // e.g., 10
    default: number;         // e.g., 50
    labels: {                // human-readable labels for the extremes
      low: string;           // e.g., "Airy / Editorial"
      high: string;          // e.g., "Packed / Dashboard"
    };
  }>;
  title?: string;            // optional page title
}
```

**Handler flow:**
1. Validate input (Zod schema)
2. Create `DesignDirectionSession` via new `createDesignDirectionSession()`
3. Render picker HTML via `renderDesignDirectionPage()` (new template)
4. Store HTML in session
5. Start HTTP server (idempotent)
6. Open browser to `http://127.0.0.1:{port}/direction/{session_id}`
7. Return text confirmation with session_id

**Return format:** Same pattern as `ask_user_visual_question` — text with session_id for polling.

### 3. Update `get_review_status` Tool

Extend the existing `get_review_status` handler to support `DesignDirectionSession`:

```typescript
// Add case for design_direction sessions
if (session.session_type === "design_direction") {
  return {
    session_id: session.session_id,
    session_type: "design_direction",
    status: session.status,
    selection: session.selection  // null if pending, { archetype, parameters } if answered
  };
}
```

### 4. New HTTP Routes

In `plugin/mcp-server/src/http.ts`, add:

**GET `/direction/:sessionId`** — Serves the picker HTML from session.
- Same pattern as `GET /question/:sessionId`
- Return 404 if session not found

**POST `/direction/:sessionId/select`** — Receives the user's selection.
- Body: `{ archetype: string, parameters: Record<string, number> }`
- Update session via `updateDesignDirectionSession()`
- Send channel notification:
  ```typescript
  mcpServer.notification({
    method: "notifications/claude/channel",
    params: {
      content: JSON.stringify(selection),
      meta: {
        response_type: "design_direction",
        intent_slug: session.intent_slug,
        session_id: session.session_id
      }
    }
  });
  ```
- Return 200 OK

### 5. New Template: `renderDesignDirectionPage()`

Create `plugin/mcp-server/src/templates/design-direction.ts`.

The template renders a full-page visual picker using the existing `renderLayout()` shell from `layout.ts`. The page has two main sections:

**Section A: Archetype Gallery**
- Display each archetype as a selectable card in a horizontal grid
- Each card shows:
  - Archetype name as heading
  - One-line description
  - The `preview_html` rendered in an `<iframe>` or contained `<div>` with fixed dimensions (e.g., 320x240px) — this shows a miniature representative layout for the archetype
  - A radio-button or clickable card selection mechanism
- Selected archetype card gets a highlighted border (e.g., blue-500)
- Selecting an archetype updates the parameter sliders to that archetype's `default_parameters`
- ARIA: Use `role="radiogroup"` on the gallery container, `role="radio"` on each card, `aria-checked` for selection state, keyboard arrow navigation between cards

**Section B: Parameter Tuners**
- Display each parameter as a labeled slider (`<input type="range">`)
- Each slider shows:
  - Parameter label (e.g., "Density")
  - Description text
  - Low-end label on the left, high-end label on the right (e.g., "Airy / Editorial" ← → "Packed / Dashboard")
  - Current value displayed numerically
- When an archetype is selected, sliders snap to that archetype's defaults but remain adjustable
- Parameters update in real-time — no debouncing needed since there's no live preview update

**Section C: Submit**
- "Choose This Direction" button (primary style)
- Clicking submits the current archetype + parameter values via POST to `/direction/:sessionId/select`
- On success, show confirmation message and disable the form
- The button is disabled until an archetype is selected

**Inline JavaScript requirements:**
- Archetype card click → set selected state, update sliders to defaults, enable submit button
- Slider change → update displayed value
- Form submit → POST to server, disable form, show confirmation
- Keyboard navigation: arrow keys between archetype cards, Tab to parameter sliders
- All interactivity via inline `<script>` blocks (no external JS, following existing template patterns)

**Styling:**
- Use Tailwind CDN classes (already loaded by `renderLayout()`)
- Follow the existing color palette: gray-100 backgrounds, white cards, blue-500 for selected states
- Dark mode support via the existing dark mode toggle in `renderLayout()`
- Responsive: stack archetype cards vertically on narrow viewports

**Accessibility requirements:**
- All interactive elements are keyboard-focusable with visible focus indicators
- Archetype gallery uses `role="radiogroup"` with arrow key navigation
- Sliders have associated `<label>` elements and `aria-valuemin`/`aria-valuemax`/`aria-valuenow`
- Submit button has descriptive text, not just an icon
- Screen reader announcements for archetype selection changes (`aria-live="polite"` region)

### 6. Terminal Fallback

When the MCP server tool is not available (detected by `ToolSearch` returning no results), the calling skill (unit-05 elaboration integration) falls back to `AskUserQuestion`:

```json
{
  "questions": [
    {
      "question": "Choose a design direction for this project:",
      "header": "Archetype",
      "options": [
        {"label": "Brutalist", "description": "High contrast, raw borders, asymmetric grids, monospace type"},
        {"label": "Editorial", "description": "Magazine layouts, strong typography, generous whitespace"},
        {"label": "Dense / Utilitarian", "description": "Packed information, minimal chrome, keyboard-first"},
        {"label": "Playful / Warm", "description": "Rounded corners, vibrant colors, playful personality"}
      ],
      "multiSelect": false
    }
  ]
}
```

The fallback uses default parameter values for the chosen archetype (no slider tuning in terminal mode). This is acceptable — the terminal path is a degraded experience, not the primary one.

**Note:** The terminal fallback itself is implemented in unit-05 (elaboration integration), not in this unit. This unit only provides the MCP tool. This spec documents the fallback design so unit-05 has a clear contract.

## Success Criteria
- [x] `pick_design_direction` tool is registered in the MCP server with proper input validation
- [x] `DesignDirectionSession` type exists in sessions.ts with create/update/get functions
- [x] GET `/direction/:sessionId` serves the picker HTML
- [x] POST `/direction/:sessionId/select` stores the selection and sends channel notification
- [x] `get_review_status` returns selection data for design_direction sessions
- [x] Picker template renders archetype cards with preview HTML in a selectable gallery
- [x] Picker template renders parameter sliders with labels, descriptions, and value display
- [x] Selecting an archetype updates slider defaults
- [x] Submit button POSTs archetype + parameters and shows confirmation
- [x] Keyboard navigation works: arrow keys between archetype cards, Tab to sliders
- [x] ARIA attributes are correct: radiogroup, radio, aria-checked, labels on sliders
- [x] Dark mode toggle works correctly with the picker UI
- [x] All existing MCP server tests continue to pass

## Risks
- **Preview HTML injection**: The `preview_html` field is rendered inside the picker page — malicious content could break layout or execute scripts. Mitigation: Render previews in sandboxed `<iframe srcdoc="...">` elements with `sandbox` attribute (no scripts, no same-origin).
- **Template complexity**: The picker is significantly more interactive than existing templates (question form, review page). Mitigation: Keep JavaScript minimal — use native HTML form elements (radio buttons, range inputs) with thin event listeners, not a framework.
- **Session TTL expiry**: The session store has a 30-minute TTL. Users may deliberate on design direction longer than typical questions. Mitigation: The POST handler for `/direction/:sessionId/select` should return a clear JSON error `{ error: "session_expired" }` when the session is not found. The picker template should handle this response by showing "Session expired — please re-run the design direction command" instead of a silent failure.

## Boundaries
This unit does NOT handle:
- Archetype definitions (CSS tokens, layout rules, preview HTML content) — that's unit-04
- Calling the picker from the elaboration flow — that's unit-05
- The terminal fallback implementation — that's unit-05
- Generating design blueprints from selections — that's unit-04
- Knowledge directory operations — that's unit-01

This unit ONLY provides the MCP server infrastructure: tool, session, routes, and template.

## Notes
- The `archetypes` and `parameters` arrays are passed IN by the caller — this tool is data-agnostic. Unit-04 defines the actual archetype content; this unit just renders whatever it receives.
- Follow the exact patterns from `ask_user_visual_question` for tool registration, session lifecycle, and channel notification — the only difference is the template and data shape.
- The `preview_html` rendering is the most delicate part — use `<iframe srcdoc>` with `sandbox` attribute for security isolation.
- Keep the template under 300 lines of HTML+CSS+JS if possible. The existing `question-form.ts` is ~180 lines — this will be larger due to the gallery and sliders but should stay manageable.
