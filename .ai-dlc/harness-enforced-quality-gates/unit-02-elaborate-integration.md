---
status: completed
hat: done
last_updated: ""
depends_on:
  - unit-01-quality-gate-hook
branch: ai-dlc/harness-enforced-quality-gates/02-elaborate-integration
discipline: backend
pass: ""
workflow: ""
ticket: ""
---

# unit-02-elaborate-integration

## Description
Update the elaborate skill to discover repo tooling during domain discovery and populate `quality_gates:` in intent.md frontmatter. This ensures every intent gets appropriate gates defined during elaboration — the phase where the human is most engaged and can validate the choices.

## Discipline
backend - Skill implementation (markdown-defined workflow logic + shell discovery).

## Domain Entities
- **Elaborate Skill** (`plugin/skills/elaborate/SKILL.md`): The main elaboration orchestrator.
- **Elaborate-Discover Skill** (`plugin/skills/elaborate/subskills/discover/SKILL.md`): Autonomous discovery subagent.
- **Intent Frontmatter**: Where `quality_gates:` gets written.
- **Repo Tooling**: Package managers, test runners, linters, type checkers detected from project files.

## Data Sources
- `plugin/skills/elaborate/SKILL.md` — elaborate skill (Phase 6 writes intent.md)
- `plugin/skills/elaborate/subskills/discover/SKILL.md` — discovery skill (Phase 2 explores repo)
- Project files that indicate tooling: `package.json`, `Makefile`, `go.mod`, `pyproject.toml`, `Cargo.toml`, `composer.json`, `Gemfile`, `build.gradle`, `pom.xml`, `deno.json`, `bun.lockb`

## Technical Specification

### Part 1: Discovery — Detect Repo Tooling

In `plugin/skills/elaborate/subskills/discover/SKILL.md`, add a new exploration step to the "What to Explore" section. The discovery subagent should detect quality gate candidates by examining project files.

**Detection heuristics:**

| File | Gate Candidates |
|------|----------------|
| `package.json` with `scripts.test` | `{name: "tests", command: "npm test"}` |
| `package.json` with `scripts.lint` | `{name: "lint", command: "npm run lint"}` |
| `package.json` with `scripts.typecheck` or `scripts.type-check` | `{name: "typecheck", command: "npm run typecheck"}` or `npm run type-check` |
| `bun.lockb` exists | Replace `npm` with `bun` in above commands |
| `go.mod` | `{name: "tests", command: "go test ./..."}`, `{name: "vet", command: "go vet ./..."}` |
| `pyproject.toml` with `[tool.pytest]` | `{name: "tests", command: "pytest"}` |
| `pyproject.toml` with `[tool.ruff]` | `{name: "lint", command: "ruff check ."}` |
| `pyproject.toml` with `[tool.mypy]` | `{name: "typecheck", command: "mypy ."}` |
| `Cargo.toml` | `{name: "tests", command: "cargo test"}`, `{name: "lint", command: "cargo clippy"}` |
| `Makefile` with `test` target | `{name: "tests", command: "make test"}` |

**Discovery output:** Append a new section to `discovery.md`:

```markdown
## Quality Gate Candidates

Detected from project tooling:

| Name | Command | Source |
|------|---------|--------|
| tests | npm test | package.json scripts.test |
| lint | npm run lint | package.json scripts.lint |
| typecheck | npx tsc --noEmit | tsconfig.json present |

Recommended intent-level quality_gates:
```yaml
quality_gates:
  - name: tests
    command: "npm test"
  - name: lint
    command: "npm run lint"
  - name: typecheck
    command: "npx tsc --noEmit"
```
```

The subagent writes this to discovery.md. The main elaborate skill reads it during Phase 6.

### Part 2: Elaborate Phase 6 — Write quality_gates to intent.md

In `plugin/skills/elaborate/SKILL.md` Phase 6 Step 2, update the intent.md frontmatter template to include `quality_gates:`.

Add to the frontmatter YAML block:
```yaml
quality_gates: []  # Populated from discovery; e.g., [{name: tests, command: "npm test"}]
```

After writing the initial intent.md, read the discovery.md for the "Quality Gate Candidates" section. If found, parse the recommended gates and update the frontmatter:

```bash
# Read discovered gates from discovery.md
GATES=$(grep -A 100 "^## Quality Gate Candidates" ".ai-dlc/${INTENT_SLUG}/discovery.md" | \
  sed -n '/^```yaml/,/^```/p' | sed '1d;$d')
```

Present the discovered gates to the user for confirmation before writing. Use `AskUserQuestion`:
```json
{
  "questions": [{
    "question": "These quality gates were detected from your project tooling. Should they be enforced by the harness during construction?",
    "header": "Quality Gates",
    "options": [
      {"label": "Use all", "description": "Enforce all detected gates"},
      {"label": "Let me choose", "description": "I want to select which gates to include"},
      {"label": "Skip gates", "description": "No quality gates for this intent"}
    ]
  }]
}
```

- **Use all**: Write all detected gates to intent.md frontmatter
- **Let me choose**: Present each gate individually for approval
- **Skip gates**: Write empty `quality_gates: []`

### Part 3: Builder Gate Addition (Add-Only Ratchet)

In `plugin/skills/elaborate/SKILL.md` or a separate section of the builder hat reference, document how builders can add gates during construction:

A builder may discover during construction that additional gates are needed (e.g., a migration dry-run check, a new test suite). The builder can add gates to the current unit's frontmatter:

```yaml
quality_gates:
  - name: migration_check
    command: "npx prisma migrate diff --exit-code"
```

**Constraints enforced by the quality-gate.sh hook:**
- Gates in intent.md frontmatter can never be removed (the hook reads them fresh each time)
- Gates in unit frontmatter can only be added (the hook reads them fresh each time)
- Removing a gate from frontmatter would require editing the file, which is allowed — but the intent gates still apply regardless

**Note:** The ratchet effect is a convention enforced by process, not by the hook. The hook simply reads whatever is in frontmatter and enforces it. The ratchet is that builders are instructed to only ADD gates, and reviewers verify no gates were removed.

## Success Criteria
- [ ] `elaborate-discover/SKILL.md` includes a tooling detection step that identifies test/lint/typecheck commands from project files
- [ ] Discovery results include a "Quality Gate Candidates" section in discovery.md with detected gates
- [ ] `elaborate/SKILL.md` Phase 6 includes `quality_gates:` in intent.md frontmatter template
- [ ] User is asked to confirm detected gates before they're written to frontmatter
- [ ] Detection covers at least: npm/bun (test, lint, typecheck), go (test, vet), python (pytest, ruff, mypy), rust (test, clippy)
- [ ] Empty `quality_gates: []` is written when user skips or no tooling detected

## Risks
- **False detection**: A `package.json` might have a `test` script that's a placeholder (`echo "no tests"`). Mitigation: discovery subagent can run the command once to verify it works, or the user confirms during elaboration.
- **Missing tooling**: Niche build systems (Bazel, Buck, Pants) aren't covered by default heuristics. Mitigation: user can always add custom gates via "Other" option or during construction.
- **Frontmatter YAML complexity**: Nested list-of-objects in frontmatter can be tricky to parse/write. Mitigation: use yq for structured YAML manipulation rather than sed/grep.

## Boundaries
This unit modifies the elaborate and elaborate-discover skills ONLY. It does NOT:
- Modify the quality-gate.sh hook (unit-02)
- Update builder/reviewer hat instructions (unit-04)
- Change the advance skill (unit-04)

## Notes
- The builder's ability to ADD gates during construction is documented here but enforced by convention (reviewer checks) rather than by code. A future enhancement could add a PreToolUse hook on Edit that prevents removing `quality_gates:` entries, but that's out of scope.
- For greenfield projects (no package.json yet), the elaborate skill should still write `quality_gates: []` and note that gates can be added during construction once tooling is set up.
