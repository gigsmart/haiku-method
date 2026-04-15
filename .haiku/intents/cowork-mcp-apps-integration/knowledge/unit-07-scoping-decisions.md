# Unit 07 Scoping Decisions (elaborator)

Decisions locked in during elaboration, derived from the researcher's `inventory.md`.

## Surfaces confirmed clean (MUST NOT touch)

- `packages/haiku/src/**` — 0 hits (runtime tool already removed in prior work).
- `website/content/**` — 0 hits.
- `packages/haiku/VALIDATION.md` — file does not exist.

These are excluded from the builder's editing surface. Any diff under these paths is a scope violation.

## Edit surface

- **`.haiku/intents/` — 11 files** enumerated in `inventory.md` table (current intent store).
- **`.ai-dlc/` — 8 files** enumerated in `inventory.md` table (legacy mirror; expect duplicate edits).

Total files to touch: 19. Total hits to resolve: 28 (33 inventory hits minus the 5 self-referential hits kept on purpose).

## Self-referential exclusions (MUST NOT remove)

- `CHANGELOG.md` — 1 hit describing this cleanup.
- `.haiku/intents/cowork-mcp-apps-integration/stages/inception/units/unit-07-get-review-status-doc-scrub.md` — 4 hits describing the task itself.

The final verification grep MUST exclude these two paths rather than expect a globally-empty result. Pattern:

```bash
rg -n 'get_review_status' . \
  --glob '!CHANGELOG.md' \
  --glob '!**/unit-07-get-review-status-doc-scrub.md'
```

Expected exit code: 1 (zero hits in the scoped surface).

## Rewrite vs. delete rule

- If a hit is a bare tool name / bullet, delete the line.
- If a hit sits inside a polling-loop description, rewrite the surrounding context to describe the current **blocking review-gate flow**: a single blocking tool call, no polling, no status probing. Reader context must survive.

Doc-review spot check is a completion criterion — the replacement prose MUST accurately describe the blocking flow, not just scrub the tool name.

## Model assignment

`haiku` — mechanical copy-paste-adapt across a closed, enumerated file list with no design judgment. No architectural decisions, no cascading failure risk. The scoping decisions live here in the spec; the builder just applies them.
