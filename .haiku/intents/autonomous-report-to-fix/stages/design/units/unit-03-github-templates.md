---
title: GitHub issue and PR markdown templates
model: sonnet
depends_on: []
inputs:
  - intent.md
  - knowledge/DESIGN-BRIEF.md
  - knowledge/DISCOVERY.md
  - stages/inception/artifacts/affected-surfaces-and-user-flow.md
  - stages/inception/artifacts/privacy-and-data-handling-principles.md
  - stages/inception/artifacts/risk-inventory.md
  - stages/inception/artifacts/capability-and-system-context.md
  - stages/inception/artifacts/open-questions-with-defaults.md
  - >-
    .haiku/intents/autonomous-report-to-fix/stages/inception/artifacts/affected-surfaces-and-user-flow.md
  - >-
    .haiku/intents/autonomous-report-to-fix/stages/inception/artifacts/privacy-and-data-handling-principles.md
  - >-
    .haiku/intents/autonomous-report-to-fix/stages/inception/artifacts/risk-inventory.md
  - >-
    .haiku/intents/autonomous-report-to-fix/stages/inception/artifacts/capability-and-system-context.md
  - >-
    .haiku/intents/autonomous-report-to-fix/stages/inception/artifacts/open-questions-with-defaults.md
outputs:
  - >-
    .haiku/intents/autonomous-report-to-fix/stages/design/artifacts/github-templates/issue-template.md
  - >-
    .haiku/intents/autonomous-report-to-fix/stages/design/artifacts/github-templates/pr-template.md
  - >-
    .haiku/intents/autonomous-report-to-fix/stages/design/artifacts/github-templates/index.md
quality_gates:
  - name: all-three-files-exist
    command: >-
      test -s
      .haiku/intents/autonomous-report-to-fix/stages/design/artifacts/github-templates/issue-template.md
      && test -s
      .haiku/intents/autonomous-report-to-fix/stages/design/artifacts/github-templates/pr-template.md
      && test -s
      .haiku/intents/autonomous-report-to-fix/stages/design/artifacts/github-templates/index.md
  - name: issue-template-has-required-sections
    command: >-
      grep -q '^## Summary'
      .haiku/intents/autonomous-report-to-fix/stages/design/artifacts/github-templates/issue-template.md
      && grep -q '^## Environment'
      .haiku/intents/autonomous-report-to-fix/stages/design/artifacts/github-templates/issue-template.md
      && grep -q '^## Steps'
      .haiku/intents/autonomous-report-to-fix/stages/design/artifacts/github-templates/issue-template.md
      && grep -qE '\*Reported on behalf of\*|attribut'
      .haiku/intents/autonomous-report-to-fix/stages/design/artifacts/github-templates/issue-template.md
  - name: issue-template-explains-bot-authored-attribution
    command: >-
      grep -qiE 'bot.authored|bot account|created issues.*list|will not appear'
      .haiku/intents/autonomous-report-to-fix/stages/design/artifacts/github-templates/issue-template.md
  - name: pr-template-has-fixes-keyword
    command: >-
      grep -qE 'Fixes #|Closes #|Resolves #'
      .haiku/intents/autonomous-report-to-fix/stages/design/artifacts/github-templates/pr-template.md
  - name: pr-template-has-test-plan
    command: >-
      grep -qE '^## Test plan|^## Tests'
      .haiku/intents/autonomous-report-to-fix/stages/design/artifacts/github-templates/pr-template.md
      && grep -qE '^- \[ \]'
      .haiku/intents/autonomous-report-to-fix/stages/design/artifacts/github-templates/pr-template.md
  - name: no-leaked-paths
    command: >-
      [ "$(grep -rlE '/Users/[^/]+/|/home/[^/]+/'
      .haiku/intents/autonomous-report-to-fix/stages/design/artifacts/github-templates/
      2>/dev/null | wc -l | tr -d ' ')" = '0' ]
  - name: scrubbed-bundle-disclosure-mentioned
    command: >-
      grep -qiE 'scrub|sanitiz|redact'
      .haiku/intents/autonomous-report-to-fix/stages/design/artifacts/github-templates/issue-template.md
  - name: back-link-to-status-page
    command: >-
      grep -qE 'haikumethod\.ai/report'
      .haiku/intents/autonomous-report-to-fix/stages/design/artifacts/github-templates/issue-template.md
      && grep -qE 'haikumethod\.ai/report'
      .haiku/intents/autonomous-report-to-fix/stages/design/artifacts/github-templates/pr-template.md
status: active
bolt: 1
hat: designer-prep
started_at: '2026-05-08T17:53:22Z'
hat_started_at: '2026-05-08T17:53:22Z'
iterations:
  - hat: designer-prep
    started_at: '2026-05-08T17:53:22Z'
    completed_at: null
    result: null
---
# GitHub Issue and PR Markdown Templates

## Topic

Produce the canonical markdown templates the bot writes when it opens (a) the GitHub issue attributed to the user and (b) the PR that references the issue. These are the only artifacts that leave the GigSmart trust boundary and land in the public `gigsmart/haiku-method` repository, so the templates need explicit attention to what's disclosed (sanitized session excerpt only, never the raw bundle), how the user is attributed without exposing OAuth scope ambiguity, and what shape the bot's PR description takes (`Fixes #N`, test-plan checklist, scrubbed diagnostic context).

## Why this is its own unit

These two surfaces are markdown-only — different medium from the SPA wireframes (no Tailwind, no breakpoints, no interactive state) and different from the skill conversation (asynchronous, public-visible, persistent). Bundling with either would conflate concerns. They share medium and review surface (markdown bot output, attribution conventions, leak-prevention rules), so they belong together as one unit.

## Completion criteria

The artifact at `.haiku/intents/autonomous-report-to-fix/stages/design/artifacts/github-templates/` MUST contain:

### `index.md`

- Names both templates, their canonical filenames, and the variables the bot interpolates (e.g. `{{user_name}}`, `{{user_github_handle}}`, `{{fix_id}}`, `{{scrubbed_excerpt}}`, `{{issue_number}}`).
- Lists which fields fall back to a bot-only default when OAuth was declined.
- Names the fallback message used when OAuth is declined.

### `issue-template.md`

- `## Summary` — agent-synthesized one-paragraph description of the symptom (no raw transcript).
- `## Environment` — bullet list with H·AI·K·U plugin version, MCP version, OS, Claude Code version (from sanitized bundle metadata only).
- `## Steps to reproduce` — distilled from the scrubbed transcript.
- `## Expected vs actual` — same source.
- Sanitized session excerpt in a fenced code block, with an explicit note that secrets and absolute paths have been scrubbed (the word `scrub`, `sanitiz`, or `redact` MUST appear in the template body).
- **Attribution footer (OAuth-granted variant)** — exactly two italicized lines:
  - Line 1: `*Reported on behalf of @{{user_github_handle}} via [haikumethod.ai/report/{{fix_id}}](https://haikumethod.ai/report/{{fix_id}})*`
  - Line 2: `*This issue was opened by the H·AI·K·U bot on the reporter's behalf. It will not appear in the reporter's GitHub "created issues" list — GitHub attributes bot-opened issues to the bot account.*`
- **Attribution footer (OAuth-declined variant)** — single italicized line:
  - `*Reported anonymously (or: Reported by {{user_name_or_email}}) via [haikumethod.ai/report/{{fix_id}}](https://haikumethod.ai/report/{{fix_id}}). No GitHub attribution was linked.*`
- The literal phrases `bot-authored`, `bot account`, `will not appear`, or `created issues` MUST be present in the OAuth-granted footer (the gate verifies one of these patterns) so the bot-authorship nature is self-documenting in the issue body.

### `pr-template.md`

- One-line summary.
- `Fixes #{{issue_number}}` (or `Closes` / `Resolves`) so GitHub auto-closes the issue on merge.
- `## Diagnostic context` summarizing what the agent found in the scrubbed transcript.
- `## Test plan` with a markdown task-list (`- [ ]` items) covering CI checks the agent expects to pass.
- Footer linking back to the status page (`haikumethod.ai/report/{{fix_id}}`).

### Path-leak prohibition

Both templates MUST NOT contain any leaked absolute paths (`/Users/<name>/…`, `/home/<name>/…`) — the gate verifies this — even in example placeholder text. Examples should use generic forms like `<repo-relative-path>:<line>`.

## Disclosure rules carried from inception

The privacy artifact named that the issue body must:
- Disclose what scrubbing was applied so the user can audit (`scrub` / `sanitiz` / `redact` keyword required in body).
- Link back to the status page where the user can see what the loop is doing.
- Attribute to the user when OAuth was granted; use a bot-only fallback when declined.
- **Self-document the bot-authorship attribution model** so users who read the issue without going through the OAuth prompt understand why the issue isn't in their GitHub activity feed (this closes the OAuth Attribution Mismatch risk surfaced in the inception risk inventory).

These four rules are the load-bearing constraints the templates encode. Verifier hat reviews against them.

## Out of scope

The artifact MUST NOT specify the bot's GitHub OAuth scope or token format (operations stage owns that). The artifact MUST NOT specify the issue / PR creation API call shape (development stage owns that). It specifies the user-visible markdown the bot writes.
