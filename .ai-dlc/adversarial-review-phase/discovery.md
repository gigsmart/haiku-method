---
intent: adversarial-review-phase
created: 2026-03-30
status: active
---

# Discovery Log: Adversarial Review Phase

Elaboration findings persisted during Phase 2.5 domain discovery.
Builders: read section headers for an overview, then dive into specific sections as needed.

## Codebase Context

**Stack:** Bash (plugin shell libraries), Markdown (skill/hat definitions, specs), YAML (workflows, config), JavaScript (Playwright worker for screenshots), Next.js 15 (website)
**Architecture:** Monorepo with three components: `plugin/` (Claude Code plugin), `website/` (Next.js 15 static site), `website/content/papers/` (methodology paper). Plugin uses skill-based architecture with `skills/*/SKILL.md` definitions, `hats/*.md` role definitions, `lib/*.sh` shell libraries, and `workflows.yml` for named workflow sequences.
**Conventions:**
- Skills use YAML frontmatter for metadata (`description`, `allowed-tools`, `context: fork` for subagents, `user-invocable: false` for internal skills)
- Subagent skills follow a brief-file pattern: orchestrator writes `.briefs/elaborate-{name}.md`, subagent reads brief, does work, writes `.briefs/elaborate-{name}-results.md`
- Hats use YAML frontmatter (`name`, `description`) and structured sections (Overview, Parameters, Prerequisites, Steps, Success Criteria, Error Handling)
- Elaboration phases are numbered (0, 0.5, 1, 2, 2.25, 2.5, 3, 4, 5, 5.5, 5.6, 5.75, 5.8, 5.9, 5.95, 6, 6.25, 6.5+6.75, 7, 8)
- Git commits follow `elaborate({slug}): {action}` format during elaboration
- State management via `lib/state.sh` (file-based, atomic writes)
- Config via `lib/config.sh` with YAML settings at `.ai-dlc/settings.yml`
- Telemetry via `lib/telemetry.sh`
**Concerns:**
- Phase 7 (Spec Review) currently runs a lightweight checklist-style review — completeness, consistency, YAGNI — but does NOT do adversarial analysis (contradictions, hidden complexity, assumption challenges, dependency stress-testing)
- No existing mechanism for auto-applying fixes to specs during elaboration — Phase 7 presents findings to user but has no auto-fix pathway
- The integrate skill handles cross-unit validation post-execution but not pre-execution adversarial review

## Codebase Pattern: Subagent Delegation in Elaborate Skill

The elaborate skill uses a consistent delegation pattern for autonomous sub-tasks. Three existing examples:

### Pattern: Brief-Write-Invoke-Read

1. **Write brief** to `.ai-dlc/{slug}/.briefs/elaborate-{name}.md` with YAML frontmatter + markdown body containing all context the subagent needs
2. **Commit the brief** immediately: `git add ... && git commit -m "elaborate({slug}): write {name} brief"`
3. **Invoke subagent** via `Agent({ subagent_type: "general-purpose", description: "elaborate-{name}: {slug}", prompt: "Run the /ai-dlc:elaborate-{name} skill..." })`
4. **Read results** from `.ai-dlc/{slug}/.briefs/elaborate-{name}-results.md` — parse YAML `status` field (success/error/skipped)
5. **Commit results** and any artifacts

### Existing Subagent Skills

| Skill | Phase | Brief File | Results File | Allowed Tools |
|---|---|---|---|---|
| `elaborate-discover` | 2.5 | `elaborate-discover.md` | `elaborate-discover-results.md` | Read, Write, Glob, Grep, Bash, Agent, WebSearch, WebFetch, ToolSearch, MCP read-only |
| `elaborate-wireframes` | 6.25 | `elaborate-wireframes.md` | `elaborate-wireframes-results.md` | Read, Write, Glob, Grep, Bash, MCP read-only |
| `elaborate-ticket-sync` | 6.5+6.75 | `elaborate-ticket-sync.md` | `elaborate-ticket-sync-results.md` | Read, Write, Glob, Grep, Bash, ToolSearch, MCP read-only, ticketing write tools |

### Subagent Skill Frontmatter Pattern

```yaml
---
description: (Internal) Autonomous {purpose} for AI-DLC elaboration
context: fork
agent: general-purpose
user-invocable: false
allowed-tools:
  - Read
  - Write
  - Glob
  - Grep
  - Bash
  # plus task-specific tools
---
```

### Key Observations for New Subagent

- All subagent skills use `context: fork` and `agent: general-purpose`
- All subagent skills are `user-invocable: false`
- All subagent skills state: "You have NO access to `AskUserQuestion`. All work is fully autonomous."
- Results use YAML frontmatter with `status: success|error|skipped` and `error_message`
- The orchestrator (elaborate SKILL.md) handles user interaction based on results
- Subagents commit their work incrementally (each finding separately)
- The adversarial review subagent should follow this exact pattern

## Codebase Pattern: Phase 7 Spec Review (Current)

Phase 7 at line 1812 of `plugin/skills/elaborate/SKILL.md` is the existing spec review. It:

1. Launches a `general-purpose` subagent inline (NOT via a separate skill file — it's a prompt-only subagent)
2. The subagent reads `intent.md` and `unit-*.md` files
3. Reviews against a checklist: completeness (criteria, descriptions, dependencies, disciplines), consistency (numbering, slugs, verifiability, boundaries), YAGNI (scope, over-specification)
4. Reports PASS/WARN/FAIL
5. If FAIL, presents findings to user via `AskUserQuestion`
6. If PASS/WARN, outputs summary and proceeds

**Critical gap:** Phase 7 does NOT:
- Challenge assumptions in the spec
- Find contradictions between units (e.g., unit A says X is the source of truth, unit B assumes Y)
- Stress-test dependency ordering (e.g., can unit 3 really start before unit 2 is done?)
- Probe for hidden complexity (e.g., "this looks simple but actually requires...")
- Validate scope/YAGNI deeply (beyond surface-level "no extra units")
- Suggest concrete fixes for issues found
- Auto-apply high-confidence fixes

**Phase 7.5 fills this gap** by adding deep adversarial analysis after the lightweight checklist review.

## Codebase Pattern: Reviewer Hat Confidence Scoring

The reviewer hat (`plugin/hats/reviewer.md`) uses a three-tier confidence scoring system:

- **High**: Deterministic — test fails, type error, missing import, criterion unmet. Auto-fixable.
- **Medium**: Likely correct but context-dependent — naming, structure, design choices.
- **Low**: Subjective or uncertain — style preferences, alternative approaches, nice-to-haves.

Rules:
- High-confidence issues MUST block approval
- Low-confidence issues MUST NOT block approval
- Findings are grouped by confidence level

**This pattern should be reused by the adversarial review.** The brief intent says "high-confidence fixes applied automatically, low-confidence issues prompt user for clarification." This maps directly to the existing confidence scoring pattern.

## Codebase Pattern: Red Team / Blue Team Hats

The `adversarial` workflow already exists in `plugin/workflows.yml`:
```yaml
adversarial:
  description: Security-focused with Red/Blue team phases
  hats: [planner, builder, red-team, blue-team, reviewer]
```

The Red Team hat (`plugin/hats/red-team.md`) provides an adversarial mindset for security testing of implementations. Key patterns:
- Enumerates attack surface systematically
- Documents findings with severity (Critical/High/Medium/Low)
- Does NOT fix — only documents
- Anti-rationalization table to prevent premature "looks good" conclusions

**Key distinction:** Red Team operates on *implementations* (code). The new adversarial review operates on *specifications* (intent + unit markdown files). Different target, similar adversarial mindset.

## Codebase Pattern: Elaborate Phase Numbering

Current phase sequence:
```
0 → 0.5 → 1 → 2 → 2.25 → 2.5 → 3 → 4 → 5 → 5.5 → 5.6 → 5.75 → 5.8 → 5.9 → 5.95 → 6 → 6.25 → 6.5+6.75 → 7 → 8
```

Phase 7.5 slots between Phase 7 (Spec Review) and Phase 8 (Handoff). This is a clean insertion point — Phase 7 validates structural correctness, Phase 7.5 validates semantic correctness, Phase 8 hands off to execution.

## Codebase Pattern: Integration Skill Cross-Unit Validation

The integrate skill (`plugin/skills/execute/subskills/integrate/SKILL.md`) validates cross-unit interactions POST-execution:
- Verifies merged state integrity
- Runs full backpressure suite (tests, lint, types)
- Checks intent-level success criteria
- Verifies cross-unit boundaries, shared state, APIs
- Checks for emergent issues from unit combination
- Cross-unit deployment validation

The adversarial review should do the *pre-execution* version of some of these checks on the specs:
- Cross-unit contract consistency (does unit A's output match unit B's expected input?)
- Dependency ordering validation (can units actually execute in the specified order?)
- Cross-cutting concern completeness (are all cross-cutting concerns addressed?)

**These are spec-level analogs of what integrate does at the code level.**

## External Research: Adversarial Review Patterns in AI-Assisted Development

### Adversarial Code Review (ASDLC.io Pattern)

A verification pattern where a distinct AI session (the "Critic Agent") reviews artifacts produced by a Builder Agent against the spec before human review. Key principles:

- **Session isolation**: The Critic runs in a fresh session to prevent conversation drift and force evaluation of artifacts only, not the Builder's reasoning process
- **Skeptical by default**: The Critic Constitution directs: "You are skeptical. Your job is to reject code that violates the Spec, even if it 'works.' Favor false positives over false negatives."
- **Binary output**: PASS or a list of spec violations

This maps directly to AI-DLC's subagent model: the adversarial review subagent runs in a forked context (`context: fork`), sees only the spec artifacts (not the elaboration conversation), and outputs findings.

### Block Research: Adversarial Cooperation in Code Synthesis (2025)

Introduces "dialectical autocoding" — a bounded adversarial process between two cooperating agents. Key insights:

- Structured coach-player feedback loop enables substantially more progress on complex tasks
- The adversarial process works around fundamental attention limitations
- A moderator acts as a deduplication and prioritization layer, ensuring a unified checklist of findings

**Applicable to Phase 7.5:** The adversarial review subagent is the "critic/coach," the elaborate orchestrator is the "moderator" that deduplicates and prioritizes findings before presenting to the user.

### Multi-Agent Review with Confidence Scoring

Research on paired agent review (e.g., Claude + GPT Codex adversarial review) shows:

- When two agents independently flag the same issue, confidence auto-upgrades via majority voting
- Confidence-based gating allows generating utility-based confidence scores for downstream processing
- The adversarial process eliminates false positives through debate rounds

**Applicable to Phase 7.5:** The confidence scoring pattern (high/medium/low) already exists in AI-DLC's reviewer hat. The adversarial review should use the same pattern, with high-confidence findings auto-applied and low-confidence findings presented as questions.

### Spec-Driven Development Validation

Spec-driven development (Thoughtworks, GitHub Spec Kit) emphasizes:

- Clear specifications reduce LLM hallucinations and produce more robust code
- Machine-readable specs remain essential — they serve as the contract the Critic validates against
- Automated contradiction detection through formal logic and LLMs is an active research area

**Applicable to Phase 7.5:** The unit specs ARE the machine-readable contract. The adversarial review validates them against each other and against the intent, checking for contradictions, gaps, and hidden complexity before builders consume them.

### Key Design Decisions Informed by Research

1. **Run in isolated context** (forked subagent) — prevents the elaboration conversation from biasing the review
2. **Skeptical by default** — the adversarial reviewer should actively try to find problems, not confirm the spec is good
3. **Confidence scoring** — reuse the existing high/medium/low pattern for triaging findings
4. **Unified finding format** — each finding should include: issue description, affected units, confidence level, suggested fix, and evidence/reasoning
5. **Auto-fix for high-confidence issues** — the orchestrator can apply fixes without user confirmation when the finding is deterministic (e.g., missing dependency edge, contradictory field references)

## Architecture Decision: Subagent vs. Inline Review

### Option A: Inline subagent (like current Phase 7)

Phase 7 currently uses an inline Agent() call with a prompt — no separate skill file. This is simpler but limits the adversarial review's capabilities:

- Cannot have its own allowed-tools list
- Cannot be invoked independently for testing
- Prompt is embedded in the elaborate SKILL.md (already 2000+ lines)
- No brief/results file pattern for structured data exchange

### Option B: Dedicated skill file (like elaborate-discover)

Create `plugin/skills/elaborate/subskills/adversarial-review/SKILL.md` with its own brief/results pattern. This:

- Follows the established subagent delegation pattern (discover, wireframes, ticket-sync)
- Has its own `allowed-tools` list (needs Read, Write, Glob, Grep, Bash for file analysis)
- Can be invoked independently for testing
- Uses structured brief/results files for clean data exchange
- Keeps elaborate SKILL.md from growing even larger
- Enables the subagent to commit findings incrementally

**Decision: Option B (Dedicated skill file).** Consistency with existing patterns, independent testability, and structured data exchange outweigh the simplicity of inline.

### Implementation Shape

Files to create/modify:

1. **NEW: `plugin/skills/elaborate/subskills/adversarial-review/SKILL.md`** — The adversarial review subagent skill
   - `context: fork`, `agent: general-purpose`, `user-invocable: false`
   - Reads brief from `.ai-dlc/{slug}/.briefs/elaborate-adversarial-review.md`
   - Writes results to `.ai-dlc/{slug}/.briefs/elaborate-adversarial-review-results.md`
   - Allowed tools: Read, Write, Glob, Grep, Bash (for spec analysis — no web search, no MCP, no AskUserQuestion)

2. **MODIFY: `plugin/skills/elaborate/SKILL.md`** — Add Phase 7.5 delegation
   - After Phase 7, add Phase 7.5 that:
     a. Writes the adversarial review brief (intent.md + all unit-*.md + discovery.md context)
     b. Commits the brief
     c. Invokes the subagent
     d. Reads results
     e. Auto-applies high-confidence fixes (edit spec files, commit)
     f. Presents low-confidence findings to user via AskUserQuestion
     g. Commits any user-driven fixes

3. **MODIFY: `plugin/schemas/settings.schema.json`** — (Optional) Add `adversarial_review` boolean setting
   - Could be used to gate the phase, but since it adds value without cost, defaulting to always-on is simpler
   - **Decision: Always-on by default** — no settings gate needed initially. Can be added later if users request opt-out.

## Architecture Decision: Finding Format

Each adversarial review finding needs a structured format that enables:
1. The subagent to write findings systematically
2. The orchestrator to parse and triage findings
3. Auto-fix logic to apply high-confidence fixes programmatically
4. User-facing presentation of low-confidence findings

### Proposed Finding Format

```yaml
findings:
  - id: F001
    category: contradiction  # contradiction | hidden-complexity | assumption | dependency | scope | completeness | boundary
    confidence: high  # high | medium | low
    severity: blocking  # blocking | warning | suggestion
    affected_units: [unit-02-api-layer, unit-03-frontend]
    title: "Contradictory data source references"
    description: "unit-02 specifies REST API as data source for user profiles, but unit-03 references GraphQL for the same data"
    evidence: "unit-02 line 45: 'GET /api/users/{id}' vs unit-03 line 32: 'query { user(id: $id) { ... } }'"
    suggested_fix: "Align both units to use the same data source. Since the API is REST-based (per discovery.md), update unit-03 to reference REST endpoints."
    fix_type: spec_edit  # spec_edit | add_dependency | remove_unit | add_criterion | reorder | manual
    fix_target: unit-03-frontend  # Which file to edit for auto-fix
```

### Finding Categories

| Category | What It Catches | Example |
|---|---|---|
| `contradiction` | Units make conflicting claims about the same entity, API, or behavior | Unit A says REST, unit B says GraphQL |
| `hidden-complexity` | A unit appears simple but hides significant technical challenge | "Implement real-time sync" with no mention of conflict resolution |
| `assumption` | An unvalidated assumption that could invalidate the unit | Assumes API supports pagination when it doesn't |
| `dependency` | Missing, incorrect, or unnecessary dependency edges | Unit 3 uses output of unit 2 but doesn't depend_on it |
| `scope` | YAGNI violation or scope creep beyond the intent | Unit for "admin dashboard" when intent is "user profile page" |
| `completeness` | Missing success criteria, missing error paths, gaps in spec | No criterion for error handling in API unit |
| `boundary` | Unit boundary violation — work that belongs in another unit | Frontend unit includes backend validation logic |

### Fix Types

| Fix Type | Auto-Apply? | Description |
|---|---|---|
| `spec_edit` | Medium-high confidence only | Edit a specific section of a unit file |
| `add_dependency` | High confidence | Add a `depends_on` entry to unit frontmatter |
| `remove_unit` | Never auto | Remove a unit (too destructive) |
| `add_criterion` | Medium confidence | Add a success criterion to a unit |
| `reorder` | High confidence | Reorder unit numbering |
| `manual` | Never auto | Requires human judgment |

## Architecture Decision: Auto-Fix Boundary

The brief specifies: "High-confidence fixes are applied automatically by the orchestrator. Low-confidence issues are presented to the user as follow-up questions."

**Auto-fix rules:**
- `confidence: high` + `fix_type: add_dependency` → Auto-apply (deterministic: unit references another but lacks depends_on)
- `confidence: high` + `fix_type: spec_edit` → Auto-apply only for mechanical fixes (e.g., fixing a field name reference)
- `confidence: high` + `fix_type: add_criterion` → Auto-apply (adding missing obvious criteria)
- `confidence: medium` → Present to user with suggested fix, ask for confirmation
- `confidence: low` → Present to user as informational finding
- `fix_type: remove_unit` or `fix_type: manual` → Always present to user regardless of confidence

**The subagent writes the findings. The orchestrator (elaborate SKILL.md) applies the fixes.** The subagent does NOT modify spec files — it only reads and reports. This separation ensures:
1. Findings are reviewed (even if automatically) before any changes
2. The subagent can't accidentally corrupt spec files
3. All fix commits are attributed to the orchestrator, maintaining clear provenance

## Codebase Pattern: Elaborate SKILL.md Structure for New Phases

Looking at how existing delegated phases are structured in elaborate SKILL.md, the pattern is:

```markdown
## Phase N.N: {Phase Name} (Delegated)

{Skip condition if applicable}

### Step 1: {Precondition/config loading}
### Step 2: Write {name} brief
### Step 3: Invoke {name} subagent
### Step 4: Read results
### Step 5: Handle results (commit, present to user, etc.)

---
```

Phase 7.5 should follow this exact structure:

```markdown
## Phase 7.5: Adversarial Spec Review (Delegated)

### Step 1: Gather spec context
### Step 2: Write adversarial review brief
### Step 3: Invoke adversarial review subagent
### Step 4: Read results
### Step 5: Auto-apply high-confidence fixes
### Step 6: Present remaining findings to user
### Step 7: Apply user-approved fixes
### Step 8: Commit final spec state

---
```

## Data Source: Spec Files (Input to Adversarial Review)

The adversarial review subagent needs to read these files:

### Intent File
- **Path:** `.ai-dlc/{slug}/intent.md`
- **Contains:** YAML frontmatter (workflow, git strategy, passes, status), markdown body (Problem, Solution, Domain Model with entities/relationships/data sources/gaps, Success Criteria, Context)
- **Key for review:** Intent-level success criteria, domain model consistency, scope definition

### Unit Files
- **Path:** `.ai-dlc/{slug}/unit-NN-{slug}.md` (glob pattern: `unit-*.md`)
- **Contains:** YAML frontmatter (status, depends_on, branch, discipline, pass, workflow, ticket, design_ref, views, optional ops blocks), markdown body (Description, Discipline, Domain Entities, Data Sources, Technical Specification, Success Criteria, Risks, Boundaries, Notes)
- **Key for review:** Inter-unit consistency, dependency graph validity, success criteria completeness, boundary correctness, technical specification feasibility

### Discovery Log
- **Path:** `.ai-dlc/{slug}/discovery.md`
- **Contains:** All domain discovery findings (API schemas, codebase patterns, design analysis, data sources, domain model)
- **Key for review:** Validating specs against discovered reality — do units reference APIs/entities that actually exist?

### Wireframes (if present)
- **Path:** `.ai-dlc/{slug}/mockups/unit-NN-{slug}-wireframe.html`
- **Key for review:** Frontend units should have wireframes, wireframe content should match unit spec

## Provider Context: GitHub (vcsHosting) and GitHub Actions (ciCd)

From the brief's `provider_config`:
- `vcsHosting: github` — The project uses GitHub for version control hosting
- `ciCd: github-actions` — CI/CD runs via GitHub Actions

The adversarial review subagent does not need VCS/CI provider access. It reads spec files locally.

## Existing Implementations: Related Review Mechanisms

### Phase 7 (Spec Review) — Lightweight checklist
- Already exists inline in elaborate SKILL.md
- PASS/WARN/FAIL output
- Does NOT produce structured findings, does NOT suggest fixes

### Reviewer Hat — Execution-time code review
- Runs AFTER code is built (during execution, not elaboration)
- Uses confidence scoring (high/medium/low)
- Delegates to specialized subagents
- Produces structured completion marker (APPROVED / REQUEST CHANGES)

### Integrate Skill — Post-execution cross-unit validation
- Runs after ALL units are merged
- Validates cross-unit interactions at the code level
- ACCEPT/REJECT decision

### Red Team Hat — Adversarial security testing
- Runs during execution (adversarial workflow)
- Tests implementations, not specs
- Documents findings with severity ratings

**Key gap the adversarial review fills:** None of these mechanisms validate spec quality adversarially BEFORE execution begins. Phase 7 does basic structural checks; Phase 7.5 does deep semantic validation.

## Domain Model

### Entities

- **AdversarialReviewSkill**: The forked subagent skill definition (`plugin/skills/elaborate/subskills/adversarial-review/SKILL.md`) — Reads brief, analyzes specs adversarially, writes structured findings to results file. Fields: description, context (fork), agent (general-purpose), user-invocable (false), allowed-tools, review categories, anti-rationalization rules
- **AdversarialReviewBrief**: Input brief file (`.ai-dlc/{slug}/.briefs/elaborate-adversarial-review.md`) — Serialized context for the subagent. Fields: intent_slug, worktree_path, intent_content (full intent.md), unit_contents (all unit files), discovery_summary (key findings from discovery.md)
- **AdversarialReviewResults**: Output results file (`.ai-dlc/{slug}/.briefs/elaborate-adversarial-review-results.md`) — Structured findings with YAML frontmatter. Fields: status (success/error), findings_count, auto_fixable_count, findings (array of Finding objects)
- **Finding**: A single adversarial review finding — Fields: id, category (contradiction/hidden-complexity/assumption/dependency/scope/completeness/boundary), confidence (high/medium/low), severity (blocking/warning/suggestion), affected_units, title, description, evidence, suggested_fix, fix_type (spec_edit/add_dependency/remove_unit/add_criterion/reorder/manual), fix_target
- **Phase7.5Orchestration**: The Phase 7.5 section in elaborate SKILL.md — Writes brief, invokes subagent, reads results, auto-applies high-confidence fixes, presents low-confidence findings to user. Fields: step sequence (gather context, write brief, invoke, read, auto-fix, present, user-fix, commit)
- **ElaborateSkill**: The existing elaborate orchestrator (`plugin/skills/elaborate/SKILL.md`) — Contains all elaboration phases (0-8). Modified to include Phase 7.5 between Phase 7 and Phase 8
- **SettingsSchema**: The settings JSON schema (`plugin/schemas/settings.schema.json`) — May be extended with an `adversarial_review` boolean (decision: not initially, always-on by default)

### Relationships

- AdversarialReviewSkill **reads** AdversarialReviewBrief (input)
- AdversarialReviewSkill **writes** AdversarialReviewResults (output)
- AdversarialReviewResults **contains many** Finding objects
- Phase7.5Orchestration **writes** AdversarialReviewBrief
- Phase7.5Orchestration **invokes** AdversarialReviewSkill (via Agent())
- Phase7.5Orchestration **reads** AdversarialReviewResults
- Phase7.5Orchestration **is part of** ElaborateSkill (inserted between Phase 7 and Phase 8)
- Finding **references** one or more unit files (via affected_units)
- Finding **may auto-fix** the unit file (when confidence=high and fix_type allows it)

### Data Sources

- **Spec Files** (filesystem):
  - Available: intent.md frontmatter + body, unit-*.md frontmatter + body, discovery.md
  - Missing: Nothing — all spec data is available locally
  - Real sample: YAML frontmatter with `depends_on: [unit-01-setup]`, markdown body with `## Success Criteria` sections

- **Elaboration Conversation** (NOT available to subagent):
  - The subagent runs in forked context and cannot access the elaboration conversation
  - This is intentional — the adversarial review should evaluate specs objectively, not be biased by the reasoning that produced them

### Data Gaps

- **No gap in data availability.** The adversarial review subagent has access to all spec files it needs via the filesystem.
- **Potential gap in context:** The subagent cannot access discovery.md directly if it's large, but the brief can include a summary of key findings. Including the full discovery.md content in the brief would be ideal since the subagent needs to validate specs against discovered reality.

