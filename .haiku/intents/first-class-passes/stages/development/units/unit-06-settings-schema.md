---
name: unit-06-settings-schema
type: backend
status: completed
inputs: ["knowledge/DISCOVERY.md"]
depends_on: [unit-01-pass-definitions]
bolt: 0
hat: ""
started_at: 2026-03-31T20:08:07Z
completed_at: 2026-03-31T20:08:07Z
---


# unit-06-settings-schema

## Description

Update the settings schema to remove the hardcoded pass enum and accept any string that maps to a pass definition file. Update the setup skill and fundamentals skill to document pass customization.

## Domain Entities

- **Settings**: `default_passes` field in `.ai-dlc/settings.yml`
- **PassDefinition**: Available passes determined by files in `plugin/passes/` and `.ai-dlc/passes/`

## Data Sources

- `plugin/schemas/settings.schema.json` — `default_passes` definition (lines 42-50)
- `plugin/skills/setup/SKILL.md` — initial project setup that creates settings.yml
- `plugin/skills/fundamentals/SKILL.md` — documents pass customization for users

## Technical Specification

### 1. Update `settings.schema.json`

Current:
```json
"default_passes": {
  "type": "array",
  "items": {
    "type": "string",
    "enum": ["design", "product", "dev"]
  },
  "default": [],
  "description": "Default iteration passes for new intents. Empty array means single dev pass (the default). Example: ['design', 'dev'] for design-then-dev workflow."
}
```

Change to:
```json
"default_passes": {
  "type": "array",
  "items": {
    "type": "string"
  },
  "default": [],
  "description": "Default iteration passes for new intents. Each name must have a pass definition file in plugin/passes/ or .ai-dlc/passes/. Empty array means single dev pass (the default). Built-in passes: design, product, dev. Custom passes: create .ai-dlc/passes/{name}.md."
}
```

Remove the `enum` constraint, leaving `type: string`. Validation happens at runtime via `validate_pass_exists`.

### 2. Update setup skill

In `plugin/skills/setup/SKILL.md`, update the passes configuration section to:
- List built-in passes (design, product, dev) with their descriptions
- Explain that custom passes can be created by adding `.ai-dlc/passes/{name}.md`
- Show the available passes dynamically using `list_available_passes` from pass.sh
- Default to `[]` (single dev pass) unless the user opts into multipass

### 3. Update fundamentals skill

In `plugin/skills/fundamentals/SKILL.md`, add a section on passes:
- What passes are and when to use them
- Built-in pass types and their purposes
- How to create custom passes (`.ai-dlc/passes/{name}.md` format)
- How to augment built-in passes with project-specific instructions
- How to configure default passes in settings.yml
- Single-pass vs multipass tradeoffs

### 4. Update TypeScript types if needed

Check `plugin/shared/src/types.ts` — the `passes?: string[]` and `active_pass?: string` types are already correct (no enum constraint in TypeScript). Verify no TypeScript validation code hardcodes the pass names.

## Success Criteria

- [x] `settings.schema.json` `default_passes.items` has no `enum` constraint — accepts any string
- [x] Schema description documents built-in passes and how to create custom ones
- [x] Setup skill presents available passes dynamically (built-in + project-defined)
- [x] Fundamentals skill documents pass customization, augmentation, and single-pass default
- [x] TypeScript types do not hardcode pass name validation

## Risks

- **Invalid pass names**: Without enum validation, users could configure pass names with no definition file. Mitigation: runtime validation via `validate_pass_exists` in the elaborate skill (unit-04). Schema relaxation is intentional.

## Boundaries

This unit updates schema and documentation skills ONLY. It does NOT:
- Create pass definition files (unit-01)
- Change hook behavior (unit-02, unit-03)
- Modify elaborate or execute flow logic (unit-04, unit-05)
- Update the paper or website (unit-07, unit-08)

## Notes

- The schema change is minimal (removing `enum`). The real documentation work is in the fundamentals skill, which is the primary reference for users learning the methodology.
- The setup skill should mention passes as an advanced/optional feature — don't overwhelm new users.
