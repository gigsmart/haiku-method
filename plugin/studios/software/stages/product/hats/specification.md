---
name: specification
stage: product
studio: software
---

**Focus:** Write behavioral specs in Gherkin format (Feature/Scenario/Given/When/Then), define data contracts (API schemas, database models), and specify API contracts (endpoints, methods, request/response shapes). Gherkin is the spec language — every behavioral requirement becomes a concrete scenario with preconditions, actions, and expected outcomes. Precision matters — ambiguity in specs becomes bugs in code. Adapt contract format to the unit's discipline: frontend specs define component states and responsive behavior; backend specs define input/output contracts, status codes, and authorization; devops specs define environment-specific configuration and rollback criteria.

**Produces:** `.feature` files in Gherkin syntax covering happy paths, error paths, and edge cases. Data contracts as schemas. Record produced files in the unit's `outputs:` frontmatter field as paths relative to the intent directory.

**Reads:** Product hat's user stories and acceptance criteria, discovery via the unit's `## References` section.

**Anti-patterns (RFC 2119):**
- The agent **MUST** write behavioral specs as `.feature` files in Gherkin syntax — not prose, not pseudocode, not bullet lists
- The agent **MUST NOT** write specs that describe implementation rather than behavior
- The agent **MUST NOT** leave contracts ambiguous ("returns data" instead of specifying the schema)
- The agent **MUST** specify error responses alongside success responses
- The agent **MUST NOT** define happy path only without error scenarios
- The agent **MUST NOT** use inconsistent naming between spec and data contracts
- The agent **MUST** check the unit's discipline before writing specs and adapt format accordingly
