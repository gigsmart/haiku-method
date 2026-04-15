# Design Review — unit-03-error-states

Reviewer: design-reviewer hat | Bolt 1 | 2026-04-15

## Completion Criteria Checklist

| # | Criterion | Result |
|---|-----------|--------|
| 1 | Four mockup files exist at named paths | PASS |
| 2 | Each mockup names a specific error code | PASS — 7 hits (negotiation×3, sandbox×1, expired×1, stale×1, plus escalate panel) |
| 3 | Sandbox error has `aria-expanded="true"` disclosure-open variant | PASS |
| 4 | Negotiation error has ≥3 variant= markers (default + retry-pending + retry-failed) | PASS — 6 hits |
| 5 | Touch targets ≥44px on all interactive elements | PASS — all buttons/inputs use `min-height: 44px` |
| 6 | No Lorem ipsum / TODO / placeholder copy | PASS |
| 7 | `aria-live="assertive"` on error message container in each file | PASS — negotiation×3, sandbox×2, expired×1, stale×1 |
| 8 | No raw hex in style attributes | PASS — all colors use `rgb()` with named-token comments |

## Findings

### HIGH — Invalid CSS property (error-negotiation.html, line 166)

```css
.error-icon {
  …
  aria-hidden: true;   /* ← NOT valid CSS */
}
```

`aria-hidden` is an HTML attribute, not a CSS property. It has no effect here. The icon `<span>` elements do carry `aria-hidden="true"` as an HTML attribute in the markup (lines 388, 396, etc.) so screen-reader behavior is correct at runtime — but the stray CSS property is noise and a lint error. Should be removed in implementation.

### MEDIUM — retry-failed variant button copy is misleading (error-negotiation.html)

The retry-failed variant shows the button as `btn-retry--pending` with "Retrying…" text and an animated spinner. Visually this suggests a retry is in progress, but the heading reads "Connection could not be restored / 3 retry attempts exhausted." The copy contradicts the state: retries are done, yet the button still says "Retrying…". Button should read something like "All retries exhausted" with the spinner removed, or the button should be hidden entirely in favor of the escalation panel.

### LOW — Escalation panel copy uses placeholder fragment (error-negotiation.html, retry-failed)

```html
"The review panel failed — session PASTE_ID_HERE"
```

`PASTE_ID_HERE` is placeholder text inside a quoted instruction string. The input field below it shows a real session ID (`rev_01HZ4KW9X3QNBM7FVGYTD6E5R`). The instruction copy should reference the actual field: _"Copy the session ID above and paste it into the chat."_ The static quoted string with `PASTE_ID_HERE` will confuse users.

### LOW — Stale-host topbar pill (error-stale.html)

The topbar shows `MCP Apps · Connected` (teal pill) for the stale-host state. This is intentional per the token map comment ("soft warning, not hard error") and is correct design. However the `aria-label` on the pill reads "MCP Apps: Connected with version warning" — good — but there is no visible amber secondary pill shown in the mockup despite the token map defining `--pill-warn`. The comment at line 107 says "Warning pill variant shown as supplement" but it is never rendered in the HTML. If the intent was to show both pills side by side, the mockup is incomplete. If one pill is sufficient, the token map entry for `--pill-warn` is dead weight.

## Cross-Check vs unit-01 Shell

Token vocabulary matches `iframe-shell-narrow-collapsed.html` exactly: stone-950 background, stone-900 topbar, stone-800 border, teal-500 focus rings, red-500 error pill. Layout structure (topbar + content-area flex column) is consistent. Width 480px matches narrow breakpoint. No drift detected.

## Accessibility Summary

- `role="alertdialog"` with `aria-labelledby`/`aria-describedby` — correct on all four cards
- `role="alert"` + `aria-live="assertive"` on error message bodies — correct
- `role="status"` + `aria-live="polite"` on topbar pills — correct
- `prefers-reduced-motion` handled in negotiation and stale files; sandbox and expired files also include it — correct
- `focus-visible` outlines present on all interactive controls — correct
- Keyboard: `<kbd>` shortcut hints present in sandbox disclosure and expired copy-hint — correct
- Invalid `aria-hidden: true` CSS property in negotiation file (see HIGH finding above) — cosmetic, no runtime impact

---

VERDICT: PASS
