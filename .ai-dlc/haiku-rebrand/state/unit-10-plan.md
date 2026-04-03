# Unit 10: Website Homepage & Methodology — Implementation Plan

## Overview

Transform the ai-dlc website from a developer-focused documentation site into a business-audience methodology site for H·AI·K·U. Migrate design language from haiku-method (stone/teal palette, Inter font, Japanese-inspired minimal aesthetic). Create homepage with lifecycle visualization, methodology page, phase pages, and studios page.

## Current State Analysis

### Existing Infrastructure (Keep)
- Next.js 15.1.6, App Router, `output: "export"` (static)
- Tailwind CSS 4.0 with `@tailwindcss/typography`
- `next-themes` dark/light mode (class-based, system default)
- framer-motion 12.30.0 for animations
- Blog, docs, paper, changelog, glossary, templates, feeds — all preserved
- Header/Footer component architecture
- MegaMenu, MobileNav, BottomNav navigation components
- Plausible analytics, JSON-LD structured data

### What Changes
| Aspect | Current | Target |
|---|---|---|
| **Color palette** | gray-* + blue accents | stone-* + teal accents (from haiku-method) |
| **Font** | system UI sans-serif | Inter + system fallback |
| **Focus/selection** | blue-500 / blue-100 | teal-500 / teal-100 |
| **Homepage** | 2241-line story-driven dev guide | Business-audience lifecycle overview (~400-600 lines) |
| **Navigation** | How It Works, Install, Docs, Paper, Blog, Changelog | Methodology, Studios, Docs, Paper, Blog |
| **Branding** | "AI-DLC" logo text | "AI-DLC" with "A H·AI·K·U Profile" subtitle |
| **New pages** | None | /methodology, /methodology/[phase], /studios |
| **Phase colors** | N/A | Teal (elaboration), Indigo (execution), Amber (operation), Rose (reflection) |

### Source Material
- **Design system**: `/Volumes/dev/src/github.com/thebushidocollective/haiku-method/website/app/globals.css` — full color tokens, typography, prose styles
- **Homepage pattern**: `/Volumes/dev/src/github.com/thebushidocollective/haiku-method/website/app/page.tsx` — hero, lifecycle cards, profile cards, principles
- **Brand**: `/Volumes/dev/src/github.com/thebushidocollective/haiku-method/brand/naming.md` — name styling, taglines, visual identity
- **Content**: `/Volumes/dev/src/github.com/thebushidocollective/haiku-method/paper/haiku-method.md` — all methodology text

---

## Implementation Steps

### Step 1: Design System Migration — `globals.css`

**File**: `website/app/globals.css`

Replace the current gray/blue design system with haiku-method's stone/teal palette:

1. Add `@theme` block with complete color tokens from haiku-method:
   - Stone scale (50-950) for neutrals — replaces gray-*
   - Teal scale (50-900) for primary accent — replaces blue-*
   - Indigo, amber, rose for phase-specific colors
   - Inter font family for `--font-sans`
2. Update focus styles: `outline-blue-500` → `outline-teal-500`
3. Update selection colors: `bg-blue-100 text-blue-900` → `bg-teal-100 text-teal-900`
4. Update prose table styles: `gray-300/100/700/800` → `stone-300/100/700/800`
5. Update code block styles: `gray-100/800/900` → `stone-100/800/900`
6. Keep diff highlighting, print styles, hljs styles unchanged

**Key color mappings**:
```
gray-50  → stone-50    gray-500 → stone-500    gray-900 → stone-900
gray-100 → stone-100   gray-600 → stone-600    gray-950 → stone-950
gray-200 → stone-200   gray-700 → stone-700
gray-300 → stone-300   gray-800 → stone-800
```

### Step 2: Layout & Shared Components — Color Migration

Update all shared components from gray→stone, blue→teal palette.

**Files to modify**:

#### `website/app/layout.tsx`
- Body class: `bg-white text-gray-900 dark:bg-gray-950 dark:text-gray-100` → `bg-white text-stone-900 dark:bg-stone-950 dark:text-stone-100`
- Update metadata: Site title → "AI-DLC — A H·AI·K·U Profile" (or keep "AI-DLC" with updated description)
- Update SITE_DESCRIPTION to reflect universal methodology positioning

#### `website/lib/constants.ts`
- Update SITE_DESCRIPTION: "The software development profile of the H·AI·K·U universal lifecycle framework"

#### `website/app/components/Header.tsx`
- All `gray-*` classes → `stone-*` equivalents
- Border: `border-gray-200` → `border-stone-200`
- Background: `bg-white/95 dark:bg-gray-950/95` → `bg-white/95 dark:bg-stone-950/95`
- Active states, hover states: gray→stone throughout
- Logo: Keep "AI-DLC" text but style with font-bold tracking-tight
- Consider adding "A H·AI·K·U Profile" subtitle or keeping it minimal

#### `website/app/components/Footer.tsx`
- All `gray-*` → `stone-*`
- Background: `bg-gray-50 dark:bg-gray-900` → `bg-stone-50 dark:bg-stone-900`
- Update brand description text to reflect H·AI·K·U relationship

#### `website/app/components/ThemeToggle.tsx`
- Any gray references → stone

#### Navigation components (`MegaMenu.tsx`, `MobileNav.tsx`, `BottomNav.tsx`, `Breadcrumbs.tsx`)
- All gray-* → stone-*

### Step 3: Navigation Restructure

**File**: `website/lib/navigation.ts`

Update `primaryNavItems` for new site structure:
```typescript
[
  { title: "Methodology", href: "/methodology/", description: "How H·AI·K·U works" },
  { title: "Studios", href: "/studios/", description: "Domain profiles" },
  { title: "Docs", href: "/docs/", description: "Developer documentation" },
  { title: "Paper", href: "/paper/", description: "Full methodology paper" },
  { title: "Blog", href: "/blog/", description: "Updates and insights" },
]
```

Update `footerNavigation` to include new sections:
- **Framework**: Methodology, Phases (Elaboration, Execution, Operation, Reflection), Studios
- **Developers**: Installation, Quick Start, Docs, Changelog
- **Resources**: Paper, Blog, Glossary, GitHub, H·AI·K·U Method

Update `bottomNavItems` for mobile:
```typescript
[
  { title: "Home", href: "/", icon: "home" },
  { title: "Method", href: "/methodology/", icon: "book" },
  { title: "Docs", href: "/docs/", icon: "code" },
  { title: "Menu", href: "#menu", icon: "menu" },
]
```

### Step 4: Homepage Rewrite

**File**: `website/app/page.tsx`

Replace the 2241-line story-driven dev guide with a clean, business-audience homepage. Model after haiku-method's homepage pattern but adapted for AI-DLC as a profile.

**Structure** (~400-600 lines, server component where possible):

#### Section 1: Hero
```tsx
<section className="relative px-4 py-20 sm:py-32">
  <div className="absolute inset-0 -z-10 bg-[radial-gradient(45%_40%_at_50%_40%,rgba(20,184,166,0.08),transparent)]" />
  <div className="mx-auto max-w-3xl text-center">
    <h1>AI-DLC</h1>
    <p className="text-stone-500">A H·AI·K·U Profile for Software Development</p>
    <p>Structured human-AI collaboration for teams that build software. 
       From intent to deployment — disciplined form, reliable results.</p>
    <div><!-- Two CTAs: "How it works" → /methodology, "Get started" → /docs/installation --></div>
  </div>
</section>
```

#### Section 2: The Universal Lifecycle
- Brief intro: "Every initiative follows four phases"
- 4 phase cards in a responsive grid (2x2 on desktop, stacked on mobile)
- Each card: phase icon (SVG), name, one-line description, phase-specific color
  - Elaboration (teal): "Define what will be done and why"
  - Execution (indigo): "Do the work through structured workflows"
  - Operation (amber): "Manage what was delivered"
  - Reflection (rose): "Learn from what happened"
- Visual: simplified lifecycle flow arrow or connection between cards
- Link: "Learn more about the lifecycle" → /methodology

#### Section 3: Domain Profiles (Studios)
- Intro: "H·AI·K·U works for any structured work. Studios customize it for your domain."
- 3-4 studio cards:
  - **Software (AI-DLC)**: inception → design → product → development → operations → security
  - **Marketing**: research → creative → review → publish
  - **Operations**: assess → plan → implement → monitor
  - **Custom**: "Build your own for any domain"
- Link: "Explore studios" → /studios

#### Section 4: Key Principles
- 3-4 principle callout cards from the paper:
  - "Stages, not steps" — Quality gates that reject bad work, not prescribed procedures
  - "Context engineering" — Small, focused agents with relevant context over comprehensive agents with scattered information
  - "Learning loops" — Every initiative feeds learnings forward. Teams that use H·AI·K·U get better at using H·AI·K·U
  - "Human oversight at strategic moments" — Supervised, observed, or autonomous — choose the right mode for the work

#### Section 5: Get Started
- Three pathways:
  - **For developers**: Install the Claude Code plugin → /docs/installation
  - **For teams**: Read the methodology → /methodology
  - **For organizations**: Explore studios → /studios

#### Section 6: Recent Blog Posts
- Preserve existing blog integration (reuse pattern from current homepage or blog page)
- Show 2-3 recent posts with title, date, excerpt

**Component dependencies**: 
- New: `LifecycleCards` (4-phase grid), `StudioCards` (domain profiles), `PrincipleCards` (callouts)
- These can be inline in page.tsx or extracted to `website/app/components/home/` if they exceed ~50 lines each
- Blog post loading: reuse existing `lib/blog.ts` utilities

### Step 5: Methodology Page

**File**: `website/app/methodology/page.tsx` (new)

Business-readable explanation of how H·AI·K·U works. NOT technical documentation.

**Structure** (~300-500 lines, can be server component):

#### Section 1: The Problem
- 3-5 failure mode cards (from paper section 1):
  - No persistent structure → context lost between sessions
  - No quality enforcement → errors propagate unchecked
  - No completion criteria → "good enough" without verification
  - No mode selection → wrong level of autonomy for the work
  - No learning loop → same mistakes recur

#### Section 2: The H·AI·K·U Lifecycle
- The universal 4-phase loop diagram (static SVG or CSS-based)
- Description of each phase with visual callout boxes
- Key message: "Every piece of structured work flows through these phases"
- Elaboration → Execution → Operation → Reflection → (Feed Forward) → Elaboration

#### Section 3: How Stages Work
- Internal stage flow: plan → build → adversarial review → review gate
- Hat system explanation (brief): roles that guide AI behavior
- Review gates: auto, ask, external — different levels of human oversight
- Diagram showing the execution loop (planner → executor → quality gates → reviewer)

#### Section 4: Studios — Lifecycle Templates
- Studios customize the lifecycle for specific domains
- Default "ideation" studio works for everything
- Specialized studios add domain-specific stages and review modes
- Link to /studios for detail

#### Section 5: Collaboration Modes
- Three modes with visual table:
  - Supervised: human directs, AI assists
  - Observed: AI executes, human monitors
  - Autonomous: AI executes independently within defined boundaries
- GPS analogy from the paper

#### Section 6: Deep Dive Links
- Cards linking to each phase page: /methodology/elaboration, /methodology/execution, /methodology/operation, /methodology/reflection

**Content source**: Sections 1-4 of haiku-method paper, adapted for web (shorter paragraphs, visual hierarchy).

### Step 6: Phase Pages

**File**: `website/app/methodology/[phase]/page.tsx` (new, dynamic route)

Create a dynamic route that renders phase-specific content. Use `generateStaticParams` for static export.

**Phases**: elaboration, execution, operation, reflection

**Content files**: `website/content/methodology/` (new directory)
- `elaboration.md`
- `execution.md`  
- `operation.md`
- `reflection.md`

Each markdown file with frontmatter:
```yaml
---
title: "Elaboration"
description: "Define what will be done and why"
phase_number: 1
color: "teal"
---
```

**Page structure** (shared template, ~200-300 lines):

1. **Phase badge**: "Phase {N} of 4" with phase color
2. **Title + description**
3. **What happens in this phase** — narrative from paper
4. **Key activities** — bulleted or card-based
5. **How the AI agent behaves** — hats, constraints, mode selection
6. **Across domains** — table showing examples in software, marketing, operations, research
7. **Outputs** — what this phase produces (artifacts list)
8. **Navigation** — Previous/Next phase links

**Content sourced from**: haiku-method paper sections 4.1-4.4, adapted for web readability.

### Step 7: Studios Page

**File**: `website/app/studios/page.tsx` (new)

Domain profiles overview showing how H·AI·K·U adapts to different fields.

**Structure** (~200-300 lines):

1. **Hero**: "Studios customize H·AI·K·U for your domain"
2. **What is a Studio**: Brief explanation — a studio defines stages, hats, review modes, and quality gates for a specific domain
3. **Studio cards** (detailed):

   **Software (AI-DLC)**:
   - Stages: Inception → Design → Product → Development → Operations → Security
   - Tools: Git, test suites, CI/CD, deployment gates
   - Example: "Add user authentication" → intent → units → bolts → deployed feature

   **Ideation (Default)**:
   - Stages: Research → Create → Review → Deliver
   - Tools: Any — the universal default
   - Example: "Research competitive landscape" → literature review → synthesis → report

   **Marketing (SWARM)**:
   - Stages: Research → Creative → Review → Publish
   - Tools: Brand guidelines, content calendars, analytics
   - Example: "Launch Q2 campaign" → brief → assets → review → publish

   **Operations**:
   - Stages: Assess → Plan → Implement → Monitor
   - Tools: Runbooks, SLA tracking, incident response
   - Example: "Migrate to new vendor" → assessment → migration plan → cutover → monitoring

   **Custom**:
   - Build your own for any domain
   - Define stages, hats, quality gates

4. **For developers**: Link to AI-DLC plugin installation

**Content sourced from**: Paper section on profiles + studio definitions in plugin/studios/.

### Step 8: Content Files

**New directory**: `website/content/methodology/`

Create 4 markdown files with methodology content adapted from the haiku-method paper. Each file contains the full text for one phase page, written for a business audience (VP of Engineering persona).

**Content writing guidelines**:
- No developer jargon (no "PR", "CI/CD", "git" — use domain-agnostic language)
- Short paragraphs (2-3 sentences max)
- Use "teams" not "developers"
- Examples from multiple domains (software, marketing, operations, research)
- Callout boxes for key concepts
- Tables for cross-domain comparisons

### Step 9: Existing Page Color Migration

All existing pages that use `gray-*` classes need updating to `stone-*`:

**High-priority** (visible, common):
- `website/app/about/page.tsx`
- `website/app/blog/page.tsx` + `website/app/blog/[slug]/page.tsx`
- `website/app/blog/layout.tsx`
- `website/app/docs/page.tsx` + `website/app/docs/[slug]/page.tsx`
- `website/app/docs/layout.tsx`
- `website/app/changelog/page.tsx`
- `website/app/paper/page.tsx`
- `website/app/glossary/page.tsx`
- `website/app/start-here/page.tsx`
- `website/app/big-picture/page.tsx`
- `website/app/templates/page.tsx`
- `website/app/workflows/page.tsx`

**Components**:
- `website/app/components/DocsSidebar.tsx`
- `website/app/components/navigation/MegaMenu.tsx`
- `website/app/components/navigation/MegaMenuSection.tsx`
- `website/app/components/navigation/MegaMenuPreview.tsx`
- `website/app/components/navigation/MobileNav.tsx`
- `website/app/components/navigation/BottomNav.tsx`
- `website/app/components/navigation/Breadcrumbs.tsx`
- `website/app/components/Mermaid.tsx`
- `website/app/components/JsonLd.tsx`
- `website/app/components/guide/*.tsx` (all guide components)
- `website/app/components/big-picture/*.tsx`
- `website/app/components/workflow-visualizer/*.tsx`
- `website/app/components/ModeSelector/*.tsx`

**Strategy**: Batch find-and-replace `gray-` → `stone-` across all website files, then manually verify `blue-` → `teal-` where used as accent (not in diff styles or code highlighting which should stay).

### Step 10: Build Verification

1. Run `cd website && bun install && bun run build`
2. Verify static export succeeds
3. Check all new pages are generated:
   - `/` (homepage)
   - `/methodology/` 
   - `/methodology/elaboration/`
   - `/methodology/execution/`
   - `/methodology/operation/`
   - `/methodology/reflection/`
   - `/studios/`
4. Verify existing pages still build:
   - `/blog/`, `/docs/`, `/paper/`, `/changelog/`, `/glossary/`
5. Run `bun run dev` and visually verify responsive layout, dark/light mode

---

## File Change Summary

### New Files
| File | Purpose |
|---|---|
| `website/app/methodology/page.tsx` | Methodology overview page |
| `website/app/methodology/[phase]/page.tsx` | Dynamic phase detail pages |
| `website/app/studios/page.tsx` | Studios/domain profiles page |
| `website/content/methodology/elaboration.md` | Phase 1 content |
| `website/content/methodology/execution.md` | Phase 2 content |
| `website/content/methodology/operation.md` | Phase 3 content |
| `website/content/methodology/reflection.md` | Phase 4 content |

### Modified Files (Major)
| File | Change |
|---|---|
| `website/app/globals.css` | Design system: stone/teal palette, Inter font, updated prose |
| `website/app/page.tsx` | Complete rewrite: business-audience homepage |
| `website/app/layout.tsx` | Color migration, updated metadata |
| `website/lib/navigation.ts` | Restructured nav: methodology, studios, docs |
| `website/lib/constants.ts` | Updated site description |

### Modified Files (Color Migration)
| File | Change |
|---|---|
| `website/app/components/Header.tsx` | gray→stone palette |
| `website/app/components/Footer.tsx` | gray→stone palette, updated brand text |
| `website/app/components/ThemeToggle.tsx` | gray→stone |
| `website/app/components/DocsSidebar.tsx` | gray→stone |
| `website/app/components/navigation/*.tsx` | gray→stone (5 files) |
| `website/app/about/page.tsx` | gray→stone |
| `website/app/blog/**/*.tsx` | gray→stone |
| `website/app/docs/**/*.tsx` | gray→stone |
| `website/app/changelog/page.tsx` | gray→stone |
| `website/app/paper/**/*.tsx` | gray→stone |
| `website/app/glossary/page.tsx` | gray→stone |
| `website/app/start-here/page.tsx` | gray→stone |
| `website/app/big-picture/page.tsx` | gray→stone |
| `website/app/templates/page.tsx` | gray→stone |
| `website/app/workflows/page.tsx` | gray→stone |
| Various component files | gray→stone, blue→teal where accent |

### Files NOT Modified
- `website/content/docs/*.md` — content preserved (unit-11 handles doc updates)
- `website/content/papers/*.md` — paper preserved (unit-12 handles paper sync)
- `website/content/blog/*.md` — blog content preserved
- `website/app/feed.xml/route.ts`, `atom.xml/route.ts`, `feed.json/route.ts` — feeds preserved
- `website/app/sitemap.xml/route.ts`, `robots.txt/route.ts` — SEO preserved
- `website/scripts/` — build scripts preserved
- `website/public/` — static assets preserved (may need new OG image later)

---

## Execution Order & Dependencies

```
Step 1 (globals.css)
  ↓
Step 2 (layout + shared components)  ←→  Step 3 (navigation)
  ↓
Step 4 (homepage rewrite)
  ↓
Step 5 (methodology page)  ←→  Step 8 (content files)
  ↓
Step 6 (phase pages)
  ↓
Step 7 (studios page)
  ↓
Step 9 (existing page color migration)
  ↓
Step 10 (build verification)
```

Steps 1-3 can be done first as a batch (design system foundation).
Steps 4-8 are the content creation phase (most creative effort).
Step 9 is mechanical (find-replace with verification).
Step 10 gates completion.

---

## Key Design Decisions

1. **Server vs Client components**: New pages should be server components where possible. Only add `"use client"` if animations or interactivity are needed. The homepage may need client-side for scroll animations.

2. **Homepage complexity**: The current 2241-line homepage is too complex. Target 400-600 lines. Move guide content to docs or a separate page if it needs preserving.

3. **Existing guide components**: The extensive guide/ component library (CastCard, ChatBubble, NestedLoops, etc.) was built for the story-driven homepage. These components are NOT used by the new homepage. They can remain in the codebase for use by docs or other pages. Do NOT delete them — unit-11 may repurpose them.

4. **Content tone**: Write for the "VP of Engineering" persona — technical enough to be credible, accessible enough for non-developers. No jargon. Use "teams" not "developers".

5. **Phase page content loading**: Use `gray-matter` + `fs.readFileSync` pattern already established in `lib/docs.ts` and `lib/papers.ts`. Create a `lib/methodology.ts` loader.

6. **Studios data**: Hardcode studio definitions in the studios page or a data file. Do not dynamically read from `plugin/studios/` — the website is a static export and shouldn't depend on plugin directory structure at build time.

7. **Blog integration on homepage**: Reuse the blog loading pattern from `lib/blog.ts` to show 2-3 recent posts. Keep it simple — title, date, one-line excerpt.

## Success Criteria Mapping

| Criterion | Implementation Step |
|---|---|
| Homepage communicates universal lifecycle framework | Step 4 (hero, lifecycle section) |
| Homepage has lifecycle visualization, domain profiles, key principles | Step 4 (sections 2-4) |
| Methodology page explains 4-phase lifecycle for business audience | Step 5 |
| Phase pages exist with multi-domain examples | Steps 6 + 8 |
| Studios page shows domain profiles with stage sequences | Step 7 |
| Minimal, teal-accented, Japanese-inspired design | Steps 1-2 |
| Responsive (mobile, tablet, desktop) | All steps (Tailwind responsive utilities) |
| Dark/light mode supported | Steps 1-2 (already exists, update colors) |
| Existing blog, docs, paper, feed content preserved | Steps 2-3, 9 (no content deletions) |
| Content sourced from haiku-method paper | Steps 5-8 |
| Site builds with `bun run build` | Step 10 |
| No developer jargon on homepage/methodology | Steps 4-5 content review |
