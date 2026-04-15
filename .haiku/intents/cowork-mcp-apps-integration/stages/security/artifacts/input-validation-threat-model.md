# Input Validation Threat Model — security stage

**Date:** 2026-04-15
**Unit:** unit-02-input-validation-audit

## Trust Boundary: Tool Arguments → Session State

The `haiku_cowork_review_submit` tool is the only write path from the MCP client into the in-memory session store. The Zod discriminated union is the sole validation gate between raw tool arguments and any session state mutation.

### Data Flow

```
MCP Client
  → callTool("haiku_cowork_review_submit", args)
    → ReviewSubmitInput.safeParse(args ?? {})
      → [fail] → return { isError: true, content: ["Invalid input: ..."] }
      → [pass] → const input = parsed.data
        → getSession(input.session_id)              [existence check]
        → session.session_type === input.session_type  [type match]
        → session.status === "pending"               [replay protection]
        → updateSession/updateQuestionSession/updateDesignDirectionSession(input.*)
```

### Validation Gates (in order)

1. **Zod schema** — rejects malformed type, missing required fields, bad enum, non-UUID session_id, empty answers array, empty archetype string
2. **Session existence** — `getSession(id)` returns null → 404-equivalent
3. **Session type match** — stored vs submitted `session_type` → 400-equivalent
4. **Session status** — `status !== "pending"` → 409-equivalent (replay protection)

### Threats Mitigated by This Gate

| Threat | Mitigation Layer |
|---|---|
| Type confusion (wrong session_type submitted) | Gate 1 (Zod) + Gate 3 (stored type check) |
| UUID forgery (non-UUID session_id) | Gate 1 (`.uuid()` constraint) |
| Empty payload injection | Gate 1 (required fields, `.min(1)`) |
| Replay / double-submit | Gate 4 (pending status check) |
| Session hijacking (unknown session_id) | Gate 2 (existence check) |
| Decision enum injection | Gate 1 (`.enum([...])`) |

### Residual Risks

- **Unbounded `screenshot` string** — no `maxLength`. Requires connected MCP client. LOW, accepted.
- **Unbounded `parameters` record** — no key count limit. Requires connected MCP client. INFO, accepted.
- **Free-form `feedback` string** — no sanitization server-side (correct); rendering layer handles display safety.
