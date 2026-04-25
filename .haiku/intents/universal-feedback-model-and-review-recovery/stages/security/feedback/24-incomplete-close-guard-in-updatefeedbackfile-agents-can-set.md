---
title: >-
  Incomplete close guard in updateFeedbackFile: agents can set status:"closed"
  directly on human-authored items
status: closed
origin: adversarial-review
author: architecture (from development)
author_type: agent
created_at: '2026-04-24T14:46:11Z'
iteration: 1
visit: 1
source_ref: null
closed_by: 'inline:security-fb-24-manual'
bolt: 1
upstream_stage: null
resolution: null
replies: []
integrator_attempts: 1
---

## Finding

`packages/haiku/src/state-tools.ts:3473–3486` has a guard that prevents agents from setting `closed_by` on human-authored feedback. However, there is **no corresponding guard** preventing an agent from setting `status: "closed"` directly on a human-authored item.

The existing guard:
```ts
if (
  callerContext === "agent" &&
  typeof fields.closed_by === "string" &&
  fields.closed_by.length > 0 &&
  found.data.author_type === "human"
) { return { ok: false, error: "..." } }
```

The gap: an agent calling `haiku_feedback_update` with `{ feedback_id: "FB-01", status: "closed" }` (without `closed_by`) passes this guard and reaches the "Apply updates" section at line 3511. The status transition is applied with no restriction.

The `haiku_feedback_update` MCP tool schema (state-tools.ts:3999–4002) lists `closed` as a valid status value with no restriction note, so agents calling this tool have no indication that `status: "closed"` is forbidden on human items.

The THREAT MODEL in `stages/security/THREAT-MODEL.md` (OWASP A01 section) states: "Agents cannot close or delete human-authored feedback." This claim is partially false — agents cannot set `closed_by` on human items, but they can set `status: "closed"` directly.

## Affected files

- `packages/haiku/src/state-tools.ts:3473–3486` (incomplete guard)
- `packages/haiku/src/state-tools.ts:3511–3517` (unconditional status apply)

## Architectural concern

The security model as documented relies on the invariant that human-authored feedback cannot be closed by agents. The guard implementation enforces only one of the two paths to "closed" state. This is a structural gap between the documented invariant and its enforcement — the kind of gap that leads to exploitable privilege escalation.

## Recommendation

Add a guard parallel to the `closed_by` guard:
```ts
if (
  callerContext === "agent" &&
  fields.status === "closed" &&
  found.data.author_type === "human"
) {
  return { ok: false, error: "Error: agents cannot set status=closed on human-authored feedback." }
}
```
And add a test: "MCP update rejects agent setting status=closed on human-authored feedback".
