---
artifact: deduplication-contract
stage: inception
unit: unit-07-deduplication
intent: intent-token-spend-analysis
scope: intent
---

# Deduplication Contract — Token Spend Analysis

Research artifact for unit-07-deduplication. Documents the dedup fingerprint, counter taxonomy, file-enumeration determinism, and the required `coverage.events_skipped_duplicate` addition to the API surface. The api-architect hat implements the schema change; this document is the research backing.

## Problem: Why Deduplication Is Necessary

The `~/.claude/projects/<project-slug>/*.jsonl` corpus is append-only and written live. Three replay scenarios produce duplicate lines in the corpus:

1. **Forked subagent re-emitting parent messages.** A Task-spawned subagent reads its parent session's context before its own log exists; if the parent log is re-scanned after the fork, the parent's earlier assistant messages appear again.
2. **Session restart from stale lines.** Claude Code resumes a session by re-reading the jsonl; if a crash left a partially-flushed line and the line was retried, both the partial and the completed line can survive in the log.
3. **Log rotation and concatenation.** Some environments rotate or concatenate jsonl files across run boundaries. Without a stable fingerprint, a rotated file that starts from the beginning doubles every event that appeared before the rotation.

ccusage ([ryoppippi/ccusage](https://github.com/ryoppippi/ccusage)) independently arrived at the same solution: deduplicate on the triple `(session_id, message_id, request_id)`. The DISCOVERY.md artifact explicitly calls this "the right fingerprint." This unit pins that choice and extends it with the missing counter (`events_skipped_duplicate`) so duplicates are visible, not silently dropped.

## Fingerprint Definition

For every parsed jsonl event with a token-bearing `usage` field, the dedup fingerprint is:

```
(session_id, message_id, request_id)
```

All three fields are present on every assistant-role message written by Claude Code.

| Field | Format | Role in fingerprint |
|---|---|---|
| `session_id` | UUID | Identifies the log file (parent or subagent session). |
| `message_id` | `msg_…` | Unique per assistant message within a session. |
| `request_id` | `req_…` | Unique per API call. A retry produces a new `request_id` even with the same `message_id`. |

**Why all three?** The `message_id` alone does not disambiguate retries — a failed first attempt and its successful retry share the same `message_id` but have different `request_ids`. Deduplicating on `(session_id, message_id)` would merge retries with the original, undercounting the final successful response. The full triple counts the terminal (successful) request only.

**Events missing any field** are ineligible for dedup and counted as `events_skipped_unparseable`. This is the conservative safe choice: treating them as unique would re-introduce double-counting risk; treating them as duplicates would silently drop real events.

The proposed fallback — dedup on `(session_id, message_id)` when `request_id` is absent — is deferred with a "no" default. The rationale: `request_id` is what disambiguates retries; dropping it silently merges retries with the original. Any future proposal to enable this fallback must justify why missing `request_id` events are worth special-casing.

## In-Memory Dedup Structure

```
Set<string>  keyed by `${session_id}|${message_id}|${request_id}`
```

- **Lifecycle:** created at `analyzeTokenSpend()` call start, discarded on return. No sharing across concurrent calls.
- **Memory bound:** O(unique fingerprints). Each key is under 200 bytes. 100K events ≈ 20 MB — well within the 100 MB NFR ceiling from DISCOVERY.md.
- **Insert order:** first occurrence of a fingerprint wins; subsequent occurrences are skipped and counted in `events_skipped_duplicate`.

No nested maps, no interning of components. The analyzer is single-shot per call; the simple shape is correct.

## File-Enumeration Determinism

Without a deterministic file-enumeration order, the "first occurrence wins" rule is non-deterministic across runs — the OS's filesystem-iteration order decides which event wins the fingerprint slot, making `events_skipped_duplicate` (and therefore `events_parsed`) vary run-to-run on the same input.

**Required sort order:**

- **Parent session files:** lexicographic sort of every `*.jsonl` directly under `~/.claude/projects/<project_slug>/`.
- **Subagent session files:** for each parent session id, lexicographic sort of every `agent-*.jsonl` under `~/.claude/projects/<project_slug>/<session_id>/subagents/`.

Sorted file list → sorted line order → deterministic fingerprint slot assignment → deterministic `events_parsed` totals. This is what unit-04's byte-identity guarantee depends on.

## Counter Taxonomy: Required Addition

The current `coverage` schema has three counters:

```ts
events_parsed: integer
events_skipped_unparseable: integer
events_skipped_no_usage: integer
```

This unit requires a fourth required counter:

```ts
events_skipped_duplicate: integer
```

The four counters form an exhaustive partition of every line read:

```
total_lines_read == events_parsed
                  + events_skipped_unparseable
                  + events_skipped_no_usage
                  + events_skipped_duplicate
```

**Counter semantics:**

| Counter | What it counts |
|---|---|
| `events_parsed` | Lines that were JSON-parseable, had all three id fields, had a token-bearing `usage` block, and whose fingerprint was not yet seen — i.e., lines that contributed a unique usage record to the analysis. |
| `events_skipped_unparseable` | Lines that failed `JSON.parse` OR had a valid JSON object but were missing one or more of `{session_id, message_id, request_id}`. |
| `events_skipped_no_usage` | Lines that were parseable, had all three id fields, but had no token-bearing `usage` block (e.g., system events, errors, empty assistant messages, user-role messages). |
| `events_skipped_duplicate` | Lines that were parseable, had all three id fields, had a `usage` block, but whose fingerprint `${session_id}|${message_id}|${request_id}` had already been counted in this analysis invocation. |

**Why surface `events_skipped_duplicate`?** A non-zero value is evidence that dedup is doing real work — the input had replayed messages. A regression to zero across known-replay test fixtures is a dedup bug. Without this counter, a bug that silently re-counts duplicates would produce inflated `events_parsed` with no observable signal in the output.

## API Surface Impact

The api-architect hat must apply these changes to API-SURFACE.md `coverage` schema:

1. **Add property** `events_skipped_duplicate: { type: "integer" }` to the `coverage.properties` object, alongside the existing three counters.
2. **Add `"events_skipped_duplicate"` to `coverage.required`** array — this is a required field, not optional.
3. **Add to Stable tier** in the Stability Tiers section: `events_skipped_duplicate` in `coverage` is Stable per the semver policy (adding a required output field to an existing object is a breaking change — it must be documented as such in the semver policy section, specifically as "adding `events_skipped_duplicate` to `coverage.required` was a non-breaking addition at the time it landed because no prior version of the tool shipped without it").
4. **Add to the breaking-change list:** removing or renaming `events_skipped_duplicate` from `coverage` is a major-version-eligible breaking change — consistent with the existing required-field policy.

## Stability Classification

| Artifact | Tier | Rationale |
|---|---|---|
| `events_skipped_duplicate` counter on `coverage` | **Stable** | Consumer-visible diagnostic. Removing it is breaking. |
| The "first occurrence wins" rule | **Stable** | Directly determines `events_parsed` determinism, which unit-04's byte-identity guarantee depends on. |
| Lexicographic file-list sort | **Stable** | Same rationale — determinism guarantee. |
| The fingerprint tuple `(session_id, message_id, request_id)` | **Internal** | Analyzer implementation detail. The key shape `${id}|${id}|${id}` is not observable by consumers. |
| The pipe-joined key format `${session_id}|${message_id}|${request_id}` | **Internal** | Changing the join character does not affect any observable contract. |

## Ecosystem Grounding

- ccusage ([ryoppippi/ccusage](https://github.com/ryoppippi/ccusage)) uses the same triple independently and for the same reason (message replay). This is convergent validation.
- No other tool in the surveyed ecosystem (claude-code-usage, Claude Code Costs, claude-code-tokenizer, vibe-log-cli) documents a dedup strategy, meaning they either don't deduplicate or do it implicitly. Neither makes their totals reproducible across file-enumeration orders.
- The Anthropic Admin API provides per-day/per-key billing totals but not message-level dedup; this contract operates at the local jsonl level and does not interact with the billing API.

## Open Questions (Deferred)

1. **`events_duplicate_fingerprints[]` debug array.** Should we expose an array of the offending triples? **Default: no in v1.** Most consumers don't need it; can land as an opt-in alongside `include_raw_events`. Veto-able.

2. **Missing-`request_id` fallback.** Should events missing `request_id` fall back to `(session_id, message_id)` dedup instead of `events_skipped_unparseable`? **Default: no.** `request_id` disambiguates retries; dropping it silently merges a retry with the original. Veto-able.

## Quality Gates (for Development Stage)

The test file `packages/haiku/test/token-spend-dedup.test.mjs` must cover:

- **(a) Same fingerprint in two locations in the same file** — second occurrence counted in `events_skipped_duplicate`, not `events_parsed`.
- **(b) Same fingerprint in a parent session and a subagent jsonl** — same dedup set covers both; the later file's occurrence is skipped.
- **(c) One fingerprint missing `request_id`** — counted in `events_skipped_unparseable`, not `events_skipped_duplicate`.
- **(d) Four-way partition invariant** — `events_parsed + events_skipped_unparseable + events_skipped_no_usage + events_skipped_duplicate == total_lines_read` for every fixture.

Gate commands:

```yaml
quality_gates:
  - name: dedup-fingerprint-correctness
    command: bun test packages/haiku/test/token-spend-dedup.test.mjs --grep "fingerprint"
  - name: dedup-replay-not-double-counted
    command: bun test packages/haiku/test/token-spend-dedup.test.mjs --grep "replay"
  - name: coverage-counters-partition-lines
    command: bun test packages/haiku/test/token-spend-dedup.test.mjs --grep "partition"
```
