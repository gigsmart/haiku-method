---
name: unit-04-dashboard-architecture
type: research
depends_on: []
inputs:
  - intent.md
  - knowledge/DISCOVERY.md
status: active
bolt: 1
hat: elaborator
started_at: '2026-04-14T21:41:38Z'
hat_started_at: '2026-04-14T21:43:49Z'
outputs: knowledge/DASHBOARD_ARCHITECTURE.md
---

# Research: Browse-app dashboard architecture — chart library and aggregation patterns

## Scope

Produce a concrete architecture recommendation for the four dashboards (intent overview, studio/stage throughput, hat efficiency, time-series trends) covering: which chart library to use, how aggregation queries work given the browse app's provider abstraction (local / GitHub / GitLab), and where rollups are computed (write-time in MCP tools vs read-time in the browse client).

## Why

The browse app currently has no charts — Mermaid is installed but unused in browse components, and there is no aggregation layer. Design needs a concrete answer to three questions before it can wireframe dashboards:

1. **Chart library.** The browse app uses React 19 + Next 15 + Tailwind 4 and already depends on `@xyflow/react` and `mermaid`. What library do we add for time-series / bar / donut charts without bloating the bundle?
2. **Aggregation compute location.** Rollups (sum tokens across all units in a stage, across stages in a studio, across all intents) can be computed at bolt-write time (cheap read, complex write) or at browse-read time (simple write, per-load scan). The GitHub/GitLab remote providers read through GraphQL and can't run arbitrary JS — that pushes toward pre-aggregation on disk.
3. **Provider contract.** `BrowseProvider` currently exposes `listIntents()`, `getIntent(slug)`, `readFile(path)`. Dashboards need something like `listAllIntentsWithMetrics()` without reading every unit file on every page load. What method(s) does the interface need?

## Deliverable

A single artifact at `.haiku/intents/unit-metrics-and-browse-dashboards/knowledge/DASHBOARD_ARCHITECTURE.md` containing:

- A chart library recommendation with at least two discarded alternatives and reasons (bundle size, React 19 compat, TypeScript support, Tailwind ergonomics).
- A decision on aggregation location (write-time / read-time / hybrid) with the reasoning tied to the remote-provider constraint.
- A list of new methods the `BrowseProvider` interface needs, with signatures.
- A sketch of what each of the four dashboards reads and how it gets it (e.g., "intent overview reads `intent.md` frontmatter `metrics` block; studio throughput reads a top-level rollup file at `.haiku/studios/metrics.json`").
- A note on pagination/perf: how many intents/units can the dashboards render before we need virtualization or server-side aggregation.

## Completion Criteria

- [ ] `DASHBOARD_ARCHITECTURE.md` exists in the intent's `knowledge/` directory.
- [ ] The document names exactly one chart library and lists at least two discarded alternatives with per-option reasoning.
- [ ] The document picks exactly one aggregation strategy (write-time / read-time / hybrid) and explains how it works across local, GitHub, and GitLab providers.
- [ ] The document lists every new `BrowseProvider` method with full TypeScript signature.
- [ ] The document maps each of the four dashboards to the specific files/fields it will read.
- [ ] The document includes a rough scale target (e.g., "designed for up to 200 intents × 20 units each before we need pagination").
