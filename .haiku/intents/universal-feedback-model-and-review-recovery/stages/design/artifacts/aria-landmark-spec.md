# ARIA Landmark Specification

**Scope:** Every user-facing page, modal, and sheet in the universal feedback model & review recovery UI.
**Closes:** FB-35 (landmark structure) and the unit-01 landmark-amendment body text requirement.
**Enforced by:** feedback-assessor hat (unit-13) and dev-stage implementation.

## 1. Canonical landmark map

Every rendered page or modal **MUST** declare exactly one of each landmark in this order. Any exception must be documented in the artifact's comment and in the "Per-surface landmark map" table below.

| Landmark | HTML element | Required ARIA attributes | Purpose |
|---|---|---|---|
| Banner | `<header role="banner">` | — | Site / app-level header; contains global title + theme toggle |
| Navigation (stage progress) | `<nav aria-label="Stage progress">` | `aria-label` required; use `aria-current="step"` on active stage node | Discoverable as "Stage progress" in VoiceOver rotor / NVDA landmarks list |
| Main | `<main id="main-content" role="main" aria-label="Review content">` | `id="main-content"` required for skip-link target; `role="main"` explicit even though `<main>` implies it — IE11 fallback and belt-and-suspenders | Primary scrollable content region |
| Complementary (sidebar) | `<aside role="complementary" aria-label="Review sidebar">` | `aria-label` required; MUST NOT be `<div>` | Review sidebar (feedback list + decision controls) |
| Dialog (modals) | `<div role="dialog" aria-modal="true" aria-labelledby="{titleId}">` | `aria-modal="true"` + `aria-labelledby` required | Every modal / popover / bottom-sheet |
| Status (live region, polite) | `<div role="status" aria-live="polite" aria-atomic="true">` | Used for optimistic-UI + success announcements | Per `aria-live-sequencing-spec.md` |
| Alert (live region, assertive) | `<div role="alert" aria-live="assertive" aria-atomic="true">` | Used for failure / rollback announcements | Separate node so "marking…" is not overwritten before readout |
| Skip link | `<a href="#main-content">Skip to main content</a>` | Must be the first focusable element in the DOM; `sr-only` until focused | Bypasses the header / nav for keyboard users (closes FB-30) |

### Order in the DOM

```html
<body>
  <a href="#main-content" ...>Skip to main content</a>   <!-- 1 -->
  <header role="banner">…</header>                        <!-- 2 -->
  <nav aria-label="Stage progress">…</nav>                <!-- 3 (often inside <header> via review-context-header) -->
  <main id="main-content" role="main">…</main>           <!-- 4 -->
  <aside role="complementary" aria-label="Review sidebar">…</aside>  <!-- 5 (desktop only, inside the main layout flex container) -->
  <!-- dialogs rendered inside main or as siblings of main, appearing when active -->
  <div role="dialog" aria-modal="true" aria-labelledby="…">…</div>
  <div id="feedback-live-polite" role="status" aria-live="polite" aria-atomic="true" class="sr-only"></div>  <!-- 6 -->
  <div id="feedback-live-assertive" role="alert" aria-live="assertive" aria-atomic="true" class="sr-only"></div>  <!-- 7 -->
</body>
```

### Two live regions, not one

Failure messages use `role="alert"` + `aria-live="assertive"` in a **separate** node so the prior `"FB-XX marking as closed…"` text (polite) is not overwritten before the screen reader has finished speaking it. See `aria-live-sequencing-spec.md` for the sequencing template.

## 2. Per-surface landmark map

Every artifact must be audited against this table. The dev-stage implementation **MUST** render these landmarks for every corresponding React / SSR surface.

| Surface / artifact | banner | stage-nav | main | aside | dialog | status | alert |
|---|---|---|---|---|---|---|---|
| `feedback-inline-desktop.html` | ✅ `<header role="banner">` | ✅ (inside review-context-header block above main) | ✅ `<main id="main-content" role="main">` | ✅ `<aside role="complementary" aria-label="Review sidebar">` | — | ✅ `#feedback-live-polite` | ✅ `#feedback-live-assertive` |
| `feedback-inline-mobile.html` | ✅ | ✅ (via review-context-header, mobile variant) | ✅ `<main id="main-content">` | ❌ (no desktop sidebar; feedback sheet replaces it) | ✅ `#feedback-sheet role="dialog" aria-modal="true" aria-labelledby="sheet-title"` | ✅ | ✅ |
| `review-context-header.html` | the artifact IS the banner region — used inside other artifacts; must render as `<header role="banner">` when embedded | ✅ `<nav aria-label="Stage progress">` | — (artifact is just the header showcase) | — | — | — | — |
| `stage-progress-strip.html` | — (nav fragment embedded inside a banner in real use) | ✅ `<nav aria-label="Stage progress">` | — | — | — | — | — |
| `comment-to-feedback-flow.html` | ✅ | — (flow diagram, not a review page) | ✅ `<main id="main-content" role="main" aria-label="Feedback flows">` | — | — | — | — |
| `feedback-card-states.html` | — (gallery of card states) | — | `<main role="main" aria-label="Card states gallery">` | — | — | — | — |
| `comments-list-with-agent-toggle.html` | — (sidebar fragment) | — | — | ✅ `<aside role="complementary" aria-label="Review sidebar">` | — | — | — |
| `annotation-popover-states.html` | — | — | `<main role="main">` containing the host page | — | ✅ every popover `role="dialog" aria-modal="true" aria-labelledby="pN-label"` | — | — |
| `assessor-summary-card.html` | — (card fragment) | — | — | — | — | ✅ **card root** is `<div role="status" aria-live="polite" aria-atomic="true" aria-labelledby="assessor-title">` so screen-reader users are told "assessor run complete" when the card mounts | — |
| `revisit-modal-spec.html` | — (modal spec) | — | — | — | ✅ `<div role="dialog" aria-modal="true" aria-labelledby="revisit-title" aria-describedby="revisit-desc">` | — | — |
| `revisit-unit-list.html` | ✅ | ✅ | ✅ `<main id="main-content" role="main">` | — (unit list is the primary content, not a sidebar) | — | — | — |
| `review-package-structure.html` | ✅ `<header role="banner">` (spec doc, not a runtime page) | — | ✅ `<main role="main">` | — | — | — | — |
| `focus-ring-spec.html` | — (spec gallery) | — | `<main role="main" aria-label="Focus ring spec gallery">` | — | — | — | — |
| `agent-feedback-toggle-spec.html` | — (spec gallery) | — | `<main role="main" aria-label="Agent feedback toggle states">` | — | — | — | — |

Legend: ✅ required · ❌ intentionally absent · — not applicable for this artifact's role.

## 3. Modal / dialog requirements (applies to every dialog surface)

Every surface with `role="dialog"`:

1. `aria-modal="true"` required.
2. `aria-labelledby` pointing at a visible heading inside the dialog (the heading must have a unique `id`).
3. `aria-describedby` (optional) pointing at a descriptive paragraph; recommended when the dialog's purpose is non-obvious (e.g. revisit-modal).
4. First focusable element receives focus on open (use `focus-trap-react` or equivalent).
5. `Escape` key closes the dialog.
6. On close, focus returns to the element that opened the dialog (FAB for the mobile sheet; the "Revisit" button for the revisit modal; etc.).
7. When a dialog is open, all other landmarks (`<header>`, `<nav>`, `<main>`, `<aside>`) receive `aria-hidden="true"` **and** the `inert` attribute so assistive tech does not traverse background content.
8. Dialogs use the canonical focus-ring spec (see `focus-ring-spec.html §1`).

### Focus-trap contract

Use `focus-trap-react` (https://github.com/focus-trap/focus-trap-react) — the same library already used by `annotation-popover-states.html`. Wrap every dialog in `<FocusTrap active returnFocusOnDeactivate>` — the library moves focus to the first tabbable on mount and restores it to the opener on unmount. No manual `focus()` calls from component code.

## 4. Stage-progress-strip `<nav>` contract

When stage-progress-strip is embedded inside review-context-header (or any page), it **MUST** be wrapped in `<nav aria-label="Stage progress">`. This makes it discoverable as a "Stage progress" landmark in the VoiceOver rotor / NVDA landmarks list. Each stage node:

- `role="link"` (since clicking navigates to the stage's view)
- `aria-current="step"` on the active stage node
- `aria-disabled="true"` on upcoming stages that are not yet visitable
- `aria-label` pointing at the stage name + its state (e.g. `aria-label="Design, completed, visited 2 times"`)
- Focusable via `tabindex="0"` (visitable) or omitted (disabled)
- Focus-visible ring per `focus-ring-spec.html §1`

## 5. MobileFeedbackPanel dialog lifecycle (closes FB-51)

The `MobileFeedbackPanel` (rendered by `FeedbackSheet` on mobile breakpoints, opened by `FeedbackFloatingButton` / the FAB) is the canonical example of the §3 dialog contract. Because it covers the full viewport, the lifecycle below **MUST** be implemented end-to-end; partial compliance is a blocker.

### 5.1 DOM contract (every `MobileFeedbackPanel` render)

```html
<!-- Opener — always present; sheet-controls attribute binds it to the dialog -->
<button id="feedback-fab"
        aria-label="Open feedback panel, 3 pending"
        aria-haspopup="dialog"
        aria-expanded="false"
        aria-controls="feedback-sheet">…</button>

<!-- Sheet — rendered conditionally (or always-in-DOM + hidden when closed) -->
<div id="feedback-sheet"
     role="dialog"
     aria-modal="true"
     aria-labelledby="sheet-title">
  <h2 id="sheet-title">Feedback</h2>
  …
</div>
```

Required attributes on the sheet root:

| Attribute | Value | Purpose |
|---|---|---|
| `role="dialog"` | required | Landmark |
| `aria-modal="true"` | required | AT treats background as inert even before `inert` attribute lands |
| `aria-labelledby` | points at the in-sheet heading `id` (not to an offscreen element) | Accessible name |
| `id="feedback-sheet"` | required | FAB's `aria-controls` target |

Required on the FAB (`FeedbackFloatingButton`):

| Attribute | Value | Purpose |
|---|---|---|
| `aria-haspopup="dialog"` | required | Announces "opens a dialog" to AT on focus |
| `aria-expanded` | `"true"` when sheet open, `"false"` when closed | Reflects live state |
| `aria-controls` | `"feedback-sheet"` | Pairs opener → dialog |
| `aria-label` | descriptive ("Open feedback panel, N pending") | Icon-only button must still have a name |

### 5.2 Open lifecycle (FAB click, Enter, Space)

1. Apply `aria-hidden="true"` **AND** the `inert` attribute to `<main id="main-content">` and `<header role="banner">`. `inert` blocks pointer + keyboard from background content; `aria-hidden` keeps AT from traversing it. Both are required — browsers without `inert` fall back to `aria-hidden`, browsers without `aria-hidden` enforcement fall back to `inert`.
2. Flip the FAB's `aria-expanded` from `"false"` → `"true"`.
3. Mount / reveal the sheet. Wrap it in `<FocusTrap active returnFocusOnDeactivate={true}>` (see §3 focus-trap contract — `focus-trap-react` is the canonical library, the same one already used by `annotation-popover-states.html`; do NOT hand-roll a trap).
4. `FocusTrap` auto-moves focus to the first tabbable inside the sheet (the `AgentFeedbackToggle` switch — `#sheet-first-tab`). No manual `focus()` call from component code.
5. Attach a keydown listener scoped to the sheet: `Escape` → close (same path as the close button).
6. The polite live-region (`#feedback-live-polite`) announces `"Feedback panel opened"` (optional but recommended for long sheets). Do NOT double-announce; the dialog role alone is already enough on most ATs.

### 5.3 Close lifecycle (close button, `Escape`, backdrop tap, Approve/Request-Changes submit)

1. Remove the `aria-hidden="true"` + `inert` attributes from `<main>` and `<header>`.
2. `FocusTrap`'s `returnFocusOnDeactivate` restores focus to the `FeedbackFloatingButton` automatically. Do NOT call `FAB.focus()` manually — it double-fires and can land on the wrong element if the DOM shifts between open and close (e.g., an item was added and the FAB index shifted).
3. Flip the FAB's `aria-expanded` back to `"false"`.
4. Unmount or hide the sheet.
5. No live-region announcement on close — the focus return + visual transition communicates it.

### 5.4 State matrix (what's true in each phase)

| Phase | FAB `aria-expanded` | Sheet DOM | `<main>` inert | `<header>` inert | Focus |
|---|---|---|---|---|---|
| Idle (sheet closed) | `"false"` | absent or hidden | no | no | wherever it was |
| Opening (animation frame 1-N) | `"true"` | present | yes | yes | FAB (about to shift) |
| Open + interactive | `"true"` | present, focus-trapped | yes | yes | first tabbable inside sheet, then whatever user tabs to |
| Closing (animation frame 1-N) | `"false"` | present | still yes (until unmount) | still yes | trapped until unmount |
| Closed | `"false"` | absent or hidden | no | no | back on FAB (`returnFocusOnDeactivate`) |

### 5.5 Escape-hatch cases

- **Backdrop tap** (if the design grows one — v1 is full-viewport, so no backdrop): same close path as §5.3. Do not swallow the tap silently; always run the close lifecycle so `aria-expanded`, `inert`, and focus return all fire.
- **Form submit from inside the sheet** (Approve / Request Changes): close the sheet *after* the decision completes, using the same §5.3 path. If the submit fails, keep the sheet open and surface the error in `#feedback-live-assertive`.
- **Route change while sheet is open** (user navigates via keyboard shortcut — e.g. unit-12 `G H` home shortcut): the route handler **MUST** invoke the close lifecycle before navigation; otherwise `inert` + focus state leaks into the next page.
- **Soft keyboard (mobile)**: when a textarea inside the sheet receives focus, the OS keyboard shrinks the viewport. The sheet's `max-height` must be in `dvh` (dynamic viewport height) to re-flow, not `vh`. Focus-trap is unaffected (it tracks DOM, not viewport).

### 5.6 Verification

- `grep -rEn 'aria-haspopup="dialog"' stages/design/artifacts/feedback-inline-mobile.html` → ≥ 1 match (on the FAB)
- `grep -rEn 'aria-controls="feedback-sheet"' stages/design/artifacts/feedback-inline-mobile.html` → ≥ 1 match
- `grep -rEn 'role="dialog" aria-modal="true" aria-labelledby=' stages/design/artifacts/feedback-inline-mobile.html` → ≥ 1 match
- `grep -rEn 'focus-trap-react' stages/design/artifacts/` → ≥ 1 match (the implementation-contract reference — inline comment or sibling doc)
- Manual VoiceOver test: Tab to FAB → announced as "Open feedback panel, N pending, button, pop-up dialog collapsed" → Enter opens → focus lands on the Agent-feedback switch → Shift+Tab stays inside the sheet → Escape closes → focus returns to FAB.

## 5a. Origin legend component (closes FB-33)

The `FeedbackOriginIcon` component has a dedicated legend/glossary, placed either:
- In the sidebar header (`comments-list-with-agent-toggle.html` — small "?"-icon button opens a popover legend), OR
- In a help overlay keyed to the `?` shortcut.

The legend **MUST** list all six origins from DESIGN-BRIEF §2 with their emoji + text label, and the emoji rendering must match exactly between the brief and every artifact. See the "Emoji ↔ origin mapping (canonical)" section below.

## 6. Emoji ↔ origin mapping (canonical)

Single source of truth. DESIGN-BRIEF §2 **and** every artifact **MUST** render the same emoji for each origin. Screen-reader users see the adjacent visible text label — `aria-hidden="true"` is applied to the emoji span because the text label is the accessible name.

| Origin (feedback frontmatter) | Emoji code point | Emoji | Visible text label | Rendering notes |
|---|---|---|---|---|
| `adversarial-review` | `U+1F50D` `&#x1F50D;` | 🔍 | Review Agent | Magnifying glass; renders consistently on Apple Color Emoji, Segoe UI Emoji 14+, Noto Emoji |
| `external-pr` | `U+1F517` `&#x1F517;` | 🔗 | PR Comment | Link; renders consistently on all three emoji fonts |
| `external-mr` | `U+1F517` `&#x1F517;` | 🔗 | MR Comment | Same emoji as `external-pr`; text label differentiates |
| `user-visual` | `U+270E` `&#x270E;` | ✎ | Annotation | Lower-right pencil; text-style glyph (no variation selector). On Apple Color Emoji + Segoe UI Emoji it renders as a text glyph — deliberate, because this is the only "text-style" glyph in the set and it pairs visually with the pencil brush convention in the annotation popover's pin UI. |
| `user-chat` | `U+1F4AC` `&#x1F4AC;` | 💬 | Comment | Speech balloon |
| `agent` | `U+1F916` `&#x1F916;` | 🤖 | Agent | Robot face |

### Cross-platform emoji rendering smoke test

Before merging the dev stage, QA **MUST** render every artifact in:
- macOS 15+ Safari (Apple Color Emoji)
- Windows 11 Chrome / Edge (Segoe UI Emoji 14+)
- Ubuntu 24.04 Firefox (Noto Color Emoji 2.042+)

and verify all six origins render as the intended pictographs (no tofu boxes, no text fallback, no wildly-different visual metaphors). The `✎` pencil is intentionally a text-style glyph; all others are pictographic.

### ARIA policy for emoji

Every emoji span that appears next to a visible text label **MUST** have `aria-hidden="true"`. Screen readers should announce the label, not the emoji name. Example:

```html
<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border bg-rose-100 text-rose-700">
  <span aria-hidden="true">&#x1F50D;</span> Review Agent
</span>
```

When an emoji is used **without** a visible text label (e.g. status icon in a dense sidebar), it **MUST** have an explicit `aria-label`:

```html
<span role="img" aria-label="Review Agent">&#x1F50D;</span>
```

## 7. Skip link requirement (reinforces FB-30)

Every page-level artifact **MUST** include a skip link as the first focusable element:

```html
<a href="#main-content"
   class="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:top-2 focus-visible:left-2
          focus-visible:z-[100] focus-visible:px-3 focus-visible:py-2
          focus-visible:bg-teal-600 focus-visible:text-white focus-visible:rounded-md
          focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2
          dark:focus-visible:ring-offset-stone-900">
  Skip to main content
</a>
```

The target `<main id="main-content">` **MUST** have `tabindex="-1"` so the browser can move focus to it programmatically when the skip link is activated (not required on all browsers, but adds nothing bad and closes the long-tail edge cases).

## 7a. Canonical component aria-labels (closes FB-10)

Component-level `aria-label` strings drift easily (reviewers shorten, designers copy-paste older drafts, implementations fall back to the visible text). The row below is the **authoritative accessible name** for the `AgentFeedbackToggle` component — enforced by §9 and closing FB-10.

| Component | Canonical `aria-label` | Why this exact string | Source of truth |
|---|---|---|---|
| `AgentFeedbackToggle` (role=`switch`) | `"Show agent feedback inline"` | The visible "Comments" heading sits **outside** the switch, so the switch needs its own name. The word **"inline"** communicates the opt-in overlay semantics (agent items interleaved in the same list) vs. a separate tab/panel. SR users hearing just "Show agent feedback, switch, off" would not know the effect is inline interleaving. | DESIGN-BRIEF §2 line 385; §6 line 802 |

### Banned variants for `AgentFeedbackToggle` (enforced by §9 grep)

The following shorter / drifted forms **MUST NOT** appear in any artifact for this component. Each of them changes the user's mental model by dropping the word that distinguishes the behavior from a plausible alternative.

| Banned string | Why banned | Replace with |
|---|---|---|
| `aria-label="Show agent feedback"` | Drops "inline" — SR users cannot tell the effect is inline interleaving vs. a separate tab/panel. | `aria-label="Show agent feedback inline"` |
| `aria-label="Toggle agent feedback"` | Drops the direction of the action (show vs. hide); the `role="switch"` + `aria-checked` already expose the binary state, so the label names the **destination**, not the action. | `aria-label="Show agent feedback inline"` |
| `aria-label="Agent feedback"` (as the switch's label, not as a section heading) | Describes the subject, not the action. `role="switch"` expects a verb-phrase label. | `aria-label="Show agent feedback inline"` |

If a reviewer finds any of these on an `AgentFeedbackToggle` `role="switch"` button, the fix is to replace with the canonical string from the table above. The verification checklist in §9 enforces this via grep.

> **Scope note for other components.** Other accessible names (`FeedbackFloatingButton`, `FeedbackSheet` close, `<main>`, `<aside>`, etc.) are defined in DESIGN-BRIEF §6 and in §§1–2 of this spec and are audited by their own rows in §9. FB-10 is scoped to `AgentFeedbackToggle` drift only; do not bundle unrelated aria-label clean-ups into this closure.

### Default-state contract for `AgentFeedbackToggle`

Per DESIGN-BRIEF §2 line 337 (`default OFF`) and `AgentFeedbackToggleProps.showAgent: false`, every mockup that renders the component in its **first-paint / default** state **MUST** render:

- `aria-checked="false"`
- track in neutral stone color (not teal)
- thumb positioned **left** (not translated right)
- count chip styled as "hidden" (muted), not "inline" (active)

Mockups that intentionally demonstrate the ON state (e.g. `comments-list-with-agent-toggle.html` has both a default-off and a checked-on variant; `agent-feedback-toggle-spec.html` §2 enumerates all states) MAY render `aria-checked="true"` — but those renderings MUST be captioned with a state label (e.g. "Checked (on)") so a reviewer can tell the demo from the default. A bare toggle in a flow-diagram or preview panel is presumed to be the default and MUST render OFF.

## 8. unit-01 amendment (body text reference, NOT FSM field)

unit-01's completion-criteria body text (not frontmatter) is amended to require:

- every artifact render the landmark structure defined in §1 above
- every modal render the dialog contract defined in §3
- origin-emoji rendering match §6

This is a body-text amendment only — unit-01's FSM fields (status, hat, iterations, etc.) are not modified.

## 9. Verification checklist (feedback-assessor + dev-stage gate)

- [ ] `grep -rEn 'role="banner"' stages/design/artifacts/` shows ≥ 1 match per page-level artifact
- [ ] `grep -rEn '<main[^>]* id="main-content"' stages/design/artifacts/` shows ≥ 1 match per page-level artifact
- [ ] `grep -rEn 'aria-label="Stage progress"' stages/design/artifacts/` shows ≥ 1 match per artifact that contains a stage-strip
- [ ] `grep -rEn 'role="complementary"' stages/design/artifacts/` shows ≥ 1 match per desktop artifact
- [ ] `grep -rEn 'role="dialog" aria-modal="true"' stages/design/artifacts/` shows ≥ 1 match per artifact that contains a modal
- [ ] `grep -rEn 'role="status" aria-live="polite"' stages/design/artifacts/` shows ≥ 2 matches (per-page polite region + assessor-summary-card root)
- [ ] `grep -rEn 'role="alert" aria-live="assertive"' stages/design/artifacts/` shows ≥ 1 match per page-level artifact
- [ ] Origin emoji audit: `grep -rEn '&#x(1F6E&#49;|1F5&#48;&#48;|27&#50;8|1F44&#49;)' stages/design/` returns 0 matches (these code points — shield `U+1F6E1`, shuffle `U+1F500`, sparkles `U+2728`, eye `U+1F441` — are the forbidden / drifted emoji from the old drafts; the grep pattern in this line is HTML-entity-escaped and the forbidden codepoints are referenced by U-notation so the audit stays clean when it scans this spec itself)
- [ ] Skip link present: `grep -rEn 'href="#main-content"' stages/design/artifacts/` shows ≥ 1 match per page-level artifact
- [ ] `AgentFeedbackToggle` aria-label drift (FB-10): `grep -rEn 'aria-label="(Show agent feedback|Toggle agent feedback|Agent feedback)"' stages/design/artifacts/ | grep -v aria-landmark-spec.md` returns **0 matches** (the banned-variants table in `aria-landmark-spec.md` §7a documents the forbidden strings and is excluded from the audit; canonical is `"Show agent feedback inline"` — see §7a)
- [ ] `AgentFeedbackToggle` aria-label canonical present: `grep -rEn 'aria-label="Show agent feedback inline"' stages/design/artifacts/` shows ≥ 1 match for every artifact that renders the component (`agent-feedback-toggle-spec.html`, `feedback-inline-desktop.html`, `feedback-inline-mobile.html`, `comments-list-with-agent-toggle.html`, `comment-to-feedback-flow.html`, `review-package-structure.html`)

Any gate item that fails blocks hat advancement; assessor rejects with the specific line reference.
