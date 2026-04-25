# Motion & Reduced-Motion Spec (FB-20)

Closes **FB-20**. Enumerates every `@keyframes` declaration across `DESIGN-BRIEF.md §7` and the artifacts in `stages/design/artifacts/`, and spells out the `@media (prefers-reduced-motion: reduce)` fallback for each.

## Rule (RFC 2119)

Every animation in the review app **MUST** have a sibling `@media (prefers-reduced-motion: reduce)` rule that either:

1. Sets `animation: none` (animation is cosmetic — drop it entirely); or
2. Sets a static end-state equivalent (the animation communicates information — preserve the final-frame cue via color/border/opacity without the motion).

Transitions that convey state change **SHOULD** use option 2 so the user who opted out of motion still gets the state-change signal.

WCAG reference: **2.3.3 Animation from Interactions (AAA)** and **2.2.2 Pause, Stop, Hide (A)**.

## Audit table

| File | `@keyframes` | Duration / cadence | Reduced-motion fallback | Rationale |
|---|---|---|---|---|
| `DESIGN-BRIEF.md §7` | `feedback-pulse` | 2s · 3 iterations | `animation: none` (documented via amber badge count as the alternative signal) | Pulse is a "new-item" cue; the amber badge count already communicates "unread > 0" |
| `feedback-inline-mobile.html:22-24` | `sheet-up` | 0.3s ease-out (open) | `animation: none` — sheet appears in-place; focus move + `aria-live` announce state change | Sheet open is a location change, not decoration; announcement covers SR users |
| `feedback-inline-mobile.html:31-34` | `feedback-pulse` | 2s ease-in-out · 3 iterations | `animation: none` — count badge remains | Matches DESIGN-BRIEF §7 |
| `feedback-inline-desktop.html:18-25` | `feedback-status-change` | 0.4s ease-in-out | `animation: none` — card border / color still changes (static final state) | Status change is communicated by the badge + border, not the flash |
| `feedback-inline-desktop.html:46-50` | `review-pulse` | 0.6s ease-in-out · 2 iterations | `animation: none` — focus ring + scroll-into-view still fire | Scroll target is what matters; the pulse is decoration |
| `annotation-gesture-spec.html:34-38` | `pop-in` | 140ms ease-out (popover entrance) | `animation: none` — popover appears in-place, focus moves to the first field | Focus move signals "here it is"; slide is redundant |
| `comment-to-feedback-flow.html:18-25` | `feedback-status-change` | 0.4s ease-in-out | `animation: none` | Same as desktop; static end-state preserved |
| `comment-to-feedback-flow.html:64-70` | `save-pulse` | 1.2s ease-in-out · infinite | `animation: none; opacity: 0.7;` — static low-opacity placeholder | Pulse signifies "in flight"; `aria-busy` + spinner-replacement dot covers SR |
| `comment-to-feedback-flow.html:73-79` | `fade-out` | 0.3s ease-out forwards | `animation: none; opacity: 0;` | Element goes away — static hide instead of fade |
| `comment-to-feedback-flow.html:82-88` | `slide-up` | 0.3s ease-out | `animation: none` | Sheet open; same rationale as mobile |
| `comment-to-feedback-flow.html:91-97` | `retry-spin` | 1s linear · infinite | `animation: none` — replaced by a static "↻" glyph in-situ | Spinner is decoration when paired with text label |
| `focus-ring-spec.html:49-53` | `fbFlash` | 1400ms cubic-bezier | Already guarded at lines 78-83 (`.fb-flash, .unit-flash { animation: none !important; transition: none !important; }`) | Focus ring remains static-visible per doc §5 |
| `focus-ring-spec.html:57-61` | `fbFlashDark` | 1400ms cubic-bezier | Same — lines 78-83 cover both light + dark | Same |
| `review-ui-mockup.html:1939-1943` | `fbFlash` | 1.4s ease-out | `animation: none` — border color remains static teal | Cross-highlight uses color as the primary signal |
| `revisit-modal-states.html:17-18` | `spin-slow` | 0.9s linear · infinite | `animation: none` — loading state uses a static `aria-busy` dot cluster | SR announcement + pointer-events:none on modal body already signal "in flight" |
| `revisit-modal-states.html` (new) `toast-in` | 180ms ease-out | `animation: none` — toast appears in place | `role="status" + aria-live="polite"` announces content; slide is decoration |

## Cross-file policy

- **Spinner replacement rule.** When a spinner is the sole loading signal, the reduced-motion fallback **MUST** add a visible text label (e.g. "Saving…") alongside a static dot cluster. Spinners alone violate 2.2.2 in reduced-motion mode because there is no non-animated signal.
- **Location / entrance animations.** Any animation that moves a surface into view (`sheet-up`, `slide-up`, `pop-in`, `toast-in`) **MUST** drop to `animation: none` and **MUST** pair with either a focus move or an `aria-live` region so the appearance is announced.
- **Status-change animations.** Any animation that communicates a state transition (`feedback-status-change`, `review-pulse`, `fbFlash`) **MUST** preserve the static end-state (border / background / outline) so the final visual cue remains. The animation is the decoration; the end state is the information.

## Verification

```sh
# Every @keyframes has a sibling prefers-reduced-motion block in the same file.
for f in stages/design/artifacts/*.html; do
  kf=$(grep -c '@keyframes' "$f")
  rm=$(grep -c 'prefers-reduced-motion' "$f")
  if [ "$kf" -gt 0 ] && [ "$rm" -eq 0 ]; then
    echo "MISS: $f has $kf keyframes but 0 reduced-motion guards"
    exit 1
  fi
done
echo "All animations have reduced-motion fallbacks."
```

## §10.audit — Stage-wide reduced-motion audit (canonical, FB-86, unit-25)

The Verification script above only catches `@keyframes` declarations. FB-86
found five artifacts that declared **transitions** (`transition-colors`,
`transition-transform`) and **Tailwind animation utilities**
(`animate-pulse`, `animate-spin`) with no `prefers-reduced-motion` guard —
the narrower script missed them. The audit below is the canonical one,
run stage-wide (every `.html` artifact, not just the FAB or per-unit inputs).

```sh
# Canonical stage-wide reduced-motion audit (unit-25, FB-86).
# Runs against every artifact — scope-widening mirrors the approach unit-21
# took for the contrast audit (audit the whole stage, not just the unit inputs).
# Expected output: empty. Any MISSING line is a failure.
for f in stages/design/artifacts/*.html; do
  anim=$(grep -cE '@keyframes|animation:|animate-pulse|animate-spin|transition-' "$f")
  guard=$(grep -cE 'prefers-reduced-motion' "$f")
  if [ "$anim" -gt 0 ] && [ "$guard" -eq 0 ]; then
    echo "MISSING: $f"
  fi
done
# empty output = pass
```

**Scope note.** This audit is run stage-wide, not per-artifact-input.
A unit that only declares five artifacts as `inputs:` in its frontmatter
still runs the audit across every artifact — because the reduced-motion
policy covers the whole stage, and a regression in an artifact the unit
did not name would still ship. FB-86 itself was the failure mode of the
narrower audit.

## §10.rule — Minimum-duration, not none

Reduced-motion guards MUST NOT eliminate essential transitions that
convey state. The canonical guard form is:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

The guard collapses durations to `0.01ms`, **not** `none` / `0` / `initial`,
so final positions still paint. This matters because several state cues in
the review app are communicated via CSS transitions:

- The FAB's `aria-expanded=true/false` toggle flips the chevron rotation
  (`transform: rotate(0) → rotate(180deg)`) via `transition-transform`.
  At `0.01ms` the rotation still lands on the final frame — under
  `none`, the browser would skip the transition but the transform
  would still apply, so this is belt-and-braces for authors who use
  `transition: all` on the element.
- The toggle thumb's `aria-checked=true/false` slides via
  `transition-transform translate-x-0 → translate-x-4`. At `0.01ms`
  the thumb still reaches the on-position.
- The sheet `hidden` class toggle (display / visibility) still paints
  in one frame; the visual hide is preserved.
- Optimistic-UI state changes (border-color, background-color) still
  show the final cue.

**Decorative animations** — the FAB pulse (`feedback-pulse`), the bottom-
sheet slide-in (`sheet-up`), toast slide-ins — SHOULD additionally carry
a per-component `animation: none` override inside the same `@media` block
(as `feedback-inline-mobile.html` does for `.feedback-fab-pulse` and
`.sheet-enter`). These carry no information the user needs; the amber
badge count, focus move, and `aria-live` announcement cover the signal.

**Rule summary.** Use `animation-duration: 0.01ms` / `transition-duration:
0.01ms` as the global default. Add per-component `animation: none` only
for animations whose *only* job is decoration — pulses, spinners, slide-
ins already paired with focus moves or `aria-live`. Never use `none` on
transitions that paint a state cue.

## Testing

1. macOS: `System Settings → Accessibility → Display → Reduce motion`.
2. iOS: `Settings → Accessibility → Motion → Reduce Motion`.
3. DevTools: Chrome/Edge `Rendering → Emulate CSS media feature prefers-reduced-motion: reduce`.
4. Per artifact, open in reduced-motion mode, trigger every state change listed in `state-coverage-grid.md`, verify no animation plays and the static cue (color / border / badge / label) remains legible.
5. Stage-wide: run the §10.audit script after any artifact edit; empty output = pass.
