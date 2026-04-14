---
title: Domain discovery and technical landscape
status: completed
quality_gates:
  - >-
    Discovery document maps current SPA architecture (components, transport,
    session model)
  - Target architecture documented with domain model diagram
  - Key technical decisions recorded with rationale
  - Risks identified and assessed
---

# Domain Discovery and Technical Landscape

Completed. See knowledge/DISCOVERY.md and knowledge/RESEARCH-BRIEF.md.

Key findings:
- Current SPA: 20 files, ~3,679 lines, React/Vite, embedded as HTML string in MCP
- Target: externalized to haikumethod.ai, connected via localtunnel + WebSocket
- All dependencies already exist in website stack
- CORS is a new requirement for cross-origin tunnel requests
