---
name: close
description: Period close, reconciliation, and financial sign-off
hats: [controller, reconciler]
review: external
elaboration: autonomous
unit_types: [reconciliation, close-process]
inputs:
  - stage: reporting
    output: financial-reports
  - stage: analysis
    discovery: variance-report
---

# Close

## Criteria Guidance

Good criteria examples:
- "All balance sheet accounts are reconciled with supporting schedules and no unexplained differences over $100"
- "Revenue recognition entries are documented with contract references and ASC 606 compliance notes"
- "Close checklist confirms all sub-ledgers are posted, intercompany eliminations are complete, and trial balance ties"

Bad criteria examples:
- "Books are closed"
- "Reconciliation is done"
- "Period is finalized"

## Completion Signal (RFC 2119)

Close report **MUST** exist with all accounts reconciled, adjusting entries documented with justification, and trial balance balanced. Controller **MUST** have **MUST** be verified compliance with accounting standards and approved the close. Reconciler **MUST** have confirmed all sub-ledger postings **MUST** be complete and intercompany transactions are eliminated.
