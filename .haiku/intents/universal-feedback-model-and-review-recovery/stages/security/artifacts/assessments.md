# Security Assessments: Universal Feedback Model

## Threat Model

Full STRIDE analysis at `stages/security/THREAT-MODEL.md`.

### Summary of Findings

| Threat | Likelihood | Impact | Status |
|---|---|---|---|
| S: Agent spoofs human author_type | Low | High | Mitigated — author_type derived server-side from origin |
| T: Feedback file tampered to bypass gate | Low | High | Mitigated — git commits, fresh-read on every gate tick |
| R: Actor denies creating feedback | Low | Medium | Mitigated — git history, frontmatter provenance |
| I: Feedback content leaks | Low | Medium | Mitigated — local files, same access as project |
| D: Disk-filling via feedback creation | Low | Low | Accepted — local tool, self-inflicted |
| E: Agent bypasses author-type guards | Low | High | Mitigated — MCP/HTTP boundary, callerContext hardcoded |

No critical or high-severity unmitigated findings.

## OWASP Top 10 Coverage

All 10 categories verified with evidence or documented N/A justification. See THREAT-MODEL.md section 2 for details.

| Category | Status |
|---|---|
| A01: Broken Access Control | Mitigated + tested |
| A02: Cryptographic Failures | N/A |
| A03: Injection | Mitigated + tested |
| A04: Insecure Design | Mitigated |
| A05: Security Misconfiguration | Mitigated |
| A06: Vulnerable Components | N/A |
| A07: Auth Failures | N/A |
| A08: Data Integrity Failures | Mitigated + tested |
| A09: Logging Failures | Mitigated |
| A10: SSRF | N/A |

## Security Tests Added

- `state-tools-handlers.test.mjs`: 3 new tests for `feedback_id` path traversal rejection (../,  /, \)
- Existing coverage: 67 feedback tests, 26 gate-feedback tests, 26 HTTP feedback tests

## Defense-in-Depth Fix

`feedback_id` added to `validateSlugArgs` checked keys array in `packages/haiku/src/state-tools.ts`. Previously only `intent`, `slug`, `stage`, `unit` were checked. The `feedback_id` parameter appears in `haiku_feedback_update`, `haiku_feedback_delete`, and `haiku_feedback_reject` tool schemas, making it a path traversal vector that was missing from the validation surface.

## Verification

- `npm test`: 442 passed, 0 failed
- `npx tsc --noEmit`: clean
