---
title: Expanded-surface threat model and hardening
type: security
depends_on:
  - unit-01-threat-model-and-hardening
quality_gates:
  - name: typecheck
    command: npx tsc --noEmit
    dir: packages/haiku
  - name: test
    command: npm test --workspaces --if-present
  - name: no-inline-svg-attachment
    command: >-
      ! grep -nE "'image/svg\+xml'|\"image/svg\+xml\""
      packages/haiku-api/src/schemas/feedback.ts
inputs:
  - knowledge/DISCOVERY.md
  - knowledge/DATA-CONTRACTS.md
  - knowledge/ARCHITECTURE.md
  - stages/security/THREAT-MODEL.md
  - packages/haiku/src/http.ts
  - packages/haiku/src/git-worktree.ts
  - packages/haiku-api/src/routes.ts
  - packages/haiku-api/src/schemas/feedback.ts
  - packages/haiku-api/src/schemas/question.ts
  - deploy/auth-proxy/src/index.ts
model: sonnet
status: completed
bolt: 1
hat: security-reviewer
started_at: '2026-04-24T13:59:29Z'
hat_started_at: '2026-04-24T14:21:05Z'
iterations:
  - hat: threat-modeler
    started_at: '2026-04-24T13:59:29Z'
    completed_at: '2026-04-24T14:07:13Z'
    result: advance
  - hat: red-team
    started_at: '2026-04-24T14:07:13Z'
    completed_at: '2026-04-24T14:09:31Z'
    result: advance
  - hat: blue-team
    started_at: '2026-04-24T14:09:31Z'
    completed_at: '2026-04-24T14:21:05Z'
    result: advance
  - hat: security-reviewer
    started_at: '2026-04-24T14:21:05Z'
    completed_at: '2026-04-24T14:23:53Z'
    result: advance
outputs:
  - stages/security/artifacts/assessments.md
  - stages/security/artifacts/threat-model-expanded.md
completed_at: '2026-04-24T14:23:53Z'
---
# Expanded-Surface Threat Model and Hardening

The feedback model has expanded significantly since the prior security pass produced THREAT-MODEL.md. This unit extends the threat model to cover the new attack surface, closes the concrete security gaps the operations stage surfaced, and re-runs the OWASP coverage check against the current codebase.

**New surface not addressed in the prior threat model:**

1. `GET /api/feedback-attachment/{intent}/{stage}/{filename}` — serves sidecar attachment bytes (PNG/JPEG/WebP/SVG) from a per-feedback directory. New path-traversal + MIME-content-injection vectors.
2. `POST /api/revisit/{sessionId}` — accepts `reasons[]` with user-supplied title + body, writes each as a feedback file. New injection vector via freeform text.
3. `POST /api/feedback/{intent}/{stage}/{feedbackId}/replies` — appends replies to a feedback thread. Caller supplies `author`; without server override, any caller can claim any agent name.
4. Fix-chain and discovery isolation worktrees (`createFixChainWorktree`, `createDiscoveryWorktree`) — subagents run git commits inside branches forked off the stage. New branch-confusion and cross-worktree write vectors to analyze.
5. Integrator subagent — runs inside a conflicted worktree, resolves markers, `git add`s. New code-tampering surface (attacker-controlled conflict content + LLM "resolution" bias).
6. CORS `Access-Control-Allow-Origin: *` when `HAIKU_REMOTE_REVIEW=1` but `HAIKU_E2E_KEY` is unset — the prior threat model claimed E2E mitigates the open-origin risk; that claim is only valid when E2E is actually on.

**Concrete findings to close (from operations pre-review agents):**

- SVG XSS: `attachment_data_url` accepts `image/svg+xml`. Served inline, SVGs can execute embedded `<script>`. Requires either MIME restriction to raster formats or `Content-Disposition: attachment` on the attachment endpoint.
- Reply `author` field is caller-supplied (`author: z.string().max(200).optional()`) — server must override to the session-derived identity.
- `validateSlugArgs` (MCP path) rejects literal `/` and `..` but not URL-encoded variants; HTTP `isValidSlug` decodes first. Parity gap means one layer can pass what the other blocks.
- Prose `quality_gates` in unit-01 — the FSM silently skips string-form gates; the security unit's typecheck and test are never structurally enforced.

## Completion Criteria

### Threat Model Expansion (append to `stages/security/THREAT-MODEL.md`, do NOT rewrite)

- New `## 4. Expanded Surface (iteration 2)` section added covering each of the six surfaces above, each with: description, STRIDE categorization, likelihood, impact, mitigation, verification evidence.
- Each mitigation refers to a concrete code location (file:line or symbol) or an explicit `N/A — see rationale`.
- The section explicitly calls out the CORS+E2E coupling: when `HAIKU_REMOTE_REVIEW=1` AND `HAIKU_E2E_KEY` unset, document the residual risk; the mitigation is either (a) refuse to start remote review without E2E, or (b) document the opt-in insecurity as explicit.

### Code Fixes (in `packages/haiku/src/http.ts` and sibling files)

- **SVG XSS mitigation**: pick one and implement it —
  - Option A: remove `'image/svg+xml'` from the accepted MIME set in `FeedbackCreateRequestSchema.attachment_data_url` regex. Easiest; aligns with the `no-inline-svg-attachment` quality gate in this unit.
  - Option B: keep SVG support but serve the attachment endpoint with `Content-Disposition: attachment; filename="..."` AND `Content-Security-Policy: sandbox` so the browser treats it as a download, not a render target.
  - Pick A unless there's a visible workflow that specifically needs SVG attachments inline.
- **Reply `author` override**: `packages/haiku-api/src/schemas/feedback.ts` still accepts `author` in `FeedbackReplyCreateRequestSchema`; the HTTP handler in `packages/haiku/src/http.ts` must ALWAYS derive `author` from the session context, never honoring the caller-supplied value. Add a test that posts `{"author": "impersonator"}` and verifies the stored reply's `author` field is the session-derived one.
- **MCP slug URL-decode parity**: `validateSlugArgs` (in state-tools.ts, per the existing unit-01 threat model doc) should `decodeURIComponent` the value before testing (or, equivalently, also test for `%2F`, `%2E%2E`, `%5C`). Add a test covering `feedback_id: "..%2Fetc%2Fpasswd"`.
- **CORS+E2E gate**: either refuse to start the Fastify server when `HAIKU_REMOTE_REVIEW=1` AND `HAIKU_E2E_KEY` is unset (preferred), or log a `WARN` line and set a global `degraded_security: true` flag visible in `/health` responses.

### Verification

- `npx tsc --noEmit` passes across the workspace.
- `npm test --workspaces --if-present` passes.
- The `no-inline-svg-attachment` gate in this unit's `quality_gates:` passes — grep returns no match.
- New test cases specifically assert:
  - SVG `attachment_data_url` is rejected at the schema layer (if Option A) OR the attachment endpoint returns `Content-Disposition: attachment` for SVG payloads (if Option B).
  - Reply `author` override: stored reply's `author` is server-derived even when caller supplies a value.
  - MCP URL-decode: `haiku_feedback_update { feedback_id: "..%2Fetc%2Fpasswd" }` returns a validation error, not a path-traversal.
  - CORS+E2E: server startup fails (or emits the degraded warning) when remote is enabled without E2E.

### Out of Scope for This Unit

- Metrics/dashboards/runbooks (separately rejected in operations FB-03, FB-05, FB-07 — those belong in a dedicated observability intent).
- Full rewrite of the prior threat model — this unit APPENDS a section, does not replace existing analysis.
- Worktree confusion cross-stage-intent attacks beyond the isolation properties of `fsmStartStage`'s branch topology — if the threat model identifies a real attack, it goes in this unit; otherwise it's future work.
