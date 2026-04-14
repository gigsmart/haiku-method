---
name: unit-01-prompts-infrastructure
status: completed
depends_on: []
bolt: 1
hat: reviewer
refs:
  - knowledge/PROMPTS-SERVER-DISCOVERY.md
  - knowledge/DATA-CONTRACTS.md
  - knowledge/BEHAVIORAL-SPEC.md
  - stages/design/artifacts/PROMPT-CATALOG.md
started_at: '2026-04-07T04:02:15Z'
completed_at: '2026-04-07T04:05:28Z'
---

# Prompts Infrastructure

## Description

Create the prompts module with registry pattern, wire up prompts/list, prompts/get, and completion/complete handlers in server.ts. Export shared path helpers from state-tools.ts.

## Completion Criteria

- [x] `packages/haiku/src/prompts/index.ts` exists with `registerPrompt()`, `listPrompts()`, `getPrompt()`, `completeArgument()` exports
- [x] `packages/haiku/src/prompts/types.ts` exists with `PromptDef` and `PromptArgDef` interfaces matching DATA-CONTRACTS.md
- [x] `packages/haiku/src/prompts/completions.ts` exists with `completeIntentSlug()`, `completeStage()`, `completeStudio()`, `completeTemplate()` providers
- [x] `server.ts` imports `ListPromptsRequestSchema`, `GetPromptRequestSchema`, `CompleteRequestSchema` and registers three handlers
- [x] `server.ts` capabilities updated to include `prompts: { listChanged: true }` and `completions: {}`
- [x] `state-tools.ts` exports path helpers: `findHaikuRoot`, `intentDir`, `stageDir`, `readFrontmatter`
- [x] Unknown prompt name returns McpError with code -32602
- [x] Missing required argument returns McpError with code -32602
- [x] Completions return max 100 values, sorted by prefix-first then substring
- [x] `npm run build` succeeds with no type errors
