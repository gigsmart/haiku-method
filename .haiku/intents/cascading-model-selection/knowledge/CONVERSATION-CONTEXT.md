# Conversation Context

Design discussion established Option C (cascading resolution) as the approach. Key findings from codebase exploration: HatDef in studio-reader.ts already has a model field, orchestrator.ts already reads hatModel at line 1571 and includes it in spawn instructions. What's missing: (1) unit-level model override in orchestrator resolution, (2) elaborator instructions to assess complexity and set model, (3) model display in intent-review.ts template, (4) model display in browse/dashboard views, (5) sensible hat-level defaults across studios.
