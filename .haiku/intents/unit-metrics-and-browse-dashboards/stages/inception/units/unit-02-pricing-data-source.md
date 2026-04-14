---
name: unit-02-pricing-data-source
model: haiku
depends_on: []
inputs:
  - intent.md
  - knowledge/DISCOVERY.md
status: completed
bolt: 1
hat: elaborator
started_at: '2026-04-14T21:41:20Z'
hat_started_at: '2026-04-14T21:43:03Z'
outputs:
  - knowledge/PRICING_STRATEGY.md
completed_at: '2026-04-14T21:48:01Z'
---

# Research: Source of truth for per-model USD pricing

## Scope

Decide and document how H·AI·K·U will know the dollar cost of a token for a given model, in a way that is reproducible across operators, versionable in git, and survives model-pricing changes over time.

## Why

USD cost is a derived metric — we compute it from `tokens × rate` at capture time and persist the result. If the rate source is wrong, stale, or ambient, every cost estimate downstream is wrong and the dashboards lie. This question needs a concrete answer before the development phase can record cost onto units.

## Deliverable

A single artifact at `.haiku/intents/unit-metrics-and-browse-dashboards/knowledge/PRICING_STRATEGY.md` containing:

- A recommendation for where pricing data lives (checked-in JSON in `plugin/`, fetched at runtime from an API, or operator-provided config) with the reasoning.
- A concrete schema for the pricing table — what each entry contains (model ID, input rate, output rate, cache-read rate, cache-write rate, currency, effective date, source URL).
- A seed pricing table covering every model ID discovered by unit-01.
- A versioning story: how do we record *which pricing version* was used for a given cost estimate, so old numbers stay interpretable after prices change.
- A failure-mode story: what happens if we encounter a model ID not in the table (record tokens only? record zero cost with a warning? fail the bolt?).

## Completion Criteria

- [x] `PRICING_STRATEGY.md` exists in the intent's `knowledge/` directory.
- [x] The document recommends exactly one storage location with at least two discarded alternatives and the reason each was discarded.
- [x] The document defines a JSON schema for pricing entries with every field named and typed.
- [x] The document includes a seed table with real rates for every model ID listed in `TRANSCRIPT_FORMAT.md` (unit-01's output).
- [x] The document specifies how `pricing_version` flows from the pricing table through to the unit's metrics block.
- [x] The document specifies the unknown-model fallback behavior explicitly (one of: skip cost / zero with warning / fail).
- [x] Every rate in the seed table cites a source URL (Anthropic pricing page or similar public reference).
