---
title: >-
  Add cascading model selection to H·AI·K·U so different units and hats can run
  on different Claude models based on complexity. Hat definitions set baseline
  model preferences in their frontmatter (e.g., reviewer defaults to sonnet,
  researcher defaults to haiku). During elaboration, the elaborator assesses
  each unit's complexity and sets a model override in unit frontmatter. The
  orchestrator resolves models with cascading precedence: unit.model > hat.model
  > stage default > studio default. Model selections must be visible in the
  intent review UI and browse views. This optimizes token spend by matching
  model capability to task complexity — simple mechanical units run on cheaper
  models, complex architectural units get opus.
studio: software
mode: continuous
status: active
created_at: '2026-04-10'
stages:
  - inception
  - design
  - product
  - development
  - operations
  - security
active_stage: inception
---

# Add cascading model selection to H·AI·K·U so different units and hats can run on different Claude models based on complexity. Hat definitions set baseline model preferences in their frontmatter (e.g., reviewer defaults to sonnet, researcher defaults to haiku). During elaboration, the elaborator assesses each unit's complexity and sets a model override in unit frontmatter. The orchestrator resolves models with cascading precedence: unit.model > hat.model > stage default > studio default. Model selections must be visible in the intent review UI and browse views. This optimizes token spend by matching model capability to task complexity — simple mechanical units run on cheaper models, complex architectural units get opus.

Design discussion established Option C (cascading resolution) as the approach. Key findings from codebase exploration: HatDef in studio-reader.ts already has a model field, orchestrator.ts already reads hatModel at line 1571 and includes it in spawn instructions. What's missing: (1) unit-level model override in orchestrator resolution, (2) elaborator instructions to assess complexity and set model, (3) model display in intent-review.ts template, (4) model display in browse/dashboard views, (5) sensible hat-level defaults across studios.
