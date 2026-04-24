# Browser Support — haiku-ui

## Native `<dialog>` element — required

The review app uses the native HTML `<dialog>` element for modal surfaces
(`FeedbackSheet`, downstream revisit modal, annotation popover) and requires
browser support for it. No polyfill is bundled.

### Minimum versions

- Chrome / Edge / any Chromium browser: **≥ 37** (2014)
- Firefox: **≥ 98** (2022-03)
- Safari: **≥ 15.4** (2022-03, macOS 12.3 / iOS 15.4)

All evergreen browsers support the element. Pre-2022 Safari / Firefox builds
are outside the support matrix for this app.

### Rationale

- Native `<dialog>` handles focus trap, top-layer, backdrop, and background
  inert at the platform level. Polyfills (`dialog-polyfill`) implement these
  in JavaScript and drag in a tab-order enumerator that diverges from the
  platform in edge cases (shadow DOM, contenteditable).
- Bundling a polyfill adds ~8 KB for a degraded experience in a browser tier
  the app does not target.
- `unit-10-feedback-sheet-mobile` tactical plan documents this decision; see
  `stages/development/artifacts/unit-10-tactical-plan.md` (Risks §1–§2).

### Divergence from `DESIGN-BRIEF.md §6 line 838`

`DESIGN-BRIEF.md` names `focus-trap-react` as the canonical focus-trap
library. `unit-10` diverges: the native `<dialog>` element handles focus
trap via its top-layer semantics, so `focus-trap-react` is not installed or
imported. The a11y foundation's `useFocusTrap` hook (`src/a11y/focus.ts`) is
used as a belt-and-suspenders guard for jsdom tests and any future
edge-case contexts (iframe-inside-dialog, shadow-DOM tabbable discovery).

When `DESIGN-BRIEF.md` is next updated, revise §6 to name native `<dialog>`
plus `useFocusTrap` as the canonical pair.

### jsdom test caveats

`jsdom` (version used by `vitest`) ships partial support for
`HTMLDialogElement`:

- `open` attribute/property, `show()`, `close()` exist.
- `showModal()`, the top-layer, and platform-enforced focus trap and
  background `inert` are **not** implemented.

The `FeedbackSheet` test harness polyfills `showModal` / `close` with a
minimal shim and uses `useFocusTrap` to emulate the Tab-wrap behavior that
native top-layer gives in real browsers. Production bundles never hit the
shim — it is scoped to `*.test.tsx` setup.
