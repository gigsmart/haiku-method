---
name: unit-04-elaborate-skill-updates
status: completed
depends_on:
  - unit-01-pass-definitions
bolt: 0
hat: ''
started_at: 2026-03-31T20:08:07.000Z
completed_at: 2026-03-31T20:08:07.000Z
---


# unit-04-elaborate-skill-updates

## Description

Update the elaborate skill's Phase 5.95 (Iteration Passes) to present configured passes as a suggestion rather than silently applying them, support custom pass names validated against available definitions, and properly tag units with their pass.

## Domain Entities

- **PassDefinition**: Validated via `validate_pass_exists` from unit-01's `pass.sh`
- **Intent**: `passes` and `active_pass` frontmatter fields written during elaboration
- **Unit**: `pass` frontmatter field set to the active pass during elaboration
- **Settings**: `default_passes` array in `.ai-dlc/settings.yml`

## Data Sources

- `plugin/skills/elaborate/SKILL.md` — Phase 5.95 (lines 1320-1341) is the primary target
- `plugin/schemas/settings.schema.json` — `default_passes` field definition (lines 42-50)
- `plugin/lib/pass.sh` — pass validation functions (created in unit-01)
- `.ai-dlc/settings.yml` — source of `default_passes` configuration

## Technical Specification

### 1. Update Phase 5.95 to present passes as suggestion

Current behavior: if `DEFAULT_PASSES` has 2+ entries, apply them directly without asking.

New behavior:

```bash
source "${CLAUDE_PLUGIN_ROOT}/lib/pass.sh"
DEFAULT_PASSES=$(yq -r '.default_passes // [] | join(",")' .ai-dlc/settings.yml 2>/dev/null || echo "")
```

**If `DEFAULT_PASSES` is empty or contains fewer than 2 entries**: skip this phase entirely (same as current). Set `passes: []` and `active_pass: ""`.

**If `DEFAULT_PASSES` has 2+ entries**: validate each pass name, then ask the user to confirm:

```bash
# Validate each configured pass
for pass_name in $(echo "$DEFAULT_PASSES" | tr ',' ' '); do
  if ! validate_pass_exists "$pass_name"; then
    echo "WARNING: Pass '$pass_name' has no definition file. Skipping."
  fi
done
```

Present to user via AskUserQuestion:
```
"Project default passes: {pass1} → {pass2} → {pass3}. Use these for this intent?"
Options:
- "Use defaults" — Apply the configured passes
- "Override" — Specify different passes or use single-pass
- "Single pass (dev only)" — Skip multipass, use single implicit dev pass
```

If "Override": ask the user which passes and in what order, validating each against `validate_pass_exists`.

### 2. Support custom pass names

Currently `default_passes` is constrained to `["design", "product", "dev"]` by the settings schema enum. The schema change is in unit-06, but the elaborate skill needs to work with any valid pass name.

When validating passes, check `validate_pass_exists` rather than comparing against a hardcoded list. Any pass name that has a definition file (in `plugin/passes/` or `.ai-dlc/passes/`) is valid.

### 3. Display pass information during elaboration

When passes are configured for the intent, show the pass context to the user:

```markdown
## Passes Configured

| Pass | Description | Available Workflows |
|------|-------------|-------------------|
| design | Visual and interaction design | design |
| product | Behavioral specification and gap analysis | default, bdd |
| dev | Working implementation | default, tdd, adversarial, bdd |

Active pass: **design** (units elaborated in this session belong to this pass)
```

Load descriptions from pass definitions using `load_pass_metadata`.

### 4. Tag units with active pass

When writing unit frontmatter in Phase 6 Step 3, set `pass:` to the active pass value:

```yaml
pass: "design"  # Set to active_pass when passes are configured
```

This is already partially described in the elaborate skill but should be explicitly enforced: every unit created during a pass gets tagged with that pass.

### 5. Update intent.md frontmatter format

The `passes` field in intent frontmatter should be a flat array of pass names (matching the current implementation), NOT structured objects with per-pass status (as the paper currently shows). The paper will be updated in unit-07 to match.

```yaml
passes: [design, product, dev]
active_pass: "design"
```

## Success Criteria

- [x] Phase 5.95 presents configured passes as a suggestion with AskUserQuestion (not silently applied)
- [x] User can accept defaults, override with different passes, or choose single-pass
- [x] Custom pass names are validated against `validate_pass_exists` — invalid names produce a warning
- [x] Pass descriptions and available workflows are displayed when passes are configured
- [x] Units created during elaboration have `pass:` set to the active pass value
- [x] Single-pass intents (empty or 1-entry default_passes) skip Phase 5.95 entirely (backward compatible)

## Risks

- **User confusion**: If the user doesn't understand passes, the AskUserQuestion could be confusing. Mitigation: clear description in the question text explaining what passes do and that single-pass is always an option.
- **Pass validation on empty project**: New projects won't have `.ai-dlc/passes/` yet. Mitigation: `validate_pass_exists` checks plugin passes first, so built-in passes always validate. Custom passes require the project to create definition files.

## Boundaries

This unit updates the elaborate skill's pass handling ONLY. It does NOT:
- Create pass definition files (unit-01)
- Change hook injection (unit-03)
- Update execute skill pass transitions (unit-05)
- Modify the settings schema (unit-06)
- Update documentation (unit-07, unit-08)

## Notes

- The autonomous mode behavior should also be updated: in autonomous mode, auto-accept default passes without asking (current behavior) but validate each pass name first.
- The `active_pass` in intent frontmatter is what the hooks read during construction. Getting this right during elaboration is critical.
