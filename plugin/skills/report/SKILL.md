---
name: report
description: Submit feedback or a bug report to the H·AI·K·U team
---

# Feedback

1. Ask the user what feedback they'd like to share — what happened, what they expected, and any steps to reproduce.
2. Summarize their feedback into a clear, actionable issue report. Do NOT submit their words verbatim — synthesize it into a structured summary with context (what they were doing, what went wrong, what the expected behavior was).
3. Ask the user if the summary looks good before submitting.
4. Call `haiku_feedback` with the synthesized `message`. Optionally include `contact_email` and `name` if the user provides them.
