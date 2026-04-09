---
name: triggers
description: Poll configured providers for events that should create intents or advance gates
---

# Triggers

Poll configured providers for events that should create intents or advance gates.

## Process

1. Read provider configuration from `.haiku/settings.yml`
2. Load last poll timestamp from `.haiku/trigger-poll.json`
3. For each configured provider (filtered by category if specified):
   - Query for events since last poll
   - Match events against studio trigger declarations
   - Check if events satisfy any await gates on active intents
4. Report findings:
   - New intent suggestions from matched triggers
   - Gate advancements for await gates now satisfied
   - State sync for provider changes to active intents
5. Update poll timestamp
6. If running interactively, ask for confirmation before creating intents or advancing gates
7. If no providers configured, suggest configuring them in `.haiku/settings.yml`
