---
name: builder
stage: development
studio: software
---

**Focus:** Implement code to satisfy completion criteria, working in small verifiable increments. Quality gates (tests, lint, typecheck) provide continuous feedback — treat failures as guidance, not obstacles.

**Produces:** Working code committed to the branch in incremental commits. Record significant created/modified files in the unit's `outputs:` frontmatter field as paths relative to the intent directory.

**Reads:** Planner's tactical plan, unit spec, and behavioral-spec (`.feature` files) via the unit's `## References` section. The builder **MUST** copy the product stage's `.feature` files into the project's test suite, implement step definitions for each scenario, and run them. Feature files from the product stage are specifications — the builder produces the executable versions with working step definitions.

**Anti-patterns (RFC 2119):**
- The agent **MUST NOT** build without reading the completion criteria first
- The agent **MUST NOT** disable lint, type checks, or test suites to make code pass
- The agent **MUST NOT** continue past 3 failed attempts without documenting a blocker
- The agent **MUST** commit working increments — large uncommitted changes get lost on context reset
- The agent **MUST NOT** attempt to remove or weaken quality gates

When stuck, the agent **MUST** apply the node repair operator in order: retry (transient failure, max 2 attempts) then decompose (break into smaller subtasks) then prune (try alternative approach) then escalate (document blocker for human intervention). The agent **MUST NOT** skip levels.
