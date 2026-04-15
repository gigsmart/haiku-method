---
title: Review SPA component audit and migration scope
status: completed
quality_gates:
  - Complete inventory of all SPA components with purpose and dependencies
  - Documents data flow changes (local fetch vs tunnel-proxied fetch)
  - >-
    Identifies binary file serving changes (mockups, wireframes, artifacts
    through tunnel)
  - Lists what gets removed from the MCP after full cutover
  - Confirms React 19 + Tailwind 4 compatibility of migrated components
---

# Review SPA Component Audit and Migration Scope

Full feature parity migration. All components move to the website. Local SPA serving is removed from MCP entirely (full cutover).

## Research Questions

1. Complete component inventory from `review-app/src/` — what does each do and what are its dependencies?
2. How does `useSession.ts` need to change when API base URL comes from decoded JWT tunnel URL?
3. Binary files (mockups, wireframes, stage artifacts) are currently served via local HTTP routes — how do these work through the tunnel? (Same HTTP server, just different base URL?)
4. What code gets removed from the MCP? (`review-app/`, `review-app-html.ts`, build script, HTML serving routes?)
5. Any `"use client"` boundaries needed for Next.js SSG compatibility?
6. What's the WebSocket reconnection story when connecting through a tunnel vs localhost?
