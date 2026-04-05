---
description: Show historical throughput from completed intents — bolt counts, stage durations, patterns
user-invocable: true
argument-hint: "[studio-name]"
allowed-tools:
  - Read
  - Glob
  - Grep
  - Bash
  - Agent
  - ToolSearch
  - "mcp__*__haiku_*"
---

# H·AI·K·U Capacity

## Name

`haiku:capacity` — Historical throughput analysis from local intent artifacts.

## Synopsis

```
/haiku:capacity                  # All studios
/haiku:capacity software         # Single studio
```

## Description

**User-facing command** — Reads completed and active intent artifacts to show historical patterns. Not estimates — data about what actually happened.

Sources:
- Intent frontmatter: `started_at`, `completed_at`, `studio`, `status`
- Stage state.json: `started_at`, `completed_at`, `phase`, `gate_outcome`
- Unit frontmatter: `bolt`, `hat`, `status`, `started_at`, `completed_at`
- Git log: commit timestamps for stage transitions

## Implementation

### Step 1: Discover Intents

```
haiku_intent_list → all intents with studio, status, active_stage
```

Group by studio. Filter by argument if a studio name was provided.

### Step 2: Compute Per-Intent Metrics

For each intent:

```bash
# Intent duration
STARTED=$(haiku_intent_get { slug, field: "started_at" })
COMPLETED=$(haiku_intent_get { slug, field: "completed_at" })
# If completed: duration = completed_at - started_at
# If active: duration = now - started_at (in progress)
```

For each stage in the intent:

```bash
# Read stage state
STAGE_STARTED=$(haiku_stage_get { intent, stage, field: "started_at" })
STAGE_COMPLETED=$(haiku_stage_get { intent, stage, field: "completed_at" })
STAGE_PHASE=$(haiku_stage_get { intent, stage, field: "phase" })
GATE_OUTCOME=$(haiku_stage_get { intent, stage, field: "gate_outcome" })
```

For each unit:

```
haiku_unit_list { intent, stage } → units with status, bolt, hat
```

### Step 3: Aggregate by Studio

For each studio, compute:

- **Intents completed**: count of intents with `status: completed`
- **Intents active**: count of intents with `status: active`
- **Stage durations**: for each stage type, median and max duration from completed stages
- **Bolt distribution**: for each stage type, median and max bolt count per unit
- **Busiest stage**: which stage takes the most time or bolts
- **Gate outcomes**: distribution of auto/ask/external/await per stage
- **Await patterns**: stages where `await` gates are common, and typical wait durations

### Step 4: Present

```markdown
## Capacity Report

### Software Studio
**Completed:** 8 intents | **Active:** 3 intents

| Stage | Median Duration | Max Duration | Median Bolts/Unit | Typical Gate |
|-------|----------------|--------------|-------------------|--------------|
| inception | 1 session | 2 sessions | 1 | auto |
| design | 1 session | 3 sessions | 1 | ask |
| product | 2 sessions | 4 sessions | 1 | external |
| development | 3 sessions | 8 sessions | 3 | ask |
| operations | 1 session | 2 sessions | 1 | auto |
| security | 2 sessions | 5 sessions | 2 | external |

**Patterns:**
- Development is the bottleneck — highest bolt counts and longest duration
- Inception is consistently fast — good decomposition
- 2 of 3 active intents are in development stage

### Sales Studio
**Completed:** 12 intents | **Active:** 6 intents

| Stage | Median Duration | Typical Gate |
|-------|----------------|--------------|
| research | fast (same session) | auto |
| qualification | fast (same session) | ask |
| proposal | 2 sessions + await | ask, await |
| negotiation | variable (await-dependent) | ask, await |
| close | 1 session | external |

**Patterns:**
- Proposal→negotiation has longest wait times (await gates)
- 3 of 6 active intents are in proposal-await
```

### Duration Calculation

Duration is computed from `started_at` / `completed_at` timestamps in frontmatter. Since H·AI·K·U doesn't track wall-clock session time (only artifact timestamps), durations represent elapsed calendar time, not active work time.

For a rough session count, check git log for the number of distinct commit sessions between stage start and end:

```bash
# Count distinct commit sessions (gap > 30min = new session)
git log --format="%aI" -- ".haiku/intents/{slug}/stages/{stage}/" | \
  sort | awk 'NR>1{split($0,a,"T");split(prev,b,"T"); if(a[1]!=b[1]) sessions++}{prev=$0}END{print sessions+1}'
```

## Error Handling

| Scenario | Behavior |
|---|---|
| No completed intents | "No completed intents found. Complete an intent to see capacity data." |
| No timestamps in frontmatter | Skip that intent — older intents without timestamps can't contribute |
| Studio argument not found | "Studio '{name}' not found. Available: {list}" |
