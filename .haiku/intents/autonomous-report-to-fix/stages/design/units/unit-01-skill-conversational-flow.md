---
title: Skill conversational flow specification
model: sonnet
depends_on: []
inputs:
  - intent.md
  - knowledge/DISCOVERY.md
  - knowledge/DESIGN-BRIEF.md
  - knowledge/DESIGN-SYSTEM-ANCHOR.md
  - stages/inception/artifacts/affected-surfaces-and-user-flow.md
  - stages/inception/artifacts/success-criteria-and-acceptance-shape.md
  - stages/inception/artifacts/open-questions-with-defaults.md
  - >-
    .haiku/intents/autonomous-report-to-fix/stages/inception/artifacts/affected-surfaces-and-user-flow.md
  - >-
    .haiku/intents/autonomous-report-to-fix/stages/inception/artifacts/success-criteria-and-acceptance-shape.md
  - >-
    .haiku/intents/autonomous-report-to-fix/stages/inception/artifacts/open-questions-with-defaults.md
  - plugin/skills/report/SKILL.md
outputs:
  - >-
    .haiku/intents/autonomous-report-to-fix/stages/design/artifacts/skill-conversational-flow.md
quality_gates:
  - name: artifact-exists
    command: >-
      test -s
      .haiku/intents/autonomous-report-to-fix/stages/design/artifacts/skill-conversational-flow.md
  - name: has-required-sections
    command: >-
      grep -q '^## Turn-by-turn flow'
      .haiku/intents/autonomous-report-to-fix/stages/design/artifacts/skill-conversational-flow.md
      && grep -q '^## State machine'
      .haiku/intents/autonomous-report-to-fix/stages/design/artifacts/skill-conversational-flow.md
      && grep -q '^## Branch points'
      .haiku/intents/autonomous-report-to-fix/stages/design/artifacts/skill-conversational-flow.md
      && grep -q '^## Error handling'
      .haiku/intents/autonomous-report-to-fix/stages/design/artifacts/skill-conversational-flow.md
  - name: turn-count
    command: >-
      [ "$(awk '/^## Turn-by-turn flow/{found=1; next} found && /^## /{exit}
      found && /^### Turn /{count++} END{print count+0}'
      .haiku/intents/autonomous-report-to-fix/stages/design/artifacts/skill-conversational-flow.md)"
      -ge 4 ]
  - name: branch-points-named
    command: >-
      awk '/^## Branch points/{found=1; next} found && /^## /{exit} found'
      .haiku/intents/autonomous-report-to-fix/stages/design/artifacts/skill-conversational-flow.md
      | grep -ciE 'oauth|skip|abandon|cancel|empty input|too large' | awk '{exit
      ($1>=3)?0:1}'
status: pending
---
# Skill Conversational Flow Specification

## Topic

Specify the user-observable conversation `/haiku:report` runs in Claude Code from the moment the user types the slash command until the skill returns control. This is the *script*: what the assistant says, what the user types, what the system does between turns, and where the conversation can branch (cancel, skip-OAuth, malformed input, oversized bundle). Wireframes don't apply — the medium is plain text in a terminal-style chat — so the deliverable is a turn-by-turn flow doc plus a state machine.

## Why this is its own unit

The skill is one of three user-facing surfaces (skill, web landing, GitHub bot output) and the only conversational one. Treating it as a unit means the *content of what the assistant says* gets the same review attention as the visual surfaces — including tone, what gets disclosed before the bundle leaves the user's machine, and where the user can opt out. Mixing it into the landing-page unit would conflate two media that have nothing in common. Mixing it into the GitHub-template unit would conflate input-side text (skill prompts) with output-side text (issue/PR body).

## Completion criteria

The artifact at `.haiku/intents/autonomous-report-to-fix/stages/design/artifacts/skill-conversational-flow.md` MUST contain:

- A `## Turn-by-turn flow` section with at least four `### Turn N:` subsections covering the canonical happy path: problem collection → summary confirmation → bundle manifest disclosure → submission result. Each turn states (a) what the assistant says (verbatim or template with named variables), (b) what the user input shape is, (c) what the system does between this turn and the next.
- A `## State machine` section enumerating the conversational states (initial / collecting / awaiting-confirmation / disclosing-bundle / submitting / submitted / aborted / error) and the events that transition between them, citing the user-flow state-machine artifact from inception.
- A `## Branch points` section naming at least three off-happy-path branches and what the assistant says for each: OAuth-skipped path, user-aborts-at-confirmation path, oversized-bundle path. Each branch is a deviation observable in the chat transcript, not an internal-only check.
- An `## Error handling` section covering: scrubber failure (the bundle would leak), Cloud Run unreachable, fix-id collision, network timeout. Each entry states the assistant's user-facing message and whether the conversation can be retried in-place or must restart.
- All assistant text obeys the project voice rules — direct, no emojis unless the rules demand them elsewhere, no formal greetings, no time estimates. The text MUST cite (`*([VOICE-RULE: …](path)*` or similar) where it derives a non-obvious tone choice.
- Every turn references the design system anchor's tone for inline links (e.g. how URLs render in Claude Code output) since the assistant emits markdown.

The artifact MUST NOT specify visual styling, breakpoints, or HTML — those are not applicable to terminal conversation. The artifact MUST NOT prescribe the MCP tool surface for `haiku_report` (that's the development stage's job); it specifies the *user-visible* contract only.

## Why this stage and not product

Product would specify *what* the skill collects (the requirements). Design specifies *how the conversation feels* — turn cadence, what's disclosed before the bundle leaves the machine, where the user can back out. The design brief already enumerates the four states; this unit is the per-turn elaboration the build hat will implement against.
