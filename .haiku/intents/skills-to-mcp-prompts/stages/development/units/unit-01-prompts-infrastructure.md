---
name: unit-01-prompts-infrastructure
type: backend
status: active
depends_on: []
bolt: 1
hat: planner
refs:
  - knowledge/PROMPTS-SERVER-DISCOVERY.md
  - knowledge/DATA-CONTRACTS.md
  - knowledge/BEHAVIORAL-SPEC.md
  - stages/design/artifacts/PROMPT-CATALOG.md
started_at: '2026-04-07T04:02:15Z'
---

# Prompts Infrastructure

## Description

Create the prompts module with registry pattern, wire up prompts/list, prompts/get, and completion/complete handlers in server.ts. Export shared path helpers from state-tools.ts.

## Completion Criteria

- [ ] `packages/haiku/src/prompts/index.ts` exists with `registerPrompt()`, `listPrompts()`, `getPrompt()`, `completeArgument()` exports
- [ ] `packages/haiku/src/prompts/types.ts` exists with `PromptDef` and `PromptArgDef` interfaces matching DATA-CONTRACTS.md
- [ ] `packages/haiku/src/prompts/completions.ts` exists with `completeIntentSlug()`, `completeStage()`, `completeStudio()`, `completeTemplate()` providers
- [ ] `server.ts` imports `ListPromptsRequestSchema`, `GetPromptRequestSchema`, `CompleteRequestSchema` and registers three handlers
- [ ] `server.ts` capabilities updated to include `prompts: { listChanged: true }` and `completions: {}`
- [ ] `state-tools.ts` exports path helpers: `findHaikuRoot`, `intentDir`, `stageDir`, `readFrontmatter`
- [ ] Unknown prompt name returns McpError with code -32602
- [ ] Missing required argument returns McpError with code -32602
- [ ] Completions return max 100 values, sorted by prefix-first then substring
- [ ] `npm run build` succeeds with no type errors
