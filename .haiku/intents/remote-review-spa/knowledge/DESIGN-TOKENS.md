# Design Tokens

## Colors (from website's Tailwind config)

### Neutral (Stone)
- `--bg-content`: #1c1917 (stone-900)
- `--bg-sidebar`: #0c0a09 (stone-950)
- `--bg-card`: #292524 (stone-800)
- `--border-subtle`: #292524 (stone-800)
- `--border-medium`: #44403c (stone-700)
- `--text-primary`: #e7e5e4 (stone-200)
- `--text-prose`: #d6d3d1 (stone-300)
- `--text-secondary`: #a8a29e (stone-400)
- `--text-muted`: #a8a29e (stone-400) — bumped from stone-500 for WCAG AA compliance
- `--text-faint`: #78716c (stone-500) — bumped from stone-600 for WCAG AA compliance; use only for decorative/non-essential text

### Accent: Review (Teal)
- `--accent-review`: #14b8a6 (teal-500)
- `--accent-review-bg`: #14b8a620 (teal-500/12%)
- `--accent-review-dark`: #042f2e (teal-950)

### Accent: Question (Amber)
- `--accent-question`: #f59e0b (amber-500)
- `--accent-question-bg`: #f59e0b20
- `--accent-question-dark`: #451a03 (amber-950)

### Accent: Direction (Indigo)
- `--accent-direction`: #6366f1 (indigo-500)
- `--accent-direction-bg`: #6366f120
- `--accent-direction-dark`: #1e1b4b (indigo-950)

### Status
- `--status-ok`: #14b8a6 (teal-500)
- `--status-error`: #dc2626 (red-600)
- `--status-error-text`: #fca5a5 (red-300)
- `--status-warning`: #fbbf24 (yellow-400)
- `--status-pending`: #44403c (stone-700)

### Comment
- `--comment-border`: #f59e0b40 (amber-500/25%)
- `--comment-author`: #fbbf24 (yellow-400)

## Typography
- Font family: Inter, system-ui, -apple-system, sans-serif
- Brand: 18px, weight 700, letter-spacing 0.05em
- Section label: 11px, uppercase, letter-spacing 0.1em
- Section title: 14px, weight 600, uppercase, letter-spacing 0.05em
- Prose: 15px, line-height 1.7
- Body: 14px, line-height 1.6
- Meta: 13px
- Small: 12px
- Micro: 11px

## Spacing
- Sidebar expanded width: 280px
- Sidebar collapsed width: 64px
- Content padding: 40px 48px
- Card padding: 16px-24px
- Section gap: 24px-32px
- Step gap: 12px

## Radii
- Card: 12px
- Button: 8px
- Badge: 12px (pill)
- Step icon: 50% (circle)
- Collapse button: 6px

## Sizing
- Step icon: 24px diameter
- Progress dot: 12px diameter
- Status dot: 6-8px diameter
- Comment textarea min-height: 60px
- Mobile top bar height: ~36px

## Touch Targets
- All interactive elements: minimum 44px touch target (padding to expand if visual size is smaller)
- Step icons: 24px visual, 44px tap area
- Progress dots: 12px visual, 44px tap area
- Sidebar collapse toggle: 24px visual, 44px tap area
- Mobile status dots: 6px visual, decorative only (not tappable)

## Interactive States
- Approve button: bg accent, color accent-dark, weight 600
  - hover: brightness(1.1)
  - focus: outline 2px solid accent, offset 2px
  - active: brightness(0.9)
  - disabled: opacity 0.5, cursor not-allowed
- Request Changes button: transparent bg, border red-600, text red-300
  - hover: bg red-600/10%
  - focus: outline 2px solid red-600, offset 2px
  - active: bg red-600/20%
- Comment textarea:
  - focus: border accent, outline none
- Back/Next buttons:
  - hover: bg stone-800
  - focus: outline 2px solid accent, offset 2px
- Secondary action: opacity 0.6
- Reconnecting: pulsing dot animation, amber accent
- Dimmed content (reconnecting): opacity 0.6

## Accessibility
- Status conveyed by color + icon (checkmark for done, number for pending, X for error)
- Progress dots supplemented with aria-label ("Step N of M, completed/current/upcoming")
- Sidebar collapse: aria-expanded attribute
- Focus indicators: 2px solid outline with 2px offset, using session accent color
- All images in annotation canvas: alt text required
