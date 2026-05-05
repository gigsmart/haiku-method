---
title: 'Skill /haiku:burn and SPA delivery surface'
model: sonnet
status: pending
---
# Skill `/haiku:burn` and SPA delivery surface

The agent-facing entry point for token-spend analysis is the slash command `/haiku:burn`. The command is a skill (per the `plugin/skills/<name>.md` convention used by `/haiku:start`, `/haiku:dashboard`, `/haiku:capacity`, etc.) that calls `haiku_token_spend` and renders the response as an interactive SPA page in the user's browser, rather than returning raw JSON to the conversation.

This unit pins three contracts: the skill name, the skill behavior, and the SPA route the skill opens.

## Skill behavior

1. Resolve the active intent. Same rule as `/haiku:dashboard` and `haiku_review_open` — auto-resolve via the current git branch (`haiku/<slug>/main` or `haiku/<slug>/<stage>`), fall back to the single-active-intent detection, error with `intent_unresolvable` (per api-surface error model) when no branch match exists and zero or multiple intents are active.
2. Call `haiku_token_spend { intent }`. Optional pass-throughs: `since`, `until`, `project_slug`, mirroring the api-surface input schema. The skill exposes those via shell-style flags on the slash command (e.g. `/haiku:burn --since 2026-05-01`).
3. Hand the structured response to the SPA server (no chat-side rendering of large JSON blobs).
4. Print the SPA URL to the chat so the user can re-open it later, AND attempt to auto-open the browser via the existing dev-spa launch convention.

## SPA route contract

- Route: `/intents/{slug}/burn` (singular `intents`, mirroring the existing review UI route layout under `packages/haiku/src/server/`).
- Server: served by the same Fastify instance the review UI already runs on; no new HTTP daemon, no new port. The server is started lazily on first SPA-bearing tool call (same pattern as `haiku_review_open`).
- Bundle: the SPA bundle ships inside `plugin/bin/haiku.mjs`, built by `packages/haiku/scripts/bundle-haiku-ui.mjs` and inlined into `packages/haiku/src/haiku-ui-html.ts`. No second binary, no separate `dist/`.
- Content sections (one per breakdown axis the api-surface defines): a summary header (intent slug + window + coverage banner), `totals` card, `by_stage` table, `by_hat` table, `by_subagent` table with collapsible per-dispatch detail (parent vs subagent split), `by_model` table. Per-tick and per-origin sections defined by their own units (02, 03) and slot in here as additional sections.
- Coverage diagnostic from `coverage.subagent_correlation` surfaced as a banner above the totals card when the value is `partial` or `none` — never silently dropped.
- Every table row renders a single `SpendBucket` shape (four token counters + total + message_count), matching the api-surface contract; one renderer component handles every breakdown.

## Auto-open behavior

- On macOS: `open <url>`. On Linux: `xdg-open <url>` if available, otherwise no-op.
- Auto-open is best-effort. Failure of the open command is non-fatal — the URL is always printed to the chat regardless. The user can copy/paste if the harness blocks subprocess launches.

## Stability tier

- The skill name `/haiku:burn` is **Stable**. Renaming is a breaking change in the same sense `/haiku:dashboard` would be.
- The SPA route path `/intents/{slug}/burn` is **Stable**. Query-string filters (`?since=…`, `?until=…`) mirror the tool input and are **Stable**.
- The visual layout of the SPA — table column order, color choices, header copy — is **not** Stable. UI iteration does not require a major version bump.

## Open questions

- Should the skill block the chat until the SPA has rendered server-side, or print the URL immediately and let the browser load? **Proposed default:** print URL immediately; the SPA self-loads from the response cached in the server's process memory by intent slug. Veto-able.
- Should the SPA support deep-linking to a specific section (e.g. `/intents/{slug}/burn#by_hat`)? **Proposed default:** yes, anchor-link per top-level section. Veto-able.
- Should `/haiku:burn` accept multiple intents in one call (`/haiku:burn intent-a intent-b`)? **Proposed default:** no — single-intent only in v1; cross-intent rollups are an explicit non-goal in the discovery artifact. Veto-able.

## Completion criteria

- §"Skill behavior" enumerates the four steps with no `TBD` / `etc.` placeholders, and names the resolution rule + the api-surface input fields the skill forwards.
- §"SPA route contract" names the route path, the server (Fastify reused from review UI), the bundle path (`plugin/bin/haiku.mjs` via `bundle-haiku-ui.mjs`), and lists every required content section.
- §"Stability tier" classifies the skill name and SPA route as Stable; the visual layout as not Stable; with one-sentence rationale per call.
- §"Open questions" lists every deferred decision; each entry has a proposed default for veto-style approval OR `(needs human escalation)`.
