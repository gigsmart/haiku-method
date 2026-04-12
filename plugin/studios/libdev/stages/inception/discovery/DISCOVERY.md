---
name: discovery
location: .haiku/intents/{intent-slug}/knowledge/DISCOVERY.md
scope: intent
format: text
required: true
---

# Discovery

Comprehensive understanding of the problem this library solves, who consumes it, and the ecosystem context. This is the foundation for all downstream libdev stages.

## Content Guide

### Problem & Consumers
- **Problem statement** — what consumers cannot do today without this library, framed in consumer terms
- **Target consumers** — who integrates this library, at what technical level, in what context (backend service, CLI, SDK, etc.)
- **Adoption path** — how a new consumer discovers, evaluates, installs, and first uses the library

### Ecosystem Landscape
- **Existing libraries** — specific named competitors with a brief description of their approach
- **What works in existing libraries** — patterns worth adopting
- **Gaps in existing libraries** — where competitors fall short that this library addresses

### Scope
- **Goals** — what this library explicitly does
- **Non-goals** — what this library explicitly will NOT do, to prevent scope creep
- **Out of scope for v1** — things deferred to later versions

### Non-functional Requirements
- **Language/runtime** — target language, minimum version, supported platforms
- **Dependencies** — what dependencies are acceptable, which to avoid (heavy, abandoned, incompatible licenses)
- **Performance expectations** — if relevant, order-of-magnitude targets
- **Documentation expectations** — how consumers will learn the library

## Quality Signals

- A consumer unfamiliar with the intent can understand why this library should exist and who it's for
- Competitor libraries are named with links, not described abstractly
- Non-goals are explicit and specific
- Target consumers are concrete (e.g., "Node.js backend devs building REST APIs") not generic ("developers")
