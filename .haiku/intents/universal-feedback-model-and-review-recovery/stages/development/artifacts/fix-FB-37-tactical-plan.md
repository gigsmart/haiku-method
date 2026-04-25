# Fix FB-37 — Tactical Plan (planner, bolt 1)

**Finding:** `unit-01: auth.ts schema file declared as deliverable is missing from packages/haiku-api/src/schemas/`.
**Feedback:** `.haiku/intents/universal-feedback-model-and-review-recovery/stages/development/feedback/37-unit-01-auth-ts-schema-file-declared-as-deliverable-is-missi.md`

## TL;DR

The unit-01 spec (`unit-01-extract-haiku-api-package.md:83`) lists
`packages/haiku-api/src/schemas/auth.ts` as a required deliverable that
centralizes two transport concerns:

1. `TransportInvariantSchema` — broadened from today's single-variant
   `z.enum(["loopback"])` to the full `["loopback", "token"]` union so
   future token-based routes are "a schema edit, not a code archaeology
   project."
2. `SessionTokenSchema` — skeleton schema for future non-loopback
   deployments (`{ token, issued_at, expires_at? }`).

The builder shipped `RouteTransportSchema` inline in `schemas/common.ts:137-140`
with only `"loopback"`, skipped the file entirely, and never added a
`SessionToken` schema. The fix is mechanical file-extraction plus a
widening edit plus a skeleton schema plus one round-trip test. No
behavior change for existing callers — every live route keeps
`transport: "loopback"`.

## Root cause

Unit-01's spec section (lines 75-83) enumerates each `schemas/*.ts`
file by name. The builder produced seven of the eight files. `auth.ts`
slipped through; the reviewer's approval did not catch it. The existing
`RouteTransportSchema` was inlined into `common.ts` with a locked-down
`["loopback"]` enum — not the `["loopback", "token"]` union the spec
called for.

**Evidence (verified in the stage worktree, `packages/haiku-api/`):**

```bash
# (a) The file the spec declares is missing.
$ ls packages/haiku-api/src/schemas/auth.ts
ls: packages/haiku-api/src/schemas/auth.ts: No such file or directory

# (b) Existing in-line location and shape (not what the spec asked for).
$ sed -n '133,140p' packages/haiku-api/src/schemas/common.ts
/** Transport label for a route. v1 only allows loopback — this is the
 *  security invariant: every declared route must be reachable only via the
 *  local 127.0.0.1 / ::1 listener (legitimate remote access is muxed via the
 *  tunnel, which itself fronts a loopback bind). */
export const RouteTransportSchema = z.enum(["loopback"]).describe(
    "Transport invariant — routes in haiku-api MUST declare 'loopback'.",
)
export type RouteTransport = z.infer<typeof RouteTransportSchema>

# (c) routes.ts already declares transport on every route and imports the
#     type from common.ts. Widening the enum is wire-compatible because
#     every current declaration is "loopback".
$ grep -c 'transport: "loopback"' packages/haiku-api/src/routes.ts
22

# (d) The runtime invariant test hard-codes "loopback" as the only allowed
#     value — after widening, this test must keep asserting the current
#     deployment stays loopback (runtime policy) while the schema permits
#     "token" (future extensibility).
$ sed -n '723,730p' packages/haiku-api/test/schemas.test.mjs
describe("routes.ts — transport invariant + body caps", () => {
    test("every route declares transport='loopback'", () => {
        for (const r of routes) {
            if (r.transport !== "loopback") {
                throw new Error(`Route ${r.operationId} has non-loopback transport`)
            }
        }
    })
```

Note: the feedback body's `schemas/common.ts:137-140` reference is
accurate for THIS worktree (154-line common.ts). Earlier per-unit
worktrees had a 104-line common.ts without the inline schema — the
stage-scoped branch is the correct edit target and the line numbers
line up.

## Fix approach

Single cohesive commit; four parts; all in `packages/haiku-api/`.

**Part A — extract `auth.ts`.** Create
`packages/haiku-api/src/schemas/auth.ts` with three exports:

1. `TransportInvariantSchema` — `z.enum(["loopback", "token"])` (the
   widened union). Docstring must explain: v1 routes hard-code
   `"loopback"` as a runtime policy (enforced by the transport-invariant
   test), but the schema permits `"token"` so future non-loopback
   deployments are a one-line table edit, not a schema migration.
2. `SessionTokenSchema` — skeleton object:
   ```ts
   z.object({
       token: z.string().min(1).max(512),
       issued_at: z.string().min(1).max(64),
       expires_at: z.string().min(1).max(64).optional(),
   }).describe("Session-token skeleton for future non-loopback deployments.")
   ```
   `issued_at` / `expires_at` cap at 64 so a malicious ISO-8601 injection
   can't blow the per-route 128 KiB feedback cap or the 1 MiB default
   body cap.
3. `RouteTransportSchema` — re-export of `TransportInvariantSchema`
   keeping the existing symbol name so `routes.ts` + `test/schemas.test.mjs`
   imports keep resolving without touching their import lines.

Re-export the inferred `TransportInvariant` and `SessionToken` types
via `z.infer`, and keep the legacy `RouteTransport` type alias
(`= TransportInvariant`) so downstream code doesn't break.

**Part B — drop the inline definition from `common.ts`.** Remove lines
133-140 (the inline `RouteTransportSchema` + `RouteTransport` type) and
re-export both from `./auth.js`:

```ts
// common.ts, replacing lines 133-140
export {
    RouteTransportSchema,
    type RouteTransport,
    TransportInvariantSchema,
    type TransportInvariant,
    SessionTokenSchema,
    type SessionToken,
} from "./auth.js"
```

Keep the docstring content — it documents a real security invariant —
but migrate it to `auth.ts` (where it belongs) and adjust wording to
reflect that the invariant is now enforced by runtime test, not by the
narrow schema.

**Part C — widen `RouteSpec.transport` type.** The current
`RouteSpec.transport: RouteTransport` already type-checks with both
values because `RouteTransport = TransportInvariant` after Part A. No
change needed in `routes.ts` itself — it will continue to declare
`transport: "loopback"` on every route (runtime policy), and TypeScript
will accept `"token"` for future additions.

**Part D — add barrel export + round-trip tests.**

1. Update `packages/haiku-api/src/index.ts` to add
   `export * from "./schemas/auth.js"` alongside the other schema
   barrel lines (alphabetically: after `./schemas/feedback.js` would
   be cleanest but the current ordering already isn't strict — match
   the existing alphabetized block, inserting `auth.js` first).
2. Add four assertions to `packages/haiku-api/test/schemas.test.mjs`
   (after the existing `RouteTransportSchema` describe block at line
   714):
   - `TransportInvariantSchema` parses `"loopback"` AND `"token"`,
     rejects `"public"`.
   - `SessionTokenSchema` parses a minimum valid object
     (`{ token: "t", issued_at: "2026-04-21T00:00:00Z" }`).
   - `SessionTokenSchema` parses a full valid object (with
     `expires_at`).
   - `SessionTokenSchema` rejects `{ token: "", issued_at: "x" }`
     (empty token) and `{ token: "t".repeat(513), issued_at: "x" }`
     (oversize token).
3. Leave the existing `RouteTransportSchema` test assertion
   (`assertValid(RouteTransportSchema, "loopback")`,
   `assertInvalid(RouteTransportSchema, "public")`) in place — it
   still passes under the widened union (loopback is still valid;
   "public" is still rejected).
4. Leave the `every route declares transport='loopback'` test
   untouched. It expresses a runtime policy ("v1 locks this field to
   loopback") that survives schema widening — exactly the separation
   of concerns the spec wanted.

## Files to modify

### New file

1. **`packages/haiku-api/src/schemas/auth.ts`** — new file.
   - `import { z } from "zod"`.
   - Export `TransportInvariantSchema` (`z.enum(["loopback", "token"])`).
   - Export `SessionTokenSchema` (shape above).
   - Export `RouteTransportSchema` as alias (`export const
     RouteTransportSchema = TransportInvariantSchema`).
   - Export inferred types `TransportInvariant`, `SessionToken`,
     `RouteTransport` (alias to `TransportInvariant`).
   - Top-of-file docstring: transport semantics, security invariant,
     future-extensibility rationale, pointer to the runtime-invariant
     test at `test/schemas.test.mjs:723-730`.

### Edit

2. **`packages/haiku-api/src/schemas/common.ts`** (lines 133-140).
   Delete the inline `RouteTransportSchema` + `RouteTransport` type;
   replace with a `export { ... } from "./auth.js"` re-export block
   that preserves the public symbol names.
   **Read-before-write warning**: this file is large (154 lines) and
   a fix chain for FB-15 / FB-19 / FB-28 may have touched it. Before
   editing, re-read the file and locate the inline block by searching
   for `RouteTransportSchema = z.enum(["loopback"])` rather than
   trusting the line numbers above.

3. **`packages/haiku-api/src/index.ts`** — add
   `export * from "./schemas/auth.js"` to the schema barrel block
   (between `./schemas/files.js` and `./schemas/question.js` to
   preserve alphabetical ordering).

4. **`packages/haiku-api/test/schemas.test.mjs`**.
   - Add `SessionTokenSchema, TransportInvariantSchema` to the
     imports from `"../dist/index.js"` (the existing
     `RouteTransportSchema` import stays).
   - After the existing `describe("schemas/common.ts — RouteTransportSchema", …)`
     block (line 714-721), add two new describe blocks:
     - `describe("schemas/auth.ts — TransportInvariantSchema", …)` with
       the parse + reject cases enumerated above.
     - `describe("schemas/auth.ts — SessionTokenSchema", …)` with the
       four parse/reject cases enumerated above.
   - **Do NOT touch** the `describe("routes.ts — transport invariant + body caps", …)`
     block starting line 723. That runtime policy test must stay green.

## Verification commands

Run from the worktree root (stage branch, not per-unit worktree) after
the builder bolt:

```bash
# (a) New file exists and declares the right symbols
test -f packages/haiku-api/src/schemas/auth.ts
grep -q 'export const TransportInvariantSchema' packages/haiku-api/src/schemas/auth.ts
grep -q 'z.enum(\["loopback", "token"\])' packages/haiku-api/src/schemas/auth.ts
grep -q 'export const SessionTokenSchema' packages/haiku-api/src/schemas/auth.ts
grep -q 'export const RouteTransportSchema' packages/haiku-api/src/schemas/auth.ts

# (b) common.ts no longer defines RouteTransportSchema inline, re-exports instead
! grep -q 'export const RouteTransportSchema' packages/haiku-api/src/schemas/common.ts
grep -q 'from "./auth.js"' packages/haiku-api/src/schemas/common.ts

# (c) Barrel export wired up
grep -q 'from "./schemas/auth.js"' packages/haiku-api/src/index.ts

# (d) Typecheck — the widened enum should still accept every existing
#     transport: "loopback" declaration.
npm run typecheck -w @haiku/api

# (e) Round-trip tests — both the existing RouteTransportSchema test AND
#     the new auth.ts tests must pass; runtime invariant test ("every
#     route declares transport='loopback'") must also still pass.
npm run build -w @haiku/api
npm run test -w @haiku/api

# (f) OpenAPI emitter still produces a valid document (no missing schemas,
#     no secret-leak scan regressions).
npm run build -w @haiku/api
test -f packages/haiku-api/openapi.json
node -e "JSON.parse(require('fs').readFileSync('packages/haiku-api/openapi.json','utf8'))"
```

All six should pass. If (e) surfaces a broken test, inspect whether the
imports/types resolved correctly after the re-export refactor.

## Handoff to the builder

1. Work on the current branch
   (`haiku/universal-feedback-model-and-review-recovery/development`).
   Do NOT push.
2. Commit in **one cohesive commit** with message
   `haiku: fix FB-37 bolt 2 (builder)`. Body should enumerate:
   - New file: `packages/haiku-api/src/schemas/auth.ts`.
   - Edits: `common.ts` (inline → re-export), `index.ts` (barrel),
     `test/schemas.test.mjs` (new describes).
3. **Read-before-write every file** — this bolt runs in parallel with
   other fix chains. The most likely conflict point is `common.ts`
   (FB-15/FB-19/FB-28 all touch nearby schemas). Before replacing the
   inline `RouteTransportSchema` block, re-read and locate it by
   content, not line number.
4. Run verification commands (a)-(f) and paste the pass/fail output into
   the commit message.
5. The unit-01 spec's outputs list does NOT need to be updated — that
   frontmatter is a declarative artifact record, not an enforcement
   table; closing FB-37 is enough.

## Risks

- **Broadened enum changes OpenAPI schema emission (medium).** The
  emitted `dist/openapi.json` will now show `transport: { enum:
  ["loopback", "token"] }` instead of `enum: ["loopback"]`. External
  consumers of the OpenAPI doc will see the union. Mitigation: this is
  the intended contract per the unit-01 spec; any OpenAPI drift check
  that fails should be updated to match, not rolled back. If a drift
  check blocks the build, that's a signal to re-run `emit-openapi.mjs`
  and commit the regenerated `openapi.json`.
- **Runtime invariant vs schema invariant split (low).** The schema
  now permits `"token"` but the `routes.ts` declarations and runtime
  invariant test still hard-code `"loopback"`. Any future contributor
  who naively adds `transport: "token"` to a route will pass typecheck
  but fail the runtime invariant test. Mitigation: keep the invariant
  test's error message clear ("Route … has non-loopback transport") —
  it already is. A follow-up unit wiring real token routes will lift
  the invariant test at the same time.
- **Barrel export collision (low).** `auth.ts` re-exports
  `RouteTransportSchema` and `common.ts` re-exports it from `auth.ts`.
  The barrel `export *` in `index.ts` will surface the symbol via the
  `common.ts` path (first) and the `auth.ts` path (second). ES modules
  dedupe re-exports by identity, so the same Zod schema reference
  reaches consumers either way. Mitigation: verified by (d) typecheck
  and (e) test pass. If a barrel-collision warning surfaces, drop the
  re-export from `common.ts` and rely on `auth.ts` → `index.ts`
  directly, then retarget the one `common.ts` caller (`routes.ts`
  imports `RouteTransport` from common.ts line 17) to import from
  `./auth.js` instead.
- **SessionToken schema API is speculative (low).** No caller consumes
  `SessionTokenSchema` yet. The skeleton `{ token, issued_at,
  expires_at? }` matches a standard bearer-token shape; a future unit
  that wires real token auth may need to add fields (scopes, issuer,
  etc.). Mitigation: skeleton is documented as "for future deployments"
  in the docstring. Any added field is a non-breaking schema edit.

## Out of scope

- Wiring any route to `transport: "token"`. Every route stays
  `"loopback"`. That's a future unit.
- Implementing session-token issuance, validation, or middleware. This
  fix only adds the SCHEMA skeleton — the wire shape that future work
  will plug into.
- Paper / website sync. `haiku-api` is a runtime implementation detail;
  no paper concept changes; no website doc references `auth.ts`.
- Updating the unit-01 spec's outputs list (frontmatter). That list is
  a record of what was produced; closing FB-37 addresses the missing
  deliverable directly.

## Done when

- `packages/haiku-api/src/schemas/auth.ts` exists and exports
  `TransportInvariantSchema` (union of `"loopback" | "token"`),
  `SessionTokenSchema`, `RouteTransportSchema` (alias), plus the
  three inferred types.
- `packages/haiku-api/src/schemas/common.ts` no longer defines
  `RouteTransportSchema` inline; it re-exports from `./auth.js`.
- `packages/haiku-api/src/index.ts` includes
  `export * from "./schemas/auth.js"`.
- `packages/haiku-api/test/schemas.test.mjs` has round-trip coverage
  for both new schemas. Existing `RouteTransportSchema` test and
  `routes.ts — transport invariant` test still pass unchanged.
- `npm run typecheck -w @haiku/api`, `npm run build -w @haiku/api`,
  `npm run test -w @haiku/api` all green.
- Feedback-assessor closes FB-37 on the next bolt.
