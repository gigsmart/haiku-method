---
status: completed
last_updated: "2026-03-31T21:05:22Z"
depends_on: [unit-07-paper-updates]
branch: ai-dlc/first-class-passes/08-website-updates
discipline: documentation
pass: ""
workflow: ""
ticket: ""
design_ref: ""
views: []
hat: ""
---

# unit-08-website-updates

## Description

Update the website docs and homepage to reflect the pass concept. The website presents the methodology to users — it needs to explain passes clearly for both developers exploring AI-DLC and teams evaluating multipass workflows.

## Domain Entities

- **Website**: Next.js 15 static site at `website/`
- **Docs**: Content at `website/content/docs/`
- **Homepage**: Landing page content

## Data Sources

- `website/content/docs/` — existing documentation pages
- `website/content/papers/ai-dlc-2026.md` — the paper (updated in unit-07, source of truth for concepts)
- `website/src/` — page components and layouts
- Homepage content (find the main landing page file)

## Technical Specification

### 1. Identify existing website docs that reference passes

Search `website/content/docs/` for any existing references to passes, multipass, or iteration. Also check the homepage content for methodology descriptions that should mention passes.

### 2. Update or create docs page for passes

If a passes-specific docs page doesn't exist, create one at an appropriate location in the docs hierarchy. If pass content exists elsewhere, update it.

The docs page should cover:
- **What is a pass?** — A typed iteration through the AI-DLC loop (elaborate → execute → review) through a different disciplinary lens
- **Built-in passes**: design, product, dev — with descriptions of what each produces
- **When to use multipass**: Cross-functional teams, complex features requiring design → product → dev flow
- **When to stay single-pass**: Solo developers, small tasks, pure engineering work (the default)
- **The pass loop**: Same intent, artifacts accumulate, each pass elaborates and executes before the next begins
- **Pass-backs**: When a later pass discovers issues, work flows back to an earlier pass
- **Customization**: How to create custom passes (`.ai-dlc/passes/{name}.md`), how to augment built-in passes
- **Configuration**: `default_passes` in settings.yml, per-intent override during elaboration

### 3. Update homepage if it describes methodology phases

If the homepage describes the AI-DLC lifecycle or workflow, add a mention of passes as the mechanism for cross-functional iteration. Keep it brief — the homepage is marketing-level, not tutorial-level.

### 4. Update any existing docs that describe the construction loop

If existing docs describe the elaborate → execute → review loop, add a note about how passes wrap this loop with different disciplinary lenses. Passes don't change the loop — they change what the loop produces.

### 5. Verify all website claims match paper and implementation

Per the sync-check rule:
- Are claims about the methodology accurate to the paper (updated in unit-07)?
- Are claims about the plugin accurate to the implementation (updated in units 01-06)?

## Success Criteria

- [ ] Website docs explain what passes are and when to use them
- [ ] Built-in passes (design, product, dev) are described with their purposes
- [ ] Single-pass default is clearly communicated — multipass is opt-in
- [ ] Pass customization (augmentation, custom passes) is documented
- [ ] Homepage mentions passes if it describes the methodology lifecycle
- [ ] All website claims about passes match the paper and plugin implementation
- [ ] Website builds successfully (`bun run build` in website directory)

## Risks

- **Stale docs**: If other docs pages describe the lifecycle without mentioning passes, the information is incomplete. Mitigation: search all docs for lifecycle/phase/workflow references and update as needed.
- **Scope creep into website redesign**: The docs update could expand into a full website overhaul. Mitigation: only update content related to passes. Don't reorganize unrelated docs.

## Boundaries

This unit updates website content ONLY. It does NOT:
- Update the paper (unit-07)
- Change plugin implementation (units 01-06)
- Redesign the website layout or navigation
- Add new website features unrelated to passes

## Notes

- The website is a Next.js 15 static site. Content is in `website/content/docs/` as markdown files.
- Keep docs language accessible — passes should be explained in terms a developer new to AI-DLC can understand.
- Link to the paper for the full theoretical treatment. The docs should be practical, the paper conceptual.
