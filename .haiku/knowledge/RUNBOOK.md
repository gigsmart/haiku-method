# Remote Review — Runbook

## Feature Flag

Toggle remote review: `export HAIKU_REMOTE_REVIEW=1`
Disable (revert to local SPA): unset or `export HAIKU_REMOTE_REVIEW=0`

## Common Failure Modes

### Tunnel fails to open
**Symptom:** "Failed to open localtunnel after 3 attempts" error in MCP logs
**Cause:** localtunnel.me public relay is down or rate-limiting
**Fix:** Retry later. If persistent, check https://github.com/localtunnel/localtunnel/issues for outages. Fallback: unset `HAIKU_REMOTE_REVIEW` to use local SPA.

### Review page shows "Connection Failed"
**Symptom:** Website shows error card with "Can't reach the review session"
**Cause:** Tunnel died or MCP stopped after generating the URL
**Fix:** User requests a new link from Claude Code (re-triggers the review flow)

### Review page shows "Review Link Expired"
**Symptom:** Website shows expiry error
**Cause:** JWT has 1-hour TTL and it's past expiry
**Fix:** User requests a new link from Claude Code

### WebSocket disconnects during review
**Symptom:** Amber "Reconnecting..." banner appears
**Cause:** Tunnel instability or network blip
**Resolution:** Auto-reconnects every 3s, up to 5 attempts. If all fail, shows persistent error. User may need a new link.

### CORS errors in browser console
**Symptom:** Fetch/XHR blocked by CORS policy
**Cause:** `HAIKU_REMOTE_REVIEW` not set, or MCP not running the CORS-enabled version
**Fix:** Ensure `HAIKU_REMOTE_REVIEW=1` is set and MCP is running the updated build

## MCP Apps Review Path (Cowork)

These scenarios apply when `hostSupportsMcpApps() === true` — the host has echoed back
`experimental.apps` during the MCP initialize handshake and the review SPA is served via
`ui://` resource rather than HTTP tunnel. See also: `packages/haiku/VALIDATION.md`
§ "MCP Apps capability negotiation" and § "Cowork review transport".

---

### MCP Apps iframe fails to load

**Symptom:** Host advertised `experimental.apps` but the review UI never appears; MCP
server logs show `Unknown resource URI` or `App.callServerTool` returns an error; the
`ask_user_visual_question` tool call returns without ever rendering.

**Diagnostic:**
```bash
# 1. Confirm the host echoed apps capability during initialize
rg -n 'getClientCapabilities' packages/haiku/src/state-tools.ts

# 2. Check server logs for resource-URI resolution failure
grep 'Unknown resource URI' ~/.haiku/logs/mcp-server.log 2>/dev/null || \
  journalctl -u haiku-mcp --since "1 hour ago" | grep 'Unknown resource'

# 3. Confirm review-app HTML is present in the built artifact
node -e "const h = require('./packages/haiku/src/review-app-html'); console.log('len', h.REVIEW_APP_HTML.length)"

# 4. Confirm REVIEW_APP_VERSION is consistent between host expectation and server
rg -n 'REVIEW_APP_VERSION' packages/haiku/src/review-app-html.ts
```

**Remediation:**
```bash
# Rebuild the review SPA and regenerate the inlined HTML asset
cd packages/haiku && npm run prebuild

# Restart the MCP server so it serves the updated build
# (kill existing process, then restart via your usual MCP host launcher)

# Verify the resource URI is registered
rg -n "ui://" packages/haiku/src/ --type ts
```

**Escalation:** If `npm run prebuild` succeeds but `REVIEW_APP_HTML.length === 0` after rebuild, check that `vite.config.ts` in the review-app sub-package outputs the inlining script correctly. File a bug with the full build log.

**Rollback:** Set `HAIKU_REVIEW_FORCE_HTTP=1` to force the HTTP+tunnel fallback regardless of `hostSupportsMcpApps()` result. Rebuild not required.

---

### V5-10 host timeout fires unexpectedly

**Symptom:** Review gates complete immediately with `changes_requested`; the orchestrator
logs show `gate_review_host_timeout` events; unit frontmatter shows
`blocking_timeout_observed: true` even for sessions that were not manually timed out.

**Diagnostic:**
```bash
# 1. Count unexpected timeout events in recent state files
rg -rn 'gate_review_host_timeout' .haiku/intents/

# 2. Identify units where the flag was set without a matching user decision
rg -rn 'blocking_timeout_observed: true' .haiku/intents/

# 3. Find the AbortSignal timeout value currently set
rg -n 'AbortSignal\|AbortController\|timeout' packages/haiku/src/orchestrator.ts | head -20

# 4. Check if the host is sending early abort signals
rg -n 'abort\|cancel\|signal' packages/haiku/src/orchestrator.ts | grep -i review
```

**Remediation:**
```bash
# Increase the AbortSignal timeout (locate the constant, increase by 2x, rebuild)
# e.g., change 300_000 → 600_000 in the review-gate wait loop
cd packages/haiku && npm run build

# If the host is aborting due to inactivity, verify the heartbeat ping is wired:
rg -n 'heartbeat\|ping\|keepalive' packages/haiku/src/ --type ts
```

**Escalation:** If timeouts persist after doubling the timeout value, the host may be
cancelling the tool call for an unrelated reason (e.g., context-length pressure). Capture
the full MCP protocol trace and open an issue with the host vendor.

**Rollback:** `git revert <sha-that-introduced-timeout>` + `npm run build` in `packages/haiku/`.

---

### HTTP fallback broken

**Symptom:** `hostSupportsMcpApps() === false` path fails; no review URL is generated;
logs show localtunnel errors or missing `siteUrl`; `HAIKU_REMOTE_REVIEW_URL` is set but
review page is unreachable.

**Diagnostic:**
```bash
# 1. Confirm the accessor returns false correctly
node -e "const s = require('./packages/haiku/src/state-tools'); console.log(s.hostSupportsMcpApps())"

# 2. Check localtunnel connectivity
curl -s --max-time 5 https://localtunnel.me/ | head -5

# 3. Verify heartbeat file is present (HTTP path uses it for session keepalive)
ls -la /tmp/haiku-review-heartbeat* 2>/dev/null

# 4. Check the siteUrl config value the MCP server is using
rg -n 'siteUrl\|HAIKU_REMOTE_REVIEW_URL' packages/haiku/src/ --type ts
```

**Remediation:**
```bash
# Restart the tunnel (kill current MCP session and re-invoke the review tool)
# If HAIKU_REMOTE_REVIEW_URL is stale, unset it and let the server assign a new tunnel
unset HAIKU_REMOTE_REVIEW_URL

# If localtunnel.me is down, use a custom subdomain or ngrok as a stand-in:
export HAIKU_REMOTE_REVIEW_URL="https://your-ngrok-url.ngrok.io"
```

**Escalation:** If `localtunnel.me` has been down > 1 hour, check https://github.com/localtunnel/localtunnel/issues and consider switching the default tunnel provider.

**Rollback:** Unset `HAIKU_REMOTE_REVIEW` to fall back to local SPA (no tunnel needed).

---

### Session lost after FSM advances

**Symptom:** The review iframe stays mounted in the host UI after the FSM has already
advanced to the next phase; submitting a decision from the stale iframe returns
`session not found`; `listSessions()` shows zero active sessions for the intent.

**Diagnostic:**
```bash
# 1. Check what sessions are currently live
rg -n 'listSessions\|session_id\|sessionStore' packages/haiku/src/ --type ts

# 2. Confirm the FSM phase advanced (review state in state.json)
cat .haiku/intents/<slug>/stages/<stage>/state.json | python3 -m json.tool | grep phase

# 3. Check if session cleanup was called on FSM advance
rg -n 'deleteSession\|clearSession\|session.*cleanup' packages/haiku/src/ --type ts
```

**Remediation:**
The iframe session is scoped to the FSM gate; if the gate advanced, the session should
have been cleaned up. Force cleanup by restarting the MCP server. The stale iframe will
disconnect automatically once the server-side session is gone.

```bash
# Restart the MCP server — stale iframes will show "session not found" and stop
# No data loss: FSM state is persisted in .haiku/intents/
```

**Escalation:** If the FSM shows `phase: execute` but the unit frontmatter still has no
`gate_outcome`, the FSM advance may have been incomplete. Run `haiku_repair` to resync state.

**Rollback:** N/A — session data is ephemeral. Restart MCP server and re-open review if needed.

---

### Bundle size regression

**Symptom:** CI fails with a size-budget error; gzipped `REVIEW_APP_HTML` exceeds the
1 MB (1,000,403 byte) budget; the `npm run prebuild` step or the explicit CI check exits
non-zero.

**Diagnostic:**
```bash
# 1. Check current gzipped size
gzip -c packages/haiku/src/review-app-html.ts | wc -c

# 2. Compare against the 950KB soft warn threshold
# (warn > 950KB, fail > 1,000,403 bytes)

# 3. Run the Vite bundle analyzer to identify what grew
cd packages/haiku/review-app && npx vite build --mode analyze 2>/dev/null || \
  ANALYZE=true npm run build:review-app

# 4. Diff dependencies since the last passing build
git diff HEAD~1 packages/haiku/package.json packages/haiku/review-app/package.json
```

**Remediation:**
```bash
# Identify the new dep that caused the bloat, then:
# Option A: Replace with a lighter alternative
# Option B: Lazy-load the dep so it's not inlined in the SPA entry chunk
# Option C: Tree-shake — check if the import is pulling in the full module

# After trimming, verify the new size:
cd packages/haiku && npm run prebuild
gzip -c packages/haiku/src/review-app-html.ts | wc -c
```

**Escalation:** If trimming is not feasible and the feature genuinely needs the dependency,
raise the budget ceiling in the CI workflow explicitly (not silently) and document the
justification in the PR.

**Rollback:** `git revert <sha-that-added-the-dep>` + `npm run prebuild` in `packages/haiku/`.

---

## Standard Operations

### Service restart
```bash
# Rebuild the MCP plugin
cd packages/haiku && npm run build

# Restart the MCP server via your host launcher
# (Claude Code: reload the MCP connection from the settings panel)
```

### Rollback a bad plugin release
```bash
git revert <sha>
cd packages/haiku && npm run build
# Restart MCP server as above
```

### Log collection
```bash
# MCP server stderr (captured by most hosts as a log file):
# Claude Code: ~/Library/Logs/Claude/ (macOS)

# Search for recent errors:
grep -i 'error\|fatal\|timeout' ~/Library/Logs/Claude/mcp-server-haiku*.log | tail -50

# Sentry: haiku-mcp project — filter by tag host_supports_mcp_apps=true for Cowork issues
```

## Deployment

**Website:** Deploys automatically on push to main via `deploy-website.yml`. No manual steps.
**MCP Plugin:** Ships with plugin release pipeline. `npm run build` in `packages/haiku/` produces the binary.

## Monitoring

- **Website errors:** Sentry project `haiku-spa` (via @sentry/nextjs)
- **MCP errors:** Sentry project `haiku-mcp`
- **MCP Apps transport tag:** Sentry breadcrumb `review_transport_used` = `mcp_apps` | `http_tunnel`
- **Host capability tag:** Sentry breadcrumb `host_supports_mcp_apps` = `true` | `false`
- **Tunnel health:** No dedicated monitoring — localtunnel is ephemeral per session
- **Bundle size SLO:** CI hard-fails if gzipped review-app HTML > 1,000,403 bytes; warns > 950KB
