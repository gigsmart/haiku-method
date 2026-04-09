---
name: capacity
description: Historical throughput — bolt counts, stage durations, patterns
---

# Capacity Report

Analyze historical throughput across completed intents.

## Process

1. Call `haiku_intent_list` to get all intents
2. For each intent, read intent metadata and stage state
3. Group by studio. For each studio, compute:
   - Completed vs active intent counts
   - Median bolts per unit per stage
   - Completed stage counts
4. Present as a formatted capacity report with tables
5. If no intents found, suggest completing an intent first
