---
title: Screen reader announcements undefined for optimistic UI state changes
status: pending
origin: adversarial-review
author: accessibility
author_type: agent
created_at: '2026-04-17T22:31:26Z'
iteration: 1
visit: 1
source_ref: null
addressed_by: null
---

DESIGN-BRIEF.md §6 correctly specifies a `role="status" aria-live="polite"` live region for status change announcements (e.g. "Feedback FB-03 marked as closed"). The mobile wireframe `artifacts/feedback-inline-mobile.html:262` adds the live region element.

However, the OPTIMISTIC UI pattern specified in unit-05 (feedback-lifecycle-ownership) creates an accessibility gap:
1. User clicks "Verify & Close"
2. UI optimistically updates (badge flips to closed immediately, aria-live fires "FB-03 marked as closed")
3. API call fails
4. UI reverts (badge flips back to addressed)
5. Toast shows "failed — reverted"

A screen reader user now has:
- First announcement: "FB-03 marked as closed"
- Second (toast): "failed — reverted"

The live region updates aren't specified to coordinate. The user hears two conflicting announcements with no clear indication the first was rolled back.

Additionally, the "disabled / in-flight" state (`artifacts/feedback-card-states.html:190`) uses `aria-busy="true"` but the buttons themselves are just `disabled`. Screen reader users don't get a "processing" announcement — the card just goes silent until the toast fires.

**Fix:**
- Specify the live-region announcement sequence: on optimistic click, announce "FB-03 marking as closed..." (not past tense). On success, announce "FB-03 closed." On failure, announce "FB-03 close failed; reverted to addressed."
- Add a spinner visible text fallback with `<span class="sr-only">Processing...</span>` inside the in-flight card so screen readers know state.
- Document this in unit-05's quality gates — the current spec says "Optimistic UI pattern specified" but doesn't define the aria-live sequencing.
