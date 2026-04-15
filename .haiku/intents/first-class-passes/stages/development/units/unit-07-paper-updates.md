---
name: unit-07-paper-updates
status: completed
depends_on:
  - unit-01-pass-definitions
bolt: 0
hat: ''
started_at: 2026-03-31T20:08:07.000Z
completed_at: 2026-03-31T20:08:07.000Z
---


# unit-07-paper-updates

## Description

Update the AI-DLC 2026 paper to accurately describe the pass system as implemented: pass definition files, the pass loop, pass-backs, workflow constraints per pass, project customization (augmentation pattern), and the single-pass default. Fix the paper-implementation mismatch where the paper shows structured pass objects but implementation uses flat arrays.

## Domain Entities

- **Paper**: The methodology specification at `website/content/papers/ai-dlc-2026.md`
- **PassDefinition**: As implemented in the plugin — the paper must describe what the plugin does

## Data Sources

- `website/content/papers/ai-dlc-2026.md` — the paper. Key sections:
  - "Iteration Through Passes" (line 373) — main pass description
  - "Pass" glossary entry (line 698) — artifact definition
  - "Multi-Pass Elaboration" (line 1085) — elaboration flow
  - "Execution Phase" (line 1099) — execution with passes
  - Glossary (line ~1684) — pass definition
  - Mermaid diagram (lines 379-415) — pass flow visualization
- `plugin/passes/*.md` — built-in pass definitions (created in unit-01) — the source of truth for what passes do

## Technical Specification

### 1. Fix pass frontmatter format mismatch

The paper currently shows structured pass objects in intent frontmatter (line 720):
```yaml
passes:
  - type: design
    status: completed
  - type: product
    status: active
  - type: dev
    status: pending
```

The implementation uses flat arrays:
```yaml
passes: [design, product, dev]
active_pass: "design"
```

Update ALL paper references to use the flat array format matching the implementation. Pass status is tracked implicitly through `active_pass` and unit statuses, not per-pass status fields.

### 2. Update "Iteration Through Passes" section (line 373)

Expand this section to describe:
- **Pass definition files**: passes are defined as frontmatter-enabled markdown files with instructions and workflow constraints
- **Built-in passes**: design, product, dev — with brief descriptions matching the pass definition files
- **Pass instructions**: injected into hat context during construction, shaping what the hat produces
- **Workflow constraints**: each pass declares which workflows are available. A design pass only allows the design workflow; a dev pass allows default, tdd, adversarial, bdd
- **The pass loop**: elaborate → execute → (transition) → elaborate → execute → ... → done
- **Single-pass default**: intents with no passes configured use a single implicit dev pass with zero overhead

### 3. Add pass customization documentation

Add a subsection on pass customization:
- **Project augmentation**: projects can augment built-in passes by creating `.ai-dlc/passes/{name}.md` — instructions are appended, not replaced
- **Custom passes**: projects can define entirely new pass types by creating `.ai-dlc/passes/{name}.md` with a name that doesn't match any built-in pass
- **Pass configuration**: `default_passes` in settings.yml, user confirms per intent during elaboration
- **Same augmentation pattern applies to hats**: plugin hats are canonical, project hats augment

### 4. Document pass-backs

Expand the existing pass-back description to be more specific:
- When a later pass discovers issues requiring earlier-pass work, `active_pass` is set backward
- Re-elaboration occurs for the target pass (new units are created alongside existing ones)
- Forward progression resumes after the pass-back is resolved
- Pass-backs are triggered manually (by reviewer recommendation or user decision), not automatically

### 5. Update the Pass artifact definition (line 698)

Revise to mention:
- Pass definition files (not just the conceptual definition)
- Frontmatter fields: `available_workflows`, `default_workflow`
- The augmentation pattern for project customization
- Updated frontmatter example using flat array format

### 6. Update the glossary entry (line ~1684)

Add: "Passes are defined as frontmatter-enabled markdown files with instructions and workflow constraints. Built-in passes: design, product, dev. Projects can augment or extend."

### 7. Update Mermaid diagram if needed

The existing Mermaid diagram (lines 379-415) showing the three-pass flow is still accurate. Verify it doesn't need changes. If adding pass-back arrows or customization notes, keep the diagram clean and simple.

## Success Criteria

- [x] Paper pass frontmatter examples use flat array format matching implementation (`passes: [design, product, dev]`, `active_pass: "design"`)
- [x] "Iteration Through Passes" section describes pass definition files, instructions, and workflow constraints
- [x] Pass customization (augmentation pattern) is documented in the paper
- [x] Pass-backs are described with specific mechanics (active_pass set backward, re-elaborate, resume forward)
- [x] Pass artifact definition updated with definition file details and updated frontmatter example
- [x] Glossary entry updated to mention definition files and customization
- [x] Single-pass default is clearly stated as zero-overhead
- [x] Hat augmentation pattern (same as passes) is mentioned for consistency
- [x] Paper claims match the implementation in the plugin — no aspirational features presented as implemented

## Risks

- **Paper drift**: The paper could describe aspirational features not yet implemented. Mitigation: every claim should map to a specific implementation file. If it doesn't exist yet, mark it clearly.
- **Over-documentation**: Adding too much implementation detail makes the paper less readable. Mitigation: keep the paper focused on concepts and principles. Refer to plugin files for implementation specifics.

## Boundaries

This unit updates the paper ONLY. It does NOT:
- Create pass definition files (unit-01)
- Change plugin implementation (unit-02 through unit-06)
- Update website content (unit-08)

## Notes

- The paper is the source of truth for methodology concepts. Changes here should focus on "what and why," not "how to implement it in bash."
- After updating the paper, verify cross-component consistency per the sync-check rule: does the plugin implement what the paper describes?
- The pass concept aligns with the paper's existing philosophy: "Everyone Becomes a Builder" — passes don't change the workflow, they change the lens.
