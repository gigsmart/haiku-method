# Cross-link Notes — VALIDATION.md ↔ RUNBOOK.md

## What was added

### `packages/haiku/VALIDATION.md`

New `## Operational runbook` section at the bottom with:
- Link to `.haiku/knowledge/RUNBOOK.md` § "MCP Apps Review Path (Cowork)"
- One-sentence summaries of all 6 MCP Apps failure scenarios (iframe, timeout,
  HTTP fallback, session loss, bundle regression, standard ops)

### `.haiku/knowledge/RUNBOOK.md`

Already had a `See also: packages/haiku/VALIDATION.md` line near the top of the
`## MCP Apps Review Path (Cowork)` section (line 39). No change needed.

## Verification

```bash
rg -n 'RUNBOOK.md' packages/haiku/VALIDATION.md        # ≥ 1 hit
rg -n 'VALIDATION.md' .haiku/knowledge/RUNBOOK.md      # ≥ 1 hit
rg -n '## Operational runbook' packages/haiku/VALIDATION.md  # 1 hit
```
