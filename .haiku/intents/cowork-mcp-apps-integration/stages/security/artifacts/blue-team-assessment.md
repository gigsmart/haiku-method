---
title: Blue Team Defense Verification
unit: unit-01-threat-model-review
hat: blue-team
created_at: '2026-04-15'
status: pass
---

# Blue Team Defense Verification

Verified that all mitigations documented in THREAT-MODEL.md are actually implemented in code.

## Evidence

### T3-S1: postMessage origin pinning (FIXED)

`ext-apps-shim.ts` lines 40–47 confirm:
- `_hostOrigin` initialized to `null`
- Line 46: pinned on first message (`if (_hostOrigin === null) _hostOrigin = event.origin`)
- Line 47: subsequent messages rejected (`if (event.origin !== _hostOrigin) return`)

**VERIFIED.**

### T1-T1: Zod discriminated union on `haiku_cowork_review_submit` (Implemented)

`server.ts` line 995: `z.discriminatedUnion("session_type", [...])` with three branches.
- All three branches use `session_id: z.string().uuid()` (lines 998, 1005, 1012)
- `answers` branch uses `.min(1)` (verified in DATA-CONTRACTS)
- `archetype` uses `.min(1)` (line 1013 — `z.string().min(1)`)

**VERIFIED.**

### T2-T1: `resources/read` URI exact-match guard (Implemented)

`server.ts` line 246: `if (uri !== REVIEW_RESOURCE_URI)` throws `McpError(InvalidParams, "Unknown resource URI")`. No prefix match, no regex, no fallthrough — strict equality only.

**VERIFIED.**

### T1-D1: Session eviction (Implemented)

`sessions.ts` lines 215–230:
- `MAX_SESSIONS = 100`
- `SESSION_TTL_MS = 30 * 60 * 1000`
- `evictSessions()` called on every `createSession` call (lines 245, 266, 288)

**VERIFIED.**

### T3-T1: XSS via innerHTML removed (FIXED)

`grep -n "innerHTML" packages/haiku/src/templates/design-direction.ts` — 0 results. All dynamic content uses `textContent`, `createElement`, and `replaceChildren`.

**VERIFIED.**

## Conclusion

All THREAT-MODEL.md mitigations with status `Implemented` or `Fixed` are confirmed in source code. No defense exists in documentation only. Blue team passes.
