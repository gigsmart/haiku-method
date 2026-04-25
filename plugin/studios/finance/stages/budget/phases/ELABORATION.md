# Budget Stage — Elaboration

## Criteria Guidance

Every acceptance criterion **MUST** be paired with a command or condition that proves it. The FSM rejects prose-only criteria at advance time. If a criterion can't be expressed as an executable check, it's a spec gap — surface it via `ask_user_visual_question`, do not paper over with prose.

In the unit's structural form: the criterion goes in `## Completion criteria` (the goal); the executable check goes in `quality_gates:` frontmatter (the enforcer). Drafted as a pair; written as two coupled fields.

### Good criteria — concrete and verifiable

- "Budget allocations sum to within 2% of the approved total envelope with variance explanations for each department"
- "Each line item maps to a specific forecast assumption and can be traced to a revenue or cost driver"
- "Contingency reserves are sized based on historical variance patterns, not arbitrary percentages"

### Bad criteria — vague (no clear check)

- "Budget is allocated"
- "Numbers add up"
- "Targets are set"

### Bad criteria — specific but unverifiable

These look concrete but have no executable check. Catching them at elaboration prevents specs that *look* complete but produce nothing the FSM can enforce.

- "X is well-organized" / "Output is clean" — no command proves "well-organized"
- "Performance is acceptable" / "Process is fast" — needs a numeric threshold AND a measurement command
- "X is user-friendly" / "Output is professional" — needs a review pass or a literal allow-list of acceptable phrasings
- "Coverage is comprehensive" / "Treatment is thorough" — needs a structural check counting items, not a subjective judgment
