---
name: discovery
location: .haiku/intents/{intent-slug}/knowledge/DISCOVERY.md
scope: intent
format: text
required: true
---

# Discovery

Comprehensive understanding of the problem space, business context, competitive landscape, and technical landscape. This output is the foundation for all downstream software stages.

## Content Guide

The discovery document should cover:

### Business Context
- **Feature goal & vision** — what problem this solves, the desired outcome when it ships, and why now (urgency drivers, strategic alignment, dependencies)
- **Origin & context** — where the request came from: customer feedback with specific quotes or references, internal discussions, strategic initiatives, or upstream dependencies
- **Success criteria** — both functional (what it must do) and outcome-based (what business or user results we expect)

### Competitive Landscape
- **Who offers something similar** — specific competitors with a brief description of their approach and links to relevant product pages
- **What they do well** — acknowledge strong implementations fairly
- **Gaps and opportunities** — where competitor solutions fall short and what can be done differently

### Considerations & Risks
- **Technical considerations** — known constraints, system dependencies, data implications, integration points
- **Business considerations** — compliance, pricing implications, rollout strategy questions
- **Open questions** — things without answers yet, framed as questions for the team to resolve during elaboration
- **Risks** — what could go wrong, what assumptions are being made

### UI Impact
- **Affected surfaces** — which screens, flows, or user-facing areas are new or modified, with a brief description of the change per area

### Technical Landscape
- **Entity inventory** — every entity and its fields, types, and relationships
- **API surface** — endpoints, methods, request/response shapes, auth requirements
- **Architecture patterns** — module boundaries, data flow, infrastructure conventions already in use
- **Existing code structure** — relevant files, modules, and their responsibilities
- **Non-functional requirements** — performance targets, security constraints, accessibility standards
- **Constraints** — technology choices, backward compatibility requirements, deployment boundaries

## Quality Signals

- A team member unfamiliar with the feature can understand the full picture from this document
- Business context is clear enough for non-technical stakeholders
- Competitive research includes specific competitors with links, not vague references
- Risks are specific ("the auth middleware has no test coverage") not generic ("security could be an issue")
- Success criteria are measurable — functional criteria are testable, outcome criteria are observable
- The document distinguishes between what exists and what needs to change
- Entities are documented with actual field names and types, not abstract descriptions
