---
status: in_progress
last_updated: "2026-04-03T01:58:09Z"
depends_on: [unit-09-deploy-config]
branch: ai-dlc/haiku-rebrand/10-website-homepage-methodology
discipline: frontend
stage: ""
workflow: ""
ticket: ""
hat: builder
---

# unit-10-website-homepage-methodology

## Description

Rewrite the website for a business audience. H·AI·K·U is not a developer tool — it's a universal operations/lifecycle framework for any team using AI for structured work. Bring over haiku-method's design language (minimal, teal accent, Japanese-inspired). Create a homepage with lifecycle visualization and domain profiles, a methodology page with the 4-phase lifecycle deep dive, and phase-specific pages.

## Discipline

frontend - Next.js 15 App Router, React components, content authoring, visual design.

## Domain Entities

### Source Material

- `/Volumes/dev/src/github.com/thebushidocollective/haiku-method/paper/haiku-method.md` — methodology paper (source of truth)
- `/Volumes/dev/src/github.com/thebushidocollective/haiku-method/website/` — design language, components, styling
- `/Volumes/dev/src/github.com/thebushidocollective/haiku-method/brand/naming.md` — brand guidelines
- Existing `website/` in this repo — Next.js 15 static site infrastructure

### Pages to Create/Rewrite

- `website/app/page.tsx` — homepage
- `website/app/methodology/page.tsx` — lifecycle overview
- `website/app/methodology/[phase]/page.tsx` — per-phase deep dive
- `website/app/studios/page.tsx` — domain profiles (software, marketing, operations, etc.)
- `website/content/` — content files for methodology pages

## Technical Specification

### Design Language

Bring over from haiku-method website:

- **Minimal aesthetic** — clean whitespace, restrained typography
- **Teal accent** — primary brand color (`#0D9488` or similar from haiku-method)
- **Japanese-inspired** — subtle references to structure, discipline, and craft
- **Dark/light mode** — support both with clean contrast
- Typography: system fonts or a clean sans-serif stack
- Layout: generous margins, clear hierarchy, content-first

Do NOT make it look like a developer documentation site. This is a business methodology site.

### Homepage

The homepage communicates: "H·AI·K·U is how teams use AI to do structured, excellent work."

Sections:

1. **Hero**
   - Headline: "Human AI Knowledge Unification" (or tagline from brand/naming.md)
   - Subhead: one sentence on what H·AI·K·U does
   - Lifecycle visualization: a simple, animated or static diagram showing the universal lifecycle loop
   - CTA: "How it works" -> methodology page

2. **The Universal Lifecycle**
   - Brief explanation of the 4-phase cycle: research -> create -> review -> deliver
   - Visual diagram with icons/illustrations for each phase
   - Emphasis: this works for ANY structured work, not just code

3. **Domain Profiles**
   - Cards for different studios: Software, Marketing, Operations, Research, Legal
   - Each card shows: studio name, stage sequence, example use case
   - Software: inception -> design -> product -> development -> operations -> security
   - Marketing: research -> creative -> review -> publish
   - Operations: assess -> plan -> implement -> monitor
   - Link to studios page for detail

4. **Key Principles**
   - 3-4 principles from the paper, presented as short callouts
   - Examples: "Stages, not steps" / "Built-in adversarial review" / "Any domain, any team"

5. **Get Started**
   - For developers: link to plugin installation
   - For teams: link to methodology overview
   - For organizations: link to studios configuration

6. **Recent blog posts** (preserve existing blog integration)

### Methodology Page (`/methodology`)

A business-readable explanation of how H·AI·K·U works. NOT technical documentation — think "how we work" page for a consultancy.

Sections:

1. **The Problem**
   - AI enables incredible productivity but without structure, it produces mediocre, inconsistent work
   - Teams need a framework that channels AI capability through human judgment

2. **The H·AI·K·U Lifecycle**
   - The universal 4-phase loop: Research -> Create -> Review -> Deliver
   - Diagram showing the loop with description of each phase
   - "Every piece of structured work flows through these phases, whether it's code, content, strategy, or design."

3. **How Stages Work**
   - Each stage internally: plan -> build -> adversarial review -> review gate
   - The hat system: roles that guide AI behavior within each stage
   - Review gates: auto, ask, external — different levels of human oversight

4. **Studios: Lifecycle Templates**
   - Studios customize the lifecycle for specific domains
   - The default "ideation" studio works for everything
   - Specialized studios (software, etc.) add domain-specific stages, hats, and review modes

5. **Continuous vs Discrete**
   - Continuous: AI drives, human reviews at gates
   - Discrete: human drives each stage explicitly
   - Same pipeline, different interaction models

6. **Link to deep-dive pages** for each phase

### Phase Pages (`/methodology/[phase]`)

Detailed pages for each of the 4 universal phases, with concrete examples from multiple domains:

- `/methodology/research` — gathering context, understanding the problem
- `/methodology/create` — producing the primary deliverable
- `/methodology/review` — adversarial quality review
- `/methodology/deliver` — finalizing and delivering

Each page includes:
- What happens in this phase
- How the AI agent behaves (hats, constraints)
- Examples from software, marketing, and operations
- How review gates work in this phase
- What "done" looks like

### Content Source

Use the haiku-method paper (`paper/haiku-method.md`) as the primary content source. The paper has extensive material on:
- The methodology philosophy
- Phase descriptions
- Studio examples
- Domain-agnostic principles

Adapt this content for web presentation — shorter paragraphs, visual hierarchy, callout boxes, diagrams.

### Technical Implementation

- Next.js 15 App Router (existing infrastructure)
- Static site generation (existing `output: 'export'`)
- Content in `website/content/methodology/` as markdown files
- React components for lifecycle diagrams, studio cards, phase visualizations
- Tailwind CSS for styling (if existing, otherwise bring over haiku-method's styling approach)
- Responsive: mobile-first design

### Existing Content to Preserve

- Blog at `/blog` — keep all existing blog posts and the recent posts homepage section
- Docs at `/docs` — keep existing technical docs (updated in unit-11)
- Paper at `/papers` — keep existing paper content
- RSS/Atom/JSON feeds — keep existing feed infrastructure

## Success Criteria

- [ ] Homepage communicates H·AI·K·U as a universal lifecycle framework (not dev-only)
- [ ] Homepage has lifecycle visualization, domain profiles, and key principles
- [ ] Methodology page explains the 4-phase lifecycle for a business audience
- [ ] Phase pages exist for research, create, review, and deliver with multi-domain examples
- [ ] Studios page shows domain profiles with their stage sequences
- [ ] Design language is minimal, teal-accented, and Japanese-inspired (from haiku-method)
- [ ] Site is responsive (mobile, tablet, desktop)
- [ ] Dark/light mode supported
- [ ] Existing blog, docs, paper, and feed content preserved
- [ ] Content sourced from haiku-method paper (not invented from scratch)
- [ ] Site builds successfully with `bun run build` (static export)
- [ ] No developer jargon on the homepage or methodology pages

## Risks

- **Content tone**: The paper is written for a technical audience. Web content must be translated for business readers without losing accuracy. Mitigation: write for the "VP of Engineering" persona — technical enough to be credible, accessible enough for non-developers.
- **Design inconsistency**: Merging haiku-method's design language with the existing ai-dlc website may create visual inconsistency. Mitigation: do a full visual pass — don't patch, rewrite the design system.
- **Content volume**: Multiple pages of content take effort to write well. Mitigation: start with the homepage and methodology page, then phase pages. Each page should be self-contained.

## Boundaries

This unit covers the homepage, methodology page, phase pages, and studios page. It does NOT write technical developer documentation (unit-11), update CLAUDE.md or the paper (unit-12), or handle deployment (unit-09).
