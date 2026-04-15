---
name: unit-02-data-contracts
type: product
status: completed
inputs: ["knowledge/DISCOVERY.md"]
depends_on: []
bolt: 1
hat: specification-writer
refs:
  - knowledge/PROMPTS-SERVER-DISCOVERY.md
  - stages/design/artifacts/PROMPT-CATALOG.md
started_at: '2026-04-07T03:37:50Z'
completed_at: '2026-04-07T03:40:31Z'
---

# Data Contracts

## Description

Define the MCP protocol data contracts: request/response schemas for prompts/list, prompts/get, and completion/complete. Define the internal PromptDef registry type and the prompt handler signature.

## Completion Criteria

- [x] prompts/list response schema: array of Prompt objects with name (string), title (string?), description (string?), arguments (PromptArgument[]?)
- [x] prompts/get request schema: name (string, required), arguments (Record<string, string>, optional)
- [x] prompts/get response schema: GetPromptResult with description? and messages (PromptMessage[])
- [x] completion/complete request schema: ref (PromptReference), argument (name + value), context? (arguments map)
- [x] completion/complete response schema: completion object with values (string[]), total? (number), hasMore? (boolean)
- [x] Internal PromptDef type: name, title, description, arguments (with completer functions), handler function signature
- [x] Error response shapes: McpError with code -32602 for all validation errors
