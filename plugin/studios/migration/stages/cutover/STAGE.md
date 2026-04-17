---
name: cutover
description: Plan and execute the production cutover with rollback procedures
hats: [cutover-coordinator, rollback-engineer]
review: external
elaboration: collaborative
inputs:
  - stage: validation
    discovery: validation-report
review-agents-include:
  - stage: migrate
    agents: [data-integrity]
  - stage: validation
    agents: [parity]
---

# Cutover

Plan and execute the production cutover with rollback procedures.
