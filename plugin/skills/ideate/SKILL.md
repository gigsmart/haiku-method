---
name: ideate
description: Surface adversarially-filtered improvement ideas from the codebase
---

# Ideate

Analyze the codebase and surface high-impact improvement ideas that survive adversarial scrutiny.

## Process

1. **Scope** — If a focus area is specified, analyze that. Otherwise, analyze the full codebase (prioritize high-churn areas from recent commits).

2. **Identify** opportunities across: Performance, Security, Maintainability, Test Coverage, Developer Experience.

3. **Adversarial filter** each idea — argue against it on cost, prematurity, complexity, alternatives, risk.

4. **Classify** survivors by impact (High/Medium/Low) and effort (Low/Medium/High).

5. **Present** each surviving idea with:
   - One-line description
   - Impact: what specifically improves
   - Effort: low/medium/high (never time estimates)
   - Adversarial: strongest argument against
   - Verdict: do it / park it

6. Also list discarded ideas with reasons.

## Principles

- Evidence over intuition — point to specific code
- Be ruthless — discard more than you keep
- Five strong ideas beat twenty weak ones
- Zero ideas is valid if nothing survives

## Next Steps

After presenting, offer: Elaborate (`/haiku:start`), Deep-dive (`/haiku:ideate <sub-area>`), or Discard.
