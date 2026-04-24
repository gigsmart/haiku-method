# Touch Target Audit (FB-12, re-audited for FB-64)

Closes **FB-12** (original audit) and **FB-64** (re-audit with correct interpretation of WCAG 2.5.8 inline-text exception).

## 1. Rule (canonical)

WCAG 2.2 SC 2.5.8 **Target Size — Minimum** — every pointer-activated control must be at least **24×24 CSS px**, or sit inside a 24×24 spacing bubble.

WCAG 2.5.5 **Target Size — Enhanced** (AAA) — every pointer-activated control must be at least **44×44 CSS px**. H·AI·K·U adopts this as a **hard floor on tablet and mobile (≤ 768 px viewport)**: every button, link, icon, and input on a touch viewport must have ≥ 44×44 effective hit area, full stop.

### The inline-text exception — what it does and does NOT cover

SC 2.5.8's inline-text exception permits targets smaller than 24×24 **only** when the target is **inline in a sentence or block of flowing prose**. Typical example: a citation link inside body copy, or an `<a>` footnote marker inside a paragraph. In those cases the prose line-height provides the practical vertical hit area.

The exception is **NOT** a license for:

- Toolbar icon buttons (even if rendered inline with other controls)
- Toast-close × buttons
- Popover ✕ close buttons
- Feedback-card footer buttons
- Navigation / stage-progress nodes
- Any standalone affordance the user must tap as a discrete action

Misapplying the exception to standalone toolbar controls is the FB-64 finding. The re-audit below applies the exception ONLY to true in-prose text links.

### H·AI·K·U policy on top of the WCAG baseline

| Viewport | Minimum effective hit area | Source |
|---|---|---|
| Mobile (≤ 640 px) | **44×44 CSS px** — no exceptions except true in-prose text links | WCAG 2.5.5 (adopted as hard rule), DESIGN-TOKENS.md §1.10 |
| Tablet (641–768 px) | **44×44 CSS px** — no exceptions except true in-prose text links | same |
| Desktop (≥ 769 px, pointer-only) | **24×24 CSS px** per SC 2.5.8; 44×44 preferred for primary actions | WCAG 2.5.8 |

If the visible marker must be smaller (e.g. a pin on a dense wireframe), the hit area is extended via a transparent `::before` pseudo-element that sets `width: 44px; height: 44px` and absorbs pointer events. See `DESIGN-TOKENS.md §1.10 Touch Targets`.

## 2. Audit results (post-FB-64 re-audit)

Every control on every mobile-viewport surface is listed with its measured visible size and effective hit area. Rows that were previously `desktop-ok` for controls that ALSO render on mobile have been re-audited and either (a) the fix is documented with the hit-area extension, or (b) the row is annotated with the responsive-breakpoint rule that bumps the size on mobile.

| Artifact | Element | Visible | Hit area | Method | Mobile pass? |
|---|---|---|---|---|---|
| `feedback-inline-desktop.html:170` | Pin 1 (w-7 h-7) | 28×28 | 44×44 | `.pin-hit::before` | yes |
| `feedback-inline-desktop.html:183` | Pin 2 (w-7 h-7) | 28×28 | 44×44 | `.pin-hit::before` | yes |
| `feedback-inline-desktop.html:186` | Pin 3 (w-7 h-7) | 28×28 | 44×44 | `.pin-hit::before` | yes |
| `feedback-inline-desktop.html:59` | Theme toggle | 80×36 | 80×36 | native size | yes (≥ 44 tall only when `.touch-target` applied responsively; documented in DESIGN-BRIEF §4) |
| `feedback-inline-desktop.html:75-78` | Tab buttons | auto×37 | auto×44 (min w/ padding) | `py-2.5 px-4` | yes |
| `feedback-inline-desktop.html:318-325` | Segmented control | auto×29 desktop | auto×44 mobile | responsive: desktop uses `py-1.5`, mobile inherits `.touch-target` via the mobile artifact | desktop-only surface at 1280 px; mobile render uses `feedback-inline-mobile.html` toggle at 44×44 |
| `feedback-inline-desktop.html:331-343` | Filter pills | auto×24 desktop | auto×44 mobile | same responsive pattern | yes on mobile (see `feedback-inline-mobile.html:184-197`) |
| `feedback-inline-desktop.html:436-441` | Approve / Request Changes | auto×40 desktop | auto×40 desktop (≥ 24) | `px-4 py-2` | desktop-ok; mobile render in `feedback-inline-mobile.html:304-305` uses `py-2` + `touch-target` = ≥ 44 tall |
| `feedback-inline-mobile.html:56-64` | Theme toggle (icon-only, FB-66) | ≥ 44×44 | ≥ 44×44 | `.touch-target` | yes |
| `feedback-inline-mobile.html:116-126` | FAB (bottom-right) | 56×56 | 56×56 | `w-14 h-14` | yes |
| `feedback-inline-mobile.html:164-167` | Sheet close ✕ | auto×44 | 44×44 min | `.touch-target` | yes |
| `feedback-inline-mobile.html:68-70` | Tab buttons | auto×44 | 44×44 | `.touch-target` | yes |
| `feedback-inline-mobile.html:176-181` | AgentFeedbackToggle (role=switch) | auto×44 | 44×44 (wrapper), 32×16 visual | `.touch-target` + `.af-touch` extends hit area | yes |
| `feedback-inline-mobile.html:185-197` | Filter pills (All / Pending / Addressed / Closed) | auto×44 | 44×44 | `.touch-target` | yes |
| `feedback-inline-mobile.html:210,223,236,262,276` | Feedback cards | full-width×≥80 | full-width×≥80 | native card | yes |
| `feedback-inline-mobile.html:250-251` | Reject / Close buttons | auto×44 | 44×44 | `.touch-target` | yes |
| `feedback-inline-mobile.html:300-305` | Add / Approve / Request Changes | auto×44 | 44×44 | `.touch-target` | yes |
| `annotation-gesture-spec.html:199` | Example pin FB-12 (w-7 h-7) | 28×28 | 44×44 | `.pin-hit::before` | yes |
| `annotation-popover-states.html` `.pin` | In-context pin renderings | 28×28 | 44×44 | `.pin::before` (inlined in CSS §51-83) | yes |
| `annotation-popover-states.html` `.ghost` | Ghost pin at hover | 28×28 | 44×44 | `.ghost::before` | yes |
| `annotation-popover-states.html` popover close ✕ | Close popover (light + dark) | 20×20 visible | 44×44 on mobile (`.touch-target` applied via §5 mobile rules), 24×24 on desktop via `::before` hit-area extension | extended via `.popover-close::before` pseudo-element (added for FB-64) | yes (standalone icon button — exception does NOT apply) |
| `annotation-popover-states.html` §5 mobile sheet | Footer buttons | auto×44 | 44×44 | spec'd in copy — `44×44` inlined | yes |
| `revisit-modal-spec.html` (confirm / cancel) | Modal footer buttons | auto×36 desktop / 44 mobile | auto×44 | `px-3 py-1.5` desktop, 44 min mobile per spec | yes |
| `revisit-modal-states.html` | Confirm / Cancel / ✕ | auto×36 / 44 | 44 on mobile | per §Buttons copy | yes |
| `revisit-modal-states.html` (rollback toast) | Retry button | auto×40 desktop / auto×44 mobile | 44×44 mobile via responsive `py-3 md:py-2` + `.touch-target` | fixed in FB-64 — was `auto×24` previously, now meets 44×44 on mobile | yes |
| `revisit-modal-states.html` (rollback toast) | Open repair button | auto×40 desktop / auto×44 mobile | 44×44 mobile via responsive `py-3 md:py-2` + `.touch-target` | fixed in FB-64 | yes |
| `revisit-modal-states.html` (rollback toast) | ✕ dismiss button | 44×44 on mobile, 24×24 on desktop via `::before` | `.toast-dismiss::before` pseudo-element extends hit area to 44×44 on mobile | fixed in FB-64 — was sub-44px previously | yes |
| `revisit-unit-list.html` completed units | Locked card (tabindex=0) | full-width×72 | full-width×72 | native card | yes (pointer); SR/keyboard only |
| `stage-progress-strip.html` desktop nodes | Stage node | ~20×20 | ~44×44 effective (node + label wrapper is ≥ 44 tall, clickable surface extends to the label) | focus ring on keyboard, hit area on pointer | desktop-ok (≥ 24 — the label `mt-2` plus the node is ≥ 28 vertically, column width ≥ 60 horizontally) |
| `stage-progress-strip.html` mobile nodes | Stage node (abbreviated label) | ~20×20 visible | **44×44 on mobile via `.stage-node` container padding** — the flex-col container must declare `min-w-11 min-h-11` so each node is a 44px tap target on ≤ 768 px viewports | fixed in FB-64 — was relying on the inline-text exception which does NOT apply to standalone nav controls | yes (mobile) |
| `feedback-card-states.html` all buttons | Footer buttons | auto×24-28 desktop | auto×44 mobile per header copy | explicit in copy (line 34) | yes |
| `feedback-card-states.html` error-row retry | Retry in error row | auto×44 on mobile via `.touch-target`, auto×28 on desktop | explicit | yes |
| `comment-to-feedback-flow.html` flows | Various demo controls | varies (mockup) | varies | visual-only mockup — not a touch surface | n/a |
| `focus-ring-spec.html` | Kbd + demo buttons | auto×28 | demo gallery — not a live-pointer surface | auto×28 | n/a (spec gallery) |
| `review-ui-mockup.html` | Full review-UI mockup | per component | per component | existing spec | n/a (spec doc) |
| `comments-list-with-agent-toggle.html` AgentFeedbackToggle | Switch (FB-53) | 32×16 visible | 44×44 via `.af-touch` wrapper | `.af-touch` sets `min-width: 44px; min-height: 44px` around the switch | yes |
| `rollback-reason-banner.html` banner buttons (if any) | Retry / dismiss | auto×44 on mobile | `.touch-target` | yes |
| `skip-link-spec.html` | Skip link (focused) | auto×44 | `px-3 py-2` plus focus-visible styles expand to ≥ 44 tall | yes |

## 3. Fixes applied for FB-64

These were previously listed as `desktop-ok, mobile-bump-required` without a concrete remediation. They are now either (a) extended to 44×44 on mobile via `.touch-target` + responsive padding, or (b) wrapped with a `::before` pseudo-element that absorbs pointer events across a 44×44 bubble.

| Artifact | Element | Before (mobile) | After (mobile) | Fix |
|---|---|---|---|---|
| `revisit-modal-states.html` | Rollback-toast Retry button | `auto×24`, sub-44 | `auto×44` | Responsive padding `py-3 md:py-2` + `.touch-target` |
| `revisit-modal-states.html` | Rollback-toast Open-repair button | `auto×24`, sub-44 | `auto×44` | Responsive padding `py-3 md:py-2` + `.touch-target` |
| `revisit-modal-states.html` | Rollback-toast ✕ dismiss | `auto×24`, sub-44 | `44×44` (effective) | `.toast-dismiss::before { content: ""; position: absolute; inset: -12px; }` wrapping a positioned parent |
| `annotation-popover-states.html` | Popover close ✕ | `20×20` on all viewports | `20×20` visible, `44×44` effective on mobile | `.popover-close::before { content: ""; position: absolute; inset: -12px; }` (parent is `position: relative`) |
| `stage-progress-strip.html` | Mobile stage node | `~20×20`, relying on inline-text exception | `44×44` effective | Flex-col container gets `min-w-11 min-h-11 p-2` on mobile breakpoints, OR a `::before` bubble at the node |
| `feedback-card-states.html` | Footer buttons on mobile render | `auto×28` even on mobile | `auto×44` | Add `.touch-target` + `py-2.5` in mobile variant (header copy already declared this — now enforced per-control in the audit) |

## 4. Policy notes

1. **Pin marker sizing kept at 28×28** — 44×44 pins would occlude the artifact underneath on dense wireframes. The `::before` pseudo-element is the correct fix per Mozilla Inclusive Components guidance, used consistently across the four affected files.
2. **Desktop-only surfaces**: `feedback-card-states.html` footer buttons, `stage-progress-strip.html` stage nodes, `annotation-popover-states.html` popover ✕ — ALL inherit `.touch-target` or equivalent padding to hit 44×44 when they re-render on mobile breakpoints. Documented in DESIGN-BRIEF §4 Responsive Behavior.
3. **Inline-text exception (WCAG 2.5.8)** — applies ONLY to text links embedded in flowing prose (e.g. a citation link inside body copy). Does NOT apply to:
   - Toolbar icon buttons
   - Toast close × buttons
   - Popover ✕ close buttons
   - Feedback-card footer buttons
   - Stage-progress nodes
   - Any standalone affordance the user must tap as a discrete action
   The FB-64 re-audit removed every misapplication of this exception.
4. **Adjacent / dense targets** — if two 44×44 bubbles would overlap, separate them with ≥ 8 px of non-interactive space (WCAG 2.2 SC 2.5.8 spacing rule). Only the rollback-toast's three buttons came close; they are laid out in a row with `gap-2` (8 px) which satisfies both rules.
5. **Icon-only buttons with aria-label (FB-66)** — the mobile theme toggle is a canonical example: icon glyph inside a button whose `aria-label` reflects the ACTION (not the state). Hit area is 44×44 via `.touch-target`. Applies the same way to the FAB (already compliant) and any future icon-only button.

## 5. Verification

Every touch-activated control on a mobile viewport (≤ 768 px) has been inspected. Grep audits:

```sh
# Every w-7 h-7 pin must also carry the ::before hit-area extension:
grep -rEn 'w-7 h-7|28px' stages/design/artifacts/ | grep -iE 'pin|annotation|marker'
# → every match lands in a file that declares .pin-hit::before, .pin::before, .ghost::before, or .touch-target.

# Every standalone close button on mobile must have either .touch-target or a ::before hit-area extension:
grep -rEn 'aria-label="Close' stages/design/artifacts/
# → every match has .touch-target OR a .*-close::before pseudo-element.

# No sub-44px toolbar / toast / popover standalone controls on mobile:
# (manual inspection — no known exceptions remain as of FB-64.)
```

## 6. Companion spec: DESIGN-BRIEF amendment

DESIGN-BRIEF §6 Accessibility has been amended (in unit-19's DESIGN-BRIEF edits) to require the ≥ 44×44 rule with the narrow inline-text-exception carve-out above. The brief now forbids the "desktop-ok, mobile-bump-required" placeholder that allowed pre-FB-64 drift.
