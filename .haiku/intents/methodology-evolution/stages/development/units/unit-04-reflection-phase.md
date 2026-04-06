---
name: unit-04-reflection-phase
type: backend
status: completed
depends_on: [unit-03-operation-phase]
bolt: 0
hat: ""
started_at: null
completed_at: null
---


# unit-04: Reflection Phase

## Description
Implement the Reflection phase in the H•AI•K•U core plugin. Reflection is about taking what we learned and refining it into data that drives the next iteration. The `/reflect` skill analyzes a completed Execution + Operation cycle, produces structured reflection artifacts, and feeds learnings forward in two ways: (a) into a new version of the same intent, (b) into organizational memory for all future intents.

## Discipline
backend

## Domain Entities
- Reflection Artifact, Phase (Reflection), Hat (reflector)

## Data Sources
- H•AI•K•U core plugin (unit-02, unit-03 output)
- Intent artifacts: intent.md, unit-*.md, operations.md
- Execution state: iteration.json, scratchpad.md, blockers.md

## Technical Specification

### /reflect Skill
```
skills/reflect/SKILL.md
```

The `/reflect` skill:
1. Reads the completed intent: all unit specs, execution state, operational outcomes
2. Analyzes the cycle:
   - **Execution metrics**: bolt count per unit, retry count, blocker history, quality gate pass rates
   - **Operational outcomes**: which operational tasks succeeded/failed, what patterns emerged
   - **Criteria satisfaction**: how well were success criteria met? Any partial satisfaction?
   - **Process observations**: what worked well? What was painful? Where did the methodology help or hinder?
3. Produces a `reflection.md` artifact
4. Asks the user to validate findings and add human observations
5. Based on findings, offers two paths:
   - **Iterate**: Create intent v2 with learnings pre-loaded into the next elaboration
   - **Close**: Capture organizational learnings and archive the intent

### reflection.md Format
Written to `.haiku/{intent-slug}/reflection.md`:

```markdown
---
intent: {intent-slug}
version: 1
created: {ISO date}
status: complete
---

# Reflection: {Intent Title}

## Execution Summary
- Units completed: N/M
- Total bolts: X across all units
- Average retries per unit: Y
- Blockers encountered: Z (listed below)

## What Worked
- {Specific thing that worked well, with evidence}
- {Another thing}

## What Didn't Work
- {Specific thing that was painful or failed, with evidence}
- {Proposed improvement for next time}

## Operational Outcomes
- {How operational tasks performed}
- {What operational changes are needed}

## Key Learnings
- {Distilled insight 1 — actionable for future intents}
- {Distilled insight 2}

## Recommendations
- [x] {Specific recommendation for next iteration or future work}
- [x] {Another recommendation}

## Next Iteration Seed
{If applicable: what should v2 of this intent focus on? What would the elaboration start with?}
```

### Intent Versioning
When the user chooses to iterate:
1. Archive current intent state: rename `.haiku/{slug}/` to `.haiku/{slug}-v1/` (or tag in git mode)
2. Create new intent `.haiku/{slug}/intent.md` with:
   - Pre-loaded learnings from reflection.md
   - Updated success criteria based on what was learned
   - Reference to v1 artifacts
3. The new elaboration starts with reflection context, not from scratch

### Organizational Memory
When the user chooses to close (or after iterating):
1. Distill key learnings into concise, reusable patterns
2. Write to organizational memory location:
   - In git mode: `.claude/memory/` or project CLAUDE.md (configurable)
   - In folder mode: `.haiku/memory/` directory
3. Format: markdown files organized by topic, not chronologically
4. Future elaborations can reference these learnings

### Reflector Hat (`hats/reflector.md`)
The reflector hat:
- Reads all execution and operational artifacts
- Identifies patterns, anti-patterns, and surprises
- Produces structured analysis with evidence (not opinions)
- Asks targeted questions to surface human observations
- Writes reflection.md with actionable recommendations

### State Extension
Extend `iteration.json`:
```json
{
  "phase": "reflection",
  "reflectionStatus": "analyzing|awaiting-input|complete",
  "version": 1,
  "previousVersions": []
}
```

## Success Criteria
- [x] `/reflect` skill analyzes completed cycles and produces `reflection.md`
- [x] Reflection artifacts include: execution metrics, what worked/didn't, learnings, recommendations
- [x] Intent versioning works: v1 archives, v2 starts with pre-loaded learnings
- [x] Organizational memory writes distilled insights to configurable location
- [x] Reflector hat produces evidence-based analysis, not generic observations
- [x] User can validate and augment reflection findings before they're persisted
- [x] Works in both git and folder storage modes

## Risks
- **Generic reflections**: If the reflector just produces "things went well" platitudes, the feature is useless. Mitigation: reflector must cite specific metrics, blockers, and artifacts as evidence.
- **Memory bloat**: Organizational memory could grow unbounded. Mitigation: reflector distills to concise patterns, not raw data. Memory files should be topic-organized and prunable.

## Boundaries
This unit implements Reflection. It does NOT modify Execution or Operation phases. It does NOT implement AI-DLC-specific reflection features — those would be in the AI-DLC profile.

## Notes
- The reflection should be USEFUL, not ceremonial — if it doesn't change how the next intent is elaborated, it's wasted effort
- Keep the organizational memory format compatible with Claude Code's auto-memory system
- Consider making reflection depth configurable: "quick" (metrics only) vs "deep" (full analysis)
