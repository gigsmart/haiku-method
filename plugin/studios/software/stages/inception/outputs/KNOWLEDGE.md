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

- **Discovery documents** — technical landscape, entity inventory, constraint analysis
- **Risk assessments** — specific risks with severity and mitigation
- **Architecture notes** — existing patterns, module boundaries, dependencies
- **Stakeholder findings** — requirements gathered from domain experts
- **Competitive/prior art analysis** — relevant prior work or comparable systems

## Quality Signals

- Every research unit produces at least one artifact
- Artifacts are named descriptively (not "notes.md")
- Findings are specific and actionable, not vague summaries
- Cross-references between related artifacts
