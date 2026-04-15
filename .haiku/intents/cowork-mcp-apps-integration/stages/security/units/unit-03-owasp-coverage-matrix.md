---
title: OWASP Top 10 coverage matrix
type: audit
model: sonnet
depends_on:
  - unit-01-threat-model-review
  - unit-02-input-validation-audit
inputs:
  - intent.md
  - knowledge/DISCOVERY.md
  - knowledge/DATA-CONTRACTS.md
  - knowledge/VULN-REPORT.md
  - .haiku/knowledge/THREAT-MODEL.md
outputs:
  - .haiku/intents/cowork-mcp-apps-integration/knowledge/OWASP-COVERAGE.md
  - knowledge/OWASP-COVERAGE.md
status: active
bolt: 1
hat: threat-modeler
started_at: '2026-04-15T19:52:12Z'
hat_started_at: '2026-04-15T19:52:12Z'
---

# Unit 03 — OWASP Coverage Matrix

Produce `knowledge/OWASP-COVERAGE.md` mapping each OWASP Top 10 (2021) category to the attack surface of the MCP Apps review path.

## Scope

Attack surface for this intent:
- MCP initialize handshake (`experimental.apps` negotiation)
- `resources/list` + `resources/read` (SPA delivery)
- `haiku_cowork_review_submit` tool dispatch (Zod validation, session store, state mutation)
- postMessage bridge (`ext-apps-shim.ts`)
- SPA iframe sandbox (content rendering, `allow-same-origin`)

## Tasks

1. For each of the 10 OWASP 2021 categories, determine: **Applicable** or **N/A** to this intent's attack surface.
2. For every `Applicable` category, provide evidence — one of:
   - A test name in `packages/haiku` test suite (e.g., `"rejects unknown session_type"`)
   - A code grep (e.g., `rg 'z.string().uuid()' packages/haiku/src/server.ts`)
   - A documented justification referencing `THREAT-MODEL.md` or `VULN-REPORT.md` by finding ID
3. For every `N/A` category, state the reason briefly (one sentence).
4. For every `Applicable` category, assign a status: `Covered` (evidence confirms mitigation) or `Gap` (no evidence of mitigation).
5. Write the matrix to `knowledge/OWASP-COVERAGE.md` using the format:
   `| A0X — Category | Applicable/N/A | Evidence | Covered/Gap/N/A |`

## OWASP Top 10 (2021) Categories

- A01 Broken Access Control
- A02 Cryptographic Failures
- A03 Injection
- A04 Insecure Design
- A05 Security Misconfiguration
- A06 Vulnerable and Outdated Components
- A07 Identification and Authentication Failures
- A08 Software and Data Integrity Failures
- A09 Security Logging and Monitoring Failures
- A10 Server-Side Request Forgery

## Completion Criteria

- `rg -c '| (Applicable|N/A)' knowledge/OWASP-COVERAGE.md` returns ≥ 10 (one row per category)
- No `Applicable` row has an empty Evidence column
- No `Applicable` row has status `Gap` without a linked issue or accepted-risk justification in `VULN-REPORT.md`
- File begins with a `# OWASP Coverage Matrix` heading
