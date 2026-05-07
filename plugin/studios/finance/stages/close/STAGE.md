---
name: close
description: Period close, reconciliation, and financial sign-off
hats: [controller, reconciler, verifier]
fix_hats: [classifier, controller, feedback-assessor]
review: external
elaboration: autonomous
inputs:
  - stage: reporting
    output: financial-reports
  - stage: analysis
    discovery: variance-report
---

# Close

Period close, reconciliation, and financial sign-off.
