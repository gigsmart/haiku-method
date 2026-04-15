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

# MCP Apps tool-call timeout spike and blocking decision

## Scope

Empirically determine the maximum tool-call duration an MCP Apps host will hold open, so we can decide between reusing the current 30-minute blocking `_openReviewAndWait` contract or converting to a resumable return-and-poll model.

**Default outcome: `blocking`.** Unit-05 implements the blocking branch by default. This spike only overrides that default if measurement disagrees — if the host drops the tool call before 30 minutes, unit-05 switches to `resumable`. Either way, the handler contract in `orchestrator.ts:2846` is preserved.

In scope:
- Small disposable probe tool `haiku_cowork_timeout_probe` that accepts `delay_ms` and returns after sleeping, for measuring host timeout behavior end-to-end. Probe is removed after the spike or guarded behind `HAIKU_COWORK_DEBUG=1`.
- Run the probe against the target MCP Apps host at increasing durations (1 min, 5 min, 10 min, 30 min). Observe failure mode (error shape, whether the session survives, whether a retry/resume is exposed to the server).
- Confirm whether the host exposes any documented tool-call timeout or streaming progress hook via the MCP Apps client library or negotiated capability set.
- Write the findings to `knowledge/COWORK-TIMEOUT-SPIKE.md` with:
  - A concrete `max observed: <N> minutes` line.
  - A one-word recommendation: `blocking` (reuse contract, default) or `resumable` (convert `_openReviewAndWait` to return-and-resume).
  - Rationale paragraph.

Out of scope:
- Actually rewriting `_openReviewAndWait` — that's unit-05.
- Changes to the local HTTP review path.
- Host-specific env-var probes (capability negotiation from unit-01 is the source of truth for host identity).

## Completion Criteria

- `knowledge/COWORK-TIMEOUT-SPIKE.md` exists and contains a measured timeout ceiling with a specific number (not "seems long enough") — verified by file existence and content grep for `max observed:`.
- The document names a decision (`blocking` | `resumable`). **If no measurement is possible before unit-05 begins, the default `blocking` is explicitly recorded as the fallback.** Verified by content grep for `recommendation: (blocking|resumable)`.
- Unit-05's commit message carries `unit-02-outcome: blocking` or `unit-02-outcome: resumable` — verified by `git log -1 --format=%B | rg "unit-02-outcome:"`.
- The probe tool either does not appear in the production tool list (`list_tools` over MCP in a non-debug build) or is guarded behind `HAIKU_COWORK_DEBUG=1` — verified by automated check.
- If recommendation is `resumable`, a followup note is added to `knowledge/DISCOVERY.md` describing the protocol shape — verified by diff.
