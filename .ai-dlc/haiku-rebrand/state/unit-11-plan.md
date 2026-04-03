# Unit 11 Plan: Website Developer Docs

## Scope

Rewrite and create developer documentation for the H·AI·K·U rebrand. This covers:
- 7 new documentation pages
- 24 existing docs pages to update (337 AI-DLC references across them)
- Navigation/sidebar infrastructure updates
- Docs index page rewrite

## Architecture Notes

- Docs are markdown in `website/content/docs/*.md` with YAML frontmatter (`title`, `description`, `order`)
- `website/lib/docs.ts` defines sidebar section groupings via `sectionDefinitions`
- `website/app/docs/[slug]/page.tsx` renders individual doc pages
- `website/app/docs/page.tsx` is the docs index landing page
- Sidebar groups docs by section; new pages need to be added to `sectionDefinitions`

## Implementation Steps

### Step 1: Create new documentation pages

Create 7 new markdown files in `website/content/docs/`:

**1a. `getting-started.md`** (replaces/subsumes `quick-start.md`)
- Tutorial: install → first intent → run stages → deliver
- Uses `/haiku:new` and `/haiku:run` commands
- Shows software studio stage progression
- References `.haiku/` paths throughout

**1b. `cli-reference.md`**
- Complete reference for all `/haiku:*` commands
- Source of truth: `plugin/skills/*/SKILL.md` files (27 skills total)
- For each command: description, arguments, examples, what it does
- Include: new, run, autopilot, elaborate, execute, review, followup, quick, adopt, refine, setup, compound, blockers, release-notes, fundamentals, backpressure, completion-criteria, resume, reset, cleanup, dashboard, operate, reflect, seed, backlog, pressure-testing, ideate

**1c. `studios.md`**
- What a studio is (named lifecycle template)
- Built-in studios: ideation (4 stages, filesystem) and software (6 stages, git)
- Source: `plugin/studios/*/STUDIO.md`
- Configuring via `.haiku/settings.yml` (`studio: software`)
- Creating custom studios: `.haiku/studios/{name}/STUDIO.md`
- Resolution order: project-level → built-in

**1d. `stages.md`**
- What a stage is
- STAGE.md schema reference (frontmatter: name, description, hats, review, unit_types, inputs)
- Hat definition files in `stages/{stage}/hats/` (Focus, Produces, Reads, Anti-patterns)
- Review modes: auto, ask, external
- requires/produces artifact pipeline (inputs list + outputs/ directory)
- Creating a custom stage example
- Source: `plugin/studios/software/stages/*/STAGE.md` for examples

**1e. `persistence.md`**
- Persistence interface: create_workspace, save, create_review, deliver, cleanup
- Git adapter: branch naming, worktree management, PR creation (software studio default)
- Filesystem adapter: version snapshots, local delivery (ideation studio default)
- How studio declares its adapter (persistence field in STUDIO.md frontmatter)
- Creating a custom adapter (skeleton example)

**1f. `migration.md`**
- Terminology map: AI-DLC → H·AI·K·U
- Command map: `/ai-dlc:*` → `/haiku:*`
- Directory map: `.ai-dlc/` → `.haiku/`
- Concept map: passes → stages, workflows → studios, hats → per-stage files in `hats/`
- Automatic migration (settings migration on first load, symlinks)
- Manual steps (.gitignore, CI scripts, team docs)
- Breaking changes list
- Existing intent handling
- Source: `plugin/lib/migrate.sh` for migration behavior

**1g. Update `concepts.md`**
- Replace AI-DLC references with H·AI·K·U
- Add new terminology table (Studio, Stage, Review Gate, Knowledge Pool)
- Update Pass section → reframe as Stages
- Update state management paths (`.ai-dlc/` → `.haiku/`)
- Update command references
- Keep Bolt, Intent, Unit, Completion Criteria, Backpressure, Operating Modes sections (updated terminology)

### Step 2: Update all existing docs for H·AI·K·U rebrand

**Priority order by impact:**

**2a. High-impact rewrites** (content structure changes, not just find/replace):
- `index.md` — rewrite intro for H·AI·K·U, update core concepts (stages not hats), update getting started steps
- `quick-start.md` — rewrite with `/haiku:new` + `/haiku:run` flow, update all commands/paths. May redirect to getting-started or keep as slimmer version.
- `installation.md` — update plugin name, commands, paths, verification steps
- `elaboration.md` — rewrite for stage-based model (inception stage, not standalone "elaborate" phase)
- `hats.md` — rewrite: hats now live as files in `stages/{stage}/hats/`, not standalone. Update to explain hats-within-stages model. Rename/redirect or keep as "understanding hats"
- `workflows.md` — rewrite: workflows dissolved into studios. Update to explain studios/stages replace named workflows. Rename/redirect or keep as "understanding studios"

**2b. Medium-impact updates** (terminology replacement + some content adjustment):
- `guide-developer.md` — replace AI-DLC refs, update commands
- `guide-designer.md` — replace AI-DLC refs, update pass→stage references
- `guide-tech-lead.md` — replace AI-DLC refs
- `guide-manager.md` — replace AI-DLC refs
- `guide-ai.md` — replace AI-DLC refs, update commands
- `operations-guide.md` — replace AI-DLC refs, update commands
- `operation-schema.md` — replace AI-DLC refs
- `providers.md` — replace AI-DLC refs, update paths
- `cowork.md` — replace AI-DLC refs

**2c. Lower-impact updates** (mostly find/replace for terminology):
- `checklist-first-intent.md` — replace AI-DLC refs
- `checklist-team-onboarding.md` — replace AI-DLC refs
- `adoption-roadmap.md` — replace AI-DLC refs
- `assessment.md` — replace AI-DLC refs
- `example-feature.md` — replace AI-DLC refs, update commands
- `example-bugfix.md` — replace AI-DLC refs
- `community.md` — replace AI-DLC refs
- `stack-config.md` — replace AI-DLC refs

### Step 3: Update docs infrastructure

**3a. `website/lib/docs.ts`**
- Update `sectionDefinitions` to include new pages
- Restructure sections for new architecture:
  - "Getting Started": `getting-started`, `installation`, `checklist-first-intent`
  - "Core Concepts": `concepts`, `studios`, `stages`, `persistence`
  - "Reference": `cli-reference`
  - "Before You Build": `providers`, `stack-config`, `cowork`
  - "After You Build": `operations-guide`, `operation-schema`
  - "Role Guides": (unchanged)
  - "Migration": `migration`
  - "Adoption": (unchanged)
  - "Examples": (unchanged)
  - "Community": (unchanged)
- Remove `hats` and `workflows` from Core Concepts (or keep as redirects to studios/stages)
- Remove or repurpose `quick-start` (merged into `getting-started`)

**3b. `website/lib/navigation.ts`**
- Update `primaryNavItems` — no changes needed (already shows "Docs")
- Update `navigation` mega menu:
  - "Get Started" section: update descriptions, fix "New to AI-DLC?" → "New to H·AI·K·U?"
  - "Reference" section: replace Hats/Workflows with Studios/Stages/CLI Reference
  - Update all descriptions to use H·AI·K·U terminology
- Update `footerNavigation.developers` to include new pages
- Update all "AI-DLC" strings to "H·AI·K·U"

**3c. `website/app/docs/page.tsx`**
- Update page title/description from "AI-DLC" to "H·AI·K·U"
- Update quick start code block to show `/haiku:new`
- Update core concepts section (studios + stages, not hats + units)
- Update listed commands

**3d. `website/app/docs/[slug]/page.tsx`**
- Update metadata template string from "AI-DLC" to "H·AI·K·U"

### Step 4: Verify build

- Run `bun run build` in website directory to confirm all pages render
- Verify no broken internal links between doc pages
- Verify no remaining "AI-DLC" references outside migration guide historical context

## File Change Summary

| Category | Files | Action |
|----------|-------|--------|
| New docs | 6 files | Create (`getting-started`, `cli-reference`, `studios`, `stages`, `persistence`, `migration`) |
| Rewrite docs | 1 file | Major update (`concepts.md`) |
| Rewrite docs | 6 files | Structural rewrite (`index`, `quick-start`, `installation`, `elaboration`, `hats`, `workflows`) |
| Update docs | 9 files | Terminology + content updates (guides, operations, providers, cowork) |
| Update docs | 8 files | Terminology find/replace (checklists, adoption, assessment, examples, community, stack-config) |
| Infrastructure | 4 files | Update (`docs.ts`, `navigation.ts`, `docs/page.tsx`, `docs/[slug]/page.tsx`) |
| **Total** | **~34 files** | |

## Risks & Mitigations

- **Docs accuracy vs implementation**: Some rebrand units (07, 08, 13) are still in progress. Write docs against the spec/intent and existing implementation. Mark aspirational features clearly if needed.
- **Stale cross-references**: Existing docs link to each other. Must audit all internal links after renaming/restructuring.
- **`quick-start.md` vs `getting-started.md`**: The unit spec calls for `getting-started.md` but `quick-start.md` already exists. Create `getting-started.md` as the comprehensive tutorial; keep `quick-start.md` as a slim redirect or very short version to avoid breaking existing links.

## Execution Order

1. Create new docs pages (Step 1) — establishes new content targets
2. Update docs infrastructure (Step 3) — wires new pages into navigation
3. Update existing docs (Step 2) — rename/rewrite, starting with high-impact
4. Verify build (Step 4) — confirm everything renders
