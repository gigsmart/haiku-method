---
title: Scrub stale get_review_status references from docs
type: cleanup
model: haiku
depends_on: []
inputs:
  - intent.md
  - knowledge/DISCOVERY.md
  - >-
    stages/inception/units/unit-07-get-review-status-doc-scrub.knowledge/inventory.md
outputs:
  - knowledge/unit-07-scoping-decisions.md
status: completed
bolt: 1
hat: elaborator
started_at: '2026-04-14T21:47:49Z'
hat_started_at: '2026-04-14T21:51:56Z'
completed_at: '2026-04-14T21:57:14Z'
---

# Scrub stale get_review_status references from docs

## Scope

The `get_review_status` tool no longer exists in runtime code. Per the researcher's inventory, `packages/haiku/src/**` and `website/content/**` return zero hits, and `packages/haiku/VALIDATION.md` does not exist — these surfaces are already clean and MUST NOT be touched.

The remaining 33 hits across 20 files fall into these categories:

### In scope (remove or rewrite)

- **`.haiku/intents/` — 11 files** enumerated in `inventory.md`: `cowork-mcp-apps-integration/intent.md`, `cowork-mcp-apps-integration/knowledge/CONVERSATION-CONTEXT.md`, `first-class-design-providers/knowledge/discovery.md`, `visual-review/knowledge/discovery.md`, `visual-review/stages/development/units/unit-02-mcp-channel-server.md`, `visual-review-integration/knowledge/discovery.md`, `visual-review-integration/stages/development/units/unit-02-visual-question-tool.md`, `design-direction-system/knowledge/discovery.md`, `design-direction-system/stages/development/units/unit-03-direction-picker-mcp.md`, `design-direction-system/stages/development/units/unit-05-elaboration-integration.md`, plus this unit's own spec (see exclusion note below).
- **`.ai-dlc/` — 8 files** enumerated in `inventory.md` (legacy mirror; expect duplicate edits).
- Where a hit describes a polling loop, rewrite to the current blocking review-gate flow (single blocking tool call, no polling) instead of deleting context the reader needs.

### Self-referential — MUST NOT remove

- `CHANGELOG.md` (1 hit) — describes this cleanup in the unreleased entry. Leave as-is.
- `.haiku/intents/cowork-mcp-apps-integration/stages/inception/units/unit-07-get-review-status-doc-scrub.md` (4 hits) — this spec itself. Leave as-is.

### Out of scope

- Runtime tool changes (already done in prior unit).
- Changes to the live review flow.
- Any edit to `packages/haiku/src/**`, `website/content/**`, or `packages/haiku/VALIDATION.md` (already clean per inventory).

## Completion Criteria

- `rg -n 'get_review_status' . --glob '!CHANGELOG.md' --glob '!**/unit-07-get-review-status-doc-scrub.md'` returns zero hits — verified by grep exit code 1. The exclusions are explicit because those two files are self-referential and MUST remain.
- The 11 `.haiku/intents/` files and the 8 `.ai-dlc/` files listed in the inventory are all touched (either references removed or polling context rewritten) — verified by diff.
- Replacement text where polling context was removed accurately describes the current blocking review flow (single blocking tool call, no polling) — verified by a doc review.
- `CHANGELOG.md` includes a brief entry noting the doc cleanup under the next unreleased section — verified by file diff.
- No changes under `packages/haiku/src/**`, `website/content/**`, or `packages/haiku/VALIDATION.md` — verified by `git diff --name-only` scope check.
