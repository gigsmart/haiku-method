---
title: Cowork tool-call timeout spike and blocking decision
type: spike
depends_on:
  - unit-01-cowork-env-probe
inputs:
  - intent.md
  - knowledge/DISCOVERY.md
  - stages/inception/units/unit-01-cowork-env-probe.md
status: completed
bolt: 1
hat: elaborator
started_at: '2026-04-15T04:30:56Z'
hat_started_at: '2026-04-15T04:31:29Z'
outputs:
  - knowledge/unit-02-cowork-timeout-research.md
completed_at: '2026-04-15T04:34:01Z'
---

# Cowork tool-call timeout spike and blocking decision

## Scope

Empirically determine Cowork's maximum tool-call duration so we can decide between reusing the current 30-minute blocking `_openReviewAndWait` contract or converting to a resumable return-and-poll model. The decision gates the shape of unit-05.

In scope:
- Small disposable probe tool `haiku_cowork_timeout_probe` that accepts `delay_ms` and returns after sleeping, for measuring Cowork timeout behavior end-to-end. Probe is removed after the spike or guarded behind `HAIKU_COWORK_DEBUG=1`.
- Run the probe inside Cowork at increasing durations (1 min, 5 min, 10 min, 30 min). Observe failure mode (error shape, whether the session survives, whether a retry/resume is exposed to the server).
- Confirm whether Cowork exposes any documented tool-call timeout or streaming progress hook via the MCP Apps client library or host metadata.
- Write the findings to `knowledge/COWORK-TIMEOUT-SPIKE.md` with a concrete recommendation: `blocking` (reuse contract) or `resumable` (convert `_openReviewAndWait` to return-and-resume).

Out of scope:
- Actually rewriting `_openReviewAndWait` — that's unit-05.
- Changes to the local HTTP review path.

## Completion Criteria

- `knowledge/COWORK-TIMEOUT-SPIKE.md` exists and contains a measured timeout ceiling with a specific number (not "seems long enough") — verified by file existence and content grep for "max observed:".
- The document names a decision (`blocking` | `resumable`) and unit-05's completion criteria are updated to match before unit-05 enters design — verified by cross-reference in unit-05 metadata.
- The probe tool either does not appear in the production tool list (`list_tools` over MCP in a non-debug build) or is guarded behind `HAIKU_COWORK_DEBUG=1` — verified by automated check.
- If recommendation is `resumable`, a followup issue or note is added to the discovery document describing the protocol shape — verified by diff.
