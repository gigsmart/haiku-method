# Design Tokens — Autonomous Report-to-Fix

This document defines the named design token set for the `autonomous-report-to-fix` intent. It extends the existing H·AI·K·U website design system (Tailwind v4, `website/app/globals.css`) with tokens specific to the new surfaces: the `/report/[id]` auth landing page and any status/feedback UI the report loop exposes.

All downstream stages must reference token names from this document rather than raw values. Where a Tailwind utility class is the canonical expression of a token (e.g. `bg-teal-600`), this document maps it to a semantic alias so the intent's design language is unambiguous.

---

## Color Tokens

The existing palette is Stone (neutral), Teal (brand/primary), Indigo (secondary/execution), Amber (warning/operation), and Rose (error/reflection). These are defined in `website/app/globals.css` under `@theme`.

### Brand / Primary

| Token | Tailwind alias | Raw value | Usage |
|---|---|---|---|
| `color-brand` | `teal-600` | `#0d9488` | Primary actions, links, CTAs |
| `color-brand-hover` | `teal-700` | `#0f766e` | Hover state on brand elements |
| `color-brand-subtle` | `teal-50` | `#f0fdfa` | Brand-tinted backgrounds (light mode) |
| `color-brand-subtle-dark` | `teal-950/30` | `rgba(4,47,46,0.30)` | Brand-tinted backgrounds (dark mode) |
| `color-brand-border` | `teal-200` | `#99f6e4` | Borders on brand-tinted cards |
| `color-brand-border-dark` | `teal-800` | `#115e59` | Borders on brand-tinted cards (dark mode) |
| `color-brand-muted` | `teal-400` | `#2dd4bf` | Muted text links (dark mode) |
| `color-brand-muted-hover` | `teal-300` | `#5eead4` | Hover on muted text links (dark mode) |
| `color-brand-icon` | `teal-600` | `#0d9488` | Icon fill on light backgrounds |
| `color-brand-icon-dark` | `teal-400` | `#2dd4bf` | Icon fill on dark backgrounds |

### Neutral / Surface

| Token | Tailwind alias | Raw value | Usage |
|---|---|---|---|
| `color-surface` | `white` | `#ffffff` | Page background (light mode) |
| `color-surface-dark` | `stone-950` | `#0c0a09` | Page background (dark mode) |
| `color-surface-raised` | `stone-50` | `#fafaf9` | Raised card / section background (light) |
| `color-surface-raised-dark` | `stone-900/50` | `rgba(28,25,23,0.50)` | Raised card / section background (dark) |
| `color-surface-overlay` | `stone-100` | `#f5f5f4` | Code inline backgrounds, hover highlights (light) |
| `color-surface-overlay-dark` | `stone-800` | `#292524` | Code inline backgrounds, hover highlights (dark) |
| `color-border` | `stone-200` | `#e7e5e4` | Default borders (light mode) |
| `color-border-dark` | `stone-800` | `#292524` | Default borders (dark mode) |
| `color-border-subtle` | `stone-300` | `#d6d3d1` | Subtle / secondary borders (light) |
| `color-border-subtle-dark` | `stone-700` | `#44403c` | Subtle / secondary borders (dark) |

### Text

| Token | Tailwind alias | Raw value | Usage |
|---|---|---|---|
| `color-text-primary` | `stone-900` | `#1c1917` | Primary body text (light mode) |
| `color-text-primary-dark` | `stone-100` | `#f5f5f4` | Primary body text (dark mode) |
| `color-text-secondary` | `stone-600` | `#57534e` | Secondary / descriptive text (light) |
| `color-text-secondary-dark` | `stone-400` | `#a8a29e` | Secondary / descriptive text (dark) |
| `color-text-muted` | `stone-500` | `#78716c` | Muted / hint text (light) |
| `color-text-muted-dark` | `stone-400` | `#a8a29e` | Muted / hint text (dark) |
| `color-text-faint` | `stone-400` | `#a8a29e` | Timestamps, labels, captions (light) |
| `color-text-faint-dark` | `stone-500` | `#78716c` | Timestamps, labels, captions (dark) |
| `color-text-inverted` | `white` | `#ffffff` | Text on dark/brand backgrounds |
| `color-text-link` | `teal-600` | `#0d9488` | Inline links (light) |
| `color-text-link-dark` | `teal-400` | `#2dd4bf` | Inline links (dark) |

### Semantic — Status (for the report loop)

The report loop surfaces fix status: pending, in-progress, CI green, CI failed, review needed. These tokens cover the status badge palette.

| Token | Tailwind alias | Raw value | Usage |
|---|---|---|---|
| `color-status-success` | `teal-600` | `#0d9488` | CI green, fix complete |
| `color-status-success-surface` | `teal-50` | `#f0fdfa` | Badge background for success (light) |
| `color-status-success-surface-dark` | `teal-950/30` | `rgba(4,47,46,0.30)` | Badge background for success (dark) |
| `color-status-warning` | `amber-600` | `#d97706` | Review needed, pending merge |
| `color-status-warning-surface` | `amber-50` | `#fffbeb` | Badge background for warning (light) |
| `color-status-warning-surface-dark` | `amber-950/30` | `rgba(26,22,0,0.30)` | Badge background for warning (dark) |
| `color-status-error` | `rose-600` | `#e11d48` | CI failing, fix failed |
| `color-status-error-surface` | `rose-50` | `#fff1f2` | Badge background for error (light) |
| `color-status-error-surface-dark` | `rose-950/30` | `rgba(43,4,13,0.30)` | Badge background for error (dark) |
| `color-status-neutral` | `stone-500` | `#78716c` | Queued / unknown status |
| `color-status-neutral-surface` | `stone-100` | `#f5f5f4` | Badge background for neutral (light) |
| `color-status-neutral-surface-dark` | `stone-800` | `#292524` | Badge background for neutral (dark) |
| `color-status-info` | `indigo-600` | `#4f46e5` | In-progress fix, agent running |
| `color-status-info-surface` | `indigo-50` | `#eef2ff` | Badge background for info (light) |
| `color-status-info-surface-dark` | `indigo-950/30` | `rgba(9,8,39,0.30)` | Badge background for info (dark) |

### OAuth / Auth surface (for `/report/[id]`)

The auth landing page needs a trust/permission affordance. Use the brand palette — no new colors needed. The GitHub OAuth button uses the existing surface tokens plus `color-brand`.

---

## Spacing Scale

The codebase uses Tailwind's default 4px base unit. These tokens name the scale steps used consistently across the website.

| Token | Value | Tailwind class | Typical usage |
|---|---|---|---|
| `space-1` | 4px | `p-1`, `gap-1` | Tight icon/badge padding |
| `space-2` | 8px | `p-2`, `gap-2` | Small padding, icon buttons |
| `space-3` | 12px | `p-3`, `gap-3` | Compact card padding, small inline gap |
| `space-4` | 16px | `p-4`, `gap-4` | Standard card/section padding, grid gap |
| `space-5` | 20px | `p-5`, `gap-5` | Card padding for larger cards |
| `space-6` | 24px | `p-6`, `gap-6` | Generous card padding, section internal spacing |
| `space-8` | 32px | `p-8`, `gap-8` | Section-level gaps, grid gaps |
| `space-12` | 48px | `py-12` | Footer internal vertical padding |
| `space-16` | 64px | `py-16` | Section vertical padding (standard) |
| `space-20` | 80px | `py-20` | Hero vertical padding (mobile) |
| `space-32` | 128px | `sm:py-32` | Hero vertical padding (desktop) |

### Max-width containers

| Token | Tailwind class | Usage |
|---|---|---|
| `container-narrow` | `max-w-3xl` | Centered hero / prose |
| `container-standard` | `max-w-5xl` | Main content sections |
| `container-wide` | `max-w-6xl` | Full-width nav / footer |

---

## Typography Scale

Font family is Inter (sans-serif) loaded via `@theme --font-sans` in `globals.css`. Monospace uses the system stack `--font-mono`. No custom font loading via `next/font`; Inter is loaded via `<head>` or as a system fallback.

### Font Families

| Token | CSS variable | Stack |
|---|---|---|
| `font-sans` | `--font-sans` | `"Inter", ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"` |
| `font-mono` | `--font-mono` | `ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace` |

### Sizes

| Token | Tailwind class | px (approx) | Usage |
|---|---|---|---|
| `text-caption` | `text-xs` | 12px | Labels, timestamps, metadata, category overlines |
| `text-body-sm` | `text-sm` | 14px | Card body copy, list items, secondary text |
| `text-body` | `text-base` | 16px | Standard body; card titles at smaller scales |
| `text-body-lg` | `text-lg` | 18px | Hero subheading, intro paragraphs |
| `text-heading-sm` | `text-2xl` | 24px | Sub-section headings, "Latest Updates" |
| `text-heading` | `text-3xl` | 30px | Section headings, H2 |
| `text-heading-lg` | `text-5xl` | 48px | Hero H1 (mobile) |
| `text-heading-xl` | `text-6xl` | 60px | Hero H1 (desktop / sm:) |

### Weights

| Token | Tailwind class | Usage |
|---|---|---|
| `font-weight-normal` | `font-normal` | Body text |
| `font-weight-medium` | `font-medium` | CTA labels, nav links, emphasis without bold |
| `font-weight-semibold` | `font-semibold` | Card titles, sub-headings, table headers |
| `font-weight-bold` | `font-bold` | Page headings, section headings |

### Tracking

| Token | Tailwind class | Usage |
|---|---|---|
| `tracking-tight` | `tracking-tight` | Large headings (H1, hero) |
| `tracking-wider` | `tracking-wider` | Category overlines (`uppercase text-xs font-semibold`) |

### Line Heights (implicit via Tailwind defaults)

Tailwind sets line-height by font-size step. No overrides are in use; prose uses the `@tailwindcss/typography` defaults which apply appropriate leading automatically.

---

## Border Radii

| Token | Tailwind class | px | Usage |
|---|---|---|---|
| `radius-sm` | `rounded` | 4px | Inline code badges, small pill decorations |
| `radius-md` | `rounded-lg` | 8px | Buttons, text inputs, standard cards, nav items |
| `radius-lg` | `rounded-xl` | 12px | Feature cards, phase cards, studio cards, blog post cards |
| `radius-pill` | `rounded-full` | 9999px | Status badges, avatar indicators, small circular elements |
| `radius-circle` | `rounded-full` (on square element) | — | Icons in square containers (circle crop) |

---

## Shadow Definitions

The codebase uses Tailwind's preset shadow scale. No custom shadow values are defined in `globals.css`.

| Token | Tailwind class | Usage |
|---|---|---|
| `shadow-none` | (no class) | Default resting state on cards |
| `shadow-sm` | `shadow-sm` | Subtle lift; code window chrome |
| `shadow-md` | `shadow-md` / `hover:shadow-md` | Card hover state — the standard interactive lift |
| `shadow-xl` | `shadow-xl` | Code blocks, modals, elevated overlays |

### Elevation pattern

Cards are flat by default (`shadow-none`) and lift to `shadow-md` on hover. This is the single consistent interactive affordance across the site:

```
className="... transition hover:shadow-md"
```

No `shadow-lg` or `shadow-2xl` usage observed in the existing UI. Stick to `shadow-sm`, `shadow-md`, `shadow-xl`.

---

## Animation and Transition Values

### Standard transition

All interactive elements use Tailwind's `transition` utility (applies `transition-property: color, background-color, border-color, text-decoration-color, fill, stroke, opacity, box-shadow, transform, filter, backdrop-filter; transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1); transition-duration: 150ms`).

| Token | Tailwind class | Usage |
|---|---|---|
| `transition-base` | `transition` | Links, buttons, cards — the default |

No custom `duration-` or `ease-` overrides are in use. Duration is Tailwind's default 150ms with ease-in-out.

### Named keyframe animations (from `globals.css`)

These are defined in `globals.css` for demo/marketing components only. The report loop surfaces should not reuse them; they are intentionally scoped to demo sequences.

| Name | Keyframe | Usage |
|---|---|---|
| `demo-fadeSlideIn` | opacity 0→1, translateY 6px→0 | Demo message appearance |
| `demo-typingDot` | opacity + scale pulse | Typing indicator dots |
| `demo-pulse` | opacity 0.7→1 | Fire-and-forget pulse indicator |
| `demo-highlightFade` | teal glow → stone color | Highlight then fade |
| `demo-stageFlash` | teal box-shadow bloom | Stage transition flash |
| `demo-cursorBlink` | opacity 1→0 | Cursor blink |

### Utility classes for animations

| Class | Animation | Usage |
|---|---|---|
| `.demo-animate-in` | `demo-fadeSlideIn` 0.3s ease | Animate element into view |
| `.demo-typing-dot` | `demo-typingDot` 0.8s infinite | Typing indicator |
| `.demo-ff-pulse` | `demo-pulse` 1.5s ease-in-out infinite | Persistent pulse (fire-and-forget state) |
| `.demo-stage-flash` | `demo-stageFlash` 0.6s ease | Stage advancement flash |
| `.demo-highlight-glow` | `demo-highlightFade` 2s ease forwards | Highlight-then-fade on updated text |

**Note for the report loop UI:** The `/report/[id]` page may adopt `demo-ff-pulse` semantics (a gentle pulse on the "agent is running" indicator) since the intent is fire-and-forget. If so, extract the keyframe to a non-demo name to avoid coupling to demo context.

---

## Focus and Selection

| Token | CSS | Usage |
|---|---|---|
| `focus-ring` | `outline-2 outline-offset-2 outline-teal-500` (`:focus-visible`) | All keyboard-focusable interactive elements |
| `selection-bg` | `bg-teal-100` (light) / `bg-teal-900` (dark) | Text selection highlight |
| `selection-text` | `text-teal-900` (light) / `text-teal-100` (dark) | Text selection foreground |

---

## Dark Mode Strategy

Dark mode is class-based via `next-themes`. The `html.dark` class is added by `ThemeProvider`. Tailwind's `dark:` variant is used throughout — no CSS custom property flipping.

Every token above has a `dark:` counterpart. The pattern is always:

```
className="text-stone-600 dark:text-stone-400"
className="bg-stone-50 dark:bg-stone-900/50"
className="border-stone-200 dark:border-stone-800"
```

Downstream stages must always pair light and dark variants. Never set a color without its dark counterpart.

---

## Token Usage Examples

### Primary button

```
bg-teal-600 text-white hover:bg-teal-700 transition rounded-lg px-6 py-3 font-medium
```

Tokens: `color-brand`, `color-text-inverted`, `color-brand-hover`, `transition-base`, `radius-md`, `space-6`/`space-3`, `font-weight-medium`

### Secondary / outline button

```
border border-stone-300 text-stone-700 hover:bg-stone-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-900 transition rounded-lg px-6 py-3 font-medium
```

### Feature card (interactive)

```
rounded-xl border border-stone-200 p-6 transition hover:border-teal-300 hover:shadow-md dark:border-stone-800 dark:hover:border-teal-700
```

Tokens: `radius-lg`, `color-border`, `space-6`, `transition-base`, `color-brand-border` (hover), `shadow-md` (hover)

### Status badge (success)

```
rounded-full px-2 py-0.5 text-xs font-semibold bg-teal-50 text-teal-700 dark:bg-teal-950/30 dark:text-teal-300
```

Tokens: `radius-pill`, `space-2`/`space-1`, `text-caption`, `font-weight-semibold`, `color-status-success-surface`, `color-status-success`

### `/report/[id]` auth landing page context

This page needs:
- A centered narrow container (`container-narrow`)
- A card to hold the OAuth grant CTA (`radius-lg`, `color-surface-raised`, `color-border`)
- Status indicator for the fix-loop state (semantic status tokens above)
- A primary CTA for the GitHub OAuth redirect (`color-brand` button)
- A muted "what happens next" description (`color-text-secondary`)

No net-new tokens are required for this surface. The existing palette covers all cases.

---

## Gaps and Constraints

- **No icon system token.** The codebase uses inline SVGs with `h-5 w-5` / `h-6 w-6` sizing. If the report loop needs status icons, use the same pattern — no icon library tokens to define.
- **No motion preference token.** `prefers-reduced-motion` is not addressed in `globals.css`. Downstream stages should note that any animation on the `/report/[id]` page should respect this media query.
- **Auth/OAuth button.** GitHub's brand button pattern (black background, white Octocat) is outside the H·AI·K·U token set. The auth page should render it as a distinct third-party affordance, not styled with H·AI·K·U tokens. Treat it as a boundary.
- **Inter font loading.** Inter is declared in `--font-sans` but not loaded via `next/font`. If the `/report/[id]` page is a standalone Next.js route under the same app, it inherits the font stack automatically. No additional token work needed.
