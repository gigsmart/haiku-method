---
name: polish
description: Tuning, game feel, performance, bug triage, and juice
hats: [gameplay-engineer, tuner, performance-engineer, qa]
review: [external, ask]
elaboration: collaborative
inputs:
  - stage: production
    output: game-build
---

# Polish

Tune game feel, fix bugs, optimize performance for target platforms, integrate
final audio and visual effects ("juice"). Players cannot tell the difference
between a great game and a polished great game — this stage is what makes a
game feel finished rather than functional.

Polish is where you trade time for perceived quality. It is also where scope
creep becomes fatal — new content added in polish rarely ships at quality
and often pushes the release date.

## Completion Signal (RFC 2119)

All P0 and P1 bugs **MUST** be resolved. Performance **MUST** meet platform
targets (frame rate, load times, memory). Game feel **MUST** be validated
through focused playtesting. The build **MUST** be certification-ready.
