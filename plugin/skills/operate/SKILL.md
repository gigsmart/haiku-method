---
name: operate
description: Manage operations — list, execute, deploy, monitor, and teardown operational tasks
---

# Operate

Manage operational tasks defined in studio operation templates.

## Process

1. If a specific operation is requested, load it from the studio's `operations/` directory and execute it.
2. Otherwise, list available operations from the active intent's studio.
3. Check `.haiku/intents/*/operations/` for intent-specific operation specs.

## Modes

- **No arguments:** List all operations across all intents
- **With intent slug:** Show status table for that intent's operations
- **With intent + operation:** Execute a specific operation
- **With --deploy:** Generate deployment manifests
- **With --status:** Show health and overdue operations
- **With --teardown:** Remove deployments (preserves specs)

For agent-owned operations, execute the companion script. For human-owned operations, present the checklist and track completion.
