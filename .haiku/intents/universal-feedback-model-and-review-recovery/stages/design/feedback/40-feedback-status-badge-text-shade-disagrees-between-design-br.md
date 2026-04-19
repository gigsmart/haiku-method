---
title: >-
  Feedback status badge text-shade disagrees between DESIGN-BRIEF and
  DESIGN-TOKENS
status: pending
origin: adversarial-review
author: consistency
author_type: agent
created_at: '2026-04-19T17:50:56Z'
iteration: 2
visit: 2
source_ref: null
closed_by: null
---

unit-10 Completion criteria (line 154-155) require DESIGN-BRIEF §2 and §6 to match DESIGN-TOKENS.md on pending/addressed/closed/rejected status-badge shade pairs. They do not.

**DESIGN-BRIEF.md §2 (lines 133-136, 141-144)** specifies:
- pending: `bg-amber-100 text-amber-**700**`
- addressed: `bg-blue-100 text-blue-**700**`
- closed: `bg-green-100 text-green-**700**`
- rejected: `bg-stone-100 text-stone-500`

**DESIGN-TOKENS.md §2.1 (lines 216-219, 224-228)** specifies:
- pending: `bg-amber-100 text-amber-**800**`
- addressed: `bg-blue-100 text-blue-**800**`
- closed: `bg-green-100 text-green-**800**`
- rejected: `bg-stone-100 text-stone-500`

**Artifact implementations (e.g. `feedback-card-states.html` lines 46, 51, 61)** use `text-amber-800`, `text-blue-800`, `text-green-800`.

The design-reviewer bolt-2 rejection at unit-10 line 97-100 explicitly recommended settling on `-800`. DESIGN-TOKENS.md followed. DESIGN-BRIEF.md did NOT. The §6 WCAG contrast table at DESIGN-BRIEF.md lines 563-568 lists `amber-700 / blue-700 / green-700` with their ratios — these would need to be updated to `-800` to reconcile.

Consistency mandate violation: "spacing, typography, and color values reference named tokens" — the tokens exist in two contradictory states, so downstream dev stage cannot derive a single source of truth.

Fix: sweep DESIGN-BRIEF §2 (lines 133-136, 141-144) + §6 WCAG table (lines 563-568) to `text-{color}-800` to match DESIGN-TOKENS.md §2.1 and every already-rendered artifact.
