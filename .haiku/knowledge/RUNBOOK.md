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

## Deployment

**Website:** Deploys automatically on push to main via `deploy-website.yml`. No manual steps.
**MCP Plugin:** Ships with plugin release pipeline. `bun run build` in `packages/haiku/` produces the binary.

## Monitoring

- **Website errors:** Sentry project `haiku-spa` (via @sentry/nextjs)
- **MCP errors:** Sentry project `haiku-mcp`
- **Tunnel health:** No dedicated monitoring — localtunnel is ephemeral per session
