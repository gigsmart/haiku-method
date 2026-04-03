---
category: crm
description: Bidirectional CRM provider — sync deals, contacts, and lifecycle state between H·AI·K·U and CRM platforms
---

# CRM Provider — Default Instructions

## Inbound: Provider → H·AI·K·U

### Intent Discovery (Session Start)
- Query CRM for deals/opportunities in stages that map to H·AI·K·U work
- Surface deals that need action: new deals to qualify, proposals to send, contracts to review
- Check for deal stage changes that should trigger intent creation or stage advancement

### Intent Seeding
- When a new deal is discovered (or a trigger fires), distill CRM data into an intent:
  - Deal name → intent title
  - Deal stage → active H·AI·K·U stage (mapped via translation table)
  - Contact information → intent context
  - Deal amount, timeline, requirements → completion criteria context
  - Related activities (emails, meetings, notes) → stage input context

### Translation (Provider → H·AI·K·U)

The CRM's data model is fundamentally different from H·AI·K·U's. Claude bridges:

| CRM Concept | H·AI·K·U Concept | Translation |
|---|---|---|
| Deal / Opportunity | Intent | Title, description, context from deal fields |
| Deal Stage (Prospecting, Qualification, etc.) | Active stage in sales studio | Map CRM stages to H·AI·K·U stages (see mapping below) |
| Contact / Company | Intent context | Distill into context: who, what they need, decision makers |
| Activities (emails, calls, meetings) | Stage input context | Summarize relevant interactions for the current stage |
| Deal properties (amount, close date, probability) | Intent metadata | Informational context, not enforced fields |
| Custom fields | (varies) | Include relevant custom fields in context |

### Stage Mapping

CRM deal stages don't map 1:1 to H·AI·K·U stages. Claude uses semantic understanding:

```
CRM: Prospecting     → H·AI·K·U: research
CRM: Qualification   → H·AI·K·U: qualification
CRM: Needs Analysis  → H·AI·K·U: qualification (still gathering)
CRM: Proposal        → H·AI·K·U: proposal
CRM: Negotiation     → H·AI·K·U: negotiation
CRM: Closed Won      → H·AI·K·U: close (completed)
CRM: Closed Lost     → H·AI·K·U: close (completed, outcome: lost)
```

**Key principle:** The CRM doesn't store H·AI·K·U frontmatter. Claude reads the CRM's native fields and produces H·AI·K·U artifacts. If the CRM has a "Next Steps" field, that becomes context for the current stage — not a frontmatter field.

## Outbound: H·AI·K·U → Provider

### State Sync (During Execution)
- **Stage advances** → Update CRM deal stage to the mapped value
- **Intent completes** → Mark deal as Closed Won/Lost based on outcome
- **Key outputs produced** → Log as CRM activity (proposal sent, contract drafted)
- **Await gate reached** → Add CRM task for the awaited action
- **Blocker encountered** → Add CRM note with blocker details

### Translation (H·AI·K·U → Provider)

| H·AI·K·U Concept | CRM Concept | Translation |
|---|---|---|
| Stage completion | Deal stage change | Map H·AI·K·U stage to CRM stage |
| Unit output (proposal doc, contract) | Activity / attachment | Log as activity, attach document |
| Await gate | Task / reminder | Create CRM task: "Follow up: {awaited event}" |
| Reflection insights | Deal notes | Summarize learnings as deal notes |
| Intent completion | Deal close | Set outcome, amount, close date |

**Key principle:** Push the minimum needed to keep the CRM accurate. Don't try to replicate H·AI·K·U's internal structure in CRM fields. A stage completion becomes a deal stage change. A reflection becomes a note. The CRM audience doesn't need to know about bolts, hats, or review agents.

## Sync: Cross-Studio Triggers

The CRM is a natural trigger source for cross-studio work:

```
CRM deal closes (Closed Won)
  → Next session: Claude checks CRM, sees closed deal
  → Suggests: "Deal Acme Corp closed. Create customer success onboarding intent?"
  → If approved: seeds CS intent with deal context from CRM
```

This is pull-based — Claude checks the CRM at session start, not via webhooks.

## Provider Config

Provider-specific configuration lives under `providers.crm.config` in `.haiku/settings.yml`.
Schema: `${CLAUDE_PLUGIN_ROOT}/schemas/providers/{type}.schema.json`

Config fields:
- `pipeline_id` — which CRM pipeline to monitor
- `stage_mapping` — custom CRM stage → H·AI·K·U stage mapping
- `sync_activities` — whether to log H·AI·K·U actions as CRM activities
- `trigger_on_stage` — which CRM stage transitions should surface as intent suggestions
