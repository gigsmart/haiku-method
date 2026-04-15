# `get_review_status` Reference Inventory

Scan-only inventory of stale `get_review_status` references. Runtime code is already clean — this unit targets docs and intent artifacts only.

## Clean surfaces (verified zero hits)

- `packages/haiku/src/**` — 0 hits (runtime tool is gone)
- `website/content/**` — 0 hits
- `packages/haiku/VALIDATION.md` — file does not exist

## Files with stale references (33 total hits across 20 files)

### `.haiku/intents/` (current intent store)

| File | Hits |
|---|---|
| `.haiku/intents/cowork-mcp-apps-integration/intent.md` | 1 |
| `.haiku/intents/cowork-mcp-apps-integration/knowledge/CONVERSATION-CONTEXT.md` | 1 |
| `.haiku/intents/cowork-mcp-apps-integration/stages/inception/units/unit-07-get-review-status-doc-scrub.md` | 4 |
| `.haiku/intents/first-class-design-providers/knowledge/discovery.md` | 1 |
| `.haiku/intents/visual-review/knowledge/discovery.md` | 1 |
| `.haiku/intents/visual-review/stages/development/units/unit-02-mcp-channel-server.md` | 1 |
| `.haiku/intents/visual-review-integration/knowledge/discovery.md` | 1 |
| `.haiku/intents/visual-review-integration/stages/development/units/unit-02-visual-question-tool.md` | 3 |
| `.haiku/intents/design-direction-system/knowledge/discovery.md` | 2 |
| `.haiku/intents/design-direction-system/stages/development/units/unit-03-direction-picker-mcp.md` | 3 |
| `.haiku/intents/design-direction-system/stages/development/units/unit-05-elaboration-integration.md` | 1 |

### `.ai-dlc/` (legacy mirror)

| File | Hits |
|---|---|
| `.ai-dlc/first-class-design-providers/discovery.md` | 1 |
| `.ai-dlc/visual-review-integration/discovery.md` | 1 |
| `.ai-dlc/visual-review-integration/unit-02-visual-question-tool.md` | 3 |
| `.ai-dlc/visual-review/discovery.md` | 1 |
| `.ai-dlc/visual-review/unit-02-mcp-channel-server.md` | 1 |
| `.ai-dlc/design-direction-system/discovery.md` | 2 |
| `.ai-dlc/design-direction-system/unit-03-direction-picker-mcp.md` | 3 |
| `.ai-dlc/design-direction-system/unit-05-elaboration-integration.md` | 1 |

### Repo root

| File | Hits |
|---|---|
| `CHANGELOG.md` | 1 |

## Notes for builder hat

- The 4 hits in `unit-07-get-review-status-doc-scrub.md` and the 1 hit in `CHANGELOG.md` are **self-referential** (describing the cleanup itself) — do not remove.
- Files under `visual-review*` and `design-direction-system` describe polling patterns; per unit scope, rewrite to the current blocking review-gate flow rather than deleting context.
- `.ai-dlc/` is a legacy mirror of `.haiku/intents/`; expect duplicate edits.
