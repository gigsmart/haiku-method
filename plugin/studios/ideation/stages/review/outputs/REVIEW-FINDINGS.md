---
name: review-findings
location: .haiku/intents/{intent-slug}/knowledge/
scope: intent
format: text
required: true
---

# Review Findings

Severity-ranked findings from adversarial quality review with fact-checking results.

## Expected Artifacts

- **Findings** -- severity-ranked issues with actionable fix recommendations
- **Fact-check results** -- all factual claims classified as verified, unverified, or false
- **Fix recommendations** -- specific "this is wrong because X, fix by Y" guidance
- **Verdict** -- approve, revise, or reject with rationale

## Quality Signals

- At least 3 substantive issues are identified with specific remediation suggestions
- All factual claims are verified against original sources
- Each finding includes severity rating and actionable fix
- Verdict is clear with supporting rationale
