---
title: Entry flow and error state wireframes
type: design
status: completed
inputs: ["knowledge/DISCOVERY.md"]
quality_gates:
  - Split panel layout wireframes for all connection states (loading, connected, error, expired, reconnecting)
  - Left sidebar shows connection status indicators and session metadata
  - Right panel shows review content or error messaging
  - Dark mode styling using website's stone/teal design tokens
  - Responsive behavior defined for mobile (collapses sidebar)
---

# Entry Flow and Error State Wireframes

Selected direction: **Split Panel**

Left sidebar: H·AI·K·U branding, connection status indicators (token valid, tunnel connected, WebSocket active), session expiry countdown.

Right panel: Loading spinner during fetch, then full review UI once connected. Error states fill the right panel with clear messaging.

## States to wireframe:
1. Loading (token decoded, connecting to tunnel)
2. Connected (session loaded, review UI visible)
3. Error: expired token
4. Error: tunnel unreachable
5. Error: malformed token
6. Error: session not found
7. Reconnecting (WS dropped, left sidebar shows reconnecting indicator)
