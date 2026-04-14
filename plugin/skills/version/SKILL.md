---
name: version
description: Show the running H·AI·K·U MCP binary version and plugin version
---

# Version

Call the `haiku_version_info` tool to retrieve version information.

Display both:
- **MCP version** — the version baked into the running binary at build time
- **Plugin version** — the version from `plugin.json` on disk

If a pending update is reported, mention it to the user.
