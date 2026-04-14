---
title: Scrub stale get_review_status references from docs
type: cleanup
depends_on: []
inputs:
  - intent.md
  - knowledge/DISCOVERY.md
status: active
bolt: 1
hat: researcher
started_at: '2026-04-14T21:47:49Z'
hat_started_at: '2026-04-14T21:47:49Z'
---

# Scrub stale get_review_status references from docs

## Scope

The `get_review_status` tool no longer exists in `packages/haiku/src/` (`rg` returns zero hits) but stale references remain in intent docs, the paper, website docs, and mirrored `.ai-dlc/` copies. Remove them so the tool is truly gone from the project surface.

In scope:
- Grep-and-remove references under `.haiku/intents/**`, `.ai-dlc/**`, `website/content/**`, and `packages/haiku/VALIDATION.md`.
- Where a reference describes a polling pattern, rewrite to the current review-gate flow (blocking tool call, no polling) instead of deleting context the reader needs.
- Add a short note to `CHANGELOG.md` under the next unreleased entry.

Out of scope:
- Runtime tool changes (already done).
- Changes to the live review flow.

## Completion Criteria

- `rg -n 'get_review_status' .` returns zero hits across `.haiku/`, `.ai-dlc/`, `website/content/`, and `packages/haiku/` — verified by grep exit code 1.
- Where polling context was removed, the replacement text accurately describes the current blocking review flow — verified by code review.
- `CHANGELOG.md` includes a brief entry noting the doc cleanup — verified by file diff.
