---
title: >-
  gray-matter supply chain threat lacks specific version pin and CI enforcement
  evidence
status: closed
origin: adversarial-review
author: threat-coverage
author_type: agent
created_at: '2026-04-24T14:42:05Z'
iteration: 1
visit: 1
source_ref: null
closed_by: 'fix-loop:FB-10:bolt-1'
bolt: 1
upstream_stage: null
resolution: null
replies: []
---

The threat model (SC-1) identifies `gray-matter`'s YAML parsing as a supply chain risk and states: *"Pin `gray-matter` to a version using js-yaml >= 4.x (prototype pollution fixes). Run `npm audit` in CI."*

However:

1. **No evidence of the pin is provided.** The threat model asserts a mitigation that requires verifying the current `package.json`/`package-lock.json` actually pins to a compliant version. The security stage review should have verified this, not just recommended it.

2. **`npm audit` CI enforcement is asserted but not evidenced.** The assessments note "run `npm audit` in CI" without referencing where in CI this runs or showing that a failing audit blocks the pipeline. If this step is missing from CI, the mitigation is speculative.

3. **gray-matter's dependency chain is not fully enumerated.** `gray-matter` depends on `js-yaml`, `strip-bom-string`, and `kind-of`. The threat model singles out `js-yaml` but does not verify the transitive dependency versions. A `gray-matter` version that declares `js-yaml >= 4.x` in its own `package.json` but ships a bundled older version (unlikely but possible) would not be caught by the recommendation.

**Files:** `stages/security/artifacts/threat-model-expanded.md §3/SC-1`, `package-lock.json` (to verify actual pinned version — not checked by the security stage).

**Mitigation required:** The threat model should document the verified installed version of `gray-matter` and confirm the transitive `js-yaml` version. CI `npm audit` step should be referenced by file/job name rather than asserted generically.
