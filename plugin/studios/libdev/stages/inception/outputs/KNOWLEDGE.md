---
name: knowledge
location: .haiku/intents/{intent-slug}/knowledge/
scope: intent
format: directory
required: false
---

# Knowledge

Supporting research and notes gathered during inception that inform downstream stages but aren't the canonical discovery or API surface documents. Stored in the intent's `knowledge/` directory.

## Content Guide

Typical contents:
- **Competitor research** — deeper dives into specific competing libraries
- **Ecosystem conventions** — language-specific patterns the library should follow
- **Prototype notes** — quick experiments or spikes that informed API decisions
- **Open questions** — things raised during inception that need resolution in development

## Quality Signals

- Notes are dated and attributed when sourced externally
- Open questions are tracked with owner and resolution target
