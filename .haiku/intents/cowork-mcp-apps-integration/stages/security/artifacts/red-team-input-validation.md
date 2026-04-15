---
title: Red Team Assessment — Input Validation
unit: unit-02-input-validation-audit
hat: red-team
created_at: '2026-04-15'
status: no-findings
---

# Red Team Assessment — Input Validation

## Attack Vectors Probed

### RT-1: Zod passthrough/strip bypass
**Attack:** Schema uses `.passthrough()`, `.strip()`, or `.catchall()` — allows injection of extra fields into session state.
**Finding:** Zero uses of `.passthrough()`, `.strip()`, or `.catchall()` in the `haiku_cowork_review_submit` handler. Zod `.object()` strips unknown keys by default (Zod v3 behavior). No extra fields enter session state.
**Result:** NOT EXPLOITABLE.

### RT-2: Direct `args` bypass after `safeParse`
**Attack:** Code uses `args.field` instead of `input.field` after safeParse, bypassing Zod validation.
**Finding:** Zero references to `args.` after `const input = parsed.data`. All downstream calls use `input.*` exclusively.
**Result:** NOT EXPLOITABLE.

### RT-3: `resources/read` URI encoding bypass
**Attack:** Attacker sends percent-encoded URI (e.g., `ui://haiku/review/%2e%2e/etc/passwd`) to bypass exact-match check and read arbitrary resources.
**Finding:** The handler uses `uri !== REVIEW_RESOURCE_URI` — strict string equality. A percent-encoded string does not equal the constant. No URL decoding occurs before comparison.
**Test:** `'ui://haiku/review/%2e%2e/etc/passwd' === REVIEW_RESOURCE_URI` → false. Handler throws `InvalidParams`.
**Result:** NOT EXPLOITABLE.

### RT-4: `callServerTool` with null `_hostOrigin`
**Attack:** Trigger `callServerTool` before any host message arrives, bypassing origin check.
**Finding:** `ext-apps-shim.ts` lines 88–91: when `_hostOrigin` is null and `document.referrer` is also unavailable, `_pendingRequests.delete(id)` and `reject(new Error("callServerTool: no trusted host origin available"))` — call fails gracefully, never posts to `window.parent`.
**Result:** NOT EXPLOITABLE (graceful rejection).

### RT-5: UUID format does not prevent session enumeration
**Attack:** Session IDs are UUID v4 (`crypto.randomUUID()`). An attacker who can observe one session ID cannot derive others due to UUID v4 randomness (128-bit entropy from `crypto.randomUUID()`).
**Finding:** UUID v4 via `crypto.randomUUID()` is cryptographically random — ~5.3 × 10^36 possible values. Session enumeration is not practical.
**Result:** NOT EXPLOITABLE.

## Conclusion

No exploitable input validation weaknesses found. The threat-modeler's assessment is confirmed. Proceed to blue-team verification.
