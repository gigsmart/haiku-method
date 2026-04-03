---
category: knowledge
description: Bidirectional knowledge provider — organizational memory and cross-studio context sharing
---

# Knowledge Provider — Default Instructions

## Purpose

The knowledge provider manages organizational memory that persists across intents, studios, and projects. While the spec provider handles per-intent documents (PRDs, design docs), the knowledge provider handles **cross-cutting organizational knowledge**: patterns, decisions, learnings, and context that spans multiple intents.

This is the primary mechanism for cross-studio data flow when studios live in different repositories or use different persistence adapters.

## Inbound: Provider → H·AI·K·U

### Context Loading (Session Start)
- Load organizational patterns and anti-patterns relevant to the current studio
- Load learnings from previous intents in the same or related studios
- Load cross-studio context: if this intent depends on work from another studio, pull that studio's outputs from the knowledge provider

### During Elaboration
- Search for prior art: has similar work been done before?
- Pull relevant patterns that should inform decomposition
- Load cross-studio outputs that serve as inputs for this intent

### During Reflection
- Read existing organizational memory to avoid duplicating learnings
- Check if patterns discovered in this intent match or contradict existing patterns

### Translation (Provider → H·AI·K·U)

| Provider Concept | H·AI·K·U Concept | Translation |
|---|---|---|
| Wiki page / knowledge article | Stage input context | Distill to actionable context for the current stage |
| Pattern library entry | Elaboration constraint | "Previous work established pattern X — consider it" |
| Cross-studio output (e.g., sales deal summary) | Intent seed / stage input | Extract the context relevant to this studio's needs |
| Organizational decision record | Constraint | "Company decided X on {date} — this applies to this work" |

**Key principle:** Organizational knowledge is often scattered across wikis, docs, and conversations. Claude reads what the provider has and distills it into the minimum context needed for the current stage. Not everything in the knowledge base is relevant — Claude filters by intent, studio, and stage context.

## Outbound: H·AI·K·U → Provider

### During Output Persistence
- Stage outputs scoped as `project` push to the knowledge provider for cross-studio availability
- Discovery documents, design briefs, behavioral specs → available to other studios via the knowledge provider

### During Reflection (Close Path)
- Distill learnings into the knowledge provider's format:
  - Patterns: reusable approaches that worked
  - Anti-patterns: approaches that failed, with context
  - Decisions: choices made with rationale
  - Process insights: improvements that apply broadly

### Translation (H·AI·K·U → Provider)

| H·AI·K·U Concept | Provider Concept | Translation |
|---|---|---|
| Stage output (discovery, design brief) | Knowledge article | Format for the provider's audience — not H·AI·K·U frontmatter |
| Reflection learning | Pattern / anti-pattern entry | Distill to: what, why, when to apply |
| Settings recommendation | Decision record | Format as: decision, context, consequences |
| Cross-studio handoff context | Linked article | Write the context the receiving studio needs |

**Key principle:** Don't push raw H·AI·K·U artifacts to the knowledge provider. Translate to the format the organization uses. A reflection.md becomes a retrospective in the team's format. A discovery document becomes a knowledge article. Claude writes for the provider's audience, not for H·AI·K·U's internal consumption.

## Sync: Cross-Studio Data Flow

The knowledge provider enables the critical cross-studio pattern:

```
Intent A (product-strategy) completes roadmap stage
  → Pushes roadmap item to knowledge provider
  → Formats as the organization's standard brief

Intent B (software) starts inception stage
  → Reads knowledge provider for relevant roadmap items
  → Distills into inception context and unit criteria
```

Claude does not need a shared filesystem or same repository. It reads from and writes to the knowledge provider in whatever format that provider uses. The translation happens in Claude's context, not in H·AI·K·U's persistence layer.

### Discovery

When loading cross-studio context, Claude searches the knowledge provider for:
1. Articles tagged or linked to the triggering intent/studio
2. Recent articles in relevant categories
3. Articles matching the current intent's problem space

Claude uses semantic understanding to find relevant knowledge — not just keyword matching.

## Provider Config

Provider-specific configuration lives under `providers.knowledge.config` in `.haiku/settings.yml`.
Schema: `${CLAUDE_PLUGIN_ROOT}/schemas/providers/{type}.schema.json`

Config fields:
- `space` / `database` / `folder` — where to read/write in the provider
- `cross_studio_tag` — tag/label used to mark cross-studio outputs
- `learnings_location` — where reflections write organizational learnings
