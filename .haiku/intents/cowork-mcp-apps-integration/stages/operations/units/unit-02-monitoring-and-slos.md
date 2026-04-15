---
title: Operational telemetry and SLOs for MCP Apps review path
type: ops
model: sonnet
depends_on: []
inputs:
  - intent.md
  - knowledge/DISCOVERY.md
  - .haiku/knowledge/RUNBOOK.md
---

# Operational telemetry and SLOs for MCP Apps review path

## Scope

Add Sentry breadcrumb tags and log-budget checks so the MCP Apps code path is
observable in production. Establish SLO targets for the timeout failure mode.

### In scope

- **Sentry breadcrumb tags.** In `packages/haiku/src/sentry.ts` (or the review-gate call
  site in `orchestrator.ts`), add breadcrumb tags:
  - `host_supports_mcp_apps`: `"true"` | `"false"` — set at the point
    `hostSupportsMcpApps()` is first evaluated for a review gate.
  - `review_transport_used`: `"mcp_apps"` | `"http_tunnel"` — set when the transport
    branch is actually entered (not at detection time).
- **`gate_review_host_timeout` SLO.** Document in `packages/haiku/VALIDATION.md` under
  a new `## SLOs` section: target < 1% of review gate invocations fire `gate_review_host_timeout`
  over a rolling 30-day window. No automated enforcement (plugin has no production host
  to page); this is a tracked threshold for manual review of Sentry data.
- **Bundle size log budget.** In the MCP server startup path, after loading
  `REVIEW_APP_HTML`, log a warning if `Buffer.byteLength(REVIEW_APP_HTML, 'utf8')` after
  gzip estimation exceeds 950KB. This is a runtime signal separate from the CI hard-fail.

### Out of scope

- PagerDuty or external alerting wiring — this is a plugin, not a hosted service.
- Changes to CI workflows (that's unit-01).
- HTTP tunnel telemetry beyond the `review_transport_used` tag already described.

## Completion Criteria

1. **`host_supports_mcp_apps` tag.** `rg -n 'host_supports_mcp_apps' packages/haiku/src/`
   returns ≥ 1 hit in a Sentry breadcrumb or tag call site.
2. **`review_transport_used` tag.** `rg -n 'review_transport_used' packages/haiku/src/`
   returns ≥ 1 hit; the string `mcp_apps` and `http_tunnel` appear as values nearby.
3. **SLO documented.** `rg -n 'gate_review_host_timeout' packages/haiku/VALIDATION.md`
   returns ≥ 1 hit inside a `## SLOs` section.
4. **Bundle size warning.** `rg -n '950' packages/haiku/src/` returns ≥ 1 hit in a log
   or warn call related to the review-app HTML size.
5. **No PagerDuty/external wiring.** `rg -n 'pagerduty\|opsgenie\|alertmanager' packages/haiku/src/`
   returns zero hits after this unit.
6. **Build clean.** `cd packages/haiku && npm run build` exits 0 after changes.
