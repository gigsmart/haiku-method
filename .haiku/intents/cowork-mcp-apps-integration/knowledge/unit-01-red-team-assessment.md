# Red Team Assessment — unit-01

**Date:** 2026-04-15
**Hat:** red-team
**Unit:** unit-01-threat-model-review

## Attack Surface Probed

Reviewed `server.ts` (haiku_cowork_review_submit dispatch), `sessions.ts` (session store), and `templates/components.ts` (HTTP review SPA — existing path, not the new MCP Apps path).

## Findings

### FINDING-RT-01 — No size cap on `screenshot` base64 field (LOW, DoS)

**Vector:** `haiku_cowork_review_submit` with `session_type: "review"` or `"design_direction"` accepts `annotations.screenshot: z.string().optional()`. No `maxLength` constraint. A connected MCP client could submit an arbitrarily large string, bloating in-memory session state.

**Exploitability:** Requires an established MCP connection (same trust boundary). Not remotely exploitable without MCP access.

**Severity:** LOW — bounded by the MCP trust boundary. Accepted risk.

**Recommendation:** Add `z.string().max(5_000_000)` (≈5 MB, enough for a full-res annotated canvas PNG) to cap memory impact.

### FINDING-RT-02 — No key-count bound on `parameters` record (INFO, DoS)

**Vector:** `design_direction` path accepts `parameters: z.record(z.number())` with no key count limit. A client could submit thousands of parameter keys.

**Exploitability:** Same trust boundary as RT-01. Not a practical threat given the review session context.

**Severity:** INFO — accepted risk.

### FINDING-RT-03 — `innerHTML` at components.ts:903 (HTTP path, confirmed safe)

`result.innerHTML` is set to a string that includes `decision.replace(/_/g, ' ')`. Investigation confirmed `decision` is only ever set to hardcoded string literals `'approved'` or `'changes_requested'` from button click handlers (lines 919-920). No user input reaches this interpolation. **Not a vulnerability.**

### FINDING-RT-04 — `cardEl.innerHTML` at components.ts:725 (HTTP path, confirmed safe)

Uses `headerHtml + quoteHtml + textareaHtml`. All user-sourced values (`comment.sourceLabel`, `comment.quotedText`, `comment.text`) are passed through `escText()` (line 663-667), which correctly uses `d.textContent = str; return d.innerHTML` — the standard browser-safe escaping pattern. **Not a vulnerability.**

### FINDING-RT-05 — MCP Apps path files have zero `innerHTML` usage (confirmed clean)

`open-review-mcp-apps.ts`, `ask-visual-question-mcp-apps.ts`, `pick-design-direction-mcp-apps.ts` — zero `innerHTML`/`eval`/`Function(` matches. The MCP Apps path is clean.

## Summary

No new exploitable vulnerabilities found. Two low/info-level DoS vectors (uncapped screenshot/parameters fields) are bounded by the MCP trust boundary and qualify as accepted risk. The existing `innerHTML` usages in the HTTP path (non-MCP-Apps) are all safe — either hardcoded values or properly escaped user content.

**Verdict: No new findings requiring immediate action. RT-01 is a recommended hardening improvement.**
