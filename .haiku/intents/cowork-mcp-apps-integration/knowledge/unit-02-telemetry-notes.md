# Telemetry & SLO Notes — MCP Apps Review Path

## What changed

### `packages/haiku/src/sentry.ts`

New export: `addReviewTransportBreadcrumb(hostSupportsMcpApps: boolean, transport: "mcp_apps" | "http_tunnel")`

Adds a Sentry breadcrumb with `category: "review_transport"` and two data fields:
- `host_supports_mcp_apps`: `"true"` | `"false"`
- `review_transport_used`: `"mcp_apps"` | `"http_tunnel"`

### `packages/haiku/src/server.ts`

Two call sites in `setOpenReviewHandler`:
- MCP Apps arm: `addReviewTransportBreadcrumb(true, "mcp_apps")` before `openReviewMcpApps()`
- HTTP arm: `addReviewTransportBreadcrumb(false, "http_tunnel")` before HTTP server start

Bundle size runtime guard: warns to stderr if `Buffer.byteLength(REVIEW_APP_HTML, 'utf8') > 950_000`.

### `packages/haiku/VALIDATION.md`

New `## SLOs` section documenting:
- `gate_review_host_timeout` error rate target (< 1% / 30-day window)
- Bundle size budget (950KB warn / 1,000,403 byte hard-fail)
- Telemetry tag reference table

## How to query in Sentry

Filter `haiku-mcp` project → Breadcrumbs → `category:review_transport`:
- `host_supports_mcp_apps=true` → Cowork/MCP Apps sessions only
- `review_transport_used=http_tunnel` → legacy HTTP sessions only
