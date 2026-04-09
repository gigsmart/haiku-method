---
name: release-notes
description: Show the project changelog / release notes
---

# Release Notes

Display the project's CHANGELOG.md content.

## Process

1. Look for `CHANGELOG.md` — check `$CLAUDE_PLUGIN_ROOT/CHANGELOG.md` first, then walk up from current directory
2. If a specific version is requested, extract that version's section
3. Otherwise, show the 5 most recent version entries
4. Report total release count and link to full changelog
