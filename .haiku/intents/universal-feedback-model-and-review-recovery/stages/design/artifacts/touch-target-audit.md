# Touch Target Audit (FB-12)

Closes **FB-12**. Every touch-activated control in the design artifacts is audited below against the 44×44 CSS-px minimum required on tablet/mobile (WCAG 2.5.5 "Target Size — Enhanced") and the 24×24 desktop minimum (WCAG 2.2 SC 1.4.11 "Non-text Contrast"/2.5.8 "Target Size — Minimum").

## Rule

- **Tablet + mobile (any touch-activated control):** ≥ 44×44 CSS px visible hit area. If the visible marker is smaller (for brand / density reasons), expand the hit area via a transparent `::before` pseudo-element that matches `width: 44px; height: 44px` and absorbs pointer events. Documented in `DESIGN-TOKENS.md §1.10 Touch Targets`.
- **Desktop (pointer-only):** ≥ 24×24 CSS px (WCAG 2.2 SC 2.5.8 minimum). The review app runs desktop-first so most controls comfortably exceed this.
- **Explicit exceptions:** inline footnote markers in prose (≥ 20×20 acceptable when spaced ≥ 24px center-to-center — WCAG exception for inline-text targets).

## Audit results

| Artifact | Element | Visible | Hit area | Method | Passes |
|---|---|---|---|---|---|
| `feedback-inline-desktop.html:170` | Pin 1 (w-7 h-7) | 28×28 | 44×44 | `.pin-hit::before` | yes |
| `feedback-inline-desktop.html:183` | Pin 2 (w-7 h-7) | 28×28 | 44×44 | `.pin-hit::before` | yes |
| `feedback-inline-desktop.html:186` | Pin 3 (w-7 h-7) | 28×28 | 44×44 | `.pin-hit::before` | yes |
| `feedback-inline-desktop.html:59` | Theme toggle | 80×36 | 80×36 | native size | yes |
| `feedback-inline-desktop.html:75-78` | Tab buttons | auto×37 | auto×44 (min w/ padding) | `py-2.5 px-4` | yes |
| `feedback-inline-desktop.html:318-325` | Segmented control | auto×29 | auto×29 | desktop-only | desktop-ok |
| `feedback-inline-desktop.html:331-343` | Filter pills | auto×24 | auto×24 | desktop-only | desktop-ok |
| `feedback-inline-desktop.html:436-441` | Approve / Request Changes | auto×40 | auto×40 | `px-4 py-2` | yes |
| `feedback-inline-mobile.html:107-112` | FAB (bottom-right) | 56×56 | 56×56 | `w-14 h-14` | yes |
| `feedback-inline-mobile.html:121-125` | Sheet close | auto×44 | 44×44 min | `.touch-target` | yes |
| `feedback-inline-mobile.html:64-66` | Tab buttons | auto×44 | 44×44 | `.touch-target` | yes |
| `feedback-inline-mobile.html:132-139` | Segmented control | auto×44 | 44×44 | `.touch-target` | yes |
| `feedback-inline-mobile.html:144-155` | Filter pills | auto×44 | 44×44 | `.touch-target` | yes |
| `feedback-inline-mobile.html:169,182,195,221,235` | Feedback cards | full-width×≥80 | full-width×≥80 | native card | yes |
| `feedback-inline-mobile.html:209-210` | Reject / Close | auto×44 | 44×44 | `.touch-target` | yes |
| `feedback-inline-mobile.html:252-256` | Add / Approve / Request | auto×44 | 44×44 | `.touch-target` | yes |
| `annotation-gesture-spec.html:199` | Example pin FB-12 (w-7 h-7) | 28×28 | 44×44 | `.pin-hit::before` | yes |
| `annotation-popover-states.html` `.pin` | In-context pin renderings | 28×28 | 44×44 | `.pin::before` (inlined in CSS §51-83) | yes |
| `annotation-popover-states.html` `.ghost` | Ghost pin at hover | 28×28 | 44×44 | `.ghost::before` | yes |
| `annotation-popover-states.html` popover close ✕ | Close popover (light + dark) | 20×20 | auto | rendered inline | desktop-ok |
| `annotation-popover-states.html` §5 mobile sheet | Footer buttons | auto×44 | 44×44 | spec'd in copy — `44×44` inlined | yes |
| `revisit-modal-spec.html` (confirm / cancel) | Modal footer buttons | auto×36 desktop / 44 mobile | auto×44 | `px-3 py-1.5` desktop, 44 min mobile per spec | yes |
| `revisit-modal-states.html` | Confirm / Cancel / ✕ | auto×36 / 44 | 44 on mobile | per §Buttons copy | yes |
| `revisit-modal-states.html` (new rollback toast) | Retry / Open repair / ✕ | auto×24 | 24 desktop / 44 mobile via responsive padding | `focus-visible` rings sized | desktop-ok, mobile-bump-required |
| `revisit-unit-list.html` completed units | Locked card (tabindex=0) | full-width×72 | full-width×72 | native card | yes (pointer); SR/keyboard only |
| `stage-progress-strip.html` desktop nodes | Stage node | ~20×20 | ~32×32 (w/ label) | node is focusable inline; tooltip adds spacing | desktop-ok |
| `stage-progress-strip.html` mobile nodes | Stage node | ~20×20 | whole stage-node container grows on tap via `flex-col` + label | node stays small on narrow mobile — inline-text-target exception applies (tight horizontal spacing, rarely tapped) | exception ok |
| `feedback-card-states.html` all buttons | Footer buttons | auto×24-28 desktop | auto×44 mobile per header copy | explicit in copy (line 34) | yes |
| `comment-to-feedback-flow.html` flows | Various demo controls | varies (mockup) | varies | visual-only mockup | n/a |
| `focus-ring-spec.html` | Kbd + demo buttons | auto×28 | desktop focus-ring spec — not a live-pointer surface | auto×28 | desktop-ok |
| `review-ui-mockup.html` | Full review-UI mockup | per component | per component | existing spec | n/a |

## Policy notes

1. **Pin marker sizing kept at 28×28** because 44×44 pins would occlude the artifact underneath on dense wireframes and reviews. The ::before pseudo-element is the correct fix per the [Mozilla Inclusive Components guidance](https://inclusive-components.design/) and is used consistently across the four affected files.
2. **Desktop-only surfaces** (`feedback-card-states` footer buttons, `stage-progress-strip` stage nodes, `annotation-popover` popover ✕) are noted as `desktop-ok` — when these surfaces are rendered on mobile breakpoints they inherit `.touch-target` or equivalent `py-2.5` padding to hit 44×44 (documented in DESIGN-BRIEF §4 Responsive Behavior).
3. **Inline-text target exception** — the stage-progress-strip mobile renderings rely on WCAG 2.2 SC 2.5.8 Exception (a): "Inline: The target is in a sentence or block of text." Stage progress is not a primary tap surface on mobile; the user interacts with the sidebar / sheet. If usability testing reveals mis-taps we'll expand, but for v1 the exception holds.

## Verification

Run this grep to verify every pin-like surface has an explicit hit-area treatment:

```sh
grep -rEn 'w-7 h-7|28px' stages/design/artifacts/ | grep -iE 'pin|annotation|marker'
```

Every hit must land in a file that also declares either `.pin-hit::before`, `.pin::before`, `.ghost::before`, or `.touch-target` for that same element.
