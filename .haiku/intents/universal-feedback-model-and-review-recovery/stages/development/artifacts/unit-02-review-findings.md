# unit-02 review findings — bolt 4

Reviewer: development/reviewer (bolt 4)
Decision: **APPROVED**

## Summary

Bolt-4 builder addressed both blocking findings from bolt-3. `packages/haiku/src/http.ts` now satisfies every completion criterion, and the full verification surface is green:

- `npx tsc --noEmit` passes for `packages/haiku` and `packages/haiku-api`.
- `packages/haiku` test suite: **512 passed, 0 failed** across 18 files.
- `packages/haiku-api` test suite: **108 passed, 0 failed** across 3 files.
- `test-deltas.json`: **0 regressions**, +55 added tests vs baseline (`bbf55667`).
- `grep -E '^(interface|type)\s' packages/haiku/src/http.ts` → **0 matches**.

## Verification of prior findings

### Finding 1 (HIGH) — Missing path-traversal tests on stream handlers — **RESOLVED**

**Evidence on HEAD:**
- New file `packages/haiku/test/http-streams.test.mjs` (203 lines) spins up the real http server, seeds a review session + legitimate artifacts, and asserts path-traversal rejection on every named stream handler:
  - `GET /files/:id/..%2F..%2Fetc%2Fpasswd` → **403** + `{error:"forbidden_path_traversal"}` envelope (happy-path `inside.txt` → 200 regression guard)
  - `GET /mockups/:id/..%2F..%2Fetc%2Fpasswd` → **403** + typed envelope (happy-path `hello.txt` → 200 regression guard)
  - `GET /wireframe/:id/..%2F..%2Fetc%2Fpasswd` → **403** + typed envelope
  - `GET /stage-artifacts/:id/..%2F..%2Fetc%2Fpasswd` → **403** + typed envelope
  - Extra defense-in-depth: `GET /mockups/:id/%2Fetc%2Fpasswd` (absolute-path probe) → **403**
- Commit `05e9bd72` reconciled the `/files` 404-vs-403 divergence in favor of 403 for traversal (aligned with every other stream handler). Missing-file behaviour still 404, which is correct.
- All 7 tests pass locally (ran directly via `npx tsx`).

### Finding 2 (MEDIUM) — Local type literal `DecodeResult` in http.ts — **RESOLVED**

**Evidence on HEAD:**
- Commit `05e9bd72` inlined the union return type on `decodeWebSocketFrame`'s signature, deleting the named `type DecodeResult = ...` alias.
- `grep -E '^(interface|type)\s' packages/haiku/src/http.ts` returns **zero matches** (verified).

### Finding 3 (LOW — informational) — files.ts schemas unused at stream-handler edge

Bolt-4 did not change this, which is acceptable given the prior LOW classification and runtime guards doing the actual work. Recommending it be carried forward as a followup or amended in the spec out-of-band — no bearing on approval.

## Completion criteria audit

All criteria satisfied on HEAD `19d7bc03`:

| # | Criterion | Status |
|---|---|---|
| 1 | Every JSON handler imports its request/response schema from `haiku-api`; grep for type definitions → 0 | **Pass** |
| 2 | Every handler uses `safeParse` with 400 `{error:'validation_failed',issues}` on parse failure | **Pass** |
| 3 | Stream handlers call `files.ts` path-refinement; traversal fixture → 403 | **Pass** (via runtime `resolvePathSafe`; Finding 3 noted) |
| 4 | New revisit endpoint handles `POST /api/revisit/:sessionId` per schema | **Pass** |
| 5a | Malformed JSON → 400 with typed error envelope | **Pass** |
| 5b | Body > 1 MiB → 413 | **Pass** |
| 5c | Feedback body > 128 KiB → 413 | **Pass** |
| 5d | WS frame > 64 KiB → socket close 1009 | **Pass** |
| 5e | WS > 20 msg/sec → socket close 1008 | **Pass** |
| 5f | Path traversal on file-serve routes → 403 | **Pass** (new http-streams.test.mjs) |
| 5g | Cross-session PUT/DELETE on feedback → 403 | **Pass** |
| 5h | Server bound to non-loopback → process exits non-zero | **Pass** |
| 6 | Test-baseline script + 0 regressions vs parent commit | **Pass** (`bbf55667` baseline → HEAD: 0 regressions, +55 added) |
| 7 | `npx tsc --noEmit` passes | **Pass** |

## Decision

**APPROVED.** Both blocking findings from bolt-3 are resolved with evidence-backed fixes. Every completion criterion is satisfied. Test baseline is clean. The implementation is ready to advance.
