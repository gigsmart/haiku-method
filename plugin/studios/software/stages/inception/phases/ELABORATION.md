# Inception Stage — Elaboration

## Criteria Guidance

Every acceptance criterion **MUST** be paired with a command or condition that proves it. The FSM rejects prose-only criteria at advance time. If a criterion can't be expressed as an executable check, it's a spec gap — surface it via `ask_user_visual_question`, do not paper over with prose.

In the unit's structural form: the criterion goes in `## Completion criteria` (the goal); the executable check goes in `quality_gates:` frontmatter (the enforcer). Drafted as a pair; written as two coupled fields.

### Good criteria — concrete and verifiable

- "Discovery document identifies all user-facing capabilities and their business value"
- "Problem statement is clear enough for a non-technical stakeholder to understand"
- "Each unit has 3-5 completion criteria, each verifiable by a specific command or test"
- "Unit DAG has no circular dependencies — verified by topological sort"

### Bad criteria — vague (no clear check)

- "Domain is understood"
- "Units have criteria"
- "Elaboration is complete"
- "Database schema is defined" (too technical for inception — belongs in design/development)

### Bad criteria — specific but unverifiable

These look concrete but have no executable check. Catching them at elaboration prevents specs that *look* complete but produce nothing the FSM can enforce.

- "X is well-organized" / "Output is clean" — no command proves "well-organized"
- "Performance is acceptable" / "Process is fast" — needs a numeric threshold AND a measurement command
- "X is user-friendly" / "Output is professional" — needs a review pass or a literal allow-list of acceptable phrasings
- "Coverage is comprehensive" / "Treatment is thorough" — needs a structural check counting items, not a subjective judgment
