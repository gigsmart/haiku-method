---
title: 'Add archivable intents to H·AI·K·U. Users need a way to soft-hide completed,…'
studio: software
mode: continuous
status: active
created_at: '2026-04-14'
stages:
  - inception
  - design
  - product
  - development
  - operations
  - security
active_stage: inception
intent_reviewed: true
---

# Add archivable intents to H·AI·K·U. Users need a way to soft-hide completed,…

Add archivable intents to H·AI·K·U. Users need a way to soft-hide completed, stale, or paused intents without deleting them. Introduce a manual archive mechanism (tool/skill) that flags an intent as archived in its state, filters it from default list/dashboard views, and supports one-call unarchive to restore. Archived state is a flag — files stay put, history is preserved, and intents remain restorable.

User wants archivable intents for three reasons (all of the above): decluttering the active list, reducing state bloat, and preserving paused intents for later revisit. Behavior: soft-hide via a flag in intent state, filtered from list commands, restorable via a single tool call. Trigger: manual only (a tool/skill the user invokes); no auto-archive on completion or staleness in this intent. Files stay in .haiku/intents/{slug} — no physical move, no git-tag archiving. Needs to integrate with existing haiku_intent_list and any dashboard/backlog views that enumerate intents.
