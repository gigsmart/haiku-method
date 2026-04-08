---
name: unit-11-website-developer-docs
type: documentation
status: completed
depends_on: [unit-10-website-homepage-methodology]
bolt: 0
hat: ""
started_at: 2026-04-03T02:51:57Z
completed_at: 2026-04-03T02:51:57Z
---


# unit-11-website-developer-docs

## Description

Write the technical "how it works" documentation for developers and implementers. This is the deep-dive reference that lives at `/docs` (or `/how-it-works`) — studios configuration, stage creation, persistence adapters, plugin installation, CLI reference, getting started tutorial, and migration guide from AI-DLC.

## Discipline

documentation - Technical writing for developer audience, structured as reference and tutorial content.

## Domain Entities

### Documentation Pages

- `website/content/docs/getting-started.md` — installation and first intent
- `website/content/docs/cli-reference.md` — `/haiku:new`, `/haiku:resume`, `/haiku:autopilot` and all commands
- `website/content/docs/studios.md` — studio configuration and customization guide
- `website/content/docs/stages.md` — stage creation and STAGE.md schema reference
- `website/content/docs/persistence.md` — persistence adapters guide
- `website/content/docs/migration.md` — migration guide from AI-DLC to H·AI·K·U
- `website/content/docs/concepts.md` — updated terminology and concept reference

### Existing Docs to Update

- `website/content/docs/guide-designer.md` — update AI-DLC references
- `website/content/docs/elaboration.md` — update for stage-based model
- Any other existing docs in `website/content/docs/`

## Technical Specification

### Getting Started (`getting-started.md`)

A tutorial that takes a developer from zero to their first completed intent:

1. **Install the plugin**
   - How to add H·AI·K·U to a Claude Code project
   - Plugin installation command
   - Verify installation

2. **Start your first intent**
   ```
   /haiku:new
   > "What do you want to accomplish?"
   > "Add a dark mode toggle to the settings page"
   ```
   Walk through the interactive flow: slug extraction, studio detection, mode choice.

3. **Run through stages**
   - Show the stage progression for a software studio intent
   - What each stage does (inception -> design -> development)
   - When review gates pause for input

4. **Deliver**
   - How the intent completes
   - PR creation and merge
   - Cleanup

### CLI Reference (`cli-reference.md`)

Complete reference for all `/haiku:*` commands:

| Command | Description | Usage |
|---------|-------------|-------|
| `/haiku:new` | Start a new intent | `/haiku:new` (interactive) |
| `/haiku:resume [name] [stage?]` | Run/advance an intent | `/haiku:resume dark-mode` or `/haiku:resume dark-mode design` |
| `/haiku:autopilot` | Fully autonomous mode | `/haiku:autopilot` |
| `/haiku:review` | Pre-delivery code review | `/haiku:review` |
| `/haiku:followup` | Create follow-up intent | `/haiku:followup` |
| `/haiku:quick` | Quick mode for trivial tasks | `/haiku:quick` |
| `/haiku:adopt` | Adopt an existing feature | `/haiku:adopt` |
| `/haiku:refine` | Refine specs mid-execution | `/haiku:refine` |
| `/haiku:setup` | Configure project settings | `/haiku:setup` |
| `/haiku:compound` | Capture learnings | `/haiku:compound` |
| `/haiku:blockers` | Document blockers | `/haiku:blockers` |
| `/haiku:release-notes` | View changelog | `/haiku:release-notes` |
| `/haiku:fundamentals` | Methodology overview | `/haiku:fundamentals` |
| `/haiku:backpressure` | Quality gate reference | `/haiku:backpressure` |
| `/haiku:completion-criteria` | Criteria writing guide | `/haiku:completion-criteria` |
| `/haiku:resume` | Resume a paused intent | `/haiku:resume` |
| `/haiku:reset` | Reset intent state | `/haiku:reset` |
| `/haiku:cleanup` | Clean up completed intents | `/haiku:cleanup` |
| `/haiku:dashboard` | View intent status | `/haiku:dashboard` |

For each command: description, arguments, examples, what it does internally.

### Studios Guide (`studios.md`)

How studios work and how to configure them:

1. **What is a studio?**
   - A named lifecycle template
   - Declares stage order and persistence type
   - Every project has one (default: ideation)

2. **Built-in studios**
   - Ideation: research -> create -> review -> deliver (filesystem persistence)
   - Software: inception -> design -> product -> development -> operations -> security (git persistence)

3. **Configuring your studio**
   ```yaml
   # .haiku/settings.yml
   studio: software
   ```

4. **Creating a custom studio**
   - Directory structure: `.haiku/studios/{name}/STUDIO.md`
   - STUDIO.md schema reference
   - Example: creating a marketing studio

5. **Overriding a built-in studio**
   - Adding stages to software studio
   - Overriding a single stage
   - Resolution order (project-level -> built-in)

### Stages Guide (`stages.md`)

How to create and configure stages:

1. **STAGE.md schema reference**
   - Complete frontmatter field reference
   - Body structure (hat sections, criteria guidance, completion signal)

2. **Hat definitions**
   - How hats are defined as files in `stages/{stage}/hats/`
   - Hat section structure (Focus, Produces, Reads, Anti-patterns)
   - The hat sequence as the stage's workflow

3. **Review modes**
   - `auto` — advance immediately
   - `ask` — pause for user
   - `external` — create external review (PR, etc.)

4. **requires/produces contracts**
   - How stages form an artifact pipeline
   - Tracing the chain across stages
   - What happens when a required artifact is missing

5. **Creating a custom stage**
   - Example: adding a "compliance" stage to the software studio

### Persistence Guide (`persistence.md`)

How persistence adapters work:

1. **The persistence interface**
   - Five operations: create_workspace, save, create_review, deliver, cleanup
   - How the studio declares its adapter

2. **Git adapter** (default for software)
   - Branch naming, worktree management, PR creation
   - Configuration options

3. **Filesystem adapter** (default for ideation)
   - Version snapshots, local delivery
   - When to use it

4. **Creating a custom adapter**
   - Adapter file structure
   - Required functions
   - Example: Notion adapter skeleton

### Migration Guide (`migration.md`)

Step-by-step migration from AI-DLC to H·AI·K·U:

1. **What changed**
   - Terminology map: AI-DLC -> H·AI·K·U
   - Command map: `/ai-dlc:*` -> `/haiku:*`
   - Directory map: `.ai-dlc/` -> `.haiku/`
   - Concept map: passes -> stages, workflows -> studios

2. **Automatic migration**
   - Settings migration (automatic on first load)
   - Symlinks for backward compatibility

3. **Manual steps**
   - Update `.gitignore` (`.ai-dlc/` -> `.haiku/`)
   - Update CI scripts referencing old paths/commands
   - Update team documentation

4. **Breaking changes**
   - Plugin name change: `ai-dlc` -> `haiku`
   - Command prefix change: `/ai-dlc:` -> `/haiku:`
   - Hats directory removed (now per-stage files in `stages/{stage}/hats/`)
   - Workflows file removed (now in studios)

5. **Existing intents**
   - Active intents with `.ai-dlc/` paths are auto-detected and migrated
   - Historical intent data is preserved

### Concepts Reference (update `concepts.md`)

Updated terminology table:

| Term | Definition | Agile Equivalent |
|------|-----------|-----------------|
| Studio | Named lifecycle template | (none) |
| Stage | Lifecycle phase with hats and review gate | (none) |
| Intent | The thing being built | Feature / Epic |
| Unit | Discrete piece of work | Ticket / Story |
| Bolt | One iteration cycle through a stage's hats | Sprint |
| Hat | Role the AI assumes within a stage | (none) |
| Review Gate | Checkpoint between stages (auto/ask/external) | (none) |
| Knowledge Pool | Project-level accumulated context | (none) |

## Success Criteria

- [x] Getting started tutorial works end-to-end (install -> first intent -> delivery)
- [x] CLI reference covers all `/haiku:*` commands with examples
- [x] Studios guide explains built-in studios and custom studio creation
- [x] Stages guide includes STAGE.md schema reference and custom stage example
- [x] Persistence guide covers git adapter, filesystem adapter, and custom adapter creation
- [x] Migration guide provides step-by-step AI-DLC -> H·AI·K·U migration
- [x] Concepts page updated with new terminology table
- [x] All existing docs updated to reference H·AI·K·U instead of AI-DLC
- [x] No remaining "AI-DLC" references in any docs page (except migration guide historical context)
- [x] All docs build successfully in the static site
- [x] Code examples in docs use H·AI·K·U commands and paths

## Risks

- **Documentation accuracy**: Docs must reflect the actual implementation, which may still be in progress when docs are written. Mitigation: write docs against the spec (intent.md + architecture-spec.md), then verify against implementation when units 01-08 are complete.
- **Content overload**: Too many docs pages can overwhelm new users. Mitigation: clear information architecture — getting started for new users, reference for experienced users, migration for existing users.
- **Stale existing docs**: Some existing docs pages may have content that contradicts the new model. Mitigation: audit all existing docs and either update or archive them.

## Boundaries

This unit covers developer-facing documentation only. It does NOT write the business-facing website pages (unit-10), update CLAUDE.md or the paper (unit-12), or handle deployment (unit-09).
