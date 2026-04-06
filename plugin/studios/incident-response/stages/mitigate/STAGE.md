---
name: mitigate
description: Apply immediate fixes to stop the bleeding — rollbacks, feature flags, scaling
hats: [mitigator, verifier]
review: [ask, await]
unit_types: [hotfix, rollback, workaround]
inputs:
  - stage: investigate
    discovery: root-cause
---

# Mitigate

## Criteria Guidance

Good criteria examples:
- "Mitigation action is documented with exact commands or config changes applied"
- "Verification confirms user-facing impact has stopped, measured by the same metrics that triggered the incident"
- "Rollback plan exists in case the mitigation itself causes regression"

Bad criteria examples:
- "Issue is mitigated"
- "Fix is applied"
- "Things are back to normal"

## Completion Signal

Mitigation log documents exactly what was done — rollback version, feature flag toggled, scaling action, or hotfix applied — with timestamps. Verifier has confirmed the user-facing impact has stopped using the same signals that detected the incident. A rollback plan for the mitigation itself is documented. Any known side effects of the mitigation are called out.
