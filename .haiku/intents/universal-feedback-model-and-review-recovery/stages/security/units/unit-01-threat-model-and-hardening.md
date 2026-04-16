---
title: Threat model and security hardening
type: security
depends_on: []
quality_gates:
  - typecheck
  - test
inputs:
  - knowledge/DISCOVERY.md
  - knowledge/DATA-CONTRACTS.md
  - knowledge/ARCHITECTURE.md
status: completed
bolt: 1
hat: security-reviewer
started_at: '2026-04-16T16:55:22Z'
hat_started_at: '2026-04-16T16:59:37Z'
outputs:
  - stages/security/THREAT-MODEL.md
completed_at: '2026-04-16T17:00:15Z'
---

# Threat Model and Security Hardening

Produce a STRIDE threat model for the feedback model's attack surface, verify OWASP Top 10 coverage, and apply the defense-in-depth fix from the operations review (add feedback_id to validateSlugArgs).

## Completion Criteria

### Threat Model
- THREAT-MODEL.md exists at `stages/security/THREAT-MODEL.md`
- STRIDE analysis covers: feedback file creation (spoofing, tampering), HTTP CRUD endpoints (injection, info disclosure), review-UI → feedback pipeline (XSS, CSRF), MCP tool access (privilege escalation)
- Each threat has: description, likelihood, impact, mitigation, and verification evidence

### OWASP Top 10 Coverage
- Each OWASP category has either a test or documented N/A justification:
  - A01:Broken Access Control — author-type guards tested, MCP agent-only tools verified
  - A02:Cryptographic Failures — N/A (no encryption at rest, local files)
  - A03:Injection — path traversal mitigation (isValidSlug, validateSlugArgs), slugifyTitle sanitization, no SQL
  - A04:Insecure Design — feedback file schema validation, status enum enforcement
  - A05:Security Misconfiguration — CORS when remote enabled, no default credentials
  - A06:Vulnerable Components — N/A (no new dependencies added)
  - A07:Auth Failures — N/A (local tool, session UUID-based)
  - A08:Data Integrity Failures — git commit on every mutation, file checksums via git
  - A09:Logging Failures — telemetry on gate transitions, git audit trail
  - A10:SSRF — N/A (no outbound requests from feedback system, external review CLI is existing code)

### Defense-in-Depth Fix
- `validateSlugArgs` in state-tools.ts includes `feedback_id` in the checked keys array
- Test verifies that a feedback_id with path traversal characters is rejected
- `npx tsc --noEmit` passes
- `npm test` passes with all tests green
