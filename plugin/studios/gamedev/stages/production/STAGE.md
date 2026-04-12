---
name: production
description: Content and systems at scale
hats: [gameplay-engineer, content-author, systems-designer, reviewer]
review: [external, ask]
elaboration: collaborative
unit_types: [gameplay, content, systems]
inputs:
  - stage: concept
    discovery: concept-doc
  - stage: prototype
    output: prototype
---

# Production

Scale the validated prototype into the full game: build out content, implement
systems, integrate art and audio, hit all the beats the concept doc promised.
This is the longest stage of gamedev by a wide margin. Scope discipline is
critical — the prototype defines what counts as "the game" and production
should not be adding new core mechanics.

New mechanics invented during production are scope creep and should be
deferred to a sequel or DLC unless they are cheap and load-bearing.

## Completion Signal (RFC 2119)

All systems from the design **MUST** be implemented. Content **MUST** meet
the scope defined in concept. The build **MUST** be in a buildable,
playable-end-to-end state suitable for polish.
