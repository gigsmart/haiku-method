---
name: architecture
location: .haiku/knowledge/ARCHITECTURE.md
scope: project
format: text
required: false
---

# Architecture

Living document recording significant architectural decisions made during development. This persists across intents — write for future readers who need to understand why the system is shaped the way it is.

## Content Guide

Update this document when development introduces new patterns or changes existing ones:

- **Module map** — what each module/package does, its boundaries, and what it depends on
- **Data flow** — how data moves through the system (text diagrams are fine)
- **Key abstractions** — the core interfaces, types, and patterns that shape the codebase
- **Dependency graph** — external dependencies and why they were chosen
- **Architectural decisions** — non-obvious choices with rationale (why X over Y)

## When to Update

- New module or package boundary introduced
- Data flow pattern changed
- New external dependency added
- Significant refactor that changes system structure

## Quality Signals

- A new developer can understand the system's shape from this document
- Rationale explains "why" not just "what"
- Diagrams use text format (mermaid, ASCII) so they live in version control
- Outdated sections are updated or removed, not left to accumulate
