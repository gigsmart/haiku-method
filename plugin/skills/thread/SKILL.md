---
description: Lightweight persistent context threads that span sessions without full intent resume
disable-model-invocation: true
user-invocable: true
argument-hint: "[create|list|load|close|promote] [name]"
---

## Name

`ai-dlc:thread` - Manage lightweight persistent context threads.

## Synopsis

```
/thread create <name>
/thread list
/thread load <name>
/thread close <name>
/thread promote <name>
```

## Description

Threads are lightweight persistent context that spans sessions without the overhead of a full intent. No units, no hats, no workflow — just a goal, context, references, and next steps you can pick up across sessions.

Use threads when:
- Tracking an idea or investigation that doesn't warrant a full intent
- Maintaining context across sessions for a recurring topic
- Collecting references and notes before deciding to formalize work
- Coordinating lightweight tasks that don't need decomposition

## Commands

### `create <name>`

Create a new thread. The name becomes the slug (kebab-cased).

**Steps:**

1. Slugify the name: lowercase, replace spaces with hyphens, strip non-alphanumeric characters.
2. Create the thread file at `.ai-dlc/threads/{slug}.md`.
3. Prompt the user for:
   - **Goal** — What is this thread tracking?
   - **Context** — Any background information?
   - **References** — File paths, URLs, related intents?
   - **Next Steps** — What are the immediate next actions?
4. Write the thread file with the following format:

```yaml
---
title: "{thread title}"
created: "{ISO date}"
updated: "{ISO date}"
status: active
promoted_to: ""
---

## Goal
{What this thread is tracking}

## Context
{Background information}

## References
- {file paths, URLs, related intents}

## Next Steps
- [ ] {next action}
```

5. Confirm creation:

```
## Thread Created

**Title:** {title}
**File:** .ai-dlc/threads/{slug}.md
**Status:** active

Pick this up anytime with `/thread load {slug}`.
```

### `list`

List all threads and their status.

**Steps:**

1. Scan `.ai-dlc/threads/*.md` for thread files.
2. For each file, read the frontmatter to extract `title`, `status`, and `updated`.
3. Display a summary table:

```
## Active Threads

| Thread | Status | Last Updated |
|--------|--------|--------------|
| {title} ({slug}) | active | {date} |
| {title} ({slug}) | resolved | {date} |
```

4. If no threads exist, display:

```
No threads found. Create one with `/thread create <name>`.
```

### `load <name>`

Load a thread's context into the current session.

**Steps:**

1. Find the thread file at `.ai-dlc/threads/{slug}.md`.
2. If not found, list available threads and suggest the closest match.
3. Read the full thread file and present it:

```
## Thread Loaded: {title}

**Status:** {status}
**Created:** {created}
**Last Updated:** {updated}

### Goal
{goal content}

### Context
{context content}

### References
{references}

### Next Steps
{next steps with checkboxes}

---
Update this thread as you work. When done, run `/thread close {slug}`.
```

4. Update the `updated` date in the frontmatter to today.

### `close <name>`

Mark a thread as resolved.

**Steps:**

1. Find the thread file at `.ai-dlc/threads/{slug}.md`.
2. If not found, error with available threads.
3. Update frontmatter: set `status: resolved` and `updated` to today.
4. Confirm:

```
## Thread Closed

**Title:** {title}
**File:** .ai-dlc/threads/{slug}.md
**Status:** resolved

Thread marked as resolved. It remains in `.ai-dlc/threads/` for reference.
```

### `promote <name>`

Promote a thread to a full intent for elaboration.

**Steps:**

1. Find the thread file at `.ai-dlc/threads/{slug}.md`.
2. If not found, error with available threads.
3. If status is already `promoted`, inform the user and show the `promoted_to` slug.
4. Update frontmatter: set `status: promoted` and `updated` to today.
5. Instruct the user to run `/elaborate` with the thread's goal as the starting point:

```
## Thread Promoted

**Title:** {title}
**Thread:** .ai-dlc/threads/{slug}.md
**Status:** promoted

This thread is ready to become a full intent. Run:

  /elaborate

Use the following as your starting description:

> {goal content}

After elaboration completes, update the thread's `promoted_to` field with the intent slug.
```

## Thread File Format

Thread files live in `.ai-dlc/threads/` and use this format:

```yaml
---
title: "{thread title}"
created: "{ISO date}"
updated: "{ISO date}"
status: active | resolved | promoted
promoted_to: ""
---

## Goal
{What this thread is tracking}

## Context
{Background information}

## References
- {file paths, URLs, related intents}

## Next Steps
- [ ] {next action}
```

## Examples

### Creating a Thread

```
User: /thread create API rate limiting investigation
AI: ## Thread Created

**Title:** API rate limiting investigation
**File:** .ai-dlc/threads/api-rate-limiting-investigation.md
**Status:** active

Pick this up anytime with `/thread load api-rate-limiting-investigation`.
```

### Loading a Thread

```
User: /thread load api-rate-limiting-investigation
AI: ## Thread Loaded: API rate limiting investigation

**Status:** active
**Created:** 2026-03-26
**Last Updated:** 2026-03-26

### Goal
Investigate rate limiting options for the public API...

### Next Steps
- [ ] Review current traffic patterns
- [ ] Evaluate token bucket vs sliding window

---
Update this thread as you work. When done, run `/thread close api-rate-limiting-investigation`.
```

### Promoting a Thread

```
User: /thread promote api-rate-limiting-investigation
AI: ## Thread Promoted

**Title:** API rate limiting investigation
**Thread:** .ai-dlc/threads/api-rate-limiting-investigation.md
**Status:** promoted

This thread is ready to become a full intent. Run:

  /elaborate

Use the following as your starting description:

> Investigate rate limiting options for the public API...

After elaboration completes, update the thread's `promoted_to` field with the intent slug.
```
