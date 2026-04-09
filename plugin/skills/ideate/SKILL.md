---
name: ideate
description: Surface adversarially-filtered improvement ideas from the codebase
---

# Ideate

Analyze the codebase and surface high-impact improvement ideas that survive adversarial scrutiny.

1. **Scope** — If a focus area is given, analyze that. Otherwise analyze the full codebase (prioritize high-churn areas).
2. **Identify** opportunities: Performance, Security, Maintainability, Test Coverage, DX.
3. **Adversarial filter** — Argue against each idea on cost, prematurity, complexity, alternatives, risk.
4. **Present** survivors with: one-line description, impact, effort (low/med/high), strongest argument against, verdict (do it / park it). Also list discards with reasons.
5. **Next steps:** Elaborate (`/haiku:start`), deep-dive (`/haiku:ideate <sub-area>`), or discard.

Be ruthless — five strong ideas beat twenty weak ones. Zero ideas is valid if nothing survives.
