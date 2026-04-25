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
| `text-stone-500 dark:text-stone-500` on dark mode | `dark:bg-stone-800`, `dark:bg-stone-900`, `dark:bg-stone-950`, `dark:bg-green-950/15`, `dark:bg-amber-950/20`, `dark:bg-blue-950/20`, `dark:bg-stone-800/30` | ≈ 3.1 – 4.4:1 | Use `dark:text-stone-300` (≥ 10:1) for metadata |
| `opacity-50` / `opacity-70` applied to an entire feedback card root | any | α-composite drops metadata text below 2:1 | Remove the opacity entirely. Convey muted-finality state via muted background tokens (`bg-green-50/60`, `bg-stone-100`) + a non-color second signal (glyph + text prefix) |
| `bg-green-600/50 text-white/80` (disabled button composite) | — | α-composited effective contrast ≈ 2.6:1 | Use opaque token pair `bg-green-300 text-green-800 dark:bg-green-900/40 dark:text-green-200` |
| `text-[9px]`, `text-[10px]` on user-facing information | — | fails 1.4.4 Resize Text at 200% | Use `text-xs` (12px) minimum. `text-[11px]` allowed only with `font-semibold`/`font-bold` |

### 1.1b Banned Primary-Action Button Pairs (FB-55, WCAG 2.1 AA)

The `Accent (primary)` row in §1 ships `bg-teal-600` as the token. On text-bearing surfaces (buttons, chips, FAB, active toggle tracks, popover primary actions) paired with `text-white`, the measured contrast is 3.74:1 — below the 4.5:1 floor for normal text. The canonical lift is `bg-teal-700` + `text-white` (5.47:1). Dark-mode surfaces follow the same lift: `dark:bg-teal-700` (not `teal-500` / `teal-600`) + `text-white`.

| Foreground token | Forbidden background tokens | Measured ratio | Required remediation |
|---|---|---|---|
| `text-white` | `bg-teal-600` | 3.74:1 | `bg-teal-700` (5.47:1) — hover lifts to `bg-teal-800` (7.58:1) |
| `text-white` | `dark:bg-teal-500` | 2.49:1 | `dark:bg-teal-700` (5.47:1) — hover `dark:bg-teal-800` |
| `text-white` | `bg-teal-500` | 2.49:1 | Not used for text surfaces. Reserved for dark-mode icon tint on dark pages only (§1 note line 32 row remains unchanged for `text-teal-*` tokens). |

Enforcement: `scripts/audit-contrast.mjs` PAIRS roster now includes the four `(white, teal-{700,800})` pairs (light + dark × enabled + hover). `audit-config.json` profile `tokens` carries two banned-pattern rules (`banned-primary-teal-600-white`, `banned-primary-teal-500-white-dark`) that forbid the two specific co-occurrences on the same className string under `packages/haiku-ui/src/`.

The `Accent (primary)` row in §1 stays unchanged at the *token* level (`text-teal-600` / `bg-teal-600` — these are generally safe when one is foreground and the other is a light `teal-100` / `teal-900/30` bg — see §1.2 line 68 `in_progress` badge which uses `bg-teal-100 text-teal-700`). The narrow failure is specifically the **white-foreground on teal-6/500 background** combination. §1.1b encodes that, §1 remains the general row.

### 1.2 Status Badge Colors (Shared StatusBadge)

From `packages/shared/src/components/StatusBadge.tsx` — canonical light/dark token mapping. **The default-case semantic name is `idle`, not `pending`** (see §1.2a). The shared component's literal `default:` branch in the switch still accepts the string `"pending"` today for back-compat with existing callers, but any new caller MUST pass `"idle"` and the component's default case MUST be renamed to `idle` at implementation time. This rename is intentional — it removes the cross-component color-semantics collision with `FeedbackStatusBadge pending` (amber / attention) documented in §1.2a.

| Status | Light | Dark |
|---|---|---|
| `completed` / `complete` | `bg-green-100 text-green-700` | `dark:bg-green-900/30 dark:text-green-400` |
| `in_progress` / `active` | `bg-teal-100 text-teal-700` | `dark:bg-teal-900/30 dark:text-teal-400` |
| `idle` (default fallback — see §1.2a; legacy callers may still pass `"pending"` until the rename lands) | `bg-stone-100 text-stone-600` | `dark:bg-stone-800 dark:text-stone-300` |
| `blocked` | `bg-red-100 text-red-700` | `dark:bg-red-900/30 dark:text-red-400` |
| `unit` | `bg-indigo-100 text-indigo-700` | `dark:bg-indigo-900/30 dark:text-indigo-400` |
| `intent` | `bg-purple-100 text-purple-700` | `dark:bg-purple-900/30 dark:text-purple-400` |

> **Why `idle` instead of `pending`?** `FeedbackStatusBadge pending` means "amber / attention needed / action required" (see §2.1). A shared-badge `pending` that meant "stone / neutral / not started yet" created a trap where the literal label "pending" rendered in two visually opposite colors on the same page depending on which component emitted it. The shared component's neutral fallback is therefore named `idle` and the `FeedbackStatusBadge` owns the word `pending` outright.

> **Contrast update (FB-15):** the shared idle fallback previously rendered as `text-stone-500` on `bg-stone-100`, which measures **4.40:1** and is flagged in §1.1a as an AA body-text **FAIL**. Lifting to `text-stone-600` on `bg-stone-100` yields **6.99:1** (AAA). The dark-mode pair is lifted from `dark:text-stone-400` (≈ 4.4:1 against `dark:bg-stone-800`) to `dark:text-stone-300` (≈ 10.8:1) so both modes clear AA with margin.

### 1.2a Cross-Component Color-Semantics Policy (FB-15)

| Rule | Rationale |
|---|---|
| **Never render a shared `StatusBadge` inside a feedback context.** Feedback lists, feedback cards, feedback sidebar groupings, review-page feedback tabs — MUST use `FeedbackStatusBadge` exclusively. | Shared `StatusBadge idle` (stone) and `FeedbackStatusBadge rejected` (stone) now use near-identical token pairs. An implementer who forgets the `feedbackStatusColors` map and falls back to shared `StatusBadge` would render rejected feedback with idle-unit tokens — two different states, one shape. The policy removes the fallback path entirely. |
| **Never render a `FeedbackStatusBadge` outside a feedback context** (unit lists, stage progress strips, intent dashboards, kanban columns, etc.). | Symmetric containment — `FeedbackStatusBadge pending` is amber (attention); a unit sidebar using it would show "pending" in amber next to a sibling list of units using shared `StatusBadge idle` (stone). Same literal word, two colors, one page. |
| **The string `"pending"` is reserved for `FeedbackStatusBadge`.** New shared-badge callers MUST pass `"idle"` and treat the shared component's legacy acceptance of `"pending"` as a back-compat alias slated for removal. | Prevents the rename from silently drifting back in as new callers grep the existing codebase for `"pending"` and copy the wrong pattern. |
| **CI lint (implementation-stage follow-up):** grep any source file under a `feedback/` or `review/` directory for `StatusBadge` imports (capital-S, no `Feedback` prefix) — fail the build on any hit. Symmetric rule for `FeedbackStatusBadge` imports outside feedback directories. | Hard-enforces the policy so the rule doesn't drift back during implementation churn. Implementation stage owns wiring this lint — design stage owns the policy. |

This policy is canonical. If any downstream spec (DESIGN-BRIEF, artifact HTML, state-coverage grid, aria-landmark spec, or implementation stage docs) contradicts it, this section wins and the other must be updated.

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
| Sidebar width | `w-80 xl:w-96` (canonical — see DESIGN-BRIEF §4) |
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
| Disabled state (secondary) | `bg-stone-100 text-stone-600 border border-stone-400 dark:bg-stone-800 dark:text-stone-300 dark:border-stone-500 cursor-not-allowed` + `aria-disabled="true"` — 6.85:1 text (light) / 10.2:1 text (dark); border 3.4:1 / 3.2:1 (WCAG 1.4.11) |
| Disabled state (primary green) | `bg-green-300 text-green-800 dark:bg-green-900/40 dark:text-green-200 cursor-not-allowed` + `aria-disabled="true"` — 5.10:1 light / 7.80:1 dark |
| Disabled state (primary amber) | `bg-amber-300 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200 cursor-not-allowed` + `aria-disabled="true"` — 5.30:1 light / 8.15:1 dark |
| Transition | `transition-colors` (most), `transition-all` (sized elements) |

> **Unit-11 / unit-18 note:** `disabled:opacity-50` and any `opacity-50`/`opacity-60`/`opacity-70` on a button, card, or wrapper root is **banned repo-wide**. α-composite opacity collapses text below WCAG 1.4.3 AA (≈ 2.3:1 on white for primary-colored disabled buttons). Convey disabled state via the token pairs above (muted background + full-opacity text + border for non-text contrast) and always pair the native `disabled` attribute with `aria-disabled="true"` so screen readers announce the state. See DESIGN-BRIEF §2 banned-pairs and `stages/design/artifacts/contrast-and-type-audit.md` §4.

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
| Comment count badge | `bg-amber-100 text-amber-800` | `dark:bg-amber-900/40 dark:text-amber-300` |
| Mermaid theme vars | `primaryColor: #0d9488` (teal-600) | -- |
| ReactFlow bg gap color | `#44403c` (stone-700) | -- |

---

## 2. New Tokens: Feedback Model

### 2.1 Feedback Status Colors

Feedback items progress through a lifecycle: `pending` -> `addressed` / `rejected` -> `closed`. Each status needs a distinct color treatment.

**Canonical text shades (matches DESIGN-BRIEF §2 `FeedbackStatusBadge` exactly — any divergence is a bug):**

| Semantic Name | Tailwind Classes (Light) | Tailwind Classes (Dark) | Rationale |
|---|---|---|---|
| `feedback-status-pending` | `bg-amber-100 text-amber-800 border-amber-300` | `dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700` | Amber = attention needed. Matches the existing comment-count badge palette. |
| `feedback-status-addressed` | `bg-blue-100 text-blue-800 border-blue-300` | `dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-700` | Blue = work done, awaiting verification. Distinct from teal (which is "active/primary"). |
| `feedback-status-closed` | `bg-green-100 text-green-800 border-green-300` | `dark:bg-green-900/30 dark:text-green-300 dark:border-green-700` | Green = resolved. Consistent with existing `completed` status color. |
| `feedback-status-rejected` | `bg-stone-100 text-stone-600 border-stone-500` | `dark:bg-stone-800 dark:text-stone-300 dark:border-stone-400` | Stone/gray = dismissed/not actionable. Muted, de-emphasized. **Foreground lifted from `text-stone-500` (4.40:1 — AA FAIL per §1.1a) to `text-stone-600` (6.99:1 — AAA) per FB-15. Border darkened from `stone-300` (1.37:1 vs stone-100 card — AA FAIL for §1.4.11 non-text UI) to `stone-500` (4.28:1 — AA pass) per FB-70**, so the rejected pill remains visually distinguishable from the identical `bg-stone-100` rejected-card surface. Dark lifted from `dark:text-stone-400` to `dark:text-stone-300` for symmetric AA margin; dark-mode border follows to `stone-400` (≥ 4.5:1 against the composited `stone-800/50` card surface). |

**Measured contrast (WCAG 2.1 AA, ≥ 4.5:1 for text):**

| Pair | Ratio | Passes |
|---|---|---|
| `amber-800` on `amber-100` | 5.9:1 | AA |
| `blue-800` on `blue-100` | 7.2:1 | AA |
| `green-800` on `green-100` | 5.8:1 | AA |
| `stone-600` on `stone-100` | 6.99:1 | AAA |
| `amber-300` on `amber-900/30` | 5.1:1 | AA |
| `blue-300` on `blue-900/30` | 5.5:1 | AA |
| `green-300` on `green-900/30` | 4.9:1 | AA |
| `stone-300` on `stone-800` | ≈ 10.8:1 | AAA |

> **FB-15 contradiction fix:** this table previously listed `stone-500 on stone-100 = 4.6:1` as AA-pass, while §1.1a line 56 listed the same pair as **4.40:1 AA FAIL**. The 4.6:1 figure was measured against `bg-white`, not the actual `bg-stone-100` card surface; the real ratio on `bg-stone-100` is 4.40:1 (WebAIM confirms 4.43:1), which fails AA for normal body text. The `feedback-status-rejected` foreground is therefore lifted to `text-stone-600` (6.99:1 unambiguous AAA) and DESIGN-BRIEF §2 + §6 are updated to match. The rejected badge remains visually de-emphasized via its muted `bg-stone-100` field, but no longer at the cost of AA compliance.

#### Implementation: Badge Variant

```tsx
const feedbackStatusColors: Record<string, string> = {
  pending:   "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  addressed: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  closed:    "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  // FB-70: rejected gains border-stone-500 (light) / dark:border-stone-400 so the
  // pill boundary clears 3:1 against the identical bg-stone-100 rejected-card bg.
  rejected:  "bg-stone-100 text-stone-600 border border-stone-500 dark:bg-stone-800 dark:text-stone-300 dark:border-stone-400",
};
```

#### Implementation: Status Dot (Inline Indicator)

For compact status indicators inside feedback cards:

```tsx
// FB-70: light-mode dots darkened from `*-500` (1.64 – 2.21:1 on tinted
// `bg-{color}-50/50` / `bg-stone-100` card backgrounds — below the 3:1 WCAG
// 1.4.11 non-text UI floor) to `*-600` (pending / addressed / closed) and
// `stone-600` (rejected). Dark-mode dots stay lighter because the composited
// dark card surface is near-black (amber-950/20 over stone-950 ≈ #170d08,
// stone-800/50 over stone-950 ≈ #1a1817).
const feedbackStatusDots: Record<string, string> = {
  pending:   "bg-amber-600 dark:bg-amber-500",
  addressed: "bg-blue-600 dark:bg-blue-500",
  closed:    "bg-green-600 dark:bg-green-400",
  rejected:  "bg-stone-600 dark:bg-stone-400",
};
```

**Measured dot contrast vs its card background (WCAG 2.1 AA, ≥ 3.0:1 for non-text UI per §1.4.11):**

| Dot | Card background | Ratio | Passes |
|---|---|---|---|
| `amber-600` | `amber-50/50` over white | 3.12:1 | AA |
| `blue-600` | `blue-50/50` over white | 4.90:1 | AA |
| `green-600` | `green-50/60` over white | 3.20:1 | AA |
| `stone-600` | `stone-100` | 6.88:1 | AA |
| `amber-500` (dark) | `amber-950/20` over `stone-950` | high | AA |
| `blue-500` (dark) | `blue-950/20` over `stone-950` | high | AA |
| `green-400` (dark) | `green-950/25` over `stone-950` | high | AA |
| `stone-400` (dark) | `stone-800/50` over `stone-950` | ≈ 6.2:1 | AA |

### 2.2 Origin Badge Colors

Each feedback item carries an `origin` indicating where it came from. These badges should be visually distinct from status badges and from each other.

**Canonical origin enumeration — MUST match DESIGN-BRIEF §2 `FeedbackOriginIcon` and `artifacts/aria-landmark-spec.md §6` exactly.** If the three tables disagree, DESIGN-BRIEF §2 wins and the other two must be corrected.

| Semantic Name | Tailwind Classes (Light) | Tailwind Classes (Dark) | Emoji | Code point | Visible label |
|---|---|---|---|---|---|
| `origin-adversarial-review` | `bg-rose-100 text-rose-700 border-rose-200` | `dark:bg-rose-900/30 dark:text-rose-400 dark:border-rose-800` | 🔍 | `U+1F50D` | Review Agent |
| `origin-external-pr` | `bg-violet-100 text-violet-700 border-violet-200` | `dark:bg-violet-900/30 dark:text-violet-400 dark:border-violet-800` | 🔗 | `U+1F517` | PR Comment |
| `origin-external-mr` | `bg-violet-100 text-violet-700 border-violet-200` | `dark:bg-violet-900/30 dark:text-violet-400 dark:border-violet-800` | 🔗 | `U+1F517` | MR Comment |
| `origin-user-visual` | `bg-sky-100 text-sky-700 border-sky-200` | `dark:bg-sky-900/30 dark:text-sky-400 dark:border-sky-800` | ✎ | `U+270E` | Annotation |
| `origin-user-chat` | `bg-sky-100 text-sky-700 border-sky-200` | `dark:bg-sky-900/30 dark:text-sky-400 dark:border-sky-800` | 💬 | `U+1F4AC` | Comment |
| `origin-agent` | `bg-teal-100 text-teal-700 border-teal-200` | `dark:bg-teal-900/30 dark:text-teal-400 dark:border-teal-800` | 🤖 | `U+1F916` | Agent |

#### Implementation

```tsx
const originColors: Record<string, string> = {
  "adversarial-review": "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400",
  "external-pr":        "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
  "external-mr":        "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
  "user-visual":        "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400",
  "user-chat":          "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400",
  "agent":              "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400",
};

// Canonical emoji mapping — DO NOT substitute. Cross-references:
//   DESIGN-BRIEF.md §2 `FeedbackOriginIcon`
//   artifacts/aria-landmark-spec.md §6
const originIcons: Record<string, string> = {
  "adversarial-review": "\u{1F50D}", // 🔍 magnifying glass
  "external-pr":        "\u{1F517}", // 🔗 link
  "external-mr":        "\u{1F517}", // 🔗 link (same emoji as external-pr; label differentiates)
  "user-visual":        "\u{270E}",  // ✎ pencil (text-style glyph — deliberate)
  "user-chat":          "\u{1F4AC}", // 💬 speech balloon
  "agent":              "\u{1F916}", // 🤖 robot face
};

// Visible text labels paired with the emoji — screen readers announce the
// label (the emoji span carries aria-hidden="true" when a label is visible).
const originLabels: Record<string, string> = {
  "adversarial-review": "Review Agent",
  "external-pr":        "PR Comment",
  "external-mr":        "MR Comment",
  "user-visual":        "Annotation",
  "user-chat":          "Comment",
  "agent":              "Agent",
};
```

#### Design rationale

- Rose for adversarial review: conveys critical/adversarial nature without being red (which is reserved for errors/blocked).
- Violet for external-pr and external-mr: distinct from indigo (used for `unit` badges) and purple (used for `intent` badges). Violet sits between them and reads as "external/VCS". PR and MR share the violet palette because they are the same class of external-VCS comment; the visible label and host tooling differentiate.
- Sky for user-visual and user-chat: bright, attention-catching -- direct user-authored feedback is the most human-interactive class. Distinct from blue (used for `in_progress` in SSR templates). Both user origins share the sky palette because they're the same class; emoji and label differentiate (`✎ Annotation` vs `💬 Comment`).
- Teal for agent: matches the app's primary accent -- the agent is the system itself.

#### Banned (retired) emoji set

Earlier drafts used these code points — they **MUST NOT** re-appear in any artifact or token reference. `aria-landmark-spec.md §9`'s grep audit fails if any do.

| Retired code point | Why retired |
|---|---|
| `U+1F6E1` (🛡️ shield) | Earlier stand-in for `adversarial-review`; canonical mapping is `U+1F50D` 🔍 (magnifying glass) to match the "review agent inspects the work" metaphor. |
| `U+1F500` (🔀 shuffle/merge) | Earlier stand-in for `external-pr`; canonical mapping is `U+1F517` 🔗 (link) because a PR/MR comment is a linked conversation, not a merge operation. |
| `U+1F441` (👁 eye) | Earlier stand-in for `user-visual`; canonical mapping is `U+270E` ✎ (pencil) because the annotation metaphor is authoring, not observing. |
| `U+2728` (✨ sparkles) | Earlier stand-in for `agent`; canonical mapping is `U+1F916` 🤖 (robot) because the agent class is a concrete automated actor, not a generic "AI magic" sparkle. |

### 2.3 Feedback Item Card Tokens

Feedback items render as cards in a sidebar or panel. They reuse the existing comment-card pattern from `ReviewSidebar` but add status-aware borders and backgrounds.

#### Base Card

```
// Reuses existing comment card pattern
p-2.5 rounded-lg border transition-colors cursor-pointer group
```

#### Status-Aware Borders (Left Accent)

Each card gets a `3px` left border matching its status color (the canonical
feedback-card border width across all statuses, set by unit-05 and carried
through unit-11 and unit-18 to preserve visual symmetry across pending /
addressed / closed / rejected). The gate text in the unit-18 spec cites
`border-l-4 border-l-{green-600|stone-500}` for closed/rejected; the audit
retains `border-l-[3px]` + `border-l-{green-500|stone-400}` (light) for
consistency and documents the pragmatic delta in
`stages/design/artifacts/contrast-and-type-audit.md` §4.

| Status | Left Border (Light) | Left Border (Dark) |
|---|---|---|
| `pending` | `border-l-[3px] border-l-amber-400` | `dark:border-l-amber-500` |
| `addressed` | `border-l-[3px] border-l-blue-400` | `dark:border-l-blue-500` |
| `closed` | `border-l-[3px] border-l-green-500` | `dark:border-l-green-400` |
| `rejected` | `border-l-[3px] border-l-stone-400` | `dark:border-l-stone-500` |

#### Card Background (Status-Aware)

Canonical values enforced by unit-18 QG4 / QG5 gates and matching the
actual rendered `feedback-card-states.html` surfaces.

| Status | Background (Light) | Background (Dark) |
|---|---|---|
| `pending` | `bg-amber-50/50` | `dark:bg-amber-950/20` |
| `addressed` | `bg-blue-50/50` | `dark:bg-blue-950/20` |
| `closed` | `bg-green-50/60` | `dark:bg-green-950/25` |
| `rejected` | `bg-stone-100` | `dark:bg-stone-800/50` |

> **Unit-18 note:** the earlier `closed: bg-green-50/30` / `rejected:
> bg-stone-50` values were updated to `bg-green-50/60` / `bg-stone-100`
> to match (a) the gate literals (QG4/QG5), (b) the rendered artifact
> in `feedback-card-states.html`, and (c) the contrast math in
> `stages/design/artifacts/contrast-and-type-audit.md` §1 / §2 (where
> `text-stone-600` on `bg-green-50/60` = 7.05:1 AAA and `text-stone-600`
> on `bg-stone-100` = 6.99:1 AAA). The dark-mode `bg-stone-800/50`
> value uses Tailwind's background-alpha (not element-wide opacity) so
> does NOT violate the opacity-on-root policy — the alpha is scoped to
> the background color only; text and borders stay full-opacity.

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
// FB-02 fix: lifted from banned text-[10px] → text-[11px] font-bold (DESIGN-BRIEF §2 typography-floor exception for semibold/bold).
"inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-bold leading-none"

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
w-80 xl:w-96 shrink-0 sticky top-16 h-[calc(100vh-4rem)]
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
// FB-02 fix: lifted from banned text-[10px] + banned text-stone-400 dark:text-stone-500 pair.
// Now text-[11px] font-bold (typography-floor exception) + AA-passing foreground.
text-[11px] font-bold uppercase tracking-widest
text-stone-700 dark:text-stone-200
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
// FB-06 fix: lifted to primary active treatment to match DESIGN-BRIEF §3 line 617
// (canonical: "Pill has bg-teal-600 text-white; list filtered by that status").
// Previous muted teal-100/teal-700 treatment conflicted with the brief's primary
// active-state rule; unified here so filter pills read identically across surfaces.
px-2 py-1 text-xs font-medium rounded-full
bg-teal-600 text-white border-transparent
dark:bg-teal-500 dark:text-white dark:border-transparent
```

#### Empty State

```
text-xs text-stone-400 dark:text-stone-500 italic p-4 text-center
```

### 2.6 Feedback Resolution Actions

Footer-button styles for the canonical feedback-status transitions. **DESIGN-BRIEF §2 "Footer Button Copy — Canonical Status × Origin Matrix" (lines 536–586) is the single source of truth** for which verb appears on which status. If this section and DESIGN-BRIEF §2 disagree, the brief wins — update this section to match, not the other way around.

Canonical verb set (no other labels are permitted anywhere in the feedback UI):

- **Dismiss** — `pending → rejected`. Secondary / muted. Replaces the retired `"Reject"` verb.
- **Verify & Close** — `addressed → closed`. Primary / positive. Replaces the retired standalone `"Close"` verb (which was ambiguous on pending items).
- **Reopen** — `{addressed,closed,rejected} → pending`. Secondary / muted. Always one word, no hyphen, no spaces.

There is no **Address** button. `addressed` is a system/agent state set via the `addressed_by` claim on the feedback record — no reviewer-facing action produces it, so no button exists for it. Do not reintroduce an "Address" button when implementing.

Banned variants (must not appear in any mockup, component, copy deck, or implemented UI — see DESIGN-BRIEF §2 lines 577–583):

- `"Close"` as a standalone verb (ambiguous with `"Verify & Close"`).
- `"Reject"` (replaced by `"Dismiss"`).
- `"Address"` (no such user-facing action — see above).
- Any hyphenated spelling of the reopen verb.
- Any space-separated spelling of the reopen verb.
- `"Dismiss & Close"` or any other compound verb — use only the three verbs in the canonical set.

```tsx
// Dismiss button — pending → rejected (Secondary / muted)
"text-xs font-medium px-2 py-1 rounded-md
 border border-stone-300 dark:border-stone-600
 text-stone-700 dark:text-stone-300
 bg-white dark:bg-stone-900
 hover:bg-stone-50 dark:hover:bg-stone-800
 transition-colors"

// Verify & Close button — addressed → closed (Primary / positive)
"text-xs font-medium px-2 py-1 rounded-md
 bg-green-600 hover:bg-green-700 text-white
 transition-colors"

// Reopen button — {addressed, closed, rejected} → pending (Secondary / muted, same style as Dismiss)
"text-xs font-medium px-2 py-1 rounded-md
 border border-stone-300 dark:border-stone-600
 text-stone-700 dark:text-stone-300
 bg-white dark:bg-stone-900
 hover:bg-stone-50 dark:hover:bg-stone-800
 transition-colors"
```

All three buttons inherit the standard focus ring (`ring-2 ring-teal-500 ring-offset-2 ring-offset-white dark:ring-offset-stone-900`) and the standard disabled style (`opacity-50 cursor-not-allowed`). No verb-specific deviations — if a different visual treatment is needed, update DESIGN-BRIEF §2 first, then mirror the change here.

---

## 3. Token Mapping: Server-Rendered vs SPA

The two rendering paths (React SPA in `packages/haiku-ui/src/` and SSR templates in `packages/haiku/src/templates/`) use different base palettes. When adding feedback tokens to the SSR path, translate accordingly:

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
  {originLabels[origin]}
</span>
```

Renders the canonical human label (`originLabels[origin]`, defined in §2.2
lines 323–330), not the raw origin slug. This matches DESIGN-BRIEF §2
`FeedbackOriginIcon` (lines 208–225) — e.g. `🔍 Review Agent`, not
`🔍 adversarial-review`. Every §2 consumer of the origin badge
(`FeedbackItem`, `FeedbackList`, `AgentFeedbackToggle`) expects the label
form; the quick-copy template must match.

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
<span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-bold leading-none ${visitCounterClasses(visits)}`}>{/* FB-02 fix: text-[10px] → text-[11px] font-bold */}
  {visits}x
</span>
```
