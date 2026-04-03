# Unit 12 Plan: CLAUDE.md & Paper Sync

## Summary

Update CLAUDE.md and sync-check rules for H·AI·K·U terminology, merge the haiku-method paper into the website as the canonical paper, archive the AI-DLC paper, and update all website references.

## Pre-work

```bash
cd /Volumes/dev/src/github.com/thebushidocollective/ai-dlc/.ai-dlc/worktrees/haiku-rebrand-12-claude-md-paper-sync
git merge ai-dlc/haiku-rebrand/main --no-edit
git clone https://github.com/TheBushidoCollective/haiku-method.git /tmp/haiku-method  # if not already cloned
```

---

## Task 1: Rewrite CLAUDE.md

**File:** `CLAUDE.md`

Replace the entire file with H·AI·K·U terminology per the unit spec. Key changes:

### 1a. Project Header
- `# AI-DLC Project` → `# H·AI·K·U Project`
- Add: `H·AI·K·U = Human AI Knowledge Unification — a universal lifecycle framework for structured AI-assisted work.`

### 1b. Terminology Table
Replace the 4-row AI-DLC table with a 7-row H·AI·K·U table adding Studio, Stage, Hat, and Review Gate. Add the hierarchy section:
```
Studio -> Stage -> Unit -> Bolt
```
With disambiguation warnings for Studio/Stage/Unit/Bolt.

### 1c. Key File Locations
Remove stale references:
- ~~`plugin/hats/*.md`~~ (hats dissolved into STAGE.md in unit-07)
- ~~`plugin/workflows.yml`~~ (removed in unit-07)
- ~~`website/content/papers/ai-dlc-2026.md`~~ (will be archived)

Add new references:
- `website/content/papers/haiku-method.md` (new canonical paper)
- `plugin/studios/*/STUDIO.md`
- `plugin/studios/*/stages/*/STAGE.md`
- `plugin/lib/adapters/*.sh`
- `deploy/terraform/`

### 1d. Concept-to-Implementation Mapping
Replace entire table. Key changes:
- Add Studio, Stage, Hat, Review Gate, Persistence rows
- Update all paths from `.ai-dlc/` → `.haiku/intents/`
- Update commands from `/ai-dlc:` → `/haiku:`
- Remove references to dissolved hats (builder.md, reviewer.md)
- Remove workflows.yml references
- Add orchestrator.sh, stage.sh, studio.sh references

### 1e. Sync Discipline Table
Add rows for: New studio, New stage, New hat (in stage), New persistence adapter. Remove "New hat/workflow" row.

### 1f. Version Management
No changes needed — already correct.

### Verification Checklist (Task 1)
- [ ] Zero occurrences of "AI-DLC" in CLAUDE.md (except in Version Management CI context if any)
- [ ] Zero `.ai-dlc/` path references
- [ ] Zero `/ai-dlc:` command references
- [ ] Every file path listed exists in the worktree:
  - `plugin/.claude-plugin/plugin.json`
  - `plugin/skills/*/SKILL.md` (glob)
  - `plugin/studios/*/STUDIO.md` — verify: ideation, software
  - `plugin/studios/*/stages/*/STAGE.md` — verify all exist
  - `plugin/hooks/*.sh`
  - `plugin/lib/*.sh`
  - `plugin/lib/adapters/*.sh` — verify: filesystem.sh, git.sh
  - `plugin/providers/*.md`
  - `plugin/schemas/providers/*.json`
  - `website/content/docs/`
  - `website/content/papers/haiku-method.md` (created in Task 3)
  - `deploy/terraform/`
  - `CHANGELOG.md`

---

## Task 2: Rewrite .claude/rules/sync-check.md

**File:** `.claude/rules/sync-check.md`

Replace entire file with the spec-provided content. Key changes:

- `plugin/skills/ or plugin/hats/` → `plugin/studios/ or plugin/studios/*/stages/`
- Add check for `requires/produces chains form a valid pipeline`
- Add separate section for `plugin/skills/` (CLI reference check)
- Remove "hat/skill files" references → "stage/skill files"
- Update terminology reminders:
  - Add Studio and Hat definitions
  - Change hierarchy from 3-layer to 4-layer: `Studio -> Stage -> Unit -> Bolt`
  - Add `CLAUDE.md terminology table` to the update checklist

---

## Task 3: Paper Merge

### 3a. Copy haiku-method paper
**Source:** `/tmp/haiku-method/paper/haiku-method.md`
**Destination:** `website/content/papers/haiku-method.md`

Copy verbatim as the base.

### 3b. Enrich with AI-DLC implementation specifics

The haiku-method paper (1453 lines) is already comprehensive. It covers bolts, hats, workflows, profiles, quality gates, and iteration passes conceptually. The enrichments add **concrete implementation details** from the AI-DLC paper where the haiku-method paper is abstract.

#### Enrichment 1: AI-DLC Profile Section (Section 6, ~line 945)
The haiku-method paper's AI-DLC profile section describes hats and workflows that have been dissolved/refactored. Update to reflect the current architecture:

- **Hats** are now defined as files in `stages/{stage}/hats/`, not as standalone hat files
- **Workflows** have been replaced by the stage orchestrator (orchestrator.sh)
- The AI-DLC profile now implements **studios** (software, ideation) with **stages** containing per-stage hat files
- Add the software studio's stage pipeline: `inception → product → design → development → security → operations`
- Note the ideation studio: `research → create → review → deliver`
- Update the "AI-DLC hats" table to note hats are stage-scoped

Add a subsection after the AI-DLC profile block (~line 994):

```markdown
#### AI-DLC Plugin Implementation

The AI-DLC profile is implemented as a Claude Code plugin (the `haiku` plugin). Key implementation details:

**Studios as Profiles.** HAIKU profiles are implemented as **studios** — named lifecycle templates stored as `plugin/studios/{name}/STUDIO.md`. Each studio contains **stages** (`plugin/studios/{name}/stages/{stage}/`) that define the lifecycle phases, with hats defined as per-stage files in `stages/{stage}/hats/*.md`, review gates, and artifact contracts.

**Stage Orchestration.** The stage orchestrator (`orchestrator.sh`) drives unit execution through the studio's stage pipeline. Each stage defines:
- Hats as files in `stages/{stage}/hats/{hat}.md` (behavioral roles scoped to that stage)
- Artifact contracts (requires/produces)
- Review gates (auto, ask, or external)

**Harness-Enforced Quality Gates.** Quality gates are declared in YAML frontmatter on intent and unit files:

\```yaml
quality_gates:
  - name: tests
    command: bun test
  - name: typecheck
    command: tsc --noEmit
\```

The harness (not the agent) enforces these gates via `quality-gate.sh`. Gates are:
- Auto-detected during elaboration from repo tooling
- Additively merged (unit gates extend intent gates, never replace)
- Add-only during construction (ratchet effect)
- Scoped to building stages only

**Persistence Adapters.** Work state is persisted through pluggable adapters (`plugin/lib/adapters/*.sh`):
- `filesystem.sh` — default, stores state in `.haiku/` directory
- `git.sh` — git-backed persistence with branch management

**Workspace Structure:**

\```
.haiku/
  intents/{slug}/
    intent.md              # Intent definition
    stages/{stage}/
      units/unit-NN-*.md   # Unit specifications
    state/
      iteration.json       # Current bolt state
  knowledge/               # Accumulated organizational memory
\```
```

#### Enrichment 2: Completion Criteria Format (Section 4, Elaboration outputs ~line 489)
Add a brief note after the elaboration outputs about the concrete format:

```markdown
In the AI-DLC software profile, success criteria are expressed as `quality_gates` in YAML frontmatter — executable commands that the harness runs automatically. This makes criteria not just measurable but machine-enforceable.
```

#### Enrichment 3: Visual/Design Backpressure (Section 3, Quality Enforcement ~line 224)
Add a paragraph noting visual backpressure as an extension of quality gates for design fidelity:

```markdown
**Visual backpressure** extends quality gates into design fidelity. When a unit touches UI, the harness captures screenshots and compares them against design references (Figma exports, previous iteration screenshots, or wireframes) using vision-model evaluation. A failing visual comparison feeds back into the iteration loop exactly like a failing test.
```

#### Enrichment 4: Worktree Parallelism (Section 4, Execution ~line 680)
Add a note about worktree-based parallel execution:

```markdown
**Parallel execution via worktrees.** When units have no dependencies, the AI-DLC plugin executes them in parallel using isolated git worktrees. Each unit gets its own working copy, preventing file conflicts. Completed units merge back to the intent branch automatically.
```

### 3c. Archive AI-DLC paper
**File:** `website/content/papers/ai-dlc-2026.md`

Add to frontmatter:
```yaml
archived: true
superseded_by: "haiku-method"
```

Keep the file for historical reference. The paper listing should filter out archived papers, or the UI can display them with an "archived" badge. (If `getAllPapers()` doesn't filter — it shouldn't need to for this unit; the website code changes are minimal.)

### Verification Checklist (Task 3)
- [ ] `website/content/papers/haiku-method.md` exists and is valid markdown
- [ ] Frontmatter has correct title, date, authors, tags
- [ ] AI-DLC profile section reflects studios/stages (not standalone hats)
- [ ] Quality gate enrichment mentions harness enforcement
- [ ] Persistence adapter enrichment mentions .haiku/ workspace
- [ ] AI-DLC paper has `archived: true` in frontmatter
- [ ] No broken internal links in the haiku-method paper

---

## Task 4: Website Paper References

### 4a. Update papers.ts
**File:** `website/lib/papers.ts` (line 189)

```typescript
// Before:
return getPaperBySlug("ai-dlc-2026")
// After:
return getPaperBySlug("haiku-method")
```

### 4b. Update paper page metadata
**File:** `website/app/paper/page.tsx`

- Line 9: `title: "AI-DLC Paper"` → `title: "H·AI·K·U Paper"`
- Line 10-11: Update description to reference H·AI·K·U methodology
- Lines 13-15: Update OpenGraph metadata
- Line 82: `slug="ai-dlc-2026"` → `slug="haiku-method"`

### 4c. Update paper revisions JSON
**File:** `website/public/data/paper-revisions.json`

Add a `"haiku-method"` entry with initial version data. The revision tracking doesn't need full history — this is the first version of the merged paper.

### 4d. Update docs community link
**File:** `website/content/docs/community.md` (line 72)

```markdown
// Before:
- [H·AI·K·U Paper](https://han.guru/papers/ai-dlc-2026)
// After:
- [H·AI·K·U Paper](https://han.guru/paper)
```

(The paper page loads the main paper by slug, so the route `/paper` works.)

### 4e. Update print page if needed
**File:** `website/app/paper/print/page.tsx`

Check if it references `ai-dlc-2026` directly. If so, update to use `getMainPaper()` or reference `haiku-method`.

### Verification Checklist (Task 4)
- [ ] `getMainPaper()` returns the haiku-method paper
- [ ] Paper page metadata says "H·AI·K·U"
- [ ] Revision history slug matches
- [ ] Community docs link is correct
- [ ] No remaining `ai-dlc-2026` references in website code (except in archived paper content and revisions JSON historical data)

---

## Task 5: Final Cross-Component Verification

Run these verifications after all tasks:

```bash
# No AI-DLC references in CLAUDE.md
grep -c "AI-DLC" CLAUDE.md  # expect 0

# No .ai-dlc/ paths in CLAUDE.md
grep -c "\.ai-dlc/" CLAUDE.md  # expect 0

# No /ai-dlc: commands in CLAUDE.md
grep -c "/ai-dlc:" CLAUDE.md  # expect 0

# Verify key file paths exist
ls plugin/studios/software/STUDIO.md
ls plugin/studios/ideation/STUDIO.md
ls plugin/studios/software/stages/*/STAGE.md
ls plugin/lib/adapters/*.sh
ls plugin/lib/orchestrator.sh
ls plugin/lib/stage.sh
ls plugin/lib/studio.sh
ls deploy/terraform/main.tf

# Verify paper exists
ls website/content/papers/haiku-method.md

# Verify archived paper
grep "archived: true" website/content/papers/ai-dlc-2026.md

# Verify website references updated
grep "haiku-method" website/lib/papers.ts
grep "haiku-method" website/app/paper/page.tsx
```

---

## Execution Order

1. **Task 3a** first — copy the haiku-method paper (other tasks depend on it existing)
2. **Task 1 + Task 2 + Task 3b + Task 3c** in parallel — independent file edits
3. **Task 4** after Task 3a — needs the paper file to exist
4. **Task 5** last — verification sweep

## Risk Mitigations

- **Paper size:** The haiku-method paper is 1453 lines. Enrichments are surgical additions to specific sections, not rewrites. Target ~50-80 lines of additions total.
- **Path accuracy:** Every path in CLAUDE.md must be verified against the worktree. The unit spec provides exact content; verify paths exist before committing.
- **Website build:** After changes, run `cd website && bun run build` to verify no broken imports or missing papers.
- **Paper frontmatter:** The haiku-method paper's frontmatter must match what `getPaperBySlug()` expects (title, subtitle, description, date, authors, tags).
