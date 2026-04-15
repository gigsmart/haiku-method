---
category: comms
description: Bidirectional comms provider — notifications out, signals in
---

# Comms Provider — Default Instructions

## Inbound: Provider → H·AI·K·U

### Event Discovery (Session Start)
- Check channels for messages that reference active intents
- Surface: stakeholder feedback, approval responses, blockers raised by team members
- Check for responses to `await` gate notifications (e.g., "customer replied")

### Translation (Provider → H·AI·K·U)

| Provider Concept | H·AI·K·U Concept | Translation |
|---|---|---|
| Channel message mentioning intent | Context for current stage | Distill relevant information |
| Thread reply to gate notification | Gate resolution signal | Surface as "event occurred" for await gates |
| Stakeholder feedback on shared output | Review input | Include in adversarial review context |

**Key principle:** Comms channels are noisy. Claude filters for messages relevant to active intents, not everything in the channel.

## Outbound: H·AI·K·U → Provider

### When to Post
- Intent elaboration complete → summary + link to epic
- Stage gate reached → gate type determines message:
  - `ask`: "Stage X complete, awaiting your approval"
  - `external`: "PR created for stage X review"
  - `await`: "Stage X complete, waiting for {event}. Reply here when it occurs."
- Unit review approved or rejected → brief outcome
- All stages complete → intent done notification
- Blocking issues requiring human attention

### Translation (H·AI·K·U → Provider)

| H·AI·K·U Concept | Provider Concept | Translation |
|---|---|---|
| Stage completion summary | Channel message | Concise summary with link to artifacts |
| Gate notification | Threaded message | Actionable request with clear next step |
| Blocker | Urgent message / mention | Tag responsible person with blocker details |
| Intent completion | Channel message | Summary of outcomes, link to reflection |

**Key principle:** Messages should be actionable and concise. Don't dump H·AI·K·U state — tell the person what they need to do and where to find details.

## Sync: Gate Resolution via Comms

The comms provider can post gate notifications and receive replies, but the agent cannot use comms MCP tools to self-approve a gate. Gate advancement is controlled by the orchestrator through structural signals (branch merge detection, URL-based CLI probing), not by agent self-confirmation.

For `await` gates where a comms signal is the expected resolution (e.g., a customer reply in a Slack thread), the flow is:

```
1. Stage completes → post "Waiting for {event}" to channel
2. User replies "customer responded" or reacts with ✅
3. User runs /haiku:pickup after the event occurs
4. Orchestrator checks gate status and advances
```

For `await` gates where the user wants to approve locally after confirming the event occurred, the stage must have a compound gate `[await, ask]` — the `ask` component allows local approval through the review UI.

### Comms as Notification, Not Signal Source

Comms MCP tools (Slack, Teams, Discord) are used for:

- **Outbound notifications** — posting gate status, intent completion, blockers
- **Inbound context** — surfacing stakeholder feedback, thread replies relevant to active intents

They are NOT used for gate advancement. The agent cannot confirm its own gate — that would be a process bypass.

## Provider Config

Provider-specific configuration lives under `providers.comms.config` in `.haiku/settings.yml`.
Schema: `${CLAUDE_PLUGIN_ROOT}/schemas/providers/{type}.schema.json`
