---
title: 'Skill /haiku:burn and SPA delivery surface'
model: sonnet
inputs:
  - intent.md
  - knowledge/API-SURFACE.md
  - knowledge/DISCOVERY.md
status: pending
---
# Skill `/haiku:burn` and SPA delivery surface

The agent-facing entry point for token-spend analysis is the slash command `/haiku:burn`. The command is a skill (per the `plugin/skills/<name>.md` convention used by `/haiku:start`, `/haiku:dashboard`, `/haiku:capacity`, etc.) that calls `haiku_token_spend` and renders the response as an interactive SPA page in the user's browser, rather than returning raw JSON to the conversation.

This unit pins three contracts: the skill name, the skill behavior (including error rendering for every Stable error code), and the SPA route the skill opens.

## Skill behavior

1. Resolve the active intent. Same rule as `/haiku:dashboard` and `haiku_review_open` — auto-resolve via the current git branch (`haiku/<slug>/main` or `haiku/<slug>/<stage>`), fall back to the single-active-intent detection, error with `intent_unresolvable` (per api-surface error model) when no branch match exists and zero or multiple intents are active.
2. Call `haiku_token_spend { intent }`. Optional pass-throughs: `since`, `until`, `project_slug`, mirroring the api-surface input schema. The skill exposes those via shell-style flags on the slash command (e.g. `/haiku:burn --since 2026-05-01`).
3. Hand the structured response to the SPA server (no chat-side rendering of large JSON blobs).
4. Print the SPA URL to the chat so the user can re-open it later, AND attempt to auto-open the browser via the existing dev-spa launch convention.

## Error handling

When `haiku_token_spend` returns `isError: true`, the skill prints the human-readable `content[0].text` to chat and exits without opening the SPA. The raw `structuredContent.error.code` is never printed to the chat — the error code is for programmatic consumers; humans get the message text. Per-code rendering rules:

| Code | Skill behavior |
|---|---|
| `intent_unresolvable` | Print message text + list `details.candidates` (active intent slugs) so the user can pick one and re-run with `--intent <slug>`. |
| `intent_not_found` | Print message text. Suggest running `/haiku:dashboard` to see active intents. |
| `invalid_slug` | Print message text. The user must fix the slug (likely contained `/` or `..`). |
| `invalid_window` | Print message text. The user must fix the `--since` / `--until` ISO 8601 timestamps. |
| `project_logs_missing` | Print message text. Suggest passing `--project-slug` explicitly when running in a worktree where cwd doesn't map to the originating project root. |
| `no_events_in_window` | Print message text. This is not a hard failure — the report just has nothing to render — so the skill suggests widening the window or running with telemetry on. |
| `internal` | Print message text. Suggest re-running and reporting the issue if it persists. |
| Unknown code | Treat as `internal` for rendering — print message text, suggest re-running. (Per api-surface §Semver Policy, new codes can land non-breakingly.) |

## SPA route contract

- Route: `/intents/{slug}/burn` (singular `intents`, mirroring the existing review UI route layout under `packages/haiku/src/server/`).
- Server: served by the same Fastify instance the review UI already runs on; no new HTTP daemon, no new port. The server is started lazily on first SPA-bearing tool call (same pattern as `haiku_review_open`).
- Bundle: the SPA bundle ships inside `plugin/bin/haiku.mjs`, built by `packages/haiku/scripts/bundle-haiku-ui.mjs` and inlined into `packages/haiku/src/haiku-ui-html.ts`. No second binary, no separate `dist/`.
- Content sections (one per breakdown axis api-surface defines): a summary header (intent slug + window + coverage banner), `totals` card, `by_origin` table (3 rows: user/agent/engine), `by_tick` table, `by_stage` table, `by_hat` table, `by_subagent` table with collapsible per-dispatch detail (parent vs subagent split), `by_model` table.
- Coverage diagnostic from `coverage.subagent_correlation` surfaced as a banner above the totals card when the value is `partial` or `none` — never silently dropped.
- Every table row renders a single `SpendBucket` shape (four token counters + total + message_count), matching the api-surface contract; one renderer component handles every breakdown.
- The `by_tick[].action` field renders with friendly labels for the 13 Stable display anchors named in api-surface (`elaborate`, `execute`, `review_fix`, `gate`, etc.) and falls through to "other" for unknown action strings — matching the api-surface non-breaking-change rule for new orchestrator actions.

## Auto-open behavior

- On macOS: `open <url>`. On Linux: `xdg-open <url>` if available, otherwise no-op.
- Auto-open is best-effort. Failure of the open command is non-fatal — the URL is always printed to the chat regardless. The user can copy/paste if the harness blocks subprocess launches.

## Stability tier

- The skill name `/haiku:burn` is **Stable** — also reflected in api-surface §Stability Tiers. Renaming is a breaking change in the same sense `/haiku:dashboard` would be.
- The SPA route path `/intents/{slug}/burn` is **Stable** — also in api-surface §Stability Tiers. Query-string filters (`?since=…`, `?until=…`) mirror the tool input and are **Stable**.
- The visual layout of the SPA — table column order, color choices, header copy — is **not** Stable. UI iteration does not require a major version bump.
- The error-message text for any error code is best-effort and not Stable. Skill rendering of error codes (which code shows which UI element) IS Stable per the table above.

## Open questions

- Should the skill block the chat until the SPA has rendered server-side, or print the URL immediately and let the browser load? **Proposed default:** print URL immediately; the SPA self-loads from the response cached in the server's process memory by intent slug. Veto-able.
- Should the SPA support deep-linking to a specific section (e.g. `/intents/{slug}/burn#by_hat`)? **Proposed default:** yes, anchor-link per top-level section. Veto-able.
- Should `/haiku:burn` accept multiple intents in one call (`/haiku:burn intent-a intent-b`)? **Proposed default:** no — single-intent only in v1; cross-intent rollups are an explicit non-goal in the discovery artifact. Veto-able.

## Completion criteria

- §"Skill behavior" enumerates the four steps with no `TBD` / `etc.` placeholders, and names the resolution rule + the api-surface input fields the skill forwards.
- §"Error handling" enumerates the rendering rule for all seven Stable error codes plus the unknown-code fall-through, in a table.
- §"SPA route contract" names the route path, the server (Fastify reused from review UI), the bundle path (`plugin/bin/haiku.mjs` via `bundle-haiku-ui.mjs`), and lists every required content section including `by_origin` and `by_tick`.
- §"Stability tier" classifies the skill name, SPA route, error-rendering rule as Stable; the visual layout and message text as not Stable; with one-sentence rationale per call.
- §"Open questions" lists every deferred decision; each entry has a proposed default for veto-style approval OR `(needs human escalation)`.
