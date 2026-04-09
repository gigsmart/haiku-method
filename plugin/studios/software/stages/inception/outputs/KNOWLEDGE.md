---
name: knowledge
location: .haiku/intents/{intent-slug}/stages/inception/artifacts/
scope: intent
format: text
required: true
---

# Knowledge Artifacts

Research outputs from inception units. Each unit MUST produce at least one knowledge artifact written to the intent's `knowledge/` directory.

## Expected Artifacts

- **Discovery documents** — business context, feature goal, origin, competitive landscape, technical landscape, constraint analysis
- **Competitive analysis** — competitor approaches, strengths, gaps, and opportunities with links to relevant product pages
- **Risk assessments** — specific risks with severity and mitigation
- **Architecture notes** — existing patterns, module boundaries, dependencies
- **Stakeholder findings** — requirements gathered from domain experts, customer feedback, or internal discussions
- **UI impact maps** — affected screens and flows with brief descriptions of expected changes

## Quality Signals

- Every research unit produces at least one artifact
- Artifacts are named descriptively (not "notes.md")
- Findings are specific and actionable, not vague summaries
- Business context and technical landscape are both represented
- Cross-references between related artifacts
