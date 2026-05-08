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
  - .haiku/intents/autonomous-report-to-fix/knowledge/DESIGN-SYSTEM-ANCHOR.md
  - knowledge/DESIGN-SYSTEM-ANCHOR.md
quality_gates:
  - name: artifact-exists
    command: >-
      test -s
      .haiku/intents/autonomous-report-to-fix/stages/design/artifacts/skill-conversational-flow.md
  - name: has-required-sections
    command: >-
      grep -q '^## Dependencies'
      .haiku/intents/autonomous-report-to-fix/stages/design/artifacts/skill-conversational-flow.md
      && grep -q '^## Turn-by-turn flow'
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
  - name: fix_id-naming-correct
    command: >-
      [ "$(grep -c 'fix_id'
      .haiku/intents/autonomous-report-to-fix/stages/design/artifacts/skill-conversational-flow.md)"
      -ge 3 ] && [ "$(grep -c 'fix-id'
      .haiku/intents/autonomous-report-to-fix/stages/design/artifacts/skill-conversational-flow.md)"
      = '0' ]
  - name: submitted-turn-cites-spa-url
    command: >-
      grep -qE 'haikumethod\.ai/report/'
      .haiku/intents/autonomous-report-to-fix/stages/design/artifacts/skill-conversational-flow.md
  - name: dependencies-cites-option-b
    command: >-
      awk '/^## Dependencies/{found=1; next} found && /^## /{exit} found'
      .haiku/intents/autonomous-report-to-fix/stages/design/artifacts/skill-conversational-flow.md
      | grep -qiE 'option b|pause-and-confirm'
status: active
bolt: 1
hat: designer-prep
started_at: '2026-05-08T17:53:20Z'
hat_started_at: '2026-05-08T17:53:20Z'
iterations:
  - hat: designer-prep
    started_at: '2026-05-08T17:53:20Z'
    completed_at: '2026-05-08T17:55:20Z'
    result: advance
  - hat: designer
    started_at: '2026-05-08T17:55:20Z'
    completed_at: null
    result: null
---
# Skill Conversational Flow Specification

## Topic

Specify the user-observable conversation `/haiku:report` runs in Claude Code from the moment the user types the slash command until the skill returns control. This is the *script*: what the assistant says, what the user types, what the system does between turns, and where the conversation can branch (cancel, skip-OAuth, malformed input, oversized bundle). Wireframes don't apply — the medium is plain text in a terminal-style chat — so the deliverable is a turn-by-turn flow doc plus a state machine.

## Why this is its own unit

The skill is one of three user-facing surfaces (skill, web landing, GitHub bot output) and the only conversational one. Treating it as a unit means the *content of what the assistant says* gets the same review attention as the visual surfaces — including tone, what gets disclosed before the bundle leaves the user's machine, and where the user can opt out. Mixing it into the landing-page unit would conflate two media that have nothing in common. Mixing it into the GitHub-template unit would conflate input-side text (skill prompts) with output-side text (issue/PR body).

## Dependencies

This unit's turn-by-turn flow assumes **Option B (pause-and-confirm before POST)** from `stages/inception/artifacts/open-questions-with-defaults.md` § "Should the consent UX pause for explicit user confirmation before POST". That question was flagged "needs human escalation" in inception. Before the artifact ships, confirm the decision is resolved — either via a product-stage gate or an explicit sign-off recorded in the design brief. If Option A is chosen instead (scrub-and-notify after POST), the `awaiting-confirmation` and `disclosing-bundle` states and the "user-aborts-at-confirmation" branch point in the artifact must be removed; the turn-by-turn flow collapses from four turns to three.

## Completion criteria

The artifact at `.haiku/intents/autonomous-report-to-fix/stages/design/artifacts/skill-conversational-flow.md` MUST contain:

- A `## Dependencies` section that names Option B as the operating assumption, cites the inception open-questions artifact, and states the rewrite implication if Option A is chosen instead.
- A `## Turn-by-turn flow` section with at least four `### Turn N:` subsections covering the canonical happy path: problem collection → summary confirmation → bundle manifest disclosure → submission result. Each turn states (a) what the assistant says (verbatim or template with named variables), (b) what the user input shape is, (c) what the system does between this turn and the next.
- The `submission result` turn (final turn) MUST include the URL `haikumethod.ai/report/{{fix_id}}` so the user can navigate to the SPA, AND MUST use vocabulary aligned with the SPA's `status` content-state language (e.g., "Your report is being processed" rather than "Submitted successfully") so the user does not encounter a state-name mismatch when crossing from terminal to browser.
- A `## State machine` section enumerating the conversational states (`initial` / `collecting` / `awaiting-confirmation` / `disclosing-bundle` / `submitting` / `submitted` / `aborted` / `error`) and the events that transition between them, citing the user-flow state-machine artifact from inception.
- A `## Branch points` section naming at least three off-happy-path branches and what the assistant says for each: OAuth-skipped path, user-aborts-at-confirmation path, oversized-bundle path. Each branch is a deviation observable in the chat transcript, not an internal-only check.
- An `## Error handling` section covering: scrubber failure (the bundle would leak), Cloud Run unreachable, fix_id collision, network timeout. Each entry states the assistant's user-facing message and whether the conversation can be retried in-place or must restart.
- All identifier references use `fix_id` (underscored snake_case) consistently — never `fix-id` (hyphenated). The single exception is when quoting the route path the SPA renders, which Next.js convention writes as `[fix_id]`.
- All assistant text obeys the project voice rules — direct, no emojis unless the rules demand them elsewhere, no formal greetings, no time estimates. The text MUST cite (`*[VOICE-RULE: …](path)*` or similar) where it derives a non-obvious tone choice.
- Every turn references the design system anchor's tone for inline links (e.g. how URLs render in Claude Code output) since the assistant emits markdown.

The artifact MUST NOT specify visual styling, breakpoints, or HTML — those are not applicable to terminal conversation. The artifact MUST NOT prescribe the MCP tool surface for `haiku_report` (that's the development stage's job); it specifies the *user-visible* contract only.

## Why this stage and not product

Product would specify *what* the skill collects (the requirements). Design specifies *how the conversation feels* — turn cadence, what's disclosed before the bundle leaves the machine, where the user can back out. The design brief already enumerates the four states; this unit is the per-turn elaboration the build hat will implement against.
