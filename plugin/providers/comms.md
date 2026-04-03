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

For `await` gates, the comms provider can serve as the event signal:

```
1. Stage completes → post "Waiting for {event}" to channel
2. User replies "customer responded" or reacts with ✅
3. Next session: Claude checks the thread, sees confirmation
4. Advances the gate
```

This turns the comms channel into a lightweight event bus for human-mediated events.

## Provider Config

Provider-specific configuration lives under `providers.comms.config` in `.haiku/settings.yml`.
Schema: `${CLAUDE_PLUGIN_ROOT}/schemas/providers/{type}.schema.json`
