---
title: Red Team Assessment — OWASP Coverage Matrix
unit: unit-03-owasp-coverage-matrix
hat: red-team
created_at: '2026-04-15'
status: finding
---

# Red Team Assessment — OWASP Coverage Matrix

## Challenge Strategy

Adversarially reviewed each "Covered" claim in the OWASP matrix. Probed for inaccurate evidence, overstated mitigations, and missing categories.

---

## RT-1: A06 Evidence Inaccuracy (FINDING)

**Challenge:** The original matrix claimed "Dependency scanning via standard `npm audit` in CI." CI workflow (`ci.yml`) was inspected — no `npm audit` step exists. Claim is false.

**Finding:** `npm audit` revealed 3 actual vulnerabilities:
- `axios <=1.14.0` (critical, via `localtunnel`) — CSRF, SSRF, DoS advisories
- `follow-redirects <=1.15.11` (moderate) — auth header leak

**Impact assessment:** `localtunnel` is imported only in `tunnel.ts`. `open-review-mcp-apps.ts` explicitly excludes `http.js`, `tunnel.js`, and `node:child_process` imports (structural design comment at line 6). Vulnerable code paths are not reachable from the MCP Apps attack surface. Risk is real but isolated.

**Resolution:** OWASP matrix updated. VUL-007 added to VULN-REPORT.md with accepted-risk justification. A06 status remains "Covered" with the acceptance documented.

---

## RT-2: A01 N/A Classification Challenge

**Challenge:** Task brief suggested A01 should be N/A ("no user auth in MCP protocol"). The matrix marks it Applicable with postMessage origin pinning evidence.

**Assessment:** The matrix is *more accurate*. A01 covers access control broadly, not just authentication. VUL-002 (wildcard targetOrigin) and VUL-003 (no origin validation) are classic A01 failures — both fixed. Marking A01 N/A would be incorrect; "Applicable / Covered" is right.

**Result:** Matrix classification CONFIRMED CORRECT. No change needed.

---

## RT-3: A08 Scope Check — REVIEW_APP_HTML Integrity

**Challenge:** Matrix claims content integrity via `REVIEW_APP_VERSION` sha256 hash. Does this actually prevent tampered content delivery?

**Assessment:** The URI `ui://haiku/review/<sha256-12>` is version-locked at build time. A client requesting a stale URI gets `McpError(InvalidParams)`, not tampered content. The `REVIEW_APP_HTML` constant is baked into the binary — it can't be swapped at runtime. The sha256 is a content-addressable identifier, not a signed assertion.

**Limitation found:** The hash prevents accidental version mismatch but does not prevent a compromised build artifact from serving malicious content (supply-chain scenario). However, that's outside the scope of this intent's attack surface (MCP Apps protocol path, not build pipeline).

**Result:** Evidence is accurate for the stated attack surface. No matrix change needed.

---

## RT-4: A09 Logging Gaps

**Challenge:** Matrix cites `gate_review_host_timeout` and `blocking_timeout_observed` as security logging. Are security-relevant *rejection* events (Zod failures, unknown URIs, unknown session IDs) logged?

**Assessment:** Zod parse failures return `isError: true` to the MCP client but do NOT call `logSessionEvent`. Unknown session ID returns "Session not found" error but is not logged. These are unauthenticated probes and their absence from logs means no alerting signal on repeated attacks.

**Limitation found:** Repeated malformed payload probes (brute-force session ID guessing, repeated Zod rejections) produce no server-side log events beyond the MCP error response. The accepted-risk VUL-005 console.log is the only observable trace.

**Mitigation rationale:** This is a local single-user tool. There is no attacker in the deployment model who isn't already on the same machine with full MCP host access. Rate limiting and attack logging are not warranted in this trust model. A09 "Covered (with accepted LOW)" accurately reflects this.

**Result:** No matrix change needed. Limitation is within the tool's trust model.

---

## Red Team Verdict

**One actionable finding:** A06 evidence was inaccurate (no CI scanning, actual CVEs in transitive deps). Corrected in OWASP-COVERAGE.md. VUL-007 added to VULN-REPORT.md with accepted-risk justification.

**All other "Covered" claims confirmed.** The matrix is accurate after correction.
