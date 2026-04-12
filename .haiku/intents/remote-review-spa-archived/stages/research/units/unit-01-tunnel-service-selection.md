---
title: Localtunnel integration and WebSocket/binary file support
type: research
status: completed
inputs: ["knowledge/DISCOVERY.md"]
quality_gates:
  - Confirm localtunnel npm package supports WebSocket proxying
  - 'Verify binary data (images, files) can be served through the tunnel via HTTP'
  - Document programmatic API for creating tunnels from Node.js
  - 'Identify any connection limits, timeouts, or reliability concerns'
---

# Localtunnel Integration and WebSocket/Binary File Support

User selected localtunnel. Verify it meets all requirements for this use case.

## Research Questions

1. Does the `localtunnel` npm package reliably proxy WebSocket connections?
2. Can binary files (mockup images, wireframes, stage artifacts) be served through the tunnel via standard HTTP GET?
3. What's the programmatic API for creating a tunnel? (port, subdomain options, callbacks)
4. Are there connection limits or idle timeouts that could kill a review session?
5. What happens if the tunnel drops mid-session — can we reconnect or do we need a new URL/token?
