---
title: "Behavioral Specification — MCP Prompts System"
unit: unit-01-behavioral-spec
stage: product
---

# Behavioral Specification

Given/When/Then scenarios for the MCP prompts system. Each scenario is precise enough to derive a test case.

---

## 1. Prompt Discovery (`prompts/list`)

### 1.1 Happy Path: Returns All Registered Prompts

```
Given the MCP server is running with all prompt handlers registered
When  the client sends a prompts/list request
Then  the response contains exactly 21 prompt definitions
  And each prompt has: name (string, "haiku:{id}" format), title (string), description (string)
  And each prompt has an arguments array (may be empty)
  And each argument entry has: name (string), description (string), required (boolean)
  And prompts are ordered: core workflow first (new, run, refine, review, reflect),
      then supporting (autopilot, composite, setup, migrate, scaffold, operate, triggers, dashboard, backlog),
      then complex/niche (adopt, quick, seed, ideate, pressure-testing, capacity, release-notes)
```

### 1.2 Edge: Prompt Metadata Completeness

```
Given the server is running
When  the client sends a prompts/list request
Then  every prompt's name matches the pattern /^haiku:[a-z][a-z0-9-]*$/
  And every prompt's description is non-empty and under 120 characters
  And every prompt's title is non-empty and under 40 characters
```

### 1.3 Edge: Empty Registry (defensive)

```
Given the server starts but no prompt handlers are registered (hypothetical misconfiguration)
When  the client sends a prompts/list request
Then  the response contains an empty prompts array: { prompts: [] }
  And no error is thrown
```

---

## 2. Prompt Invocation (`prompts/get`)

### 2.1 Happy Path: Valid Name + Required Arguments

```
Given the server is running with haiku:run registered
  And an active intent "my-feature" exists in .haiku/intents/
When  the client sends prompts/get { name: "haiku:run", arguments: { intent: "my-feature" } }
Then  the response is a GetPromptResult with a messages array
  And messages has exactly 3 entries
  And messages[0] has role "user" with text content (state context)
  And messages[1] has role "assistant" with text content (acknowledgment, 1-2 sentences)
  And messages[2] has role "user" with text content (actionable instructions)
  And all content items have type "text"
```

### 2.2 Happy Path: Optional Arguments Omitted

```
Given the server is running with haiku:run registered
  And exactly one active intent exists in .haiku/intents/
When  the client sends prompts/get { name: "haiku:run", arguments: {} }
Then  the handler resolves the single active intent automatically
  And returns a valid GetPromptResult with 3 messages
  And the messages reference the auto-resolved intent slug
```

### 2.3 Happy Path: State-Reading Prompt Returns Single Message

```
Given the server is running with haiku:dashboard registered
When  the client sends prompts/get { name: "haiku:dashboard", arguments: {} }
Then  the response is a GetPromptResult
  And messages has 1 entry with role "user"
  And the content includes formatted intent status data
```

### 2.4 Error: Unknown Prompt Name

```
Given the server is running
When  the client sends prompts/get { name: "haiku:nonexistent", arguments: {} }
Then  the server throws McpError with code -32602 (InvalidParams)
  And the error message is "Unknown prompt: haiku:nonexistent"
```

### 2.5 Error: Missing Required Argument

```
Given the server is running with haiku:quick registered
  And haiku:quick has argument "description" marked as required
When  the client sends prompts/get { name: "haiku:quick", arguments: {} }
Then  the server throws McpError with code -32602 (InvalidParams)
  And the error message is "Missing required argument: description for prompt haiku:quick"
```

### 2.6 Error: Invalid Argument Value

```
Given the server is running with haiku:scaffold registered
  And haiku:scaffold has argument "type" with expected values (studio, stage, hat, provider)
When  the client sends prompts/get { name: "haiku:scaffold", arguments: { type: "banana" } }
Then  the server throws McpError with code -32602 (InvalidParams)
  And the error message is "Invalid value for type: banana. Expected: studio, stage, hat, provider"
```

### 2.7 Application Error: No Active Intent (no slug provided)

```
Given the server is running
  And no intents exist in .haiku/intents/
  And no intent argument is provided
When  the client sends prompts/get { name: "haiku:run", arguments: {} }
Then  the handler returns a GetPromptResult (NOT McpError)
  And messages has 1 entry with role "user"
  And the message text is "No active intent found. Create one with /haiku:new"
```

Note: This is an application-level error (returned as a prompt message) because the
user did not provide an explicit slug -- the system cannot resolve one. Contrast with
2.8 where the user explicitly provides a non-existent slug (parameter validation error).

### 2.8 Error: Intent Not Found

```
Given the server is running
  And .haiku/intents/ exists but does not contain "nonexistent-slug"
When  the client sends prompts/get { name: "haiku:run", arguments: { intent: "nonexistent-slug" } }
Then  the server throws McpError with code -32602 (InvalidParams)
  And the error message is "Intent not found: nonexistent-slug"
```

---

## 3. Argument Completion (`completion/complete`)

### 3.1 Happy Path: Intent Slug Completion with Partial Value

```
Given .haiku/intents/ contains: "skills-to-mcp-prompts", "skip-ci-setup", "add-auth"
When  the client sends completion/complete {
        ref: { type: "ref/prompt", name: "haiku:run" },
        argument: { name: "intent", value: "ski" }
      }
Then  the response contains completion.values = ["skills-to-mcp-prompts", "skip-ci-setup"]
  And completion.total = 2
  And completion.hasMore = false
```

### 3.2 Context-Aware: Stage Completion Filtered by Intent's Studio

```
Given intent "my-feature" uses studio "software"
  And studio "software" has stages: ["inception", "design", "product", "construction", "delivery"]
  And studio "content" has stages: ["draft", "review", "publish"]
When  the client sends completion/complete {
        ref: { type: "ref/prompt", name: "haiku:refine" },
        argument: { name: "stage", value: "" },
        context: { arguments: { intent: "my-feature" } }
      }
Then  the response contains completion.values = ["inception", "design", "product", "construction", "delivery"]
  And "draft", "review", "publish" are NOT in the values
```

### 3.3 Edge: Empty Value Returns All Candidates

```
Given .haiku/intents/ contains: "skills-to-mcp-prompts", "add-auth", "fix-bug"
When  the client sends completion/complete {
        ref: { type: "ref/prompt", name: "haiku:run" },
        argument: { name: "intent", value: "" }
      }
Then  the response contains all 3 intent slugs in completion.values
  And results are sorted by recency (most recently modified first)
```

### 3.4 Edge: No Matches Returns Empty Array

```
Given .haiku/intents/ contains: "skills-to-mcp-prompts", "add-auth"
When  the client sends completion/complete {
        ref: { type: "ref/prompt", name: "haiku:run" },
        argument: { name: "intent", value: "zzz" }
      }
Then  the response contains completion.values = []
  And completion.total = 0
```

### 3.5 Edge: Max 100 Results Enforced

```
Given .haiku/intents/ contains 150 intent directories
When  the client sends completion/complete {
        ref: { type: "ref/prompt", name: "haiku:run" },
        argument: { name: "intent", value: "" }
      }
Then  completion.values has at most 100 entries
  And completion.total = 150
  And completion.hasMore = true
```

### 3.6 Non-Prompt Reference Returns Empty

```
When  the client sends completion/complete {
        ref: { type: "ref/resource", uri: "file:///something" },
        argument: { name: "path", value: "foo" }
      }
Then  the response contains completion.values = []
```

### 3.7 Unknown Prompt in Reference Returns Empty

```
When  the client sends completion/complete {
        ref: { type: "ref/prompt", name: "haiku:nonexistent" },
        argument: { name: "intent", value: "" }
      }
Then  the response contains completion.values = []
  And no error is thrown (graceful degradation)
```

### 3.8 Argument Without Completer Returns Empty

```
Given haiku:new has argument "description" with no completer (free text)
When  the client sends completion/complete {
        ref: { type: "ref/prompt", name: "haiku:new" },
        argument: { name: "description", value: "some text" }
      }
Then  the response contains completion.values = []
```

### 3.9 Context-Aware Without Context Falls Back Gracefully

```
Given studio "software" has stages: ["inception", "design", "product", "construction", "delivery"]
  And studio "content" has stages: ["draft", "review", "publish"]
When  the client sends completion/complete {
        ref: { type: "ref/prompt", name: "haiku:refine" },
        argument: { name: "stage", value: "d" }
      }
  And no context.arguments is provided
Then  the response contains all stages matching "d" across all studios
  And completion.values includes "design", "draft", "delivery"
```

### 3.10 Case-Insensitive Matching

```
Given .haiku/intents/ contains: "Add-Auth-Module"
When  the client sends completion/complete {
        ref: { type: "ref/prompt", name: "haiku:run" },
        argument: { name: "intent", value: "add" }
      }
Then  completion.values includes "Add-Auth-Module"
```

### 3.11 Matching Order: Prefix First, Then Substring

```
Given .haiku/intents/ contains: "design-system", "redesign-tokens", "design-review"
When  the client sends completion/complete {
        ref: { type: "ref/prompt", name: "haiku:run" },
        argument: { name: "intent", value: "design" }
      }
Then  completion.values starts with prefix matches: "design-system", "design-review"
  And substring-only match "redesign-tokens" appears after all prefix matches
  And within each group (prefix, substring), results are sorted by recency
```

---

## 4. Core Prompt Behaviors

### 4.1 `haiku:run` — Orchestrator Integration

```
Given intent "my-feature" is active at stage "construction" with phase "execute"
When  prompts/get is called for haiku:run with intent "my-feature"
Then  the handler calls the orchestrator's runNext() internally
  And the orchestrator returns an action (e.g., "start_unit", "continue_unit", "review", "gate_ask")
  And the handler constructs messages specific to that action type
  And messages[2] includes: hat definition content, unit completion criteria, available MCP tools
```

### 4.2 `haiku:run` — `gate_ask` Opens Visual Review Before Returning

```
Given intent "my-feature" is at a stage gate with review type "ask"
  And the orchestrator returns action "gate_ask"
When  prompts/get is called for haiku:run with intent "my-feature"
Then  the handler calls open_review (HTTP server) BEFORE constructing messages
  And open_review creates a session and returns a review URL
  And messages[2] instructs the agent: "A review is open at {url}. Wait for the user's decision."
  And messages[2] includes: if approved call haiku_gate_approve then haiku_run_next,
      if changes_requested analyze annotations and route to refine
```

### 4.3 `haiku:run` — `gate_ask` Fallback When Visual Review Fails

```
Given the orchestrator returns action "gate_ask"
  And the HTTP server fails to start (port conflict, etc.)
When  prompts/get is called for haiku:run
Then  the handler falls back to a text-only gate prompt
  And messages[2] instructs the agent to present a stage summary in text
  And messages[2] instructs the agent to ask the user for approval via ask_user_visual_question
```

### 4.4 `haiku:run` — `decompose` with Collaborative Elaboration Mode

```
Given intent "my-feature" is at stage "design" with elaboration mode "collaborative"
  And the orchestrator returns action "decompose"
When  prompts/get is called for haiku:run
Then  messages[2] includes the STAGE.md content, discovery definitions, and upstream outputs
  And messages[2] includes multi-turn conversation rules:
      "MUST engage user iteratively", "MUST use ask_user_visual_question for rich content",
      "MUST present final plan via open_review"
  And messages[2] includes interaction patterns and tool usage mandates
```

### 4.5 `haiku:run` — `decompose` with Autonomous Elaboration Mode

```
Given intent "my-feature" is at stage "construction" with elaboration mode "autonomous"
  And the orchestrator returns action "decompose"
When  prompts/get is called for haiku:run
Then  messages[2] includes the STAGE.md content, discovery definitions, and upstream outputs
  And messages[2] is concise (no multi-turn rules, no interaction patterns)
  And messages[2] states: "MAY drive elaboration independently",
      "SHOULD present final plan via open_review",
      "MAY skip iterative questions if upstream specs are clear"
```

### 4.6 `haiku:run` — `start_unit` / `continue_unit` Includes Hat Definition

```
Given the orchestrator returns action "start_unit" for unit "unit-01-api" with hat "engineer"
  And stage "construction" has hat file stages/construction/hats/engineer.md
When  prompts/get is called for haiku:run
Then  messages[2] includes the full text content of hats/engineer.md
  And messages[2] includes the unit's description and completion criteria
  And messages[2] includes resolved ref content (each path in unit's refs array, read and inlined)
  And messages[2] lists available MCP tools: haiku_unit_start, haiku_unit_advance_hat,
      haiku_unit_complete, haiku_unit_increment_bolt
```

### 4.7 `haiku:run` — `review` Action Loads Review Agents

```
Given the orchestrator returns action "review" for stage "construction"
  And stage "construction" has review-agents: correctness.md, security.md, performance.md
When  prompts/get is called for haiku:run
Then  messages[2] includes the full text of each review agent definition
  And messages[2] instructs: "Spawn one subagent per review agent"
  And messages[2] includes fix loop instructions: "Up to 3 cycles for HIGH findings"
  And messages[2] instructs: "After review, call haiku_stage_set phase=gate"
```

### 4.8 `haiku:run` — `start_units` (Parallel Execution)

```
Given the orchestrator returns action "start_units" with units ["unit-01-api", "unit-02-ui", "unit-03-tests"]
  And each unit has hat "engineer" with refs and completion criteria
When  prompts/get is called for haiku:run
Then  messages[2] lists all 3 units with their individual criteria, refs, and hat definitions
  And messages[2] instructs: "Spawn one Agent per unit with worktree isolation"
  And messages[2] includes a per-unit prompt template with unit-specific content inlined
  And messages[2] instructs: "Wait for all agents to complete, then call haiku_run_next"
```

### 4.9 `haiku:run` — `advance_stage` Transitions to Next Stage

```
Given the orchestrator returns action "advance_stage" with next_stage "delivery"
When  prompts/get is called for haiku:run
Then  messages[2] is minimal: confirms stage transition from current to next
  And messages[2] instructs: "Call haiku_run_next to begin the next stage"
```

### 4.10 `haiku:run` — `blocked` Action Reports Blocker

```
Given the orchestrator returns action "blocked" with unit "unit-02-ui" and reason "dependency failed"
When  prompts/get is called for haiku:run
Then  messages[2] includes the blocked unit name and the blocker reason
  And messages[2] instructs: "Resolve the blocker or use /haiku:refine to amend the unit"
```

### 4.11 `haiku:run` — `intent_complete` Action

```
Given the orchestrator returns action "intent_complete" for intent "my-feature"
When  prompts/get is called for haiku:run
Then  messages[2] includes a completion summary (studio, stages completed, total units, total bolts)
  And messages[2] instructs: "Run /haiku:reflect or /haiku:review as next steps"
```

### 4.12 `haiku:new` — Studio Detection and Elicitation

```
Given no project-level studio override exists in .haiku/settings.yml
  And studios "software" and "content" are available
  And the user provides description "Build a REST API for user management"
When  prompts/get is called for haiku:new with { description: "Build a REST API for user management" }
Then  the handler detects that "software" is the best-fit studio
  And the handler uses elicitation/create to ask the user to confirm the studio selection
      (form with studio candidates, descriptions, and a confirm/change option)
  And after elicitation resolves, messages[2] includes the confirmed studio name and its stages
  And messages[2] instructs the agent to write intent.md with frontmatter and create workspace dirs
```

### 4.13 `haiku:new` — Project-Level Studio Override Skips Elicitation

```
Given .haiku/settings.yml contains studio: "software"
When  prompts/get is called for haiku:new with { description: "Add caching layer" }
Then  the handler does NOT call elicitation for studio selection
  And messages[2] includes studio "software" and its stages directly
```

### 4.14 `haiku:new` — Active Intent Conflict Elicitation

```
Given an active intent "existing-feature" exists with status "in_progress"
When  prompts/get is called for haiku:new with { description: "New feature" }
Then  the handler uses elicitation/create to ask:
      "An active intent 'existing-feature' exists. Create new or resume existing?"
  And if user selects "create new", the handler proceeds with new intent creation
  And if user selects "resume existing", the handler returns messages that redirect to haiku:run
```

### 4.15 `haiku:new` — Template Mode Pre-fills Units

```
Given studio "software" has template "api-endpoint" in templates/api-endpoint.md
  And the template has parameters: endpoint_name (required), auth_type (optional, default: "bearer")
When  prompts/get is called for haiku:new with { description: "User API", template: "api-endpoint" }
Then  the handler reads the template file and identifies required parameters
  And if endpoint_name is not in arguments, the handler uses elicitation to gather it
  And after parameter resolution, messages[2] includes pre-filled unit definitions
  And messages[2] instructs: "Skip elaboration -- units are pre-defined from template"
```

### 4.16 `haiku:review` — Computes Git Diff and Loads Review Agents

```
Given intent "my-feature" has a worktree with changes against base branch "main"
  And the diff is 500 lines across 12 files
  And REVIEW.md exists at repo root
When  prompts/get is called for haiku:review with { intent: "my-feature" }
Then  the handler computes git diff (stat + full diff + file list) server-side
  And messages[2] includes the diff stats summary, full diff content, and changed file list
  And messages[2] includes REVIEW.md and CLAUDE.md content inlined
  And messages[2] includes review agent mandates (correctness, security, performance, architecture, test_quality)
  And messages[2] instructs: "Spawn agents in parallel, collect findings, fix HIGH findings (up to 3 cycles)"
```

### 4.17 `haiku:review` — Large Diff Truncation

```
Given the git diff exceeds a size threshold (e.g., >50,000 characters)
When  prompts/get is called for haiku:review
Then  messages[2] includes truncated diff with a note:
      "Diff truncated ({actual_size} chars). Read changed files individually for full content."
  And messages[2] includes the full file list so the agent knows which files to read
```

### 4.18 `haiku:refine` — Loads Upstream Stage Context

```
Given intent "my-feature" is at stage "construction"
  And stage "design" produced completed units with output artifacts
When  prompts/get is called for haiku:refine with { target: "stage:design" }
Then  messages[2] includes the target stage's STAGE.md definition
  And messages[2] includes existing stage outputs (completed unit content)
  And messages[2] instructs: "Create a new unit in the upstream stage, run its hat sequence, then return to construction"
```

### 4.19 `haiku:refine` — Target Selection via Elicitation

```
Given intent "my-feature" is at stage "construction" with 3 units
  And no target argument is provided
When  prompts/get is called for haiku:refine with {}
Then  the handler uses elicitation/create to ask what to refine:
      options include "Intent-level", "Specific unit" (lists units), "Upstream stage" (lists stages)
  And after the user selects, the handler constructs messages for that specific target
```

### 4.20 `haiku:reflect` — Gathers Metrics and Constructs Analysis Prompt

```
Given intent "my-feature" has status "completed"
  And the intent used studio "software" with stages: inception, design, product, construction, delivery
  And construction had 4 units with a total of 12 bolts
When  prompts/get is called for haiku:reflect with { intent: "my-feature" }
Then  the handler pre-computes execution metrics server-side:
      units completed, total bolts, studio used, blockers encountered
  And messages follows the 3-message pattern
  And messages[0] includes intent metadata (studio, mode, dates, status)
  And messages[2] includes per-stage summary (phase, unit counts, timestamps)
  And messages[2] includes per-unit summary (status, bolt count, hat progression)
  And messages[2] includes a structured reflection template with sections:
      execution patterns, criteria satisfaction, process observations, blocker analysis
  And messages[2] instructs: "Write reflection.md and settings-recommendations.md"
```

---

## 5. Side Effects

### 5.1 `open_review` Called for `gate_ask`

```
Given the orchestrator returns action "gate_ask" for intent "my-feature"
When  the haiku:run prompt handler processes this action
Then  open_review is invoked BEFORE the handler returns GetPromptResult
  And open_review receives: intent slug, stage name, summary content
  And open_review starts an HTTP session and returns a review URL
  And the returned messages reference the review URL for the agent to monitor
```

### 5.2 `open_review` NOT Called for Non-Gate Actions

```
Given the orchestrator returns action "start_unit" for intent "my-feature"
When  the haiku:run prompt handler processes this action
Then  open_review is NOT invoked
  And no HTTP session is created
```

### 5.3 Elicitation Called for Studio Selection in `haiku:new`

```
Given no project-level studio override
  And multiple studios are available
When  the haiku:new prompt handler processes the request
Then  elicitation/create is called with a form containing:
      - field: "studio" (type: select, options: studio names with descriptions)
  And the handler blocks until elicitation resolves
  And the resolved studio is used in the constructed messages
```

### 5.4 Elicitation NOT Called When Studio is Pre-Determined

```
Given .haiku/settings.yml has studio: "software"
When  the haiku:new prompt handler processes the request
Then  elicitation/create is NOT called
  And the handler uses "software" directly
```

### 5.5 Elicitation Fallback When Not Supported

```
Given the MCP client does not support elicitation
When  the haiku:new prompt handler attempts elicitation for studio selection
Then  the handler catches the capability error
  And falls back to including the studio selection question in the prompt messages
  And messages[2] instructs the agent to ask the user which studio to use
```

---

## 6. Error Boundary Scenarios

### 6.1 No `.haiku/` Directory

```
Given the current working directory has no .haiku/ ancestor
When  prompts/get is called for haiku:run with any arguments
Then  the handler returns a GetPromptResult (not an McpError)
  And messages contains 1 entry with role "user"
  And the message text is "No H-AI-K-U workspace found. Run /haiku:new to create one."
```

### 6.2 No Git Repository

```
Given the current directory is not inside a git repository
When  prompts/get is called for haiku:new
Then  the handler returns a GetPromptResult with 1 message
  And the message text is "Must be in a git repository."
```

### 6.3 Cowork Mode Blocked

```
Given the environment variable CLAUDE_CODE_IS_COWORK is set
When  prompts/get is called for haiku:run
Then  the handler returns a GetPromptResult with 1 message
  And the message text is "Cannot run in cowork mode."
```

### 6.4 Intent Already Completed

```
Given intent "old-feature" has status "completed"
When  prompts/get is called for haiku:run with { intent: "old-feature" }
Then  the handler returns a GetPromptResult with 1 message
  And the message text is "Intent is already completed."
```

### 6.5 No Changes to Review

```
Given intent "my-feature" has no diff against base branch
When  prompts/get is called for haiku:review with { intent: "my-feature" }
Then  the handler returns a GetPromptResult with 1 message
  And the message text is "No changes to review."
```

---

## 7. Message Structure Invariants

These hold for ALL action prompts (not state-reading prompts).

### 7.1 Three-Message Pattern

```
Given any action prompt (haiku:run, haiku:new, haiku:refine, haiku:review, haiku:reflect)
When  prompts/get returns successfully (no error boundary hit)
Then  messages.length = 3
  And messages[0].role = "user"
  And messages[1].role = "assistant"
  And messages[2].role = "user"
  And messages[0].content is type "text" (state context)
  And messages[1].content is type "text" (acknowledgment, under 200 characters)
  And messages[2].content is type "text" (full instructions)
```

### 7.2 State-Reading Single-Message Pattern

```
Given any state-reading prompt (haiku:dashboard, haiku:capacity, haiku:release-notes)
When  prompts/get returns successfully
Then  messages.length = 1
  And messages[0].role = "user"
  And messages[0].content is type "text"
```

### 7.3 Error Boundary Single-Message Pattern

```
Given any prompt where an error boundary condition is met (no workspace, no git, cowork, etc.)
When  prompts/get handles the error
Then  messages.length = 1
  And messages[0].role = "user"
  And the content describes the error and suggests a recovery action
  And no McpError is thrown (errors are returned as messages, not exceptions)
```

---

## 8. Error Taxonomy

Two distinct error categories with different response mechanisms:

### Protocol-Level Errors (McpError -32602)

These represent invalid requests that the registry can reject before any handler logic runs.
The server throws `McpError(ErrorCode.InvalidParams, message)`.

| Condition | Message Pattern | Scenario |
|-----------|----------------|----------|
| Unknown prompt name | `Unknown prompt: {name}` | 2.4 |
| Missing required argument | `Missing required argument: {arg} for prompt {name}` | 2.5 |
| Invalid argument value (enum violation) | `Invalid value for {arg}: {value}. Expected: {expected}` | 2.6 |
| Explicit slug not found | `Intent not found: {slug}` | 2.8 |

Protocol errors are thrown by the registry layer BEFORE the prompt handler executes.

### Application-Level Errors (prompt messages)

These represent valid requests that encounter a state problem. The handler returns a
`GetPromptResult` with a single user-role message describing the error and a recovery action.
No McpError is thrown.

| Condition | Message Pattern | Scenario |
|-----------|----------------|----------|
| No .haiku/ workspace | `No H-AI-K-U workspace found. Run /haiku:new to create one.` | 6.1 |
| No git repository | `Must be in a git repository.` | 6.2 |
| Cowork mode | `Cannot run in cowork mode.` | 6.3 |
| Intent already completed | `Intent is already completed.` | 6.4 |
| No changes to review | `No changes to review.` | 6.5 |
| No active intent (auto-resolve failed) | `No active intent found. Create one with /haiku:new` | 2.7 |

The distinction: protocol errors mean "your request is malformed", application errors mean
"your request is valid but the current state cannot satisfy it".
