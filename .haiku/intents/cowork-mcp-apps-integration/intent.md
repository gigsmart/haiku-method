---
title: >-
  Add Cowork support to the H·AI·K·U plugin using MCP Apps for review UI. Detect
  Cowork via CLAUDE_CODE_IS_COWORK=1 env var, check
  CLAUDE_CODE_WORKSPACE_HOST_PATHS for workspace presence (prompt via
  request_cowork_directory if empty), and replace the HTTP server/localtunnel
  review flow with MCP Apps — bundling the review SPA as a ui:// resource
  rendered inline via sandboxed iframe, using @modelcontextprotocol/ext-apps App
  class for bidirectional postMessage communication between the review UI and
  the MCP server.
studio: software
mode: continuous
status: active
created_at: '2026-04-09'
stages:
  - inception
  - design
  - product
  - development
  - operations
  - security
active_stage: inception
---

# Add Cowork support to the H·AI·K·U plugin using MCP Apps for review UI. Detect Cowork via CLAUDE_CODE_IS_COWORK=1 env var, check CLAUDE_CODE_WORKSPACE_HOST_PATHS for workspace presence (prompt via request_cowork_directory if empty), and replace the HTTP server/localtunnel review flow with MCP Apps — bundling the review SPA as a ui:// resource rendered inline via sandboxed iframe, using @modelcontextprotocol/ext-apps App class for bidirectional postMessage communication between the review UI and the MCP server.

Discussion established three key pieces: (1) Cowork can't bind ports or connect to localhost, so the existing HTTP server + localtunnel review flow won't work. (2) MCP Apps extension (modelcontextprotocol.io/extensions/apps) solves this — tools declare _meta.ui.resourceUri pointing to ui:// resources, host renders bundled HTML in sandboxed iframes, bidirectional communication via postMessage. (3) The App class provides callServerTool(), updateModelContext(), and sendMessage() for the review app to submit decisions back to the FSM without polling. Also removed the dead get_review_status tool as part of cleanup.
