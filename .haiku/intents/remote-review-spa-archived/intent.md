---
title: >-
  Move the review SPA from the local MCP server to the website at
  haikumethod.ai. When a review is triggered, the MCP opens a localtunnel to
  expose itself, generates a JWT (signed with an ephemeral per-session secret)
  containing the tunnel URL, and opens the browser at
  haikumethod.ai/review/:token. The website decodes the token, extracts the
  tunnel URL, and establishes a WebSocket connection back to the local MCP
  through the tunnel to conduct the review in real time.
studio: ideation
mode: continuous
status: active
stages:
  - research
  - create
  - review
  - deliver
created_at: '2026-04-09'
active_stage: create
---

# Move the review SPA from the local MCP server to the website at haikumethod.ai. When a review is triggered, the MCP opens a localtunnel to expose itself, generates a JWT (signed with an ephemeral per-session secret) containing the tunnel URL, and opens the browser at haikumethod.ai/review/:token. The website decodes the token, extracts the tunnel URL, and establishes a WebSocket connection back to the local MCP through the tunnel to conduct the review in real time.

User wants to externalize the review experience from the local MCP to the public website. Key decisions made:
- The review SPA currently lives in and is served by the local MCP server
- Transport: WebSocket through the localtunnel for real-time bidirectional communication
- Token: JWT signed with an ephemeral secret generated per session, payload contains the tunnel URL
- The website route will be haikumethod.ai/review/:token
- Studio: software (spans plugin MCP changes + Next.js website changes)
