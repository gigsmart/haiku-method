# Design Brief: OAuth Login

## Layout

Full-page login with centered card (max-width 420px). Background uses the app's neutral tone (`--color-bg-surface`). Card has subtle shadow and rounded corners.

### Desktop (1280px+)

- Card centered both vertically and horizontally
- App logo: 48px height, centered above card
- Card padding: 40px
- Social buttons: full-width, 48px height, 12px gap between them
- Forgot password link: centered below buttons, 14px text

### Tablet (768px)

- Same as desktop, card max-width reduces to 380px
- Card padding: 32px

### Mobile (375px)

- Card fills width with 16px horizontal margin
- Card padding: 24px
- Social buttons: 44px min height (touch target)
- Logo: 36px height

## Social Buttons

Each button has the provider's logo on the left and "Sign in with {Provider}" text.

| State | Google | GitHub |
|-------|--------|--------|
| Default | White bg, dark border, dark text | Dark bg (#24292e), white text |
| Hover | Light gray bg (#f8f9fa) | Slightly lighter (#2f363d) |
| Focus | Blue outline ring (2px offset) | Blue outline ring (2px offset) |
| Active | Pressed shadow (inset) | Pressed shadow (inset) |
| Loading | Spinner replaces logo, text "Connecting..." | Same |
| Disabled | 50% opacity, no pointer events | Same |

## Design Tokens

```css
--login-card-max-width: 420px;
--login-card-padding: 40px;
--login-card-radius: 12px;
--login-card-shadow: 0 4px 24px rgba(0, 0, 0, 0.08);
--login-btn-height: 48px;
--login-btn-radius: 8px;
--login-btn-gap: 12px;
--login-link-size: 14px;
--login-logo-height: 48px;
```

## Accessibility

- All interactive elements have visible focus indicators
- Color contrast: AA compliant (verified against both light and dark themes)
- Screen reader: buttons have `aria-label="Sign in with Google"` etc.
- Loading state: `aria-busy="true"` on the button, `aria-live="polite"` on status region
- Error messages: linked via `aria-describedby` to the relevant form region
