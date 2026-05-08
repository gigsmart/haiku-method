---
intent: autonomous-report-to-fix
created: 2026-05-08
stage: design
artifact: design-system-anchor
---

# Design System Anchor: Autonomous Report-to-Fix

Concrete design-system specs extracted from the project's source code. Every value is cited to its source file and line number. Downstream hats (designer, design-reviewer) must use these values — not guesses.

---

## 1. Atoms

The haikumethod.ai website has no dedicated component library (no `atorasu/` directory). All UI is implemented directly in TSX files using Tailwind utility classes. Reusable atomic patterns are extracted from repeated usage across `website/app/`.

### Button — Primary (Filled)

Source: `website/app/page.tsx`, `website/app/browse/page.tsx`, `website/app/auth/[provider]/callback/CallbackClient.tsx`

- **height**: auto (content-driven via `py-3` = 12px top + 12px bottom + ~20px line-height ≈ 44px on text-sm/base)     # page.tsx:178
- **padding**: `px-6 py-3` = horizontal 24px, vertical 12px                                                               # page.tsx:178
- **border-radius**: `rounded-lg` = 8px                                                                                    # page.tsx:178
- **font-weight**: `font-medium`                                                                                            # page.tsx:178
- **default**: `bg-teal-600 text-white`                                                                                    # page.tsx:178
- **hover**: `hover:bg-teal-700`                                                                                            # page.tsx:178
- **transition**: `transition` (default 150ms ease)                                                                        # page.tsx:178
- **disabled**: `disabled:opacity-50` (seen in review/QuestionForm.tsx:232)                                                # QuestionForm.tsx:232
- **small variant**: `px-4 py-2 text-sm font-medium` (browse submit)                                                      # browse/page.tsx:321

States (canonical 8-state set):
- `default`: `bg-teal-600 text-white`
- `hover`: `bg-teal-700` (darker)
- `focus`: `focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600` # studios/[slug]/page.tsx:127
- `active`: no explicit active state — inherits transition
- `disabled`: `disabled:opacity-50 cursor-not-allowed` (implicit)
- `error`: N/A — error states use separate destructive button variant
- `loading`: text swap to "Submitting..." or "Loading..." — no spinner on primary CTA   # QuestionForm.tsx:235
- `empty`: N/A

### Button — Secondary (Outlined)

Source: `website/app/page.tsx`

- **padding**: `px-6 py-3`                                                                                                 # page.tsx:198
- **border-radius**: `rounded-lg` = 8px                                                                                    # page.tsx:198
- **font-weight**: `font-medium`                                                                                            # page.tsx:198
- **default**: `border border-stone-300 text-stone-700 bg-transparent`                                                    # page.tsx:198
- **hover**: `hover:bg-stone-50`                                                                                            # page.tsx:198
- **dark default**: `dark:border-stone-700 dark:text-stone-300`                                                           # page.tsx:198
- **dark hover**: `dark:hover:bg-stone-900`                                                                                # page.tsx:198

### Button — Destructive

Source: `website/app/components/review/ReviewSidebar.tsx`

- **padding**: `px-5 py-2 text-sm`                                                                                         # ReviewSidebar.tsx:392
- **border-radius**: `rounded-lg` = 8px                                                                                    # ReviewSidebar.tsx:392
- **default**: `border border-red-600 text-red-300 bg-transparent`                                                        # ReviewSidebar.tsx:392
- **hover**: `hover:bg-red-900/20`                                                                                         # ReviewSidebar.tsx:392
- **disabled**: `disabled:opacity-50`                                                                                      # ReviewSidebar.tsx:393

### Button — Nav Link (Header)

Source: `website/app/components/Header.tsx`

- **padding**: `px-3 py-2`                                                                                                 # Header.tsx:132
- **border-radius**: `rounded-lg` = 8px                                                                                    # Header.tsx:132
- **default inactive**: `text-stone-600 dark:text-stone-400`                                                              # Header.tsx:135
- **hover inactive**: `hover:bg-stone-50 hover:text-stone-900 dark:hover:bg-stone-800/50 dark:hover:text-white`           # Header.tsx:135
- **active**: `bg-stone-100 font-medium text-stone-900 dark:bg-stone-800 dark:text-white`                                 # Header.tsx:134

### Input (Text / URL)

Source: `website/app/browse/page.tsx`

- **padding**: `px-4 py-2`                                                                                                 # browse/page.tsx:317
- **border-radius**: `rounded-lg` = 8px                                                                                    # browse/page.tsx:317
- **border**: `border border-stone-300 dark:border-stone-700`                                                             # browse/page.tsx:317
- **background**: `bg-white dark:bg-stone-900`                                                                             # browse/page.tsx:317
- **font-size**: `text-sm`                                                                                                 # browse/page.tsx:317
- **placeholder**: `placeholder:text-stone-400 dark:placeholder:text-stone-600`                                           # browse/page.tsx:317
- **focus**: `focus:border-teal-500 focus:outline-none`                                                                   # browse/page.tsx:317
- **error**: `border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-400`                # browse/page.tsx:256 (error alert, not input error state)

### Textarea

Source: `website/app/components/review/ReviewSidebar.tsx`, `website/app/components/review/QuestionForm.tsx`

- **padding**: `px-3 py-2`                                                                                                 # ReviewSidebar.tsx:310
- **border-radius**: `rounded-lg` = 8px                                                                                    # ReviewSidebar.tsx:310
- **border**: `border border-stone-700 dark:border-stone-700`                                                             # ReviewSidebar.tsx:310
- **background**: `bg-stone-900 dark:bg-stone-800`                                                                        # ReviewSidebar.tsx:310
- **font-size**: `text-sm`                                                                                                 # ReviewSidebar.tsx:310
- **text**: `text-stone-200`                                                                                               # ReviewSidebar.tsx:310
- **placeholder**: `placeholder:text-stone-600`                                                                            # ReviewSidebar.tsx:310
- **focus**: `focus:border-teal-500 focus:outline-none`                                                                   # ReviewSidebar.tsx:310
- **min-height**: `minHeight: 60` (inline style)                                                                           # ReviewSidebar.tsx:311
- **resize**: `resize-y`                                                                                                   # ReviewSidebar.tsx:310

### Card (Interactive Link Card)

Source: `website/app/page.tsx`

- **padding**: `p-5` = 20px all sides                                                                                      # page.tsx:222
- **border-radius**: `rounded-xl` = 12px                                                                                   # page.tsx:222
- **border**: `border` (1px, Tailwind default)                                                                             # page.tsx:222
- **transition**: `transition`                                                                                              # page.tsx:222
- **hover**: `hover:shadow-md`                                                                                             # page.tsx:222
- **variants**: colored borders per phase/category (see Token section)

Card (non-interactive, static info card):
- **padding**: `p-6` = 24px                                                                                                # page.tsx:355
- **border-radius**: `rounded-xl` = 12px                                                                                   # page.tsx:355
- **border**: `border border-stone-200 dark:border-stone-800`                                                             # page.tsx:355
- **hover**: `hover:border-teal-300 hover:shadow-md dark:hover:border-teal-700`                                           # page.tsx:357

### Badge / Status Pill

Source: `website/app/browse/components/PortfolioView.tsx`

- **border-radius**: `rounded` (4px) or `rounded-full` for pill shape                                                     # PortfolioView.tsx (statusColors)
- **padding**: `px-1.5 py-0.5` (seen in code tag usage in browse/page.tsx:248)                                            # browse/page.tsx:248
- **font-size**: `text-xs` or `text-[10px]`
- **variants** (from statusColors record):                                                                                 # PortfolioView.tsx:57-63
  - `active`: `bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400`
  - `completed`: `bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400`
  - `archived`: `bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400`
  - `blocked`: `bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400`
- **PR status variants**:                                                                                                  # PortfolioView.tsx:65-69
  - `open`: `bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400`
  - `merged`: `bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400`
  - `closed`: `bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400`

### Drop Zone

Source: `website/app/browse/page.tsx`

- **padding**: `p-12` = 48px                                                                                               # browse/page.tsx:204
- **border-radius**: `rounded-xl` = 12px                                                                                   # browse/page.tsx:204
- **border**: `border-2 border-dashed`                                                                                     # browse/page.tsx:204
- **default**: `border-stone-300 dark:border-stone-700`                                                                   # browse/page.tsx:207
- **dragging**: `border-teal-400 bg-teal-50 dark:border-teal-600 dark:bg-teal-950`                                       # browse/page.tsx:205
- **hover**: `hover:border-teal-300 dark:hover:border-teal-700`                                                           # browse/page.tsx:207

### Alert / Error Banner

Source: `website/app/browse/page.tsx`

- **padding**: `px-4 py-3`                                                                                                 # browse/page.tsx:256
- **border-radius**: `rounded-lg` = 8px                                                                                    # browse/page.tsx:256
- **border**: `border border-red-200 dark:border-red-900`                                                                 # browse/page.tsx:256
- **background**: `bg-red-50 dark:bg-red-950`                                                                             # browse/page.tsx:256
- **text**: `text-sm text-red-700 dark:text-red-400`                                                                      # browse/page.tsx:256

### Icon Button (Header Utility)

Source: `website/app/components/Header.tsx`

- **padding**: `p-2`                                                                                                        # Header.tsx:182
- **border-radius**: `rounded-lg` = 8px                                                                                    # Header.tsx:182
- **icon-size**: `h-5 w-5` = 20px                                                                                         # Header.tsx:186

---

## 2. Tokens

### Color Tokens

Source: `website/app/globals.css` (Tailwind `@theme` block) → mapped to named aliases from prior intent DESIGN-TOKENS.md

**Stone (Neutral) Scale:**                                                                                                 # globals.css:18-28
- `color.stone.50`   = `#fafaf9`   — page bg (light)
- `color.stone.100`  = `#f5f5f4`   — section bg, code bg (light)
- `color.stone.200`  = `#e7e5e4`   — borders (light)
- `color.stone.300`  = `#d6d3d1`   — muted borders, input borders (light)
- `color.stone.400`  = `#a8a29e`   — muted text, secondary text
- `color.stone.500`  = `#78716c`   — footer text, secondary labels
- `color.stone.600`  = `#57534e`   — body text (light mode), nav links
- `color.stone.700`  = `#44403c`   — dark mode borders, disabled state
- `color.stone.800`  = `#292524`   — dark mode card bg, code bg (dark)
- `color.stone.900`  = `#1c1917`   — dark mode section bg; body bg (dark)
- `color.stone.950`  = `#0c0a09`   — darkest bg; sidebar bg (dark mode)

**Teal (Brand/Primary Action) Scale:**                                                                                    # globals.css:30-39
- `color.teal.50`    = `#f0fdfa`   — teal bg tint (light)
- `color.teal.100`   = `#ccfbf1`   — teal selection bg (light); dragging zone
- `color.teal.200`   = `#99f6e4`   — light teal border
- `color.teal.300`   = `#5eead4`   — teal hover border
- `color.teal.400`   = `#2dd4bf`   — teal-400 (used in demo animation)
- `color.teal.500`   = `#14b8a6`   — focus ring (`outline-teal-500`); accent-review; status-ok
- `color.teal.600`   = `#0d9488`   — primary button bg; CTA links (`text-teal-600`)
- `color.teal.700`   = `#0f766e`   — primary button hover; link hover
- `color.teal.800`   = `#115e59`   — dark teal
- `color.teal.900`   = `#134e4a`   — teal-900 (dark dragging zone)

**Indigo (Execution Phase / Direction Accent) Scale:**                                                                    # globals.css:41-47
- `color.indigo.50`  = `#eef2ff`   — execution phase card bg (light)
- `color.indigo.100` = `#e0e7ff`   — execution phase border (light)
- `color.indigo.400` = `#818cf8`   — indigo text (dark mode)
- `color.indigo.500` = `#6366f1`   — accent-direction
- `color.indigo.600` = `#4f46e5`   — indigo text (light mode)
- `color.indigo.700` = `#4338ca`   — indigo dark

**Amber (Operation Phase / Question Accent) Scale:**                                                                      # globals.css:49-55
- `color.amber.50`   = `#fffbeb`   — operation phase card bg (light)
- `color.amber.100`  = `#fef3c7`   — operation phase border (light)
- `color.amber.400`  = `#fbbf24`   — amber-400; status-warning; comment author
- `color.amber.500`  = `#f59e0b`   — accent-question; amber-500
- `color.amber.600`  = `#d97706`   — amber text (light mode)
- `color.amber.700`  = `#b45309`   — amber dark

**Rose (Reflection Phase) Scale:**                                                                                         # globals.css:57-63
- `color.rose.50`    = `#fff1f2`   — reflection phase card bg (light)
- `color.rose.100`   = `#ffe4e6`   — reflection phase border (light)
- `color.rose.400`   = `#fb7185`   — rose text (dark mode)
- `color.rose.500`   = `#f43f5e`   — rose-500
- `color.rose.600`   = `#e11d48`   — rose text (light mode)
- `color.rose.700`   = `#be123c`   — rose dark

**Semantic color aliases** (from prior intent DESIGN-TOKENS.md, cross-referenced with globals.css):
- `color.brand.primary`  = `color.teal.600`  = `#0d9488`   (primary action, CTAs)
- `color.surface.bg`     = `#ffffff` (light) / `color.stone.950` = `#0c0a09` (dark)   # layout.tsx:105
- `color.surface.section` = `color.stone.50` (light) / `color.stone.900/50` (dark)   # page.tsx:207
- `color.text.primary`   = `color.stone.900` (light) / `color.stone.100` (dark)      # layout.tsx:105
- `color.text.secondary` = `color.stone.600` (light) / `color.stone.400` (dark)      # Footer.tsx:23
- `color.text.muted`     = `color.stone.500` (light) / `color.stone.400` (dark)      # Footer.tsx:28
- `color.border.default` = `color.stone.200` (light) / `color.stone.800` (dark)      # Header.tsx:91
- `color.border.subtle`  = `color.stone.300` (light) / `color.stone.700` (dark)      # Input pattern

**Phase semantic color mapping** (from page.tsx:9-113, globals.css-defined palette):
- Elaboration: `bg-teal-50 border-teal-200` (light) / `dark:bg-teal-950/30 dark:border-teal-800`        # page.tsx:11-12
- Execution: `bg-indigo-50 border-indigo-200` (light) / `dark:bg-indigo-950/30 dark:border-indigo-800`  # page.tsx:35-36
- Operation: `bg-amber-50 border-amber-200` (light) / `dark:bg-amber-950/30 dark:border-amber-800`      # page.tsx:64-65
- Reflection: `bg-rose-50 border-rose-200` (light) / `dark:bg-rose-950/30 dark:border-rose-800`         # page.tsx:93-94

**Architecture map CSS custom properties** (from `arch.css` — applies only to `.haiku-arch-map`):          # arch.css:36-50
- `--bg`: `#faf9f6`            (arch map background)
- `--ink`: `#1a1a1a`           (arch map text)
- `--muted`: `#666`            (arch map muted)
- `--line`: `#b8b2a7`          (arch map connectors)
- `--stage-bg`: `#fff`         (stage card bg)
- `--stage-border`: `#d4cfc2`  (stage card border)
- `--unit-fill`: `#fef6d7`     (unit node fill)
- `--unit-stroke`: `#c9a227`   (unit node border)
- `--hat-fill`: `#ffe8d1`      (hat node fill)
- `--hat-stroke`: `#d97706`    (hat node border = amber-600)
These are **ACTIVE** and scoped to the architecture map only — not global design tokens.

### Spacing Scale

Source: Tailwind defaults — no explicit custom spacing in `globals.css`. All spacing via standard Tailwind scale.

Key spacing usages (cited from source):
- Micro: `gap-1` = 4px, `gap-1.5` = 6px, `space-y-1` = 4px                           # Header.tsx:176 (gap-2 = 8px)
- XS: `p-2` = 8px, `gap-2` = 8px, `px-3 py-2` = 12px/8px                              # Header.tsx:176
- S: `p-3` = 12px, `gap-3` = 12px, `px-4 py-3` = 16px/12px                             # browse/page.tsx:317
- M: `p-4` = 16px, `gap-4` = 16px, `px-6 py-3` = 24px/12px                             # page.tsx:178
- L: `p-5` = 20px, `p-6` = 24px                                                         # page.tsx:222, 355
- XL: `p-12` = 48px, `py-16` = 64px                                                     # browse/page.tsx:204, page.tsx:207
- 2XL: `py-20` = 80px, `py-32` = 128px (hero)                                           # page.tsx:162

Max-width containers:
- Narrow prose: `max-w-3xl` = 48rem / 768px                                              # page.tsx:164, browse/page.tsx:184
- Standard content: `max-w-5xl` = 64rem / 1024px                                        # page.tsx:208
- Wide content: `max-w-6xl` = 72rem / 1152px                                             # Header.tsx:93, Footer.tsx:14

### Typography Scale

Source: `website/app/globals.css` (`@theme` block) and pattern extraction from components

**Font Families:**
- `--font-sans`: `"Inter", ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"`   # globals.css:11-13
- `--font-mono`: `ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace`                                          # globals.css:14-16

**Type Scale** (extracted from component usage):
- `text-[10px]`: 10px — micro labels, footer attribution                                 # Footer.tsx:27
- `text-xs`: 12px — badges, timestamps, captions                                         # page.tsx:282
- `text-sm`: 14px — body, card text, button labels                                       # page.tsx:229
- `text-base` (default): 16px — standard body
- `text-lg`: 18px — lead text, hero body                                                 # page.tsx:168
- `text-xl`: 20px — brand name in footer, nav                                           # Footer.tsx:19
- `text-2xl`: 24px — section headings (blog)                                             # page.tsx:445
- `text-3xl`: 30px — section headings                                                    # page.tsx:210
- `text-4xl`: 36px — drop-zone icon                                                      # browse/page.tsx:226
- `text-5xl`: 48px — hero H1                                                             # page.tsx:165
- `text-6xl`: 60px — hero H1 on sm+ breakpoint                                          # page.tsx:165

**Font Weights:**
- `font-medium` (500) — buttons, nav links, lead text                                    # page.tsx:168
- `font-semibold` (600) — card titles, list headers, badge labels                       # Footer.tsx:68
- `font-bold` (700) — section headings, page headings, brand name                       # page.tsx:165

**Tracking:**
- `tracking-tight` — hero h1, brand logo                                                 # page.tsx:165, Footer.tsx:19
- `tracking-wider` — footer column headers (`text-xs font-semibold uppercase`)           # Footer.tsx:68
- `tracking-widest` — review sidebar section labels                                      # ReviewSidebar.tsx:237

**Prose:**
- `prose` class (Tailwind Typography plugin) with `max-w-none` override                  # globals.css:79-80
- Code inline: `rounded bg-stone-100 px-1.5 py-0.5 text-sm dark:bg-stone-800`           # globals.css:99-101
- Pre block: `rounded-lg bg-stone-900 p-4 text-sm text-stone-100 dark:bg-stone-800`      # globals.css:104-108

### Radius Scale

Source: Tailwind defaults (no custom radii defined in `@theme`). From component patterns:
- `rounded` (4px) — inline code, branch badge                                            # browse/page.tsx:248, 358
- `rounded-md` (6px) — collapse button                                                   # ReviewSidebar.tsx:321
- `rounded-lg` (8px) — buttons, inputs, nav items, alerts, icon buttons                  # page.tsx:178
- `rounded-xl` (12px) — cards, feature cards, drop zones                                  # page.tsx:222
- `rounded-full` (50%) — step indicator circles, status dots, avatar-style elements       # ReviewSidebar.tsx (step icons)
- `rounded-2xl` — not found in active codebase

### Shadow / Elevation Scale

Source: Tailwind defaults — no custom shadows in `@theme`.
- `shadow-sm` — subtle lift on hover (Kanban cards)                                      # KanbanView.tsx:139
- `shadow-md` — hover lift on interactive cards                                          # page.tsx:222
- `shadow-lg` — tooltip/popover                                                          # DiagramTooltip.tsx:35
- `shadow-xl` — code block in paper page                                                 # PaperContent.tsx:557

Glassmorphism pattern (header, bottom nav):
- `bg-white/95 backdrop-blur-sm` (light) / `dark:bg-stone-950/95 backdrop-blur-sm`      # Header.tsx:91
- Modal backdrop: `bg-black/80 backdrop-blur-sm`                                         # IntentDetailView.tsx:755
- Overlay: `bg-black/50 backdrop-blur-sm`                                                # MobileNav.tsx:37

---

## 3. Active vs Dormant Patterns

Cross-referenced with `DISCOVERY.md` `## Existing Code Structure` section. The section lists only plugin and package files — no era-tagged legacy website components. The website codebase is uniformly active with no era-tagged dormant patterns found.

**All patterns extracted in section 1 (Atoms) are ACTIVE** — sourced from files marked `(active)` in `DISCOVERY.md` or from currently-rendered pages:

| File | Status | Note |
|------|--------|------|
| `website/app/globals.css` | **Active** | Single global CSS file — Tailwind 4 @theme, all tokens in use |
| `website/app/components/Header.tsx` | **Active** | Sticky header rendered on all pages |
| `website/app/components/Footer.tsx` | **Active** | Footer rendered on all pages |
| `website/app/components/review/ReviewSidebar.tsx` | **Active** | Review UI used on `/review` page |
| `website/app/components/review/QuestionForm.tsx` | **Active** | Question form used on `/review` page |
| `website/app/browse/page.tsx` | **Active** | Browse SPA landing, dir-picker, remote URL |
| `website/app/auth/[provider]/callback/CallbackClient.tsx` | **Active** | OAuth callback client — structural template for `/report/[id]` |
| `website/app/page.tsx` | **Active** | Homepage — canonical usage of card, phase color, CTA button patterns |

The arch.css CSS custom properties (`--bg`, `--ink`, `--hat-fill`, etc.) are **Active** but **scoped** — they apply only within `.haiku-arch-map` and must NOT be used in new feature design. Map design tokens from `globals.css @theme` or Tailwind defaults instead.

---

## 4. Open Questions

- **No `DESIGN-TOKENS.md` in the `autonomous-report-to-fix` intent knowledge directory** — a sibling discovery artifact will produce this; the designer hat should wait for it before finalizing any semantic token usage beyond what is cited here from globals.css directly. The aliases listed in section 2 ("Semantic color aliases") are derived from `remote-review-spa/knowledge/DESIGN-TOKENS.md` (a prior intent, now part of the codebase pattern) — they reflect live patterns but are not formally declared as CSS custom properties in globals.css.

- **No explicit color tokens for `success` / `info` states** — the codebase uses `bg-green-*` classes for "completed" status badges (PortfolioView.tsx:59) but green is not in the `@theme` block of globals.css. Downstream designer should default to teal-500 for success or use green inline; do not invent a named alias without first confirming the gap here is intentional.

- **Blue color palette absent from `@theme`** — PR status "open" badge uses `bg-blue-100 text-blue-700` (PortfolioView.tsx:66) but blue is not declared in globals.css @theme. This means blue relies on Tailwind's default blue scale, not a project-declared token. The `/report/[id]` feature should avoid blue unless it's documenting PR status.

- **Purple color palette absent from `@theme`** — PR status "merged" uses `bg-purple-100 text-purple-700` (PortfolioView.tsx:67) — same situation as blue. Avoid purple in new feature design.

- **No explicit `loading` component atom** — spinning loader is implemented inline via `animate-spin` on an SVG (CallbackClient.tsx:40). If the `/report/[id]` page needs a loading state, use the same `animate-spin text-teal-500` pattern on an SVG circle+path. No Spinner component exists to import.

- **Inter font is declared in `@theme` but the `next/font` or `@font-face` loading mechanism is not visible** — the font reference in globals.css:11 declares it for Tailwind but does not guarantee Inter is loaded via Google Fonts or a local font file. The `layout.tsx` does not include a `next/font/google` import for Inter. Downstream designer should use the Inter spec knowing the actual render fallback to `ui-sans-serif` is possible until the loading mechanism is verified.

- **Dark mode implementation**: Class-based (`html.dark`) via `next-themes`. The `@custom-variant dark` rule in globals.css:8 hooks into this. All new components must provide `dark:` variants for every color class — especially background, border, and text colors. The `/report/[id]` page will be indexed via Next.js static export with SPA runtime; dark mode should follow the same `dark:` Tailwind class pattern.
