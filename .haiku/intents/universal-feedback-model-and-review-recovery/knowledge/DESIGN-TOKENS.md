# Design Tokens: Universal Feedback Model & Review Recovery

Reference for all existing and new Tailwind design tokens used in the H-AI-K-U review app.

---

## 1. Existing Token Inventory

### 1.1 Color Palette (Base Scale)

The review app uses Tailwind's `stone` scale as its neutral palette, with `teal` as the primary accent. The server-rendered templates use `gray` and `blue` instead -- this divergence exists between the two renderers.

#### React Review App (SPA)

| Role | Light | Dark |
|---|---|---|
| Background (page) | `bg-white` / `bg-stone-50` | `dark:bg-stone-900` / `dark:bg-stone-950` |
| Background (card) | `bg-white` | `dark:bg-stone-900` |
| Background (elevated surface) | `bg-stone-50` / `bg-stone-50/50` | `dark:bg-stone-800/50` |
| Background (input) | `bg-white` | `dark:bg-stone-800` / `dark:bg-stone-900` |
| Background (code) | `bg-stone-100` | `dark:bg-stone-800` |
| Text (primary) | `text-stone-900` | `dark:text-stone-100` |
| Text (secondary) | `text-stone-700` | `dark:text-stone-300` |
| Text (muted) | `text-stone-600` | `dark:text-stone-300` |
| Text (faint) | `text-stone-500` | `dark:text-stone-400` |
| Text (muted, AAA) | `text-stone-600` on white (7.14:1) | `dark:text-stone-300` on stone-900 (12.6:1) |

> **Unit-11 note:** `text-stone-400` / `text-gray-400` are no longer valid for body text on any light card surface (white, stone-50, stone-100, amber-50/50, blue-50/50, green-50/30, sky-50) — they fail 4.5:1 AA. `text-stone-500` is the absolute floor for text on light surfaces (4.61:1 on white); prefer `text-stone-600` (≥ 6.85:1) for any metadata line. In dark mode, `text-stone-500` is the floor on `stone-900`; prefer `text-stone-300` for metadata.
| Border (standard) | `border-stone-200` | `dark:border-stone-700` |
| Border (subtle) | `border-stone-100` | `dark:border-stone-800` |
| Border (heavy) | `border-stone-300` | `dark:border-stone-600` |
| Accent (primary) | `text-teal-600` / `bg-teal-600` | `dark:text-teal-400` / `dark:bg-teal-600` |
| Accent (hover) | `hover:bg-teal-700` | `dark:hover:bg-teal-700` |
| Accent (focus ring) | `focus:ring-teal-500` | -- |
| Accent (light bg) | `bg-teal-100` | `dark:bg-teal-900/40` / `dark:bg-teal-900/30` |
| Accent (light text) | `text-teal-700` | `dark:text-teal-300` / `dark:text-teal-400` |

#### Server-Rendered Templates (SSR)

| Role | Light | Dark |
|---|---|---|
| Background (page) | `bg-gray-50` | `dark:bg-gray-950` |
| Background (card) | `bg-white` | `dark:bg-gray-900` |
| Accent (primary) | `text-blue-600` / `bg-blue-600` | `dark:text-blue-400` / `dark:bg-blue-600` |
| Accent (hover) | `hover:bg-blue-700` | -- |
| Approve button | `bg-green-600` | -- |
| Request changes button | `bg-amber-600` | -- |

### 1.1a Banned Text-on-Surface Pairs (unit-11, WCAG 2.1 AA)

Any combination in this table MUST NOT appear in `stages/design/artifacts/*.html` or in the production review app. CI grep will fail the unit if any pair reappears.

| Foreground token | Forbidden background tokens | Measured ratio | Required remediation |
|---|---|---|---|
| `text-stone-400` / `text-gray-400` | `bg-white`, `bg-stone-50`, `bg-stone-100`, `bg-amber-50/50`, `bg-blue-50/50`, `bg-green-50/30`, `bg-green-50/60`, `bg-sky-50` | 2.79 – 3.0:1 | Lift to `text-stone-600` (≥ 6.85:1) for metadata, `text-stone-500` (4.61:1) minimum for body |
| `text-stone-500` | `bg-stone-100` | 4.40:1 | **FAIL** on body text (< 4.5:1). Lift to `text-stone-600` on `bg-stone-100` (6.99:1) or `text-stone-600` on `bg-stone-50` (7.02:1). `text-stone-500` passes on `bg-white` only (4.61:1). |
| `text-gray-500` | `bg-gray-100` | 4.39:1 | **FAIL** on body text (< 4.5:1). Lift to `text-gray-700` on `bg-gray-100` (8.59:1) or similar AA-passing pair. |
| `text-stone-500 dark:text-stone-500` on dark mode | `dark:bg-stone-800`, `dark:bg-stone-900`, `dark:bg-stone-950`, `dark:bg-green-950/15`, `dark:bg-amber-950/20`, `dark:bg-blue-950/20`, `dark:bg-stone-800/30` | ≈ 3.1 – 4.4:1 | Use `dark:text-stone-300` (≥ 10:1) for metadata |
| `opacity-50` / `opacity-70` applied to an entire feedback card root | any | α-composite drops metadata text below 2:1 | Remove the opacity entirely. Convey muted-finality state via muted background tokens (`bg-green-50/60`, `bg-stone-100`) + a non-color second signal (glyph + text prefix) |
| `bg-green-600/50 text-white/80` (disabled button composite) | — | α-composited effective contrast ≈ 2.6:1 | Use opaque token pair `bg-green-300 text-green-800 dark:bg-green-900/40 dark:text-green-200` |
| `text-[9px]`, `text-[10px]` on user-facing information | — | fails 1.4.4 Resize Text at 200% | Use `text-xs` (12px) minimum. `text-[11px]` allowed only with `font-semibold`/`font-bold` |
| `dark:text-stone-600` (stone-500-equivalent in dark) | `dark:bg-gray-900`, `dark:bg-stone-900` | ≈ 2.2:1 | **FAIL** AA. Use `dark:text-stone-300` (12.6:1, passes AAA) for metadata on dark `gray-900`/`stone-900` surfaces |

### 1.2 Status Badge Colors (Shared StatusBadge)

From `packages/shared/src/components/StatusBadge.tsx`:

| Status | Light | Dark |
|---|---|---|
| `completed` / `complete` | `bg-green-100 text-green-700` | `dark:bg-green-900/30 dark:text-green-400` |
| `in_progress` / `active` | `bg-teal-100 text-teal-700` | `dark:bg-teal-900/30 dark:text-teal-400` |
| `pending` (default fallback) | `bg-stone-100 text-stone-500` | `dark:bg-stone-800 dark:text-stone-400` |
| `blocked` | `bg-red-100 text-red-700` | `dark:bg-red-900/30 dark:text-red-400` |
| `unit` | `bg-indigo-100 text-indigo-700` | `dark:bg-indigo-900/30 dark:text-indigo-400` |
| `intent` | `bg-purple-100 text-purple-700` | `dark:bg-purple-900/30 dark:text-purple-400` |

From `packages/haiku/src/templates/styles.ts` (server-rendered):

| Status | Light | Dark |
|---|---|---|
| `completed` | `bg-green-100 text-green-800` | `dark:bg-green-900/40 dark:text-green-300` |
| `in_progress` | `bg-blue-100 text-blue-800` | `dark:bg-blue-900/40 dark:text-blue-300` |
| `pending` | `bg-gray-100 text-gray-800` | `dark:bg-gray-700/40 dark:text-gray-300` |
| `blocked` | `bg-red-100 text-red-800` | `dark:bg-red-900/40 dark:text-red-300` |
| `opus` | `bg-purple-100 text-purple-800` | `dark:bg-purple-900/40 dark:text-purple-300` |
| `sonnet` | `bg-cyan-100 text-cyan-800` | `dark:bg-cyan-900/40 dark:text-cyan-300` |
| `haiku` | `bg-indigo-100 text-indigo-800` | `dark:bg-indigo-900/40 dark:text-indigo-300` |

### 1.3 Spacing Tokens

| Usage | Classes |
|---|---|
| Card padding | `p-6` |
| Card margin-bottom | `mb-6` |
| Section heading margin | `mb-3` |
| Content gap (layout) | `gap-6` |
| Badge pill padding | `px-2.5 py-0.5` |
| Button padding (primary) | `px-4 py-2.5` (sidebar), `px-6 py-3` (full-width) |
| Button padding (small) | `px-3 py-1.5` |
| Button padding (tiny) | `px-3 py-1` or `px-2 py-0.5` |
| Sidebar width | `w-80 lg:w-96` |
| Comment card padding | `p-2.5` |
| Input padding | `p-2` (small), `p-3` (standard) |
| Inline gap | `gap-2` (tight), `gap-3` (standard) |
| Page padding | `px-4 sm:px-6 lg:px-8` |
| Page vertical | `py-6` |
| Header padding | `py-3` |

### 1.4 Typography Tokens

| Usage | Classes |
|---|---|
| Page title | `text-lg font-semibold` |
| Card heading (h2) | `text-lg font-semibold` |
| Card heading (h3) | `text-base font-semibold` |
| Body text | (default / inherits) |
| Small text | `text-sm` |
| Tiny text / labels | `text-xs` |
| Table header | `text-xs font-semibold uppercase tracking-wider` |
| Stage group header | `text-sm font-bold uppercase tracking-wider` |
| Badge text | `text-xs font-semibold` |
| Button text (primary) | `text-sm font-semibold` |
| Button text (secondary) | `text-xs font-medium` |
| Code text | `text-sm font-mono` |
| Prose container | `prose prose-sm prose-stone dark:prose-invert max-w-none` |

### 1.5 Border & Radius Tokens

| Usage | Classes |
|---|---|
| Card | `rounded-xl border border-stone-200 dark:border-stone-700 shadow-sm` |
| Badge | `rounded-full` |
| Button (primary) | `rounded-lg` |
| Button (secondary) | `rounded-md` |
| Input / textarea | `rounded-lg` (full), `rounded-md` (compact) |
| Tooltip | `rounded-lg` |
| Modal overlay | `rounded-xl` |
| Tab active border | `border-b-2 border-teal-600 dark:border-teal-400` |
| Annotation pin | `rounded-full` (50% via CSS) |
| Image/iframe embed | `rounded-lg` |
| Progress bar track | `rounded-full` |

### 1.6 Shadow Tokens

| Usage | Classes |
|---|---|
| Card | `shadow-sm` |
| Toolbar | `shadow-sm` |
| Tooltip | `shadow-lg` |
| Modal | `shadow-2xl` (with `backdrop-blur-sm`) |
| Annotation pin | `box-shadow: 0 2px 6px rgba(0,0,0,0.3)` (custom CSS) |
| Header (sticky) | `backdrop-blur` (no explicit shadow, relies on border) |

### 1.7 Interaction Tokens

| Pattern | Classes |
|---|---|
| Focus ring (teal) | `focus:ring-2 focus:ring-teal-500` |
| Focus ring (offset) | `focus:ring-offset-2 dark:focus:ring-offset-stone-900` |
| Hover card border | `hover:border-teal-400 dark:hover:border-teal-500` |
| Hover text | `hover:text-teal-600 dark:hover:text-teal-400` |
| Hover bg (nav) | `hover:bg-stone-50 dark:hover:bg-stone-800` |
| Hover bg (button) | `hover:bg-stone-100 dark:hover:bg-stone-700` |
| Delete hover | `hover:text-red-500 dark:hover:text-red-400` |
| Disabled state | `disabled:opacity-50 disabled:cursor-not-allowed` |
| Transition | `transition-colors` (most), `transition-all` (sized elements) |

### 1.7.1 Touch Targets (added by unit-15 / FB-12)

**Rule.** Every touch-activated control MUST expose a ≥ 44×44 CSS-px hit area on any tablet or mobile breakpoint. On desktop (pointer-only), the minimum is ≥ 24×24 CSS-px per WCAG 2.2 SC 2.5.8.

**Implementation options (use one):**

1. **Visible sizing.** Set the element itself to ≥ 44×44 via Tailwind (`w-11 h-11` or larger, or `min-h-11 min-w-11`). Preferred for buttons and FABs.
2. **Invisible hit-area expansion.** When the visible marker must stay small (dense overlays — pins, ghost pins, inline markers), add a transparent `::before` pseudo-element that matches `width: 44px; height: 44px` and absorbs pointer events. Pattern:

    ```css
    .pin-hit { position: relative; }
    .pin-hit::before {
      content: "";
      position: absolute;
      top: 50%; left: 50%;
      width: 44px; height: 44px;
      transform: translate(-50%, -50%);
      border-radius: 9999px;
    }
    ```

3. **Utility class.** Prefer `min-height: 44px; min-width: 44px` via a `.touch-target` class on each interactive surface that ships on mobile-first screens.

**Exceptions (documented per-control in `stages/design/artifacts/touch-target-audit.md`):**

- **Inline text targets.** Targets embedded in a sentence or block of text may be smaller (WCAG 2.2 SC 2.5.8 Exception a). Stage-progress nodes in the compact mobile strip use this exception.
- **Desktop-only surfaces.** Components that never render below 1024px may use the 24×24 desktop minimum (Segmented controls in the sticky sidebar, filter pills, feedback-card footer buttons). When these components are reused on mobile they MUST re-hit 44×44.

**Verification.** `touch-target-audit.md` lists every touch-activated control with measured dimensions and the method used. A pre-delivery check greps for `w-7 h-7` (or similar < 44px sizing) and asserts the element either (a) carries `.pin-hit` / `.pin::before` / `.ghost::before` or (b) has `.touch-target` / `min-h-11`.

### 1.8 Semantic Colors (Named Roles)

| Role | Light | Dark |
|---|---|---|
| Success | `bg-green-50 / border-green-200 / text-green-800` | `dark:bg-green-900/30 / dark:border-green-800 / dark:text-green-200` |
| Error | `bg-red-50 / border-red-200 / text-red-800` | `dark:bg-red-900/30 / dark:border-red-800 / dark:text-red-200` |
| Warning (prompt) | `border-amber-500 ring-1 ring-amber-500` | -- |
| Info / selection highlight | `bg-amber-200` (selection) | `dark:bg-amber-700/50` (selection) |
| Spinner accent | `border-t-teal-500` | -- |
| Annotation red | `#e11d48` (rose-600, hardcoded in canvas) | -- |
| Inline highlight | `rgba(251, 191, 36, 0.3)` / `rgba(251, 191, 36, 0.5)` | -- |
| Active comment border | `border-color: #3b82f6` (blue-500, via CSS) | -- |

### 1.9 Special Component Colors

| Component | Light | Dark |
|---|---|---|
| Approve button (has comments) | `bg-stone-200 text-stone-600` | `dark:bg-stone-700 dark:text-stone-300` |
| Approve button (no comments) | `bg-teal-600 text-white` | -- |
| Request Changes (has comments) | `bg-amber-600 text-white` | -- |
| Request Changes (no comments) | `bg-stone-200 text-stone-700` | `dark:bg-stone-700 dark:text-stone-200` |
| External Review button | `bg-indigo-600 text-white` | -- |
| Comment count badge | `bg-amber-100 text-amber-700` | `dark:bg-amber-900/40 dark:text-amber-300` |
| Mermaid theme vars | `primaryColor: #0d9488` (teal-600) | -- |
| ReactFlow bg gap color | `#44403c` (stone-700) | -- |

---

## 2. New Tokens: Feedback Model

### 2.1 Feedback Status Colors

Feedback items progress through a lifecycle: `pending` -> `addressed` / `rejected` -> `closed`. Each status needs a distinct color treatment.

| Semantic Name | Tailwind Classes (Light) | Tailwind Classes (Dark) | Rationale |
|---|---|---|---|
| `feedback-status-pending` | `bg-amber-100 text-amber-800 border-amber-300` | `dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700` | Amber = attention needed. Matches the existing comment-count badge palette. |
| `feedback-status-addressed` | `bg-blue-100 text-blue-800 border-blue-300` | `dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-700` | Blue = work done, awaiting verification. Distinct from teal (which is "active/primary"). |
| `feedback-status-closed` | `bg-green-100 text-green-800 border-green-300` | `dark:bg-green-900/30 dark:text-green-300 dark:border-green-700` | Green = resolved. Consistent with existing `completed` status color. |
| `feedback-status-rejected` | `bg-stone-100 text-stone-500 border-stone-300` | `dark:bg-stone-800 dark:text-stone-400 dark:border-stone-600` | Stone/gray = dismissed/not actionable. Muted, de-emphasized. |

#### Implementation: Badge Variant

```tsx
const feedbackStatusColors: Record<string, string> = {
  pending:   "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  addressed: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  closed:    "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  rejected:  "bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400",
};
```

#### Implementation: Status Dot (Inline Indicator)

For compact status indicators inside feedback cards:

```tsx
const feedbackStatusDots: Record<string, string> = {
  pending:   "bg-amber-500",
  addressed: "bg-blue-500",
  closed:    "bg-green-500",
  rejected:  "bg-stone-400 dark:bg-stone-500",
};
```

### 2.2 Origin Badge Colors

Each feedback item carries an `origin` indicating where it came from. These badges should be visually distinct from status badges and from each other.

| Semantic Name | Tailwind Classes (Light) | Tailwind Classes (Dark) | Icon Suggestion |
|---|---|---|---|
| `origin-adversarial-review` | `bg-rose-100 text-rose-700 border-rose-200` | `dark:bg-rose-900/30 dark:text-rose-400 dark:border-rose-800` | Shield / target |
| `origin-external-pr` | `bg-violet-100 text-violet-700 border-violet-200` | `dark:bg-violet-900/30 dark:text-violet-400 dark:border-violet-800` | Git branch / PR icon |
| `origin-user-visual` | `bg-sky-100 text-sky-700 border-sky-200` | `dark:bg-sky-900/30 dark:text-sky-400 dark:border-sky-800` | Eye / annotation pin |
| `origin-agent` | `bg-teal-100 text-teal-700 border-teal-200` | `dark:bg-teal-900/30 dark:text-teal-400 dark:border-teal-800` | Sparkle / robot |

#### Implementation

```tsx
const originColors: Record<string, string> = {
  "adversarial-review": "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400",
  "external-pr":        "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
  "user-visual":        "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400",
  "agent":              "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400",
};

const originIcons: Record<string, string> = {
  "adversarial-review": "\uD83D\uDEE1\uFE0F",  // shield
  "external-pr":        "\uD83D\uDD00",          // shuffle (merge)
  "user-visual":        "\uD83D\uDC41\uFE0F",   // eye
  "agent":              "\u2728",                 // sparkle
};
```

#### Design rationale

- Rose for adversarial review: conveys critical/adversarial nature without being red (which is reserved for errors/blocked).
- Violet for external PR: distinct from indigo (used for `unit` badges) and purple (used for `intent` badges). Violet sits between them and reads as "external/VCS".
- Sky for user-visual: bright, attention-catching -- visual feedback is the most human-interactive origin. Distinct from blue (used for `in_progress` in SSR templates).
- Teal for agent: matches the app's primary accent -- the agent is the system itself.

### 2.3 Feedback Item Card Tokens

Feedback items render as cards in a sidebar or panel. They reuse the existing comment-card pattern from `ReviewSidebar` but add status-aware borders and backgrounds.

#### Base Card

```
// Reuses existing comment card pattern
p-2.5 rounded-lg border transition-colors cursor-pointer group
```

#### Status-Aware Borders (Left Accent)

Each card gets a 3px left border matching its status color, similar to the existing `.margin-comment` pattern:

| Status | Left Border (Light) | Left Border (Dark) |
|---|---|---|
| `pending` | `border-l-[3px] border-l-amber-400` | `dark:border-l-amber-500` |
| `addressed` | `border-l-[3px] border-l-blue-400` | `dark:border-l-blue-500` |
| `closed` | `border-l-[3px] border-l-green-400` | `dark:border-l-green-500` |
| `rejected` | `border-l-[3px] border-l-stone-300` | `dark:border-l-stone-600` |

#### Card Background (Status-Aware)

| Status | Background (Light) | Background (Dark) |
|---|---|---|
| `pending` | `bg-amber-50/50` | `dark:bg-amber-950/20` |
| `addressed` | `bg-blue-50/50` | `dark:bg-blue-950/20` |
| `closed` | `bg-green-50/30` | `dark:bg-green-950/15` |
| `rejected` | `bg-stone-50` | `dark:bg-stone-800/30` |

#### Hover State

All feedback cards share the same hover interaction regardless of status:

```
hover:border-teal-400 dark:hover:border-teal-500
```

This maintains consistency with the existing sidebar comment card hover pattern.

### 2.4 Visit Counter Token

The visit counter appears on feedback items that have been re-encountered across multiple review cycles. It uses a numeric counter in a small pill.

```tsx
// Container
"inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold leading-none"

// Default (single visit -- hidden or not rendered)
// Shown at visit >= 2

// Colors by escalation tier:
// visit 2-3: informational
"bg-stone-200 text-stone-600 dark:bg-stone-700 dark:text-stone-300"

// visit 4-5: attention
"bg-amber-200 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"

// visit 6+: critical
"bg-red-200 text-red-800 dark:bg-red-900/40 dark:text-red-300"
```

#### Implementation

```tsx
function visitCounterClasses(visits: number): string {
  if (visits <= 1) return "hidden";
  if (visits <= 3)
    return "bg-stone-200 text-stone-600 dark:bg-stone-700 dark:text-stone-300";
  if (visits <= 5)
    return "bg-amber-200 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300";
  return "bg-red-200 text-red-800 dark:bg-red-900/40 dark:text-red-300";
}
```

### 2.5 Feedback Panel (Container) Tokens

The feedback panel replaces or augments the existing review sidebar. It follows the same structural pattern.

#### Panel Shell

```
// Matches existing ReviewSidebar structure
w-80 lg:w-96 shrink-0 sticky top-16 h-[calc(100vh-4rem)]
flex flex-col bg-white dark:bg-stone-900
border-l border-stone-200 dark:border-stone-700
```

#### Panel Header

```
shrink-0 px-4 py-3 border-b border-stone-200 dark:border-stone-700
flex items-center justify-between
```

#### Panel Section Dividers

When the panel has grouped sections (e.g., by status), use:

```
// Section header inside panel
text-[10px] font-bold uppercase tracking-widest
text-stone-400 dark:text-stone-500
px-3 py-2 bg-stone-50 dark:bg-stone-800/50
sticky top-0 z-10
```

#### Filter / Tab Bar (Inside Panel)

The panel supports filtering by status or origin. Reuse the existing tab pattern, scaled down:

```
// Filter pill (inactive)
px-2 py-1 text-xs font-medium rounded-full
border border-stone-200 dark:border-stone-700
text-stone-500 dark:text-stone-400
hover:border-stone-300 dark:hover:border-stone-600
cursor-pointer transition-colors

// Filter pill (active)
px-2 py-1 text-xs font-medium rounded-full
bg-teal-100 text-teal-700 border-teal-200
dark:bg-teal-900/30 dark:text-teal-400 dark:border-teal-700
```

#### Empty State

```
text-xs text-stone-400 dark:text-stone-500 italic p-4 text-center
```

### 2.6 Feedback Resolution Actions

Inline action buttons on feedback cards for addressing/rejecting/closing items.

```tsx
// Address button
"text-xs font-medium px-2 py-1 rounded-md
 bg-blue-50 text-blue-700 hover:bg-blue-100
 dark:bg-blue-900/20 dark:text-blue-400 dark:hover:bg-blue-900/40
 transition-colors"

// Reject button
"text-xs font-medium px-2 py-1 rounded-md
 bg-stone-100 text-stone-500 hover:bg-stone-200
 dark:bg-stone-800 dark:text-stone-400 dark:hover:bg-stone-700
 transition-colors"

// Close button (verified resolved)
"text-xs font-medium px-2 py-1 rounded-md
 bg-green-50 text-green-700 hover:bg-green-100
 dark:bg-green-900/20 dark:text-green-400 dark:hover:bg-green-900/40
 transition-colors"

// Reopen button (revert from closed/rejected to pending)
"text-xs font-medium px-2 py-1 rounded-md
 bg-amber-50 text-amber-700 hover:bg-amber-100
 dark:bg-amber-900/20 dark:text-amber-400 dark:hover:bg-amber-900/40
 transition-colors"
```

---

## 3. Token Mapping: Server-Rendered vs SPA

The two rendering paths (React SPA in `review-app/` and SSR templates in `src/templates/`) use different base palettes. When adding feedback tokens to the SSR path, translate accordingly:

| SPA Token | SSR Equivalent |
|---|---|
| `stone-*` | `gray-*` |
| `teal-*` (accent) | `blue-*` (accent) |
| `bg-stone-100` | `bg-gray-100` |
| `border-stone-200` | `border-gray-200` |
| `text-stone-500` | `text-gray-500` |

The feedback-specific colors (amber, blue, green, rose, violet, sky) are the same in both paths -- they don't hit the divergent neutral/accent scales.

---

## 4. Dark Mode Strategy

The review app uses a class-based dark mode toggle (`@custom-variant dark (&:where(.dark, .dark *))` in Tailwind v4). Every token above includes `dark:` variants.

### Pattern

Every color token follows the same inversion pattern:
- Light: `bg-{color}-100` (subtle bg), `text-{color}-700` or `text-{color}-800`
- Dark: `dark:bg-{color}-900/30` (transparent overlay), `dark:text-{color}-300` or `dark:text-{color}-400`
- Borders follow the same direction: light uses `200-300`, dark uses `700-800`

### New tokens follow this exact pattern

No exceptions. The feedback model introduces no new dark mode strategy -- it reuses the existing one.

---

## 5. Animation Tokens

> **Reduced-motion requirement (added in unit-15 / FB-20).** Every `@keyframes` block in the review app MUST have a sibling `@media (prefers-reduced-motion: reduce)` rule. The fallback either sets `animation: none` (cosmetic animation — drop it) or sets a static end-state equivalent (animation carries state information — preserve the final-frame cue). See `stages/design/artifacts/motion-and-reduced-motion-spec.md` for the per-animation policy.

Existing animations in use:

| Name | Usage | Implementation |
|---|---|---|
| Spinner | Loading state | `animate-spin` on `border-2 border-stone-300 border-t-teal-500` |
| Pulse | Loading placeholder | `animate-pulse` on `bg-stone-800` |
| Review pulse | Scroll-to highlight | `@keyframes review-pulse` (custom, 0.6s blue box-shadow) |
| Active highlight | Inline comment | Class toggle `.active` with `background-color` transition |
| Pin hover | Annotation pin | `transform: scale(1.2)` via CSS transition |

### New animation: Status transition

When a feedback item's status changes (e.g., pending -> addressed), briefly flash the card:

```css
@keyframes feedback-status-change {
  0%   { opacity: 1; }
  30%  { opacity: 0.6; }
  100% { opacity: 1; }
}
.feedback-status-changed {
  animation: feedback-status-change 0.4s ease-in-out;
}
```

---

## 6. Z-Index Layer Map

The app uses these z-index layers (relevant for positioning the feedback panel):

| Layer | z-index | Usage |
|---|---|---|
| Tab bar (sticky) | `z-30` | Sticky tab navigation |
| Header | `z-40` | Sticky page header |
| Popover / tooltip | `z-50` | Inline comment popover, annotation tooltip, lightbox |
| Modal / dialog | `z-[100]` | Approve confirm, external review confirm |

The feedback panel sits within the sidebar at the same level as existing content (no special z-index needed). Popover menus inside the feedback panel should use `z-50`.

---

## 7. Composite Token Reference (Quick Copy)

### Feedback Status Badge

```tsx
<span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${feedbackStatusColors[status]}`}>
  {status}
</span>
```

### Origin Badge

```tsx
<span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${originColors[origin]}`}>
  <span aria-hidden="true">{originIcons[origin]}</span>
  {origin}
</span>
```

### Feedback Card

```tsx
<div className={`p-2.5 rounded-lg border border-l-[3px] ${statusBorderLeft[status]} ${statusBackground[status]} hover:border-teal-400 dark:hover:border-teal-500 transition-colors cursor-pointer group`}>
  <div className="flex items-center gap-2 mb-1">
    {/* Origin badge */}
    {/* Status badge */}
    {/* Visit counter */}
  </div>
  <p className="text-xs text-stone-700 dark:text-stone-300 line-clamp-3">
    {feedback.description}
  </p>
  <div className="flex gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
    {/* Action buttons */}
  </div>
</div>
```

### Visit Counter

```tsx
<span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold leading-none ${visitCounterClasses(visits)}`}>
  {visits}x
</span>
```
