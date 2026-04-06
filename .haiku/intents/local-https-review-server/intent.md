---
title: Local HTTPS Review Server
studio: software
stages: [inception, design, product, development, operations, security]
mode: continuous
active_stage: ""
status: active
started_at: "2026-04-06T22:48:00Z"
completed_at: null
---

# Local HTTPS Review Server

## Problem

The H·AI·K·U review pages are currently bundled as a React SPA inside the MCP binary (~454KB of the 1MB binary). This means:
- Every change to the review UI requires rebuilding the binary
- The review app duplicates components from the website
- The binary is bloated with React, Tailwind CSS, and all review components
- No shared rendering between browse (website) and review (binary)

## Solution

Replace the bundled React SPA with website-hosted review pages backed by a local HTTPS API:

1. **Cert provisioning**: A microservice provisions Let's Encrypt wildcard certs for `*.local.haikumethod.ai`
2. **DNS**: `local.haikumethod.ai` points to 127.0.0.1 / ::1
3. **MCP serves JSON API only**: The binary runs an HTTPS server (using the provisioned cert) that serves session data as JSON — no HTML rendering
4. **Website hosts review pages**: New routes at `haikumethod.ai/review/{encoded}` where `encoded` is urlsafe-base64 of `{port}-{sessionId}`
5. **Website fetches from local**: The review page makes `fetch("https://local.haikumethod.ai:{port}/api/session/{sessionId}")` to get data, then renders with the same React components used by browse

This eliminates React from the binary, shares components between browse and review, and makes review UI changes instant (website deploy, not binary rebuild).

## Success Criteria

- Binary size reduced by ~450KB (no bundled React/Tailwind)
- Review pages render identically to current SPA
- Inline comments and image annotations work
- Design direction picker works
- Visual question form works
- Local HTTPS works without browser security warnings
- Works offline (cert cached locally)
