---
name: discovery
location: .haiku/intents/{intent-slug}/knowledge/DISCOVERY.md
scope: intent
format: text
required: true
---

# Discovery

Comprehensive understanding of the problem space, existing system, and technical landscape. This output is the foundation for all downstream software stages.

## Content Guide

The discovery document should cover:

- **Entity inventory** — every entity and its fields, types, and relationships
- **API surface** — endpoints, methods, request/response shapes, auth requirements
- **Architecture patterns** — module boundaries, data flow, infrastructure conventions already in use
- **Existing code structure** — relevant files, modules, and their responsibilities
- **Technical risks** — unknowns, complexity hotspots, areas likely to cause problems
- **Non-functional requirements** — performance targets, security constraints, accessibility standards
- **Constraints** — technology choices, backward compatibility requirements, deployment boundaries

## Quality Signals

- A developer unfamiliar with the codebase can understand the system from this document
- Entities are documented with actual field names and types, not abstract descriptions
- Risks are specific ("the auth middleware has no test coverage") not generic ("security could be an issue")
- The document distinguishes between what exists and what needs to change
