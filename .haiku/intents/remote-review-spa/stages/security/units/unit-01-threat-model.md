---
title: Threat model and security review
status: completed
quality_gates:
  - 'Threat model documents attack surface (tunnel, JWT, CORS, file serving)'
  - Path traversal protection verified via realpath guard
  - JWT tampering risk assessed and accepted (hash fragment stays client-side)
  - >-
    No sensitive data exposed through tunnel (intent specs and unit descriptions
    only)
  - CORS policy appropriate for the use case
---

# Threat Model

## Attack Surface

1. **Tunnel URL exposure**: JWT in hash fragment — never sent to any server, stays client-side. Tunnel URL is ephemeral (dies with MCP process). Risk: low.

2. **JWT tampering**: If someone modifies the JWT payload to point at a malicious server, the SPA connects there. Mitigation: hash fragment never leaves the client. Only attack vector is local machine access (same trust boundary as MCP itself).

3. **Path traversal via /files/ route**: Mitigated by realpath guard — resolved path must start within intent dir or .haiku/knowledge/. Returns 403 on traversal attempt.

4. **CORS wildcard in dev**: Acceptable for development. Production restricts to haikumethod.ai origin.

5. **Data exposure through tunnel**: Session data includes intent specs, unit descriptions, criteria, mermaid diagrams, knowledge files. No credentials, API keys, or PII. Tunnel is short-lived (review session duration).

6. **WebSocket**: RFC 6455 implementation with masked frames, ping/pong keepalive, graceful close. No additional auth on WS — session ID is the access token (UUID, unpredictable).

## OWASP Top 10 Coverage

- A01 Broken Access Control: Session ID (UUID) is the access token. Tunnel is ephemeral. N/A for persistent access.
- A02 Cryptographic Failures: JWT signed with HS256 + 32-byte random secret. Adequate for ephemeral tokens.
- A03 Injection: No SQL, no template injection. File paths validated via realpath.
- A04 Insecure Design: Threat model documented. Feature flag for rollback.
- A05 Security Misconfiguration: CORS restricted in prod. No default credentials.
- A06 Vulnerable Components: localtunnel is a well-maintained npm package.
- A07 Auth Failures: No persistent auth — session UUID is the token.
- A08 Data Integrity: JWT signature prevents accidental corruption.
- A09 Logging: MCP logs tunnel lifecycle events. No sensitive data in logs.
- A10 SSRF: No server-side requests based on user input.
