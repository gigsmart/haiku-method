# Claude Code Transcript Format — Field Reference for Metrics Capture

## Scope

This document describes the on-disk shape of Claude Code session transcripts at
`~/.haiku/projects/**/*.jsonl` as observed on the operator's machine on
2026-04-14, focused on the fields needed to attribute token usage to a unit of
H·AI·K·U work. It documents *what exists*, not what we will build with it.

## File location and naming

- Session transcripts live under `~/.claude/projects/{encoded-cwd}/{sessionId}.jsonl`.
- `{encoded-cwd}` is the absolute working directory with `/` replaced by `-`
  (e.g. `-Volumes-dev-src-github-com-thebushidocollective-haiku-method--claude-worktrees-refactored-swinging-frog`).
- `{sessionId}` is a UUID, matching the in-entry `sessionId` field.
- Subagent transcripts live alongside top-level sessions under
  `~/.claude/projects/{encoded-cwd}/{sessionId}/subagents/agent-{agentId}.jsonl`.
  Subagent lines can also be identified by `"isSidechain": true` and the
  presence of an `agentId` field.
- Format: one JSON object per line (JSONL). Lines are not wrapped, each line is
  one object.

## Top-level line types

Grepping `.type` across a representative 6,932-line session
(`d7606462-c6ec-4078-aaec-a990b9c9666c.jsonl`) yields the following line types:

| `type` value              | Count | Meaning                                                          |
|---------------------------|------:|------------------------------------------------------------------|
| `assistant`               | 2,016 | A content block from an assistant API response                   |
| `user`                    | 1,353 | A user prompt, tool result, image, or text block                 |
| `attachment`              | 2,966 | Attached file / image metadata                                   |
| `system`                  |   196 | Session-level system messages                                    |
| `file-history-snapshot`   |   151 | Snapshot of file state taken by the harness                      |
| `queue-operation`         |   220 | Queue management events                                          |
| `permission-mode`         |     9 | Permission mode change marker                                    |
| `worktree-state`          |    10 | Worktree bookkeeping                                             |
| `last-prompt`             |     5 | Marker for most-recent prompt                                    |
| `pr-link`                 |     6 | PR association marker                                            |

Only lines with `type == "assistant"` carry token usage. Lines with
`type == "user"` whose `message.content[0].type == "tool_result"` carry the
results of tool calls but no usage — the tokens for those results are billed on
the *next* assistant turn (they show up in the next assistant line's
`cache_creation_input_tokens` or `input_tokens`).

## Top-level fields on an assistant line

Observed on every `assistant` line (keys sorted):

```
cwd            — absolute working directory (string)
entrypoint     — e.g. "cli" (string)
gitBranch      — git branch at the time the line was written (string)
isSidechain    — true if this is a subagent line, false/null for top-level
parentUuid     — uuid of the previous conversation turn (chains form the thread)
requestId      — Anthropic API request id, e.g. "req_011CZy..."
sessionId      — UUID of the Claude Code session
slug           — human-readable worktree slug
timestamp      — ISO 8601 UTC with milliseconds, e.g. "2026-04-13T15:24:15.442Z"
type           — "assistant"
userType       — e.g. "external"
uuid           — UUID of this specific JSONL line (not the API message)
version        — Claude Code version, e.g. "2.1.104"
message        — the Anthropic API message object (see below)
```

Subagent lines additionally carry `agentId` (string, matches the subagent
filename) and `isSidechain: true`.

## `message` sub-object on an assistant line

```
message.id            — API message id, e.g. "msg_015V4WyowVohSJTh95A2t1Ma"
message.type          — "message"
message.role          — "assistant"
message.model         — model ID (see list below)
message.content       — array of content blocks (type ∈ text | thinking | tool_use)
message.stop_reason   — end_turn | tool_use | stop_sequence | null
message.stop_sequence — string or null
message.stop_details  — object or null
message.usage         — token usage object (see below)
```

## Token-bearing fields (assistant turn)

Every token count lives under `message.usage`. JSON paths:

| JSON path                                                    | Meaning                                                         |
|--------------------------------------------------------------|-----------------------------------------------------------------|
| `message.usage.input_tokens`                                 | Uncached input tokens billed for this turn                      |
| `message.usage.output_tokens`                                | Output tokens produced by the assistant this turn               |
| `message.usage.cache_creation_input_tokens`                  | Input tokens written to the cache this turn (rollup)            |
| `message.usage.cache_read_input_tokens`                      | Input tokens served from cache this turn                        |
| `message.usage.cache_creation.ephemeral_5m_input_tokens`     | Sub-bucket of cache_creation_input_tokens, 5-minute TTL         |
| `message.usage.cache_creation.ephemeral_1h_input_tokens`     | Sub-bucket of cache_creation_input_tokens, 1-hour TTL           |
| `message.usage.server_tool_use.web_search_requests`          | Count of server-side web-search tool calls                      |
| `message.usage.server_tool_use.web_fetch_requests`           | Count of server-side web-fetch tool calls                       |
| `message.usage.service_tier`                                 | Billing tier string, e.g. `"standard"` or `null`                |
| `message.usage.speed`                                        | Speed tier, e.g. `"standard"` or `null`                         |
| `message.usage.inference_geo`                                | Geo string or `""` / `null`                                     |
| `message.usage.iterations[]`                                 | Per-iteration breakdown (same shape as top-level usage); present on some entries, `null` on others |

Notes:

- `cache_creation_input_tokens == cache_creation.ephemeral_5m_input_tokens + cache_creation.ephemeral_1h_input_tokens`.
  The two sub-buckets may be priced differently, so a parser that wants
  accurate cost MUST read the `cache_creation` sub-object, not just the rollup.
- `iterations` is optional and appears to be present only when the underlying
  API response used internal iteration. Its entries duplicate the top-level
  shape. For attribution, the top-level `usage` is authoritative.
- Some assistant lines have `message.model == "<synthetic>"`. These are locally
  generated assistant entries (not real API responses) and their `usage` fields
  are all zero. A parser should skip them.

## Timestamps

- Field name: `timestamp` (top-level, on every line type).
- Format: ISO 8601 UTC with millisecond precision and trailing `Z`, e.g.
  `"2026-04-13T15:24:15.442Z"`.
- Monotonic within a file but NOT guaranteed strictly increasing across lines
  that share a `message.id` (see below).

## Message boundaries — CRITICAL

A single Anthropic API response (one `msg_...` id) is split across **multiple
JSONL lines, one line per content block**. Each line has a unique top-level
`uuid` but the same `message.id`. Observed in the reference file:

```
$ jq -r 'select(.type=="assistant") | .message.id' d76...jsonl | sort | uniq -c | sort -rn | head
  12 msg_01FHUqMhCeTWYv1ZMaZvGe8S
  10 msg_01WKnJLmfYCyjm57y5e1xRzL
  10 msg_01Au1ShCfAJkpxAfKwVxG8Nq
   9 msg_01RpGGgZbJ2M2jhJv8MFkqQH
   8 msg_01UrTZwRJw7yU7aXNQbDVBTF
```

Twelve lines, one API response. And:

```
$ jq -c 'select(.message.id=="msg_01FHUqMhCeTWYv1ZMaZvGe8S") | .message.usage.output_tokens' ... | uniq -c
  12 5369
```

**The full `usage` object is duplicated verbatim on every line that shares a
`message.id`.** A naive sum across lines will over-count by the number of
content blocks in each turn (in this case, 12x for that single turn).

**Implication for any parser:** dedupe by `message.id` before summing. For each
unique `message.id`, read `usage` from any one of its lines — they are all
identical.

## Content block shapes

`message.content` is always an array. Observed block type combinations on
assistant lines:

- `["text"]` — plain prose response
- `["thinking"]` — extended thinking block (text inside is redactable)
- `["tool_use"]` — a tool invocation
- `["thinking","tool_use"]` — thinking followed by a tool call

Each content block has `type` and type-specific fields. For `tool_use`:

```
{"type":"tool_use","id":"toolu_01Wz5Xyryd...","name":"Bash","input":{...},"caller":{"type":"direct"}}
```

On `user` lines the content shapes observed are: `"string"` (plain text prompt),
`["text"]`, `["image","text"]`, and `["tool_result"]`. A `tool_result` user line
carries:

- `message.content[0].tool_use_id` — matches the `tool_use.id` on a prior
  assistant line.
- `sourceToolAssistantUUID` — top-level field, the JSONL `uuid` of the
  assistant line whose `tool_use` block this is answering. Useful for walking
  the call graph without parsing content.

Tool results are billed as input tokens on the *next* assistant turn, not on
the user line itself.

## Assistant-turn vs assistant-message semantics

- **API message** = one `message.id`, one `usage` object, possibly many content
  blocks, possibly many JSONL lines.
- **Turn** = one API round-trip. A single turn has exactly one `message.id` and
  one `usage`.
- **JSONL line** = one content block. Do not use the line count as a turn count.

For bolt attribution, the unit of summation is the unique `message.id`, not
the line.

## Session, subagent, and sidechain attribution

- Every line has `sessionId` — the top-level Claude Code session. All lines
  from one `claude` invocation share a `sessionId`.
- Top-level lines have `isSidechain: false` (or `null` in older entries).
- Subagent (Task) invocations write their own `{sessionId}/subagents/agent-{agentId}.jsonl`
  file and each line carries `isSidechain: true` and `agentId: "<hex>"`.
- `parentUuid` chains form the conversation DAG within a session. Walking from
  any line's `parentUuid` back to `null` gives the full ancestor chain.

For metrics purposes: a bolt that spawns subagents will have its tokens spread
across the main session file **and** one or more `subagents/*.jsonl` files; a
faithful sum must include both.

## Distinct `model` IDs observed

Grepping across ~500 representative transcript files on this machine:

```
$ find ~/.claude/projects -name "*.jsonl" -type f | head -500 | while read f; do
    jq -r 'select(.type=="assistant") | .message.model' "$f" 2>/dev/null
  done | sort -u
```

Output:

```
<synthetic>
claude-haiku-4-5-20251001
claude-opus-4-5-20251101
claude-opus-4-6
claude-sonnet-4-5-20250929
```

Notes:

- `<synthetic>` is a placeholder for locally-generated assistant entries; zero
  usage, skip for billing.
- `claude-opus-4-6` appears without a date suffix — the other three follow the
  `{family}-{major}-{minor}-{yyyymmdd}` pattern. A pricing table keyed on exact
  string must account for both shapes.
- These are only the models seen in sampled local files. A production parser
  should degrade gracefully (log and zero) on any unknown `model` string rather
  than crash, since upstream can introduce new IDs at any time.

## Sanitized sample assistant line

Real entry from
`~/.claude/projects/-Volumes-dev-src-github-com-thebushidocollective-haiku-method--claude-worktrees-refactored-swinging-frog/d7606462-c6ec-4078-aaec-a990b9c9666c.jsonl`,
with content block bodies, tool inputs, and prompt text stripped. Structural
fields preserved verbatim:

```json
{
  "parentUuid": "5580b5ae-3292-40a4-b664-4ea29dc6f76e",
  "isSidechain": false,
  "message": {
    "id": "msg_015V4WyowVohSJTh95A2t1Ma",
    "type": "message",
    "role": "assistant",
    "model": "claude-opus-4-6",
    "content": [
      {"type": "thinking", "thinking": "<redacted>"},
      {"type": "tool_use", "id": "toolu_01HBNogQnwMd5zekQAg6Sugt", "name": "Bash", "input": "<redacted>", "caller": {"type": "direct"}}
    ],
    "stop_reason": "tool_use",
    "stop_sequence": null,
    "stop_details": null,
    "usage": {
      "input_tokens": 6,
      "cache_creation_input_tokens": 38495,
      "cache_read_input_tokens": 0,
      "output_tokens": 296,
      "cache_creation": {
        "ephemeral_5m_input_tokens": 0,
        "ephemeral_1h_input_tokens": 38495
      },
      "server_tool_use": {
        "web_search_requests": 0,
        "web_fetch_requests": 0
      },
      "service_tier": "standard",
      "speed": "standard",
      "inference_geo": "",
      "iterations": [
        {
          "type": "message",
          "input_tokens": 6,
          "output_tokens": 296,
          "cache_read_input_tokens": 0,
          "cache_creation_input_tokens": 38495,
          "cache_creation": {
            "ephemeral_5m_input_tokens": 0,
            "ephemeral_1h_input_tokens": 38495
          }
        }
      ]
    }
  },
  "requestId": "req_011CZy<redacted>",
  "type": "assistant",
  "uuid": "6b7f0e13-a20e-499d-9e1a-d549655c6a92",
  "timestamp": "2026-04-13T15:24:15.442Z",
  "userType": "external",
  "entrypoint": "cli",
  "cwd": "/Volumes/dev/src/github.com/thebushidocollective/haiku-method/.claude/worktrees/refactored-swinging-frog",
  "sessionId": "d7606462-c6ec-4078-aaec-a990b9c9666c",
  "version": "2.1.104",
  "gitBranch": "fix/detail-page-pr-badge-deeplink",
  "slug": "refactored-swinging-frog"
}
```

The very next line in the same file has a different `uuid`
(`44a48cfe-...`), the same `message.id` (`msg_015V4Wyow...`), and a
byte-identical `usage` object.

## Grep-level proof that token fields exist

From the unit's completion criteria:

```
$ grep -rh "input_tokens\|cache_read" ~/.claude/projects 2>/dev/null | head -1
```

returns real assistant lines containing (excerpt):

```
"usage":{"input_tokens":6,"cache_creation_input_tokens":14694,"cache_read_input_tokens":0,"cache_creation":{"ephemeral_5m_input_tokens":14694,"ephemeral_1h_input_tokens":0},"output_tokens":1,"service_tier":"standard","inference_geo":"not_available"}
```

The field names `input_tokens`, `output_tokens`, `cache_creation_input_tokens`,
and `cache_read_input_tokens` are literal and present in real data.

## Summary of what a downstream design must handle

A design-stage agent committing to a parser schema from this document alone
now has:

1. Exact JSON paths for every token-bearing field, including cache sub-buckets.
2. The timestamp field name (`timestamp`) and format (ISO 8601 UTC ms).
3. A complete list of observed `model` values (including the `<synthetic>`
   placeholder that must be skipped).
4. The dedupe-by-`message.id` invariant — without it, any sum is wrong by a
   factor equal to the number of content blocks per turn.
5. Subagent attribution via `isSidechain`, `agentId`, and the
   `subagents/agent-*.jsonl` file layout.
6. The `sessionId` and `timestamp` anchors needed to correlate a bolt's
   execution window to a slice of transcript lines (strategy is left to the
   next unit).
