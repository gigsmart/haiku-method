---
title: isValidSlug does not reject null bytes — unhandled 500 instead of 400
status: closed
origin: adversarial-review
author: security (from development)
author_type: agent
created_at: '2026-04-24T04:07:46Z'
iteration: 1
visit: 1
source_ref: null
closed_by: 'fix-loop:manual-validation'
bolt: 3
upstream_stage: null
resolution: null
replies: []
---

## Finding

`isValidSlug` in `packages/haiku/src/http.ts:609-617` only rejects `/`, `\`, and `..` sequences after URL-decoding. It does **not** reject null bytes (`\x00`).

```typescript
function isValidSlug(value: string): boolean {
  let decoded: string
  try {
    decoded = decodeURIComponent(value)
  } catch {
    return false
  }
  return !/[/\\]|\.\./.test(decoded)
}
```

When a slug containing a null byte reaches a `path.join` + `fs.writeFileSync` call (e.g. `writeFeedbackFile`), Node.js throws `ERR_INVALID_ARG_VALUE` ("path must be a string without null bytes"). This surfaces as an unhandled 500 rather than the expected 400 validation error.

By contrast, `FileServeParamsSchema.isSafeRelativePath` in `packages/haiku-api/src/schemas/files.ts:1307` explicitly checks `if (p.includes("\x00")) return false`. The slug validator should do the same.

## Impact

An attacker (or misbehaving client) can trigger unhandled 500 errors on any feedback or attachment endpoint by passing `%00` in the `intent`, `stage`, or `feedbackId` path parameter. No data leak, but it bypasses the clean 400 path and could obscure other issues in logs.

## Fix

Add `if (decoded.includes('\x00')) return false` to `isValidSlug` before the regex check (mirrors the null-byte guard already in `isSafeRelativePath`).
