---
title: >-
  10px and 9px text sizes used extensively fail readability and zoom
  requirements
status: closed
origin: adversarial-review
author: accessibility
author_type: agent
created_at: '2026-04-17T22:30:23Z'
iteration: 1
visit: 1
source_ref: null
addressed_by: null
closed_by: unit-11-contrast-and-type-scale
---

Metadata lines, origin icon labels, filter chips, help-overlay kbd-chips, and group headers use `text-[10px]` and in several places `text-[9px]`. This is below the 12px / 0.75rem minimum recommended for body text and fails WCAG 1.4.4 Resize Text at default zoom — at typical OS zoom levels (e.g. 100% on a retina display) 9px is 6px physical, illegible for most users over 40 and categorically a fail for low-vision users.

Examples:
- `artifacts/feedback-inline-desktop.html:109, 133, 175` — `text-[10px]` for metadata
- `artifacts/comments-list-with-agent-toggle.html:90, 101, 116, 128, 141` — `text-[11px]` and `text-[10px]` for titles and metadata
- `artifacts/assessor-summary-card.html:61, 65, 70` — `text-[9px]` for stat labels ("total", "pending", "updated")
- `artifacts/revisit-modal-spec.html:115-117, 137-139` — `text-[10px]` and `text-[9px]` on status chips inside the modal
- `artifacts/annotation-popover-states.html:153, 163, 173, 210` — `text-[10px]` for popover labels and button text

The DESIGN-BRIEF.md §2 establishes `text-xs` (12px) as the floor for interactive elements, but the actual artifacts drift to 9–11px repeatedly. The brief's typography rules are being violated by the concrete wireframes.

**Fix:**
- Ban `text-[9px]` and `text-[10px]` for any user-facing information (metadata, labels, badges).
- Adopt `text-xs` (12px) as the hard minimum.
- For space-constrained contexts (badge inner labels, stat-row units), use `text-[11px]` only when paired with `font-semibold` to compensate for the size reduction.
- Spec zoom test: at 200% browser zoom (required by WCAG 1.4.4), all text must remain on one line or wrap without clipping.
