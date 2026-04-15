---
name: start
description: Start a new H·AI·K·U intent — describe what you want to accomplish and the system creates a structured lifecycle for it
---

# Start a New Intent

## Process

1. **Prelaborate** — If the user's description is short (under 2 sentences) or vague, ask 2-3 targeted questions via `AskUserQuestion` to understand scope, desired outcome, and constraints. Fold answers into a richer description (3-5 sentences).

2. **Quick context scan** — Glance at the project structure (2-3 tool calls max) to understand the tech stack and project purpose. This informs studio selection later.

3. **Write the title and description, then create the intent** — You must produce BOTH:
   - **`title`**: A crisp 3–8 word summary, ≤80 chars, single line, no trailing period. Write it deliberately as a human-readable name for the intent. **Do NOT** pass a truncated description or the first sentence of a paragraph.
     - Good: `"Add archivable intents"`, `"Migrate auth to OAuth2"`, `"Fix mobile nav overflow"`
     - Bad: `"Add archivable intents to H·AI·K·U. Users need a way to soft-hide completed,…"`
     - Bad: `"Implement a new system to allow users to mark intents as"` (mid-sentence truncation)
   - **`description`**: The prelaborated narrative (2–5 sentences) covering scope, motivation, and constraints. This is the richer context, not a title.
   - **`slug`**: Kebab-case identifier (max 40 chars). Usually derived from the title.
   - **`context`**: Summary of key decisions and constraints from the conversation.

   The title and description are distinct fields — the tool does NOT derive one from the other. Writing a lazy title (e.g. the first chunk of the description) will be rejected.

4. **Follow the tool's instructions** — The tool will direct you to call `haiku_run_next`, which handles studio selection and begins the lifecycle.

## Notes

- Default to **continuous** mode (stages auto-advance)
- Do NOT ask the user to pick a studio — the FSM handles studio selection via elicitation
- If the user already provided a detailed description, skip prelaboration and go straight to step 3
