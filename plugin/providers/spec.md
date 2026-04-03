---
category: spec
description: Bidirectional spec provider — sync specifications and knowledge between H·AI·K·U and documentation platforms
---

# Spec Provider — Default Instructions

## Inbound: Provider → H·AI·K·U

### During Elaboration
- Search for existing specifications, PRDs, or design docs related to the intent
- Pull content and distill into H·AI·K·U context (intent references, unit criteria)
- Reference specific spec documents in intent.md Context section

### During Stage Decomposition
- Verify referenced specs haven't changed since the previous stage
- Check for updated specs before decomposing units
- Pull cross-studio knowledge: if this intent was triggered by another studio, read the source studio's outputs from the spec provider

### Translation (Provider → H·AI·K·U)

| Provider Concept | H·AI·K·U Concept | Translation |
|---|---|---|
| PRD / Requirements doc | Intent context + criteria | Distill requirements into verifiable completion criteria |
| Design doc / RFC | Stage input reference | Link as input, extract technical constraints |
| Meeting notes / decisions | Intent knowledge | Distill decisions into intent.md Context section |
| Wiki page | Stage output (from another studio) | Read as cross-studio input if referenced |

**Key principle:** Provider documents are often verbose, unstructured, and full of context that isn't actionable. Claude distills to the minimum needed: what are the requirements, what are the constraints, what are the decisions. Not a copy — a translation.

## Outbound: H·AI·K·U → Provider

### During Output Persistence
- Stage outputs scoped as `project` or `intent` can be pushed to the spec provider
- Write intent knowledge (discovery docs, design briefs, behavioral specs) to the provider in its native format
- This enables cross-studio data flow: the software studio's design brief in Confluence is readable by the marketing studio's content stage

### During Reflection
- Push reflection summaries to the spec provider for organizational visibility
- Write settings recommendations as a decision record

### Translation (H·AI·K·U → Provider)

| H·AI·K·U Concept | Provider Concept | Translation |
|---|---|---|
| Discovery document | Wiki page / design doc | Restructure for the provider's format (headings, templates) |
| Design brief | Linked design doc | Push as structured document with provider-native formatting |
| Behavioral spec | PRD or spec doc | Format as the team's standard spec template |
| Reflection summary | Decision record / retrospective | Distill into the team's retro format |

**Key principle:** Don't push markdown frontmatter to Confluence. Push the *content* in the format the provider's audience expects. Claude translates H·AI·K·U's internal representation into whatever the provider needs.

## Sync: Cross-Studio Knowledge

The spec provider is the primary channel for cross-studio data flow:

```
Studio A (sales) completes → pushes deal context to Confluence
Studio B (customer-success) starts → reads deal context from Confluence
```

Claude mediates both directions. The spec provider doesn't need to understand H·AI·K·U's schema — Claude reads the provider's content and produces H·AI·K·U artifacts, or reads H·AI·K·U artifacts and produces provider content.

## Provider Config

Provider-specific configuration lives under `providers.spec.config` in `.haiku/settings.yml`.
Schema: `${CLAUDE_PLUGIN_ROOT}/schemas/providers/{type}.schema.json`
