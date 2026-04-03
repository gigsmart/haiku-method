---
name: review-report
location: .haiku/intents/{intent-slug}/knowledge/REVIEW-REPORT.md
scope: intent
format: text
required: true
---

# Review Report

Adversarial review findings for the draft deliverable. This output drives the deliver stage's remediation work.

## Content Guide

Organize findings by severity:

- **Critical** — factual errors, logical fallacies, missing essential content. Must be fixed before delivery.
- **Major** — structural problems, weak arguments, significant gaps. Should be fixed.
- **Minor** — clarity issues, style improvements, nice-to-haves. May be fixed.

Each finding should include:
- Description of the issue
- Location in the deliverable (section, paragraph)
- Evidence or reasoning for why it's a problem
- Suggested remediation

Separate sections for:
- **Structural issues** — organization, flow, argument structure
- **Factual issues** — incorrect claims, unverified data, reasoning errors
- **Completeness gaps** — missing perspectives, unaddressed questions

End with a summary verdict: **approve** (ready for delivery), **revise** (fix critical/major issues then re-review), or **reject** (fundamental problems requiring substantial rework).

## Quality Signals

- Findings are specific enough to act on without re-reading the entire draft
- Severity ratings reflect actual impact, not reviewer preference
- Remediation suggestions are concrete, not vague
- The report distinguishes between "must fix" and "nice to have"
