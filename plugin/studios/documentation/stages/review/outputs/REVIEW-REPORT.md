---
name: review-report
location: .haiku/intents/{intent-slug}/knowledge/
scope: intent
format: text
required: true
---

# Review Report

Categorized review findings with severity ratings and actionable fix recommendations.

## Expected Artifacts

- **Findings** -- categorized by type (accuracy, clarity, completeness, consistency) with severity
- **Fix recommendations** -- specific problem description and concrete fix for each finding
- **Technical validation** -- confirmation of correctness from subject-matter expertise
- **Verdict** -- approve, revise, or reject with rationale

## Quality Signals

- Every finding includes severity, the specific problem, and a concrete fix
- Technical claims are verified against the running system or source code
- Terminology consistency is checked against the project glossary
- Verdict is clear with supporting rationale
