---
description: (Internal) Autonomous domain discovery and technical exploration for AI-DLC elaboration
context: fork
agent: general-purpose
user-invocable: false
allowed-tools:
  - Read
  - Write
  - Glob
  - Grep
  - Bash
  - Agent
  - WebSearch
  - WebFetch
  - ToolSearch
  - ListMcpResourcesTool
  - ReadMcpResourceTool
  # MCP read-only tool patterns
  - "mcp__*__read*"
  - "mcp__*__get*"
  - "mcp__*__list*"
  - "mcp__*__search*"
  - "mcp__*__query*"
  - "mcp__*__ask*"
  - "mcp__*__resolve*"
  - "mcp__*__fetch*"
  - "mcp__*__lookup*"
  - "mcp__*__analyze*"
  - "mcp__*__describe*"
  - "mcp__*__explain*"
  - "mcp__*__memory"
---

# Elaborate: Domain Discovery

Autonomous domain discovery and technical exploration for AI-DLC elaboration. This skill runs as a forked subagent — it reads a brief file from disk, performs deep exploration, and writes results to disk.

**You have NO access to `AskUserQuestion`.** All work is fully autonomous. Persist findings to disk — the main elaboration skill will present results to the user.

---

## Step 1: Read Brief

Read the brief file passed as the first argument. The brief is at the path provided (e.g., `.ai-dlc/{intent-slug}/.briefs/elaborate-discover.md`).

Parse YAML frontmatter for structured inputs:

```yaml
intent_slug: my-feature
worktree_path: /path/to/.ai-dlc/worktrees/my-feature
project_maturity: established  # greenfield | early | established
provider_config:
  design:
    type: figma
  spec:
    type: notion
  ticketing:
    type: jira
  comms:
    type: slack
```

The markdown body contains:
- Intent description (what the user wants to build)
- Clarification answers (Q&A from requirements gathering)
- Discovery file path (path to the initialized `discovery.md`)

**Change directory to the worktree** before any file operations:

```bash
cd "{worktree_path}"
```

---

## Step 2: Domain Discovery & Technical Exploration

**This phase is mandatory.** Deeply understand the technical landscape. Shallow understanding here causes builders to build the wrong thing.

### Greenfield Adaptation

Gate exploration based on `project_maturity` from the brief:

- **Greenfield** (`greenfield`):
  - **Skip** items 2 (Existing Codebases) and 5 (Existing Implementations) — there is no codebase to explore. Do NOT spawn Explore subagents for codebase research.
  - **Keep** items 1 (APIs/Schemas), 3 (Data Sources), 4 (Domain Model — from user input + external research), 6 (External Docs/Libraries), 7 (Providers).
  - Focus domain discovery on external research, API introspection, and user input rather than codebase analysis.
- **Early** (`early`):
  - Use `Glob` and `Read` directly instead of Explore subagents — the codebase is small enough to read directly without subagent overhead.
  - All items apply, but codebase exploration should be lightweight.
- **Established** (`established`):
  - Full exploration as described below. Use Explore subagents for deep codebase research.

### What to Explore

Based on the intent description and clarification answers in the brief, identify every relevant technical surface and explore it thoroughly. Use ALL available research tools — codebase exploration, API introspection, web searches, and documentation fetching:

1. **APIs and Schemas**: If the intent involves an API, query it. Run introspection queries. Read the actual schema. Map every type, field, query, mutation, and subscription. Don't guess what data is available — verify it.

2. **Existing Codebases** *(skip for greenfield)*: If the intent builds on or integrates with existing code, explore it via Explore subagents (or `Glob`/`Read` for early-maturity projects). Have them find relevant files, read source code, and report back on existing patterns, conventions, and architecture.

3. **Data Sources**: If the intent involves data, understand where it lives. Query for real sample data. Understand what fields are populated, what's empty, what's missing. Identify gaps between what's available and what's needed.

4. **Domain Model**: From your exploration, build a domain model — the key entities, their relationships, and their lifecycle. This is not a database schema; it's a conceptual map of the problem space.

5. **Existing Implementations** *(skip for greenfield)*: If there are related features, similar tools, or reference implementations, read them. Understand what already exists so you don't build duplicates or miss integration points.

6. **External Documentation and Libraries**: Use `WebSearch` and `WebFetch` to research relevant libraries, frameworks, APIs, standards, or prior art. If the intent involves a third-party system, find its documentation and understand its capabilities. If the intent involves a design pattern or technique, research best practices and common pitfalls.

7. **Configured Providers**: If providers are configured in `provider_config`:
   - **Spec providers** (Notion, Confluence, Google Docs): Search for requirements docs, PRDs, or technical specs related to the intent
   - **Ticketing providers** (Jira, Linear): Search for existing tickets, epics, or stories that relate to or duplicate this work
   - **Design providers** (Figma, Sketch, Adobe XD): Delegate to design analysis subagents (see item 4 in "How to Explore" below) to avoid flooding your context with design data. **Important:** Designers often annotate mockups with callouts, arrows, measurement labels, sticky notes, and descriptive text that convey UX behavior or implementation details. These annotations are **guidance, not part of the design itself** — extract the guidance (interaction notes, spacing rules, state descriptions, edge cases) and incorporate it into findings, but do not treat annotation visuals as UI elements to build.
   - **Comms providers** (Slack, Teams): Search for relevant discussions or decisions in channels
   Use `ToolSearch` to discover available MCP tools matching provider types, then use read-only MCP tools for research.

### How to Explore

Use every research tool available. Spawn multiple explorations in parallel for independent concerns:

1. **Subagents for deep codebase/API exploration** *(established projects only)*: Use `Agent` with `subagent_type: "Explore"` for multi-step research that requires reading many files, querying APIs, and synthesizing findings. **If greenfield: do NOT spawn Explore subagents for codebase research — there is no codebase to explore.** If early: use `Glob`/`Read` directly instead of Explore subagents.

```
Agent({
  description: "Explore {specific system}",
  subagent_type: "Explore",
  prompt: "I need to deeply understand {system}. Read source code, query APIs, map the data model. Report back with: every entity and its fields, every query/endpoint available, sample data showing what's actually populated, and any gaps or limitations discovered."
})
```

2. **MCP tools for domain knowledge**: Use `ToolSearch` to discover available MCP tools, then use read-only MCP tools for domain research. Examples:
   - Repository documentation (DeepWiki): `mcp__*__read_wiki*`, `mcp__*__ask_question`
   - Library docs (Context7): `mcp__*__resolve*`, `mcp__*__query*`
   - Project memory (han): `mcp__*__memory`
   - Any other MCP servers available in the environment
   - Provider MCP tools: If providers are configured, use their MCP tools for research (e.g., `mcp__*jira*__search*` for Jira tickets, `mcp__*notion*__search*` for Notion pages)

3. **Web research for external context**: Use `WebSearch` for library docs, design patterns, API references, prior art. Use `WebFetch` to read specific documentation pages.

4. **Design analysis subagents**: If a design provider is configured (`provider_config.design.type` is set), spawn a `general-purpose` subagent (NOT `Explore` — it needs MCP tool access via `ToolSearch`) for each design file:

```
Agent({
  description: "Analyze design: {file name}",
  subagent_type: "general-purpose",
  prompt: "Analyze a design file for AI-DLC elaboration.

    ## Instructions
    1. Use ToolSearch to discover design MCP tools (e.g., 'figma', 'sketch', 'design')
    2. Use discovered tools to fetch design metadata, screenshots, and component trees
    3. Extract and return ONLY a structured summary:
       - Component hierarchy (parent/child tree of design elements)
       - Design tokens: colors (hex values), spacing values, typography (font families, sizes, weights)
       - Interactions and states (hover, active, disabled, error states)
       - Annotations and designer notes (text callouts, sticky notes, measurement labels)

    ## CRITICAL
    - Return structured text ONLY — no raw screenshots or binary data in your response
    - Focus on information builders need to implement the design accurately
    - Note any ambiguities or missing states that builders should ask about

    ## Design File
    {design file URL or identifier}"
})
```

Spawn one subagent per design file, in parallel with codebase Explore agents. When results return:
- Append to `discovery.md` under `## Design Analysis: {file name}`
- If no design MCP tools are discoverable, the subagent reports unavailability — log a warning and continue without design analysis

5. **UI Mockups**: If the intent involves user-facing interfaces (frontend, CLI, TUI, etc.), generate mockups for every distinct screen or view. This step is **mandatory** for any intent with a UI component:

   - **Designs exist** (item 4 returned design analysis): Translate the design analysis into mockups that demonstrate understanding of the designs. This is *verification*.
   - **No designs exist**: Generate mockups as *pre-build visual design*. This is where layout, information hierarchy, and interaction flow get decided.

   Discovery mockups are always ASCII — they exist to facilitate discussion, not to serve as spec artifacts. Unit wireframes (Phase 6.25) handle the structured HTML spec.

   #### ASCII Wireframe Rules

   **Alignment is critical.** Misaligned ASCII wireframes are unreadable and useless for discussion. Follow these rules strictly:

   1. **Use monospace box-drawing characters** — `┌ ┐ └ ┘ │ ─ ├ ┤ ┬ ┴ ┼` for all borders. Never use `+`, `-`, `|` for box edges.
   2. **Fixed-width columns** — decide column widths first, then fill content. Every row in a section must have the same total width.
   3. **Pad content inside boxes** — always one space of padding: `│ Label │` not `│Label│`.
   4. **Verify vertical alignment** — every `│` in a column must sit in the same character position across all rows. Count characters if needed.
   5. **Keep it readable** — target 80-120 character width for most views, up to 160 for complex multi-column layouts. Prefer multiple focused mockups over one that's too dense.
   6. **Label everything** — every box, region, and element gets a text label. Unlabeled boxes are ambiguous.
   7. **Use consistent indentation** — nested elements indent by exactly 2 spaces.

   Example of correct alignment:
   ```
   ┌─────────────────────────────────────────────┐
   │ Header                                      │
   ├──────────────────────┬──────────────────────┤
   │ Sidebar              │ Main Content         │
   │                      │                      │
   │  [Nav Item 1]        │  Page Title          │
   │  [Nav Item 2]        │  ───────────         │
   │  [Nav Item 3]        │  Content area...     │
   │                      │                      │
   ├──────────────────────┴──────────────────────┤
   │ Footer                                      │
   └─────────────────────────────────────────────┘
   ```

   #### Per-View Mockup Process

   For each distinct screen or view identified in the domain model:
   - Create a mockup showing layout structure, key UI elements, and data placement
   - Annotate with interaction notes (what happens on click, hover, submit, error states)
   - Show which domain entities map to which UI regions
   - If working from designs: note where your interpretation might diverge from the source
   - **After drawing each mockup, visually verify that all vertical lines align before writing to disk**

   Append each mockup to `discovery.md`:
   ```
   ## UI Mockup: {View Name}

   **Source:** {design provider analysis | collaborative}

   ### Layout
   ```
   {ASCII mockup}
   ```

   ### Interactions
   - {element}: {behavior on click/hover/submit}
   - {element}: {error states, loading states}

   ### Data Mapping
   - {UI region} ← {domain entity}.{field}
   ```

   **Skip mockups only if:** the intent has no user-facing interface (pure backend, API, data pipeline, infrastructure, etc.).

**Spawn multiple research paths in parallel.** Don't serialize explorations that are independent — launch all of them at once and synthesize when results return.

If a VCS MCP is available (e.g., GitHub MCP), use it for code browsing alongside or instead of local file tools.

### Persist Findings to Discovery Log

After each significant finding (API schema mapped, codebase pattern identified, design analyzed, external research completed), **append a section to `discovery.md`**. This offloads detailed findings from context to disk, keeping your context window lean while preserving full details for builders.

**Use standardized section headers** so builders can quickly scan the file:
- `## API Schema: {name}` — For API introspection results (types, fields, queries, mutations)
- `## Codebase Pattern: {area}` — For architecture patterns discovered in existing code
- `## Design Analysis: {file}` — For design file findings (components, tokens, interactions)
- `## External Research: {topic}` — For web research, library docs, prior art
- `## Data Source: {name}` — For data source exploration (what's available, what's missing)
- `## Provider Context: {type}` — For ticketing, spec, or comms provider findings
- `## UI Mockup: {view}` — ASCII mockups of user-facing views with interaction notes and data mapping
- `## Architecture Decision: {topic}` — For greenfield/early projects: key architecture choices (frameworks, patterns, structure)
- `## Technology Choice: {name}` — For greenfield/early projects: technology selection rationale
- `## Reference Implementation: {name}` — For greenfield/early projects: external reference implementations or prior art informing the design

**After appending to discovery.md, keep only a brief summary in your context** — the full details are safely on disk and will be available to builders. This is the key benefit: your context stays lean for continued exploration while nothing is lost.

**CRITICAL**: Do not summarize or skip exploration. The exploration results directly determine whether the spec is accurate. If you explore a GraphQL API, report every type. If you read source code, report the actual architecture, not your guess about it.

---

## Step 3: Build Domain Model

After all exploration is complete, synthesize your findings into a comprehensive domain model. This is the foundation that all units will build on.

Structure the domain model as:

### Entities
- **{Entity1}**: {description} — Fields: {field1}, {field2}, ...
- **{Entity2}**: {description} — Fields: ...

### Relationships
- {Entity1} has many {Entity2}
- {Entity2} belongs to {Entity3}

### Data Sources
- **{Source1}** ({type: GraphQL API / REST API / filesystem / etc.}):
  - Available: {what data can be queried}
  - Missing: {what data is NOT available from this source}
  - Real sample: {abbreviated real data showing what's populated}

### Data Gaps
- {description of any gap between what's needed and what's available}
- {proposed solution for each gap}

---

## Step 4: Write Results

Write the results file to `.ai-dlc/{intent-slug}/.briefs/elaborate-discover-results.md`:

```markdown
---
status: success
error_message: ""
---

# Discovery Results

## Domain Model Summary

### Entities
- **{Entity1}**: {description} — Fields: {field1}, {field2}, ...
- **{Entity2}**: {description} — Fields: ...

### Relationships
- {Entity1} has many {Entity2}
- {Entity2} belongs to {Entity3}

### Data Sources
- **{Source1}** ({type}):
  - Available: {what data can be queried}
  - Missing: {what data is NOT available}
  - Real sample: {abbreviated real data}

### Data Gaps
- {description of gap and proposed solution}

## Key Findings

- {Important finding 1}
- {Important finding 2}

## Open Questions

- {Question needing user validation 1}
- {Question needing user validation 2}

## Mockups Generated

- {path to mockup 1} — {description}
- {path to mockup 2} — {description}
```

---

## Error Handling

If any critical error occurs during exploration (e.g., worktree path doesn't exist, discovery.md not found):

1. Write the results file with `status: error` and `error_message` describing what went wrong
2. Include any partial findings that were gathered before the error
3. Exit — the main elaborate skill will read the error status and handle it
