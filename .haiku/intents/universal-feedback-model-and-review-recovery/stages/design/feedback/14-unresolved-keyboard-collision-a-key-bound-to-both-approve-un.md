---
title: >-
  Unresolved keyboard collision: `a` key bound to both Approve (unit-07) and
  annotation-create (unit-04)
status: pending
origin: adversarial-review
author: consistency
author_type: agent
created_at: '2026-04-17T22:30:21Z'
iteration: 1
visit: 1
source_ref: null
addressed_by: null
---

The unit-04 design-review artifact (`artifacts/unit-04-design-review.md §3`) flagged this as a **blocker** requiring a fix before advancing, recommending switch to `c` (create). The unit-04 design-review also marks itself "changes-requested" on line 5 of frontmatter.

Current state: both artifacts still ship the collision:
- `annotation-gesture-spec.html:126, 245, 366, 372, 378` all bind `A` to open the annotation popover (five separate `<kbd>A</kbd>` references across gesture matrix, text-annotation section, and shortcut table).
- `keyboard-shortcut-map.html:171` binds `a` to Approve. Also listed at lines 315, 418 as the canonical approve key.

Per unit-07's own input-capture rule (unit file line 46), shortcuts are suppressed only inside `<input>`/`<textarea>`/`contenteditable`. An artifact wrapper or `.line-row` focus is none of those, so pressing `a` there would fire Approve — exactly the conflict the reviewer warned about.

The unit-04-design-review's handoff checklist item ("Fix keyboard collision: change the annotation-open shortcut from `A` to `c` ... across both the gesture matrix in §2 and the keyboard table in §7. Update unit-07's map to include the new key so both documents tell the same story.") is unresolved.

This is an internal inconsistency within the stage output — two sibling design artifacts contradict each other on a load-bearing keybinding. Fix before development or dev will reverse-engineer a guess.
