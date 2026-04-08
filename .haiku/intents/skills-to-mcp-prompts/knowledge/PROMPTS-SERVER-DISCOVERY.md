---
title: "Prompts Server Infrastructure — Discovery"
unit: unit-01-prompts-server
stage: inception
---

# Prompts Server Infrastructure — Discovery

## 1. Current Server Architecture

### Server Class & Transport

The MCP server (`packages/haiku/src/server.ts`, 845 lines) uses the **low-level `Server` class** from `@modelcontextprotocol/sdk/server/index.js` — not the higher-level `McpServer` class. Transport is `StdioServerTransport`.

**Current capabilities declaration** (server.ts:118-125):
```typescript
const server = new Server(
  { name: "haiku-review", version: "0.1.0" },
  { capabilities: { tools: {} } },
)
```

Only `tools` is declared. No `prompts` or `completions` capabilities exist.

### Tool Registration Pattern

Tools use a split registration pattern:
- `ListToolsRequestSchema` handler returns tool definitions dynamically (server.ts:131-314)
- `CallToolRequestSchema` handler dispatches by name (server.ts:317-818)
- Tool defs come from three sources: `orchestratorToolDefs` (orchestrator.ts), `stateToolDefs` (state-tools.ts), and inline defs (visual review tools)

### File Organization

```
packages/haiku/src/
├── main.ts          — CLI entry: mcp | hook | migrate
├── server.ts        — MCP server + tool handlers (845 lines)
├── orchestrator.ts  — run_next + gate_approve (527 lines)
├── state-tools.ts   — 18 state tools (453 lines)
├── http.ts          — Visual review HTTP server (545 lines)
├── sessions.ts      — In-memory session store (197 lines)
├── types.ts         — Core interfaces (121 lines)
├── index.ts         — Re-exports (40 lines)
├── parser.ts        — Intent/unit/stage parsing
├── dag.ts           — DAG + topological sort
├── hooks/           — 8 hook files
└── templates/       — 8 HTML template files
```

Total: ~3,924 lines TypeScript, compiled to ~1.5MB via esbuild.

### SDK Version

`@modelcontextprotocol/sdk`: `^1.28.0` — supports `prompts`, `completions`, and the `completable()` helper for argument auto-completion.

### Filesystem Access Patterns

Both `orchestrator.ts` and `state-tools.ts` use duplicate path helpers:
- `findHaikuRoot()` — walk up from cwd for `.haiku/`
- `intentDir(slug)`, `stageDir(slug, stage)`, `unitPath(slug, stage, unit)`
- `readFrontmatter(path)` — gray-matter parsing
- `readJson(path)` — JSON.parse
- Studio resolution: checks `.haiku/studios/` then `$CLAUDE_PLUGIN_ROOT/studios/`

These are **not shared** — each file has its own copies. The prompts module will need the same filesystem access.

## 2. MCP SDK Prompts & Completions API

### Capabilities

```typescript
capabilities: {
  prompts: { listChanged: true },
  completions: {},
}
```

### Request Schemas (from `@modelcontextprotocol/sdk/types.js`)

| Schema | Method | Purpose |
|--------|--------|---------|
| `ListPromptsRequestSchema` | `prompts/list` | List available prompts |
| `GetPromptRequestSchema` | `prompts/get` | Get prompt messages by name + args |
| `CompleteRequestSchema` | `completion/complete` | Auto-complete argument values |

### PromptMessage Type

```typescript
interface PromptMessage {
  role: "user" | "assistant"
  content: TextContent | ImageContent | AudioContent | ResourceLinkContent | EmbeddedResourceContent
}
```

For our use case, we'll primarily use `{ type: "text", text: string }` content.

### GetPromptResult

```typescript
interface GetPromptResult {
  description?: string
  messages: PromptMessage[]
}
```

### Completion API

**Request:**
```typescript
{
  ref: { type: "ref/prompt", name: "haiku:run" },
  argument: { name: "intent", value: "ski" },  // partial input
  context?: { arguments?: { studio: "software" } }  // previously resolved args
}
```

**Response:**
```typescript
{
  completion: {
    values: ["skills-to-mcp-prompts", "skip-ci-setup"],  // max 100
    total?: 5,
    hasMore?: false
  }
}
```

The `context.arguments` field provides previously-resolved argument values for context-aware completions (e.g., filter stages by the already-selected intent's studio).

### Two Approaches to Registration

**Option A: Migrate to `McpServer`** — The higher-level class has `registerPrompt()` with built-in `completable()` support and automatic handler wiring.

**Option B: Stay on `Server`, add raw handlers** — Register `ListPromptsRequestSchema`, `GetPromptRequestSchema`, `CompleteRequestSchema` handlers manually, same pattern as existing tools.

## 3. Architectural Decision: Stay on Raw `Server`

**Recommendation: Option B — raw handlers on existing `Server`.**

**Rationale:**
- The server already uses `Server` with manually-wired request handlers for tools. Adding three more handlers for prompts follows the exact same pattern — no new concepts.
- Migrating to `McpServer` would require rewriting all tool registration (20+ tools) — high risk, no benefit for this unit's scope.
- The `completable()` helper is a convenience that attaches metadata to Zod schemas. We can implement the same dispatch logic directly in ~20 lines.
- Keeps the existing tool code 100% untouched — zero regression risk.

**The pattern:**

```typescript
// Add to server.ts imports:
import { ListPromptsRequestSchema, GetPromptRequestSchema, CompleteRequestSchema } from "@modelcontextprotocol/sdk/types.js"

// Add to capabilities:
capabilities: {
  tools: {},
  prompts: { listChanged: true },
  completions: {},
}

// Three new handlers:
server.setRequestHandler(ListPromptsRequestSchema, async () => ({ prompts: listPrompts() }))
server.setRequestHandler(GetPromptRequestSchema, async (req) => getPrompt(req.params.name, req.params.arguments))
server.setRequestHandler(CompleteRequestSchema, async (req) => completeArgument(req.params))
```

## 4. Module Structure

### New Files

```
packages/haiku/src/
├── prompts/
│   ├── index.ts          — Registry: listPrompts(), getPrompt(), completeArgument()
│   ├── types.ts          — PromptDef interface, argument schema types
│   └── completions.ts    — Completion providers (intent slugs, stages, studios, templates)
```

Individual prompt handlers will be added in later units (unit-02+). This unit builds the infrastructure.

### PromptDef Interface

```typescript
interface PromptDef {
  name: string                           // e.g. "haiku:run"
  title: string                          // e.g. "Run Intent"
  description: string                    // One-line summary
  arguments: PromptArgDef[]              // Argument definitions
  handler: (args: Record<string, string>) => Promise<GetPromptResult>
}

interface PromptArgDef {
  name: string                           // e.g. "intent"
  description: string
  required: boolean
  completer?: (value: string, context?: Record<string, string>) => Promise<string[]>
}
```

### Registry Pattern

```typescript
// prompts/index.ts
const registry = new Map<string, PromptDef>()

export function registerPrompt(def: PromptDef): void {
  registry.set(def.name, def)
}

export function listPrompts(): Prompt[] {
  return Array.from(registry.values()).map(def => ({
    name: def.name,
    title: def.title,
    description: def.description,
    arguments: def.arguments.map(a => ({
      name: a.name,
      description: a.description,
      required: a.required,
    })),
  }))
}

export async function getPrompt(name: string, args?: Record<string, string>): Promise<GetPromptResult> {
  const def = registry.get(name)
  if (!def) throw new McpError(ErrorCode.InvalidParams, `Unknown prompt: ${name}`)
  return def.handler(args ?? {})
}

export async function completeArgument(params: CompleteRequestParams): Promise<CompleteResult> {
  if (params.ref.type !== "ref/prompt") return { completion: { values: [] } }
  const def = registry.get(params.ref.name)
  if (!def) return { completion: { values: [] } }
  const argDef = def.arguments.find(a => a.name === params.argument.name)
  if (!argDef?.completer) return { completion: { values: [] } }
  const values = await argDef.completer(params.argument.value, params.context?.arguments)
  return { completion: { values: values.slice(0, 100), total: values.length, hasMore: values.length > 100 } }
}
```

### Completion Providers

```typescript
// prompts/completions.ts

export async function completeIntentSlug(value: string): Promise<string[]> {
  // Scan .haiku/intents/ directories, filter by prefix, sort by recency
}

export async function completeStage(value: string, context?: Record<string, string>): Promise<string[]> {
  // If context has intent → resolve its studio → return studio's stages
  // Otherwise return all known stages across studios
}

export async function completeStudio(value: string): Promise<string[]> {
  // Scan plugin/studios/ + .haiku/studios/, filter by prefix
}

export async function completeTemplate(value: string, context?: Record<string, string>): Promise<string[]> {
  // If context has studio → scan that studio's templates/
  // Otherwise scan all studio templates
}
```

Fuzzy matching: case-insensitive prefix match, sorted by relevance (exact prefix first, then substring).

## 5. Integration Points

### server.ts Changes (Minimal)

1. Add `ListPromptsRequestSchema`, `GetPromptRequestSchema`, `CompleteRequestSchema` imports
2. Add `prompts: { listChanged: true }` and `completions: {}` to capabilities
3. Add three `setRequestHandler` calls that delegate to `prompts/index.ts`
4. Import and call prompt registration from each prompt module

### Shared Filesystem Helpers

The path helpers (`findHaikuRoot`, `intentDir`, `stageDir`, `readFrontmatter`, etc.) are duplicated across `orchestrator.ts` and `state-tools.ts`. The prompts module needs the same access.

**For this unit:** Import from `state-tools.ts` by exporting the helpers, OR duplicate (matching existing pattern). Deduplication is a separate concern.

**Recommendation:** Export the helpers from `state-tools.ts` and import in `prompts/`. This is a minimal, non-breaking change.

## 6. Constraints

- **Binary size**: Must stay under 1.5MB. The prompt handlers are lightweight (they return message arrays, not large payloads). Individual prompt handlers (unit-02+) will increase size but the infrastructure itself is ~200 lines.
- **No `McpServer` migration**: Tool registration stays untouched.
- **Backward compatibility**: Existing tools continue to work exactly as before. The new handlers are additive.
- **Error codes**: `prompts/get` with unknown name → `-32602` (InvalidParams). Missing required args → `-32602`.

## 7. Technical Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| SDK `prompts/list` schema expects exact shape | Medium | Validate against SDK's `ListPromptsResultSchema` in tests |
| Completion providers hit filesystem on every keystroke | Low | Results are small (< 50 items typically), filesystem reads are fast. Cache if needed later. |
| `context.arguments` not provided by all clients | Low | Completions degrade gracefully — return all values instead of filtered |
| Prompt handler errors crash the server | Medium | Wrap handlers in try/catch, return McpError with appropriate code |
| `listChanged` notification needed when prompts are added dynamically | Low | All 21 prompts are registered at startup — no dynamic changes needed |

## 8. What Exists vs. What Changes

| Component | Exists Today | Changes |
|-----------|-------------|---------|
| `Server` class + stdio transport | Yes | Add capabilities only |
| `ListToolsRequestSchema` handler | Yes | Untouched |
| `CallToolRequestSchema` handler | Yes | Untouched |
| `ListPromptsRequestSchema` handler | **No** | **Add** |
| `GetPromptRequestSchema` handler | **No** | **Add** |
| `CompleteRequestSchema` handler | **No** | **Add** |
| `prompts/` module | **No** | **Create** |
| Path helpers in state-tools.ts | Yes (unexported) | Export for reuse |
| HTTP server / sessions | Yes | Untouched |
| Orchestrator tools | Yes | Untouched |
