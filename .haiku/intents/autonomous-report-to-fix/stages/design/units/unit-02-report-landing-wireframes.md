---
title: Report landing page wireframes (4 states × 3 breakpoints)
model: sonnet
depends_on: []
inputs:
  - intent.md
  - knowledge/DESIGN-BRIEF.md
  - knowledge/DESIGN-SYSTEM-ANCHOR.md
  - knowledge/DESIGN-TOKENS.md
  - stages/inception/artifacts/affected-surfaces-and-user-flow.md
  - stages/inception/artifacts/success-criteria-and-acceptance-shape.md
  - stages/inception/artifacts/capability-and-system-context.md
  - >-
    .haiku/intents/autonomous-report-to-fix/stages/inception/artifacts/affected-surfaces-and-user-flow.md
  - >-
    .haiku/intents/autonomous-report-to-fix/stages/inception/artifacts/success-criteria-and-acceptance-shape.md
  - >-
    .haiku/intents/autonomous-report-to-fix/stages/inception/artifacts/capability-and-system-context.md
  - 'website/app/auth/[provider]/callback/CallbackClient.tsx'
  - website/next.config.ts
outputs:
  - >-
    .haiku/intents/autonomous-report-to-fix/stages/design/artifacts/report-landing/index.md
  - >-
    .haiku/intents/autonomous-report-to-fix/stages/design/artifacts/report-landing/loading.html
  - >-
    .haiku/intents/autonomous-report-to-fix/stages/design/artifacts/report-landing/auth-prompt.html
  - >-
    .haiku/intents/autonomous-report-to-fix/stages/design/artifacts/report-landing/status.html
  - >-
    .haiku/intents/autonomous-report-to-fix/stages/design/artifacts/report-landing/error.html
  - knowledge/DESIGN-SYSTEM-ANCHOR.md
  - stages/design/artifacts/report-landing/auth-prompt.html
  - stages/design/artifacts/report-landing/error.html
  - stages/design/artifacts/report-landing/index.md
  - stages/design/artifacts/report-landing/loading.html
  - stages/design/artifacts/report-landing/status.html
quality_gates:
  - name: index-exists
    command: >-
      test -s
      .haiku/intents/autonomous-report-to-fix/stages/design/artifacts/report-landing/index.md
  - name: all-four-states-have-html
    command: >-
      test -s
      .haiku/intents/autonomous-report-to-fix/stages/design/artifacts/report-landing/loading.html
      && test -s
      .haiku/intents/autonomous-report-to-fix/stages/design/artifacts/report-landing/auth-prompt.html
      && test -s
      .haiku/intents/autonomous-report-to-fix/stages/design/artifacts/report-landing/status.html
      && test -s
      .haiku/intents/autonomous-report-to-fix/stages/design/artifacts/report-landing/error.html
  - name: wcag-aa-contrast-table-present
    command: >-
      grep -qE '4\.5:1|3:1'
      .haiku/intents/autonomous-report-to-fix/stages/design/artifacts/report-landing/index.md
      && grep -qiE 'contrast'
      .haiku/intents/autonomous-report-to-fix/stages/design/artifacts/report-landing/index.md
  - name: color-independence-section-present
    command: >-
      grep -qiE 'color independence|color.alone|non-color cue'
      .haiku/intents/autonomous-report-to-fix/stages/design/artifacts/report-landing/index.md
  - name: all-three-breakpoints-mentioned-in-index
    command: >-
      grep -q '375'
      .haiku/intents/autonomous-report-to-fix/stages/design/artifacts/report-landing/index.md
      && grep -q '768'
      .haiku/intents/autonomous-report-to-fix/stages/design/artifacts/report-landing/index.md
      && grep -q '1280'
      .haiku/intents/autonomous-report-to-fix/stages/design/artifacts/report-landing/index.md
  - name: interactive-states-table-present
    command: >-
      grep -q '^| Element'
      .haiku/intents/autonomous-report-to-fix/stages/design/artifacts/report-landing/index.md
      && grep -qiE 'default.*hover.*focus'
      .haiku/intents/autonomous-report-to-fix/stages/design/artifacts/report-landing/index.md
  - name: focus-column-cites-tailwind-ring
    command: >-
      grep -qE 'focus(-visible)?:ring|focus:outline|outline-'
      .haiku/intents/autonomous-report-to-fix/stages/design/artifacts/report-landing/index.md
  - name: touch-target-44px-asserted
    command: >-
      grep -qE '44px|min-h-\[44|h-11\b|py-2\.5'
      .haiku/intents/autonomous-report-to-fix/stages/design/artifacts/report-landing/index.md
  - name: status-substate-table-present
    command: >-
      grep -qiE 'cap_hit|ci_green|fix_in_progress'
      .haiku/intents/autonomous-report-to-fix/stages/design/artifacts/report-landing/index.md
  - name: auth-prompt-shows-disabled-variant
    command: >-
      grep -qiE 'disabled|aria-disabled'
      .haiku/intents/autonomous-report-to-fix/stages/design/artifacts/report-landing/auth-prompt.html
  - name: data-component-attributes-present
    command: >-
      grep -qE 'data-component='
      .haiku/intents/autonomous-report-to-fix/stages/design/artifacts/report-landing/loading.html
      && grep -qE 'data-component='
      .haiku/intents/autonomous-report-to-fix/stages/design/artifacts/report-landing/auth-prompt.html
      && grep -qE 'data-component='
      .haiku/intents/autonomous-report-to-fix/stages/design/artifacts/report-landing/status.html
      && grep -qE 'data-component='
      .haiku/intents/autonomous-report-to-fix/stages/design/artifacts/report-landing/error.html
  - name: aria-hidden-or-aria-label-on-icons
    command: >-
      grep -qE 'aria-hidden|aria-label'
      .haiku/intents/autonomous-report-to-fix/stages/design/artifacts/report-landing/auth-prompt.html
      && grep -qE 'aria-hidden|aria-label'
      .haiku/intents/autonomous-report-to-fix/stages/design/artifacts/report-landing/status.html
  - name: static-export-constraint-honored
    command: >-
      [ "$(grep -lE 'generateStaticParams|getStaticProps|getServerSideProps'
      .haiku/intents/autonomous-report-to-fix/stages/design/artifacts/report-landing/*.html
      2>/dev/null | wc -l | tr -d ' ')" = '0' ]
status: active
bolt: 1
hat: designer-prep
started_at: '2026-05-08T17:53:50Z'
hat_started_at: '2026-05-08T17:53:50Z'
iterations:
  - hat: designer-prep
    started_at: '2026-05-08T17:53:50Z'
    completed_at: '2026-05-08T18:08:02Z'
    result: advance
  - hat: designer
    started_at: '2026-05-08T18:08:02Z'
    completed_at: null
    result: null
---
# Report Landing Page Wireframes

## Topic

Produce HTML wireframes for the `haikumethod.ai/report/[fix_id]` SPA across all four content states (loading, auth-prompt, status, error) at all three breakpoints (mobile 375px, tablet 768px, desktop 1280px). Plus an `index.md` that holds the per-element interactive-states table (default / hover / focus / active / disabled / error / loading), responsive behavior notes, focus order, `aria-live` regions, the WCAG AA contrast table, and the color-independence specification.

This is the only surface that has visual wireframes — the other three surfaces (skill conversation, GitHub issue body, GitHub PR description) are text-medium.

## Why this is its own unit

The landing page is the user's only visual touchpoint with the loop. Every interactive affordance on it (OAuth grant button, skip link, retry button, issue/PR pills, status icon cluster) needs full state coverage and breakpoint coverage — that's substantial design surface area. Splitting it from the GitHub-templates unit (which is markdown only) means the design provider question (Tailwind tokens, accessibility checks, breakpoint behavior) doesn't dilute attention on the simpler templates. Splitting it from the skill flow unit means terminal-medium concerns don't bleed into web-medium concerns.

## Completion criteria

The artifact at `.haiku/intents/autonomous-report-to-fix/stages/design/artifacts/report-landing/` MUST contain:

### `index.md`

- Names the four content states and links to each `.html` file.
- Includes a per-element interactive-states table covering: status icon cluster, primary CTA (OAuth grant button), skip link, issue/PR pills, retry button — with columns `default | hover | focus | active | disabled | error | loading`. The `focus` column MUST be non-empty for every interactive row and MUST name the Tailwind class providing the visible focus ring (e.g., `focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-teal-500`). Elements that intentionally suppress the browser default MUST cite the custom replacement. En-dash (`—`) is not permitted in the focus column.
- Names all three breakpoints (375px, 768px, 1280px) and the responsive change at each — what reflows, what stays.
- States touch-target rule for the mobile breakpoint: every interactive element ≥ 44px (verified by 44px / `min-h-[44…` / `h-11` / `py-2.5` cited per element).
- Documents focus order for keyboard users and the `aria-live` region(s) used for status updates.
- Includes a **`## WCAG AA contrast table`** listing every foreground/background token pairing used across the four states with the measured contrast ratio. Each row asserts the pairing meets WCAG AA: `4.5:1` for body text, `3:1` for large text (≥18px or ≥14px bold) and UI component boundaries (buttons, input borders, focus rings). Dark-mode pairings are listed separately. The numeric thresholds `4.5:1` and `3:1` MUST appear verbatim in the document.
- Includes a **`## Color independence`** section for the status icon cluster explicitly stating what non-color cue (icon shape, text label, or `aria-label` value) conveys each state. Each of the four content states MUST have at least one non-color differentiator named (e.g., a visible status label string or a distinctly shaped SVG icon, not relying on fill color alone).
- Includes a **`## status.html` sub-states table** mapping each inception state to the visible content in `status.html`. The table MUST include rows naming at least: `received`, `issue_open`, `pr_open` / `fix_in_progress`, `ci_green`, `cap_hit`, `merged`. Columns: heading text, issue/PR pill state, status note. Each sub-state's rendering must be visually distinct — at minimum the heading and status note change. The literal token strings `cap_hit`, `ci_green`, and `fix_in_progress` MUST appear verbatim.
- Cites the `CallbackClient.tsx` precedent for the auth state-machine pattern (so the build hat reuses it).

### Four `.html` files

`loading.html`, `auth-prompt.html`, `status.html`, `error.html`. Each:

- Contains a single component tree using Tailwind v4 utility classes from `DESIGN-TOKENS.md` and `DESIGN-SYSTEM-ANCHOR.md`.
- References ONLY named tokens — no raw hex colors, no `#xxxxxx`, no inline `style="color: …"` outside what the existing site uses.
- Uses semantic HTML (`button`, `a`, `h1`).
- Top-level wrapper element MUST carry a `data-component=` attribute whose value matches the proposed React component name in PascalCase (e.g., `data-component="ReportLoading"`, `data-component="ReportAuthPrompt"`, `data-component="ReportStatus"`, `data-component="ReportError"`). Component names MUST follow the PascalCase convention used throughout the existing site.
- Decorative icons MUST carry `aria-hidden="true"`. Functional icon-only elements MUST carry `aria-label` whose value matches the visible tooltip or label text. The status icon cluster MUST carry an `aria-label` naming the state (e.g., `aria-label="Fix in progress"`).
- Does NOT include Next.js server primitives (`generateStaticParams`, `getStaticProps`, `getServerSideProps`) — the page must be client-rendered per the static-export constraint in `next.config.ts`.
- The dark-mode counterparts of every color token are present in the markup (`dark:bg-stone-900`, etc.) per the design system anchor.

### Element-state demonstrations (REQUIRED in HTML, not just the table)

The interactive-states table documents intent. The HTML must demonstrate it:

- `auth-prompt.html` MUST include both the **enabled AND disabled** variants of the OAuth grant button — either as a comment-separated pair (`<!-- disabled state: -->` then the disabled markup) or as sibling elements with explicit ARIA disabled state.
- `error.html` MUST show the retry button in its error/disabled-during-retry state — same comment-separated or sibling-element pattern.

This is the only way a visual reviewer can approve element-state coverage without running the app.

### Coverage of inception lifecycle states

The four content-state files together MUST cover the lifecycle transitions named in the inception state-machine: `received`, `attributed`, `issue_open`, `pr_open`, `fix_in_progress`, `ci_green`, `cap_hit`, `merged`. The `status.html` file is responsible for rendering 6+ of these via the conditional sub-states table above; the others (`received` may render in `loading.html` until the issue opens) are mapped in the `status.html` sub-states table or in the lifecycle-coverage notes.

## Notes for the designer

- The design brief enumerates each state's component inventory in detail — use that as the authoritative input. Don't re-design from scratch.
- The design system anchor cites every utility-class pattern with file:line provenance — copy the patterns, don't invent new ones.
- The design tokens artifact maps every semantic token to its Tailwind class — use semantic names in the wireframe markup where possible (the build hat will translate to literal classes when implementing).

## Out of scope

The artifact MUST NOT specify the API contract for fetching fix-id status (development stage owns that). The artifact MUST NOT pick a state-store backend (operations stage owns that). It specifies what the user sees and how it reflows; nothing about data fetching.
