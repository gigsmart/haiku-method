# Elaboration Notes — unit-01-cowork-env-probe

Elaborator hat output. Captures the refinements made to the unit spec after folding in the researcher's `cowork-env-contract.md`.

## Changes applied to unit-01-cowork-env-probe.md

- Added `model: sonnet` — unit involves a known pattern (new helper in `state-tools.ts`) with one judgment call (tolerant separator parsing). Not architectural, not mechanical.
- Added the researcher artifact to `inputs:`.
- Called out the two pre-existing touchpoints so the implementer reuses them instead of rebuilding:
  - `packages/haiku/src/hooks/inject-state-file.ts:21` — already forwards `CLAUDE_CODE_IS_COWORK`; must extend the same `vars` list to forward `CLAUDE_CODE_WORKSPACE_HOST_PATHS`.
  - `packages/haiku/src/sentry.ts:24-25` — reads `sessionCtx.CLAUDE_CODE_IS_COWORK` for tagging; must not break.
- Replaced the vague `isCoworkHost()` truthiness with "any non-empty value is true" per researcher note that Cowork may not always set `"1"` exactly.
- **Unknown separator is now a first-class constraint.** Spec requires `getCoworkWorkspacePaths()` to parse both `:` and `;` until Cowork docs confirm. Criterion 3 locks this with a test.
- **`request_cowork_directory` shape is unknown.** Instead of pinning a call surface we can't verify, the spec requires a `requestCoworkDirectory()` indirection with a single call site. When unit-02 (timeout spike) or a later refine confirms the real shape, only the indirection body changes.

## Completion criteria — why each is verifiable

Every criterion now maps to a specific command or test assertion:

1. Export shape → `rg` count.
2. Env forwarding → `rg` hit + context read.
3. Separator handling → fixture test, runner exit 0.
4. Truthy variants → parameterized test assertions.
5. Handshake gating → mock + call-count assertion.
6. Write ordering → call-index assertion (handshake before first `.haiku/` write).
7. Non-Cowork parity → existing suite runs unchanged, `git diff` addition-only.
8. Sentry → grep confirms the reference is intact.
9. VALIDATION.md section → `rg` for the heading.
10. Scope firewall → `git diff --name-only` must **not** include transport/UI files.

## Scope firewall

This unit must not touch: `server.ts`, `orchestrator.ts`, `http.ts`, `tunnel.ts`, `packages/haiku/src/templates/**`. Criterion 10 enforces this with a diff check. Downstream units (03, 04, 05) own those surfaces.

## Deferred to later units or refines

- Real call shape of `request_cowork_directory` (reverse-tool vs elicitation vs JSON-RPC).
- Canonical separator for `CLAUDE_CODE_WORKSPACE_HOST_PATHS`.
- Cowork capability/version flag for feature detection.
- Whether the env var is re-read after handshake or returned inline.

These are all hidden behind indirections in unit-01, so none block the planner/builder from starting.
