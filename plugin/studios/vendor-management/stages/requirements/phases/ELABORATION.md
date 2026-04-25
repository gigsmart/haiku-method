# Requirements Stage — Elaboration

## Criteria Guidance

Every acceptance criterion **MUST** be paired with a command or condition that proves it. The FSM rejects prose-only criteria at advance time. If a criterion can't be expressed as an executable check, it's a spec gap — surface it via `ask_user_visual_question`, do not paper over with prose.

In the unit's structural form: the criterion goes in `## Completion criteria` (the goal); the executable check goes in `quality_gates:` frontmatter (the enforcer). Drafted as a pair; written as two coupled fields.

### Good criteria — concrete and verifiable

- "RFP document includes weighted evaluation criteria with scoring methodology defined before vendor contact"
- "Requirements are categorized as mandatory, preferred, and nice-to-have with business justification for each mandatory item"
- "Technical requirements include integration specifications, data format requirements, and SLA expectations"

### Bad criteria — vague (no clear check)

- "Requirements are defined"
- "RFP is written"
- "Needs are documented"

### Bad criteria — specific but unverifiable

These look concrete but have no executable check. Catching them at elaboration prevents specs that *look* complete but produce nothing the FSM can enforce.

- "X is well-organized" / "Output is clean" — no command proves "well-organized"
- "Performance is acceptable" / "Process is fast" — needs a numeric threshold AND a measurement command
- "X is user-friendly" / "Output is professional" — needs a review pass or a literal allow-list of acceptable phrasings
- "Coverage is comprehensive" / "Treatment is thorough" — needs a structural check counting items, not a subjective judgment
