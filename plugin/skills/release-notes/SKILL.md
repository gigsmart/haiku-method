---
description: Show the project changelog / release notes. Use when the user asks about recent changes, what's new, version history, or release notes.
user-invocable: true
argument-hint: "[<version> | --last <n>]"
allowed-tools:
  - Read
  - Grep
  - Bash
---

## Name

`ai-dlc:release-notes` — Display the AI-DLC changelog and release notes.

## Synopsis

```
/ai-dlc:release-notes              # Show the 5 most recent releases
/ai-dlc:release-notes --last 10    # Show the 10 most recent releases
/ai-dlc:release-notes 1.82.13      # Show notes for a specific version
```

## Description

Reads `CHANGELOG.md` from the repository root and presents release notes in a readable format. The changelog follows [Keep a Changelog](https://keepachangelog.com/) format.

## Implementation

1. **Locate the changelog** — Read `CHANGELOG.md` from the repository root. If it doesn't exist, report that no changelog was found.

2. **Parse the arguments:**
   - No arguments → show the **5 most recent** version entries.
   - `--last <n>` → show the **n most recent** version entries.
   - `<version>` (e.g. `1.82.13`) → show only that specific version's entry. Try matching with and without a `v` prefix.

3. **Display each version entry** using this format:

   ```
   ## v{version} — {date}

   ### {section type}
   - {item}
   - {item}
   ```

4. **After the entries**, show:
   - Total number of releases in the changelog
   - Link to the full changelog: `See the full changelog at CHANGELOG.md`
   - RSS feed link: `Also available as an RSS feed at https://ai-dlc.dev/changelog/feed.xml`
