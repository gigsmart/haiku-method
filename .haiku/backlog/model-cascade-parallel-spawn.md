---
priority: medium
created_at: 2026-04-10T22:58:21Z
---

Add model cascade support to the `start_units` parallel spawn path in orchestrator.ts (~line 1646). Currently only the `start_unit`/`continue_unit` path resolves and passes model to subagents. When multiple units spawn in parallel (autopilot/wave execution), model selection is silently ignored. Need to apply the same cascade resolution (unit.model > hat.model > stage.default_model > studio.default_model) to the parallel path.
