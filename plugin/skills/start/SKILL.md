---
name: start
description: Start a new H·AI·K·U intent — describe what you want to accomplish and the system creates a structured lifecycle for it
---

# Start a New Intent

## Process

1. **Prelaborate** — If the user's description is short (under 2 sentences) or vague, ask 2-3 targeted questions via `AskUserQuestion` to understand scope, desired outcome, and constraints. Fold answers into a richer description (3-5 sentences).

2. **Quick context scan** — Glance at the project structure (2-3 tool calls max) to understand the tech stack and project purpose. This informs studio selection later.

3. **Create the intent** — Call `haiku_intent_create` with the enriched description:
   - `description`: The prelaberated description (3-5 sentences)
   - `slug`: Kebab-case identifier derived from description (max 40 chars)
   - `context`: Summary of key decisions and constraints from the conversation

4. **Follow the tool's instructions** — The tool will direct you to call `haiku_run_next`, which handles studio selection and begins the lifecycle.

## Notes

- Default to **continuous** mode (stages auto-advance)
- Do NOT ask the user to pick a studio — the FSM handles studio selection via elicitation
- If the user already provided a detailed description, skip prelaboration and go straight to step 3
