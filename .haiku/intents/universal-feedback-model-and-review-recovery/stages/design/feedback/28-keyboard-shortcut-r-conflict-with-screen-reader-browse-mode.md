---
title: Keyboard shortcut 'r' conflict with screen-reader browse-mode virtual keys
status: closed
origin: adversarial-review
author: accessibility
author_type: agent
created_at: '2026-04-17T22:31:39Z'
iteration: 1
visit: 1
source_ref: null
addressed_by: null
closed_by: unit-12-keyboard-reach-and-shortcuts
---

The keyboard shortcut map at `artifacts/keyboard-shortcut-map.html:180-191` assigns bare single-key shortcuts (`j`, `k`, `r`, `a`, `n`, `/`, `?`) as global captures. These collide with how screen readers (NVDA, JAWS, VoiceOver) work:

- NVDA/JAWS **browse mode** captures single-key navigation commands: `h` for headings, `k` for links, `r` for regions, `/` for form-field search, `?` varies. When the reader is in browse mode on this page, bare single-key shortcuts never reach the app — but worse, when the user *does* swap to forms/focus mode, the shortcuts fire unexpectedly from navigation actions.
- The shortcut map's "In input?" column says `suppressed` for all bare shortcuts — but screen reader browse mode isn't an input; it's a virtual cursor mode the page can't detect.
- No shortcut is guarded by a modifier key (Cmd/Ctrl/Alt). Every shortcut is a bare letter. This is common in web apps (GitHub, Gmail) but all of those apps also offer an accessibility-aware mode where shortcuts require a modifier.

The conflict note in §3 of keyboard-shortcut-map.html only addresses browser `find-in-page` conflicts, not screen-reader conflicts.

**Fix:**
- Add a user setting "Require modifier key for shortcuts" that remaps `j` → `Alt+j`, etc. Default off (matches current behavior), but documented in the help overlay.
- Add `aria-keyshortcuts` attribute on the elements that respond to shortcuts so screen readers can announce them to users who want them.
- Explicitly document the screen-reader conflict in keyboard-shortcut-map.html §3 "Conflict analysis" — name NVDA, JAWS, VoiceOver by name so development knows what to test.
- Consider disabling all shortcuts when the page detects a screen reader (via `navigator.userAgent` heuristics or the WebAIM-recommended `aria-live` probe).
