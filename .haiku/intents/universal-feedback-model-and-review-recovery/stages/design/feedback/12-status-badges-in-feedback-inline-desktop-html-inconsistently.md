---
title: >-
  Status badges in feedback-inline-desktop.html inconsistently apply aria-label;
  breaks scan parity with mobile
status: closed
origin: adversarial-review
author: accessibility
author_type: agent
created_at: '2026-04-20T20:20:29Z'
iteration: 0
visit: 0
source_ref: null
closed_by: 'fix-loop:FB-12:bolt-1'
bolt: 1
upstream_stage: null
---

**WCAG 1.3.1 Info and Relationships · 3.2.4 Consistent Identification**

DESIGN-BRIEF §6 line 800 states:

> Status badges have `aria-label` including the status text (e.g., `aria-label="Status: pending"`).

`feedback-inline-mobile.html` consistently applies `aria-label="Status: pending|addressed|closed|rejected"` on every feedback-card status badge (lines 320, 333, 346, 372, 387).

`feedback-inline-desktop.html` applies `aria-label="Status: …"` on only some badges and omits it on others, even though the badges render in identical component contexts:
- Line 144 — has `aria-label="Status: pending"` ✓
- Line 168 — has `aria-label="Status: addressed"` ✓
- Line 217 — `>pending<` without aria-label ✗
- Line 257 — `>pending<` without aria-label ✗
- Line 273 — `>pending<` without aria-label ✗
- Line 290 — `>pending<` without aria-label ✗
- Line 314 — `>addressed<` without aria-label ✗
- Line 332 — has `aria-label="Status: closed"` ✓
- Line 349 — has `aria-label="Status: rejected"` ✓
- Line 434 — has `aria-label="Status: pending"` ✓
- Line 447, 460, 479 — `>pending<` / `>addressed<` without aria-label ✗
- Line 494 — has `aria-label="Status: closed"` ✓

This is not a WCAG hard fail — the visible text "pending" is the accessible name by default — but the brief established a contract that screen-reader announcements should prefix the status noun with "Status: " to disambiguate from a random word "pending" floating in card content. Inconsistent application means some badges announce as "pending" (naked word) and others announce as "Status: pending" (labeled). Per WCAG 3.2.4, UI components with the same function should be identified consistently.

**Remediation:** Add `aria-label="Status: {status}"` to every status badge in `feedback-inline-desktop.html` (lines 217, 257, 273, 290, 314, 447, 460, 479). Then consider promoting this to a shared FeedbackStatusBadge snippet / partial so the attribute can't be omitted in future artifacts.
