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
  - name: no-raw-hex-colors
    command: >-
      ! grep -rEn '#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b'
      .haiku/intents/autonomous-report-to-fix/stages/design/artifacts/report-landing/*.html
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
      && grep -qiE 'default|hover|focus|active|disabled'
      .haiku/intents/autonomous-report-to-fix/stages/design/artifacts/report-landing/index.md
  - name: touch-target-44px-asserted
    command: >-
      grep -qE '44px|min-h-\[44|h-11\b|py-2\.5'
      .haiku/intents/autonomous-report-to-fix/stages/design/artifacts/report-landing/index.md
  - name: static-export-constraint-honored
    command: >-
      ! grep -E 'generateStaticParams|getStaticProps|getServerSideProps'
      .haiku/intents/autonomous-report-to-fix/stages/design/artifacts/report-landing/*.html
status: pending
---
# Report Landing Page Wireframes

## Topic

Produce HTML wireframes for the `haikumethod.ai/report/[id]` SPA across all four content states (loading, auth-prompt, status, error) at all three breakpoints (mobile 375px, tablet 768px, desktop 1280px). Plus an `index.md` that holds the per-element interactive-states table (default / hover / focus / active / disabled / error / loading), responsive behavior notes, focus order, and `aria-live` regions.

This is the only surface that has visual wireframes — the other three surfaces (skill conversation, GitHub issue body, GitHub PR description) are text-medium.

## Why this is its own unit

The landing page is the user's only visual touchpoint with the loop. Every interactive affordance on it (OAuth grant button, skip link, retry button, issue/PR pills, status icon cluster) needs full state coverage and breakpoint coverage — that's substantial design surface area. Splitting it from the GitHub-templates unit (which is markdown only) means the design provider question (Tailwind tokens, accessibility checks, breakpoint behavior) doesn't dilute attention on the simpler templates. Splitting it from the skill flow unit means terminal-medium concerns don't bleed into web-medium concerns.

## Completion criteria

The artifact at `.haiku/intents/autonomous-report-to-fix/stages/design/artifacts/report-landing/` MUST contain:

- An `index.md` that:
  - Names the four content states and links to each `.html` file
  - Includes a per-element interactive-states table covering: status icon cluster, primary CTA (OAuth grant button), skip link, issue/PR pills, retry button — with columns `default | hover | focus | active | disabled | error | loading` (en-dash for not-applicable)
  - Names all three breakpoints (375px, 768px, 1280px) and the responsive change at each — what reflows, what stays
  - States touch-target rule for the mobile breakpoint: every interactive element ≥ 44px (verified by 44px / `min-h-[44…` / `h-11` / `py-2.5` cited per element)
  - Documents focus order for keyboard users and the `aria-live` region(s) used for status updates
  - Cites the `CallbackClient.tsx` precedent for the auth state-machine pattern (so the build hat reuses it)
- Four `.html` files (`loading.html`, `auth-prompt.html`, `status.html`, `error.html`), each:
  - Contains a single component tree using Tailwind v4 utility classes from `DESIGN-TOKENS.md` and `DESIGN-SYSTEM-ANCHOR.md`
  - References ONLY named tokens — no raw hex colors, no `#xxxxxx`, no inline `style="color: …"` outside what the existing site uses
  - Uses semantic HTML (button, a, h1) and includes role / aria-* attributes that match the design brief's accessibility spec
  - Does NOT include Next.js server primitives (`generateStaticParams`, `getStaticProps`, `getServerSideProps`) — the page must be client-rendered per the static-export constraint in `next.config.ts`
- The four states cover at least the transitions named in the inception state-machine: intake-received, OAuth granted/declined, issue opened, PR opened, fix iteration cap hit, PR merged. Each state's HTML reflects what the user sees at that point in the lifecycle.
- The dark-mode counterparts of every color token are present in the markup (`dark:bg-stone-900`, etc.) per the design system anchor.

The artifact MUST NOT specify the API contract for fetching fix-id status (development stage owns that). The artifact MUST NOT pick a state-store backend (operations stage owns that). It specifies what the user sees and how it reflows; nothing about data fetching.

## Notes for the designer

- The design brief enumerates each state's component inventory in detail — use that as the authoritative input. Don't re-design from scratch.
- The design system anchor cites every utility-class pattern with file:line provenance — copy the patterns, don't invent new ones.
- The design tokens artifact maps every semantic token to its Tailwind class — use semantic names in the wireframe markup where possible (the build hat will translate to literal classes when implementing).
