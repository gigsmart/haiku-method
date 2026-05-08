---
title: Privacy policy update copy + CI gate spec
model: sonnet
depends_on: []
inputs:
  - intent.md
  - knowledge/DESIGN-BRIEF.md
  - stages/inception/artifacts/privacy-and-data-handling-principles.md
  - stages/inception/artifacts/risk-inventory.md
  - stages/inception/artifacts/open-questions-with-defaults.md
  - >-
    .haiku/intents/autonomous-report-to-fix/stages/inception/artifacts/privacy-and-data-handling-principles.md
  - >-
    .haiku/intents/autonomous-report-to-fix/stages/inception/artifacts/risk-inventory.md
  - >-
    .haiku/intents/autonomous-report-to-fix/stages/inception/artifacts/open-questions-with-defaults.md
  - website/content/pages/privacy.md
outputs:
  - >-
    .haiku/intents/autonomous-report-to-fix/stages/design/artifacts/privacy-policy-delta.md
quality_gates:
  - name: artifact-exists
    command: >-
      test -s
      .haiku/intents/autonomous-report-to-fix/stages/design/artifacts/privacy-policy-delta.md
  - name: has-required-sections
    command: >-
      grep -q '^## Replacement copy'
      .haiku/intents/autonomous-report-to-fix/stages/design/artifacts/privacy-policy-delta.md
      && grep -q '^## What changed'
      .haiku/intents/autonomous-report-to-fix/stages/design/artifacts/privacy-policy-delta.md
      && grep -q '^## CI gate'
      .haiku/intents/autonomous-report-to-fix/stages/design/artifacts/privacy-policy-delta.md
      && grep -q '^## Sign-off status'
      .haiku/intents/autonomous-report-to-fix/stages/design/artifacts/privacy-policy-delta.md
  - name: names-anthropic-secondary-recipient
    command: >-
      grep -qE 'Anthropic'
      .haiku/intents/autonomous-report-to-fix/stages/design/artifacts/privacy-policy-delta.md
  - name: discloses-retention-window
    command: >-
      grep -qE '30.day|30 day|thirty.day|retention period'
      .haiku/intents/autonomous-report-to-fix/stages/design/artifacts/privacy-policy-delta.md
  - name: discloses-deletion-mechanism
    command: >-
      grep -qiE 'deletion request|delete.*request|right to erasure|deletion
      mechanism'
      .haiku/intents/autonomous-report-to-fix/stages/design/artifacts/privacy-policy-delta.md
  - name: discloses-irreversibility
    command: >-
      grep -qiE 'irreversib|cannot be
      recall|already.*processed.*Anthropic|once.*transmitted'
      .haiku/intents/autonomous-report-to-fix/stages/design/artifacts/privacy-policy-delta.md
  - name: replaces-unconditional-claim
    command: >-
      [ "$(grep -c 'None of that data is sent to GigSmart servers'
      .haiku/intents/autonomous-report-to-fix/stages/design/artifacts/privacy-policy-delta.md)"
      -le 1 ]
  - name: ci-gate-condition-stated
    command: >-
      awk '/^## CI gate/{found=1; next} found && /^## /{exit} found'
      .haiku/intents/autonomous-report-to-fix/stages/design/artifacts/privacy-policy-delta.md
      | grep -qE 'grep|None of that data is sent'
status: active
bolt: 1
hat: designer-prep
started_at: '2026-05-08T17:53:29Z'
hat_started_at: '2026-05-08T17:53:29Z'
iterations:
  - hat: designer-prep
    started_at: '2026-05-08T17:53:29Z'
    completed_at: null
    result: null
---
# Privacy Policy Update Copy + CI Gate Spec

## Topic

Specify the exact replacement copy for `website/content/pages/privacy.md` covering the `/haiku:report` data transmission model, AND specify the CI gate condition that prevents the feature from merging until the policy update is live. The current privacy page contains the unconditional claim `"None of that data is sent to GigSmart servers"` — that becomes false the moment the report-to-fix loop ships. Inception named the policy update as a hard launch blocker, so this is design-stage work, not deferred.

## Why this is its own unit

The privacy policy update is a launch-blocking deliverable that none of the existing three units (skill conversation, landing wireframes, GitHub templates) produces. Without this unit, the design stage hands off to product/development with the launch blocker still ungated. The deliverable is markdown copy — same medium as unit-03, but unrelated content (legal/policy text, not bot-output template), so it belongs in its own unit. Treating it as its own unit also lets the CI gate spec sit alongside the copy, so the build hat sees both together when implementing.

## Completion criteria

The artifact at `.haiku/intents/autonomous-report-to-fix/stages/design/artifacts/privacy-policy-delta.md` MUST contain:

### `## Replacement copy`

The exact paragraph(s) that replace the existing language in `website/content/pages/privacy.md`. This is the actual policy text that ships — not principle-level prose. The replacement MUST:

- Preserve the ambient no-transmission baseline ("By default, no data is sent to GigSmart servers …") for every existing surface that doesn't transmit.
- Carve out `/haiku:report` as the explicit user-initiated exception, naming the skill, naming what triggers the transmission (the user firing the slash command and confirming), and what the user sees before transmission.
- Describe the bundle contents at a level the user can reason about: the session JSONL transcript, subagent transcripts traced via `parent_uuid`, and the relevant `.haiku/intents/{slug}/` tree.
- Name the scrubbing scope: secrets, environment variable values, absolute home paths (`/Users/...`, `/home/...`), API tokens, IP addresses. State that scrubbing is best-effort and conservative-on-uncertainty.
- Disclose the **Anthropic secondary transmission**: the bundle is consumed as input to an Anthropic API call running in GigSmart's Cloud Run environment; the literal token "Anthropic" MUST appear in the copy.
- State the **retention window**: GigSmart's Cloud Run service retains the bundle for 30 days, after which it is deleted from GigSmart-controlled storage. The phrase "30 day" or "30-day" or "thirty-day" or "retention period" MUST appear.
- Disclose the **irreversibility carve-out**: once the bundle has been consumed by Anthropic as a prompt, the data may persist in Anthropic's systems independent of GigSmart's retention window, and GigSmart cannot fulfill a deletion request on the user's behalf for that copy. The phrase "irreversib", "cannot be recalled", "once transmitted", or equivalent MUST appear.
- Describe the **deletion request mechanism**: how a user requests deletion of their bundle from GigSmart (email address, in-app form, support channel — name one concrete mechanism). The phrase "deletion request", "right to erasure", or "deletion mechanism" MUST appear.

The copy MUST NOT contain the verbatim string `None of that data is sent to GigSmart servers` outside of the "What changed" section's quote of the prior text. The gate counts occurrences and refuses ≥ 2 (one quoted reference is permitted; two means the unconditional claim survived).

### `## What changed`

A bullet-list diff narrative: each prior policy claim that's been changed, with the old quoted text and a one-line reason. Includes the unconditional "None of that data is sent" claim as the load-bearing change.

### `## CI gate`

A grep-pattern specification for a CI build script that fails when:

- The policy page (`website/content/pages/privacy.md`) still contains the verbatim string `None of that data is sent to GigSmart servers`, AND
- Any file under the `/haiku:report` feature surface is present (e.g., the new MCP tool file, the report-agent service files, the `/report/[fix_id]` route).

The gate MUST be expressible as a shell command — give the literal `grep` invocation the build script will run.

### `## Sign-off status`

A subsection naming whether legal sign-off has been obtained on the replacement copy. Inception flagged legal review as "needs human escalation"; if sign-off is pending, this section MUST flag the pending review and state that the feature MUST NOT merge until sign-off is recorded. If sign-off is obtained, cite the sign-off (date + signing party).

## Constraints

- The copy MUST be in plain English, written for the existing audience of the privacy page (the existing page uses second-person "you" and short paragraphs — match the tone).
- The copy MUST be no longer than necessary: the existing privacy page is concise and pragmatic, not legalese. Stay under 400 words for the new section.
- The copy MUST NOT speculate on Anthropic's retention behavior beyond the disclosed irreversibility (we don't claim Anthropic retains forever; we claim we can't guarantee deletion of the secondary copy).

## Out of scope

The unit does NOT specify the implementation of the deletion request mechanism (operations stage owns that — it might be an email form, a Cloud Run endpoint, etc.). It specifies what the policy page promises; another stage builds the system that fulfills the promise.

The unit does NOT specify the legal review process or the sign-off ceremony — only that legal sign-off must be recorded before the feature merges.
