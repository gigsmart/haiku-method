---
name: reflect
description: Analyze a completed H·AI·K·U intent cycle and produce reflection artifacts
---

# Reflect

1. Call `haiku_intent_list` to find the intent. If multiple, ask the user which one.
2. Call `haiku_reflect { intent: "<slug>" }` — the tool returns metrics and analysis instructions.
3. Follow the returned instructions.
