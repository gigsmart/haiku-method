---
title: Migrate Skills to MCP Prompts
studio: software
stages:
  - inception
  - design
  - product
  - development
  - operations
  - security
mode: continuous
active_stage: design
status: active
started_at: '2026-04-06'
completed_at: null
---

# Migrate Skills to MCP Prompts

## Problem

H·AI·K·U skills are prose markdown files that the agent interprets — and frequently interprets wrong. The agent skips visual review tools, treats elaboration as a single pass, dumps plans as text instead of using MCP tools, and ignores RFC 2119 requirements. Skills have no enforcement mechanism — they're suggestions the agent reads and may or may not follow.

## Solution

Replace plugin skill files with server-side MCP prompts (`prompts/list` + `prompts/get`). The MCP server constructs dynamic, context-aware prompt messages that include the current state, stage metadata, elaboration mode, and enforced tool calls. The server can call visual review tools as side effects before returning the prompt, making it impossible for the agent to skip them.

## Success Criteria

- All user-facing commands available as MCP prompts (slash commands in any MCP client)
- MCP server enforces visual review — opens review pages before returning the prompt
- Dynamic prompts include current intent state, stage config, elaboration mode
- Cross-platform: works with Claude Code, Cursor, Windsurf, any MCP client
- Plugin skill files removed or reduced to thin documentation stubs
- Binary size stays under 1.5MB
