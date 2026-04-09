---
name: reflect
description: Analyze a completed H·AI·K·U intent cycle and produce reflection artifacts
---

# Reflect on Intent

Analyze a completed intent cycle and produce structured reflection artifacts.

## Process

1. **Find the intent** — Call `haiku_intent_list` to find intents. If multiple, ask the user which one to reflect on.

2. **Gather metrics** — Call `haiku_intent_get` and `haiku_unit_list` for each stage to collect:
   - Per-stage status, phase, start/completion times
   - Unit completion counts and bolt counts per unit
   - Overall intent metadata (studio, mode, status)

3. **Analyze patterns:**
   - **Execution patterns** — Which units went smoothly? Which required retries (high bolt counts)?
   - **Criteria satisfaction** — How well were success criteria met?
   - **Process observations** — What approaches worked? What was painful?
   - **Blocker analysis** — Were blockers systemic or one-off?

4. **Write artifacts:**
   - `.haiku/intents/<slug>/reflection.md` — Full reflection
   - `.haiku/intents/<slug>/settings-recommendations.md` — Concrete settings changes

5. **Present findings** to user for validation. Then offer next steps:
   - **Apply Settings** — auto-apply recommendations
   - **Iterate** — create a new version with learnings pre-loaded
   - **Close** — capture learnings to .claude/memory/ and archive intent
